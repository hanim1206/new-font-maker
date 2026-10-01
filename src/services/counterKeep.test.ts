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

  it('빽빽한 가로줄기는 틈의 절반이 남을 만큼만 굵어진다', () => {
    // 한계 k = (0.084 + 0.07 − 0.5 × 0.084) / 0.07 = 1.6 → 1.95 대신 1.6.
    const scale = counterKeepScale(tieut, 1.95)
    expect(scale * 1.95).toBeCloseTo(1.6, 3)
    // 남는 틈 = 0.154 − 1.6 × 0.07 = 0.042 = 굵기 400 틈의 절반.
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.042, 3)
  })

  it('넉넉하면 다 굵어진다', () => {
    expect(counterKeepScale(tieut, 1.3)).toBe(1)
  })

  it('남길 몫을 키우면 덜 굵어진다', () => {
    expect(counterKeepScale(tieut, 1.95, 0.7)).toBeLessThan(counterKeepScale(tieut, 1.95, 0.3))
  })

  it('한 획으로 그린 ㄹ도 가로줄기 사이를 지킨다', () => {
    const rieul = [line('r', [[0.2, 0.1], [0.8, 0.1], [0.8, 0.254], [0.2, 0.254], [0.2, 0.408], [0.8, 0.408]])]
    expect(counterKeepScale(rieul, 1.95) * 1.95).toBeCloseTo(1.6, 3)
  })

  it('ㅇ 둘레의 이웃 토막은 틈으로 안 본다', () => {
    // 지름 0.3이면 속공간이 넉넉해 굵기 900도 다 굵어진다.
    expect(counterKeepScale([circle(0.5, 0.5, 0.15)], 1.95)).toBe(1)
    // 작은 ㅇ은 안쪽 지름을 지킨다.
    const small = counterKeepScale([circle(0.5, 0.5, 0.08)], 1.95)
    expect(small).toBeLessThan(1)
  })

  it('원래 붙여 그린 틈(두께의 1/4 아래)은 안 지킨다', () => {
    const tight = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.585], [0.8, 0.585]])]
    expect(counterKeepScale(tight, 1.95)).toBe(1)
  })
})
