import { describe, expect, it } from 'vitest'
import {
  buildInitialComponentP0Cases,
  parseInitialComponentCandidateResponse,
} from './initialComponentCandidateModel'

const commonEvidence = {
  source: 'actual-glyph-outline',
  medialAnchorExtractorVersion: 'geometric-role-matcher-v9',
}

function response() {
  const bounds = { top: 100, bottom: 400, left: 50, right: 450 }
  return {
    schema: 'reference-initial-component-candidate-response-v2',
    apiVersion: 'reference.v1',
    extractorVersion: 'initial-component-matcher-v3',
    roleDefinitionVersion: 'initial-component-role-v2',
    medialAnchorExtractorVersion: 'geometric-role-matcher-v9',
    coordinateFrame: 'shared-baseline',
    matching: 'medial-anchored-component-grouping',
    font: { id: 'noto-sans-kr', fileSha256: '1'.repeat(64), axes: { wght: 400 } },
    cases: [{
      character: '가', initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null, contextId: 'right', status: 'candidate', glyphName: 'uniAC00', pathSha256: '2'.repeat(64),
      componentGroup: {
        status: 'candidate',
        value: { contourIds: [0], holeContourIds: [], selectedPathSha256: '3'.repeat(64) },
        evidence: { ...commonEvidence, method: 'medial-anchored-component-grouping-v1', scanOrigin: 'medial-outer-pillar', scanDirection: 'right-to-left', selectionRule: 'context-directed-contour-islands', score: 0.98, margin: 0.42 },
      },
      inkBounds: Object.fromEntries(Object.entries(bounds).map(([side, value]) => [side, {
        status: 'candidate', value, evidence: { ...commonEvidence, method: 'bezier-ink-extremum-v1', side, contourIds: [0] },
      }])),
      axisFaces: {
        top: { status: 'candidate', value: [{ orientation: 'horizontal', side: 'top', value: 100, visibleSpans: [{ from: 50, to: 450 }], contourId: 0, segmentIds: [0] }], evidence: { ...commonEvidence, method: 'selected-component-axis-face-v1', side: 'top' } },
        bottom: { status: 'abstained', reasonCode: 'no-axis-face', evidence: commonEvidence },
        left: { status: 'abstained', reasonCode: 'no-axis-face', evidence: commonEvidence },
        right: { status: 'candidate', value: [{ orientation: 'vertical', side: 'right', value: 450, visibleSpans: [{ from: 100, to: 400 }], contourId: 0, segmentIds: [1] }], evidence: { ...commonEvidence, method: 'selected-component-axis-face-v1', side: 'right' } },
      },
      roleFaces: {
        top: { status: 'candidate', value: 100, evidence: { ...commonEvidence, method: 'initial-structure-role-face-v2', side: 'top', roleClass: 'first-main-horizontal', selectionRule: 'component-ink-extremum', sourceSide: 'top', sourceValues: [100], contourIds: [0], segmentIds: [], sourceSpans: [] } },
        bottom: { status: 'candidate', value: 400, evidence: { ...commonEvidence, method: 'initial-structure-role-face-v2', side: 'bottom', roleClass: 'first-main-horizontal', selectionRule: 'component-ink-extremum', sourceSide: 'bottom', sourceValues: [400], contourIds: [0], segmentIds: [], sourceSpans: [] } },
        left: { status: 'candidate', value: 80, evidence: { ...commonEvidence, method: 'initial-structure-role-face-v2', side: 'left', roleClass: 'first-main-horizontal', selectionRule: 'first-main-horizontal-endpoint', sourceSide: 'top', sourceValues: [100], contourIds: [0], segmentIds: [0], sourceSpans: [{ from: 80, to: 400 }] } },
        right: { status: 'candidate', value: 400, evidence: { ...commonEvidence, method: 'initial-structure-role-face-v2', side: 'right', roleClass: 'first-main-horizontal', selectionRule: 'first-main-horizontal-endpoint', sourceSide: 'top', sourceValues: [100], contourIds: [0], segmentIds: [0], sourceSpans: [{ from: 80, to: 400 }] } },
      },
      selectionArea: { status: 'candidate', value: { x: 80, y: 100, width: 320, height: 300 }, evidence: { ...commonEvidence, method: 'derived-four-role-faces-v2', derivedFrom: ['top', 'bottom', 'left', 'right'] } },
    }],
  }
}

