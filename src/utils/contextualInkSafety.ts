import type {
  AnchorPoint,
  BoxConfig,
  DecomposedSyllable,
  JamoData,
  JamoInkSafetyOrigin,
  MobileEditorPart,
  Part,
  StrokeDataV2,
} from '../types'
import { findMaximumSafeEditFactor, getMinimumInterComponentInkGap } from './inkGapGuard'

const EPSILON = 0.000001

function copyOrigin(jamo: JamoData): JamoInkSafetyOrigin {
  return {
    strokes: jamo.strokes ? structuredClone(jamo.strokes) : undefined,
    horizontalStrokes: jamo.horizontalStrokes ? structuredClone(jamo.horizontalStrokes) : undefined,
    verticalStrokes: jamo.verticalStrokes ? structuredClone(jamo.verticalStrokes) : undefined,
  }
}

function sameTopology(origin?: StrokeDataV2[], target?: StrokeDataV2[]): boolean {
  if (!origin || !target) return origin === target
  if (origin.length !== target.length) return false
  return origin.every((stroke, index) => (
    stroke.id === target[index]?.id
    && stroke.points.length === target[index].points.length
  ))
}

export function hasCompatibleInkTopology(origin: JamoInkSafetyOrigin, target: JamoData): boolean {
  return sameTopology(origin.strokes, target.strokes)
    && sameTopology(origin.horizontalStrokes, target.horizontalStrokes)
    && sameTopology(origin.verticalStrokes, target.verticalStrokes)
}

/** 첫 보정 전 형태를 한 번만 보존하고 현재 자모를 문맥별 안전 적용의 공통 목표로 만든다. */
export function withContextualInkSafety(
  storedBefore: JamoData,
  visibleBefore: JamoData,
  target: JamoData,
  minimumGap: number,
): JamoData {
  const origin = storedBefore.contextualInkSafety?.origin ?? copyOrigin(visibleBefore)
  if (!hasCompatibleInkTopology(origin, target)) {
    const withoutSafety = { ...target }
    delete withoutSafety.contextualInkSafety
    return withoutSafety
  }
  return {
    ...target,
    contextualInkSafety: { origin, minimumGap },
  }
}

const SHAPE_EPSILON = 0.0001

/** 점 · 손잡이가 모두 같은 만큼 옮겨졌는지(획을 통째로 민 것). 하나라도 다르게 움직였으면 모양을 고친 것이다. */
function movedRigidly(origin: StrokeDataV2, target: StrokeDataV2): boolean {
  const first = target.points[0]
  const start = origin.points[0]
  if (!first || !start) return true
  const dx = first.x - start.x
  const dy = first.y - start.y
  const same = (from: { x: number; y: number } | undefined, to: { x: number; y: number } | undefined) => (
    !from && !to ? true
      : !from || !to ? false
        : Math.abs(to.x - from.x - dx) <= SHAPE_EPSILON && Math.abs(to.y - from.y - dy) <= SHAPE_EPSILON
  )
  return target.points.every((point, index) => {
    const before = origin.points[index]
    return same(before, point) && same(before.handleIn, point.handleIn) && same(before.handleOut, point.handleOut)
  })
}

function reshapedStrokes(origin: StrokeDataV2[] | undefined, target: StrokeDataV2[] | undefined): boolean {
  if (!origin || !target) return false
  return target.some((stroke, index) => !movedRigidly(origin[index], stroke))
}

/**
 * 획 모양(점 · 곡선)을 고쳤는지. 고친 모양은 사용자가 그린 대로 둔다 — 되당기면 휜 획이 글자마다 펴져
 * 편집기에서 본 모양과 검수 · 추출이 달라진다(10-13 사용자: 휜 그대로). 통째로 옮기기 · 굵기만 되당긴다.
 */
export function hasReshapedInk(origin: JamoInkSafetyOrigin, target: JamoData): boolean {
  return reshapedStrokes(origin.strokes, target.strokes)
    || reshapedStrokes(origin.horizontalStrokes, target.horizontalStrokes)
    || reshapedStrokes(origin.verticalStrokes, target.verticalStrokes)
}

function interpolateNumber(origin: number, target: number, factor: number): number {
  return origin + (target - origin) * factor
}

