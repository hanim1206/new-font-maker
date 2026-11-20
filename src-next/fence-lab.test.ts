import { describe, expect, it } from 'vitest'
import { answersText, FENCE_ITEMS, fenceShift } from './fenceLab'

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
})
