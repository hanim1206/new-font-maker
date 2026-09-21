import { describe, expect, it } from 'vitest'
import { deltaSummary, overrideCardsOf, scopeChipsOf, targetOfCard } from './layoutOverrides'
import { overrideGlyphCount } from './reviewPropagation'

/** 쌓인 오버라이드: 저장 항목 하나 = 찬 칩 하나. 넓은 것부터, 자모별은 부품 순·자모 순. 다른 레이아웃 것은 안 온다. 기본값(모델)은 칩이 아니다. */

describe('overrideCardsOf', () => {
  it('있는 층만 넓은 것부터, 자모별은 부품·자모 순으로', () => {
    const cards = overrideCardsOf({
      all: {},
      layers: { bottom: { faces: { CH: { top: -0.01 } } }, right: { faces: { CH: { left: 0.01 } } } },
      jamo: {
        bottom: { 'JO:ㄴ': { faces: { JO: { top: 0.01 } } }, 'CH:ㄹ': { faces: { CH: { top: 0.02 } } }, 'CH:ㄴ': { faces: { CH: { top: -0.02 } } }, 'JU:ㅗ': { faces: { JU: { top: 0.005 } } } },
        right: { 'CH:ㄱ': { faces: { CH: { right: 0.02 } } } },
      },
    }, 'bottom')
    expect(cards.map((card) => card.kind === 'jamo' ? `${card.group}:${card.jamo}` : card.kind)).toEqual(['layer', 'CH:ㄴ', 'CH:ㄹ', 'JU:ㅗ', 'JO:ㄴ'])
  })
  it('전체는 어느 레이아웃에서도 보이고, 0만 남은 항목은 카드가 안 된다', () => {
    const cards = overrideCardsOf({ all: { faces: { CH: { top: 0.01 } } }, layers: { right: { faces: { CH: { top: 0 } } } }, jamo: {} }, 'right')
    expect(cards.map((card) => card.kind)).toEqual(['all'])
    expect(targetOfCard(cards[0], 'right')).toEqual({ scope: 'all' })
  })
  it('자모 카드의 지우기 자리는 그 키 하나', () => {
    const cards = overrideCardsOf({ all: {}, layers: {}, jamo: { right: { 'CH:ㄱ': { faces: { CH: { right: 0.02 } } } } } }, 'right')
    expect(targetOfCard(cards[0], 'right')).toEqual({ scope: 'jamo', contextId: 'right', jamos: ['CH:ㄱ'] })
  })
})

describe('scopeChipsOf', () => {
  const label = (chip: ReturnType<typeof scopeChipsOf>[number]) => `${chip.kind === 'jamo' ? `${chip.group}:${chip.jamo}` : chip.kind}${chip.kind !== 'picker' && chip.delta ? '*' : ''}`
  it('앞의 셋은 늘 있고 저장된 층만 찬다', () => {
    expect(scopeChipsOf([], null).map(label)).toEqual(['layer', 'picker', 'all'])
    const cards = overrideCardsOf({ all: { faces: { CH: { top: 0.01 } } }, layers: {}, jamo: {} }, 'right')
    expect(scopeChipsOf(cards, null).map(label)).toEqual(['layer', 'picker', 'all*'])
  })
  it('자모 칩 = 저장된 것 + 지금 고른 것. 부품 순·자모 순으로 섞이고, 이미 저장된 자모는 한 번만', () => {
    const cards = overrideCardsOf({ all: {}, layers: {}, jamo: { bottom: { 'CH:ㄹ': { faces: { CH: { top: 0.02 } } }, 'JO:ㄴ': { faces: { JO: { top: 0.01 } } } } } }, 'bottom')
    expect(scopeChipsOf(cards, { group: 'CH', jamos: ['ㄹ', 'ㄱ'] }).map(label)).toEqual(['layer', 'picker', 'all', 'CH:ㄱ', 'CH:ㄹ*', 'JO:ㄴ*'])
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

describe('overrideGlyphCount', () => {
  it('전체 11,172 · 이 레이아웃은 문맥 수 · 자모는 문맥 × 그 자모', () => {
    expect(overrideGlyphCount({ scope: 'all' })).toBe(11172)
    // right(세로 홀자 9 × 받침 없음) = 19 × 9 = 171, right-final = 19 × 9 × 27
    expect(overrideGlyphCount({ scope: 'layer', contextId: 'right' })).toBe(171)
    expect(overrideGlyphCount({ scope: 'layer', contextId: 'right-final' })).toBe(19 * 9 * 27)
    expect(overrideGlyphCount({ scope: 'jamo', contextId: 'right', group: 'CH', jamo: 'ㄱ' })).toBe(9)
    expect(overrideGlyphCount({ scope: 'jamo', contextId: 'bottom-final', group: 'JO', jamo: 'ㄴ' })).toBe(19 * 5)
    expect(overrideGlyphCount({ scope: 'jamo', contextId: 'mixed', group: 'JU', jamo: 'ㅘ' })).toBe(19)
  })
})
