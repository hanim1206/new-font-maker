import { describe, expect, it } from 'vitest'
import type {
  CoreXRailRole,
  CoreYRailRole,
  DeepReadonly,
  GridAreaElement,
  GridCellRef,
  JamoContextVariant,
  JamoVariantContext,
  RoleConstructionScope,
  ValidatedRoleConstructionSourceV1,
} from '../types'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createRoleConstructionSourceV1,
} from './jamoConstruction'
import {
  canonicalVariantContextKey,
  collectJamoContextVariantOrphans,
  createJamoContextVariantId,
  gridReferenceAddressKey,
  resolveExactJamoContextVariant,
  validateJamoContextVariants,
} from './jamoContextVariants'
import { rebindGridReference } from './gridReferences'
import { addAuxiliaryRailAndSplitCells } from './masterGridCommands'
import { createBasePartGrid } from './railGridResolver'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const CONTEXT: JamoVariantContext = {
  baseContext: 'horizontal',
  medialClass: 'wide-medial',
  finalWidthClass: 'normal',
  initialClass: 'open',
}
const AUX_X = 'rail:variant:CH:x:stem'

function createScope(): {
  source: RoleConstructionScope
  masterId: string
  areaElementId: string
  sourceCellId: string
  anchorId: string
  pointId: string
} {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'CH', gridId: grid.id })
  const source = createRoleConstructionSourceV1({ grid, masters: [master] })
  const innerLeft = grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.id
  const centerX = grid.xRails.find(({ coreRole }) => coreRole === 'center-x')!.id
  const innerTop = grid.yRails.find(({ coreRole }) => coreRole === 'inner-top')!.id
  const centerY = grid.yRails.find(({ coreRole }) => coreRole === 'center-y')!.id
  const outerRight = grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!.id
  master.construction.channels.main!.elements.push({
    id: 'centerline:giyeok',
    kind: 'centerline',
    closed: false,
    thickness: 0.1,
    anchors: [{
      id: 'anchor:giyeok:start',
      point: { id: 'point:giyeok:start', xRailId: innerLeft, yRailId: innerTop },
      handleOut: { id: 'point:giyeok:start:out', xRailId: centerX, yRailId: innerTop },
    }, {
      id: 'anchor:giyeok:end',
      point: { id: 'point:giyeok:end', xRailId: outerRight, yRailId: centerY },
    }],
  })
  const areaElementId = 'area:giyeok-block'
  const bounds = {
    leftRailId: innerLeft,
    rightRailId: centerX,
    topRailId: innerTop,
    bottomRailId: centerY,
  }
  const cell: GridCellRef = {
    id: createGridCellId({ masterId: master.id, channel: 'main', elementId: areaElementId, ...bounds }),
    ...bounds,
  }
  master.construction.channels.main!.elements.push({
    id: areaElementId,
    kind: 'area',
    filledCells: [cell],
    boundaryTreatments: [],
  })
  return {
    source,
    masterId: master.id,
    areaElementId,
    sourceCellId: cell.id,
    anchorId: 'anchor:giyeok:start',
    pointId: 'point:giyeok:start',
  }
}

function createVariant(fixture: ReturnType<typeof createScope>): JamoContextVariant {
  const innerLeft = fixture.source.grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!
  const center = fixture.source.grid.xRails.find(({ coreRole }) => coreRole === 'center-x')!
  return {
    id: createJamoContextVariantId(fixture.masterId, CONTEXT),
    context: structuredClone(CONTEXT),
    coreRailOverrides: {
      'inner-left': { kind: 'absolute', value: 0.25 },
    },
    auxiliaryRails: {
      xRails: [{
        id: AUX_X,
        kind: 'auxiliary',
        position: { kind: 'between', fromRailId: innerLeft.id, toRailId: center.id, ratio: 0.5 },
      }],
      yRails: [],
    },
    referenceOverrides: [{
      id: 'override:giyeok:start:x',
      target: {
        kind: 'centerline-point',
        masterId: fixture.masterId,
        channel: 'main',
        elementId: 'centerline:giyeok',
        anchorId: fixture.anchorId,
        referenceId: fixture.pointId,
        slot: 'point',
        axis: 'x',
      },
      railId: AUX_X,
    }],
  }
}

