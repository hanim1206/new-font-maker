import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../types'
import { adoptStrokeRoles, closeIfNear, fitStrokesToPresetBounds, matchStrokeRoles, ROLE_MATCH_TAU_CANDIDATES, strokeRoleScore } from './strokeRoleMatch'

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

  it('작게 치우쳐 그린 ㄱ은 프리셋 범위에 꽉 채워진 뒤 인식된다', () => {
    const tiny = [stroke('a', [[.6, .6], [.8, .6], [.8, .85]])]
    expect(matchStrokeRoles(tiny, PRESET_ㄱ).state).toBe('free')
    const filled = fitStrokesToPresetBounds(tiny, PRESET_ㄱ)
    expect(filled[0].points[0].x).toBeCloseTo(0, 6)
    expect(filled[0].points[1].x).toBeCloseTo(.98, 6)
    expect(filled[0].points[2].y).toBeCloseTo(1, 6)
    expect(matchStrokeRoles(filled, PRESET_ㄱ).state).toBe('recognized')
  })

  it('꽉 채우기는 자모 전체 범위로 한 번에 옮겨 획 사이 비율을 지키고, 납작한 축은 가운데만 맞춘다', () => {
    const drawn = [stroke('a', [[.3, .3], [.3, .5]]), stroke('b', [[.3, .4], [.4, .4]])]
    const filled = fitStrokesToPresetBounds(drawn, PRESET_ㅏ)
    // 기둥 길이 .2 → 1, 곁줄기 .1 → .5 (같은 배율은 아니지만 자모 범위가 통째로 맞는다)
    expect(filled[0].points[1].y - filled[0].points[0].y).toBeCloseTo(1, 6)
    expect(filled[1].points[1].x - filled[1].points[0].x).toBeCloseTo(1, 6)
    // ㅣ처럼 프리셋 가로 범위가 0이면 가로는 세로 배율로 늘리고 가운데(0.5)에 둔다
    const bar = [stroke('a', [[.2, .3], [.22, .6]])]
    const [fit] = fitStrokesToPresetBounds(bar, [stroke('ㅣ-1', [[.5, 0], [.5, 1]])])
    expect((fit.points[0].x + fit.points[1].x) / 2).toBeCloseTo(.5, 6)
    expect(fit.points[0].y).toBeCloseTo(0, 6)
    expect(fit.points[1].y).toBeCloseTo(1, 6)
  })

  it('꽉 채우기 범위는 곡선이 앵커 밖으로 불룩한 만큼까지 센다', () => {
    // 앵커는 y .5에 둘뿐이지만 핸들이 위로 솟아 곡선은 y ≈ .2까지 간다
    const arch: StrokeDataV2 = { id: 'a', closed: false, thickness: .07, points: [
      { x: .1, y: .5, handleOut: { x: .3, y: .1 } },
      { x: .9, y: .5, handleIn: { x: .7, y: .1 } },
    ] }
    const [fit] = fitStrokesToPresetBounds([arch], [stroke('p', [[0, 0], [1, 0], [1, 1]])])
    // 곡선 꼭대기(≈.2)가 0으로, 앵커(.5)가 1로 — 앵커만 재면 앵커가 0과 1에 붙어 꼭대기가 상자 밖으로 나갔을 것
    const top = Math.min(...[0, .25, .5, .75, 1].map((t) => { const u = 1 - t; const a = fit.points[0], b = fit.points[1]; return u * u * u * a.y + 3 * u * u * t * a.handleOut!.y + 3 * u * t * t * b.handleIn!.y + t * t * t * b.y }))
    expect(top).toBeGreaterThanOrEqual(-1e-6)
    expect(fit.points[0].y).toBeCloseTo(1, 6)
  })

  it('closeIfNear는 끝이 멀거나 점이 적으면 null', () => {
    expect(closeIfNear(stroke('a', [[0, 0], [1, 0], [1, 1]]), .07)).toBeNull()
    expect(closeIfNear(stroke('a', [[0, 0], [1, 0], [1, 1], [0, .5]]), .07)).toBeNull()
    expect(closeIfNear(stroke('a', [[0, 0], [1, 0], [1, 1], [0, 1], [.02, .03]]), .07)?.points).toHaveLength(4)
  })
})
