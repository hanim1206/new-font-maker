import { describe, expect, it } from 'vitest'
import { advanceForCharacter, DEFAULT_FONT_GRID, DEFAULT_FONT_METRICS, DEFAULT_FONT_SPACE, fontUnitsToNormalized } from './calibrationProjectStore'
import { inferEditRule } from './editInference'

const component = { id: '과:initial:ㄱ', role: 'initial' as const, jamoId: 'ㄱ' }

describe('Font Space와 편집 추론 계약', () => {
  it('UPM 1000에서 5 unit snap을 정규화 좌표 0.005로 변환한다', () => {
    expect(fontUnitsToNormalized(DEFAULT_FONT_GRID.snapInterval, DEFAULT_FONT_SPACE)).toBe(.005)
  })

  it('한글과 스페이스를 서로 다른 실제 advance width로 배치한다', () => {
    expect(advanceForCharacter('가', DEFAULT_FONT_METRICS)).toBe(1000)
    expect(advanceForCharacter('가', DEFAULT_FONT_METRICS, 850)).toBe(850)
    expect(advanceForCharacter(' ', DEFAULT_FONT_METRICS)).toBe(500)
    expect(advanceForCharacter(' ', DEFAULT_FONT_METRICS, 850, 350)).toBe(350)
  })

  it('컴포넌트 이동은 레이아웃 프로필로, 점 이동은 자모 마스터로 분류한다', () => {
    expect(inferEditRule({ kind: 'component-move', glyph: '과', component, layoutType: 'choseong-jungseong-mixed', parts: ['CH'], delta: { x: .01, y: 0 } })).toEqual({
      kind: 'layout-profile', layoutType: 'choseong-jungseong-mixed', parts: ['CH'],
    })
    expect(inferEditRule({ kind: 'point-move', glyph: '과', component, jamoType: 'choseong', strokeId: 'ㄱ-1', pointIndex: 0, delta: { x: .01, y: 0 } })).toEqual({
      kind: 'jamo-master', jamoType: 'choseong', jamoId: 'ㄱ', strokeId: 'ㄱ-1',
    })
  })
})
