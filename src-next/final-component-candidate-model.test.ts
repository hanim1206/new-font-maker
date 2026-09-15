import { describe, expect, it } from 'vitest'
import {
  FINAL_COMPONENT_P0_CONTRACT,
  FINAL_COMPONENT_RESPONSE_SCHEMA,
  FINAL_COMPONENT_VERIFICATION_SCHEMA,
  finalMemberSpecFor,
  parseFinalComponentCandidateResponse,
  parseFinalComponentVerification,
  selectionAreaFromFinalRoleFaces,
} from './finalComponentCandidateModel'

const FONT_SHA = 'a'.repeat(64)
const PATH_SHA = 'b'.repeat(64)
const SELECTED_PATH_SHA = 'e'.repeat(64)
const ARTIFACT_SHA = 'c'.repeat(64)
const IDENTITY_SHA = 'd'.repeat(64)

function commonEvidence() {
  return {
    source: 'actual-glyph-outline',
    medialAnchorExtractorVersion: 'geometric-role-matcher-v9',
  }
}

function abstained(reasonCode = 'no-axis-face') {
  return { status: 'abstained', reasonCode, evidence: commonEvidence() }
}

function boundaryRef(memberId: 'left' | 'right', contourId: number, segmentId: number) {
  return { memberId, contourId, segmentId, from: 0, to: 1 }
}

function boundaryFragment(contourId: number, segmentId: number) {
  return {
    contourId,
    segmentIds: [segmentId],
    ranges: [{ segmentId, from: 0, to: 1 }],
  }
}

function bound(side: 'top' | 'bottom' | 'left' | 'right', value: number, memberId: 'left' | 'right', contourId: number, segmentId: number) {
  return {
    status: 'candidate',
    value,
    evidence: {
      ...commonEvidence(),
      method: 'bezier-ink-extremum-v1',
      side,
      boundaryRefs: [boundaryRef(memberId, contourId, segmentId)],
    },
  }
}

function member(id: 'left' | 'right', jamo: string, contourId: number, segmentId: number, left: number, right: number) {
  const logicalOrder = id === 'left' ? 0 : 1
  return {
    id,
    jamo,
    role: id,
    partitionEvidence: {
      ...commonEvidence(),
      method: 'unicode-member-boundary-partition-v1',
      memberId: id,
      logicalOrder,
    },
    boundaryFragments: [boundaryFragment(contourId, segmentId)],
    inkBounds: {
      top: bound('top', 700, id, contourId, segmentId),
      bottom: bound('bottom', 900, id, contourId, segmentId),
      left: bound('left', left, id, contourId, segmentId),
      right: bound('right', right, id, contourId, segmentId),
    },
    axisFaces: {
      top: abstained(),
      bottom: abstained(),
      left: abstained(),
      right: abstained(),
    },
  }
}

function roleFace(side: 'top' | 'bottom' | 'left' | 'right', value: number, memberId: 'left' | 'right', contourId: number, segmentId: number) {
  return {
    status: 'candidate',
    value,
    evidence: {
      ...commonEvidence(),
      method: 'final-group-outer-role-face-v1',
      side,
      selectionRule: 'final-group-ink-extremum',
      supportKind: 'bezier-extremum',
      boundaryRefs: [boundaryRef(memberId, contourId, segmentId)],
    },
  }
}

