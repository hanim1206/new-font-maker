import type {
  Axis,
  DeepReadonly,
  LayoutGridBinding,
  LayoutGridSourceRailV1,
  LayoutGridSystemSourceIssue,
  LayoutGridSystemSourceParseResult,
  LayoutGridSystemSourceV1,
  LayoutPartEdgeRailIds,
  LayoutRailPosition,
  ResolvedLayoutGrid,
  ResolvedLayoutRail,
  SharedLayoutType,
  ValidatedLayoutGridSystemSourceV1,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'
import {
  LAYOUT_GRID_EDGE_EQUALITY_GROUPS,
  LAYOUT_GRID_SLOT_PARTS,
  LAYOUT_GRID_SPLIT_IDS,
} from './layoutGridTopology'

const EDGE_ORDER = ['left', 'right', 'top', 'bottom'] as const satisfies readonly (keyof LayoutPartEdgeRailIds)[]
const compareCodePoint = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
/** 정규화 좌표의 부동소수점 표현 오차만 흡수하는 minGap 허용치. */
export const LAYOUT_GRID_GAP_EPSILON = 1e-12
const CANONICAL_SPLIT_IDS = new Set(
  SHARED_LAYOUT_TYPES.flatMap((layoutType) => LAYOUT_GRID_SPLIT_IDS[layoutType]),
)
const ISSUE_KEYS = new WeakMap<LayoutGridSystemSourceIssue[], Set<string>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function hasExactOwnKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareCodePoint)
  const wanted = [...expected].sort(compareCodePoint)
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index] && hasOwn(value, key))
}

function addIssue(
  issues: LayoutGridSystemSourceIssue[],
  code: LayoutGridSystemSourceIssue['code'],
  path: string,
  message: string,
): void {
  let keys = ISSUE_KEYS.get(issues)
  if (!keys) {
    keys = new Set()
    ISSUE_KEYS.set(issues, keys)
  }
  const key = `${path}\u0000${code}`
  if (!keys.has(key)) {
    keys.add(key)
    issues.push({ code, path, message })
  }
}

function sortedIssues(issues: LayoutGridSystemSourceIssue[]): LayoutGridSystemSourceIssue[] {
  return issues.sort((left, right) => compareCodePoint(
    `${left.path}\u0000${left.code}`,
    `${right.path}\u0000${right.code}`,
  ))
}

export function createLayoutGridBindingId(layoutType: SharedLayoutType): string {
  return `layout-grid-binding:${encodeURIComponent(layoutType)}`
}

function parsePosition(
  value: unknown,
  path: string,
  issues: LayoutGridSystemSourceIssue[],
): LayoutRailPosition | null {
  if (!isRecord(value) || !hasOwn(value, 'kind')) {
    addIssue(issues, 'invalid-rail', path, 'layout Rail position은 own kind를 가진 객체여야 합니다.')
    return null
  }
  if (value.kind === 'absolute') {
    if (!hasExactOwnKeys(value, ['kind', 'value'])
      || typeof value.value !== 'number' || !Number.isFinite(value.value)
      || value.value < 0 || value.value > 1) {
      addIssue(issues, 'invalid-rail', path, 'absolute layout Rail 위치는 0–1 유한값이어야 합니다.')
      return null
    }
    return { kind: 'absolute', value: value.value }
  }
  if (value.kind === 'between') {
    if (!hasExactOwnKeys(value, ['kind', 'fromRailId', 'toRailId', 'ratio'])
      || typeof value.fromRailId !== 'string' || value.fromRailId.trim() === ''
      || typeof value.toRailId !== 'string' || value.toRailId.trim() === ''
      || value.fromRailId === value.toRailId
      || typeof value.ratio !== 'number' || !Number.isFinite(value.ratio)
      || value.ratio <= 0 || value.ratio >= 1) {
      addIssue(issues, 'invalid-rail', path, 'between layout Rail 위치가 유효하지 않습니다.')
      return null
    }
    return {
      kind: 'between',
      fromRailId: value.fromRailId,
      toRailId: value.toRailId,
      ratio: value.ratio,
    }
  }
  addIssue(issues, 'invalid-rail', path, '지원하지 않는 layout Rail position kind입니다.')
  return null
}

