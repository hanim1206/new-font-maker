import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../types'
import { adoptStrokeRoles, closeIfNear, matchStrokeRoles, ROLE_MATCH_TAU_CANDIDATES, strokeRoleScore } from './strokeRoleMatch'

const stroke = (id: string, points: [number, number][], closed = false): StrokeDataV2 => ({
  id, closed, thickness: .07, points: points.map(([x, y]) => ({ x, y })),
})

/** baseJamos.json의 ㄱ · ㅏ · ㅅ · ㅇ 프리셋과 같은 모양. */
const PRESET_ㄱ = [stroke('ㄱ-1', [[0, 0], [.98, 0], [.98, 1]])]
const PRESET_ㅏ = [stroke('ㅏ-1', [[0, 0], [0, 1]]), stroke('ㅏ-2', [[0, .5], [1, .5]])]
const PRESET_ㅅ = [stroke('ㅅ-left', [[.52, .01], [0, 1]]), stroke('ㅅ-right', [[.49, 0], [1, .96]])]
const PRESET_ㅇ = [{ ...stroke('ㅇ-circle', [[.5, 0], [1, .5], [.5, 1], [0, .5]], true), points: [
  { x: .5, y: 0, handleIn: { x: .22, y: 0 }, handleOut: { x: .78, y: 0 } },
  { x: 1, y: .5, handleIn: { x: 1, y: .22 }, handleOut: { x: 1, y: .78 } },
  { x: .5, y: 1, handleIn: { x: .78, y: 1 }, handleOut: { x: .22, y: 1 } },
  { x: 0, y: .5, handleIn: { x: 0, y: .78 }, handleOut: { x: 0, y: .22 } },
] }]

