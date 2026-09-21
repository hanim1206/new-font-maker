import { describe, expect, it } from 'vitest'
import { deltaSummary, overrideCardsOf, ruleOfCard, scopeChipsOf } from './layoutOverrides'
import { rulesOfPersisted } from './layoutDeltaStore'
import { ruleGlyphCount, ruleKey, ruleOfContext, withJamos } from './scopeRule'

/** 쌓인 오버라이드: 저장 항목 하나 = 찬 칩 하나. 넓은 것부터, 자모별은 부품 순·자모 순. 다른 레이아웃 것은 안 온다. 기본값(모델)은 칩이 아니다. */

/** 옛 세 층 모양으로 적어 두고 규칙식 저장분으로 옮겨 쓴다(읽기 쉬워서). */
const snapshot = (legacy: Parameters<typeof rulesOfPersisted>[0]) => ({ rules: rulesOfPersisted(legacy) })

describe('overrideCardsOf', () => {
  it('있는 범위만 넓은 것부터, 자모별은 부품·자모 순으로', () => {
    const cards = overrideCardsOf(snapshot({
      all: {},
      layers: { bottom: { faces: { CH: { top: -0.01 } } }, right: { faces: { CH: { left: 0.01 } } } },
      jamo: {
        bottom: { 'JO:ㄴ': { faces: { JO: { top: 0.01 } } }, 'CH:ㄹ': { faces: { CH: { top: 0.02 } } }, 'CH:ㄴ': { faces: { CH: { top: -0.02 } } }, 'JU:ㅗ': { faces: { JU: { top: 0.005 } } } },
        right: { 'CH:ㄱ': { faces: { CH: { right: 0.02 } } } },
      },
    }), 'bottom')
    expect(cards.map((card) => card.kind === 'jamo' ? `${card.group}:${card.jamo}` : card.kind)).toEqual(['layer', 'CH:ㄴ', 'CH:ㄹ', 'JU:ㅗ', 'JO:ㄴ'])
  })
  it('전체는 어느 레이아웃에서도 보이고, 0만 남은 항목은 카드가 안 된다', () => {
    const cards = overrideCardsOf(snapshot({ all: { faces: { CH: { top: 0.01 } } }, layers: { right: { faces: { CH: { top: 0 } } } }, jamo: {} }), 'right')
    expect(cards.map((card) => card.kind)).toEqual(['all'])
    expect(ruleOfCard(cards[0], 'right')).toEqual({})
  })
  it('자모 카드의 지우기 자리는 그 자모 조건 하나', () => {
    const cards = overrideCardsOf(snapshot({ jamo: { right: { 'CH:ㄱ': { faces: { CH: { right: 0.02 } } } } } }), 'right')
    expect(ruleOfCard(cards[0], 'right')).toEqual(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']))
  })
  it('지금 화면이 못 만드는 규칙(계열 여럿 등)은 카드가 안 된다', () => {
    const rules = { [ruleKey({ medialFamily: ['right', 'bottom'] })]: { faces: { CH: { top: 0.01 } } } }
    expect(overrideCardsOf({ rules }, 'right')).toEqual([])
  })
})

describe('scopeChipsOf', () => {
  const label = (chip: ReturnType<typeof scopeChipsOf>[number]) => `${chip.kind === 'jamo' ? `${chip.group}:${chip.jamo}` : chip.kind}${chip.kind !== 'picker' && chip.delta ? '*' : ''}`
  it('앞의 둘은 늘 있고 저장된 층만 찬다. 전체는 옛 저장분이 있을 때만 읽기 전용으로 선다', () => {
    expect(scopeChipsOf([], null).map(label)).toEqual(['layer', 'picker'])
    const cards = overrideCardsOf(snapshot({ all: { faces: { CH: { top: 0.01 } } } }), 'right')
    expect(scopeChipsOf(cards, null).map(label)).toEqual(['layer', 'picker', 'all*'])
  })
  it('자모 칩 = 저장된 것 + 지금 고른 것. 부품 순·자모 순으로 섞이고, 이미 저장된 자모는 한 번만', () => {
    const cards = overrideCardsOf(snapshot({ jamo: { bottom: { 'CH:ㄹ': { faces: { CH: { top: 0.02 } } }, 'JO:ㄴ': { faces: { JO: { top: 0.01 } } } } } }), 'bottom')
    expect(scopeChipsOf(cards, { group: 'CH', jamos: ['ㄹ', 'ㄱ'] }).map(label)).toEqual(['layer', 'picker', 'CH:ㄱ', 'CH:ㄹ*', 'JO:ㄴ*'])
  })
})

describe('deltaSummary', () => {
  it('변은 부호 u로, 중심 rail은 획 이름으로. 자모 카드는 부품 이름을 뺀다', () => {
    const delta = { faces: { CH: { top: -0.02, right: 0.012 } }, medial: { JU: { 'outerPillar.center': 0.01 }, JU_H: { 'primaryBeam.start': -0.004 } } }
    expect(deltaSummary(delta, true)).toEqual(['첫닿자 윗변 -20u', '첫닿자 오른변 +12u', '홀자 바깥기둥 중심 +10u', '홀자 가로부 보 시작 -4u'])
    expect(deltaSummary(delta, false)).toEqual(['윗변 -20u', '오른변 +12u', '바깥기둥 중심 +10u', '가로부 보 시작 -4u'])
    expect(deltaSummary({ faces: { CH: { top: { at: 0.718 }, left: 0 } } }, true)).toEqual(['첫닿자 윗변 = 718'])
  })
})

describe('ruleGlyphCount', () => {
  it('전체 11,172 · 이 레이아웃은 문맥 수 · 자모는 문맥 × 그 자모', () => {
    expect(ruleGlyphCount({})).toBe(11172)
    // right(세로 홀자 9 × 받침 없음) = 19 × 9 = 171, right-final = 19 × 9 × 27
    expect(ruleGlyphCount(ruleOfContext('right'))).toBe(171)
    expect(ruleGlyphCount(ruleOfContext('right-final'))).toBe(19 * 9 * 27)
    expect(ruleGlyphCount(withJamos(ruleOfContext('right'), 'initial', ['ㄱ']))).toBe(9)
    expect(ruleGlyphCount(withJamos(ruleOfContext('bottom-final'), 'final', ['ㄴ']))).toBe(19 * 5)
    expect(ruleGlyphCount(withJamos(ruleOfContext('mixed'), 'medial', ['ㅘ']))).toBe(19)
  })
})
