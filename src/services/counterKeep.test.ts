import { describe, expect, it } from 'vitest'
import type { BoxConfig, StrokeDataV2 } from '../types'
import { counterKeepScale } from './counterKeep'

const BOX: BoxConfig = { x: 0, y: 0, width: 1, height: 1 }
const line = (id: string, points: [number, number][], thickness = 0.07, closed = false): { stroke: StrokeDataV2; box: BoxConfig } => ({
  box: BOX,
  stroke: { id, points: points.map(([x, y]) => ({ x, y })), closed, thickness } as StrokeDataV2,
})
const circle = (cx: number, cy: number, r: number) => line('o', Array.from({ length: 48 }, (_, i): [number, number] => [cx + r * Math.cos(i / 48 * Math.PI * 2), cy + r * Math.sin(i / 48 * Math.PI * 2)]), 0.07, true)
/** 가로줄기 셋, 중심선 간격 0.154(밭 받침 ㅌ과 같은 간격). 굵기 400 틈 = 0.084. */
const tieut = [line('a', [[0.2, 0.6], [0.8, 0.6]]), line('b', [[0.2, 0.754], [0.8, 0.754]]), line('c', [[0.2, 0.908], [0.8, 0.908]])]

describe('속공간 지키기 — 자소 굵기 배율', () => {
  it('굵기 400 이하는 그대로', () => {
    expect(counterKeepScale(tieut, 1)).toBe(1)
    expect(counterKeepScale(tieut, 0.7)).toBe(1)
  })

  it('획 하나(ㅣ)는 굵기와 상관없이 그대로', () => {
    expect(counterKeepScale([line('i', [[0.5, 0.05], [0.5, 0.95]])], 1.95)).toBe(1)
  })

  it('빽빽한 가로줄기는 하한선이 남을 만큼만 굵어진다', () => {
    // 하한선 = max(0.024, 0.25 × 0.07 × 1.95) = 0.034. 한계 k = (0.154 − 0.034) / 0.07 = 1.71.
    const scale = counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.25 })
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.25 * 0.07 * 1.95, 4)
  })

  it('고정 u가 비율보다 크면 고정 u를 지킨다', () => {
    const scale = counterKeepScale(tieut, 1.95, { fixed: 0.05, ratio: 0.25 })
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.05, 4)
  })

  it('넉넉하면 다 굵어진다', () => {
    expect(counterKeepScale(tieut, 1.3)).toBe(1)
  })

  it('가로줄기 사이 비율을 따로 주면 가로줄기 틈은 그 하한선을 쓴다', () => {
    const scale = counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.5, horizontalRatio: 0.25 })
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.25 * 0.07 * 1.95, 4)
  })

  it('동그라미 윗부분과 보 사이(ㅎ)는 쌓인 가로줄기가 아니다', () => {
    // ㅎ: 보 아래 작은 ㅇ. 동그라미 토막은 짧아 가로줄기 비율을 안 쓴다 — 두 하한선이 같은 결과.
    const hieut = [line('beam', [[0.2, 0.3], [0.8, 0.3]]), circle(0.5, 0.55, 0.15)]
    expect(counterKeepScale(hieut, 1.95, { fixed: 0.024, ratio: 0.5, horizontalRatio: 0.25 })).toBeCloseTo(counterKeepScale(hieut, 1.95, { fixed: 0.024, ratio: 0.5 }), 6)
  })

  it('가로줄기를 덜 굵게 하면 하한선 때문에 덜 굵어질 몫이 준다', () => {
    const floor = { fixed: 0.024, ratio: 0.25 }
    // 가로 몫 0.6: 가로줄기 반 두께가 0.035 × 1.57로만 자라 틈이 넉넉하다.
    expect(counterKeepScale(tieut, 1.95, floor, 1, 0.6)).toBeGreaterThan(counterKeepScale(tieut, 1.95, floor))
  })

  it('가로 몫이 낮아도 굵기 400에서 놓아 준 좁은 틈은 그대로 놓아 준다', () => {
    const narrow = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.6], [0.8, 0.6]])]
    expect(counterKeepScale(narrow, 1.95, { fixed: 0.024, ratio: 0.25 }, 1, 0.6)).toBe(1)
  })

  it('하한선을 올리면 덜 굵어진다', () => {
    expect(counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.5 })).toBeLessThan(counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.25 }))
  })

  it('굵기 400에서 이미 하한선보다 좁던 틈은 놓아 준다', () => {
    // 틈 0.03(30u) < 하한선 0.034 → 안 지킨다. 남길 몫 방식이면 자소 전체가 얇아졌다(ㅆ).
    const narrow = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.6], [0.8, 0.6]])]
    expect(counterKeepScale(narrow, 1.95, { fixed: 0.024, ratio: 0.25 })).toBe(1)
  })

  it('한 획으로 그린 ㄹ도 가로줄기 사이를 지킨다', () => {
    const rieul = [line('r', [[0.2, 0.1], [0.8, 0.1], [0.8, 0.254], [0.2, 0.254], [0.2, 0.408], [0.8, 0.408]])]
    expect(counterKeepScale(rieul, 1.95)).toBeLessThan(1)
    expect(counterKeepScale(rieul, 1.95)).toBeCloseTo(counterKeepScale(tieut, 1.95), 4)
  })

  it('ㅇ 둘레의 이웃 토막은 틈으로 안 본다', () => {
    // 지름 0.3이면 속공간이 넉넉해 굵기 900도 다 굵어진다.
    expect(counterKeepScale([circle(0.5, 0.5, 0.15)], 1.95)).toBe(1)
    // 작은 ㅇ은 안쪽 지름을 지킨다.
    const small = counterKeepScale([circle(0.5, 0.5, 0.08)], 1.95)
    expect(small).toBeLessThan(1)
  })

  it('ㅅ 두 다리처럼 이음 자리에서 벌어지는 쐐기는 틈으로 안 본다', () => {
    // 꼭대기에서 만나 곡선으로 벌어지는 두 획. 틈이 0부터 연속이라 지키면 자소 전체가 굵기 400에 묶인다.
    const leg = (id: string, side: number) => line(id, Array.from({ length: 16 }, (_, i): [number, number] => [0.5 + side * 0.3 * Math.sin(i / 15 * Math.PI / 2), 0.2 + 0.6 * i / 15]))
    expect(counterKeepScale([leg('l', -1), leg('r', 1)], 1.95)).toBe(1)
  })

  it('엇갈린 두 다리(ㅆ 안쪽 X)는 틈으로 안 본다', () => {
    const left = line('l', [[0.4, 0.2], [0.6, 0.8]])
    const right = line('r', [[0.6, 0.2], [0.4, 0.8]])
    expect(counterKeepScale([left, right], 1.95)).toBe(1)
  })

  it('원래 붙여 그린 틈(두께의 1/4 아래)은 안 지킨다', () => {
    const tight = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.585], [0.8, 0.585]])]
    expect(counterKeepScale(tight, 1.95)).toBe(1)
  })
})
