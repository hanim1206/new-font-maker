import type { PresetCompositionTarget } from '../../src-next/presetCompositionInput'

export type PresetGuideMasterStatus = 'ready-direct-guide-master' | 'ready-projected-guide-master' | 'blocked-review' | 'blocked-missing-input'

export interface PresetCompositionGuideMaster {
  schema: 'preset-composition-guide-master-v1'
  character: string
  status: PresetGuideMasterStatus
  productionEligible: false
  initial: {
    sourceCharacter: string
    direct: boolean
    selectionArea: { x: number; y: number; width: number; height: number } | null
  }
  medial: {
    sourceCharacter: string
    direct: boolean
    roleCount: number
    candidateRoleCount: number
  }
  final: null | {
    sourceCharacter: string
    direct: boolean
    selectionArea: { x: number; y: number; width: number; height: number } | null
    visualReviewComplete: boolean
  }
}

function initialArea(target: PresetCompositionTarget) {
  const area = target.initial.source.selectionArea
  return area.status === 'candidate' ? area.value : null
}

function finalArea(target: PresetCompositionTarget) {
  const area = target.final?.source.selectionArea
  return area?.status === 'candidate' ? area.value : null
}

/**
 * 기준선 추출 원본을 자모 생성기로 넘기기 전의 불변 조합 입력이다.
 * 현재 단계에서는 자모 형태를 추정하지 않는다.
 */
export function createPresetCompositionGuideMaster(target: PresetCompositionTarget): PresetCompositionGuideMaster {
  const initialDirect = target.initial.source.character === target.character && initialArea(target) !== null
  const medialCandidateRoleCount = target.medial.source.elements.filter(({ face, visibleSpans }) => (
    face.status === 'candidate' && visibleSpans.status === 'candidate'
  )).length
  const medialDirect = target.medial.source.character === target.character
    && medialCandidateRoleCount === target.medial.source.elements.length
  const finalDirect = target.final !== null
    && target.final.source.identity.character === target.character
    && finalArea(target) !== null
  const finalReviewed = target.final?.reviewState !== 'visual-review-required'
  const missing = initialArea(target) === null
    || medialCandidateRoleCount !== target.medial.source.elements.length
    || (target.final !== null && finalArea(target) === null)
  const projected = !initialDirect || !medialDirect || (target.final !== null && !finalDirect)
  const status: PresetGuideMasterStatus = missing
    ? 'blocked-missing-input'
    : target.final !== null && !finalReviewed
      ? 'blocked-review'
      : projected ? 'ready-projected-guide-master' : 'ready-direct-guide-master'

  return {
    schema: 'preset-composition-guide-master-v1',
    character: target.character,
    status,
    productionEligible: false,
    initial: { sourceCharacter: target.initial.source.character, direct: initialDirect, selectionArea: initialArea(target) },
    medial: {
      sourceCharacter: target.medial.source.character,
      direct: medialDirect,
      roleCount: target.medial.source.elements.length,
      candidateRoleCount: medialCandidateRoleCount,
    },
    final: target.final ? {
      sourceCharacter: target.final.source.identity.character,
      direct: finalDirect,
      selectionArea: finalArea(target),
      visualReviewComplete: finalReviewed,
    } : null,
  }
}