function makeResponse() {
  return {
    schema: FINAL_COMPONENT_RESPONSE_SCHEMA,
    apiVersion: 'reference.v1',
    lifecycle: 'candidate',
    extractorVersion: 'final-component-matcher-v2',
    roleDefinitionVersion: 'final-component-role-v1',
    medialAnchorExtractorVersion: 'geometric-role-matcher-v9',
    coordinateFrame: 'shared-baseline',
    font: { id: 'noto-sans-kr', fileSha256: FONT_SHA, axes: {} },
    cases: [{
      identity: {
        fontSha256: FONT_SHA,
        axes: {},
        character: '갃',
        codepoint: '갃'.codePointAt(0),
        glyphName: 'uniAC03',
        pathSha256: PATH_SHA,
        initialJamo: 'ㄱ',
        medialJamo: 'ㅏ',
        finalJamo: 'ㄳ',
        contextId: 'right-final',
        schemaVersion: 'final-component-p0-contract-v1',
        extractorVersion: 'final-component-matcher-v2',
        roleDefinitionVersion: 'final-component-role-v1',
      },
      state: 'candidate',
      structureKind: 'compound',
      members: [
        member('left', 'ㄱ', 1, 11, 100, 380),
        member('right', 'ㅅ', 2, 21, 430, 700),
      ],
      componentGroup: {
        status: 'candidate',
        value: { contourIds: [1, 2], holeContourIds: [], memberIds: ['left', 'right'], selectedPathSha256: SELECTED_PATH_SHA },
        evidence: {
          ...commonEvidence(),
          method: 'medial-contact-closed-final-component-grouping-v2',
          scanOrigin: 'medial-outer-pillar',
          scanDirection: 'anchor-to-lower-region',
          selectionRule: 'context-directed-contour-islands',
          score: 10,
          margin: 3,
        },
      },
      memberRelation: {
        method: 'actual-final-member-relation-v1',
        direction: 'left-to-right',
        relation: 'disjoint',
        leftMemberId: 'left',
        rightMemberId: 'right',
        leftAnchorX: 240,
        rightAnchorX: 565,
        boundaryPairs: [{
          left: boundaryRef('left', 1, 11),
          right: boundaryRef('right', 2, 21),
          distance: 50,
          intersects: false,
        }],
      },
      inkBounds: {
        top: bound('top', 700, 'left', 1, 11),
        bottom: bound('bottom', 900, 'right', 2, 21),
        left: bound('left', 100, 'left', 1, 11),
        right: bound('right', 700, 'right', 2, 21),
      },
      axisFaces: {
        top: abstained(),
        bottom: abstained(),
        left: abstained(),
        right: abstained(),
      },
      roleFaces: {
        top: roleFace('top', 700, 'left', 1, 11),
        bottom: roleFace('bottom', 900, 'right', 2, 21),
        left: roleFace('left', 100, 'left', 1, 11),
        right: roleFace('right', 700, 'right', 2, 21),
      },
      selectionArea: {
        status: 'candidate',
        value: { x: 100, y: 700, width: 600, height: 200 },
        evidence: {
          ...commonEvidence(),
          method: 'derived-four-final-role-faces-v1',
          derivedFrom: ['top', 'bottom', 'left', 'right'],
        },
      },
    }],
  }
}

function makeVerification() {
  return {
    schema: FINAL_COMPONENT_VERIFICATION_SCHEMA,
    state: 'verified',
    candidateArtifactSha256: ARTIFACT_SHA,
    candidateIdentitySha256: IDENTITY_SHA,
    review: {
      method: 'user-visual-review',
      reviewedAt: '2026-09-14T12:00:00+09:00',
      reviewedBy: 'user',
      note: '실제 윤곽 접촉 확인',
    },
  }
}