function parseRail(
  value: unknown,
  axis: Axis,
  path: string,
  issues: LayoutGridSystemSourceIssue[],
): LayoutGridSourceRailV1 | null {
  if (!isRecord(value) || !hasExactOwnKeys(value, ['id', 'axis', 'position'])
    || typeof value.id !== 'string' || value.id.trim() === ''
    || value.axis !== axis) {
    addIssue(issues, 'invalid-rail', path, `layout ${axis.toUpperCase()} Rail 구조 또는 축이 유효하지 않습니다.`)
    return null
  }
  const position = parsePosition(value.position, `${path}.position`, issues)
  return position ? { id: value.id, axis, position } : null
}

function exactKeys(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...actual].sort(compareCodePoint)
  const right = [...expected].sort(compareCodePoint)
  return left.length === right.length && left.every((key, index) => key === right[index])
}

function splitAxis(splitId: string): Axis {
  return splitId.includes(':x:') ? 'x' : 'y'
}

function parseBinding(
  value: unknown,
  layoutType: SharedLayoutType,
  gridId: string,
  rails: ReadonlyMap<string, ResolvedLayoutRail>,
  path: string,
  issues: LayoutGridSystemSourceIssue[],
): LayoutGridBinding | null {
  if (!isRecord(value) || !hasExactOwnKeys(value, [
    'schema', 'version', 'id', 'layoutType', 'layoutGridId', 'splitRailIds', 'partEdgeRailIds',
  ]) || value.schema !== 'layout-grid-binding' || value.version !== 1
    || typeof value.id !== 'string' || value.id.trim() === ''
    || value.layoutType !== layoutType || value.layoutGridId !== gridId
    || !isRecord(value.splitRailIds) || !isRecord(value.partEdgeRailIds)) {
    addIssue(issues, 'invalid-binding', path, `${layoutType} layout binding 구조가 유효하지 않습니다.`)
    return null
  }
  const expectedId = createLayoutGridBindingId(layoutType)
  if (value.id !== expectedId) {
    addIssue(issues, 'non-canonical-binding-id', `${path}.id`, `binding ID는 ${expectedId}여야 합니다.`)
  }
  const expectedSplits = LAYOUT_GRID_SPLIT_IDS[layoutType]
  if (!exactKeys(Object.keys(value.splitRailIds), expectedSplits)) {
    addIssue(issues, 'invalid-binding', `${path}.splitRailIds`, '안정 split ID coverage가 정확하지 않습니다.')
  }
  for (const splitId of expectedSplits) {
    const railId = value.splitRailIds[splitId]
    const rail = typeof railId === 'string' ? rails.get(railId) : undefined
    if (!rail || rail.axis !== splitAxis(splitId)) {
      addIssue(issues, rail ? 'cross-axis-reference' : 'missing-reference', `${path}.splitRailIds.${splitId}`, 'split binding Rail 참조 또는 축이 유효하지 않습니다.')
    }
  }

  const expectedParts = LAYOUT_GRID_SLOT_PARTS[layoutType]
  if (!exactKeys(Object.keys(value.partEdgeRailIds), expectedParts)) {
    addIssue(issues, 'invalid-binding', `${path}.partEdgeRailIds`, 'part edge coverage가 정확하지 않습니다.')
  }
  for (const part of expectedParts) {
    const edges = value.partEdgeRailIds[part]
    if (!isRecord(edges) || !hasExactOwnKeys(edges, EDGE_ORDER)) {
      addIssue(issues, 'invalid-binding', `${path}.partEdgeRailIds.${part}`, `${part} edge 구조가 유효하지 않습니다.`)
      continue
    }
    const resolved: Partial<Record<keyof LayoutPartEdgeRailIds, ResolvedLayoutRail>> = {}
    for (const edge of EDGE_ORDER) {
      const railId = edges[edge]
      const expectedAxis: Axis = edge === 'left' || edge === 'right' ? 'x' : 'y'
      const rail = typeof railId === 'string' ? rails.get(railId) : undefined
      if (!rail || rail.axis !== expectedAxis) {
        addIssue(issues, rail ? 'cross-axis-reference' : 'missing-reference', `${path}.partEdgeRailIds.${part}.${edge}`, 'part edge Rail 참조 또는 축이 유효하지 않습니다.')
      } else resolved[edge] = rail
    }
    if (EDGE_ORDER.every((edge) => resolved[edge])) {
      if (resolved.left!.value >= resolved.right!.value || resolved.top!.value >= resolved.bottom!.value) {
        addIssue(issues, 'invalid-binding', `${path}.partEdgeRailIds.${part}`, `${part} edge 순서가 뒤집혔거나 폭이 0입니다.`)
      }
    }
  }
  for (const group of LAYOUT_GRID_EDGE_EQUALITY_GROUPS[layoutType]) {
    const firstEdge = group.edges[0]
    const expectedRailId = group.splitId
      ? value.splitRailIds[group.splitId]
      : isRecord(value.partEdgeRailIds[firstEdge.part])
        ? (value.partEdgeRailIds[firstEdge.part] as Record<string, unknown>)[firstEdge.edge]
        : undefined
    for (const { part, edge } of group.edges) {
      const edgeRailId = isRecord(value.partEdgeRailIds[part])
        ? value.partEdgeRailIds[part][edge]
        : undefined
      if (expectedRailId !== edgeRailId) {
        addIssue(
          issues,
          'invalid-binding',
          `${path}.partEdgeRailIds.${part}.${edge}`,
          group.splitId
            ? `${group.splitId} split과 ${part}.${edge} edge는 같은 Rail을 가리켜야 합니다.`
            : `${layoutType}의 정렬된 part edge는 같은 Rail을 가리켜야 합니다.`,
        )
      }
    }
  }
  return value as unknown as LayoutGridBinding
}