describe('그린 획에 역할 붙이기', () => {
  it('비슷하게 그은 ㄱ은 ㄱ-1을 승계한다', () => {
    const drawn = [stroke('stroke-1', [[.05, .08], [.9, .05], [.92, .95]])]
    const match = matchStrokeRoles(drawn, PRESET_ㄱ)
    expect(match.state).toBe('recognized')
    const { strokes, state } = adoptStrokeRoles(drawn, PRESET_ㄱ, match)
    expect(state).toBe('recognized')
    expect(strokes[0].id).toBe('ㄱ-1')
    expect(strokes[0].points[0]).toEqual({ x: .05, y: .08 })
  })

  it('ㅏ를 순서도 방향도 거꾸로 그어도 id와 방향이 프리셋에 맞는다', () => {
    const drawn = [stroke('a', [[.95, .52], [.05, .5]]), stroke('b', [[.02, .97], [.01, .03]])]
    const match = matchStrokeRoles(drawn, PRESET_ㅏ)
    expect(match.state).toBe('recognized')
    const { strokes } = adoptStrokeRoles(drawn, PRESET_ㅏ, match)
    expect(strokes.map((s) => s.id)).toEqual(['ㅏ-1', 'ㅏ-2'])
    // 기둥은 위에서 아래로, 곁줄기는 왼쪽에서 오른쪽으로
    expect(strokes[0].points[0].y).toBeLessThan(strokes[0].points[1].y)
    expect(strokes[1].points[0].x).toBeLessThan(strokes[1].points[1].x)
  })

  it('ㅅ을 한 획만 그으면 일부 자유 — 빠진 획을 알린다', () => {
    const drawn = [stroke('a', [[.5, .02], [.02, .98]])]
    const match = matchStrokeRoles(drawn, PRESET_ㅅ)
    expect(match.state).toBe('partial')
    expect(match.pairs[0].preset).toBe(0)
    expect(match.missing).toEqual([1])
  })

  it('ㅇ을 한 바퀴 돌려 끝이 두께 안이면 닫힌 ㅇ-circle, 반만 그으면 자유 획', () => {
    const ring = (from: number, to: number, n: number, r = .5): [number, number][] => Array.from({ length: n }, (_, i) => {
      const a = (from + (to - from) * (i / (n - 1))) * Math.PI / 180
      return [.5 + r * Math.cos(a), .5 + r * Math.sin(a)]
    })
    const closed = [stroke('a', ring(0, 358, 13))]
    const closedMatch = matchStrokeRoles(closed, PRESET_ㅇ)
    const adopted = adoptStrokeRoles(closed, PRESET_ㅇ, closedMatch)
    expect(adopted.state).toBe('recognized')
    expect(adopted.strokes[0].id).toBe('ㅇ-circle')
    expect(adopted.strokes[0].closed).toBe(true)
    expect(adopted.strokes[0].points).toHaveLength(12)

    const half = [stroke('a', ring(180, 360, 7))]
    const halfMatch = matchStrokeRoles(half, PRESET_ㅇ)
    const halfAdopted = adoptStrokeRoles(half, PRESET_ㅇ, halfMatch, { jamoKey: 'ㅇ' })
    expect(halfAdopted.state).toBe('free')
    expect(halfAdopted.strokes[0].id).toBe('pen-ㅇ-1')
    expect(halfAdopted.strokes[0].closed).toBe(false)
  })

  it('남는 획은 자유 획으로 뒤에 붙고 두께는 프리셋 값을 따른다', () => {
    const drawn = [stroke('a', [[0, .02], [.97, .03], [.96, .98]]), { ...stroke('b', [[.2, .5], [.8, .6]]), thickness: .2 }]
    const match = matchStrokeRoles(drawn, PRESET_ㄱ)
    const { strokes, state, freeIds } = adoptStrokeRoles(drawn, PRESET_ㄱ, match, { jamoKey: 'ㄱ' })
    expect(state).toBe('partial')
    expect(strokes.map((s) => s.id)).toEqual(['ㄱ-1', 'pen-ㄱ-1'])
    expect(freeIds).toEqual(['pen-ㄱ-1'])
    expect(strokes[1].thickness).toBe(.07)
  })

  it('일부러 다르게 그으면(ㅏ 기둥 자리에 가로선) 잘못 붙이지 않는다', () => {
    const drawn = [stroke('a', [[0, .1], [1, .1]]), stroke('b', [[0, .9], [1, .9]])]
    const match = matchStrokeRoles(drawn, PRESET_ㅏ)
    // 둘 다 가로선이라 ㅏ-1(기둥)에는 붙지 않는다
    expect(match.pairs.some((pair) => pair.preset === 0)).toBe(false)
  })

  it('문턱이 높을수록 짝이 줄거나 같다', () => {
    const drawn = [stroke('a', [[.1, .1], [.9, .2], [.85, .9]]), stroke('b', [[.3, .5], [.7, .55]])]
    const counts = ROLE_MATCH_TAU_CANDIDATES.map((tau) => matchStrokeRoles(drawn, PRESET_ㄱ, { tau }).pairs.length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
  })

  it('점수는 같은 획이면 1, 직각으로 돌리면 각도 점수를 잃는다', () => {
    expect(strokeRoleScore(PRESET_ㅏ[0], PRESET_ㅏ[0])).toBeCloseTo(1, 6)
    const turned = stroke('t', [[0, .5], [1, .5]])
    const score = strokeRoleScore(turned, PRESET_ㅏ[0])
    expect(score).toBeLessThan(.65)
  })

  it('closeIfNear는 끝이 멀거나 점이 적으면 null', () => {
    expect(closeIfNear(stroke('a', [[0, 0], [1, 0], [1, 1]]), .07)).toBeNull()
    expect(closeIfNear(stroke('a', [[0, 0], [1, 0], [1, 1], [0, .5]]), .07)).toBeNull()
    expect(closeIfNear(stroke('a', [[0, 0], [1, 0], [1, 1], [0, 1], [.02, .03]]), .07)?.points).toHaveLength(4)
  })
})
