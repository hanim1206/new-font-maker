import { describe, expect, it } from 'vitest'
import { corpusIdentity, corpusIdentityOf, isCorpusCodepoint } from './notoCorpus'

describe('코퍼스 신원 — 완성형만', () => {
  it('완성형 음절은 신원이 있고, 홑자모 · 빈 문자열 · 기호는 null이며 던지지 않는다', () => {
    expect(corpusIdentityOf('가')).toMatchObject({ initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null })
    expect(corpusIdentityOf('힣')).toMatchObject({ finalJamo: 'ㅎ' })
    for (const char of ['ㄱ', 'ㄲ', 'ㅏ', '', 'a', '。']) expect(corpusIdentityOf(char), char).toBeNull()
    expect(isCorpusCodepoint(0xac00)).toBe(true)
    expect(isCorpusCodepoint(0x3131)).toBe(false)
    expect(() => corpusIdentity(0x3131)).toThrow()
  })
})
