import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type {
  AddAuxiliaryRailCommand,
  CoreXRailRole,
  CoreYRailRole,
  GridAreaElement,
  GridCellRef,
  InkPoint,
  InkRegion,
  InkRing,
  JamoRoleMaster,
  RoleConstructionScope,
} from '../types'
import { unionInkRegions } from './inkBoolean'
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
  undoSourceTransaction,
} from './masterGridCommands'
import { createBasePartGrid, resolveRailGrid } from './railGridResolver'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const BOOLEAN_OPTIONS = { positionEpsilon: 1e-9, minRingArea: 1e-12 }

function cellId(master: JamoRoleMaster, elementId: string, cell: Omit<GridCellRef, 'id'>): string {
  return createGridCellId({ masterId: master.id, channel: 'main', elementId, ...cell })
}

function createRingScope(): RoleConstructionScope {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㅁ', role: 'CH', gridId: grid.id })
  const elementId = 'area:mieum-body'
  const filledCells: GridCellRef[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if (row > 0 && row < 3 && column > 0 && column < 3) continue
      const bounds = {
        leftRailId: grid.xRails[column].id,
        rightRailId: grid.xRails[column + 1].id,
        topRailId: grid.yRails[row].id,
        bottomRailId: grid.yRails[row + 1].id,
      }
      filledCells.push({ id: cellId(master, elementId, bounds), ...bounds })
    }
  }
  master.construction.channels.main!.elements.push({
    id: elementId, kind: 'area', filledCells, boundaryTreatments: [],
  })
  return createRoleConstructionSourceV1({ grid, masters: [master] })
}

function command(overrides: Partial<AddAuxiliaryRailCommand> = {}): AddAuxiliaryRailCommand {
  const scope = createRingScope()
  return {
    transactionId: 'tx:add-x-01',
    axis: 'x',
    railId: 'rail:CH:x:aux-01',
    fromRailId: scope.grid.xRails[1].id,
    toRailId: scope.grid.xRails[2].id,
    ratio: 0.5,
    ...overrides,
  }
}

function areaAt(scope: RoleConstructionScope, masterIndex = 0, elementIndex = 0): GridAreaElement {
  const master = scope.masters[masterIndex]
  const channel = master.construction.channels.main
  const element = channel?.elements[elementIndex]
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

function cleanRing(ring: InkRing): InkRing {
  const quantized = ring.map(({ x, y }) => ({ x: Math.round(x * 1e9) / 1e9, y: Math.round(y * 1e9) / 1e9 }))
  const unique = quantized.filter((point, index) => index === 0 || point.x !== quantized[index - 1].x || point.y !== quantized[index - 1].y)
  const result = [...unique]
  let changed = true
  while (changed && result.length >= 3) {
    changed = false
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length]
      const current = result[index]
      const next = result[(index + 1) % result.length]
      const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x)
      if (Math.abs(cross) <= 1e-12) {
        result.splice(index, 1)
        changed = true
        break
      }
    }
  }
  const first = result.reduce((best, point, index) => {
    const current = result[best]
    return point.x < current.x || (point.x === current.x && point.y < current.y) ? index : best
  }, 0)
  return [...result.slice(first), ...result.slice(0, first)]
}