describe('받침 D0 계약', () => {
  it('27종을 단일·된·겹받침과 구성원 순서로 고정한다', () => {
    expect(FINAL_COMPONENT_P0_CONTRACT.finalJamos).toHaveLength(27)
    expect(FINAL_COMPONENT_P0_CONTRACT.structureKinds.map(({ id, finalJamos }) => [id, finalJamos.length])).toEqual([
      ['single', 14],
      ['doubled', 2],
      ['compound', 11],
    ])
    expect(finalMemberSpecFor('ㄲ').members.map(({ id, jamo }) => [id, jamo])).toEqual([['left', 'ㄱ'], ['right', 'ㄱ']])
    expect(finalMemberSpecFor('ㄳ').members.map(({ id, jamo }) => [id, jamo])).toEqual([['left', 'ㄱ'], ['right', 'ㅅ']])
    expect(finalMemberSpecFor('ㅀ').members.map(({ id, jamo }) => [id, jamo])).toEqual([['left', 'ㄹ'], ['right', 'ㅎ']])
  })

  it('받침 전체 외곽 역할 단면과 파생 영역을 고정한다', () => {
    expect(FINAL_COMPONENT_P0_CONTRACT.roleFaceSelectionRule).toBe('final-group-ink-extremum')
    expect(selectionAreaFromFinalRoleFaces({ top: 700, bottom: 900, left: 100, right: 700 })).toEqual({ x: 100, y: 700, width: 600, height: 200 })
    expect(parseFinalComponentCandidateResponse(makeResponse()).cases[0]?.state).toBe('candidate')
  })

  it('후보 응답의 레거시 값·ROI·검증 상태 유입을 거부한다', () => {
    const legacy = makeResponse()
    Object.assign(legacy.cases[0], { finalLeft: 100 })
    expect(() => parseFinalComponentCandidateResponse(legacy)).toThrow(/ROI·레거시 값·검증 상태/)

    const roi = makeResponse()
    Object.assign(roi.cases[0], { roi: { x: 0, y: 0 } })
    expect(() => parseFinalComponentCandidateResponse(roi)).toThrow(/ROI·레거시 값·검증 상태/)

    const verified = makeResponse()
    verified.lifecycle = 'verified'
    expect(() => parseFinalComponentCandidateResponse(verified)).toThrow(/candidate가 필요/)
  })

  it('자모 identity와 구성원 수·순서를 거부한다', () => {
    const wrongIdentity = makeResponse()
    wrongIdentity.cases[0].identity.finalJamo = 'ㄵ'
    expect(() => parseFinalComponentCandidateResponse(wrongIdentity)).toThrow(/character와 자모 identity/)

    const collapsed = makeResponse()
    collapsed.cases[0].members = [collapsed.cases[0].members[0]]
    expect(() => parseFinalComponentCandidateResponse(collapsed)).toThrow(/구조군별 구성원 수/)

    const swapped = makeResponse()
    swapped.cases[0].members.reverse()
    expect(() => parseFinalComponentCandidateResponse(swapped)).toThrow(/\.id: left가 필요/)
  })

  it('실제 구성원 결속 근거와 좌우 방향을 거부한다', () => {
    const noContactEvidence = makeResponse()
    noContactEvidence.cases[0].memberRelation.boundaryPairs = []
    expect(() => parseFinalComponentCandidateResponse(noContactEvidence)).toThrow(/실제 경계 관계 근거/)

    const reversed = makeResponse()
    reversed.cases[0].memberRelation.leftAnchorX = 600
    expect(() => parseFinalComponentCandidateResponse(reversed)).toThrow(/왼구성원 앵커/)

    const falseTouch = makeResponse()
    falseTouch.cases[0].memberRelation.relation = 'touching'
    expect(() => parseFinalComponentCandidateResponse(falseTouch)).toThrow(/실제 접촉·교차 근거/)
  })

  it('역할 단면이 그룹 극값과 다르거나 provenance가 없으면 거부한다', () => {
    const wrongFace = makeResponse()
    wrongFace.cases[0].roleFaces.left.value = 110
    expect(() => parseFinalComponentCandidateResponse(wrongFace)).toThrow(/받침 전체 그룹 원시 극값/)

    const noProvenance = makeResponse()
    noProvenance.cases[0].roleFaces.left.evidence.boundaryRefs = []
    expect(() => parseFinalComponentCandidateResponse(noProvenance)).toThrow(/실제 contour·segment 근거/)

    const wrongArea = makeResponse()
    wrongArea.cases[0].selectionArea.value.x = 110
    expect(() => parseFinalComponentCandidateResponse(wrongArea)).toThrow(/네 역할 단면의 정확한 파생값/)
  })

  it('검증 기록을 후보 응답과 분리하고 사용자 화면 검토만 허용한다', () => {
    expect(parseFinalComponentVerification(makeVerification()).state).toBe('verified')

    const candidateState = makeVerification()
    candidateState.state = 'candidate'
    expect(() => parseFinalComponentVerification(candidateState)).toThrow(/지원하지 않는 값/)

    const automatic = makeVerification()
    automatic.review.method = 'automatic-test'
    expect(() => parseFinalComponentVerification(automatic)).toThrow(/user-visual-review가 필요/)
  })
})
