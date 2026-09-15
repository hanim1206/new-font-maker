import rawInitialSource from '../reference-data/font-guide-calibrations/noto-sans-kr.initial-component-g0.v2.json' with { type: 'json' }
import rawFinalSource from '../reference-data/font-guide-calibrations/noto-sans-kr.final-component-g0.v1.json' with { type: 'json' }
import rawFinalEvaluation from '../reference-data/font-guide-calibrations/noto-sans-kr.final-component-g0.evaluation.v1.json' with { type: 'json' }
import { CHOSEONG_LIST, HORIZONTAL_JUNGSEONG, JUNGSEONG_LIST, MIXED_JUNGSEONG } from '../src/data/Hangul'
import {
  parseFinalComponentCandidateResponse,
  type FinalComponentCandidateCase,
  type FinalJamo,
} from './finalComponentCandidateModel'
import {
  parseInitialComponentCandidateResponse,
  type InitialComponentCandidateCase,
  type InitialComponentContextId,
} from './initialComponentCandidateModel'
import {
  PRESET_SOURCE_CASE_BY_CHARACTER,
  PRESET_SOURCE_MANIFEST,
  type PresetSourceCase,
} from './presetCandidateSource'

export type PresetCompositionStructure = 'right' | 'bottom' | 'mixed'
export type PresetCompositionProjection = 'exact-reference-context' | 'structure-context-projection'
export type PresetCompositionGate = 'ready-for-layout-fit' | 'blocked-final-visual-review'

export interface PresetCompositionTarget {
  character: string
  initialJamo: (typeof CHOSEONG_LIST)[number]
  medialJamo: (typeof JUNGSEONG_LIST)[number]
  finalJamo: null | FinalJamo
  structure: PresetCompositionStructure
  initial: {
    source: InitialComponentCandidateCase
    projection: PresetCompositionProjection
    reviewState: 'user-approved-analysis'
  }
  medial: {
    source: PresetSourceCase
    projection: PresetCompositionProjection
    reviewState: PresetSourceCase['reviewStatus']
  }
  final: null | {
    source: FinalComponentCandidateCase
    projection: PresetCompositionProjection
    reviewState: 'visual-review-required'
  }
  gate: PresetCompositionGate
  productionEligible: false
}

export const PRESET_COMPOSITION_INPUT_VERSION = 'joint-component-input-v1' as const
export const PRESET_COMPOSITION_FONT_SHA256 = '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252' as const
export const PRESET_COMPOSITION_STYLE = {
  linecap: 'square',
  linejoin: 'round',
  brushTip: 'round',
} as const

export const INVALIDATED_PRESET_REVISIONS = [
  { revision: 'r1', reason: '초성 입력을 ㄱ 한 행으로 축소함' },
  { revision: 'r2', reason: '오른쪽/아래 홀자 문맥축을 반대로 연결함' },
  { revision: 'r3', reason: '초성·홀자·종성을 공동 배치하지 않았고 외곽면과 중심선 구간을 섞어 비교함' },
] as const

export const PRESET_INITIAL_SOURCE = parseInitialComponentCandidateResponse(rawInitialSource)
export const PRESET_FINAL_SOURCE = parseFinalComponentCandidateResponse(rawFinalSource)
export const PRESET_FINAL_EVALUATION = (() => {
  if (rawFinalEvaluation.schema !== 'reference-final-component-g0-evaluation-v1'
    || rawFinalEvaluation.candidateArtifactSchema !== 'reference-final-component-candidate-response-v1'
    || rawFinalEvaluation.candidateLifecycle !== 'candidate'
    || rawFinalEvaluation.supportStatus !== 'candidate-only'
    || rawFinalEvaluation.structuralCheckStatus !== 'pass'
    || rawFinalEvaluation.visualReviewStatus !== 'pending'
    || rawFinalEvaluation.caseCount !== 81
    || rawFinalEvaluation.candidateCount !== 81
    || rawFinalEvaluation.globalIssues.length !== 0
    || rawFinalEvaluation.issues.length !== 0
    || rawFinalEvaluation.invalidatedFamilies.length !== 0) {
    throw new Error('종성 G0 구조 평가가 pass/pending 계약과 다릅니다.')
  }
  return rawFinalEvaluation
})()

