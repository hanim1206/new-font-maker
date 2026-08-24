import type {
  AllLayoutGridProjectionResult,
  Axis,
  BoxConfig,
  LayoutGridBinding,
  LayoutGridProjectionIssue,
  LayoutGridProjectionResult,
  LayoutPartEdgeRailIds,
  LayoutSchema,
  LayoutType,
  Part,
  ResolvedLayoutGrid,
  ResolvedLayoutRail,
  SharedLayoutType,
  StableLayoutSplit,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'
import { calculateRawBoxes, DESIGN_BODY_BASE_PADDING } from '../utils/layoutCalculator'
import { LAYOUT_GRID_TOPOLOGIES } from './layoutGridTopology'
import type { LayoutGridTopology } from './layoutGridTopology'

export {
  LAYOUT_GRID_EDGE_EQUALITY_GROUPS,
  LAYOUT_GRID_SLOT_PARTS,
  LAYOUT_GRID_SPLIT_IDS,
} from './layoutGridTopology'

const PARTS: readonly Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
const EDGE_ORDER: readonly (keyof LayoutPartEdgeRailIds)[] = ['left', 'right', 'top', 'bottom']
const EPSILON = 1e-12

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

const isSharedLayoutType = (value: unknown): value is SharedLayoutType =>
  typeof value === 'string' && (SHARED_LAYOUT_TYPES as readonly string[]).includes(value)

const sameOrderedValues = <T extends string>(actual: readonly T[], expected: readonly T[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index])

const fail = (issues: LayoutGridProjectionIssue[]): LayoutGridProjectionResult => ({ ok: false, issues })

function schemaIssue(schema: unknown, message: string): LayoutGridProjectionIssue {
  const layoutType = isRecord(schema) && typeof schema.id === 'string'
    ? schema.id as LayoutType
    : undefined
  return { code: 'invalid-schema', message, layoutType }
}

function validateLegacySchema(
  schema: unknown,
): { ok: true; schema: LayoutSchema; topology: LayoutGridTopology } | { ok: false; issues: LayoutGridProjectionIssue[] } {
  if (!isRecord(schema) || !isSharedLayoutType(schema.id)) {
    return { ok: false, issues: [schemaIssue(schema, '공통 레이아웃 스키마가 아닙니다.')] }
  }
  if (!Array.isArray(schema.slots) || !Array.isArray(schema.splits ?? [])) {
    return { ok: false, issues: [schemaIssue(schema, '슬롯 또는 분할선 구조가 올바르지 않습니다.')] }
  }

  const typedSchema = schema as unknown as LayoutSchema
  const topology = LAYOUT_GRID_TOPOLOGIES[schema.id]
  if (!sameOrderedValues(typedSchema.slots, topology.slots)) {
    return { ok: false, issues: [schemaIssue(schema, '레이아웃 슬롯 구성이 의미 계약과 다릅니다.')] }
  }

  const splits = typedSchema.splits ?? []
  if (splits.length !== topology.splits.length) {
    return { ok: false, issues: [schemaIssue(schema, '레이아웃 분할선 수가 의미 계약과 다릅니다.')] }
  }
  if (splits.some((split) => !isRecord(split)
    || !hasExactKeys(split, ['axis', 'value'])
    || (split.axis !== 'x' && split.axis !== 'y')
    || typeof split.value !== 'number'
    || !Number.isFinite(split.value)
    || split.value <= 0
    || split.value >= 1)) {
    return { ok: false, issues: [schemaIssue(schema, '기존 분할선 값 또는 필드가 올바르지 않습니다.')] }
  }

  const sourceByAxis = {
    x: splits.filter((split) => split.axis === 'x').sort((a, b) => a.value - b.value),
    y: splits.filter((split) => split.axis === 'y').sort((a, b) => a.value - b.value),
  }
  const expectedAxisCount = {
    x: topology.splits.filter((split) => split.axis === 'x').length,
    y: topology.splits.filter((split) => split.axis === 'y').length,
  }
  if (sourceByAxis.x.length !== expectedAxisCount.x || sourceByAxis.y.length !== expectedAxisCount.y) {
    return { ok: false, issues: [schemaIssue(schema, '분할선 축 구성이 의미 계약과 다릅니다.')] }
  }
  if (sourceByAxis.x.some((split, index) => index > 0 && split.value <= sourceByAxis.x[index - 1].value)
    || sourceByAxis.y.some((split, index) => index > 0 && split.value <= sourceByAxis.y[index - 1].value)) {
    return { ok: false, issues: [schemaIssue(schema, '같은 축 분할선은 엄격히 증가해야 합니다.')] }
  }

  return { ok: true, schema: typedSchema, topology }
}

export function identifyLegacySharedSplits(schema: unknown): LayoutGridProjectionResult {
  const validated = validateLegacySchema(schema)
  if (!validated.ok) return validated

  const sourceByAxis = {
    x: (validated.schema.splits ?? []).filter((split) => split.axis === 'x').sort((a, b) => a.value - b.value),
    y: (validated.schema.splits ?? []).filter((split) => split.axis === 'y').sort((a, b) => a.value - b.value),
  }
  const cursor = { x: 0, y: 0 }
  const splits: StableLayoutSplit[] = validated.topology.splits.map((spec) => {
    const source = sourceByAxis[spec.axis][cursor[spec.axis]]
    cursor[spec.axis] += 1
    return { id: spec.id, axis: spec.axis, value: source.value }
  })
  const result = structuredClone(validated.schema)
  if (splits.length > 0 || hasOwn(validated.schema, 'splits')) {
    result.splits = splits.map(({ axis, value }) => ({ axis, value }))
  } else delete result.splits
  return { ok: true, projection: { schema: result, stableSplits: splits } }
}

function validateGrid(grid: unknown, layoutType: SharedLayoutType):
  | { ok: true; grid: ResolvedLayoutGrid; rails: Map<string, ResolvedLayoutRail> }
  | { ok: false; issues: LayoutGridProjectionIssue[] } {
  const issue = (message: string, railId?: string): LayoutGridProjectionIssue => ({
    code: 'invalid-grid', message, layoutType, railId,
  })
  if (!isRecord(grid) || !hasExactKeys(grid, ['id', 'xRails', 'yRails'])
    || typeof grid.id !== 'string' || grid.id.length === 0
    || !Array.isArray(grid.xRails) || !Array.isArray(grid.yRails)) {
    return { ok: false, issues: [issue('레이아웃 그리드 구조가 올바르지 않습니다.')] }
  }
  const typedGrid = grid as unknown as ResolvedLayoutGrid
  const rails = new Map<string, ResolvedLayoutRail>()
  for (const [axis, axisRails] of [['x', typedGrid.xRails], ['y', typedGrid.yRails]] as const) {
    for (const rail of axisRails) {
      if (!isRecord(rail) || !hasExactKeys(rail, ['id', 'axis', 'value'])
        || typeof rail.id !== 'string' || rail.id.length === 0
        || rail.axis !== axis || typeof rail.value !== 'number' || !Number.isFinite(rail.value)
        || rail.value < 0 || rail.value > 1 || rails.has(rail.id)) {
        return { ok: false, issues: [issue('레이아웃 Rail 구조, 축, 값 또는 ID가 올바르지 않습니다.', isRecord(rail) && typeof rail.id === 'string' ? rail.id : undefined)] }
      }
      rails.set(rail.id, rail as unknown as ResolvedLayoutRail)
    }
  }
  return { ok: true, grid: typedGrid, rails }
}

function validateBinding(
  binding: unknown,
  layoutType: SharedLayoutType,
  gridId: string,
  topology: LayoutGridTopology,
): binding is LayoutGridBinding {
  if (!isRecord(binding) || !hasExactKeys(binding, [
    'schema', 'version', 'id', 'layoutType', 'layoutGridId', 'splitRailIds', 'partEdgeRailIds',
  ])) return false
  if (binding.schema !== 'layout-grid-binding' || binding.version !== 1
    || typeof binding.id !== 'string' || binding.id.length === 0
    || binding.layoutType !== layoutType || binding.layoutGridId !== gridId
    || !isRecord(binding.splitRailIds) || !isRecord(binding.partEdgeRailIds)) return false

  const expectedSplitIds = topology.splits.map((split) => split.id).sort()
  if (!sameOrderedValues(Object.keys(binding.splitRailIds).sort(), expectedSplitIds)) return false
  if (Object.values(binding.splitRailIds).some((railId) => typeof railId !== 'string' || railId.length === 0)) return false

  const expectedParts = [...topology.slots].sort()
  if (!sameOrderedValues(Object.keys(binding.partEdgeRailIds).sort(), expectedParts)) return false
  for (const part of topology.slots) {
    const edges = binding.partEdgeRailIds[part]
    if (!isRecord(edges) || !hasExactKeys(edges, EDGE_ORDER)
      || EDGE_ORDER.some((edge) => typeof edges[edge] !== 'string' || edges[edge].length === 0)) return false
  }
  return true
}

function resolveRail(
  rails: Map<string, ResolvedLayoutRail>,
  railId: string,
  expectedAxis: Axis,
  context: Omit<LayoutGridProjectionIssue, 'code' | 'message'>,
): { ok: true; rail: ResolvedLayoutRail } | { ok: false; issue: LayoutGridProjectionIssue } {
  const rail = rails.get(railId)
  if (!rail) {
    return { ok: false, issue: { code: 'missing-rail', message: '바인딩이 가리키는 Rail이 없습니다.', ...context, railId } }
  }
  if (rail.axis !== expectedAxis) {
    return { ok: false, issue: { code: 'cross-axis-rail', message: '바인딩 Rail의 축이 맞지 않습니다.', ...context, railId } }
  }
  return { ok: true, rail }
}

function boxesMatch(actual: Partial<Record<Part, BoxConfig>>, expected: Partial<Record<Part, BoxConfig>>, parts: readonly Part[]): boolean {
  return parts.every((part) => {
    const left = actual[part]
    const right = expected[part]
    return left !== undefined && right !== undefined
      && Math.abs(left.x - right.x) <= EPSILON
      && Math.abs(left.y - right.y) <= EPSILON
      && Math.abs(left.width - right.width) <= EPSILON
      && Math.abs(left.height - right.height) <= EPSILON
  })
}

export function resolveGridBoundSchema(input: {
  schema: Readonly<LayoutSchema>
  grid: Readonly<ResolvedLayoutGrid>
  binding: Readonly<LayoutGridBinding>
}): LayoutGridProjectionResult {
  const identified = identifyLegacySharedSplits(input?.schema)
  if (!identified.ok) return identified
  const layoutType = identified.projection.schema.id
  if (!isSharedLayoutType(layoutType)) return fail([{ code: 'unsupported-layout', message: '공통 레이아웃 대상이 아닙니다.', layoutType }])
  const topology = LAYOUT_GRID_TOPOLOGIES[layoutType]
  const gridResult = validateGrid(input?.grid, layoutType)
  if (!gridResult.ok) return gridResult
  if (!validateBinding(input?.binding, layoutType, gridResult.grid.id, topology)) {
    return fail([{ code: 'invalid-binding', message: '레이아웃 바인딩 구조 또는 소유권이 올바르지 않습니다.', layoutType }])
  }

  const issues: LayoutGridProjectionIssue[] = []
  const splits: StableLayoutSplit[] = []
  for (const spec of topology.splits) {
    const railId = input.binding.splitRailIds[spec.id]
    const resolved = resolveRail(gridResult.rails, railId, spec.axis, { layoutType, splitId: spec.id })
    if (!resolved.ok) issues.push(resolved.issue)
    else splits.push({ id: spec.id, axis: spec.axis, value: resolved.rail.value })
  }

  const expectedBoxes: Partial<Record<Part, BoxConfig>> = {}
  for (const part of topology.slots) {
    const edgeIds = input.binding.partEdgeRailIds[part]
    if (!edgeIds) continue
    const values: Partial<Record<keyof LayoutPartEdgeRailIds, number>> = {}
    for (const edge of EDGE_ORDER) {
      const axis: Axis = edge === 'left' || edge === 'right' ? 'x' : 'y'
      const resolved = resolveRail(gridResult.rails, edgeIds[edge], axis, { layoutType, part, edge })
      if (!resolved.ok) issues.push(resolved.issue)
      else values[edge] = resolved.rail.value
    }
    if (EDGE_ORDER.every((edge) => values[edge] !== undefined)) {
      if (values.left! >= values.right! || values.top! >= values.bottom!) {
        issues.push({ code: 'invalid-edge-order', message: '파트 경계 Rail 순서가 뒤집히거나 폭이 0입니다.', layoutType, part })
      } else {
        expectedBoxes[part] = {
          x: values.left!,
          y: values.top!,
          width: values.right! - values.left!,
          height: values.bottom! - values.top!,
        }
      }
    }
  }
  if (issues.length > 0) return fail(issues)

  const allBoxes = topology.slots.map((part) => expectedBoxes[part]!)
  const left = Math.min(...allBoxes.map((box) => box.x))
  const right = Math.max(...allBoxes.map((box) => box.x + box.width))
  const top = Math.min(...allBoxes.map((box) => box.y))
  const bottom = Math.max(...allBoxes.map((box) => box.y + box.height))

  const result = structuredClone(input.schema) as LayoutSchema
  if (splits.length > 0 || hasOwn(input.schema, 'splits')) {
    result.splits = splits.map(({ axis, value }) => ({ axis, value }))
  } else delete result.splits
  const derivedPadding = { left, right: 1 - right, top, bottom: 1 - bottom }
  const sourcePadding = input.schema.padding
  if (!input.schema.designBodyPadding) {
    result.padding = sourcePadding
      && Math.abs(sourcePadding.left - derivedPadding.left) <= EPSILON
      && Math.abs(sourcePadding.right - derivedPadding.right) <= EPSILON
      && Math.abs(sourcePadding.top - derivedPadding.top) <= EPSILON
      && Math.abs(sourcePadding.bottom - derivedPadding.bottom) <= EPSILON
      ? structuredClone(sourcePadding)
      : derivedPadding
  }

  const calculationSchema = input.schema.designBodyPadding
    ? { ...result, padding: DESIGN_BODY_BASE_PADDING, designBodyPadding: undefined }
    : result
  const calculated = calculateRawBoxes(calculationSchema)
  if (!boxesMatch(calculated, expectedBoxes, topology.slots)) {
    return fail([{ code: 'split-edge-conflict', message: '분할선과 파트 경계 Rail이 서로 다른 슬롯을 만듭니다.', layoutType }])
  }
  return { ok: true, projection: { schema: result, stableSplits: splits } }
}

export function resolveAllGridBoundSchemas(input: {
  schemas: Readonly<Record<LayoutType, LayoutSchema>>
  grid: Readonly<ResolvedLayoutGrid>
  bindings: Readonly<Record<SharedLayoutType, LayoutGridBinding>>
}): AllLayoutGridProjectionResult {
  if (!isRecord(input?.schemas) || !isRecord(input?.bindings)) {
    return { ok: false, issues: [{ code: 'invalid-schema', message: '레이아웃 일괄 입력 구조가 올바르지 않습니다.' }] }
  }
  const expectedBindings = [...SHARED_LAYOUT_TYPES].sort()
  if (!sameOrderedValues(Object.keys(input.bindings).sort(), expectedBindings)) {
    return { ok: false, issues: [{ code: 'invalid-binding', message: '공통 레이아웃 7종 바인딩이 모두 필요합니다.' }] }
  }

  const result = structuredClone(input.schemas) as Record<LayoutType, LayoutSchema>
  const stableSplits = {} as Record<SharedLayoutType, StableLayoutSplit[]>
  const issues: LayoutGridProjectionIssue[] = []
  for (const layoutType of SHARED_LAYOUT_TYPES) {
    const schema = input.schemas[layoutType]
    const binding = input.bindings[layoutType]
    const resolved = resolveGridBoundSchema({ schema, grid: input.grid, binding })
    if (!resolved.ok) issues.push(...resolved.issues)
    else {
      result[layoutType] = resolved.projection.schema
      stableSplits[layoutType] = resolved.projection.stableSplits
    }
  }
  if (issues.length > 0) return { ok: false, issues }

  const schemaKeys = Object.keys(input.schemas).sort()
  const allLayoutTypes: LayoutType[] = [
    'choseong-only',
    'jungseong-vertical-only',
    'jungseong-horizontal-only',
    'jungseong-mixed-only',
    'choseong-jungseong-vertical',
    'choseong-jungseong-horizontal',
    'choseong-jungseong-mixed',
    'choseong-jungseong-vertical-jongseong',
    'choseong-jungseong-horizontal-jongseong',
    'choseong-jungseong-mixed-jongseong',
  ]
  if (!sameOrderedValues(schemaKeys, [...allLayoutTypes].sort())) {
    return { ok: false, issues: [{ code: 'invalid-schema', message: '레이아웃 스키마 10종이 모두 필요합니다.' }] }
  }
  return { ok: true, schemas: result, stableSplits }
}

export function isLayoutGridSharedLayoutType(layoutType: LayoutType): layoutType is SharedLayoutType {
  return isSharedLayoutType(layoutType)
}

export function listLayoutGridBindingParts(binding: LayoutGridBinding): Part[] {
  return PARTS.filter((part) => binding.partEdgeRailIds[part] !== undefined)
}
