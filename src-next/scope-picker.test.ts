import { describe, expect, it } from 'vitest'
import { CORPUS_INITIALS, corpusIdentity } from './notoCorpus'
import { axisAllOn, axisOn, contextIdOfRule, ruleOfSets, ruleSamples, scopeChipsFor, setsOfRule, toggleAxisAll, toggleAxisValue } from './scopePicker'
import { matchesRule, ruleGlyphCount, ruleOfContext } from './scopeRule'
import type { ScopeRule } from './scopeRule'

/** 범위 고르기의 가운데: 규칙식 ↔ 축 값 집합. 축 줄에서 켠 자모가 그대로 규칙식으로 저장돼야 한다. */

const 멈 = corpusIdentity('멈'.codePointAt(0)!)
const 가 = corpusIdentity('가'.codePointAt(0)!)

describe('규칙식 ↔ 축 값 집합', () => {
  const cases: [string, ScopeRule][] = [
    ['전체', {}],
    ['이 레이아웃', ruleOfContext('right-final')],
    ['받침 없는 칸', ruleOfContext('bottom')],
    ['자모 목록', { medialFamily: ['right'], hasFinal: true, initial: ['ㄱ', 'ㅋ'] }],
    ['받침 자모 목록', { medialFamily: ['right'], final: ['ㄱ', 'ㄴ'] }],
    ['홀자 목록(계열로 안 접히는)', { hasFinal: true, medial: ['ㅏ', 'ㅗ'] }],
  ]
  it.each(cases)('%s는 풀었다 접어도 같은 규칙이다', (_label, rule) => {
    expect(ruleOfSets(setsOfRule(rule))).toEqual(rule)
  })

  it('계열 전부를 켜면 자모 목록이 아니라 계열 조건으로 접힌다', () => {
    const partial = setsOfRule({ hasFinal: true, medial: [...'ㅏㅐㅑㅒㅓㅔㅕㅖ'] })
    expect(ruleOfSets(partial).medialFamily).toBeUndefined()
    const whole = toggleAxisValue(partial, 'medial', 'ㅣ')
    expect(ruleOfSets(whole)).toEqual({ medialFamily: ['right'], hasFinal: true })
  })

  it('받침은 없음만·전부·목록 셋으로 접힌다', () => {
    expect(ruleOfSets(setsOfRule({ hasFinal: false }))).toEqual({ hasFinal: false })
    expect(ruleOfSets(setsOfRule({ hasFinal: true }))).toEqual({ hasFinal: true })
    expect(ruleOfSets(setsOfRule({ final: ['ㄱ'] }))).toEqual({ final: ['ㄱ'] })
  })

  it('받침 목록에 `없음`이 들어도 그대로 남는다', () => {
    const rule = ruleOfSets({ ...setsOfRule({}), final: new Set([null, 'ㄱ', 'ㄲ']) })
    expect(rule.final).toEqual([null, 'ㄱ', 'ㄲ'])
    expect(matchesRule(rule, corpusIdentity('가'.codePointAt(0)!))).toBe(true)
    expect(matchesRule(rule, corpusIdentity('각'.codePointAt(0)!))).toBe(true)
    expect(matchesRule(rule, corpusIdentity('간'.codePointAt(0)!))).toBe(false)
  })
})

