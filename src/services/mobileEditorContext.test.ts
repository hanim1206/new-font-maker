import { describe, expect, it } from 'vitest'
import {
  getAcceleratedQuickPickOffset,
  getCarouselSyllables,
  getJamoCandidates,
  getJamoContextPreviews,
  getLayoutContextSyllables,
  getSyllableJamoChars,
  replaceSyllablePart,
} from './mobileEditorContext'

describe('mobileEditorContext', () => {
  it('현재 글자를 포함해 같은 레이아웃의 보기 전용 표본을 만든다', () => {
    expect(getLayoutContextSyllables('르', 'choseong-jungseong-horizontal')).toEqual(['르', '고', '누', '묘', '슈'])
    expect(getLayoutContextSyllables('밤', 'choseong-jungseong-vertical-jongseong')).toHaveLength(5)
  })

  it('빠른 선택은 중심에서 멀어질수록 더 많은 후보를 넘긴다', () => {
    expect(getAcceleratedQuickPickOffset(8)).toBe(0)
    expect(getAcceleratedQuickPickOffset(34)).toBe(1)
    expect(getAcceleratedQuickPickOffset(80)).toBeGreaterThan(3)
    expect(getAcceleratedQuickPickOffset(-80)).toBe(-getAcceleratedQuickPickOffset(80))
  })

  it('빠른 선택은 캐러셀과 같은 역할별 자소 순서를 사용한다', () => {
    expect(getJamoCandidates('CH').slice(0, 4)).toEqual(['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'])
    expect(getJamoCandidates('JU').slice(0, 4)).toEqual(['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ'])
    expect(getJamoCandidates('JO').slice(0, 4)).toEqual(['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'])
  })

  it('초성이 활성이면 중성과 종성을 고정한 채 다음 초성을 보여준다', () => {
    expect(getCarouselSyllables('곰', 'CH')).toEqual({
      previous: '쫌',
      current: '곰',
      next: '놈',
    })
    expect(getCarouselSyllables('놈', 'CH').next).toBe('돔')
    expect(getSyllableJamoChars(getCarouselSyllables('곰', 'CH').next)).toEqual({
      choseong: 'ㄴ',
      jungseong: 'ㅗ',
      jongseong: 'ㅁ',
    })
  })

  it('중성이 활성이면 초성과 종성을 고정한 채 다음 중성을 보여준다', () => {
    expect(getCarouselSyllables('곰', 'JU').next).toBe('굠')
    expect(getCarouselSyllables('굠', 'JU').next).toBe('굼')
    expect(getSyllableJamoChars(getCarouselSyllables('곰', 'JU').next)).toEqual({
      choseong: 'ㄱ',
      jungseong: 'ㅛ',
      jongseong: 'ㅁ',
    })
  })

  it('각 자소 캐러셀의 마지막 다음은 첫 자소로 순환한다', () => {
    expect(getCarouselSyllables('쫌', 'CH').next).toBe('곰')
    expect(getCarouselSyllables('ㅉ', 'CH').next).toBe('ㄱ')

    const lastVowel = replaceSyllablePart('곰', 'JU', 'ㅢ')
    expect(getCarouselSyllables(lastVowel, 'JU').next).toBe(replaceSyllablePart('곰', 'JU', 'ㅗ'))

    const lastFinal = replaceSyllablePart('곰', 'JO', 'ㅆ')
    expect(getCarouselSyllables(lastFinal, 'JO').next).toBe(replaceSyllablePart('곰', 'JO', 'ㄱ'))
  })

  it('자음 문맥을 초성·받침 역할별 고정 순서로 만든다', () => {
    expect(getJamoContextPreviews('곰', 'CH')).toEqual([
      { id: 'standalone', label: '단독 사용', syllable: 'ㄱ', active: false },
      { id: 'vertical-no-final', label: '세로모음', syllable: '가', active: false },
      { id: 'vertical-with-final', label: '세로모음+받침', syllable: '갈', active: false },
      { id: 'horizontal-no-final', label: '가로모음', syllable: '고', active: false },
      { id: 'horizontal-with-final', label: '가로모음+받침', syllable: '곰', active: true },
    ])
  })

  it('초성 문맥 네 장은 모두 선택한 초성을 유지한다', () => {
    expect(getJamoContextPreviews('돔', 'CH').map((item) => item.syllable)).toEqual([
      'ㄷ', '다', '달', '도', '돔',
    ])
  })

  it('단독 초성은 첫 문맥과 자소 캐러셀에서 그대로 유지한다', () => {
    expect(getJamoContextPreviews('ㅁ', 'CH')[0]).toEqual({
      id: 'standalone', label: '단독 사용', syllable: 'ㅁ', active: true,
    })
    expect(getCarouselSyllables('ㅁ', 'CH')).toEqual({ previous: 'ㄹ', current: 'ㅁ', next: 'ㅂ' })
  })

  it('종성 ㄴ은 홑받침과 겹받침 앞 문맥 세 장만 만든다', () => {
    expect(getJamoContextPreviews('근', 'JO')).toEqual([
      { id: 'single-final', label: '홑받침', syllable: '근', active: true },
      { id: 'compound-front', label: '겹받침 · 앞', syllable: '않', active: false },
      { id: 'compound-back', label: '겹받침 · 뒤', syllable: null, active: false },
    ])
  })

  it('종성 ㅎ은 홑받침과 겹받침 뒤 문맥 세 장만 만든다', () => {
    expect(getJamoContextPreviews('좋', 'JO')).toEqual([
      { id: 'single-final', label: '홑받침', syllable: '좋', active: true },
      { id: 'compound-front', label: '겹받침 · 앞', syllable: null, active: false },
      { id: 'compound-back', label: '겹받침 · 뒤', syllable: '않', active: false },
    ])
  })

  it('중성 문맥도 초성과 받침 유무의 고정 순서를 유지한다', () => {
    expect(getJamoContextPreviews('곰', 'JU').map((item) => item.syllable)).toEqual([
      '고', '곤', '모', '몬',
    ])
    expect(getJamoContextPreviews('곰', 'JU').map((item) => item.active)).toEqual([
      false, true, false, false,
    ])
  })
})
