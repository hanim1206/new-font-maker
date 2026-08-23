import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AddAuxiliaryRailCommand,
  CoreXRailRole,
  CoreYRailRole,
  GridAreaElement,
  GridCenterlineElement,
  GridReferenceAddress,
  InkRegion,
  InkRing,
  RailUsage,
  RemoveAuxiliaryRailCommand,
  RoleConstructionScope,
} from '../types'
import { unionInkRegions } from './inkBoolean'
import {
  collectRailUsages,
  rebindGridReference,
  resolveGridPointRef,
} from './gridReferences'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createRoleConstructionSourceV1,
  gridAreaToInkRegions,
  validateRoleConstructionScope,
} from './jamoConstruction'
import {
  addAuxiliaryRailAndSplitCells,
  redoSourceTransaction,
  removeAuxiliaryRail,
  undoSourceTransaction,
} from './masterGridCommands'
import { createBasePartGrid, resolveRailGrid } from './railGridResolver'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const AUX_A = 'rail:CH:x:aux-a'
const AUX_B = 'rail:CH:x:aux-b'
const AUX_C = 'rail:CH:x:aux-c'
const AUX_Y = 'rail:CH:y:aux-safe'

function areaAt(scope: RoleConstructionScope, masterId: string): GridAreaElement {
  const master = scope.masters.find(({ id }) => id === masterId)
  const element = master?.construction.channels.main?.elements.find(({ kind }) => kind === 'area')
  if (!element || element.kind !== 'area') throw new Error('area fixture가 아닙니다.')
  return element
}

function centerlineAt(scope: RoleConstructionScope, masterId: string): GridCenterlineElement {
  const master = scope.masters.find(({ id }) => id === masterId)
  const element = master?.construction.channels.main?.elements.find(({ kind }) => kind === 'centerline')
  if (!element || element.kind !== 'centerline') throw new Error('centerline fixture가 아닙니다.')
  return element
}

function addRail(scope: RoleConstructionScope, input: Omit<AddAuxiliaryRailCommand, 'transactionId'>): RoleConstructionScope {
  const result = addAuxiliaryRailAndSplitCells(scope, { transactionId: `tx:${input.railId}`, ...input })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.scope
}

function removeRail(
  scope: RoleConstructionScope,
  input: Omit<RemoveAuxiliaryRailCommand, 'usageCoverage'>,
) {
  return removeAuxiliaryRail(scope, { ...input, usageCoverage: 'role-construction-v1' })
}

function createBaseRingScope(): { scope: RoleConstructionScope; mieumId: string } {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㅁ', role: 'CH', gridId: grid.id })
  const elementId = 'area:mieum-ring'
  const filledCells = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if (row > 0 && row < 3 && column > 0 && column < 3) continue
      const bounds = {
        leftRailId: grid.xRails[column].id,
        rightRailId: grid.xRails[column + 1].id,
        topRailId: grid.yRails[row].id,
        bottomRailId: grid.yRails[row + 1].id,
      }
      filledCells.push({
        id: createGridCellId({ masterId: master.id, channel: 'main', elementId, ...bounds }),
        ...bounds,
      })
    }
  }
  master.construction.channels.main!.elements.push({
    id: elementId, kind: 'area', filledCells, boundaryTreatments: [],
  })
  return { scope: createRoleConstructionSourceV1({ grid, masters: [master] }), mieumId: master.id }
}

