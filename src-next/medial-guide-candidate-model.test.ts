import { describe, expect, it } from 'vitest'
import { parseMedialGuideCandidateResponse } from './medialGuideCandidateModel'

function response() {
  const evidence = { hypothesisId: 'outerPillar:contour-0:right', contourId: 0, segmentIds: [1], method: 'geometric-role-matcher-v9', referenceMode: 'axis-aligned-face', matchingUnit: 'axis-face-segment-group', roleStrategy: 'rightmost-long-pillar', scanOrigin: 'glyph-right-edge', scanDirection: 'right-to-left' }
  return {
    schema: 'reference-medial-guide-candidate-response-v1', apiVersion: 'reference.v1', extractorVersion: 'geometric-role-matcher-v9',
    roleDefinitionVersion: 'medial-guide-role-v4', coordinateFrame: 'shared-baseline', matching: 'geometry-role-search',
    font: { id: 'noto-sans-kr', fileSha256: '1'.repeat(64), axes: { wght: 400 } },
    cases: [{
      character: '가', initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null, status: 'candidate', glyphName: 'uniAC00', pathSha256: '2'.repeat(64),
      elements: [{
        elementId: 'outerPillar', orientation: 'vertical', faceSide: 'right', legacyFaceRole: 'outerPillarFace', legacyTipRole: null,
        face: { status: 'candidate', value: 745.061, evidence },
        visibleSpans: { status: 'candidate', value: [{ from: 52.69, to: 419.819 }, { from: 488.991, to: 957.14 }], evidence },
        componentSpans: [{ from: 52.69, to: 957.14 }], derived: { extent: 904.45, visibleLength: 835.28 },
        match: { status: 'matched', score: 0.99, confidence: 'high', margin: 0.99, alternatives: [{ contourId: 0, score: 0.99 }] },
      }],
    }],
  }
}

describe('유한 홀자 구조면 응답 parser', () => {
  it('P1 겹기둥·쌍줄기 element ID를 보존한다', () => {
    for (const elementId of ['innerPillar', 'leftStem', 'rightStem']) {
      const candidate = response()
      candidate.cases[0].elements[0].elementId = elementId
      const parsed = parseMedialGuideCandidateResponse(candidate)
      const parsedCase = parsed.cases[0]
      if (parsedCase.status !== 'candidate') throw new Error('candidate case가 필요합니다.')
      expect(parsedCase.elements[0].elementId).toBe(elementId)
    }
  })

  it('면 위치와 복수 가시 구간을 보존한다', () => {
    const parsed = parseMedialGuideCandidateResponse(response())
    const parsedCase = parsed.cases[0]
    expect(parsedCase.status).toBe('candidate')
    if (parsedCase.status !== 'candidate') throw new Error('candidate case가 필요합니다.')
    const pillar = parsedCase.elements[0]
    expect(pillar.face).toMatchObject({ status: 'candidate', value: 745.061 })
    expect(pillar.face.evidence).toMatchObject({ method: 'geometric-role-matcher-v9', matchingUnit: 'axis-face-segment-group', roleStrategy: 'rightmost-long-pillar', scanOrigin: 'glyph-right-edge', scanDirection: 'right-to-left' })
    expect(pillar.visibleSpans).toMatchObject({ status: 'candidate', value: [{ from: 52.69, to: 419.819 }, { from: 488.991, to: 957.14 }] })
    expect(pillar.match).toEqual({ status: 'matched', score: 0.99, confidence: 'high', margin: 0.99, alternatives: [{ contourId: 0, score: 0.99 }] })
  })

  it('v9 응답 안의 동결 P0 v3 근거를 허용한다', () => {
    const candidate = response()
    candidate.cases[0].elements[0].face.evidence.method = 'geometric-role-matcher-v3'
    candidate.cases[0].elements[0].visibleSpans.evidence.method = 'geometric-role-matcher-v3'
    const parsed = parseMedialGuideCandidateResponse(candidate)
    const parsedCase = parsed.cases[0]
    if (parsedCase.status !== 'candidate') throw new Error('candidate case가 필요합니다.')
    expect(parsedCase.elements[0].face.evidence.method).toBe('geometric-role-matcher-v3')
  })

  it('뒤집힌 구간과 축이 맞지 않는 면을 거부한다', () => {
    const reversed = response()
    reversed.cases[0].elements[0].visibleSpans.value[0] = { from: 100, to: 90 }
    expect(() => parseMedialGuideCandidateResponse(reversed)).toThrow('from은 to보다 작아야')

    const wrongAxis = response()
    wrongAxis.cases[0].elements[0].faceSide = 'top'
    expect(() => parseMedialGuideCandidateResponse(wrongAxis)).toThrow('orientation과 faceSide 축이 다릅니다')
  })
})