function resolveGrid(
  grid: Record<string, unknown>,
  railsById: ReadonlyMap<string, LayoutGridSourceRailV1>,
  issues: LayoutGridSystemSourceIssue[],
): ResolvedLayoutGrid | null {
  const values = new Map<string, number>()
  const completed = new Set<string>()
  const dependencies = new Map<string, readonly [string, string]>()
  const dependents = new Map<string, string[]>()
  const queue: string[] = []

  const complete = (id: string, value?: number): void => {
    if (completed.has(id)) return
    completed.add(id)
    if (value !== undefined && Number.isFinite(value)) values.set(id, value)
    queue.push(id)
  }

  for (const rail of railsById.values()) {
    if (rail.position.kind === 'absolute') {
      complete(rail.id, rail.position.value)
      continue
    }
    const from = railsById.get(rail.position.fromRailId)
    const to = railsById.get(rail.position.toRailId)
    if (!from || !to) {
      addIssue(issues, 'missing-reference', `$.grid.rails.${rail.id}.position`, `layout Rail ${rail.id}의 between 참조가 없습니다.`)
      complete(rail.id)
      continue
    }
    if (from.axis !== rail.axis || to.axis !== rail.axis) {
      addIssue(issues, 'cross-axis-reference', `$.grid.rails.${rail.id}.position`, `layout Rail ${rail.id}의 between 참조 축이 다릅니다.`)
      complete(rail.id)
      continue
    }
    dependencies.set(rail.id, [from.id, to.id])
    for (const dependencyId of [from.id, to.id]) {
      const list = dependents.get(dependencyId) ?? []
      list.push(rail.id)
      dependents.set(dependencyId, list)
    }
  }

  for (let index = 0; index < queue.length; index += 1) {
    const completedId = queue[index]
    for (const dependentId of dependents.get(completedId) ?? []) {
      if (completed.has(dependentId)) continue
      const dependencyIds = dependencies.get(dependentId)
      if (!dependencyIds || !dependencyIds.every((id) => completed.has(id))) continue
      const [fromId, toId] = dependencyIds
      const fromValue = values.get(fromId)
      const toValue = values.get(toId)
      const rail = railsById.get(dependentId)!
      if (fromValue === undefined || toValue === undefined) {
        complete(dependentId)
      } else if (fromValue >= toValue) {
        addIssue(issues, 'invalid-rail-order', `$.grid.rails.${dependentId}.position`, 'between 참조 구간의 순서가 뒤집혔습니다.')
        complete(dependentId)
      } else if (rail.position.kind === 'between') {
        complete(dependentId, fromValue + (toValue - fromValue) * rail.position.ratio)
      }
    }
  }

  for (const id of railsById.keys()) {
    if (!completed.has(id)) {
      addIssue(issues, 'cyclic-reference', `$.grid.rails.${id}`, `layout Rail ${id}에 순환 참조가 있습니다.`)
      completed.add(id)
    }
  }

  const resolveAxis = (axis: Axis, rails: readonly LayoutGridSourceRailV1[]): ResolvedLayoutRail[] | null => {
    const result: ResolvedLayoutRail[] = []
    for (const rail of rails) {
      const value = values.get(rail.id)
      if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
        addIssue(issues, 'invalid-rail', `$.grid.${axis}Rails.${rail.id}`, `layout ${axis.toUpperCase()} Rail 값을 해석할 수 없습니다.`)
        continue
      }
      result.push({ id: rail.id, axis, value })
    }
    const minGap = grid.minGap as number
    for (let index = 1; index < result.length; index += 1) {
      if (result[index].value <= result[index - 1].value) {
        addIssue(issues, 'invalid-rail-order', `$.grid.${axis}Rails[${index}]`, `layout ${axis.toUpperCase()} Rail은 엄격히 증가해야 합니다.`)
      } else if (result[index].value - result[index - 1].value + LAYOUT_GRID_GAP_EPSILON < minGap) {
        addIssue(issues, 'invalid-gap', `$.grid.${axis}Rails[${index}]`, `layout ${axis.toUpperCase()} Rail 간격이 minGap보다 작습니다.`)
      }
    }
    return result.length === rails.length ? result : null
  }

  const xRails = resolveAxis('x', grid.xRails as LayoutGridSourceRailV1[])
  const yRails = resolveAxis('y', grid.yRails as LayoutGridSourceRailV1[])
  return xRails && yRails && typeof grid.id === 'string'
    ? { id: grid.id, xRails, yRails }
    : null
}

