import type { DecomposedSyllable, JamoData, LayoutSchema, MobileEditorPart } from '../src/types'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { getMinimumInterComponentInkGap } from './inkGapGuard'

const EPSILON = 0.000001

export interface CalibrationInkGapContext {
  id: string
  char: string
  syllable: DecomposedSyllable
  schema: LayoutSchema
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
    const boxes = calculateBoxes(context.schema, contextFor(candidateSyllable))
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
