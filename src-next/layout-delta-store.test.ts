import { beforeEach, describe, expect, it } from 'vitest'
import { effectiveLayoutDelta, layoutDeltaSnapshot, rulesOfPersisted, storedRules, useLayoutDeltaStore } from './layoutDeltaStore'
import { ruleKey, ruleOfContext, withJamos } from './scopeRule'
import type { ModelIdentity } from '../src/services/notoVariationModel'

/** 배치 Δ 저장소. 자리는 범위 규칙식 하나이고, 글자 하나의 유효 Δ는 닿는 규칙을 넓은 것부터 더한 것이다. 사용자 Δ만 든다. */

const identity = (initialJamo: string, medialJamo: string, finalJamo: string | null, contextId: string): ModelIdentity => ({ initialJamo, medialJamo, finalJamo, contextId })
const 가 = identity('ㄱ', 'ㅏ', null, 'right')
const 나 = identity('ㄴ', 'ㅏ', null, 'right')
const 고 = identity('ㄱ', 'ㅗ', null, 'bottom')
const 각 = identity('ㄱ', 'ㅏ', 'ㄱ', 'right-final')
const rules = () => useLayoutDeltaStore.getState().rules
const at = (rule: Parameters<typeof ruleKey>[0]) => rules()[ruleKey(rule)]

