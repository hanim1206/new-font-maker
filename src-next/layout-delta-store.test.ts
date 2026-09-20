import { beforeEach, describe, expect, it } from 'vitest'
import { effectiveLayoutDelta, layoutDeltaSnapshot, useLayoutDeltaStore } from './layoutDeltaStore'

/** 배치 Δ 저장소. 범위(전체·이 레이아웃)별로 쌓이고, 글자 하나의 유효 Δ는 둘의 합이다. */

describe('layoutDeltaStore', () => {
  beforeEach(() => { useLayoutDeltaStore.getState().clearAll() })

  it('이 레이아웃에 두 번 적용하면 더해지고, 다른 문맥은 안 받는다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply('layer', 'right', { faces: { CH: { left: -0.01 } }, medial: { JU: { 'outerPillar.center': 0.02 } } })
    apply('layer', 'right', { faces: { CH: { left: -0.005, bottom: 0.002 } } })
    const state = useLayoutDeltaStore.getState()
    expect(state.layers.right.faces?.CH?.left).toBeCloseTo(-0.015, 12)
    expect(state.layers.right.faces?.CH?.bottom).toBeCloseTo(0.002, 12)
    expect(state.layers.right.medial?.JU?.['outerPillar.center']).toBeCloseTo(0.02, 12)
    expect(effectiveLayoutDelta(state, 'right-final')).toBeUndefined()
    expect(effectiveLayoutDelta(state, null)).toBeUndefined()
  })

  it('유효 Δ = 전체 + 이 레이아웃', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply('all', 'right', { faces: { CH: { top: 0.01 } } })
    apply('layer', 'bottom', { faces: { CH: { top: 0.005 } }, medial: { JU: { 'baseStem.center': -0.01 } } })
    const state = useLayoutDeltaStore.getState()
    expect(effectiveLayoutDelta(state, 'bottom')?.faces?.CH?.top).toBeCloseTo(0.015, 12)
    expect(effectiveLayoutDelta(state, 'bottom')?.medial?.JU?.['baseStem.center']).toBeCloseTo(-0.01, 12)
    expect(effectiveLayoutDelta(state, 'mixed')?.faces?.CH?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, 'mixed')?.medial).toBeUndefined()
  })

  it('되돌려 0이 되면 항목이 사라지고, 지우기는 그 범위만 비운다', () => {
    const { apply, clear } = useLayoutDeltaStore.getState()
    apply('layer', 'right', { faces: { CH: { left: 0.01 } } })
    apply('layer', 'right', { faces: { CH: { left: -0.01 } } })
    expect(useLayoutDeltaStore.getState().layers.right).toBeUndefined()
    apply('all', 'right', { faces: { JO: { bottom: 0.01 } } })
    apply('layer', 'right', { faces: { CH: { left: 0.01 } } })
    clear('layer', 'right')
    const state = useLayoutDeltaStore.getState()
    expect(state.layers.right).toBeUndefined()
    expect(state.all.faces?.JO?.bottom).toBeCloseTo(0.01, 12)
    clear('all', 'right')
    expect(useLayoutDeltaStore.getState().all).toEqual({})
  })

  it('스냅샷으로 되돌리면 적용 전 상태가 되고, 스냅샷은 그 뒤 적용에 물들지 않는다', () => {
    const { apply, restore } = useLayoutDeltaStore.getState()
    apply('all', '', { faces: { JO: { top: 0.004 } } })
    const before = layoutDeltaSnapshot()
    apply('layer', 'right-final', { medial: { JU: { 'outerPillar.center': 0.01 } } })
    const after = layoutDeltaSnapshot()
    expect(before.layers).toEqual({})

    restore(before)
    expect(useLayoutDeltaStore.getState().layers).toEqual({})
    expect(useLayoutDeltaStore.getState().all.faces?.JO?.top).toBeCloseTo(0.004, 12)
    restore(after)
    expect(useLayoutDeltaStore.getState().layers['right-final'].medial?.JU?.['outerPillar.center']).toBeCloseTo(0.01, 12)
  })
})
