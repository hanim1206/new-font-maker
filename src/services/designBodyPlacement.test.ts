import { describe, expect, it } from 'vitest'
import { LEGACY_REFERENCE_BODY_PADDING, mapBoxToDesignBody, mapFacesToDesignBody, normalizeReferencePadding, REFERENCE_BODY_PADDING } from './designBodyPlacement'

describe('네모꼴을 바꾸면 모델 상자도 같이 옮겨진다', () => {
  // 기준 틀(왼 0.05 ~ 오른 0.89) 전폭 상자
  const box = { x: 0.05, y: 0.2, width: 0.84, height: 0.4 }

  it('기본 네모꼴에서는 같은 객체를 돌려준다(아무것도 안 바뀐다)', () => {
    expect(mapBoxToDesignBody(box, { ...REFERENCE_BODY_PADDING })).toBe(box)
    expect(mapBoxToDesignBody(box, undefined)).toBe(box)
  })

  it('가로 600이면 기준 틀 전폭 상자가 사용자 틀 전폭이 된다. 세로는 그대로', () => {
    const mapped = mapBoxToDesignBody(box, { ...REFERENCE_BODY_PADDING, left: 0.2, right: 0.2 })
    expect(mapped.x).toBeCloseTo(0.2, 9)
    expect(mapped.x + mapped.width).toBeCloseTo(0.8, 9)
    expect(mapped.y).toBeCloseTo(0.2, 9)
    expect(mapped.height).toBeCloseTo(0.4, 9)
  })

  it('기본 네모꼴은 Noto 몸통이다: 위 50 · 아래 40 · 왼 50 · 오른 110', () => {
    expect(REFERENCE_BODY_PADDING).toEqual({ top: 0.05, bottom: 0.04, left: 0.05, right: 0.11 })
  })

  it('옛 기본(사방 0.075)으로 저장된 여백은 새 기본으로 읽고, 사용자가 고른 여백은 그대로 둔다', () => {
    expect(normalizeReferencePadding({ ...LEGACY_REFERENCE_BODY_PADDING })).toEqual(REFERENCE_BODY_PADDING)
    const chosen = { top: 0.1, bottom: 0.1, left: 0.2, right: 0.2 }
    expect(normalizeReferencePadding(chosen)).toBe(chosen)
  })

  it('틀 가운데는 틀 가운데로 간다', () => {
    // 기준 틀 가운데 = 왼 0.05 + 0.84 / 2, 위 0.05 + 0.91 / 2
    const mapped = mapFacesToDesignBody({ left: 0.47, right: 0.47, top: 0.505, bottom: 0.505 }, { top: 0.1, bottom: 0.3, left: 0.25, right: 0.05 })
    expect(mapped.left).toBeCloseTo(0.25 + 0.7 / 2, 9)
    expect(mapped.top).toBeCloseTo(0.1 + 0.6 / 2, 9)
  })
})