export function parseLayoutGridSystemSourceV1(value: unknown): LayoutGridSystemSourceParseResult {
  const issues: LayoutGridSystemSourceIssue[] = []
  if (!isRecord(value) || !hasOwn(value, 'schema') || !hasOwn(value, 'version')) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'layout grid system root가 유효하지 않습니다.' }] }
  }
  if (value.schema !== 'layout-grid-system') {
    return { ok: false, issues: [{ code: 'unsupported-schema', path: '$.schema', message: '지원하지 않는 layout grid system schema입니다.' }] }
  }
  if (value.version !== 1) {
    return { ok: false, issues: [{ code: 'unsupported-version', path: '$.version', message: '지원하지 않는 layout grid system version입니다.' }] }
  }
  if (!hasExactOwnKeys(value, ['schema', 'version', 'grid', 'bindings'])) {
    addIssue(issues, 'unknown-field', '$', 'layout grid system root 필드가 v1 계약과 다릅니다.')
  }
  if (!isRecord(value.grid) || !hasExactOwnKeys(value.grid, [
    'schema', 'version', 'id', 'xRails', 'yRails', 'snapStep', 'minGap',
  ]) || value.grid.schema !== 'layout-grid-source' || value.grid.version !== 1
    || typeof value.grid.id !== 'string' || value.grid.id.trim() === ''
    || !Array.isArray(value.grid.xRails) || !Array.isArray(value.grid.yRails)
    || value.grid.xRails.length < 2 || value.grid.yRails.length < 2
    || typeof value.grid.snapStep !== 'number' || !Number.isFinite(value.grid.snapStep)
    || value.grid.snapStep <= 0 || value.grid.snapStep > 1
    || typeof value.grid.minGap !== 'number' || !Number.isFinite(value.grid.minGap)
    || value.grid.minGap <= 0 || value.grid.minGap > 1) {
    addIssue(issues, 'invalid-grid', '$.grid', 'layout grid source 구조 또는 편집 단위가 유효하지 않습니다.')
  }

  const parsedRailsByAxis: Record<Axis, LayoutGridSourceRailV1[]> = { x: [], y: [] }
  if (isRecord(value.grid) && Array.isArray(value.grid.xRails) && Array.isArray(value.grid.yRails)) {
    for (const [axis, rails] of [['x', value.grid.xRails], ['y', value.grid.yRails]] as const) {
      for (let index = 0; index < rails.length; index += 1) {
        const parsed = parseRail(rails[index], axis, `$.grid.${axis}Rails[${index}]`, issues)
        if (parsed) parsedRailsByAxis[axis].push(parsed)
      }
    }
  }
  const parsedRails = [...parsedRailsByAxis.x, ...parsedRailsByAxis.y]
  const rawGridId = isRecord(value.grid) && typeof value.grid.id === 'string'
    ? value.grid.id
    : undefined
  const railsById = new Map<string, LayoutGridSourceRailV1>()
  for (const rail of parsedRails) {
    if (railsById.has(rail.id) || rail.id === rawGridId || CANONICAL_SPLIT_IDS.has(rail.id)) {
      addIssue(issues, 'duplicate-id', `$.grid.rails.${rail.id}`, `layout Rail ID ${rail.id}이 중복됩니다.`)
    } else railsById.set(rail.id, rail)
  }
  if (isRecord(value.grid) && typeof value.grid.id === 'string' && CANONICAL_SPLIT_IDS.has(value.grid.id)) {
    addIssue(issues, 'duplicate-id', '$.grid.id', `layout grid ID ${value.grid.id}이 canonical split ID와 충돌합니다.`)
  }
  const hasCompleteRailCoverage = isRecord(value.grid)
    && Array.isArray(value.grid.xRails) && Array.isArray(value.grid.yRails)
    && parsedRailsByAxis.x.length === value.grid.xRails.length
    && parsedRailsByAxis.y.length === value.grid.yRails.length
  const resolvedGrid = isRecord(value.grid)
    && issues.every(({ code }) => code !== 'invalid-grid' && code !== 'invalid-rail')
    && hasCompleteRailCoverage
    ? resolveGrid({
      ...value.grid,
      xRails: parsedRailsByAxis.x,
      yRails: parsedRailsByAxis.y,
    }, railsById, issues)
    : null

  const parsedBindings = new Map<SharedLayoutType, LayoutGridBinding>()
  if (!isRecord(value.bindings) || !exactKeys(Object.keys(value.bindings), SHARED_LAYOUT_TYPES)) {
    addIssue(issues, 'invalid-binding', '$.bindings', '공통 7종 layout binding이 정확히 필요합니다.')
  } else if (resolvedGrid) {
    const railMap = new Map([...resolvedGrid.xRails, ...resolvedGrid.yRails].map((rail) => [rail.id, rail]))
    const idOwners = new Map<string, string>()
    for (const splitId of CANONICAL_SPLIT_IDS) idOwners.set(splitId, '$.bindings.*.splitRailIds')
    idOwners.set(resolvedGrid.id, '$.grid.id')
    for (const rail of railMap.values()) idOwners.set(rail.id, `$.grid.rails.${rail.id}`)
    for (const layoutType of SHARED_LAYOUT_TYPES) {
      const path = `$.bindings.${layoutType}`
      const binding = parseBinding(value.bindings[layoutType], layoutType, resolvedGrid.id, railMap, path, issues)
      if (!binding) continue
      const owner = idOwners.get(binding.id)
      if (owner) addIssue(issues, 'duplicate-id', `${path}.id`, `binding ID ${binding.id}이 ${owner}와 중복됩니다.`)
      else idOwners.set(binding.id, `${path}.id`)
      parsedBindings.set(layoutType, binding)
    }
  }

  if (issues.length > 0 || !resolvedGrid || parsedBindings.size !== SHARED_LAYOUT_TYPES.length) {
    return { ok: false, issues: sortedIssues(issues) }
  }
  let source: LayoutGridSystemSourceV1
  try {
    source = {
      schema: 'layout-grid-system',
      version: 1,
      grid: structuredClone(value.grid) as LayoutGridSystemSourceV1['grid'],
      bindings: Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => [
        layoutType,
        structuredClone(parsedBindings.get(layoutType)!),
      ])) as Record<SharedLayoutType, LayoutGridBinding>,
    }
  } catch {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'layout grid system source를 안전하게 복제할 수 없습니다.' }] }
  }
  return {
    ok: true,
    source: source as DeepReadonly<LayoutGridSystemSourceV1> as ValidatedLayoutGridSystemSourceV1,
    resolvedGrid: structuredClone(resolvedGrid),
  }
}
