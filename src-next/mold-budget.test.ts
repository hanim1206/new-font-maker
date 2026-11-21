import { describe, expect, it } from 'vitest'
import { thinBudget, THIN_FLOOR, type BudgetStroke } from './moldBudget'

// ㅃ처럼 나란한 세로획 둘(em). 칸이 좁아지면 사이가 준다.
const pair = (gap: number, t = 0.06): BudgetStroke[] => [
  { part: 'CH', id: 'a', closed: false, thickness: t, points: [{ x: 0.2, y: 0.1 }, { x: 0.2, y: 0.4 }] },
  { part: 'CH', id: 'b', closed: false, thickness: t, points: [{ x: 0.2 + gap, y: 0.1 }, { x: 0.2 + gap, y: 0.4 }] },
]

describe('좁은 칸 굵기 예산(줄 끝 균형 규칙 ①)', () => {
  it('처음 칸 그대로면 안 바꾼다', () => {
    expect(thinBudget(pair(0.12), pair(0.12), 0)).toEqual({})
  })
  it('칸이 좁아져 틈이 바닥(0.025em, 세로줄기 0.2배) 아래로 가면 두 획이 같이 가늘어진다', () => {
    const out = thinBudget(pair(0.07), pair(0.12), 0)
    // 중심 거리 0.07, 바닥 max(0.025, 0.012) = 0.025 → 두께 0.045 = 0.06 × 0.75
    expect(out['CH:a']).toBeCloseTo(0.75, 6)
    expect(out['CH:b']).toBeCloseTo(0.75, 6)
  })
  it('처음부터 좁던 쌍은 그 처음 틈까지만 지킨다', () => {
    expect(thinBudget(pair(0.075), pair(0.075), 0)).toEqual({})
  })
  it('대비로 세로가 굵어져 막히면 세로획이 가늘어진다(처음 틈은 대비 0으로 잰다)', () => {
    const out = thinBudget(pair(0.1), pair(0.1), 0.97)
    expect(out['CH:a']).toBeLessThan(1)
  })
  it(`아무리 좁아도 처음 굵기의 ${THIN_FLOOR}배 아래로는 안 간다`, () => {
    expect(thinBudget(pair(0.03), pair(0.12), 0)['CH:a']).toBe(THIN_FLOOR)
  })
  it('다른 자소끼리는 안 본다', () => {
    const strokes = pair(0.05); strokes[1] = { ...strokes[1], part: 'JU' }
    expect(thinBudget(strokes, pair(0.12), 0)).toEqual({})
  })
})
