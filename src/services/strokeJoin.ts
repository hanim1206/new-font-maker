import type { JamoData, StrokeDataV2, StrokeLinejoin, StrokeRenderStyle } from '../types'

/**
 * 꺾임 모양의 한 입구. 화면 SVG · 채운 윤곽 · OTF가 전부 여기서 종류와 뾰족 한계를 읽는다.
 * 종류(뾰족 `miter` · 깎음 `bevel` · 둥긂 `round`)는 획 > 전역, 뾰족 한계는 전역 하나다. 둥긂은 손잡이 없이 꼭짓점 중심 반폭 원호.
 */

/** 뾰족 한계 기본값 — 꺾임점에서 이음 끝까지가 반폭의 이 배수를 넘으면 평평하게 깎는다. 안쪽 각 75도. */
export const DEFAULT_MITER_LIMIT = 1.64
/** 뾰족 한계를 안쪽 각(도)으로 고를 때의 범위. 30도(= 한계 3.86) ~ 150도(= 한계 1.04). */
export const MITER_ANGLE_RANGE = { min: 30, max: 150, default: 75 } as const
const MITER_LIMIT_RANGE = { min: 1, max: 4 } as const

export interface EffectiveJoin { linejoin: StrokeLinejoin; miterLimit: number }

function clampLimit(value: number): number {
  return Math.max(MITER_LIMIT_RANGE.min, Math.min(MITER_LIMIT_RANGE.max, value))
}

/** 전역 스타일의 뾰족 한계. 둥근 붓촉의 brush 모드에서만 뜻이 있고, 그 밖에는 기본값. */
export function miterLimitOf(style: Pick<StrokeRenderStyle, 'mode'> & { miterLimit?: number } | StrokeRenderStyle | undefined): number {
  if (!style || style.mode !== 'brush') return DEFAULT_MITER_LIMIT
  const value = (style as { miterLimit?: number }).miterLimit
  return value !== undefined && Number.isFinite(value) ? clampLimit(value) : DEFAULT_MITER_LIMIT
}

/** 뾰족 한계 ↔ 안쪽 각. 한계 L인 뾰족 이음은 안쪽 각이 2·asin(1/L)보다 좁으면 깎인다. */
export function miterAngleOf(limit: number): number {
  return Math.round(2 * Math.asin(1 / clampLimit(limit)) * 180 / Math.PI)
}
export function miterLimitOfAngle(degrees: number): number {
  const angle = Math.max(MITER_ANGLE_RANGE.min, Math.min(MITER_ANGLE_RANGE.max, degrees))
  return Math.round(1 / Math.sin(angle / 2 * Math.PI / 180) * 1000) / 1000
}

/** 획의 실효 꺾임. 획별 값 > 전역 값 > 뾰족. */
export function effectiveJoinOf(
  stroke: Pick<StrokeDataV2, 'linejoin'> | undefined,
  global: { linejoin?: StrokeLinejoin; strokeStyle?: StrokeRenderStyle } | undefined,
): EffectiveJoin {
  return { linejoin: stroke?.linejoin ?? global?.linejoin ?? 'miter', miterLimit: miterLimitOf(global?.strokeStyle) }
}

/** 뾰족 이음이 한계 안인가 — 꺾임점에서 교점까지의 거리와 반폭으로. 세 그리기 길이 같은 식을 쓴다. */
export function miterWithinLimit(cornerToIntersection: number, halfWidth: number, miterLimit: number): boolean {
  return cornerToIntersection <= halfWidth * miterLimit
}

type JamoStrokeSets = Pick<JamoData, 'strokes' | 'horizontalStrokes' | 'verticalStrokes' | 'contextStrokes'>

function strokeListsOf(jamo: JamoStrokeSets): StrokeDataV2[][] {
  return [jamo.strokes ?? [], jamo.horizontalStrokes ?? [], jamo.verticalStrokes ?? [], ...Object.values(jamo.contextStrokes ?? {}).map((list) => list ?? [])]
}

/** 자소 안에서 꺾임을 따로 정한(획별 `linejoin`이 있는) 획 수. 전역 패널의 "획 N개는 따로 정해져 있어요"가 센다. */
export function countOwnJoins(jamo: JamoStrokeSets): number {
  return strokeListsOf(jamo).reduce((sum, list) => sum + list.filter((stroke) => stroke.linejoin !== undefined).length, 0)
}

/** 획별 꺾임을 전부 지운 자소(`풀기`). 지울 것이 없으면 같은 객체를 돌려준다. */
export function withoutOwnJoins<T extends JamoStrokeSets>(jamo: T): T {
  if (countOwnJoins(jamo) === 0) return jamo
  const strip = (list: StrokeDataV2[] | undefined) => list?.map((stroke) => {
    if (stroke.linejoin === undefined) return stroke
    const { linejoin: _dropped, ...rest } = stroke
    void _dropped
    return rest as StrokeDataV2
  })
  const next = { ...jamo }
  if (jamo.strokes) next.strokes = strip(jamo.strokes)
  if (jamo.horizontalStrokes) next.horizontalStrokes = strip(jamo.horizontalStrokes)
  if (jamo.verticalStrokes) next.verticalStrokes = strip(jamo.verticalStrokes)
  if (jamo.contextStrokes) next.contextStrokes = Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, list]) => [family, strip(list)])) as T['contextStrokes']
  return next
}
