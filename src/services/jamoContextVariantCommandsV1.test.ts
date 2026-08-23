import { describe, expect, it } from 'vitest'
import type {
  CoreXRailRole,
  CoreYRailRole,
  RoleConstructionScope,
  ValidatedRoleConstructionSourceV1,
} from '../types'
import {
  addVariantAuxiliaryRailV1,
  removeCoreRailOverrideV1,
  removeVariantAuxiliaryRailV1,
  removeVariantReferenceOverrideV1,
  setCoreRailOverrideV1,
  setVariantReferenceOverrideV1,
} from './jamoContextVariantCommandsV1'
import { createEmptyJamoRoleMaster, createGridCellId, createRoleConstructionSourceV1 } from './jamoConstruction'
import { redoSourceTransaction, undoSourceTransaction } from './masterGridCommands'
import { createBasePartGrid } from './railGridResolver'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const CONTEXT = { baseContext: 'horizontal' as const }
const AUX = 'rail:variant:command:x'
const AUX_DEPENDENT = 'rail:variant:command:x:dependent'
const AREA = 'area:command'

function createSource(): { source: ValidatedRoleConstructionSourceV1; masterId: string } {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'CH', gridId: grid.id })
  master.construction.channels.main!.elements.push({
    id: 'centerline:command', kind: 'centerline', closed: false, thickness: 0.1,
    anchors: [{
      id: 'anchor:command',
      point: { id: 'point:command', xRailId: grid.xRails[1].id, yRailId: grid.yRails[1].id },
    }, {
      id: 'anchor:command:end',
      point: { id: 'point:command:end', xRailId: grid.xRails[3].id, yRailId: grid.yRails[2].id },
    }],
  })
  const cellBounds = {
    leftRailId: grid.xRails[1].id,
    rightRailId: grid.xRails[2].id,
    topRailId: grid.yRails[1].id,
    bottomRailId: grid.yRails[2].id,
  }
  master.construction.channels.main!.elements.push({
    id: AREA, kind: 'area', boundaryTreatments: [],
    filledCells: [{
      id: createGridCellId({ masterId: master.id, channel: 'main', elementId: AREA, ...cellBounds }),
      ...cellBounds,
    }],
  })
  const parsed = parseRoleConstructionSourceV1(createRoleConstructionSourceV1({ grid, masters: [master] }))
  if (!parsed.ok) throw new Error('fixture parse 실패')
  return { source: parsed.source, masterId: master.id }
}

