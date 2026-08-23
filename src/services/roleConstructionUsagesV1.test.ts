import { describe, expect, it } from 'vitest'
import {
  ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE,
  type CoreXRailRole,
  type CoreYRailRole,
  type GridAreaElement,
  type GridCellRef,
  type JamoContextVariant,
  type RoleConstructionScope,
  type ValidatedRoleConstructionSourceV1,
} from '../types'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createRoleConstructionSourceV1,
} from './jamoConstruction'
import { createJamoContextVariantId } from './jamoContextVariants'
import { addAuxiliaryRailAndSplitCells, redoSourceTransaction, undoSourceTransaction } from './masterGridCommands'
import { createBasePartGrid } from './railGridResolver'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'
import { removeAuxiliaryRailSourceV1 } from './roleConstructionSourceCommandsV1'
import {
  collectElementUsagesV1,
  collectRailUsagesV1,
  collectReferenceUsagesV1,
} from './roleConstructionUsagesV1'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const BASE_AUX = 'rail:CH:x:base-aux'

function parse(source: RoleConstructionScope): ValidatedRoleConstructionSourceV1 {
  const result = parseRoleConstructionSourceV1(source)
  if (!result.ok) throw new Error(result.issues.map(({ code, message }) => `${code}:${message}`).join('\n'))
  return result.source
}

function createFixture(withUsages: boolean): {
  source: ValidatedRoleConstructionSourceV1
  masterId: string
  areaId: string
  cellId: string
  firstPointId: string
  secondPointId: string
  variantId: string
} {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'CH', gridId: grid.id })
  const source = createRoleConstructionSourceV1({ grid, masters: [master] })
  const innerLeft = grid.xRails[1].id
  const center = grid.xRails[2].id
  const innerTop = grid.yRails[1].id
  const centerY = grid.yRails[2].id
  const firstPointId = 'point:usage:first'
  const secondPointId = 'point:usage:second'
  master.construction.channels.main!.elements.push({
    id: 'centerline:usage', kind: 'centerline', closed: false, thickness: 0.1,
    anchors: [{
      id: 'anchor:usage:first',
      point: { id: firstPointId, xRailId: innerLeft, yRailId: innerTop },
    }, {
      id: 'anchor:usage:second',
      point: { id: secondPointId, xRailId: grid.xRails[4].id, yRailId: centerY },
    }],
  })
  const areaId = 'area:usage'
  const bounds = {
    leftRailId: innerLeft, rightRailId: center,
    topRailId: innerTop, bottomRailId: centerY,
  }
  const parent: GridCellRef = {
    id: createGridCellId({ masterId: master.id, channel: 'main', elementId: areaId, ...bounds }),
    ...bounds,
  }
  master.construction.channels.main!.elements.push({
    id: areaId, kind: 'area', filledCells: [parent], boundaryTreatments: [],
  })
  const added = addAuxiliaryRailAndSplitCells(source, {
    transactionId: 'tx:add:base-aux', axis: 'x', railId: BASE_AUX,
    fromRailId: innerLeft, toRailId: center, ratio: 0.5,
  })
  if (!added.ok) throw new Error(added.error.message)
  const next = added.scope
  const nextMaster = next.masters[0]
  const centerline = nextMaster.construction.channels.main!.elements[0]
  const area = nextMaster.construction.channels.main!.elements[1]
  if (centerline.kind !== 'centerline' || area.kind !== 'area') throw new Error('fixture element kind 오류')
  if (withUsages) centerline.anchors[0].point.xRailId = BASE_AUX
  const leftChild = area.filledCells.find(({ rightRailId }) => rightRailId === BASE_AUX)!
  const context = { baseContext: 'horizontal' as const }
  const variant: JamoContextVariant = {
    id: createJamoContextVariantId(nextMaster.id, context),
    context,
    coreRailOverrides: withUsages
      ? { 'inner-right': { kind: 'between', fromRailId: BASE_AUX, toRailId: grid.xRails[4].id, ratio: 0.8 } }
      : { 'outer-right': { kind: 'absolute', value: 0.95 } },
  }
  if (withUsages) {
    variant.auxiliaryRails = {
      xRails: [{
        id: 'rail:variant:x:usage', kind: 'auxiliary',
        position: { kind: 'between', fromRailId: BASE_AUX, toRailId: center, ratio: 0.5 },
      }],
      yRails: [],
    }
    variant.referenceOverrides = [{
      id: 'override:point-target',
      target: {
        kind: 'centerline-point', masterId: nextMaster.id, channel: 'main',
        elementId: centerline.id, anchorId: centerline.anchors[0].id,
        referenceId: firstPointId, slot: 'point', axis: 'x',
      },
      railId: grid.xRails[0].id,
    }, {
      id: 'override:point-destination',
      target: {
        kind: 'centerline-point', masterId: nextMaster.id, channel: 'main',
        elementId: centerline.id, anchorId: centerline.anchors[1].id,
        referenceId: secondPointId, slot: 'point', axis: 'x',
      },
      railId: BASE_AUX,
    }, {
      id: 'override:cell-target',
      target: {
        kind: 'cell-edge', masterId: nextMaster.id, channel: 'main',
        elementId: area.id, cellId: leftChild.id, edge: 'left',
      },
      railId: grid.xRails[0].id,
    }]
  }
  nextMaster.contextVariants = [variant]
  return {
    source: parse(next), masterId: nextMaster.id, areaId, cellId: leftChild.id,
    firstPointId, secondPointId, variantId: variant.id,
  }
}

