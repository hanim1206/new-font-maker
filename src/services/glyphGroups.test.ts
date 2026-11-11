import { describe, expect, it } from 'vitest'
import { glyphGroups, GROUP_COLS, GROUP_MAX_ROWS, wrapSentence } from './glyphGroups'
import { CHART_SYLLABLES } from './handwritingBank'

describe('글자표 묶음', () => {
  it('모든 묶음은 가로 10칸 · 세로 10줄 안이고, 글자는 2,350자 안에 있다', () => {
    const ks = new Set(CHART_SYLLABLES)
    for (const g of glyphGroups({ char: '왕', slot: 'JO' })) {
      expect(g.rows.length).toBeLessThanOrEqual(GROUP_MAX_ROWS)
      for (const r of g.rows) {
        expect([...r].length).toBeLessThanOrEqual(GROUP_COLS)
        for (const ch of r) if (ch !== ' ') expect(ks.has(ch)).toBe(true)
      }
    }
  })
  it('자모 묶음은 고른 글자를 따라간다', () => {
    const [cons, vowel] = ['consonant', 'vowel'].map((id) => glyphGroups({ char: '곡' }).find((g) => g.id === id)!)
    expect(cons.rows[0][0]).toBe('가')
    expect(vowel.rows[0][0]).toBe('고')
    expect(glyphGroups({ char: '곡', slot: 'JO' }).find((g) => g.id === 'consonant')!.name).toContain('ㄱ')
  })
  it('문장은 낱말을 자르지 않고 10칸 줄에 싣는다', () => {
    expect(wrapSentence('고향 과일 가게 왼쪽 대문')).toEqual(['고향 과일 가게', '왼쪽 대문'])
  })
})
