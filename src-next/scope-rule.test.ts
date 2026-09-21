import { describe, expect, it } from 'vitest'
import { compareBreadth, matchesRule, normalizeRule, ruleFromKey, ruleGlyphCount, ruleKey, ruleName, ruleOfContext, ruleOfLegacy, withJamos } from './scopeRule'
import { corpusIdentity } from './notoCorpus'

/** 범위 규칙식. 계약은 `docs/specs/적용범위-규칙식.md`. 조건은 AND, 목록은 OR, 넓이는 닿는 글자 수다. */

const of = (character: string) => corpusIdentity(character.codePointAt(0)!)

describe('matchesRule', () => {
  it('조건이 없으면 전부 닿는다', () => {
    expect(matchesRule({}, of('가'))).toBe(true)
    expect(matchesRule({}, of('뿅'))).toBe(true)
  })
  it('계열·받침은 AND로 걸린다', () => {
    const rule = ruleOfContext('right-final')
    expect(matchesRule(rule, of('각'))).toBe(true)
    expect(matchesRule(rule, of('가'))).toBe(false)
    expect(matchesRule(rule, of('곡'))).toBe(false)
  })
  it('부품 자모 목록은 OR, 부품끼리는 AND', () => {
    const rule = withJamos(withJamos(ruleOfContext('right'), 'initial', ['ㄱ', 'ㅋ']), 'medial', ['ㅏ'])
    expect(matchesRule(rule, of('가'))).toBe(true)
    expect(matchesRule(rule, of('카'))).toBe(true)
    expect(matchesRule(rule, of('거'))).toBe(false)
    expect(matchesRule(rule, of('나'))).toBe(false)
  })
  it('받침 조건은 받침 없는 글자에 안 닿는다', () => {
    const rule = { final: ['ㄱ'] }
    expect(matchesRule(rule, of('각'))).toBe(true)
    expect(matchesRule(rule, of('가'))).toBe(false)
  })
})

describe('ruleKey', () => {
  it('목록 순서가 달라도 같은 키', () => {
    expect(ruleKey({ initial: ['ㅋ', 'ㄱ'] })).toBe(ruleKey({ initial: ['ㄱ', 'ㅋ'] }))
    expect(ruleKey({ medialFamily: ['mixed', 'right'] })).toBe(ruleKey({ medialFamily: ['right', 'mixed'] }))
  })
  it('빈 목록은 조건이 아니다. 조건 없는 규칙은 빈 키', () => {
    expect(ruleKey({ initial: [] })).toBe('')
    expect(ruleKey({})).toBe('')
  })
  it('키에서 규칙으로 돌아온다', () => {
    const rule = withJamos(ruleOfContext('bottom-final'), 'initial', ['ㄴ', 'ㄷ'])
    expect(ruleFromKey(ruleKey(rule))).toEqual(normalizeRule(rule))
    expect(ruleFromKey('')).toEqual({})
  })
})

describe('ruleGlyphCount', () => {
  it('조건 없음 = 11,172자. 문맥·자모는 좁아진다', () => {
    expect(ruleGlyphCount({})).toBe(11172)
    // right(세로 홀자 9 × 받침 없음) = 19 × 9
    expect(ruleGlyphCount(ruleOfContext('right'))).toBe(19 * 9)
    expect(ruleGlyphCount(ruleOfContext('right-final'))).toBe(19 * 9 * 27)
    expect(ruleGlyphCount(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']))).toBe(9)
    expect(ruleGlyphCount(withJamos(ruleOfContext('bottom-final'), 'final', ['ㄴ']))).toBe(19 * 5)
    expect(ruleGlyphCount(withJamos(ruleOfContext('mixed'), 'medial', ['ㅘ']))).toBe(19)
  })
})

describe('compareBreadth', () => {
  it('닿는 글자가 많은 쪽이 앞', () => {
    const wide = ruleOfContext('right-final')
    const narrow = withJamos(wide, 'initial', ['ㄱ'])
    expect([narrow, {}, wide].sort(compareBreadth).map(ruleKey)).toEqual([ruleKey({}), ruleKey(wide), ruleKey(narrow)])
  })
  it('닿는 수가 같으면 조건이 먼저 붙은 쪽이 넓다', () => {
    // 첫닿자 19자 중 하나로 좁힌 것과 홀자 21자 중 하나로 좁힌 것이 우연히 같은 수일 때도 순서가 흔들리지 않는다.
    const a = withJamos(ruleOfContext('right'), 'initial', ['ㄱ'])
    const b = withJamos(ruleOfContext('right'), 'medial', ['ㅏ'])
    expect(ruleGlyphCount(a)).toBe(9)
    expect(ruleGlyphCount(b)).toBe(19)
    expect(compareBreadth(b, a)).toBeLessThan(0)
    const sameCount = [withJamos(ruleOfContext('right'), 'initial', ['ㄱ']), withJamos(ruleOfContext('right'), 'initial', ['ㄴ'])]
    expect(compareBreadth(sameCount[0], sameCount[1])).not.toBe(0)
  })
})

describe('ruleName', () => {
  it('계열+받침은 여섯 칸 이름, 자모가 붙으면 뒤에 붙는다', () => {
    expect(ruleName({})).toBe('전체')
    expect(ruleName(ruleOfContext('right-final'))).toBe('오른쪽 홀자 · 받침')
    expect(ruleName(ruleOfContext('bottom'))).toBe('아래 홀자')
    expect(ruleName(withJamos(ruleOfContext('right-final'), 'initial', ['ㄱ', 'ㅋ']))).toBe('오른쪽 홀자 · 받침 · 첫닿자 ㄱ·ㅋ')
  })
  it('자모가 넷 이상이면 줄여 쓴다', () => {
    expect(ruleName(withJamos(ruleOfContext('right'), 'initial', ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ']))).toBe('오른쪽 홀자 · 첫닿자 ㄱ 외 3')
  })
  it('부품이 둘이면 마디가 둘', () => {
    const rule = withJamos(withJamos(ruleOfContext('right-final'), 'initial', ['ㄱ']), 'final', ['ㄴ'])
    expect(ruleName(rule)).toBe('오른쪽 홀자 · 받침 · 첫닿자 ㄱ · 받침 ㄴ')
  })
})

describe('ruleOfLegacy', () => {
  it('옛 세 층의 자리를 옮긴다', () => {
    expect(ruleOfLegacy('all')).toEqual({})
    expect(ruleOfLegacy('layer', 'right-final')).toEqual({ medialFamily: ['right'], hasFinal: true })
    expect(ruleOfLegacy('jamo', 'bottom', 'CH:ㄴ')).toEqual({ medialFamily: ['bottom'], hasFinal: false, initial: ['ㄴ'] })
    expect(ruleOfLegacy('jamo', 'right-final', 'JO:ㄱ')).toEqual({ medialFamily: ['right'], hasFinal: true, final: ['ㄱ'] })
    expect(ruleOfLegacy('jamo', 'mixed', 'JU:ㅘ')).toEqual({ medialFamily: ['mixed'], hasFinal: false, medial: ['ㅘ'] })
  })
})