describe('layoutDeltaStore', () => {
  beforeEach(() => { useLayoutDeltaStore.getState().clearAll() })

  it('같은 범위에 두 번 적용하면 더해지고, 다른 문맥은 안 받는다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply(ruleOfContext('right'), { faces: { CH: { left: -0.01 } }, medial: { JU: { 'outerPillar.center': 0.02 } } })
    apply(ruleOfContext('right'), { faces: { CH: { left: -0.005, bottom: 0.002 } } })
    expect(at(ruleOfContext('right')).faces?.CH?.left).toBeCloseTo(-0.015, 12)
    expect(at(ruleOfContext('right')).faces?.CH?.bottom).toBeCloseTo(0.002, 12)
    expect(at(ruleOfContext('right')).medial?.JU?.['outerPillar.center']).toBeCloseTo(0.02, 12)
    expect(effectiveLayoutDelta({ rules: rules() }, 각)).toBeUndefined()
    expect(effectiveLayoutDelta({ rules: rules() }, null)).toBeUndefined()
  })

  it('유효 Δ = 조건 없는 규칙 + 이 레이아웃', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply({}, { faces: { CH: { top: 0.01 } } })
    apply(ruleOfContext('bottom'), { faces: { CH: { top: 0.005 } }, medial: { JU: { 'baseStem.center': -0.01 } } })
    const state = { rules: rules() }
    expect(effectiveLayoutDelta(state, 고)?.faces?.CH?.top).toBeCloseTo(0.015, 12)
    expect(effectiveLayoutDelta(state, 고)?.medial?.JU?.['baseStem.center']).toBeCloseTo(-0.01, 12)
    const 과 = identity('ㄱ', 'ㅘ', null, 'mixed')
    expect(effectiveLayoutDelta(state, 과)?.faces?.CH?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, 과)?.medial).toBeUndefined()
  })

  it('자모 조건은 그 자모 글자에만 닿고, 레이아웃 Δ 위에 더해진다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply(ruleOfContext('right'), { faces: { CH: { left: -0.01 } } })
    apply(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']), { faces: { CH: { left: -0.02, right: 0.02 } } })
    const state = { rules: rules() }
    expect(effectiveLayoutDelta(state, 가)?.faces?.CH?.left).toBeCloseTo(-0.03, 12)
    expect(effectiveLayoutDelta(state, 가)?.faces?.CH?.right).toBeCloseTo(0.02, 12)
    expect(effectiveLayoutDelta(state, 나)?.faces?.CH?.left).toBeCloseTo(-0.01, 12)
    expect(effectiveLayoutDelta(state, 나)?.faces?.CH?.right).toBeUndefined()
    expect(effectiveLayoutDelta(state, 고)).toBeUndefined()
    expect(effectiveLayoutDelta(state, 각)).toBeUndefined()
  })

  it('부품이 다르면 따로 든다: 받침 ㄱ 조건은 첫닿자 ㄱ에 안 간다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply(withJamos(ruleOfContext('right-final'), 'final', ['ㄱ']), { faces: { JO: { top: 0.01 } } })
    const state = { rules: rules() }
    expect(effectiveLayoutDelta(state, 각)?.faces?.JO?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, identity('ㄴ', 'ㅏ', 'ㄱ', 'right-final'))?.faces?.JO?.top).toBeCloseTo(0.01, 12)
    expect(effectiveLayoutDelta(state, identity('ㄱ', 'ㅏ', 'ㄴ', 'right-final'))).toBeUndefined()
  })

  it('되돌려 0이 되면 항목이 사라지고, 지우기는 그 범위만 비운다', () => {
    const { apply, clear } = useLayoutDeltaStore.getState()
    apply(ruleOfContext('right'), { faces: { CH: { left: 0.01 } } })
    apply(ruleOfContext('right'), { faces: { CH: { left: -0.01 } } })
    expect(at(ruleOfContext('right'))).toBeUndefined()
    apply({}, { faces: { JO: { bottom: 0.01 } } })
    apply(ruleOfContext('right'), { faces: { CH: { left: 0.01 } } })
    apply(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']), { faces: { CH: { left: 0.01 } } })
    apply(withJamos(ruleOfContext('right'), 'initial', ['ㅋ']), { faces: { CH: { left: 0.01 } } })
    clear(ruleOfContext('right'))
    expect(at(ruleOfContext('right'))).toBeUndefined()
    expect(at({}).faces?.JO?.bottom).toBeCloseTo(0.01, 12)
    expect(at(withJamos(ruleOfContext('right'), 'initial', ['ㄱ'])).faces?.CH?.left).toBeCloseTo(0.01, 12)
    clear(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']))
    expect(at(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']))).toBeUndefined()
    expect(at(withJamos(ruleOfContext('right'), 'initial', ['ㅋ'])).faces?.CH?.left).toBeCloseTo(0.01, 12)
    clear(withJamos(ruleOfContext('right'), 'initial', ['ㅋ']))
    clear({})
    expect(rules()).toEqual({})
  })

  it('변 고정은 0 자리여도 남고, 좁은 규칙의 고정이 넓은 규칙 더하기를 덮는다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply(ruleOfContext('bottom'), { faces: { CH: { top: 0.01 } } })
    apply(withJamos(ruleOfContext('bottom'), 'initial', ['ㄴ']), { faces: { CH: { top: { at: 0 } } } })
    const state = { rules: rules() }
    expect(effectiveLayoutDelta(state, identity('ㄴ', 'ㅗ', null, 'bottom'))?.faces?.CH?.top).toEqual({ at: 0 })
    expect(effectiveLayoutDelta(state, 고)?.faces?.CH?.top).toBeCloseTo(0.01, 12)
    // 고정 위에 같은 범위로 더하면 at이 움직인다.
    apply(withJamos(ruleOfContext('bottom'), 'initial', ['ㄴ']), { faces: { CH: { top: 0.02 } } })
    expect(at(withJamos(ruleOfContext('bottom'), 'initial', ['ㄴ'])).faces?.CH?.top).toEqual({ at: expect.closeTo(0.02, 12) })
  })

  it('저장된 규칙은 넓은 것부터 나온다', () => {
    const { apply } = useLayoutDeltaStore.getState()
    apply(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']), { faces: { CH: { left: 0.01 } } })
    apply({}, { faces: { CH: { left: 0.01 } } })
    apply(ruleOfContext('right'), { faces: { CH: { left: 0.01 } } })
    expect(storedRules({ rules: rules() }).map(({ rule }) => ruleKey(rule)))
      .toEqual(['', ruleKey(ruleOfContext('right')), ruleKey(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']))])
  })

  it('스냅샷으로 되돌리면 적용 전 상태가 되고, 스냅샷은 그 뒤 적용에 물들지 않는다', () => {
    const { apply, restore } = useLayoutDeltaStore.getState()
    apply({}, { faces: { JO: { top: 0.004 } } })
    const before = layoutDeltaSnapshot()
    apply(ruleOfContext('right-final'), { medial: { JU: { 'outerPillar.center': 0.01 } } })
    apply(withJamos(ruleOfContext('right-final'), 'initial', ['ㄱ']), { faces: { CH: { left: 0.01 } } })
    const after = layoutDeltaSnapshot()
    expect(Object.keys(before.rules)).toEqual([''])

    restore(before)
    expect(Object.keys(rules())).toEqual([''])
    expect(at({}).faces?.JO?.top).toBeCloseTo(0.004, 12)
    restore(after)
    expect(at(ruleOfContext('right-final')).medial?.JU?.['outerPillar.center']).toBeCloseTo(0.01, 12)
    expect(at(withJamos(ruleOfContext('right-final'), 'initial', ['ㄱ'])).faces?.CH?.left).toBeCloseTo(0.01, 12)
    // 규칙식이 생기기 전 스냅샷(`rules` 없음)도 받는다.
    restore({} as Parameters<typeof restore>[0])
    expect(rules()).toEqual({})
  })
})

describe('rulesOfPersisted', () => {
  it('옛 세 층을 규칙식 자리로 옮긴다', () => {
    const rules = rulesOfPersisted({
      all: { faces: { CH: { top: -0.01 } } },
      layers: { 'right-final': { medial: { JU: { 'outerPillar.center': 0.01 } } } },
      jamo: { bottom: { 'CH:ㄴ': { faces: { CH: { top: 0.02 } } }, 'JO:ㄴ': { faces: { JO: { top: 0.005 } } } } },
    })
    expect(rules['']).toEqual({ faces: { CH: { top: -0.01 } } })
    expect(rules[ruleKey(ruleOfContext('right-final'))].medial?.JU?.['outerPillar.center']).toBeCloseTo(0.01, 12)
    expect(rules[ruleKey(withJamos(ruleOfContext('bottom'), 'initial', ['ㄴ']))].faces?.CH?.top).toBeCloseTo(0.02, 12)
    expect(rules[ruleKey(withJamos(ruleOfContext('bottom'), 'final', ['ㄴ']))].faces?.JO?.top).toBeCloseTo(0.005, 12)
  })

  it('혼합 홀자 자모 층은 홀자 하나로 간다. 0만 남은 항목은 안 옮긴다', () => {
    const rules = rulesOfPersisted({
      all: {},
      layers: { right: { faces: { CH: { left: 0 } } } },
      jamo: { mixed: { 'JU:ㅘ': { faces: { JU: { left: 0.01 } } } } },
    })
    expect(rules[ruleKey(withJamos(ruleOfContext('mixed'), 'medial', ['ㅘ']))].faces?.JU?.left).toBeCloseTo(0.01, 12)
    expect(Object.keys(rules)).toHaveLength(1)
  })

  it('이미 옮긴 저장분은 그대로 읽고, 옛 층이 같이 있으면 더한다', () => {
    const key = ruleKey(ruleOfContext('right'))
    const rules = rulesOfPersisted({ rules: { [key]: { faces: { CH: { left: 0.01 } } } }, layers: { right: { faces: { CH: { left: 0.02 } } } } })
    expect(rules[key].faces?.CH?.left).toBeCloseTo(0.03, 12)
  })
})
