import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../types'
import { easeBendForFamily } from './giyeokBendEase'

const giyeok: StrokeDataV2 = {
  id: 'ㄱ-1',
  points: [{ x: 0, y: 0 }, { x: 0.976, y: 0, handleOut: { x: 0.976, y: 0.5 } }, { x: 0.056, y: 1 }],
  closed: false,
  thickness: 0.07,
}
const bar: StrokeDataV2 = { id: 'ㅋ-3', points: [{ x: 0, y: 0.445 }, { x: 0.783, y: 0.445 }], closed: false, thickness: 0.07 }

describe('easeBendForFamily', () => {
  it('오른 벌 · 벌 모름은 그대로', () => {
    expect(easeBendForFamily('ㄱ', [giyeok], 'right')).toEqual([giyeok])
    expect(easeBendForFamily('ㄱ', [giyeok], null)).toEqual([giyeok])
  })

  it('아래 벌은 굽음(꺾임 − 내림 끝)에 비율을 곱하고 꺾임 · 가로획은 그대로', () => {
    const [out] = easeBendForFamily('ㄱ', [giyeok], 'bottom', { bottom: 0.1, mixed: 0.05 })
    expect(out.points[0]).toEqual(giyeok.points[0])
    expect(out.points[1].x).toBe(0.976)
    expect(out.points[2].x).toBeCloseTo(0.976 - 0.92 * 0.1)
    const [mixed] = easeBendForFamily('ㄱ', [giyeok], 'mixed', { bottom: 0.1, mixed: 0.05 })
    expect(mixed.points[2].x).toBeCloseTo(0.976 - 0.92 * 0.05)
  })

  it('끄면(false) 그대로, 비율 1이면 그대로', () => {
    expect(easeBendForFamily('ㄱ', [giyeok], 'bottom', false)).toEqual([giyeok])
    expect(easeBendForFamily('ㄱ', [giyeok], 'bottom', { bottom: 1, mixed: 1 })).toEqual([giyeok])
  })

  it('살짝 굽은 ㄱ(바닥 = 비율 × 0.92보다 덜 굽음)은 고 · 과에서도 그대로', () => {
    const mild = { ...giyeok, points: [{ x: 0, y: 0 }, { x: 0.976, y: 0 }, { x: 0.92, y: 1, handleIn: { x: 0.995, y: 0.585 } }] }
    expect(easeBendForFamily('ㄱ', [mild], 'bottom')[0]).toBe(mild)
  })

  it('ㄱ 무리가 아니면(ㅈ 삐침 등) 손 안 댐', () => {
    expect(easeBendForFamily('ㅈ', [giyeok], 'bottom')).toEqual([giyeok])
  })

  it('ㅋ 가운데 가로획 끝은 굽은 내림을 따라간다', () => {
    const k = { ...giyeok, id: 'ㅋ-1', points: [{ x: 0, y: 0 }, { x: 0.972, y: 0, handleOut: { x: 0.972, y: 0.5 } }, { x: 0.052, y: 1 }] }
    const [, eased] = easeBendForFamily('ㅋ', [k, bar], 'bottom', { bottom: 0, mixed: 0 })
    // 굽음 0이면 내림이 곧게 서고, 가로획 끝은 원래처럼 내림보다 0.007 안쪽
    expect(eased.points[1].x).toBeCloseTo(0.965, 2)
    expect(eased.points[0]).toEqual(bar.points[0])
  })
})