function structureForMedial(medialJamo: string): PresetCompositionStructure {
  if ((HORIZONTAL_JUNGSEONG as readonly string[]).includes(medialJamo)) return 'bottom'
  if ((MIXED_JUNGSEONG as readonly string[]).includes(medialJamo)) return 'mixed'
  return 'right'
}

function representativeMedial(structure: PresetCompositionStructure): 'ㅏ' | 'ㅗ' | 'ㅘ' {
  if (structure === 'bottom') return 'ㅗ'
  if (structure === 'mixed') return 'ㅘ'
  return 'ㅏ'
}

function composeSyllable(initialJamo: string, medialJamo: string, finalJamo: null | string): string {
  const initialIndex = (CHOSEONG_LIST as readonly string[]).indexOf(initialJamo)
  const medialIndex = (JUNGSEONG_LIST as readonly string[]).indexOf(medialJamo)
  const finalIndex = finalJamo === null ? 0 : 1
  if (initialIndex < 0 || medialIndex < 0 || (finalJamo !== null && finalJamo !== 'ㄱ')) {
    throw new Error('프리셋 검수 보드는 무받침/ㄱ 조합만 생성합니다.')
  }
  return String.fromCodePoint(0xac00 + initialIndex * 588 + medialIndex * 28 + finalIndex)
}

function initialContextId(structure: PresetCompositionStructure, hasFinal: boolean): InitialComponentContextId {
  return `${structure}${hasFinal ? '-final' : ''}` as InitialComponentContextId
}

function requireInitialSource(
  initialJamo: PresetCompositionTarget['initialJamo'],
  structure: PresetCompositionStructure,
  hasFinal: boolean,
): InitialComponentCandidateCase {
  const contextId = initialContextId(structure, hasFinal)
  const source = PRESET_INITIAL_SOURCE.cases.find((candidate) => (
    candidate.initialJamo === initialJamo && candidate.contextId === contextId
  ))
  if (!source || source.status !== 'candidate') throw new Error(`${initialJamo}/${contextId} 초성 생성 입력이 없습니다.`)
  return source
}

function requireMedialSource(medialJamo: PresetCompositionTarget['medialJamo'], hasFinal: boolean): PresetSourceCase {
  const sourceCharacter = composeSyllable('ㄱ', medialJamo, hasFinal ? 'ㄱ' : null)
  const source = PRESET_SOURCE_CASE_BY_CHARACTER.get(sourceCharacter)
  if (!source) throw new Error(`${sourceCharacter} 홀자 생성 입력이 없습니다.`)
  return source
}

function requireFinalSource(finalJamo: FinalJamo, structure: PresetCompositionStructure): FinalComponentCandidateCase {
  const source = PRESET_FINAL_SOURCE.cases.find((candidate) => (
    candidate.identity.finalJamo === finalJamo
    && candidate.identity.medialJamo === representativeMedial(structure)
  ))
  if (!source || source.state !== 'candidate') throw new Error(`${finalJamo}/${structure} 종성 생성 입력이 없습니다.`)
  return source
}

