import { describe, expect, it } from 'vitest'
import { mapBoxToDesignBody, mapFacesToDesignBody, REFERENCE_BODY_PADDING } from './designBodyPlacement'

describe('네모꼴을 바꾸면 모델 상자도 같이 옮겨진다', () => {
  const box = { x: 0.075, y: 0.2, width: 0.85, height: 0.4 }

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

  it('틀 가운데는 틀 가운데로 간다', () => {
    const mapped = mapFacesToDesignBody({ left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 }, { top: 0.1, bottom: 0.3, left: 0.25, right: 0.05 })
    expect(mapped.left).toBeCloseTo(0.25 + 0.7 / 2, 9)
    expect(mapped.top).toBeCloseTo(0.1 + 0.6 / 2, 9)
  })
})
