import type {
  Axis,
  BoxConfig,
  DeepReadonly,
  LayoutGridBinding,
  LayoutGridSourceRailV1,
  LayoutGridSystemSourceV1,
  LayoutPartEdgeRailIds,
  LayoutSchema,
  LayoutType,
  Part,
  ShapeSystemSourceV2,
  SourceCommandTransaction,
  ValidatedLayoutGridSystemSourceV1,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { SHARED_LAYOUT_TYPES, type SharedLayoutType } from '../types'
import { calculateRawBoxes } from '../utils/layoutCalculator'
import { parseLayoutGridSystemSourceV1, createLayoutGridBindingId } from './layoutGridSystemSourceV1'
import { LAYOUT_GRID_SLOT_PARTS, identifyLegacySharedSplits } from './layoutGridProjection'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

type LayoutGridConnectionError =
  | 'invalid-command'
  | 'invalid-source'
  | 'already-connected'
  | 'invalid-schema'
  | 'invalid-result'

export type LayoutGridConnectionResult =
  | { ok: true; source: ValidatedShapeSystemSourceV2; transaction: SourceCommandTransaction<ShapeSystemSourceV2> }
  | { ok: false; error: { code: LayoutGridConnectionError; message: string } }

function fail(code: LayoutGridConnectionError, message: string): LayoutGridConnectionResult {
  return { ok: false, error: { code, message } }
}

function coordinateKey(value: number): string {
  return value.toFixed(12)
}

function edgeValues(box: BoxConfig): Record<keyof LayoutPartEdgeRailIds, number> {
  return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height }
}

/**
 * 사용자가 명시적으로 공통 grid 연결을 선택했을 때만 기존 7개 schema를
 * 의미 Rail/binding 원본으로 올린다. 해석 좌표는 저장하지 않는다.
 */