function mutableArea(source: RoleConstructionScope, areaId: string): GridAreaElement {
  const element = source.masters[0].construction.channels.main!.elements.find(({ id }) => id === areaId)
  if (!element || element.kind !== 'area') throw new Error('area fixture가 아닙니다.')
  return element
}

describe('RoleConstruction source v1 aggregate usage와 삭제', () => {
  it('core/aux between·destination·point target·cell canonical target usage를 모두 안정 순서로 수집한다', () => {
    const fixture = createFixture(true)
    const first = collectRailUsagesV1(fixture.source, BASE_AUX)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.usages.filter(({ kind }) => kind.startsWith('variant-')).map(({ kind }) => kind))
      .toEqual([
        'variant-between-binding',
        'variant-between-binding',
        'variant-reference-destination',
        'variant-reference-target',
        'variant-reference-target',
      ])
    expect(collectRailUsagesV1(structuredClone(fixture.source) as ValidatedRoleConstructionSourceV1, BASE_AUX))
      .toEqual(first)
  })

  it('variant usage 하나라도 있으면 full source 삭제를 source/transaction 변경 없이 차단한다', () => {
    const fixture = createFixture(true)
    const before = JSON.stringify(fixture.source)
    const result = removeAuxiliaryRailSourceV1(fixture.source, {
      transactionId: 'tx:delete:blocked', axis: 'x', railId: BASE_AUX,
      usageCoverage: ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('rail-in-use')
      expect(result.error.usages.some(({ kind }) => kind.startsWith('variant-'))).toBe(true)
      expect(result.error.usages.some(({ kind }) => !kind.startsWith('variant-'))).toBe(true)
    }
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect('transaction' in result).toBe(false)
  })

  it('unrelated sparse variant는 보존하면서 safe base Rail 삭제를 한 transaction으로 완료한다', () => {
    const fixture = createFixture(false)
    const result = removeAuxiliaryRailSourceV1(fixture.source, {
      transactionId: 'tx:delete:safe', axis: 'x', railId: BASE_AUX,
      usageCoverage: ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scope.grid.xRails.some(({ id }) => id === BASE_AUX)).toBe(false)
    expect(result.scope.masters[0].contextVariants).toEqual(fixture.source.masters[0].contextVariants)
    expect(mutableArea(structuredClone(result.scope) as RoleConstructionScope, fixture.areaId).filledCells).toHaveLength(1)
    expect(undoSourceTransaction(result.transaction)).toEqual(fixture.source)
    expect(redoSourceTransaction(result.transaction)).toEqual(result.scope)
  })

  it('element와 point/cell reference usage를 master/channel/element 안정 주소로 격리한다', () => {
    const fixture = createFixture(true)
    const elementUsages = collectElementUsagesV1(fixture.source, {
      masterId: fixture.masterId, channel: 'main', elementId: fixture.areaId,
    })
    expect(elementUsages.map(({ overrideId }) => overrideId)).toEqual(['override:cell-target'])
    expect(collectReferenceUsagesV1(fixture.source, {
      kind: 'point-reference', masterId: fixture.masterId, channel: 'main',
      elementId: 'centerline:usage', referenceId: fixture.firstPointId,
    }).map(({ overrideId }) => overrideId)).toEqual(['override:point-target'])
    expect(collectReferenceUsagesV1(fixture.source, {
      kind: 'cell-reference', masterId: fixture.masterId, channel: 'main',
      elementId: fixture.areaId, cellId: fixture.cellId,
    }).map(({ overrideId }) => overrideId)).toEqual(['override:cell-target'])
  })

  it('absolute/between 여부와 무관하게 override 대상 core Rail 소유권을 반환한다', () => {
    const fixture = createFixture(true)
    const innerRight = fixture.source.grid.xRails.find(({ coreRole }) => coreRole === 'inner-right')!.id
    const usages = collectRailUsagesV1(fixture.source, innerRight)
    expect(usages.ok).toBe(true)
    if (!usages.ok) return
    expect(usages.usages).toContainEqual(expect.objectContaining({
      kind: 'variant-core-override', masterId: fixture.masterId,
      variantId: fixture.variantId, coreRole: 'inner-right', railId: innerRight,
    }))
  })

  it('preset ID만 확인된 source는 실제 preset patch universe 없이 삭제하지 않는다', () => {
    const fixture = createFixture(false)
    const mutable = structuredClone(fixture.source) as RoleConstructionScope
    mutable.masters[0].contextVariants![0].presetId = 'preset:external'
    const parsed = parseRoleConstructionSourceV1(mutable, {
      knownPresetIds: new Set(['preset:external']),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = removeAuxiliaryRailSourceV1(parsed.source, {
      transactionId: 'tx:delete:preset-blocked', axis: 'x', railId: BASE_AUX,
      usageCoverage: ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('incomplete-usage-coverage')
      expect(result.error.message).toMatch(/실제 preset patch universe/)
    }
    expect('transaction' in result).toBe(false)
  })
})
