import { describe, expect, it } from 'vitest'
import type { BoxConfig, Part } from '../src/types'
import { engineGapOf, inkOfThick, solveBalloon, type BalloonStroke } from './moldBalloon'

const T = 0.07
const bar = (part: Part, y: number, x0: number, x1: number): BalloonStroke => ({ part, thickness: T, points: [{ x: x0, y }, { x: x1, y }] })
const stem = (part: Part, x: number, y0: number, y1: number): BalloonStroke => ({ part, thickness: T, points: [{ x, y: y0 }, { x, y: y1 }] })
const one = { v: 1, h: 1 }
/** 가로줄기 사이 흰 틈(중심 거리 − 두 반 두께). */
const gapsOf = (ys: number[], th: number[]) => ys.slice(1).map((y, i) => y - ys[i] - (th[i] + th[i + 1]) / 2)

describe('풍선 굵기', () => {
  it('굵기를 안 올리면 아무것도 안 바꾼다', () => {
    const boxes = { CH: { x: 0.1, y: 0.1, width: 0.5, height: 0.6 } }
    const out = solveBalloon({ strokes: [bar('CH', 0.1, 0.1, 0.6), bar('CH', 0.7, 0.1, 0.6)], boxes, base: one, want: one })
    expect(out.boxes).toBe(boxes)
    expect(out.thick.CH).toEqual(one)
  })

  it('한 자소에 가로줄기 셋이 쌓였으면 (칸 − 엔진 틈 바닥 × 2) ÷ 3까지만 굵어진다. 기둥은 바라는 대로', () => {
    // ㅌ 꼴: 가로줄기 셋 + 왼쪽 기둥. 잉크 칸 키 = 0.4 + 0.07.
    const box: BoxConfig = { x: 0.2, y: 0.3, width: 0.4, height: 0.4 }
    const strokes = [bar('CH', 0.3, 0.2, 0.6), bar('CH', 0.5, 0.2, 0.6), bar('CH', 0.7, 0.2, 0.6), stem('CH', 0.2, 0.3, 0.7)]
    const out = solveBalloon({ strokes, boxes: { CH: box }, base: one, want: { v: 4, h: 4 } })
    // 흰 틈 바닥은 엔진 하나(그 글자 세로줄기의 0.2배, 최소 0.025em): 3t + 2 × 바닥 = 칸.
    const cell = 0.47, t = out.thick.CH.h * T
    expect(3 * t + 2 * engineGapOf(out.thick.CH.v * T)).toBeCloseTo(cell, 2)
    // 잉크 바깥 끝은 그대로: 중심선 칸이 굵어진 만큼 안으로.
    const b = out.boxes.CH!
    expect(b.y - out.thick.CH.h * T / 2).toBeCloseTo(0.3 - T / 2, 2)
    expect(b.y + b.height + out.thick.CH.h * T / 2).toBeCloseTo(0.7 + T / 2, 2)
    expect(out.thick.CH.v).toBeGreaterThan(out.thick.CH.h)
  })

  it('를 꼴(ㄹ · ㅡ · ㄹ): 가로줄기 일곱이 겹치지 않고, 자소끼리 굵기가 크게 갈리지 않는다', () => {
    const rieul = (part: Part, top: number): BalloonStroke[] => [bar(part, top, 0.2, 0.8), bar(part, top + 0.1, 0.2, 0.8), bar(part, top + 0.2, 0.2, 0.8), stem(part, 0.8, top, top + 0.1), stem(part, 0.2, top + 0.1, top + 0.2)]
    const strokes = [...rieul('CH', 0.1), bar('JU', 0.5, 0.1, 0.9), ...rieul('JO', 0.7)]
    const boxes = { CH: { x: 0.2, y: 0.1, width: 0.6, height: 0.2 }, JU: { x: 0.1, y: 0.5, width: 0.8, height: 0 }, JO: { x: 0.2, y: 0.7, width: 0.6, height: 0.2 } }
    for (const k of [1.5, 2.3, 4]) {
      const out = solveBalloon({ strokes, boxes, base: one, want: { v: k, h: k } })
      const yOf = (part: Part, unit: number) => { const b = out.boxes[part]!; return b.y + unit * b.height }
      const ys = [yOf('CH', 0), yOf('CH', 0.5), yOf('CH', 1), yOf('JU', 0), yOf('JO', 0), yOf('JO', 0.5), yOf('JO', 1)]
      const th = [out.thick.CH.h, out.thick.CH.h, out.thick.CH.h, out.thick.JU.h, out.thick.JO.h, out.thick.JO.h, out.thick.JO.h].map((m) => m * T)
      gapsOf(ys, th).forEach((gap, i) => expect(gap).toBeGreaterThan(engineGapOf(Math.max(th[i], th[i + 1])) - 0.006))
      expect(Math.min(...th) / Math.max(...th)).toBeGreaterThan(0.7)
      // 글자 바깥 끝은 안 넘는다.
      expect(ys[0] - th[0] / 2).toBeGreaterThan(0.1 - T / 2 - 0.005)
      expect(ys[6] + th[6] / 2).toBeLessThan(0.9 + T / 2 + 0.005)
    }
  })

  it('가 꼴: 첫닿자가 기둥 쪽으로 커지되 흰 틈이 바닥 아래로 안 간다', () => {
    const strokes = [bar('CH', 0.2, 0.15, 0.5), stem('CH', 0.5, 0.2, 0.7), stem('JU', 0.75, 0.1, 0.9), bar('JU', 0.5, 0.75, 0.9)]
    const boxes = { CH: { x: 0.15, y: 0.2, width: 0.35, height: 0.5 }, JU: { x: 0.75, y: 0.1, width: 0.15, height: 0.8 } }
    const gapAt = (k: number) => {
      const out = solveBalloon({ strokes, boxes, base: one, want: { v: k, h: k } })
      const ch = out.boxes.CH!, ju = out.boxes.JU!
      return { gap: ju.x - out.thick.JU.v * T / 2 - (ch.x + ch.width + out.thick.CH.v * T / 2), out }
    }
    const start = 0.75 - 0.5 - T
    expect(gapAt(1.5).gap).toBeLessThan(start)
    const floorAt = (k: number) => { const { out } = gapAt(k); return engineGapOf(Math.max(out.thick.CH.v, out.thick.JU.v) * T) }
    expect(gapAt(1.5).gap).toBeGreaterThan(floorAt(1.5) - 0.004)
    expect(gapAt(4).gap).toBeGreaterThan(floorAt(4) - 0.004)
    expect(gapAt(4).gap).toBeLessThan(0.06)
    // 기둥의 오른쪽 잉크 끝(글자 바깥)은 그대로.
    const ju = gapAt(4).out
    expect(ju.boxes.JU!.x + ju.boxes.JU!.width).toBeLessThanOrEqual(0.9 + 1e-6)
  })

  it('굵기 한 쌍을 엔진의 두께 배율 · 대비로 바꿨다 되돌리면 같다', () => {
    for (const thick of [{ v: 2, h: 1.3 }, { v: 1.2, h: 1.8 }, { v: 3, h: 3 }]) {
      const { multiplier, contrast } = inkOfThick(thick)
      const v = multiplier * (contrast >= 0 ? 1 + 0.8 * contrast : 1 + 0.5 * contrast), h = multiplier * (contrast >= 0 ? 1 - 0.45 * contrast : 1 - 0.5 * contrast)
      expect(v).toBeCloseTo(thick.v, 5)
      expect(h).toBeCloseTo(thick.h, 5)
    }
  })
})