function createReferenceScope(): {
  scope: RoleConstructionScope
  mieumId: string
  giyeokId: string
  innerLeft: string
  centerX: string
  centerY: string
} {
  const base = createBaseRingScope()
  const innerLeft = base.scope.grid.xRails[1].id
  const centerX = base.scope.grid.xRails[2].id
  const centerY = base.scope.grid.yRails[2].id
  let scope = addRail(base.scope, {
    axis: 'x', railId: AUX_A, fromRailId: innerLeft, toRailId: centerX, ratio: 0.25,
  })
  scope = addRail(scope, {
    axis: 'x', railId: AUX_B, fromRailId: AUX_A, toRailId: centerX, ratio: 0.5,
  })
  scope = addRail(scope, {
    axis: 'y', railId: AUX_Y,
    fromRailId: scope.grid.yRails.find(({ coreRole }) => coreRole === 'inner-top')!.id,
    toRailId: centerY,
    ratio: 0.5,
  })

  const giyeok = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'CH', gridId: scope.grid.id })
  const xOuter = scope.grid.xRails.find(({ coreRole }) => coreRole === 'outer-left')!.id
  const yTop = scope.grid.yRails.find(({ coreRole }) => coreRole === 'outer-top')!.id
  const yBottom = scope.grid.yRails.find(({ coreRole }) => coreRole === 'inner-bottom')!.id
  giyeok.construction.channels.main!.elements.push({
    id: 'centerline:giyeok', kind: 'centerline', closed: false, thickness: 0.1,
    anchors: [{
      id: 'anchor:giyeok:start',
      point: { id: 'ref:giyeok:start', xRailId: AUX_A, yRailId: yTop },
      handleIn: { id: 'ref:giyeok:start:in', xRailId: xOuter, yRailId: AUX_Y },
      handleOut: { id: 'ref:giyeok:start:out', xRailId: AUX_B, yRailId: yTop },
    }, {
      id: 'anchor:giyeok:end',
      point: { id: 'ref:giyeok:end', xRailId: centerX, yRailId: yBottom },
    }],
  })
  scope.masters.push(giyeok)

  const area = areaAt(scope, base.mieumId)
  const yInnerTop = scope.grid.yRails.find(({ coreRole }) => coreRole === 'inner-top')!.id
  area.boundaryTreatments.push({
    id: 'curve:mieum:one', kind: 'curve', tension: 0.5,
    vertex: { id: 'ref:curve:vertex', xRailId: innerLeft, yRailId: yInnerTop },
    from: { id: 'ref:curve:from', xRailId: innerLeft, yRailId: centerY },
    to: { id: 'ref:curve:to', xRailId: AUX_A, yRailId: yInnerTop },
  }, {
    id: 'diagonal:mieum:one', kind: 'diagonal',
    vertex: { id: 'ref:diagonal:vertex', xRailId: xOuter, yRailId: yTop },
    from: { id: 'ref:diagonal:from', xRailId: innerLeft, yRailId: yTop },
    to: { id: 'ref:diagonal:to', xRailId: xOuter, yRailId: yInnerTop },
  })
  expect(validateRoleConstructionScope(scope)).toEqual({ ok: true, issues: [] })
  return { scope, mieumId: base.mieumId, giyeokId: giyeok.id, innerLeft, centerX, centerY }
}

function cleanRing(ring: InkRing): InkRing {
  const points = ring.map(({ x, y }) => ({ x: Math.round(x * 1e9) / 1e9, y: Math.round(y * 1e9) / 1e9 }))
  let changed = true
  while (changed && points.length >= 3) {
    changed = false
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length]
      const current = points[index]
      const next = points[(index + 1) % points.length]
      const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x)
      if (Math.abs(cross) <= 1e-12) { points.splice(index, 1); changed = true; break }
    }
  }
  const start = points.reduce((best, point, index) => {
    const current = points[best]
    return point.x < current.x || (point.x === current.x && point.y < current.y) ? index : best
  }, 0)
  return [...points.slice(start), ...points.slice(0, start)]
}

