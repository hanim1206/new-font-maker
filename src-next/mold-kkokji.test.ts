import { describe, expect, it } from 'vitest'
import { whiteCenterOf } from './moldKkokji'

// 닿자 상자 폭 0.1 ~ 0.5, 꼭지 띠 0.5 ~ 0.6.
const span = [0.1, 0.5] as const, band = [0.5, 0.6] as const

describe('ㅗ 꼭지 자리(C026): 꼭지 높이에서 닿자 상자 폭 안 흰 넓이 가운데', () => {
  it('닿자 밑이 비면 상자 가운데', () => {
    expect(whiteCenterOf(span, band, [])).toBeCloseTo(0.3)
  })
  it('ㄱ처럼 내림이 오른쪽을 막으면 남은 흰 곳 가운데 — 상자 가운데보다 왼쪽', () => {
    const down = { points: [{ x: 0.44, y: 0.2 }, { x: 0.44, y: 0.7 }], thickness: 0.04 }
    expect(whiteCenterOf(span, band, [down])).toBeCloseTo((0.1 + 0.42) / 2)
  })
  it('띠 위 끝이 닿자 밑 가로에 붙어 다 막힌 줄은 빼고 센다(ㄷ)', () => {
    const floor = { points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }], thickness: 0.04 }
    expect(whiteCenterOf(span, band, [floor])).toBeCloseTo(0.3)
  })
})

describe('섞임홀자는 닿자를 줄여도 기둥 · 보 고정(C026)', () => {
  it('「과」 닿자 작게: 세로 쪽 칸(ㅏ 기둥)이 닿자 쪽으로 늘지 않는다. 세로홀자 「가」는 그대로 민다', async () => {
    const { impressBoxes } = await import('./moldLab')
    const mixed = { CH: { x: 0.093, y: 0.187, width: 0.424, height: 0.373 }, JU_H: { x: 0.016, y: 0.444, width: 0.621, height: 0.265 }, JU_V: { x: 0.696, y: 0.053, width: 0.199, height: 0.904 } }
    const out = impressBoxes(mixed, { jamo: 0.6 }, 'choseong-jungseong-mixed')
    expect(out.JU_V).toEqual(mixed.JU_V)
    expect(out.CH!.width).toBeLessThan(mixed.CH.width)
    const vertical = { CH: { x: 0.1, y: 0.2, width: 0.4, height: 0.6 }, JU: { x: 0.6, y: 0.05, width: 0.3, height: 0.9 } }
    expect(impressBoxes(vertical, { jamo: 0.6 }, 'choseong-jungseong-vertical').JU!.x).toBeLessThan(vertical.JU.x)
  })
})
