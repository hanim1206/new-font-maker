import { beforeEach, describe, expect, it } from 'vitest'
import { effectiveLayoutDelta, jamoKeysOf, layoutDeltaSnapshot, useLayoutDeltaStore } from './layoutDeltaStore'
import type { ModelIdentity } from '../src/services/notoVariationModel'

/** 배치 Δ 저장소. 범위(전체·이 레이아웃·이 자모만)별로 쌓이고, 글자 하나의 유효 Δ는 셋의 합이다. 사용자 Δ만 든다. */

const identity = (initialJamo: string, medialJamo: string, finalJamo: string | null, contextId: string): ModelIdentity => ({ initialJamo, medialJamo, finalJamo, contextId })
const 가 = identity('ㄱ', 'ㅏ', null, 'right')
const 나 = identity('ㄴ', 'ㅏ', null, 'right')
const 고 = identity('ㄱ', 'ㅗ', null, 'bottom')
const 각 = identity('ㄱ', 'ㅏ', 'ㄱ', 'right-final')

describe('layoutDeltaStore', () => {
  beforeEach(() => { useLayoutDeltaStore.getState().clearAll() })

  it('이 레이아웃에 두 번 적용하면 더해지고, 다른 문맥은 안 받는다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply({ scope: 'layer', contextId: 'right' }, { faces: { CH: { left: -0.01 } }, medial: { JU: { 'outerPillar.center': 0.02 } } })
    apply({ scope: 'layer', contextId: 'right' }, { faces: { CH: { left: -0.005, bottom: 0.002 } } })
    const state = useLayoutDeltaStore.getState()
    expect(state.layers.right.faces?.CH?.left).toBeCloseTo(-0.015, 12)
    expect(state.layers.right.faces?.CH?.bottom).toBeCloseTo(0.002, 12)
    expect(state.layers.right.medial?.JU?.['outerPillar.center']).toBeCloseTo(0.02, 12)
    expect(effectiveLayoutDelta(state, 각)).toBeUndefined()
    expect(effectiveLayoutDelta(state, null)).toBeUndefined()
  })

  it('유효 Δ = 전체 + 이 레이아웃', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply({ scope: 'all' }, { faces: { CH: { top: 0.01 } } })
    apply({ scope: 'layer', contextId: 'bottom' }, { faces: { CH: { top: 0.005 } }, medial: { JU: { 'baseStem.center': -0.01 } } })
    const state = useLayoutDeltaStore.getState()
    expect(effectiveLayoutDelta(state, 고)?.faces?.CH?.top).toBeCloseTo(0.015, 12)
    expect(effectiveLayoutDelta(state, 고)?.medial?.JU?.['baseStem.center']).toBeCloseTo(-0.01, 12)
    const 과 = identity('ㄱ', 'ㅘ', null, 'mixed')
    expect(effectiveLayoutDelta(state, 과)?.faces?.CH?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, 과)?.medial).toBeUndefined()
  })

  it('이 자모만 = 같은 레이아웃에서 그 부품이 그 자모인 글자만 받고, 이 레이아웃 Δ 위에 더해진다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply({ scope: 'layer', contextId: 'right' }, { faces: { CH: { left: -0.01 } } })
    apply({ scope: 'jamo', contextId: 'right', jamos: ['CH:ㄱ', 'CH:ㅋ'] }, { faces: { CH: { left: -0.02, right: 0.02 } } })
    const state = useLayoutDeltaStore.getState()
    expect(state.jamo.right['CH:ㄱ'].faces?.CH?.right).toBeCloseTo(0.02, 12)
    expect(state.jamo.right['CH:ㅋ'].faces?.CH?.right).toBeCloseTo(0.02, 12)
    // 가 = 전체 0 + 이 레이아웃 -0.01 + ㄱ 층 -0.02
    expect(effectiveLayoutDelta(state, 가)?.faces?.CH?.left).toBeCloseTo(-0.03, 12)
    expect(effectiveLayoutDelta(state, 가)?.faces?.CH?.right).toBeCloseTo(0.02, 12)
    // 나 = 이 레이아웃만
    expect(effectiveLayoutDelta(state, 나)?.faces?.CH?.left).toBeCloseTo(-0.01, 12)
    expect(effectiveLayoutDelta(state, 나)?.faces?.CH?.right).toBeUndefined()
    // 고·각 = 다른 레이아웃, ㄱ이어도 안 받는다
    expect(effectiveLayoutDelta(state, 고)).toBeUndefined()
    expect(effectiveLayoutDelta(state, 각)).toBeUndefined()
  })

  it('자모 층은 부품별로 따로 든다: 받침 ㄱ 층은 첫닿자 ㄱ에 안 간다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply({ scope: 'jamo', contextId: 'right-final', jamos: ['JO:ㄱ'] }, { faces: { JO: { top: 0.01 } } })
    const state = useLayoutDeltaStore.getState()
    expect(jamoKeysOf(각)).toEqual(['CH:ㄱ', 'JU:ㅏ', 'JO:ㄱ'])
    expect(jamoKeysOf(가)).toEqual(['CH:ㄱ', 'JU:ㅏ'])
    expect(effectiveLayoutDelta(state, 각)?.faces?.JO?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, identity('ㄴ', 'ㅏ', 'ㄱ', 'right-final'))?.faces?.JO?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, identity('ㄱ', 'ㅏ', 'ㄴ', 'right-final'))).toBeUndefined()
  })

  it('되돌려 0이 되면 항목이 사라지고, 지우기는 그 범위만 비운다', () => {
    const { apply, clear } = useLayoutDeltaStore.getState()
    apply({ scope: 'layer', contextId: 'right' }, { faces: { CH: { left: 0.01 } } })
    apply({ scope: 'layer', contextId: 'right' }, { faces: { CH: { left: -0.01 } } })
    expect(useLayoutDeltaStore.getState().layers.right).toBeUndefined()
    apply({ scope: 'all' }, { faces: { JO: { bottom: 0.01 } } })
    apply({ scope: 'layer', contextId: 'right' }, { faces: { CH: { left: 0.01 } } })
    apply({ scope: 'jamo', contextId: 'right', jamos: ['CH:ㄱ', 'CH:ㅋ'] }, { faces: { CH: { left: 0.01 } } })
    clear({ scope: 'layer', contextId: 'right' })
    let state = useLayoutDeltaStore.getState()
    expect(state.layers.right).toBeUndefined()
    expect(state.all.faces?.JO?.bottom).toBeCloseTo(0.01, 12)
    expect(state.jamo.right['CH:ㄱ'].faces?.CH?.left).toBeCloseTo(0.01, 12)
    // 자모 층은 고른 키만 지운다. 전부 비면 문맥 항목째 사라진다.
    clear({ scope: 'jamo', contextId: 'right', jamos: ['CH:ㄱ'] })
    state = useLayoutDeltaStore.getState()
    expect(state.jamo.right['CH:ㄱ']).toBeUndefined()
    expect(state.jamo.right['CH:ㅋ'].faces?.CH?.left).toBeCloseTo(0.01, 12)
    clear({ scope: 'jamo', contextId: 'right', jamos: ['CH:ㅋ'] })
    expect(useLayoutDeltaStore.getState().jamo).toEqual({})
    clear({ scope: 'all' })
    expect(useLayoutDeltaStore.getState().all).toEqual({})
  })

  it('변 고정은 0 자리여도 남고, 좁은 층의 고정이 넓은 층 더하기를 덮는다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply({ scope: 'layer', contextId: 'bottom' }, { faces: { CH: { top: 0.01 } } })
    apply({ scope: 'jamo', contextId: 'bottom', jamos: ['CH:ㄴ'] }, { faces: { CH: { top: { at: 0 } } } })
    const state = useLayoutDeltaStore.getState()
    expect(state.jamo.bottom['CH:ㄴ'].faces?.CH?.top).toEqual({ at: 0 })
    expect(effectiveLayoutDelta(state, identity('ㄴ', 'ㅗ', null, 'bottom'))?.faces?.CH?.top).toEqual({ at: 0 })
    expect(effectiveLayoutDelta(state, 고)?.faces?.CH?.top).toBeCloseTo(0.01, 12)
    // 고정 위에 같은 층으로 더하면 at이 움직인다.
    apply({ scope: 'jamo', contextId: 'bottom', jamos: ['CH:ㄴ'] }, { faces: { CH: { top: 0.02 } } })
    expect(useLayoutDeltaStore.getState().jamo.bottom['CH:ㄴ'].faces?.CH?.top).toEqual({ at: expect.closeTo(0.02, 12) })
  })

  it('스냅샷으로 되돌리면 적용 전 상태가 되고, 스냅샷은 그 뒤 적용에 물들지 않는다', () => {
    const { apply, restore } = useLayoutDeltaStore.getState()
    apply({ scope: 'all' }, { faces: { JO: { top: 0.004 } } })
    const before = layoutDeltaSnapshot()
    apply({ scope: 'layer', contextId: 'right-final' }, { medial: { JU: { 'outerPillar.center': 0.01 } } })
    apply({ scope: 'jamo', contextId: 'right-final', jamos: ['CH:ㄱ'] }, { faces: { CH: { left: 0.01 } } })
    const after = layoutDeltaSnapshot()
    expect(before.layers).toEqual({})
    expect(before.jamo).toEqual({})

    restore(before)
    expect(useLayoutDeltaStore.getState().layers).toEqual({})
    expect(useLayoutDeltaStore.getState().jamo).toEqual({})
    expect(useLayoutDeltaStore.getState().all.faces?.JO?.top).toBeCloseTo(0.004, 12)
    restore(after)
    expect(useLayoutDeltaStore.getState().layers['right-final'].medial?.JU?.['outerPillar.center']).toBeCloseTo(0.01, 12)
    expect(useLayoutDeltaStore.getState().jamo['right-final']['CH:ㄱ'].faces?.CH?.left).toBeCloseTo(0.01, 12)
    // 자모 층이 생기기 전 스냅샷(`jamo` 없음)도 받는다.
    restore({ all: {}, layers: {} } as Parameters<typeof restore>[0])
    expect(useLayoutDeltaStore.getState().jamo).toEqual({})
  })
})
