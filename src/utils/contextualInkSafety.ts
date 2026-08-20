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

/** 공유 자모 목표를 각 완성 글자의 실제 잉크 여유만큼 적용한다. */
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