describe('첫닿 component 후보 계약', () => {
  it('19첫닿 × 6문맥 114글자를 실제 받침 identity로 만든다', () => {
    const cases = buildInitialComponentP0Cases()
    expect(cases).toHaveLength(114)
    expect(new Set(cases.map(({ character }) => character))).toHaveLength(114)
    expect(cases.slice(0, 6).map(({ character }) => character)).toEqual(['가', '각', '고', '곡', '과', '곽'])
    expect(cases.slice(-6).map(({ character }) => character)).toEqual(['하', '학', '호', '혹', '화', '확'])
  })

  it('잉크 경계·평평한 면·역할 단면·파생 색면을 분리해 보존한다', () => {
    const parsed = parseInitialComponentCandidateResponse(response())
    const candidate = parsed.cases[0]
    if (candidate.status !== 'candidate') throw new Error('candidate가 필요합니다.')
    expect(candidate.inkBounds).toMatchObject({ top: { status: 'candidate', value: 100 }, bottom: { status: 'candidate', value: 400 } })
    expect(candidate.axisFaces.bottom).toMatchObject({ status: 'abstained', reasonCode: 'no-axis-face' })
    expect(candidate.roleFaces).toMatchObject({ left: { status: 'candidate', value: 80 }, right: { status: 'candidate', value: 400 } })
    expect(candidate.selectionArea).toMatchObject({ status: 'candidate', value: { x: 80, y: 100, width: 320, height: 300 } })
  })

  it('곡선 닿자는 직선 면 없이도 네 잉크 극값 역할 단면과 색면을 가진다', () => {
    const curved = response()
    curved.cases[0].character = '아'
    curved.cases[0].initialJamo = 'ㅇ'
    const axisFaces = curved.cases[0].axisFaces as unknown as Record<string, unknown>
    for (const side of ['top', 'bottom', 'left', 'right']) axisFaces[side] = { status: 'abstained', reasonCode: 'no-axis-face', evidence: commonEvidence }
    const roleFaces = curved.cases[0].roleFaces as unknown as Record<string, { value: number, evidence: Record<string, unknown> }>
    for (const side of ['top', 'bottom', 'left', 'right']) {
      roleFaces[side].evidence.roleClass = 'full-component'
      roleFaces[side].evidence.selectionRule = 'component-ink-extremum'
      roleFaces[side].evidence.sourceSide = side
      roleFaces[side].evidence.sourceValues = [roleFaces[side].value]
      roleFaces[side].evidence.segmentIds = []
      roleFaces[side].evidence.sourceSpans = []
    }
    roleFaces.left.value = 50
    roleFaces.left.evidence.sourceValues = [50]
    roleFaces.right.value = 450
    roleFaces.right.evidence.sourceValues = [450]
    curved.cases[0].selectionArea.value = { x: 50, y: 100, width: 400, height: 300 }
    const parsed = parseInitialComponentCandidateResponse(curved)
    const candidate = parsed.cases[0]
    if (candidate.status !== 'candidate') throw new Error('candidate가 필요합니다.')
    expect(Object.values(candidate.axisFaces).every(({ status }) => status === 'abstained')).toBe(true)
    expect(candidate.selectionArea.status).toBe('candidate')
  })

  it('holdout의 문맥 결속 merged boundary 근거를 별도 선택 규칙으로 보존한다', () => {
    const merged = response()
    merged.cases[0].componentGroup.evidence.selectionRule = 'context-directed-merged-boundary'
    const parsed = parseInitialComponentCandidateResponse(merged)
    const candidate = parsed.cases[0]
    if (candidate.status !== 'candidate' || candidate.componentGroup.status !== 'candidate') throw new Error('component candidate가 필요합니다.')
    expect(candidate.componentGroup.evidence.selectionRule).toBe('context-directed-merged-boundary')
  })

  it('레거시 값·ROI와 네 경계에서 벗어난 색면을 거부한다', () => {
    const legacy = response()
    ;(legacy.cases[0] as unknown as Record<string, unknown>).initialTop = 100
    expect(() => parseInitialComponentCandidateResponse(legacy)).toThrow('레거시 기준값')

    const mismatched = response()
    mismatched.cases[0].selectionArea.value.width = 410
    expect(() => parseInitialComponentCandidateResponse(mismatched)).toThrow('네 역할 단면의 정확한 파생값')
  })
})
