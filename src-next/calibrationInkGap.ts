import type { BoxConfig, DecomposedSyllable, JamoData, LayoutSchema, MobileEditorPart, Part } from '../src/types'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { getMinimumInterComponentInkGap } from './inkGapGuard'

const EPSILON = 0.000001

export interface CalibrationInkGapContext {
  id: string
  char: string
  syllable: DecomposedSyllable
  schema: LayoutSchema
  /**
   * 화면이 이 글자를 놓는 상자(모델 상자 + 레이아웃 Δ + 기준 틀). 주면 옛 스키마 상자 대신 이걸로 잰다 — 재는 배치가 보이는 배치와 같아야 멈춤이 맞다.
   * 자소 맞춤(잉크를 재서 다듬기)이 들어 있어 비싸므로 그 자모가 든 글자에서만, 끌기 한 번에 한 번만 부른다.
   */
  boxesOf?: (syllable: DecomposedSyllable) => Partial<Record<Part, BoxConfig>>
}

export interface CalibrationInkGapViolation {
  id: string
  char: string
}

function contextFor(syllable: DecomposedSyllable) {
  return {
    cho: syllable.choseong?.char ?? '',
    jung: syllable.jungseong?.char ?? '',
    jong: syllable.jongseong?.char ?? '',
  }
}

function jamoForType(syllable: DecomposedSyllable, type: JamoData['type']): JamoData | null {
  if (type === 'choseong') return syllable.choseong
  if (type === 'jungseong') return syllable.jungseong
  return syllable.jongseong
}

function withCandidateJamo(syllable: DecomposedSyllable, candidate: JamoData): DecomposedSyllable {
  if (candidate.type === 'choseong') return { ...syllable, choseong: candidate }
  if (candidate.type === 'jungseong') return { ...syllable, jungseong: candidate }
  return { ...syllable, jongseong: candidate }
}

// 끌기 한 번(= baseline 객체 하나) 동안 글자별 화면 상자를 기억한다. 고치는 자모에는 기준 틀이 굳어 있어 끄는 동안 상자가 안 바뀐다.
const screenBoxCache = new WeakMap<JamoData, Map<string, Partial<Record<Part, BoxConfig>>>>()
function screenBoxesOf(context: CalibrationInkGapContext, candidateSyllable: DecomposedSyllable, baseline: JamoData): Partial<Record<Part, BoxConfig>> | null {
  if (!context.boxesOf) return null
  let perContext = screenBoxCache.get(baseline)
  if (!perContext) { perContext = new Map(); screenBoxCache.set(baseline, perContext) }
  let boxes = perContext.get(context.id)
  if (!boxes) { boxes = context.boxesOf(candidateSyllable); perContext.set(context.id, boxes) }
  return boxes
}

function worsensInkGap(candidateGap: number, baselineGap: number, minimumGap: number): boolean {
  return candidateGap + EPSILON < Math.min(baselineGap, minimumGap)
}

/** 같은 자모 마스터가 전파되는 보정 문장 문맥 중 첫 간격 위반을 찾는다. */
export function findJamoInkGapViolation(
  contexts: CalibrationInkGapContext[],
  candidate: JamoData,
  baseline: JamoData,
  activePart: MobileEditorPart,
  minimumGap: number,
): CalibrationInkGapViolation | null {
  for (const context of contexts) {
    if (jamoForType(context.syllable, candidate.type)?.char !== candidate.char) continue
    const candidateSyllable = withCandidateJamo(context.syllable, candidate)
    const baselineSyllable = withCandidateJamo(context.syllable, baseline)
    const boxes = screenBoxesOf(context, candidateSyllable, baseline) ?? calculateBoxes(context.schema, contextFor(candidateSyllable))
    const candidateGap = getMinimumInterComponentInkGap(candidateSyllable, boxes, activePart)
    const baselineGap = getMinimumInterComponentInkGap(baselineSyllable, boxes, activePart)
    if (worsensInkGap(candidateGap, baselineGap, minimumGap)) {
      return { id: context.id, char: context.char }
    }
  }
  return null
}

/** 같은 레이아웃 프로필이 전파되는 보정 문장 문맥 중 첫 간격 위반을 찾는다. */
export function findLayoutInkGapViolation(
  contexts: CalibrationInkGapContext[],
  candidate: LayoutSchema,
  baseline: LayoutSchema,
  activePart: MobileEditorPart,
  minimumGap: number,
): CalibrationInkGapViolation | null {
  for (const context of contexts) {
    if (context.syllable.layoutType !== candidate.id) continue
    const syllableContext = contextFor(context.syllable)
    const candidateBoxes = calculateBoxes(candidate, syllableContext)
    const baselineBoxes = calculateBoxes(baseline, syllableContext)
    const candidateGap = getMinimumInterComponentInkGap(context.syllable, candidateBoxes, activePart)
    const baselineGap = getMinimumInterComponentInkGap(context.syllable, baselineBoxes, activePart)
    if (worsensInkGap(candidateGap, baselineGap, minimumGap)) {
      return { id: context.id, char: context.char }
    }
  }
  return null
}