export function createLayoutGridSystemFromSchemas(
  schemas: DeepReadonly<Record<LayoutType, LayoutSchema>>,
): { ok: true; source: ValidatedLayoutGridSystemSourceV1 } | { ok: false; message: string } {
  const inputSchemas = structuredClone(schemas) as Record<LayoutType, LayoutSchema>
  const values: Record<Axis, Map<string, number>> = { x: new Map(), y: new Map() }
  const boxesByLayout = new Map<SharedLayoutType, Partial<Record<Part, BoxConfig>>>()
  const splitsByLayout = new Map<SharedLayoutType, { id: string; axis: Axis; value: number }[]>()
  const addValue = (axis: Axis, value: number) => values[axis].set(coordinateKey(value), value)

  for (const layoutType of SHARED_LAYOUT_TYPES) {
    const schema = inputSchemas?.[layoutType]
    if (!schema) return { ok: false, message: `${layoutType} 기존 schema가 없습니다.` }
    const identified = identifyLegacySharedSplits(schema)
    if (!identified.ok) return { ok: false, message: identified.issues[0]?.message ?? `${layoutType} 분할선을 해석할 수 없습니다.` }
    const boxes = calculateRawBoxes(schema)
    for (const part of LAYOUT_GRID_SLOT_PARTS[layoutType]) {
      const box = boxes[part]
      if (!box) return { ok: false, message: `${layoutType}/${part} slot을 해석할 수 없습니다.` }
      const edges = edgeValues(box)
      addValue('x', edges.left)
      addValue('x', edges.right)
      addValue('y', edges.top)
      addValue('y', edges.bottom)
    }
    for (const split of identified.projection.stableSplits) addValue(split.axis, split.value)
    boxesByLayout.set(layoutType, boxes)
    splitsByLayout.set(layoutType, identified.projection.stableSplits)
  }

  const axisValues: Record<Axis, number[]> = {
    x: [...values.x.values()].sort((left, right) => left - right),
    y: [...values.y.values()].sort((left, right) => left - right),
  }
  const positiveGaps = (['x', 'y'] as const).flatMap((axis) => axisValues[axis]
    .slice(1).map((value, index) => value - axisValues[axis][index]).filter((gap) => gap > 1e-12))
  const minGap = Math.min(...positiveGaps) / 2
  if (!Number.isFinite(minGap) || minGap <= 0) return { ok: false, message: '공통 layout Rail 간격을 결정할 수 없습니다.' }
  const gridId = 'layout-grid:legacy-connected-v1'
  const rails = (axis: Axis): LayoutGridSourceRailV1[] => axisValues[axis].map((value, index) => ({
    id: `${gridId}:${axis}:${index}`,
    axis,
    position: { kind: 'absolute', value },
  }))
  const railId = (axis: Axis, value: number): string => {
    const index = axisValues[axis].findIndex((candidate) => coordinateKey(candidate) === coordinateKey(value))
    if (index < 0) throw new Error(`${axis}/${value} Rail을 찾을 수 없습니다.`)
    return `${gridId}:${axis}:${index}`
  }
  try {
    const bindings = Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => {
      const boxes = boxesByLayout.get(layoutType)!
      const splits = splitsByLayout.get(layoutType)!
      const partEdgeRailIds = Object.fromEntries(LAYOUT_GRID_SLOT_PARTS[layoutType].map((part) => {
        const edges = edgeValues(boxes[part]!)
        return [part, {
          left: railId('x', edges.left), right: railId('x', edges.right),
          top: railId('y', edges.top), bottom: railId('y', edges.bottom),
        } satisfies LayoutPartEdgeRailIds]
      })) as Partial<Record<Part, LayoutPartEdgeRailIds>>
      return [layoutType, {
        schema: 'layout-grid-binding', version: 1, id: createLayoutGridBindingId(layoutType),
        layoutType, layoutGridId: gridId,
        splitRailIds: Object.fromEntries(splits.map((split) => [split.id, railId(split.axis, split.value)])),
        partEdgeRailIds,
      } satisfies LayoutGridBinding]
    })) as Record<SharedLayoutType, LayoutGridBinding>
    const parsed = parseLayoutGridSystemSourceV1({
      schema: 'layout-grid-system', version: 1,
      grid: { schema: 'layout-grid-source', version: 1, id: gridId, xRails: rails('x'), yRails: rails('y'), snapStep: 0.005, minGap },
      bindings,
    } satisfies LayoutGridSystemSourceV1)
    return parsed.ok
      ? { ok: true, source: parsed.source }
      : { ok: false, message: parsed.issues[0]?.message ?? '공통 layout grid 원본이 유효하지 않습니다.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '공통 layout grid 원본을 만들 수 없습니다.' }
  }
}

export function connectLayoutGridFromSchemasV1(input: {
  source: unknown
  transactionId: string
  schemas: DeepReadonly<Record<LayoutType, LayoutSchema>>
}): LayoutGridConnectionResult {
  if (!input || typeof input !== 'object' || typeof input.transactionId !== 'string' || input.transactionId.trim() === '') {
    return fail('invalid-command', '공통 layout grid 연결 명령이 유효하지 않습니다.')
  }
  const parsed = parseShapeSystemSourceV2(input.source)
  if (!parsed.ok) return fail('invalid-source', '현재 Shape System source가 strict 계약을 통과하지 못했습니다.')
  if (parsed.source.layoutGridSystem) return fail('already-connected', '공통 layout grid가 이미 연결되어 있습니다.')
  const grid = createLayoutGridSystemFromSchemas(input.schemas)
  if (!grid.ok) return fail('invalid-schema', grid.message)
  const before = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const next = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  next.layoutGridSystem = structuredClone(grid.source) as unknown as LayoutGridSystemSourceV1
  const final = parseShapeSystemSourceV2(next)
  if (!final.ok) return fail('invalid-result', `공통 layout grid 연결 결과가 유효하지 않습니다: ${final.issues.map(({ code }) => code).join(', ')}`)
  return {
    ok: true,
    source: final.source,
    transaction: { id: input.transactionId, kind: 'master-grid', command: 'connect-layout-grid', before, after: structuredClone(final.source) as unknown as ShapeSystemSourceV2 },
  }
}
