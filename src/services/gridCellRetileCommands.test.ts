import { describe, expect, it } from 'vitest'
import type {
  CoreXRailRole,
  CoreYRailRole,
  GridAreaElement,
  GridCellRef,
  InkPoint,
  InkRegion,
  InkRing,
  RetileGridCellEdgeCommand,
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
import { retileGridCellEdge } from './gridCellRetileCommands'
import { redoSourceTransaction, undoSourceTransaction } from './masterGridCommands'
import { createBasePartGrid, resolveRailGrid } from './railGridResolver'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const BOOLEAN_OPTIONS = { positionEpsilon: 1e-9, minRingArea: 1e-12 }

function createCell(
  scope: RoleConstructionScope,
  elementId: string,
  left: number,
  right: number,
  top: number,
  bottom: number,
): GridCellRef {
  const bounds = {
    leftRailId: scope.grid.xRails[left].id,
    rightRailId: scope.grid.xRails[right].id,
    topRailId: scope.grid.yRails[top].id,
    bottomRailId: scope.grid.yRails[bottom].id,
  }
  return {
    id: createGridCellId({
      masterId: scope.masters[0].id,
      channel: 'main',
      elementId,
      ...bounds,
    }),
    ...bounds,
  }
}

function createScope(): { scope: RoleConstructionScope; element: GridAreaElement } {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㅁ', role: 'CH', gridId: grid.id })
  const scope = createRoleConstructionSourceV1({ grid, masters: [master] })
  const element: GridAreaElement = {
    id: 'area:retile',
    kind: 'area',
    filledCells: [],
    boundaryTreatments: [],
  }
  element.filledCells.push(
    createCell(scope, element.id, 1, 2, 1, 2),
    createCell(scope, element.id, 3, 4, 3, 4),
  )
  master.construction.channels.main!.elements.push(element)
  expect(validateRoleConstructionScope(scope)).toEqual({ ok: true, issues: [] })
  return { scope, element }
}

function createRingScope(): { scope: RoleConstructionScope; element: GridAreaElement } {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㅁ', role: 'CH', gridId: grid.id })
  const scope = createRoleConstructionSourceV1({ grid, masters: [master] })
  const element: GridAreaElement = {
    id: 'area:retile',
    kind: 'area',
    filledCells: [],
    boundaryTreatments: [],
  }
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if (row > 0 && row < 3 && column > 0 && column < 3) continue
      element.filledCells.push(createCell(scope, element.id, column, column + 1, row, row + 1))
    }
  }
  master.construction.channels.main!.elements.push(element)
  expect(validateRoleConstructionScope(scope)).toEqual({ ok: true, issues: [] })
  return { scope, element }
}

function command(
  scope: RoleConstructionScope,
  cellId: string,
  edge: RetileGridCellEdgeCommand['target']['edge'],
  railId: string,
): RetileGridCellEdgeCommand {
  return {
    transactionId: `tx:retile:${edge}`,
    railId,
    target: {
      kind: 'cell-edge',
      masterId: scope.masters[0].id,
      channel: 'main',
      elementId: 'area:retile',
      cellId,
      edge,
    },
  }
}

