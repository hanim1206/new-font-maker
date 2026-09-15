import { describe, expect, it } from 'vitest'
import fixtureSource from '../reference-data/font-guide-calibrations/noto-sans-kr.initial-component-g0.v2.json'
import holdoutSource from '../reference-data/font-guide-calibrations/nanum-gothic.initial-component-g1.v2.json'
import {
  INITIAL_COMPONENT_EXTRACTOR_VERSION,
  parseInitialComponentCandidateResponse,
} from './initialComponentCandidateModel'

describe('Noto 첫닿 P0 G0 fixture', () => {
  it('고정 SHA의 19첫닿 × 6문맥 응답을 strict parser로 재현한다', () => {
    const fixture = parseInitialComponentCandidateResponse(fixtureSource)

    expect(fixture.extractorVersion).toBe(INITIAL_COMPONENT_EXTRACTOR_VERSION)
    expect(fixture.font).toEqual({
      id: 'noto-sans-kr',
      fileSha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
      axes: { wght: 400 },
    })
    expect(fixture.cases).toHaveLength(114)
    expect(new Set(fixture.cases.map(({ character }) => character))).toHaveLength(114)
    expect(fixture.cases.every((candidate) => (
      candidate.status === 'candidate'
      && candidate.componentGroup.status === 'candidate'
      && Object.values(candidate.roleFaces).every(({ status }) => status === 'candidate')
      && candidate.selectionArea.status === 'candidate'
    ))).toBe(true)
  })

  it('곡선 ㅇ은 축평행 면 없이 실제 극값 역할 단면과 색면을 보존한다', () => {
    const fixture = parseInitialComponentCandidateResponse(fixtureSource)
    const curved = fixture.cases.find(({ character }) => character === '아')

    expect(curved?.status).toBe('candidate')
    if (!curved || curved.status !== 'candidate') throw new Error('아 candidate가 필요합니다.')
    expect(Object.values(curved.inkBounds).every(({ status }) => status === 'candidate')).toBe(true)
    expect(Object.values(curved.axisFaces).every(({ status }) => status === 'abstained')).toBe(true)
    expect(Object.values(curved.roleFaces).every(({ status }) => status === 'candidate')).toBe(true)
    expect(curved.selectionArea.status).toBe('candidate')
  })

  it('ㄹ·ㄷ·ㅌ 오른단면은 첫 가로획 꺾임에서 전체 잉크 오른쪽보다 먼저 멈춘다', () => {
    const fixture = parseInitialComponentCandidateResponse(fixtureSource)
    for (const character of ['라', '다', '타']) {
      const candidate = fixture.cases.find((item) => item.character === character)
      expect(candidate?.status).toBe('candidate')
      if (!candidate || candidate.status !== 'candidate') throw new Error(`${character} candidate가 필요합니다.`)
      expect(candidate.roleFaces.right.status).toBe('candidate')
      if (candidate.roleFaces.right.status !== 'candidate' || candidate.inkBounds.right.status !== 'candidate') throw new Error(`${character} 오른단면이 필요합니다.`)
      expect(candidate.roleFaces.right.value).toBeLessThan(candidate.inkBounds.right.value)
      expect(candidate.roleFaces.right.evidence.selectionRule).toBe('first-main-horizontal-endpoint')
    }
  })

  it('나눔고딕 holdout 114자를 같은 계약으로 읽고 merged 경계 근거를 유지한다', () => {
    const fixture = parseInitialComponentCandidateResponse(holdoutSource)
    const mergedCount = fixture.cases.filter((candidate) => (
      candidate.status === 'candidate'
      && candidate.componentGroup.status === 'candidate'
      && candidate.componentGroup.evidence.selectionRule === 'context-directed-merged-boundary'
    )).length

    expect(fixture.font).toEqual({
      id: 'nanum-gothic',
      fileSha256: '76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31',
      axes: {},
    })
    expect(fixture.cases).toHaveLength(114)
    expect(fixture.cases.every((candidate) => (
      candidate.status === 'candidate'
      && candidate.componentGroup.status === 'candidate'
      && Object.values(candidate.roleFaces).every(({ status }) => status === 'candidate')
      && candidate.selectionArea.status === 'candidate'
    ))).toBe(true)
    expect(mergedCount).toBe(29)
  })
})
