import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE, effectiveStyleOf } from './globalStyleStore'

describe('effectiveStyleOf — 전역 스타일을 읽는 길 하나', () => {
  const style = { ...DEFAULT_STYLE, weight: 700, slant: 12 }

  it('제외 규칙이 없으면 같은 객체를 돌려준다(메모가 안 깨진다)', () => {
    expect(effectiveStyleOf(style, [], 'choseong-jungseong-vertical')).toBe(style)
  })

  it('다른 레이아웃의 제외 규칙은 건드리지 않는다', () => {
    const exclusions = [{ id: 'slant-choseong-only', property: 'slant' as const, layoutType: 'choseong-only' as const }]
    expect(effectiveStyleOf(style, exclusions, 'choseong-jungseong-vertical')).toBe(style)
  })

  it('제외된 속성만 기본값으로 돌아간다', () => {
    const exclusions = [{ id: 'slant-choseong-only', property: 'slant' as const, layoutType: 'choseong-only' as const }]
    const effective = effectiveStyleOf(style, exclusions, 'choseong-only')
    expect(effective.slant).toBe(0)
    expect(effective.weight).toBe(700)
    expect(style.slant).toBe(12)
  })
})
