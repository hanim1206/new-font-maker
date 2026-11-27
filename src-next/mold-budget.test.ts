import { describe, expect, it } from 'vitest'
import { EVEN, thinBudget, THIN_FLOOR, WIDEN_MAX, type BudgetStroke } from './moldBudget'

// ㅃ처럼 나란한 세로획 둘(em). 칸이 좁아지면 사이가 준다.
const pair = (gap: number, t = 0.06): BudgetStroke[] => [
  { part: 'CH', id: 'a', closed: false, thickness: t, points: [{ x: 0.2, y: 0.1 }, { x: 0.2, y: 0.4 }] },
  { part: 'CH', id: 'b', closed: false, thickness: t, points: [{ x: 0.2 + gap, y: 0.1 }, { x: 0.2 + gap, y: 0.4 }] },
]
const thin = (...args: Parameters<typeof thinBudget>) => thinBudget(...args).factors

describe('좁은 칸 굵기 예산(줄 끝 균형 규칙 ①)', () => {
  it('처음 칸 그대로면 안 바꾼다', () => {
    expect(thinBudget(pair(0.12), pair(0.12), 0)).toEqual({ factors: {}, widen: {} })
  })
  it('칸이 좁아져 틈이 바닥(0.025em, 세로줄기 0.2배) 아래로 가면 두 획이 같이 가늘어진다', () => {
    const out = thin(pair(0.07), pair(0.12), 0)
    // 중심 거리 0.07, 바닥 max(0.025, 0.012) = 0.025 → 두께 0.045 = 0.06 × 0.75
    expect(out['CH:a']).toBeCloseTo(0.75, 6)
    expect(out['CH:b']).toBeCloseTo(0.75, 6)
  })
  it('빈 자리가 있으면 가늘게 하기 전에 칸부터 넓힌다', () => {
    // 모자란 배율 (0.025 + 0.06) / 0.08 = 1.0625 < WIDEN_MAX → 넓히기만, 획은 그대로.
    const out = thinBudget(pair(0.08), pair(0.12), 0, { CH: { x: 2, y: 2 } })
    expect(out.factors).toEqual({})
    expect(out.widen.CH?.x).toBeCloseTo(1.0625, 6)
  })
  it(`넓힘은 ${WIDEN_MAX}배 · 빈 자리까지, 남은 만큼만 가늘게`, () => {
    const out = thinBudget(pair(0.07), pair(0.12), 0, { CH: { x: 1.05, y: 2 } })
    expect(out.widen.CH?.x).toBeCloseTo(1.05, 6)
    // 중심 거리 0.0735 → 두께 0.0485 = 0.06 × 0.8083
    expect(out.factors['CH:a']).toBeCloseTo((0.0735 - 0.025) / 0.06, 6)
  })
  it('처음부터 좁던 쌍은 그 처음 틈까지만 지킨다', () => {
    expect(thin(pair(0.075), pair(0.075), 0)).toEqual({})
  })
  it('처음 칸에서 마주 보지 않던 쌍(ㅅ 두 삐침)은 틈이 아니다', () => {
    const ref: BudgetStroke[] = [
      { part: 'CH', id: 'a', closed: false, thickness: 0.06, points: [{ x: 0.3, y: 0.1 }, { x: 0.1, y: 0.4 }] },
      { part: 'CH', id: 'b', closed: false, thickness: 0.06, points: [{ x: 0.3, y: 0.1 }, { x: 0.5, y: 0.4 }] },
    ]
    expect(thin(pair(0.03), ref, 0)).toEqual({})
  })
  it('대비로 세로가 굵어져 막히면 세로획이 가늘어진다(처음 틈은 대비 0으로 잰다)', () => {
    expect(thin(pair(0.1), pair(0.1), 0.97)['CH:a']).toBeLessThan(1)
  })
  it(`아무리 좁아도 처음 굵기의 ${THIN_FLOOR}배(노토 900) 아래로는 안 간다`, () => {
    expect(thin(pair(0.03), pair(0.12), 0)['CH:a']).toBe(THIN_FLOOR)
  })
  it(`같은 결 획은 가장 가는 것의 1/${EVEN}배까지만 굵다`, () => {
    const now = [...pair(0.03), { part: 'JU' as const, id: 'c', closed: false, thickness: 0.06, points: [{ x: 0.7, y: 0.1 }, { x: 0.7, y: 0.9 }] }]
    const out = thin(now, [...pair(0.12), now[2]], 0)
    expect(out['JU:c']).toBeCloseTo(THIN_FLOOR / EVEN, 6)
  })
  it('다른 자소끼리는 안 본다', () => {
    const strokes = pair(0.05); strokes[1] = { ...strokes[1], part: 'JU' }
    expect(thin(strokes, pair(0.12), 0)).toEqual({})
  })
})