export function buildPresetCompositionTarget(input: {
  initialJamo: PresetCompositionTarget['initialJamo']
  medialJamo: PresetCompositionTarget['medialJamo']
  finalJamo: null | 'ㄱ'
}): PresetCompositionTarget {
  const structure = structureForMedial(input.medialJamo)
  const hasFinal = input.finalJamo !== null
  const initialSource = requireInitialSource(input.initialJamo, structure, hasFinal)
  const medialSource = requireMedialSource(input.medialJamo, hasFinal)
  const initialExact = initialSource.medialJamo === input.medialJamo
  const medialExact = input.initialJamo === 'ㄱ'
  const finalSource = input.finalJamo === null ? null : requireFinalSource(input.finalJamo, structure)
  const finalExact = finalSource?.identity.initialJamo === input.initialJamo
    && finalSource.identity.medialJamo === input.medialJamo

  return {
    character: composeSyllable(input.initialJamo, input.medialJamo, input.finalJamo),
    ...input,
    structure,
    initial: {
      source: initialSource,
      projection: initialExact ? 'exact-reference-context' : 'structure-context-projection',
      reviewState: 'user-approved-analysis',
    },
    medial: {
      source: medialSource,
      projection: medialExact ? 'exact-reference-context' : 'structure-context-projection',
      reviewState: medialSource.reviewStatus,
    },
    final: finalSource ? {
      source: finalSource,
      projection: finalExact ? 'exact-reference-context' : 'structure-context-projection',
      reviewState: 'visual-review-required',
    } : null,
    gate: finalSource ? 'blocked-final-visual-review' : 'ready-for-layout-fit',
    productionEligible: false,
  }
}

export function buildPresetCompositionBoard(
  initialJamo: PresetCompositionTarget['initialJamo'],
): readonly PresetCompositionTarget[] {
  return JUNGSEONG_LIST.flatMap((medialJamo) => [
    buildPresetCompositionTarget({ initialJamo, medialJamo, finalJamo: null }),
    buildPresetCompositionTarget({ initialJamo, medialJamo, finalJamo: 'ㄱ' }),
  ])
}

// 추출 입력의 확인 상태와 생성 결과의 품질은 별개다.
export function presetCompositionEvidence(target: PresetCompositionTarget): 'confirmed-input' | 'projected-input' | 'review-required' {
  if (target.initial.source.character !== target.character
    || target.medial.source.character !== target.character
    || (target.final && target.final.source.identity.character !== target.character)) {
    return 'projected-input'
  }
  if (target.final?.reviewState === 'visual-review-required'
    || target.initial.source.selectionArea.status !== 'candidate'
    || target.medial.source.elements.some(({ face, visibleSpans }) => (
      face.status !== 'candidate' || visibleSpans.status !== 'candidate'
    ))) return 'review-required'
  return 'confirmed-input'
}

function validateSources(): void {
  if (PRESET_INITIAL_SOURCE.font.fileSha256 !== PRESET_COMPOSITION_FONT_SHA256) throw new Error('초성 Noto SHA가 다릅니다.')
  if (PRESET_FINAL_SOURCE.font.fileSha256 !== PRESET_COMPOSITION_FONT_SHA256) throw new Error('종성 Noto SHA가 다릅니다.')
  if (PRESET_SOURCE_MANIFEST.font.fileSha256 !== PRESET_COMPOSITION_FONT_SHA256) throw new Error('홀자 Noto SHA가 다릅니다.')
  if (PRESET_INITIAL_SOURCE.cases.length !== 114) throw new Error('초성 19자 × 6문맥이 필요합니다.')
  if (PRESET_FINAL_SOURCE.cases.length !== 81) throw new Error('종성 27자 × 3문맥이 필요합니다.')
  if (PRESET_FINAL_EVALUATION.candidateCount !== PRESET_FINAL_SOURCE.cases.length) throw new Error('종성 후보와 평가 건수가 다릅니다.')
  if (PRESET_SOURCE_MANIFEST.cases.length !== 42) throw new Error('홀자 21자 × 무받침/ㄱ 입력이 필요합니다.')
  if (PRESET_INITIAL_SOURCE.cases.some(({ status }) => status !== 'candidate')) throw new Error('초성 자동 포기가 남아 있습니다.')
  if (PRESET_FINAL_SOURCE.cases.some(({ state }) => state !== 'candidate')) throw new Error('종성 자동 포기가 남아 있습니다.')
}

validateSources()