function silhouette(scope: RoleConstructionScope, masterId: string): string {
  const resolved = resolveRailGrid(scope.grid)
  if (!resolved.ok) throw new Error('grid resolve 실패')
  const regions = unionInkRegions(gridAreaToInkRegions(areaAt(scope, masterId), resolved.grid), {
    positionEpsilon: 1e-9, minRingArea: 1e-12,
  })
  const canonical = regions.map((region: InkRegion) => ({
    outer: cleanRing(region.outer), holes: region.holes.map(cleanRing).sort(),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return JSON.stringify(canonical)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function hardUsages(usages: RailUsage[]): RailUsage[] {
  return usages.filter(({ kind }) => kind !== 'cell-boundary')
}

describe('안정 Grid 참조·usage·rebind·삭제 계약', () => {
  it('between·anchor·treatment·cell edge 사용처를 완전하고 결정적인 owner 주소로 수집한다', () => {
    const fixture = createReferenceScope()
    const frozen = deepFreeze(fixture.scope)
    const before = JSON.stringify(frozen)
    const result = collectRailUsages(frozen, AUX_A)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(hardUsages(result.usages)).toEqual([
      expect.objectContaining({ kind: 'between-binding', dependentRailId: AUX_B, endpoint: 'from' }),
      expect.objectContaining({ kind: 'point-reference', masterId: fixture.giyeokId, anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start', slot: 'anchor-point', axis: 'x' }),
      expect.objectContaining({ kind: 'point-reference', masterId: fixture.mieumId, treatmentId: 'curve:mieum:one', referenceId: 'ref:curve:to', slot: 'curve-to', axis: 'x' }),
    ])
    expect(result.usages.filter(({ kind }) => kind === 'cell-boundary').length).toBeGreaterThan(0)
    expect(result.usages.map(JSON.stringify)).toEqual([...result.usages].map(JSON.stringify).sort())
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('Rail 위치가 바뀌어도 같은 point reference ID로 좌표를 다시 해석한다', () => {
    const fixture = createReferenceScope()
    const point = centerlineAt(fixture.scope, fixture.giyeokId).anchors[0].point
    const beforeGrid = resolveRailGrid(fixture.scope.grid)
    expect(beforeGrid.ok).toBe(true)
    if (!beforeGrid.ok) return
    const before = resolveGridPointRef(point, beforeGrid.grid)!
    const changed = structuredClone(fixture.scope.grid)
    const rail = changed.xRails.find(({ id }) => id === AUX_A)!
    if (rail.position.kind !== 'between') throw new Error('aux fixture가 아닙니다.')
    rail.position.ratio = 0.3
    const afterGrid = resolveRailGrid(changed)
    expect(afterGrid.ok).toBe(true)
    if (!afterGrid.ok) return
    const after = resolveGridPointRef(point, afterGrid.grid)!
    expect(after.id).toBe(before.id)
    expect(after.x).not.toBe(before.x)
    expect(point).not.toHaveProperty('x')
  })

  it('anchor point의 지정 축 하나만 rebind하고 stable owner/ref ID와 형제를 보존한다', () => {
    const fixture = createReferenceScope()
    const before = structuredClone(fixture.scope)
    const result = rebindGridReference(fixture.scope, {
      transactionId: 'tx:rebind-anchor', railId: AUX_B,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main',
        elementId: 'centerline:giyeok', anchorId: 'anchor:giyeok:start',
        referenceId: 'ref:giyeok:start', slot: 'point', axis: 'x',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const master = result.scope.masters.find(({ id }) => id === fixture.giyeokId)!
    const element = master.construction.channels.main!.elements.find(({ kind }) => kind === 'centerline')!
    if (element.kind !== 'centerline') return
    expect(element.anchors[0].point).toEqual({
      id: 'ref:giyeok:start', xRailId: AUX_B,
      yRailId: before.grid.yRails.find(({ coreRole }) => coreRole === 'outer-top')!.id,
    })
    expect(element.anchors[0].handleIn).toEqual(
      (before.masters.find(({ id }) => id === fixture.giyeokId)!.construction.channels.main!.elements[0] as { anchors: typeof element.anchors }).anchors[0].handleIn,
    )
    expect(undoSourceTransaction(result.transaction)).toEqual(before)
    expect(redoSourceTransaction(result.transaction)).toEqual(result.scope)
  })

  it('handle과 boundary treatment point도 지정한 한 축만 rebind한다', () => {
    const fixture = createReferenceScope()
    const handle = rebindGridReference(fixture.scope, {
      transactionId: 'tx:handle', railId: fixture.centerY,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start:in', slot: 'handle-in', axis: 'y',
      },
    })
    expect(handle.ok).toBe(true)
    const boundary = rebindGridReference(fixture.scope, {
      transactionId: 'tx:boundary', railId: AUX_B,
      target: {
        kind: 'boundary-point', masterId: fixture.mieumId, channel: 'main', elementId: 'area:mieum-ring',
        treatmentId: 'curve:mieum:one', referenceId: 'ref:curve:to', slot: 'to', axis: 'x',
      },
    })
    expect(boundary.ok).toBe(true)
    if (boundary.ok) {
      expect(areaAt(boundary.scope, fixture.mieumId).boundaryTreatments[0].to).toEqual(
        expect.objectContaining({ id: 'ref:curve:to', xRailId: AUX_B }),
      )
    }
  })

  it('rebind 뒤 usage가 old에서 한 건 사라지고 new에 같은 owner로 이동한다', () => {
    const fixture = createReferenceScope()
    const command = {
      transactionId: 'tx:usage-move', railId: AUX_B,
      target: {
        kind: 'centerline-point' as const, masterId: fixture.giyeokId, channel: 'main' as const,
        elementId: 'centerline:giyeok', anchorId: 'anchor:giyeok:start',
        referenceId: 'ref:giyeok:start', slot: 'point' as const, axis: 'x' as const,
      },
    }
    const result = rebindGridReference(fixture.scope, command)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const oldUsages = collectRailUsages(result.scope, AUX_A)
    const newUsages = collectRailUsages(result.scope, AUX_B)
    expect(oldUsages.ok && oldUsages.usages.some((usage) => usage.kind === 'point-reference' && usage.referenceId === command.target.referenceId)).toBe(false)
    expect(newUsages.ok && newUsages.usages.some((usage) => usage.kind === 'point-reference' && usage.referenceId === command.target.referenceId)).toBe(true)
  })

  it('between endpoint를 안정 owner Rail ID로 rebind하고 RailGrid validation을 적용한다', () => {
    const fixture = createReferenceScope()
    const result = rebindGridReference(fixture.scope, {
      transactionId: 'tx:between', railId: fixture.innerLeft,
      target: { kind: 'rail-position', gridId: fixture.scope.grid.id, ownerRailId: AUX_B, endpoint: 'from', axis: 'x' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const rail = result.scope.grid.xRails.find(({ id }) => id === AUX_B)!
      expect(rail.position).toEqual({ kind: 'between', fromRailId: fixture.innerLeft, toRailId: fixture.centerX, ratio: 0.5 })
    }
    const cycle = rebindGridReference(fixture.scope, {
      transactionId: 'tx:cycle', railId: AUX_B,
      target: { kind: 'rail-position', gridId: fixture.scope.grid.id, ownerRailId: AUX_B, endpoint: 'from', axis: 'x' },
    })
    expect(cycle.ok).toBe(false)
    if (!cycle.ok) expect(cycle.error.code).toBe('invalid-result')
  })

  it('between rebind의 minGap·역전·3-node cycle 실패는 source와 transaction을 만들지 않는다', () => {
    const base = createReferenceScope()
    const minGapScope = structuredClone(base.scope)
    const railA = minGapScope.grid.xRails.find(({ id }) => id === AUX_A)!
    if (railA.position.kind !== 'between') throw new Error('A fixture가 between이 아닙니다.')
    railA.position.ratio = 1 / 3
    minGapScope.grid.minGap = 0.075
    expect(validateRoleConstructionScope(minGapScope)).toEqual({ ok: true, issues: [] })

    const cases: Array<{ label: string; source: RoleConstructionScope; command: Parameters<typeof rebindGridReference>[1] }> = [
      {
        label: 'minGap', source: minGapScope,
        command: {
          transactionId: 'tx:min-gap', railId: base.innerLeft,
          target: { kind: 'rail-position', gridId: base.scope.grid.id, ownerRailId: AUX_B, endpoint: 'from', axis: 'x' },
        },
      },
      {
        label: 'reversed', source: base.scope,
        command: {
          transactionId: 'tx:reversed', railId: base.scope.grid.xRails.find(({ coreRole }) => coreRole === 'inner-right')!.id,
          target: { kind: 'rail-position', gridId: base.scope.grid.id, ownerRailId: AUX_B, endpoint: 'from', axis: 'x' },
        },
      },
    ]
    const withThird = addRail(base.scope, {
      axis: 'x', railId: AUX_C, fromRailId: AUX_B, toRailId: base.centerX, ratio: 0.5,
    })
    cases.push({
      label: 'three-node-cycle', source: withThird,
      command: {
        transactionId: 'tx:three-cycle', railId: AUX_C,
        target: { kind: 'rail-position', gridId: withThird.grid.id, ownerRailId: AUX_A, endpoint: 'from', axis: 'x' },
      },
    })

    for (const { label, source, command } of cases) {
      const before = structuredClone(source)
      const result = rebindGridReference(source, command)
      expect(result.ok, label).toBe(false)
      if (!result.ok) expect(result.error.code, label).toBe('invalid-result')
      expect(source, label).toEqual(before)
      expect('transaction' in result, label).toBe(false)
    }
  })

  it.each([
    ['target-not-found', { referenceId: 'missing' }, AUX_B],
    ['axis-mismatch', {}, AUX_Y],
    ['no-op', {}, AUX_A],
  ] as const)('%s rebind 실패는 source와 transaction을 만들지 않는다', (expected, targetOverride, railId) => {
    const fixture = createReferenceScope()
    const before = structuredClone(fixture.scope)
    const result = rebindGridReference(fixture.scope, {
      transactionId: 'tx:invalid', railId,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start', slot: 'point', axis: 'x',
        ...targetOverride,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(expected)
    expect(fixture.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('원자 cell-edge 단독 rebind는 requires-cell-retile로 거부한다', () => {
    const fixture = createReferenceScope()
    const before = structuredClone(fixture.scope)
    const cell = areaAt(fixture.scope, fixture.mieumId).filledCells.find(({ rightRailId }) => rightRailId === AUX_A)!
    const result = rebindGridReference(fixture.scope, {
      transactionId: 'tx:cell-edge', railId: AUX_B,
      target: {
        kind: 'cell-edge', masterId: fixture.mieumId, channel: 'main', elementId: 'area:mieum-ring',
        cellId: cell.id, edge: 'right',
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('requires-cell-retile')
    expect(fixture.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('코어 Rail은 사용처가 없어도 role과 전체 usage를 반환하며 삭제를 거부한다', () => {
    const fixture = createReferenceScope()
    const before = structuredClone(fixture.scope)
    const core = fixture.scope.grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!
    const result = removeRail(fixture.scope, { transactionId: 'tx:core', axis: 'x', railId: core.id })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('core-rail-locked')
      expect(result.error.usages).toContainEqual(expect.objectContaining({ kind: 'core-role', coreRole: 'outer-right' }))
    }
    expect(fixture.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('명시적인 v1 usage coverage와 known source universe 없이는 삭제를 fail-closed한다', () => {
    const fixture = createReferenceScope()
    const missingCoverage = removeAuxiliaryRail(fixture.scope, {
      transactionId: 'tx:no-coverage', axis: 'x', railId: AUX_A,
    } as RemoveAuxiliaryRailCommand)
    expect(missingCoverage.ok).toBe(false)
    if (!missingCoverage.ok) expect(missingCoverage.error.code).toBe('incomplete-usage-coverage')

    const future = structuredClone(fixture.scope)
    Object.assign(future.masters[0], {
      contextVariants: [{ referenceOverrides: { railId: AUX_A }, provenance: 'future-schema' }],
    })
    const before = structuredClone(future)
    const unknownUniverse = removeRail(future, {
      transactionId: 'tx:future-universe', axis: 'x', railId: AUX_A,
    })
    expect(unknownUniverse.ok).toBe(false)
    if (!unknownUniverse.ok) expect(unknownUniverse.error.code).toBe('incomplete-usage-coverage')
    expect(future).toEqual(before)
    expect('transaction' in unknownUniverse).toBe(false)
    expectTypeOf<RemoveAuxiliaryRailCommand['usageCoverage']>()
      .toEqualTypeOf<'role-construction-v1'>()
  })

  it('손상된 persisted source도 completeness 검사 전에 throw 없이 invalid-scope로 차단한다', () => {
    const fixture = createReferenceScope()
    const malformed = {
      grid: fixture.scope.grid,
      masters: [null],
    } as unknown as RoleConstructionScope
    expect(() => removeRail(malformed, {
      transactionId: 'tx:malformed-delete', axis: 'x', railId: AUX_A,
    })).not.toThrow()
    const result = removeRail(malformed, {
      transactionId: 'tx:malformed-delete', axis: 'x', railId: AUX_A,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-scope')
    expect('transaction' in result).toBe(false)
  })

  it('point·treatment·dependent between 하드 사용 중인 보조 Rail 삭제를 자동 이전 없이 차단한다', () => {
    const fixture = createReferenceScope()
    const before = structuredClone(fixture.scope)
    const result = removeRail(fixture.scope, { transactionId: 'tx:block', axis: 'x', railId: AUX_A })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('rail-in-use')
      expect(hardUsages(result.error.usages).map(({ kind }) => kind)).toEqual([
        'between-binding', 'point-reference', 'point-reference',
      ])
    }
    expect(fixture.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('boundary treatment point만 남아도 정확한 owner usage와 함께 삭제를 차단한다', () => {
    const fixture = createReferenceScope()
    const anchor = rebindGridReference(fixture.scope, {
      transactionId: 'tx:free-anchor-only', railId: AUX_B,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start', slot: 'point', axis: 'x',
      },
    })
    if (!anchor.ok) throw new Error('anchor rebind fixture 실패')
    const dependent = rebindGridReference(anchor.scope, {
      transactionId: 'tx:free-dependent-only', railId: fixture.innerLeft,
      target: { kind: 'rail-position', gridId: fixture.scope.grid.id, ownerRailId: AUX_B, endpoint: 'from', axis: 'x' },
    })
    if (!dependent.ok) throw new Error('between rebind fixture 실패')
    const before = structuredClone(dependent.scope)
    const result = removeRail(dependent.scope, {
      transactionId: 'tx:treatment-only-block', axis: 'x', railId: AUX_A,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('rail-in-use')
      expect(hardUsages(result.error.usages)).toEqual([
        expect.objectContaining({
          kind: 'point-reference', masterId: fixture.mieumId, treatmentId: 'curve:mieum:one',
          referenceId: 'ref:curve:to', slot: 'curve-to', axis: 'x',
        }),
      ])
    }
    expect(dependent.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('양쪽 점유가 같은 Y 보조 Rail은 모든 cell을 병합해 실루엣과 한 transaction을 보존한다', () => {
    const fixture = createReferenceScope()
    const handle = rebindGridReference(fixture.scope, {
      transactionId: 'tx:free-y', railId: fixture.centerY,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start:in', slot: 'handle-in', axis: 'y',
      },
    })
    expect(handle.ok).toBe(true)
    if (!handle.ok) return
    const beforeSilhouette = silhouette(handle.scope, fixture.mieumId)
    const result = removeRail(handle.scope, { transactionId: 'tx:delete-y', axis: 'y', railId: AUX_Y })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(silhouette(result.scope, fixture.mieumId)).toBe(beforeSilhouette)
    expect(result.scope.grid.yRails.some(({ id }) => id === AUX_Y)).toBe(false)
    expect(result.merges.length).toBeGreaterThan(0)
    expect(undoSourceTransaction(result.transaction)).toEqual(handle.scope)
    expect(redoSourceTransaction(result.transaction)).toEqual(result.scope)
  })

  it('여러 area master를 한 transaction에서 병합해 각각의 실루엣과 비대상 ID를 보존한다', () => {
    const fixture = createReferenceScope()
    const handle = rebindGridReference(fixture.scope, {
      transactionId: 'tx:free-y-multi', railId: fixture.centerY,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start:in', slot: 'handle-in', axis: 'y',
      },
    })
    if (!handle.ok) throw new Error('handle rebind fixture 실패')
    const sourceArea = areaAt(handle.scope, fixture.mieumId)
    const bieup = createEmptyJamoRoleMaster({ jamoId: 'ㅂ', role: 'CH', gridId: handle.scope.grid.id })
    const bieupElementId = 'area:bieup-ring'
    bieup.construction.channels.main!.elements.push({
      id: bieupElementId,
      kind: 'area',
      boundaryTreatments: [],
      filledCells: sourceArea.filledCells.map((cell) => {
        const bounds = {
          leftRailId: cell.leftRailId, rightRailId: cell.rightRailId,
          topRailId: cell.topRailId, bottomRailId: cell.bottomRailId,
        }
        return {
          id: createGridCellId({ masterId: bieup.id, channel: 'main', elementId: bieupElementId, ...bounds }),
          ...bounds,
        }
      }),
    })
    handle.scope.masters.push(bieup)
    expect(validateRoleConstructionScope(handle.scope)).toEqual({ ok: true, issues: [] })
    const beforeMieum = silhouette(handle.scope, fixture.mieumId)
    const beforeBieup = silhouette(handle.scope, bieup.id)
    const masterIds = handle.scope.masters.map(({ id }) => id)
    const elementIds = handle.scope.masters.flatMap(({ construction }) =>
      Object.values(construction.channels).flatMap((channel) => channel?.elements.map(({ id }) => id) ?? []))
    const unrelatedCellIds = new Set(
      [sourceArea, areaAt(handle.scope, bieup.id)].flatMap(({ filledCells }) => filledCells)
        .filter((cell) => cell.topRailId !== AUX_Y && cell.bottomRailId !== AUX_Y)
        .map(({ id }) => id),
    )
    const result = removeRail(handle.scope, {
      transactionId: 'tx:delete-y-multi', axis: 'y', railId: AUX_Y,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(silhouette(result.scope, fixture.mieumId)).toBe(beforeMieum)
    expect(silhouette(result.scope, bieup.id)).toBe(beforeBieup)
    expect(result.scope.masters.map(({ id }) => id)).toEqual(masterIds)
    expect(result.scope.masters.flatMap(({ construction }) =>
      Object.values(construction.channels).flatMap((channel) => channel?.elements.map(({ id }) => id) ?? []))).toEqual(elementIds)
    const afterCellIds = new Set(result.scope.masters.flatMap(({ construction }) =>
      Object.values(construction.channels).flatMap((channel) => channel?.elements.flatMap((element) =>
        element.kind === 'area' ? element.filledCells.map(({ id }) => id) : []) ?? [])))
    for (const id of unrelatedCellIds) expect(afterCellIds.has(id)).toBe(true)
    expect(new Set(result.merges.map(({ masterId }) => masterId))).toEqual(new Set([fixture.mieumId, bieup.id]))
    expect(undoSourceTransaction(result.transaction)).toEqual(handle.scope)
    expect(redoSourceTransaction(result.transaction)).toEqual(result.scope)
  })

  it('양쪽 점유가 다르면 OR merge하지 않고 occupancy-differs로 전체 삭제를 차단한다', () => {
    const fixture = createReferenceScope()
    const handle = rebindGridReference(fixture.scope, {
      transactionId: 'tx:free-y', railId: fixture.centerY,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start:in', slot: 'handle-in', axis: 'y',
      },
    })
    if (!handle.ok) throw new Error('rebind fixture 실패')
    const area = areaAt(handle.scope, fixture.mieumId)
    const rightStripLeft = handle.scope.grid.xRails.find(({ coreRole }) => coreRole === 'inner-right')!.id
    const upper = area.filledCells.find(({ bottomRailId, leftRailId }) =>
      bottomRailId === AUX_Y && leftRailId === rightStripLeft)!
    const lowerIndex = area.filledCells.findIndex((cell) => cell.topRailId === AUX_Y
      && cell.leftRailId === upper.leftRailId && cell.rightRailId === upper.rightRailId)
    area.filledCells.splice(lowerIndex, 1)
    expect(validateRoleConstructionScope(handle.scope).ok).toBe(true)
    const before = structuredClone(handle.scope)
    const result = removeRail(handle.scope, { transactionId: 'tx:blocked-y', axis: 'y', railId: AUX_Y })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('occupancy-differs')
    expect(handle.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('뒤쪽 area master 하나만 점유가 달라도 multi-master 삭제 전체를 원자적으로 차단한다', () => {
    const fixture = createReferenceScope()
    const handle = rebindGridReference(fixture.scope, {
      transactionId: 'tx:free-y-mismatch', railId: fixture.centerY,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start:in', slot: 'handle-in', axis: 'y',
      },
    })
    if (!handle.ok) throw new Error('handle rebind fixture 실패')
    const sourceArea = areaAt(handle.scope, fixture.mieumId)
    const bieup = createEmptyJamoRoleMaster({ jamoId: 'ㅂ', role: 'CH', gridId: handle.scope.grid.id })
    const elementId = 'area:bieup-mismatch'
    bieup.construction.channels.main!.elements.push({
      id: elementId, kind: 'area', boundaryTreatments: [],
      filledCells: sourceArea.filledCells.map((cell) => {
        const bounds = {
          leftRailId: cell.leftRailId, rightRailId: cell.rightRailId,
          topRailId: cell.topRailId, bottomRailId: cell.bottomRailId,
        }
        return { id: createGridCellId({ masterId: bieup.id, channel: 'main', elementId, ...bounds }), ...bounds }
      }),
    })
    handle.scope.masters.push(bieup)
    const area = areaAt(handle.scope, bieup.id)
    const rightStripLeft = handle.scope.grid.xRails.find(({ coreRole }) => coreRole === 'inner-right')!.id
    const upper = area.filledCells.find(({ bottomRailId, leftRailId }) =>
      bottomRailId === AUX_Y && leftRailId === rightStripLeft)!
    const lowerIndex = area.filledCells.findIndex((cell) => cell.topRailId === AUX_Y
      && cell.leftRailId === upper.leftRailId && cell.rightRailId === upper.rightRailId)
    area.filledCells.splice(lowerIndex, 1)
    expect(validateRoleConstructionScope(handle.scope).ok).toBe(true)
    const before = structuredClone(handle.scope)
    const result = removeRail(handle.scope, {
      transactionId: 'tx:multi-mismatch', axis: 'y', railId: AUX_Y,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('occupancy-differs')
    expect(handle.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('하드 참조를 각각 rebind한 뒤에만 X 보조 Rail을 안전하게 삭제한다', () => {
    const fixture = createReferenceScope()
    const initialSilhouette = silhouette(fixture.scope, fixture.mieumId)
    const anchor = rebindGridReference(fixture.scope, {
      transactionId: 'tx:free-anchor', railId: AUX_B,
      target: {
        kind: 'centerline-point', masterId: fixture.giyeokId, channel: 'main', elementId: 'centerline:giyeok',
        anchorId: 'anchor:giyeok:start', referenceId: 'ref:giyeok:start', slot: 'point', axis: 'x',
      },
    })
    if (!anchor.ok) throw new Error('anchor rebind 실패')
    const treatment = rebindGridReference(anchor.scope, {
      transactionId: 'tx:free-treatment', railId: AUX_B,
      target: {
        kind: 'boundary-point', masterId: fixture.mieumId, channel: 'main', elementId: 'area:mieum-ring',
        treatmentId: 'curve:mieum:one', referenceId: 'ref:curve:to', slot: 'to', axis: 'x',
      },
    })
    if (!treatment.ok) throw new Error('treatment rebind 실패')
    const dependent = rebindGridReference(treatment.scope, {
      transactionId: 'tx:free-dependent', railId: fixture.innerLeft,
      target: { kind: 'rail-position', gridId: fixture.scope.grid.id, ownerRailId: AUX_B, endpoint: 'from', axis: 'x' },
    })
    if (!dependent.ok) throw new Error('between rebind 실패')
    const remaining = collectRailUsages(dependent.scope, AUX_A)
    expect(remaining.ok && hardUsages(remaining.usages)).toEqual([])
    const result = removeRail(dependent.scope, { transactionId: 'tx:delete-a', axis: 'x', railId: AUX_A })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(silhouette(result.scope, fixture.mieumId)).toBe(initialSilhouette)
    expect(result.scope.grid.xRails.some(({ id }) => id === AUX_A)).toBe(false)
  })

  it('usage 정렬은 master·element·cell 배열 순서와 무관하다', () => {
    const fixture = createReferenceScope()
    const first = collectRailUsages(fixture.scope, AUX_A)
    const reordered = structuredClone(fixture.scope)
    reordered.masters.reverse()
    for (const master of reordered.masters) {
      for (const channel of Object.values(master.construction.channels)) {
        channel?.elements.reverse()
        for (const element of channel?.elements ?? []) if (element.kind === 'area') element.filledCells.reverse()
      }
    }
    const second = collectRailUsages(reordered, AUX_A)
    expect(second).toEqual(first)
  })

  it('reference 주소와 production source에 numeric index 저장 표현이 없다', () => {
    type ForbiddenKey = 'xIndex' | 'yIndex' | 'rowIndex' | 'columnIndex' | 'pointIndex' | 'railIndex'
    type ForbiddenAddressKey<T> = T extends unknown ? Extract<keyof T, ForbiddenKey> : never
    expectTypeOf<ForbiddenAddressKey<GridReferenceAddress>>().toEqualTypeOf<never>()
    const sources = [
      readFileSync(new URL('./gridReferences.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./masterGridCommands.ts', import.meta.url), 'utf8'),
    ].join('\n')
    expect(sources).not.toMatch(/\b(?:xIndex|yIndex|rowIndex|columnIndex|pointIndex|railIndex)\b/)
    expect(sources).not.toMatch(/boolean\s*\[\]\s*\[\]/)
  })
})
