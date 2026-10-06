import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE, effectiveStyleOf, normalizeStrokeRenderStyle } from './globalStyleStore'

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

describe('normalizeStrokeRenderStyle — 뾰족 한계', () => {
  const brush = { tip: 'round' as const, aspectRatio: 1, angle: 0 }
  it('기본값(1.64)이면 키를 안 두고, 다른 값은 1~4로 잘라 둔다', () => {
    expect('miterLimit' in normalizeStrokeRenderStyle({ mode: 'brush', brush, miterLimit: 1.64 })).toBe(false)
    expect('miterLimit' in normalizeStrokeRenderStyle({ mode: 'brush', brush })).toBe(false)
    expect(normalizeStrokeRenderStyle({ mode: 'brush', brush, miterLimit: 3 })).toMatchObject({ miterLimit: 3 })
    expect(normalizeStrokeRenderStyle({ mode: 'brush', brush, miterLimit: 9 })).toMatchObject({ miterLimit: 4 })
  })
})
