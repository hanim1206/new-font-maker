import { describe, expect, it } from 'vitest'
import type { MedialFaceElementCandidate } from './medialGuideCandidateModel'
import {
  MEDIAL_GUIDE_G0_GOLD,
  compareMedialElementToGold,
  medialGuideG0GoldCase,
} from './medialGuideGoldModel'

const evidence = {
  hypothesisId: 'test',
  contourId: 0,
  segmentIds: [0],
  method: 'geometric-role-matcher-v3' as const,
  referenceMode: 'axis-aligned-face' as const,
}

function candidate(value: number, from: number, to: number): MedialFaceElementCandidate {
  return {
    elementId: 'outerPillar',
    orientation: 'vertical',
    faceSide: 'right',
    legacyFaceRole: 'outerPillarFace',
    legacyTipRole: null,
    face: { status: 'candidate', value, evidence },
    visibleSpans: { status: 'candidate', value: [{ from, to }], evidence },
    match: { status: 'matched', score: 0.9, confidence: 'high', margin: 0.9, alternatives: [{ contourId: 0, score: 0.9 }] },
  }
}

describe('G0 analysis gold 비교', () => {
  it('동결 범위와 생산값 비승격 계약을 고정한다', () => {
    expect(MEDIAL_GUIDE_G0_GOLD.status).toBe('approved-analysis-gold')
    expect(MEDIAL_GUIDE_G0_GOLD.productionEligible).toBe(false)
    expect(MEDIAL_GUIDE_G0_GOLD.scope).toMatchObject({ characterCount: 14, elementCount: 28 })
    expect(MEDIAL_GUIDE_G0_GOLD.cases.flatMap(({ elements }) => elements)).toHaveLength(28)
    for (const character of ['과', '곽']) {
      expect(medialGuideG0GoldCase(character)?.elements.find(({ elementId }) => elementId === 'lowerBeam')?.face).toMatchObject({
        status: 'candidate',
        referenceMode: 'start-side-local-tangent',
        referenceSide: 'left',
      })
    }
  })

  it('좌표와 구간 끝 오차 2 이하는 일치, 초과는 불일치다', () => {
    const gold = {
      elementId: 'outerPillar',
      orientation: 'vertical',
      faceSide: 'right',
      face: { status: 'candidate', value: 100, referenceMode: 'axis-aligned-face' },
      visibleSpans: { status: 'candidate', value: [{ from: 20, to: 80 }] },
    } as const

    expect(compareMedialElementToGold(candidate(102, 18, 82), gold)).toMatchObject({ status: 'match', maximumCoordinateDelta: 2 })
    expect(compareMedialElementToGold(candidate(102.001, 20, 80), gold)).toMatchObject({ status: 'mismatch' })
  })

  it('자동 포기 사유까지 같아야 일치다', () => {
    const gold = {
      elementId: 'lowerBeam',
      orientation: 'horizontal',
      faceSide: 'top',
      face: { status: 'abstained', reasonCode: 'non-scalar-face', referenceMode: 'axis-aligned-face' },
      visibleSpans: { status: 'abstained', reasonCode: 'non-scalar-face' },
    } as const
    const actual: MedialFaceElementCandidate = {
      elementId: 'lowerBeam',
      orientation: 'horizontal',
      faceSide: 'top',
      legacyFaceRole: 'lowerBeamFace',
      legacyTipRole: null,
      face: { status: 'abstained', reasonCode: 'non-scalar-face', evidence },
      visibleSpans: { status: 'abstained', reasonCode: 'non-scalar-face', evidence },
      match: { status: 'matched', score: 0.9, confidence: 'high', margin: 0.9, alternatives: [{ contourId: 0, score: 0.9 }] },
    }
    expect(compareMedialElementToGold(actual, gold).status).toBe('match')
    expect(compareMedialElementToGold({ ...actual, face: { status: 'abstained', reasonCode: 'no-role-match', evidence } }, gold).status).toBe('mismatch')
  })
})