function canonicalRegions(regions: InkRegion[]): string {
  const normalized = regions.map((region) => ({
    outer: cleanRing(region.outer),
    holes: region.holes.map(cleanRing).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return JSON.stringify(normalized)
}

function mergedScopeRegions(scope: RoleConstructionScope, masterIndex = 0): InkRegion[] {
  const resolved = resolveRailGrid(scope.grid)
  if (!resolved.ok) throw new Error('fixture grid가 해석되지 않았습니다.')
  const element = areaAt(scope, masterIndex)
  return unionInkRegions(gridAreaToInkRegions(element, resolved.grid), BOOLEAN_OPTIONS)
}

function pointInRing(target: InkPoint, ring: InkRing): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current]
    const b = ring[previous]
    if ((a.y > target.y) !== (b.y > target.y)
      && target.x < ((b.x - a.x) * (target.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function filled(target: InkPoint, regions: InkRegion[]): boolean {
  return regions.some((region) => pointInRing(target, region.outer)
    && !region.holes.some((hole) => pointInRing(target, hole)))
}

describe('보조 Rail 추가와 원자 셀 분할 command', () => {
  it('채워진 ㅁ 셀만 분할하고 기존 Rail ID와 실루엣을 exact 보존한다', () => {
    const source = createRingScope()
    const beforeRailIds = [...source.grid.xRails, ...source.grid.yRails].map(({ id }) => id)
    const beforeMasterId = source.masters[0].id
    const beforeElementId = areaAt(source).id
    const beforeCellIds = areaAt(source).filledCells.map(({ id }) => id)
    const beforeRegions = mergedScopeRegions(source)
    const result = addAuxiliaryRailAndSplitCells(source, command())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scope.grid.xRails.filter(({ id }) => id !== 'rail:CH:x:aux-01').map(({ id }) => id)
      .concat(result.scope.grid.yRails.map(({ id }) => id))).toEqual(beforeRailIds)
    expect(result.splits).toHaveLength(2)
    const splitParentIds = result.splits.map(({ parentCellId }) => parentCellId)
    expect(splitParentIds.map((id) => beforeCellIds.includes(id))).toEqual([true, true])
    expect(result.splits.every(({ childCellIds }) => childCellIds.every((id) => !beforeCellIds.includes(id)))).toBe(true)
    expect(result.scope.masters[0].id).toBe(beforeMasterId)
    expect(areaAt(result.scope).id).toBe(beforeElementId)
    const afterCellIds = areaAt(result.scope).filledCells.map(({ id }) => id)
    expect(beforeCellIds.filter((id) => !splitParentIds.includes(id)).every((id) => afterCellIds.includes(id))).toBe(true)
    expect(validateRoleConstructionScope(result.scope)).toEqual({ ok: true, issues: [] })
    const afterRegions = mergedScopeRegions(result.scope)
    expect(canonicalRegions(afterRegions)).toBe(canonicalRegions(beforeRegions))
    expect(afterRegions).toHaveLength(1)
    expect(afterRegions[0].holes).toHaveLength(1)
    expect(filled({ x: 0.5, y: 0.5 }, afterRegions)).toBe(false)
    expect(filled({ x: 0.1, y: 0.1 }, afterRegions)).toBe(true)
  })

  it('빈 중앙 영역에는 새 filled cell을 만들지 않고 atomic adjacency를 유지한다', () => {
    const source = createRingScope()
    const result = addAuxiliaryRailAndSplitCells(source, command())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const cells = areaAt(result.scope).filledCells
    expect(cells).toHaveLength(14)
    expect(cells.filter(({ leftRailId, rightRailId }) => leftRailId === command().fromRailId && rightRailId === command().railId)).toHaveLength(2)
    expect(cells.filter(({ leftRailId, rightRailId }) => leftRailId === command().railId && rightRailId === command().toRailId)).toHaveLength(2)
  })

  it('같은 role grid scope의 모든 master를 한 command에서 함께 분할한다', () => {
    const source = createRingScope()
    const second = createEmptyJamoRoleMaster({ jamoId: 'ㅂ', role: 'CH', gridId: source.grid.id })
    const copiedElement = structuredClone(areaAt(source))
    copiedElement.id = 'area:bieup-body'
    for (const cell of copiedElement.filledCells) {
      cell.id = createGridCellId({
        masterId: second.id, channel: 'main', elementId: copiedElement.id,
        leftRailId: cell.leftRailId, rightRailId: cell.rightRailId,
        topRailId: cell.topRailId, bottomRailId: cell.bottomRailId,
      })
    }
    second.construction.channels.main!.elements.push(copiedElement)
    source.masters.push(second)
    const beforeFirst = canonicalRegions(mergedScopeRegions(source, 0))
    const beforeSecond = canonicalRegions(mergedScopeRegions(source, 1))
    const result = addAuxiliaryRailAndSplitCells(source, command())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.splits.filter(({ masterId }) => masterId === source.masters[0].id)).toHaveLength(2)
    expect(result.splits.filter(({ masterId }) => masterId === second.id)).toHaveLength(2)
    expect(canonicalRegions(mergedScopeRegions(result.scope, 0))).toBe(beforeFirst)
    expect(canonicalRegions(mergedScopeRegions(result.scope, 1))).toBe(beforeSecond)
  })

  it('frozen source/command를 변경하지 않고 동일 입력은 byte-semantic 동일하다', () => {
    const source = deepFreeze(createRingScope())
    const request = deepFreeze(command())
    const before = JSON.stringify({ source, request })
    const first = addAuxiliaryRailAndSplitCells(source, request)
    const second = addAuxiliaryRailAndSplitCells(source, request)
    expect(first).toEqual(second)
    expect(JSON.stringify({ source, request })).toBe(before)
  })

  it('X와 Y 보조 Rail을 같은 규칙으로 추가한다', () => {
    const source = createRingScope()
    const yCommand = command({
      transactionId: 'tx:add-y-01', axis: 'y', railId: 'rail:CH:y:aux-01',
      fromRailId: source.grid.yRails[1].id, toRailId: source.grid.yRails[2].id,
    })
    const result = addAuxiliaryRailAndSplitCells(source, yCommand)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scope.grid.yRails[2].id).toBe(yCommand.railId)
    expect(result.splits).toHaveLength(2)
    expect(canonicalRegions(mergedScopeRegions(result.scope))).toBe(canonicalRegions(mergedScopeRegions(source)))
  })

  it('minGap 부동소수 exact 경계는 허용하고 즉시 미달은 거부한다', () => {
    const exact = createRingScope()
    exact.grid.minGap = 0.15
    expect(addAuxiliaryRailAndSplitCells(exact, command()).ok).toBe(true)
    const below = createRingScope()
    below.grid.minGap = 0.150000000001
    const result = addAuxiliaryRailAndSplitCells(below, command())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('min-gap-violation')
  })

  it.each([
    ['invalid-transaction-id', { transactionId: '' }],
    ['invalid-axis', { axis: 'z' as 'x' }],
    ['duplicate-rail-id', { railId: createRingScope().grid.xRails[0].id }],
    ['missing-reference', { fromRailId: 'missing' }],
    ['cross-axis-reference', { fromRailId: createRingScope().grid.yRails[0].id }],
    ['non-adjacent-reference', { toRailId: createRingScope().grid.xRails[3].id }],
    ['invalid-ratio', { ratio: 0 }],
    ['min-gap-violation', { ratio: 0.1 }],
  ] as const)('%s 오류는 부분 결과나 transaction 없이 거부한다', (expected, overrides) => {
    const source = createRingScope()
    const before = structuredClone(source)
    const result = addAuxiliaryRailAndSplitCells(source, command(overrides))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(expected)
    expect(source).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('다른 경계의 future child ID를 가장한 비canonical source는 명령 전에 거부한다', () => {
    const source = createRingScope()
    const master = source.masters[0]
    const element = areaAt(source)
    const target = element.filledCells.find((cell) => cell.leftRailId === command().fromRailId && cell.rightRailId === command().toRailId)!
    const future = createGridCellId({
      masterId: master.id, channel: 'main', elementId: element.id,
      leftRailId: target.leftRailId, rightRailId: command().railId,
      topRailId: target.topRailId, bottomRailId: target.bottomRailId,
    })
    element.filledCells.find((cell) => cell !== target)!.id = future
    expect(validateRoleConstructionScope(source).ok).toBe(false)
    const before = structuredClone(source)
    const result = addAuxiliaryRailAndSplitCells(source, command())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-scope')
    expect(source).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('손상된 filled cell은 빈 영역으로 삼키지 않고 geometry 경계에서 fail-loud한다', () => {
    const scope = createRingScope()
    const resolved = resolveRailGrid(scope.grid)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    const element = structuredClone(areaAt(scope))
    element.filledCells[0].rightRailId = 'missing'
    expect(() => gridAreaToInkRegions(element, resolved.grid)).toThrow(/Rail 경계를 해석/)
  })

  it('신규 production service에 index 좌표와 boolean matrix 저장 표현이 없다', () => {
    const sources = [
      readFileSync(new URL('./jamoConstruction.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./masterGridCommands.ts', import.meta.url), 'utf8'),
    ].join('\n')
    expect(sources).not.toMatch(/\b(?:xIndex|yIndex|rowIndex|columnIndex)\b/)
    expect(sources).not.toMatch(/boolean\s*\[\]\s*\[\]/)
  })

  it('한 command의 before/after로 여러 원본을 Undo/Redo 한 단계에 복원한다', () => {
    const source = createRingScope()
    const result = addAuxiliaryRailAndSplitCells(source, command())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transaction.id).toBe('tx:add-x-01')
    expect(undoSourceTransaction(result.transaction)).toEqual(source)
    expect(redoSourceTransaction(result.transaction)).toEqual(result.scope)
    expect('resolvedPartGrid' in result.transaction).toBe(false)
  })
})
