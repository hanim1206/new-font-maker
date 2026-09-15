import { describe, expect, it } from 'vitest'
import type { MedialFaceElementCandidate } from './medialGuideCandidateModel'
import {
  MEDIAL_GUIDE_P1_ROLE_CONTRACT_VERSION,
  MEDIAL_DEFINITIONS,
  emptyProfile,
  observationFor,
  scalarCandidatesFromElements,
  updateObservation,
} from './medialGuideModel'

const evidence = {
  hypothesisId: 'base-stem',
  contourId: 2,
  segmentIds: [0],
  method: 'geometric-role-matcher-v3',
  referenceMode: 'axis-aligned-face',
} as const

function baseStem(componentTo: number, visibleTo: number): MedialFaceElementCandidate {
  return {
    elementId: 'baseStem',
    orientation: 'vertical',
    faceSide: 'right',
    legacyFaceRole: 'basePillarFace',
    legacyTipRole: 'baseStemTipFace',
    face: { status: 'candidate', value: 499.74, evidence },
    visibleSpans: { status: 'candidate', value: [{ from: 487.281, to: visibleTo }], evidence },
    componentSpans: [{ from: 487.281, to: componentTo }],
    match: { status: 'matched', score: 0.98, confidence: 'high', margin: 0.27, alternatives: [{ contourId: 2, score: 0.98 }] },
  }
}

describe('홀자 관측 v3 모델', () => {
  it('21홀자의 겹기둥·겹보·쌍줄기 역할을 구조별로 보존한다', () => {
    expect(MEDIAL_GUIDE_P1_ROLE_CONTRACT_VERSION).toBe('medial-guide-role-v4')
    const roleIds = (medial: keyof typeof MEDIAL_DEFINITIONS) => MEDIAL_DEFINITIONS[medial].roles.map(({ id }) => id)

    expect(roleIds('ㅐ')).toEqual(['innerPillarFace', 'outerPillarFace', 'primaryBeamFace'])
    expect(roleIds('ㅒ')).toEqual(['innerPillarFace', 'outerPillarFace', 'upperBeamFace', 'lowerBeamFace'])
    expect(roleIds('ㅔ')).toEqual(['innerPillarFace', 'outerPillarFace', 'primaryBeamFace'])
    expect(roleIds('ㅖ')).toEqual(['innerPillarFace', 'outerPillarFace', 'upperBeamFace', 'lowerBeamFace'])
    expect(roleIds('ㅛ')).toEqual(['leftStemFace', 'leftStemTipFace', 'rightStemFace', 'rightStemTipFace', 'primaryBeamFace'])
    expect(roleIds('ㅠ')).toEqual(['leftStemFace', 'leftStemTipFace', 'rightStemFace', 'rightStemTipFace', 'primaryBeamFace'])
    expect(roleIds('ㅙ')).toEqual(['basePillarFace', 'baseStemTipFace', 'innerPillarFace', 'outerPillarFace', 'upperBeamFace', 'lowerBeamFace'])
    expect(roleIds('ㅞ')).toEqual(['basePillarFace', 'baseStemTipFace', 'innerPillarFace', 'outerPillarFace', 'upperBeamFace', 'lowerBeamFace'])
  })

  it('받침 없음과 실제 ㄱ 받침을 독립 case key로 보존한다', () => {
    const role = MEDIAL_DEFINITIONS['ㅏ'].roles[0]
    const withoutFinal = updateObservation(emptyProfile(), 'ㄱ', 'ㅏ', null, role, 745)
    const withFinal = updateObservation(withoutFinal, 'ㄱ', 'ㅏ', 'ㄱ', role, 752)

    expect(withFinal.observations).toHaveLength(2)
    expect(observationFor(withFinal, 'ㄱ', 'ㅏ', null, role.id)?.value).toBe(745)
    expect(observationFor(withFinal, 'ㄱ', 'ㅏ', 'ㄱ', role.id)?.value).toBe(752)
  })

  it('자동 요소에서 면 좌표와 보이는 끝만 scalar 후보로 만든다', () => {
    const roles = MEDIAL_DEFINITIONS['ㅜ'].roles
    const visible = scalarCandidatesFromElements(roles, [baseStem(959.1, 959.1)])
    const occluded = scalarCandidatesFromElements(roles, [baseStem(678.2, 651.959)])

    expect(visible.basePillarFace).toMatchObject({ value: 500, confidence: 'high' })
    expect(visible.baseStemTipFace).toMatchObject({ value: 959, confidence: 'high' })
    expect(occluded.basePillarFace).toMatchObject({ value: 500, confidence: 'high' })
    expect(occluded.baseStemTipFace).toMatchObject({ value: null, confidence: 'abstained', reasonCode: 'occluded-by-neighbor-overlap' })
  })
})