function masterArea(source: RoleConstructionScope, masterId: string, elementId: string): GridAreaElement {
  const master = source.masters.find(({ id }) => id === masterId)!
  const element = master.construction.channels.main?.elements.find(({ id }) => id === elementId)
  if (!element || element.kind !== 'area') throw new Error('area fixture가 아닙니다.')
  return element
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

describe('sparse 자소 문맥 variant exact resolver', () => {
  it('context key와 variant ID를 property 순서와 무관한 명시 tuple로 결정한다', () => {
    const first = { ...CONTEXT }
    const second: JamoVariantContext = {
      initialClass: 'open',
      baseContext: 'horizontal',
      finalWidthClass: 'normal',
      medialClass: 'wide-medial',
    }
    expect(canonicalVariantContextKey(first)).toBe(canonicalVariantContextKey(second))
    expect(createJamoContextVariantId('master:ㄱ', first)).toBe(createJamoContextVariantId('master:ㄱ', second))
  })

  it('core·auxiliary·point override만 적용하고 master 입력과 파생값 저장을 분리한다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const before = JSON.stringify(fixture.source)
    expect(validateJamoContextVariants(fixture.source)).toEqual({ ok: true, issues: [] })
    const result = resolveExactJamoContextVariant({
      source: fixture.source,
      masterId: fixture.masterId,
      variantId: variant.id,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')?.position)
      .toEqual({ kind: 'absolute', value: 0.25 })
    expect(result.grid.xRails.some(({ id }) => id === AUX_X)).toBe(true)
    const centerline = result.master.construction.channels.main!.elements[0]
    if (centerline.kind !== 'centerline') throw new Error('centerline result가 아닙니다.')
    expect(centerline.anchors[0].point.xRailId).toBe(AUX_X)
    expect(result.master).not.toHaveProperty('contextVariants')
    expect(masterArea({ ...fixture.source, grid: result.grid, masters: [result.master] }, fixture.masterId, fixture.areaElementId).filledCells)
      .toHaveLength(2)
    expect(result.provenance.railSources[AUX_X]).toEqual({ source: 'jamo-override', variantId: variant.id })
    expect(result.provenance.referenceSources[gridReferenceAddressKey(variant.referenceOverrides![0].target)])
      .toEqual({ source: 'jamo-override', variantId: variant.id })
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect(JSON.stringify(variant)).not.toMatch(/provenance|resolved|InkRegion|outer|holes/)
  })

  it('override되지 않은 master 값은 base 변경을 재해석할 때 live 상속한다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const outerRight = fixture.source.grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!
    if (outerRight.position.kind !== 'absolute') throw new Error('core fixture가 absolute가 아닙니다.')
    outerRight.position.value = 0.95
    const endPoint = fixture.source.masters[0].construction.channels.main!.elements[0]
    if (endPoint.kind !== 'centerline') throw new Error('centerline fixture가 아닙니다.')
    endPoint.anchors[1].point.yRailId = fixture.source.grid.yRails.find(({ coreRole }) => coreRole === 'inner-bottom')!.id
    const result = resolveExactJamoContextVariant({ source: fixture.source, masterId: fixture.masterId, variantId: variant.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')?.position)
      .toEqual({ kind: 'absolute', value: 0.95 })
    const centerline = result.master.construction.channels.main!.elements[0]
    if (centerline.kind !== 'centerline') return
    expect(centerline.anchors[1].point.yRailId).toBe(endPoint.anchors[1].point.yRailId)
    expect(result.provenance.railSources[outerRight.id]).toEqual({ source: 'master' })
  })

  it('cell-edge override는 variant-free derived source에서 composite retile로 적용한다', () => {
    const fixture = createScope()
    const outerLeft = fixture.source.grid.xRails.find(({ coreRole }) => coreRole === 'outer-left')!.id
    const context = { baseContext: 'horizontal' as const }
    const variant: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, context),
      context,
      referenceOverrides: [{
        id: 'override:cell:left',
        target: {
          kind: 'cell-edge', masterId: fixture.masterId, channel: 'main',
          elementId: fixture.areaElementId, cellId: fixture.sourceCellId, edge: 'left',
        },
        railId: outerLeft,
      }],
    }
    fixture.source.masters[0].contextVariants = [variant]
    const result = resolveExactJamoContextVariant({ source: fixture.source, masterId: fixture.masterId, variantId: variant.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const area = result.master.construction.channels.main!.elements.find(({ id }) => id === fixture.areaElementId)
    expect(area?.kind === 'area' && area.filledCells).toHaveLength(2)
    expect(result.provenance.referenceSources[gridReferenceAddressKey(variant.referenceOverrides![0].target)])
      .toEqual({ source: 'master' })
  })

  it('override 배열 순서는 exact 결과와 provenance에 영향을 주지 않는다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    variant.referenceOverrides!.push({
      id: 'override:giyeok:handle:y',
      target: {
        kind: 'centerline-point', masterId: fixture.masterId, channel: 'main',
        elementId: 'centerline:giyeok', anchorId: fixture.anchorId,
        referenceId: 'point:giyeok:start:out', slot: 'handle-out', axis: 'y',
      },
      railId: fixture.source.grid.yRails.find(({ coreRole }) => coreRole === 'outer-top')!.id,
    })
    fixture.source.masters[0].contextVariants = [variant]
    const first = resolveExactJamoContextVariant({ source: fixture.source, masterId: fixture.masterId, variantId: variant.id })
    fixture.source.masters[0].contextVariants![0].referenceOverrides!.reverse()
    const second = resolveExactJamoContextVariant({ source: fixture.source, masterId: fixture.masterId, variantId: variant.id })
    expect(second).toEqual(first)
  })

  it('duplicate context·Rail·target와 orphan/cross-axis를 결정적으로 검출한다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    const duplicate = structuredClone(variant)
    duplicate.id = variant.id
    duplicate.auxiliaryRails!.xRails[0].id = fixture.source.grid.xRails[0].id
    duplicate.referenceOverrides![0].id = 'override:duplicate'
    const badContext = { baseContext: 'vertical' as const }
    const target = structuredClone(variant.referenceOverrides![0].target)
    const badReferences: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, badContext),
      context: badContext,
      referenceOverrides: [{
        id: 'override:axis', target: structuredClone(target),
        railId: fixture.source.grid.yRails[0].id,
      }, {
        id: 'override:same-target', target: structuredClone(target),
        railId: fixture.source.grid.xRails[0].id,
      }, {
        id: 'override:orphan', target: { ...structuredClone(target), referenceId: 'missing-reference' },
        railId: fixture.source.grid.xRails[0].id,
      }],
    }
    fixture.source.masters[0].contextVariants = [variant, duplicate, badReferences]
    const first = collectJamoContextVariantOrphans(fixture.source)
    const second = collectJamoContextVariantOrphans(structuredClone(fixture.source))
    expect(second).toEqual(first)
    expect(first.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'duplicate-variant-id', 'duplicate-variant-context', 'duplicate-variant-rail-id',
      'duplicate-reference-override', 'orphan-reference-target', 'axis-mismatch',
    ]))
  })

  it('cycle/minGap·겹치는 cell retile·빈 variant를 fail-closed한다', () => {
    const fixture = createScope()
    const emptyContext = { baseContext: 'vertical' as const }
    const empty: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, emptyContext), context: emptyContext,
    }
    const cycleContext = { baseContext: 'mixed' as const }
    const cycle: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, cycleContext),
      context: cycleContext,
      auxiliaryRails: {
        xRails: [{
          id: 'rail:variant:cycle', kind: 'auxiliary',
          position: {
            kind: 'between', fromRailId: 'rail:variant:cycle',
            toRailId: fixture.source.grid.xRails[2].id, ratio: 0.5,
          },
        }],
        yRails: [],
      },
    }
    const overlapContext = { baseContext: 'mixed-with-jongseong' as const }
    const cellTarget = {
      kind: 'cell-edge' as const, masterId: fixture.masterId, channel: 'main' as const,
      elementId: fixture.areaElementId, cellId: fixture.sourceCellId, edge: 'left' as const,
    }
    const overlap: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, overlapContext), context: overlapContext,
      referenceOverrides: [
        { id: 'retile:one', target: cellTarget, railId: fixture.source.grid.xRails[0].id },
        { id: 'retile:two', target: { ...cellTarget, edge: 'right' }, railId: fixture.source.grid.xRails[3].id },
      ],
    }
    fixture.source.masters[0].contextVariants = [empty, cycle, overlap]
    const issues = collectJamoContextVariantOrphans(fixture.source)
    expect(issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'empty-variant', 'invalid-derived-grid', 'overlapping-retile',
    ]))
  })

  it('preset catalog가 없거나 unknown field가 있으면 유효한 것으로 추측하지 않는다', () => {
    const fixture = createScope()
    const context = { baseContext: 'vertical-with-jongseong' as const }
    const variant = {
      id: createJamoContextVariantId(fixture.masterId, context),
      context,
      presetId: 'preset:external',
      futureField: { resolvedGrid: true },
    } as unknown as JamoContextVariant
    fixture.source.masters[0].contextVariants = [variant]
    const issues = collectJamoContextVariantOrphans(fixture.source)
    expect(issues.map(({ code }) => code)).toContain('invalid-variant-id')
    delete (variant as unknown as { futureField?: unknown }).futureField
    expect(collectJamoContextVariantOrphans(fixture.source).map(({ code }) => code))
      .toContain('preset-coverage-incomplete')
    expect(validateJamoContextVariants(fixture.source, { knownPresetIds: new Set(['preset:external']) }))
      .toEqual({ ok: true, issues: [] })
    const unresolved = resolveExactJamoContextVariant({
      source: fixture.source,
      masterId: fixture.masterId,
      variantId: variant.id,
      knownPresetIds: new Set(['preset:external']),
    })
    expect(unresolved.ok).toBe(false)
    if (!unresolved.ok) expect(unresolved.issues.map(({ code }) => code)).toContain('preset-coverage-incomplete')
  })

  it.each([
    ['contextVariants object', (source: RoleConstructionScope) => {
      ;(source.masters[0] as unknown as { contextVariants: unknown }).contextVariants = {}
    }],
    ['coreRailOverrides null', (source: RoleConstructionScope) => {
      const variant = createVariant({ ...createScope(), source })
      ;(variant as unknown as { coreRailOverrides: unknown }).coreRailOverrides = null
      source.masters[0].contextVariants = [variant]
    }],
    ['referenceOverrides object', (source: RoleConstructionScope) => {
      const variant = createVariant({ ...createScope(), source })
      ;(variant as unknown as { referenceOverrides: unknown }).referenceOverrides = {}
      source.masters[0].contextVariants = [variant]
    }],
    ['reference target null', (source: RoleConstructionScope) => {
      const variant = createVariant({ ...createScope(), source })
      ;(variant.referenceOverrides![0] as unknown as { target: unknown }).target = null
      source.masters[0].contextVariants = [variant]
    }],
  ] as const)('malformed hydration(%s)을 throw하지 않고 fail-closed한다', (_label, mutate) => {
    const fixture = createScope()
    mutate(fixture.source)
    expect(() => validateJamoContextVariants(fixture.source)).not.toThrow()
    expect(validateJamoContextVariants(fixture.source).ok).toBe(false)
  })

  it('파생 master의 모든 안정 참조만 provenance에 남기고 aux Rail edge 출처를 leaf별로 표시한다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const result = resolveExactJamoContextVariant({
      source: fixture.source,
      masterId: fixture.masterId,
      variantId: variant.id,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = new Map<string, string>()
    for (const [channelName, channel] of Object.entries(result.master.construction.channels)) {
      if (!channel) continue
      for (const element of channel.elements) {
        if (element.kind === 'centerline') {
          for (const anchor of element.anchors) {
            for (const [slot, point] of [
              ['point', anchor.point], ['handle-in', anchor.handleIn], ['handle-out', anchor.handleOut],
            ] as const) {
              if (!point) continue
              for (const axis of ['x', 'y'] as const) expected.set(gridReferenceAddressKey({
                kind: 'centerline-point', masterId: result.master.id,
                channel: channelName as 'main', elementId: element.id,
                anchorId: anchor.id, referenceId: point.id, slot, axis,
              }), axis === 'x' ? point.xRailId : point.yRailId)
            }
          }
          continue
        }
        for (const cell of element.filledCells) for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
          expected.set(gridReferenceAddressKey({
            kind: 'cell-edge', masterId: result.master.id,
            channel: channelName as 'main', elementId: element.id, cellId: cell.id, edge,
          }), edge === 'left' ? cell.leftRailId : edge === 'right' ? cell.rightRailId
            : edge === 'top' ? cell.topRailId : cell.bottomRailId)
        }
      }
    }
    expect(Object.keys(result.provenance.referenceSources).sort()).toEqual([...expected.keys()].sort())
    for (const [key, railId] of expected) {
      if (railId === AUX_X) {
        expect(result.provenance.referenceSources[key]).toEqual({
          source: 'jamo-override', variantId: variant.id,
        })
      }
    }
    expect(Object.keys(result.provenance.referenceSources).some((key) => key.includes(fixture.sourceCellId)))
      .toBe(false)
  })

  it('aggregate variant usage가 연결되기 전에는 base Rail 추가와 참조 재연결을 원자적으로 차단한다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const before = structuredClone(fixture.source)
    const add = addAuxiliaryRailAndSplitCells(fixture.source, {
      transactionId: 'tx:blocked:add',
      axis: 'x',
      railId: 'rail:base:blocked',
      fromRailId: fixture.source.grid.xRails[2].id,
      toRailId: fixture.source.grid.xRails[3].id,
      ratio: 0.5,
    })
    expect(add.ok).toBe(false)
    if (!add.ok) expect(add.error.code).toBe('variant-usage-unchecked')
    const rebind = rebindGridReference(fixture.source, {
      transactionId: 'tx:blocked:rebind',
      target: variant.referenceOverrides![0].target,
      railId: fixture.source.grid.xRails[0].id,
    })
    expect(rebind.ok).toBe(false)
    if (!rebind.ok) expect(rebind.error.code).toBe('variant-usage-unchecked')
    expect(fixture.source).toEqual(before)
    expect('transaction' in add).toBe(false)
    expect('transaction' in rebind).toBe(false)
  })

  it('no-op·내부 seam·반대 edge crossing override를 validation 단계에서 실행 불가로 거부한다', () => {
    const noOpFixture = createScope()
    const noOpContext = { baseContext: 'vertical' as const }
    const noOp: JamoContextVariant = {
      id: createJamoContextVariantId(noOpFixture.masterId, noOpContext),
      context: noOpContext,
      referenceOverrides: [{
        id: 'override:no-op',
        target: {
          kind: 'centerline-point', masterId: noOpFixture.masterId, channel: 'main',
          elementId: 'centerline:giyeok', anchorId: noOpFixture.anchorId,
          referenceId: noOpFixture.pointId, slot: 'point', axis: 'x',
        },
        railId: noOpFixture.source.grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.id,
      }],
    }
    noOpFixture.source.masters[0].contextVariants = [noOp]
    expect(validateJamoContextVariants(noOpFixture.source).ok).toBe(false)

    const seamFixture = createScope()
    const seamArea = masterArea(seamFixture.source, seamFixture.masterId, seamFixture.areaElementId)
    const sourceCell = seamArea.filledCells[0]
    const leftBounds = {
      leftRailId: seamFixture.source.grid.xRails[0].id,
      rightRailId: sourceCell.leftRailId,
      topRailId: sourceCell.topRailId,
      bottomRailId: sourceCell.bottomRailId,
    }
    seamArea.filledCells.unshift({
      id: createGridCellId({
        masterId: seamFixture.masterId, channel: 'main', elementId: seamFixture.areaElementId,
        ...leftBounds,
      }),
      ...leftBounds,
    })
    const seamContext = { baseContext: 'mixed' as const }
    const seam: JamoContextVariant = {
      id: createJamoContextVariantId(seamFixture.masterId, seamContext),
      context: seamContext,
      referenceOverrides: [{
        id: 'override:seam',
        target: {
          kind: 'cell-edge', masterId: seamFixture.masterId, channel: 'main',
          elementId: seamFixture.areaElementId, cellId: sourceCell.id, edge: 'left',
        },
        railId: seamFixture.source.grid.xRails[0].id,
      }],
    }
    seamFixture.source.masters[0].contextVariants = [seam]
    expect(validateJamoContextVariants(seamFixture.source).ok).toBe(false)

    const crossingFixture = createScope()
    const crossingContext = { baseContext: 'mixed-with-jongseong' as const }
    const crossing: JamoContextVariant = {
      id: createJamoContextVariantId(crossingFixture.masterId, crossingContext),
      context: crossingContext,
      referenceOverrides: [{
        id: 'override:crossing',
        target: {
          kind: 'cell-edge', masterId: crossingFixture.masterId, channel: 'main',
          elementId: crossingFixture.areaElementId, cellId: crossingFixture.sourceCellId, edge: 'left',
        },
        railId: crossingFixture.source.grid.xRails[3].id,
      }],
    }
    crossingFixture.source.masters[0].contextVariants = [crossing]
    expect(validateJamoContextVariants(crossingFixture.source).ok).toBe(false)
  })

  it('cell retile provenance는 새 cell만 override로, 동일 bounds 기존 cell은 master로 유지한다', () => {
    const fixture = createScope()
    const context = { baseContext: 'horizontal' as const }
    const variant: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, context),
      context,
      referenceOverrides: [{
        id: 'override:cell:left',
        target: {
          kind: 'cell-edge', masterId: fixture.masterId, channel: 'main',
          elementId: fixture.areaElementId, cellId: fixture.sourceCellId, edge: 'left',
        },
        railId: fixture.source.grid.xRails[0].id,
      }],
    }
    fixture.source.masters[0].contextVariants = [variant]
    const result = resolveExactJamoContextVariant({ source: fixture.source, masterId: fixture.masterId, variantId: variant.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const resultArea = result.master.construction.channels.main!.elements
      .find(({ id }) => id === fixture.areaElementId)
    if (!resultArea || resultArea.kind !== 'area') throw new Error('area result가 아닙니다.')
    const unchanged = resultArea.filledCells.find(({ id }) => id === fixture.sourceCellId)!
    const added = resultArea.filledCells.find(({ id }) => id !== fixture.sourceCellId)!
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      expect(result.provenance.referenceSources[gridReferenceAddressKey({
        kind: 'cell-edge', masterId: fixture.masterId, channel: 'main',
        elementId: fixture.areaElementId, cellId: unchanged.id, edge,
      })]).toEqual({ source: 'master' })
      expect(result.provenance.referenceSources[gridReferenceAddressKey({
        kind: 'cell-edge', masterId: fixture.masterId, channel: 'main',
        elementId: fixture.areaElementId, cellId: added.id, edge,
      })]).toEqual({ source: 'jamo-override', variantId: variant.id })
    }
  })

  it('frozen source를 변경하지 않고 provenance는 derived 결과에만 존재한다', () => {
    const fixture = createScope()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const source = deepFreeze(fixture.source)
    const before = JSON.stringify(source)
    const result = resolveExactJamoContextVariant({ source, masterId: fixture.masterId, variantId: variant.id })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(source)).toBe(before)
    expect(JSON.stringify(source)).not.toMatch(/provenance|railSources|referenceSources/)
  })
})

function validatedReadonlyCompileGate(source: ValidatedRoleConstructionSourceV1): DeepReadonly<RoleConstructionScope> {
  // @ts-expect-error validated persisted source는 다시 수정할 수 없다.
  source.masters[0].jamoId = 'mutated'
  return source
}

void validatedReadonlyCompileGate
