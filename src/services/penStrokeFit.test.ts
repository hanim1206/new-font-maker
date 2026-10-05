import { describe, expect, it } from 'vitest'
import { fitPenStroke, PEN_FIT_EPSILON_CANDIDATES, penCornerIndices, penFitDeviation, thinPenPoints } from './penStrokeFit'
import type { PenPoint } from './penStrokeFit'

/** 시드 고정 난수 — 펜 떨림 흉내. 같은 시드면 같은 점. */
function jitter(seed: number, amount: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return (state / 4294967296 - 0.5) * 2 * amount
  }
}

/** a → b를 n점으로, 떨림 `wobble`. */
function line(a: PenPoint, b: PenPoint, n: number, wobble = 0, seed = 1): PenPoint[] {
  const noise = jitter(seed, wobble)
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return { x: a.x + (b.x - a.x) * t + noise(), y: a.y + (b.y - a.y) * t + noise() }
  })
}

/** 중심 c, 반지름 r, 각도 from→to(도)의 호를 n점으로. */
function arc(c: PenPoint, r: number, from: number, to: number, n: number, wobble = 0, seed = 2): PenPoint[] {
  const noise = jitter(seed, wobble)
  return Array.from({ length: n }, (_, i) => {
    const angle = ((from + (to - from) * (i / (n - 1))) * Math.PI) / 180
    return { x: c.x + r * Math.cos(angle) + noise(), y: c.y + r * Math.sin(angle) + noise() }
  })
}

const EPS = 0.01

describe('펜 획 맞춤', () => {
  it('가까운 점은 합치고 끝점은 남긴다', () => {
    const points = [{ x: .1, y: .5 }, { x: .101, y: .5 }, { x: .102, y: .5 }, { x: .5, y: .5 }, { x: .9, y: .5 }, { x: .9005, y: .5 }]
    const thinned = thinPenPoints(points, .004)
    expect(thinned[0]).toEqual({ x: .1, y: .5 })
    expect(thinned[thinned.length - 1]).toEqual({ x: .9005, y: .5 })
    expect(thinned).toHaveLength(3)
  })

  it('떨리는 가로선은 앵커 둘짜리 직선이 된다', () => {
    const result = fitPenStroke(line({ x: .1, y: .5 }, { x: .9, y: .52 }, 60, .003))!
    expect(result.anchorCount).toBe(2)
    expect(result.stroke.points.every((point) => !point.handleIn && !point.handleOut)).toBe(true)
    expect(result.corners).toEqual([])
    expect(result.maxDeviation).toBeLessThanOrEqual(EPS)
  })

  it('ㄱ처럼 꺾은 선은 꺾임점 하나에 앵커 셋', () => {
    const points = [...line({ x: .2, y: .2 }, { x: .8, y: .2 }, 40, .002, 3), ...line({ x: .8, y: .2 }, { x: .8, y: .85 }, 40, .002, 4).slice(1)]
    expect(penCornerIndices(thinPenPoints(points))).toHaveLength(1)
    const result = fitPenStroke(points)!
    expect(result.anchorCount).toBe(3)
    const corner = result.stroke.points[1]
    expect(corner.x).toBeCloseTo(.8, 1)
    expect(corner.y).toBeCloseTo(.2, 1)
    expect(result.maxDeviation).toBeLessThanOrEqual(EPS)
  })

  it('호는 꺾임 없이 곡선 앵커 몇 개로 맞는다', () => {
    const result = fitPenStroke(arc({ x: .5, y: .5 }, .35, 180, 360, 80, .002))!
    expect(result.corners).toEqual([])
    expect(result.anchorCount).toBeLessThanOrEqual(5)
    expect(result.stroke.points[0].handleOut).toBeDefined()
    expect(result.maxDeviation).toBeLessThanOrEqual(EPS)
  })

  // 앵커 수는 쪼개는 자리가 ε마다 달라 ε에 단조롭지 않다(Schneider 방식의 성질). 여기선 성질만 본다: 모든 ε에서 이탈 ≤ ε, 꺾임 없음.
  it('S자 곡선은 어느 허용오차에서도 그 안에서 맞고 꺾임으로 잡히지 않는다', () => {
    const points = [...arc({ x: .5, y: .3 }, .18, 270, 90, 60, .0015, 5), ...arc({ x: .5, y: .66 }, .18, 270, 450, 60, .0015, 6).slice(1)]
    for (const epsilon of PEN_FIT_EPSILON_CANDIDATES) {
      const result = fitPenStroke(points, { epsilon })!
      expect(result.maxDeviation).toBeLessThanOrEqual(epsilon)
      expect(result.corners).toEqual([])
      expect(result.anchorCount).toBeGreaterThanOrEqual(3)
    }
  })

  it('촘촘한 직선의 시작 떨림을 꺾임으로 잡지 않는다', () => {
    for (let seed = 11; seed < 31; seed++) {
      const result = fitPenStroke(line({ x: .1, y: .5 }, { x: .9, y: .5 }, 400, .002, seed))!
      expect(result.corners, `seed ${seed}`).toEqual([])
      expect(result.anchorCount, `seed ${seed}`).toBe(2)
    }
  })

  it('짧은 점 하나 · 톡 찍기는 획이 안 된다', () => {
    expect(fitPenStroke([])).toBeNull()
    expect(fitPenStroke([{ x: .5, y: .5 }])).toBeNull()
    expect(fitPenStroke([{ x: .5, y: .5 }, { x: .501, y: .5 }])).not.toBeNull()
  })

  // 앵커는 그은 점 위라 상자 안이다. 핸들(제어점)은 곡선 바깥으로 나가도 되므로 유한한지만 본다.
  it('맞춘 획의 앵커는 0–1 안, 핸들은 유한하고, 닫히지 않는다', () => {
    const result = fitPenStroke(arc({ x: .5, y: .5 }, .4, 0, 300, 120, .002, 7))!
    expect(result.stroke.closed).toBe(false)
    for (const point of result.stroke.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
      for (const handle of [point.handleIn, point.handleOut]) {
        if (!handle) continue
        expect(Number.isFinite(handle.x) && Number.isFinite(handle.y)).toBe(true)
      }
    }
  })

  it('이탈 거리는 맞춘 선에서 떨어진 만큼이다', () => {
    const stroke = { points: [{ x: 0, y: .5 }, { x: 1, y: .5 }] }
    expect(penFitDeviation([{ x: .5, y: .5 }, { x: .3, y: .53 }], stroke)).toBeCloseTo(.03, 6)
  })
})