function area(scope: RoleConstructionScope): GridAreaElement {
  const element = scope.masters[0].construction.channels.main!.elements
    .find(({ id }) => id === 'area:retile')
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
  const result = ring.map(({ x, y }) => ({
    x: Math.round(x * 1e9) / 1e9,
    y: Math.round(y * 1e9) / 1e9,
  })).filter((point, index, points) => index === 0
    || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  let changed = true
  while (changed && result.length >= 3) {
    changed = false
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length]
      const current = result[index]
      const next = result[(index + 1) % result.length]
      const cross = (current.x - previous.x) * (next.y - current.y)
        - (current.y - previous.y) * (next.x - current.x)
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

function mergedRegions(scope: RoleConstructionScope): InkRegion[] {
  const resolved = resolveRailGrid(scope.grid)
  if (!resolved.ok) throw new Error('fixture grid가 해석되지 않았습니다.')
  return unionInkRegions(gridAreaToInkRegions(area(scope), resolved.grid), BOOLEAN_OPTIONS)
}

function canonicalRegions(scope: RoleConstructionScope): string {
  const normalized = mergedRegions(scope).map((region) => ({
    outer: cleanRing(region.outer),
    holes: region.holes.map(cleanRing).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return JSON.stringify(normalized)
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

describe('원자 셀 경계 composite retile command', () => {
  it('노출된 X 경계를 바깥 Rail까지 원자 셀로 확장하고 안정 ID·한 transaction을 보존한다', () => {
    const fixture = createScope()
    const sourceCell = fixture.element.filledCells[0]
    const unrelatedId = fixture.element.filledCells[1].id
    const result = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      sourceCell.id,
      'left',
      fixture.scope.grid.xRails[0].id,
    ))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const cells = area(result.scope).filledCells
    expect(cells.filter(({ topRailId }) => topRailId === sourceCell.topRailId)).toEqual([
      createCell(fixture.scope, 'area:retile', 0, 1, 1, 2),
      sourceCell,
    ])
    expect(cells.some(({ id }) => id === unrelatedId)).toBe(true)
    expect(cells.every((cell) => {
      const left = result.scope.grid.xRails.findIndex(({ id }) => id === cell.leftRailId)
      const right = result.scope.grid.xRails.findIndex(({ id }) => id === cell.rightRailId)
      const top = result.scope.grid.yRails.findIndex(({ id }) => id === cell.topRailId)
      const bottom = result.scope.grid.yRails.findIndex(({ id }) => id === cell.bottomRailId)
      return right === left + 1 && bottom === top + 1
    })).toBe(true)
    expect(undoSourceTransaction(result.transaction)).toEqual(fixture.scope)
    expect(redoSourceTransaction(result.transaction)).toEqual(result.scope)
  })

  it('반대 edge Rail을 고르면 바깥 원자 셀 하나를 제거해 최초 cell ID 집합으로 복원한다', () => {
    const fixture = createScope()
    const originalIds = fixture.element.filledCells.map(({ id }) => id).sort()
    const expanded = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      fixture.element.filledCells[0].id,
      'left',
      fixture.scope.grid.xRails[0].id,
    ))
    if (!expanded.ok) throw new Error('확장 fixture 실패')
    const outerCell = area(expanded.scope).filledCells.find(({ leftRailId }) =>
      leftRailId === expanded.scope.grid.xRails[0].id)!
    const restored = retileGridCellEdge(expanded.scope, command(
      expanded.scope,
      outerCell.id,
      'left',
      expanded.scope.grid.xRails[1].id,
    ))
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(area(restored.scope).filledCells.map(({ id }) => id).sort()).toEqual(originalIds)
  })

  it('Y 경계도 같은 규칙으로 재타일링한다', () => {
    const fixture = createScope()
    const sourceCell = fixture.element.filledCells[0]
    const result = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      sourceCell.id,
      'top',
      fixture.scope.grid.yRails[0].id,
    ))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(area(result.scope).filledCells.filter(({ leftRailId }) =>
      leftRailId === sourceCell.leftRailId)).toHaveLength(2)
  })

  it.each([
    ['right', 'x', 0, 1, 2] as const,
    ['bottom', 'y', 1, 0, 2] as const,
  ])('실제 ㅁ의 %s 안쪽 경계를 확장했다 되돌리면 hole·실루엣·cell ID를 exact 복원한다', (
    edge,
    axis,
    column,
    row,
    destinationIndex,
  ) => {
    const fixture = createRingScope()
    const originalIds = fixture.element.filledCells.map(({ id }) => id).sort()
    const originalSignature = canonicalRegions(fixture.scope)
    const originalRegions = mergedRegions(fixture.scope)
    expect(originalRegions).toHaveLength(1)
    expect(originalRegions[0].holes).toHaveLength(1)
    expect(filled({ x: 0.65, y: 0.65 }, originalRegions)).toBe(false)
    const sourceCell = fixture.element.filledCells.find((cell) =>
      cell.leftRailId === fixture.scope.grid.xRails[column].id
      && cell.topRailId === fixture.scope.grid.yRails[row].id)!
    const rails = axis === 'x' ? fixture.scope.grid.xRails : fixture.scope.grid.yRails
    const expanded = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      sourceCell.id,
      edge,
      rails[destinationIndex].id,
    ))
    expect(expanded.ok).toBe(true)
    if (!expanded.ok) return
    expect(canonicalRegions(expanded.scope)).not.toBe(originalSignature)
    const added = area(expanded.scope).filledCells.find(({ id }) =>
      !originalIds.includes(id) && expanded.audit.generatedCellIds.includes(id))!
    const restored = retileGridCellEdge(expanded.scope, command(
      expanded.scope,
      added.id,
      edge,
      axis === 'x' ? added.leftRailId : added.topRailId,
    ))
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(area(restored.scope).filledCells.map(({ id }) => id).sort()).toEqual(originalIds)
    expect(canonicalRegions(restored.scope)).toBe(originalSignature)
    const restoredRegions = mergedRegions(restored.scope)
    expect(restoredRegions[0].holes).toHaveLength(1)
    expect(filled({ x: 0.65, y: 0.65 }, restoredRegions)).toBe(false)
  })

  it('멀리 떨어진 기존 원자 셀은 재사용하고 빈 구간만 새 안정 ID로 채운다', () => {
    const fixture = createScope()
    fixture.element.filledCells = [
      createCell(fixture.scope, fixture.element.id, 0, 1, 1, 2),
      createCell(fixture.scope, fixture.element.id, 2, 3, 1, 2),
    ]
    const existingId = fixture.element.filledCells[0].id
    const targetId = fixture.element.filledCells[1].id
    expect(validateRoleConstructionScope(fixture.scope).ok).toBe(true)
    const result = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      targetId,
      'left',
      fixture.scope.grid.xRails[0].id,
    ))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.audit.reusedCellIds).toEqual([existingId])
    expect(area(result.scope).filledCells.some(({ id }) => id === existingId)).toBe(true)
    expect(area(result.scope).filledCells.some(({ id }) => id === targetId)).toBe(true)
    expect(area(result.scope).filledCells).toContainEqual(
      createCell(fixture.scope, fixture.element.id, 1, 2, 1, 2),
    )
  })

  it('알 수 없는 edge·비canonical cell ID·검사되지 않은 variant를 모두 fail-closed한다', () => {
    const invalidEdgeFixture = createScope()
    const invalidEdgeCommand = command(
      invalidEdgeFixture.scope,
      invalidEdgeFixture.element.filledCells[0].id,
      'left',
      invalidEdgeFixture.scope.grid.xRails[0].id,
    ) as RetileGridCellEdgeCommand
    ;(invalidEdgeCommand.target as { edge: string }).edge = 'future'
    const invalidEdge = retileGridCellEdge(invalidEdgeFixture.scope, invalidEdgeCommand)
    expect(invalidEdge.ok).toBe(false)
    if (!invalidEdge.ok) expect(invalidEdge.error.code).toBe('invalid-target')

    const invalidIdFixture = createScope()
    invalidIdFixture.element.filledCells[0].id = 'cell:noncanonical'
    const invalidId = retileGridCellEdge(invalidIdFixture.scope, command(
      invalidIdFixture.scope,
      'cell:noncanonical',
      'left',
      invalidIdFixture.scope.grid.xRails[0].id,
    ))
    expect(invalidId.ok).toBe(false)
    if (!invalidId.ok) expect(invalidId.error.code).toBe('invalid-scope')

    const variantFixture = createScope()
    variantFixture.scope.masters[0].contextVariants = [{
      id: 'variant:CH:horizontal',
      context: { baseContext: 'horizontal' },
    }]
    const before = structuredClone(variantFixture.scope)
    const variant = retileGridCellEdge(variantFixture.scope, command(
      variantFixture.scope,
      variantFixture.element.filledCells[0].id,
      'left',
      variantFixture.scope.grid.xRails[0].id,
    ))
    expect(variant.ok).toBe(false)
    if (!variant.ok) expect(variant.error.code).toBe('variant-usage-unchecked')
    expect(variantFixture.scope).toEqual(before)
    expect('transaction' in variant).toBe(false)
  })

  it('내부 seam과 반대 edge 교차는 source/transaction 없이 차단한다', () => {
    const fixture = createScope()
    const expanded = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      fixture.element.filledCells[0].id,
      'left',
      fixture.scope.grid.xRails[0].id,
    ))
    if (!expanded.ok) throw new Error('확장 fixture 실패')
    const leftCell = area(expanded.scope).filledCells.find(({ leftRailId }) =>
      leftRailId === expanded.scope.grid.xRails[0].id)!
    const before = structuredClone(expanded.scope)
    const seam = retileGridCellEdge(expanded.scope, command(
      expanded.scope,
      leftCell.id,
      'right',
      expanded.scope.grid.xRails[2].id,
    ))
    expect(seam.ok).toBe(false)
    if (!seam.ok) expect(seam.error.code).toBe('internal-cell-seam')
    const crossed = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      fixture.element.filledCells[0].id,
      'left',
      fixture.scope.grid.xRails[3].id,
    ))
    expect(crossed.ok).toBe(false)
    if (!crossed.ok) expect(crossed.error.code).toBe('crosses-opposite-edge')
    expect(expanded.scope).toEqual(before)
    expect('transaction' in seam).toBe(false)
    expect('transaction' in crossed).toBe(false)
  })

  it.each([
    ['target-not-found', 'missing-cell', 'left', 0],
    ['axis-mismatch', 'source', 'left', -1],
    ['no-op', 'source', 'left', 1],
  ] as const)('%s 오류를 fail-closed한다', (expected, cellMode, edge, railIndex) => {
    const fixture = createScope()
    const sourceCell = fixture.element.filledCells[0]
    const railId = railIndex < 0
      ? fixture.scope.grid.yRails[0].id
      : fixture.scope.grid.xRails[railIndex].id
    const before = structuredClone(fixture.scope)
    const result = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      cellMode === 'source' ? sourceCell.id : cellMode,
      edge,
      railId,
    ))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(expected)
    expect(fixture.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('기존 boundary treatment를 고아로 만드는 경계 이동은 전체를 차단한다', () => {
    const fixture = createScope()
    const sourceCell = fixture.element.filledCells[0]
    fixture.element.boundaryTreatments.push({
      id: 'curve:top-left',
      kind: 'curve',
      tension: 0.5,
      vertex: { id: 'curve:vertex', xRailId: sourceCell.leftRailId, yRailId: sourceCell.topRailId },
      from: { id: 'curve:from', xRailId: sourceCell.rightRailId, yRailId: sourceCell.topRailId },
      to: { id: 'curve:to', xRailId: sourceCell.leftRailId, yRailId: sourceCell.bottomRailId },
    })
    expect(validateRoleConstructionScope(fixture.scope).ok).toBe(true)
    const before = structuredClone(fixture.scope)
    const result = retileGridCellEdge(fixture.scope, command(
      fixture.scope,
      sourceCell.id,
      'left',
      fixture.scope.grid.xRails[0].id,
    ))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-result')
    expect(fixture.scope).toEqual(before)
    expect('transaction' in result).toBe(false)
  })

  it('frozen source와 command를 변경하지 않고 동일 입력은 결정적이다', () => {
    const fixture = createScope()
    const request = command(
      fixture.scope,
      fixture.element.filledCells[0].id,
      'left',
      fixture.scope.grid.xRails[0].id,
    )
    const source = deepFreeze(fixture.scope)
    const frozenRequest = deepFreeze(request)
    const before = JSON.stringify({ source, frozenRequest })
    expect(retileGridCellEdge(source, frozenRequest)).toEqual(retileGridCellEdge(source, frozenRequest))
    expect(JSON.stringify({ source, frozenRequest })).toBe(before)
  })
})