function interpolateHandle(
  origin: AnchorPoint['handleIn'],
  target: AnchorPoint['handleIn'],
  factor: number,
): AnchorPoint['handleIn'] {
  if (!origin || !target) return target
  return {
    x: interpolateNumber(origin.x, target.x, factor),
    y: interpolateNumber(origin.y, target.y, factor),
  }
}

function interpolatePoint(origin: AnchorPoint, target: AnchorPoint, factor: number): AnchorPoint {
  return {
    x: interpolateNumber(origin.x, target.x, factor),
    y: interpolateNumber(origin.y, target.y, factor),
    ...(target.handleIn && { handleIn: interpolateHandle(origin.handleIn, target.handleIn, factor) }),
    ...(target.handleOut && { handleOut: interpolateHandle(origin.handleOut, target.handleOut, factor) }),
  }
}

function interpolateStrokes(origin: StrokeDataV2[] | undefined, target: StrokeDataV2[] | undefined, factor: number): StrokeDataV2[] | undefined {
  if (!origin || !target || !sameTopology(origin, target)) return target
  return target.map((stroke, strokeIndex) => ({
    ...stroke,
    thickness: interpolateNumber(origin[strokeIndex].thickness, stroke.thickness, factor),
    points: stroke.points.map((point, pointIndex) => interpolatePoint(origin[strokeIndex].points[pointIndex], point, factor)),
  }))
}

export function interpolateJamoInk(origin: JamoInkSafetyOrigin, target: JamoData, factor: number): JamoData {
  const base = { ...target }
  delete base.contextualInkSafety
  return {
    ...base,
    strokes: interpolateStrokes(origin.strokes, target.strokes, factor),
    horizontalStrokes: interpolateStrokes(origin.horizontalStrokes, target.horizontalStrokes, factor),
    verticalStrokes: interpolateStrokes(origin.verticalStrokes, target.verticalStrokes, factor),
  }
}

function replacePart(syllable: DecomposedSyllable, part: MobileEditorPart, jamo: JamoData): DecomposedSyllable {
  if (part === 'CH') return { ...syllable, choseong: jamo }
  if (part === 'JU') return { ...syllable, jungseong: jamo }
  return { ...syllable, jongseong: jamo }
}

function jamoForPart(syllable: DecomposedSyllable, part: MobileEditorPart): JamoData | null {
  if (part === 'CH') return syllable.choseong
  if (part === 'JU') return syllable.jungseong
  return syllable.jongseong
}

export interface ContextualInkSafetyResult {
  syllable: DecomposedSyllable
  limitedParts: MobileEditorPart[]
}

/** 공유 자모 목표를 각 완성 글자의 실제 잉크 여유만큼 적용한다. 획 모양을 고친 자모는 되당기지 않는다(`hasReshapedInk`). */
export function resolveSyllableContextualInkSafety(
  syllable: DecomposedSyllable,
  boxes: Partial<Record<Part, BoxConfig>>,
): ContextualInkSafetyResult {
  let resolved = syllable
  const limitedParts: MobileEditorPart[] = []

  for (const part of ['CH', 'JU', 'JO'] as const) {
    const target = jamoForPart(resolved, part)
    const safety = target?.contextualInkSafety
    if (!target || !safety || !hasCompatibleInkTopology(safety.origin, target)) continue
    if (hasReshapedInk(safety.origin, target)) continue

    const baselineJamo = interpolateJamoInk(safety.origin, target, 0)
    const baselineSyllable = replacePart(resolved, part, baselineJamo)
    const baselineGap = getMinimumInterComponentInkGap(baselineSyllable, boxes, part)
    const requiredGap = Math.min(baselineGap, safety.minimumGap)
    const factor = findMaximumSafeEditFactor((candidateFactor) => {
      const candidate = interpolateJamoInk(safety.origin, target, candidateFactor)
      const candidateSyllable = replacePart(resolved, part, candidate)
      return getMinimumInterComponentInkGap(candidateSyllable, boxes, part) + EPSILON >= requiredGap
    })
    resolved = replacePart(resolved, part, interpolateJamoInk(safety.origin, target, factor))
    if (factor < 0.9999) limitedParts.push(part)
  }

  return { syllable: resolved, limitedParts }
}
