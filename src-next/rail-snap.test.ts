import { describe, expect, it } from 'vitest'
import { snapRail } from './railSnap'
import type { SnapCandidate } from './railSnap'

/** 기준선 드래그 스냅 우선순위: 모델 → 다른 기준선 → 격자. */

const candidates: SnapCandidate[] = [
  { id: 'initial.roleFaces.right', label: 'CH 오른선', axis: 'x', value: 0.4 },
  { id: 'c0:top', label: '첫닿자 윗변', axis: 'y', value: 0.4 },
]

describe('snapRail', () => {
  it('모델 값 근처면 모델로 붙는다. 다른 기준선이 더 가까워도 모델이 먼저', () => {
    const out = snapRail({ value: 0.412, original: 0.42, axis: 'x', candidates: [{ id: 'r', label: '선', axis: 'x', value: 0.41 }] })
    expect(out.value).toBe(0.42)
    expect(out.hit?.kind).toBe('model')
  })
  it('모델에서 벗어나면 같은 축 기준선에 붙고, 다른 축은 무시한다', () => {
    const out = snapRail({ value: 0.392, original: 0.6, axis: 'x', candidates })
    expect(out.value).toBe(0.4)
    expect(out.hit).toMatchObject({ kind: 'rail', id: 'initial.roleFaces.right', label: 'CH 오른선' })
    const other = snapRail({ value: 0.392, original: 0.6, axis: 'y', candidates: [candidates[0]] })
    expect(other.hit?.kind).not.toBe('rail')
  })
  it('기준선도 없으면 1/16 격자에, 1/4 자리면 굵은선 이름으로', () => {
    expect(snapRail({ value: 0.255, original: 0.6, axis: 'x', candidates: [] })).toMatchObject({ value: 0.25, hit: { kind: 'grid', label: '격자 1/4' } })
    expect(snapRail({ value: 0.31, original: 0.6, axis: 'x', candidates: [] })).toMatchObject({ value: 0.3125, hit: { kind: 'grid', label: '격자 1/16' } })
  })
  it('아무 데도 안 걸리면 값 그대로', () => {
    const out = snapRail({ value: 0.29, original: 0.6, axis: 'x', candidates, radius: { grid: 0.005 } })
    expect(out).toEqual({ value: 0.29, hit: null })
  })
  it('격자 스냅은 0~1 밖으로 안 나간다', () => {
    expect(snapRail({ value: 1.03, original: 0.6, axis: 'x', candidates: [] }).hit).toBeNull()
  })
})