describe('sparse context variant source commands v1', () => {
  it('core override 생성과 제거를 각각 한 transaction으로 처리하고 빈 variant를 삭제한다', () => {
    const fixture = createSource()
    const set = setCoreRailOverrideV1(fixture.source, {
      transactionId: 'tx:variant:core:set', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    expect(set.ok).toBe(true)
    if (!set.ok) return
    expect(set.scope.masters[0].contextVariants?.[0].coreRailOverrides?.['inner-left'])
      .toEqual({ kind: 'absolute', value: 0.25 })
    expect(undoSourceTransaction(set.transaction)).toEqual(fixture.source)
    expect(redoSourceTransaction(set.transaction)).toEqual(set.scope)
    const remove = removeCoreRailOverrideV1(set.scope, {
      transactionId: 'tx:variant:core:remove', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left',
    })
    expect(remove.ok).toBe(true)
    if (!remove.ok) return
    expect(remove.scope.masters[0]).not.toHaveProperty('contextVariants')
  })

  it('동일 patch는 no-op으로 거부해 history entry를 만들지 않는다', () => {
    const fixture = createSource()
    const first = setCoreRailOverrideV1(fixture.source, {
      transactionId: 'tx:variant:first', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    if (!first.ok) throw new Error(first.error.message)
    const second = setCoreRailOverrideV1(first.scope, {
      transactionId: 'tx:variant:second', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('no-op')
    expect('transaction' in second).toBe(false)

    const reordered = setCoreRailOverrideV1(first.scope, {
      transactionId: 'tx:variant:reordered', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left',
      position: { value: 0.25, kind: 'absolute' },
    })
    expect(reordered.ok).toBe(false)
    if (!reordered.ok) expect(reordered.error.code).toBe('no-op')
    expect('transaction' in reordered).toBe(false)
  })

  it('base와 같은 core 위치는 sparse override로 저장하지 않고 기존 override도 제거한다', () => {
    const fixture = createSource()
    const inherited = setCoreRailOverrideV1(fixture.source, {
      transactionId: 'tx:variant:inherited:no-op', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.2 },
    })
    expect(inherited.ok).toBe(false)
    if (!inherited.ok) expect(inherited.error.code).toBe('no-op')

    const changed = setCoreRailOverrideV1(fixture.source, {
      transactionId: 'tx:variant:inherited:set', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    if (!changed.ok) throw new Error(changed.error.message)
    const restored = setCoreRailOverrideV1(changed.scope, {
      transactionId: 'tx:variant:inherited:restore', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { value: 0.2, kind: 'absolute' },
    })
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.scope).toEqual(fixture.source)
  })

  it('안정 point override를 leaf 단위로 set/remove하고 제거 후 live 상속으로 복귀한다', () => {
    const fixture = createSource()
    const set = setVariantReferenceOverrideV1(fixture.source, {
      transactionId: 'tx:variant:ref:set', masterId: fixture.masterId, context: CONTEXT,
      override: {
        id: 'override:command:point-x',
        target: {
          kind: 'centerline-point', masterId: fixture.masterId, channel: 'main',
          elementId: 'centerline:command', anchorId: 'anchor:command',
          referenceId: 'point:command', slot: 'point', axis: 'x',
        },
        railId: fixture.source.grid.xRails[0].id,
      },
    })
    expect(set.ok).toBe(true)
    if (!set.ok) return
    const remove = removeVariantReferenceOverrideV1(set.scope, {
      transactionId: 'tx:variant:ref:remove', masterId: fixture.masterId,
      context: CONTEXT, overrideId: 'override:command:point-x',
    })
    expect(remove.ok).toBe(true)
    if (!remove.ok) return
    expect(remove.scope).toEqual(fixture.source)
  })

  it('variant auxiliary Rail을 sparse 추가/제거하고 기존 ID와 입력을 변경하지 않는다', () => {
    const fixture = createSource()
    const before = JSON.stringify(fixture.source)
    const add = addVariantAuxiliaryRailV1(fixture.source, {
      transactionId: 'tx:variant:rail:add', masterId: fixture.masterId,
      context: CONTEXT, axis: 'x',
      rail: {
        id: AUX, kind: 'auxiliary',
        position: {
          kind: 'between', fromRailId: fixture.source.grid.xRails[1].id,
          toRailId: fixture.source.grid.xRails[2].id, ratio: 0.5,
        },
      },
    })
    expect(add.ok).toBe(true)
    if (!add.ok) return
    expect(JSON.stringify(fixture.source)).toBe(before)
    const remove = removeVariantAuxiliaryRailV1(add.scope, {
      transactionId: 'tx:variant:rail:remove', masterId: fixture.masterId,
      context: CONTEXT, axis: 'x', railId: AUX,
    })
    expect(remove.ok).toBe(true)
    if (!remove.ok) return
    expect(remove.scope).toEqual(fixture.source)
  })

  it('다른 override가 참조하는 auxiliary Rail 제거는 모든 안정 사용처와 함께 원자적으로 차단한다', () => {
    const fixture = createSource()
    const add = addVariantAuxiliaryRailV1(fixture.source, {
      transactionId: 'tx:variant:rail:add-used', masterId: fixture.masterId,
      context: CONTEXT, axis: 'x',
      rail: {
        id: AUX, kind: 'auxiliary',
        position: {
          kind: 'between', fromRailId: fixture.source.grid.xRails[1].id,
          toRailId: fixture.source.grid.xRails[2].id, ratio: 0.5,
        },
      },
    })
    if (!add.ok) throw new Error(add.error.message)
    const used = setVariantReferenceOverrideV1(add.scope, {
      transactionId: 'tx:variant:ref:aux', masterId: fixture.masterId, context: CONTEXT,
      override: {
        id: 'override:command:aux',
        target: {
          kind: 'centerline-point', masterId: fixture.masterId, channel: 'main',
          elementId: 'centerline:command', anchorId: 'anchor:command',
          referenceId: 'point:command', slot: 'point', axis: 'x',
        },
        railId: AUX,
      },
    })
    if (!used.ok) throw new Error(used.error.message)
    const childCellId = createGridCellId({
      masterId: fixture.masterId, channel: 'main', elementId: AREA,
      leftRailId: fixture.source.grid.xRails[1].id, rightRailId: AUX,
      topRailId: fixture.source.grid.yRails[1].id, bottomRailId: fixture.source.grid.yRails[2].id,
    })
    const cellTarget = setVariantReferenceOverrideV1(used.scope, {
      transactionId: 'tx:variant:ref:cell', masterId: fixture.masterId, context: CONTEXT,
      override: {
        id: 'override:command:cell',
        target: {
          kind: 'cell-edge', masterId: fixture.masterId, channel: 'main',
          elementId: AREA, cellId: childCellId, edge: 'left',
        },
        railId: fixture.source.grid.xRails[0].id,
      },
    })
    if (!cellTarget.ok) throw new Error(cellTarget.error.message)
    const dependent = addVariantAuxiliaryRailV1(cellTarget.scope, {
      transactionId: 'tx:variant:rail:add-dependent', masterId: fixture.masterId,
      context: CONTEXT, axis: 'x',
      rail: {
        id: AUX_DEPENDENT, kind: 'auxiliary',
        position: {
          kind: 'between', fromRailId: AUX,
          toRailId: fixture.source.grid.xRails[2].id, ratio: 0.5,
        },
      },
    })
    if (!dependent.ok) throw new Error(dependent.error.message)
    const before = structuredClone(dependent.scope) as RoleConstructionScope
    const remove = removeVariantAuxiliaryRailV1(dependent.scope, {
      transactionId: 'tx:variant:rail:blocked', masterId: fixture.masterId,
      context: CONTEXT, axis: 'x', railId: AUX,
    })
    expect(remove.ok).toBe(false)
    if (!remove.ok) {
      expect(remove.error.code).toBe('variant-value-in-use')
      expect(remove.error.usages).toEqual([
        expect.objectContaining({
          kind: 'variant-between-binding', railId: AUX,
          ownerKind: 'auxiliary-rail', ownerId: AUX_DEPENDENT, endpoint: 'from',
        }),
        expect.objectContaining({
          kind: 'variant-reference-destination',
          railId: AUX, overrideId: 'override:command:aux',
        }),
        expect.objectContaining({
          kind: 'variant-reference-target', railId: AUX,
          overrideId: 'override:command:cell', reason: 'cell-id-would-change',
        }),
      ])
    }
    expect(dependent.scope).toEqual(before)
    expect('transaction' in remove).toBe(false)
  })

  it('runtime unknown axis는 Y축으로 추측하지 않고 source/transaction 없이 거부한다', () => {
    const fixture = createSource()
    const before = JSON.stringify(fixture.source)
    const result = addVariantAuxiliaryRailV1(fixture.source, {
      transactionId: 'tx:variant:bad-axis', masterId: fixture.masterId,
      context: CONTEXT, axis: 'future' as 'x',
      rail: {
        id: AUX, kind: 'auxiliary',
        position: {
          kind: 'between', fromRailId: fixture.source.grid.xRails[1].id,
          toRailId: fixture.source.grid.xRails[2].id, ratio: 0.5,
        },
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-variant-value')
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect('transaction' in result).toBe(false)
  })

  it('preset catalog coverage를 명시하면 presetId를 보존한 채 sparse patch만 수정한다', () => {
    const fixture = createSource()
    const seeded = setCoreRailOverrideV1(fixture.source, {
      transactionId: 'tx:variant:preset:seed', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    if (!seeded.ok) throw new Error(seeded.error.message)
    const mutable = structuredClone(seeded.scope) as RoleConstructionScope
    mutable.masters[0].contextVariants![0].presetId = 'preset:external'
    const parsed = parseRoleConstructionSourceV1(mutable, {
      knownPresetIds: new Set(['preset:external']),
    })
    if (!parsed.ok) throw new Error('preset fixture parse 실패')
    const blocked = setCoreRailOverrideV1(parsed.source, {
      transactionId: 'tx:variant:preset:blocked', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.26 },
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('preset-coverage-incomplete')
    const changed = setCoreRailOverrideV1(parsed.source, {
      transactionId: 'tx:variant:preset:set', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left', position: { kind: 'absolute', value: 0.26 },
    }, { knownPresetIds: new Set(['preset:external']) })
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.scope.masters[0].contextVariants?.[0].presetId).toBe('preset:external')
    const removed = removeCoreRailOverrideV1(changed.scope, {
      transactionId: 'tx:variant:preset:remove', masterId: fixture.masterId,
      context: CONTEXT, coreRole: 'inner-left',
    }, { knownPresetIds: new Set(['preset:external']) })
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.scope.masters[0].contextVariants).toEqual([expect.objectContaining({
      presetId: 'preset:external',
    })])
  })
})