describe('축 줄 고르기', () => {
  const layer = setsOfRule(ruleOfContext('right-final'))

  it('자모 하나를 넣고 뺀다. 표에 없는 다른 축은 그대로 둔다', () => {
    const one = toggleAxisValue(layer, 'initial', 'ㄱ')
    expect(axisOn(one, 'initial', 'ㄱ')).toBe(false)
    expect(axisOn(one, 'medial', 'ㅏ')).toBe(true)
    expect(ruleGlyphCount(ruleOfSets(one))).toBeLessThan(ruleGlyphCount(ruleOfSets(layer)))
  })

  it('마지막 하나까지 빼지는 않는다 — 아무 글자도 안 닿는 범위는 만들 수 없다', () => {
    const only = setsOfRule({ initial: ['ㄱ'] })
    expect(toggleAxisValue(only, 'initial', 'ㄱ')).toBe(only)
  })

  it('`전체`는 전부 켜고, 이미 전부면 하나만 남긴다', () => {
    const items = [...'ㄱㄲㄴ']
    const narrowed = toggleAxisAll(layer, 'initial', CORPUS_INITIALS, 'ㅁ')
    expect(ruleOfSets(narrowed).initial).toEqual(['ㅁ'])
    expect(axisAllOn(narrowed, 'initial', CORPUS_INITIALS)).toBe(false)
    const back = toggleAxisAll(narrowed, 'initial', CORPUS_INITIALS, 'ㅁ')
    expect(axisAllOn(back, 'initial', CORPUS_INITIALS)).toBe(true)
    expect(ruleOfSets(back).initial).toBeUndefined()
    // 목록에 없는 자모를 지키라고 하면 첫 자모를 남긴다.
    expect(ruleOfSets(toggleAxisAll(setsOfRule({ initial: items }), 'initial', items, 'ㅎ')).initial).toEqual(['ㄱ'])
  })
})

describe('추천 칩', () => {
  it('첫닿자를 잡으면 구조군·속공간·높이가 나오고, 저마다 닿는 글자가 있다', () => {
    const chips = scopeChipsFor({ source: 멈, part: 'initial' })
    expect(chips.map((chip) => chip.id)).toContain('group')
    expect(chips.every((chip) => chip.count > 0)).toBe(true)
    // 칩은 이 레이아웃 안에서 좁힌다 — 이 레이아웃(4,617자)보다 넓어지지 않는다.
    const layer = ruleGlyphCount(ruleOfContext(멈.contextId))
    expect(chips.filter((chip) => chip.id !== 'role').every((chip) => chip.count <= layer)).toBe(true)
  })

  it('홀자를 잡으면 구조군 칩은 없다 — 구조군 표가 닿자 것이라서', () => {
    expect(scopeChipsFor({ source: 멈, part: 'medial' }).map((chip) => chip.id)).not.toContain('group')
  })

  it('rail 역할 칩은 그 역할을 가진 홀자만 담는다', () => {
    const chips = scopeChipsFor({ source: 가, part: 'medial', railRole: 'baseStem' })
    const role = chips.find((chip) => chip.id === 'role')
    expect(role).toBeDefined()
    // ㅗ·ㅜ는 줄기가 있고 ㅏ는 없다.
    expect(matchesRule(role!.rule, corpusIdentity('고'.codePointAt(0)!))).toBe(true)
    expect(matchesRule(role!.rule, corpusIdentity('가'.codePointAt(0)!))).toBe(false)
  })

  it('넷을 넘지 않는다', () => {
    expect(scopeChipsFor({ source: 멈, part: 'initial', railRole: 'outerPillar' }).length).toBeLessThanOrEqual(4)
  })
})

describe('표본과 칸', () => {
  it('표본은 그 규칙에 닿는 글자이고 원본은 뺀다', () => {
    const rule = ruleOfContext(멈.contextId)
    const samples = ruleSamples(rule, 6, 멈.codepoint)
    expect(samples).toHaveLength(6)
    expect(samples.every((identity) => matchesRule(rule, identity))).toBe(true)
    expect(samples.some((identity) => identity.codepoint === 멈.codepoint)).toBe(false)
  })

  it('썸네일 칸은 규칙의 계열·받침을 따르고, 조건이 없으면 지금 글자의 칸이다', () => {
    expect(contextIdOfRule({ medialFamily: ['bottom'], hasFinal: false }, 멈.contextId)).toBe('bottom')
    expect(contextIdOfRule({}, 멈.contextId)).toBe('right-final')
  })
})
