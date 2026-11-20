import { describe, expect, it } from 'vitest'
import { answersText, FENCE_ITEMS, fenceShift, levelName, limitOf, LIMIT_ITEMS, type Answer } from './fenceLab'

describe('울타리 실험지', () => {
  it('값 넷 × 단계 셋이 한 번씩, 같은 값이 붙어 나오지 않는다', () => {
    const keys = FENCE_ITEMS.map((item) => `${item.value}:${item.level}`)
    expect(new Set(keys).size).toBe(12)
    FENCE_ITEMS.slice(1).forEach((item, at) => expect(item.value).not.toBe(FENCE_ITEMS[at].value))
  })

  it('단계가 오를수록 가운데에서 멀어진다', () => {
    const jitter = (level: 0 | 1 | 2) => Math.abs(fenceShift('finalBottom', level, 'choseong-jungseong-vertical-jongseong', 0)!.JO!.dy!)
    expect(jitter(0)).toBeLessThan(jitter(1))
    expect(jitter(1)).toBeLessThan(jitter(2))
    const gap = (level: 0 | 1 | 2) => fenceShift('gap', level, 'choseong-jungseong-vertical', 0)!.CH!.dx!
    // 첫닿을 홀자 쪽(+x)으로 당겨 틈을 좁힌다.
    expect(gap(1) - gap(0)).toBeCloseTo(0.02, 6)
    expect(gap(2) - gap(0)).toBeCloseTo(0.04, 6)
    const top = (level: 0 | 1 | 2) => fenceShift('topLine', level, 'choseong-jungseong-horizontal-jongseong', 0)!.CH!.dy!
    expect(top(2) - top(0)).toBeCloseTo(0.018, 6)
  })

  it('해당 짜임이 아닌 글자는 그대로 둔다', () => {
    expect(fenceShift('finalBottom', 2, 'choseong-jungseong-vertical', 0)).toBeUndefined()
    expect(fenceShift('topLine', 2, 'choseong-jungseong-vertical-jongseong', 0)).toBeUndefined()
    expect(fenceShift('gap', 2, 'choseong-jungseong-horizontal', 0)).toBeUndefined()
    expect(fenceShift('centroid', 2, 'choseong-jungseong-mixed', 0)).toBeUndefined()
  })

  it('결과 글은 12줄과 기대 비교를 담는다', () => {
    const text = answersText(FENCE_ITEMS.map((item) => (item.level === 2 ? 'awkward' : 'ok')))
    expect(text.split('\n')).toHaveLength(13)
    expect(text).not.toContain('기대와 다름')
  })

  it('한계선 문항: 값 셋 × 세 · 네 · 여섯 배, 윗선 차이는 넓은 쪽 한 문항 더, 같은 값이 붙지 않는다', () => {
    expect(LIMIT_ITEMS).toHaveLength(10)
    for (const value of ['topLine', 'gap', 'centroid'] as const) {
      expect(LIMIT_ITEMS.filter((item) => item.value === value && !item.side).map((item) => item.level).sort()).toEqual([3, 4, 6])
    }
    expect(LIMIT_ITEMS.filter((item) => item.side === 'wide')).toEqual([{ value: 'topLine', level: 6, side: 'wide' }])
    LIMIT_ITEMS.slice(1).forEach((item, at) => expect(item.value).not.toBe(LIMIT_ITEMS[at].value))
    expect(levelName(6, 'wide')).toBe('울타리 여섯 배 밖(넓은 쪽)')
  })

  it('윗선 차이는 0에서 멈추고(받침 글자가 받침 없는 글자보다 낮게 시작하지 않는다), 넓은 쪽은 반대로 간다', () => {
    const top = (level: number, side?: 'wide') => fenceShift('topLine', level, 'choseong-jungseong-horizontal-jongseong', 0, side)!.CH!.dy!
    // 엔진 0.057 → 목표 0이면 0.057 내린다. 여섯 배(목표 −0.009)도 0에서 멈춘다.
    expect(top(6)).toBeCloseTo(0.057, 6)
    expect(top(4)).toBeLessThan(top(6))
    expect(top(6, 'wide')).toBeLessThan(0)
  })

  it('한계선은 처음 어색하다고 답한 단계, 다 괜찮으면 null', () => {
    const answers = LIMIT_ITEMS.map((item): Answer => (item.value === 'gap' && item.level >= 4 ? 'awkward' : 'ok'))
    expect(limitOf(LIMIT_ITEMS, answers, 'gap')).toBe(4)
    expect(limitOf(LIMIT_ITEMS, answers, 'centroid')).toBeNull()
    expect(limitOf(LIMIT_ITEMS, [], 'gap')).toBeUndefined()
  })
})
