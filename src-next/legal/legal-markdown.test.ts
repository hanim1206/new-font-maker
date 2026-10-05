import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGAL_FIELDS } from './legalInfo'
import { fillFields, parseLegalMarkdown, parseSpans } from './legalMarkdown'

describe('약관 마크다운 읽기', () => {
  it('굵게를 나눈다', () => {
    expect(parseSpans('앞 **굵게** 뒤')).toEqual([
      { text: '앞 ', bold: false }, { text: '굵게', bold: true }, { text: ' 뒤', bold: false },
    ])
  })

  it('빈칸은 값이 있을 때만 채운다', () => {
    expect(fillFields('{운영자} · {문의 이메일}', { 운영자: '한임', '문의 이메일': '' })).toBe('한임 · {문의 이메일}')
  })

  it('제목 · 문단 · 들여 쓴 번호 목록 · 점 목록 · 표를 읽는다', () => {
    const blocks = parseLegalMarkdown([
      '## 제7조 (권리)', '', '첫 줄', '이어진 줄', '',
      '1. 하나', '2. 둘', '   1. 둘의 하나', '3. 셋', '',
      '- 점',
      '', '| 가 | 나 |', '|---|---|', '| 1 | **2** |',
    ].join('\n'))
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'table'])
    expect(blocks[1]).toEqual({ kind: 'paragraph', spans: [{ text: '첫 줄 이어진 줄', bold: false }] })
    const ordered = blocks[2]
    if (ordered.kind !== 'list') throw new Error('목록이 아니다')
    expect(ordered.ordered).toBe(true)
    expect(ordered.items).toHaveLength(3)
    expect(ordered.items[1].children?.items[0].spans[0].text).toBe('둘의 하나')
    const table = blocks[4]
    if (table.kind !== 'table') throw new Error('표가 아니다')
    expect(table.head.map((cell) => cell[0].text)).toEqual(['가', '나'])
    expect(table.rows).toEqual([[[{ text: '1', bold: false }], [{ text: '2', bold: true }]]])
  })

  it.each(['terms.md', 'privacy.md'])('%s: 본문이 비지 않고 초안 표시(⚠)가 남지 않았다', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf8')
    expect(source).not.toContain('⚠')
    const blocks = parseLegalMarkdown(source)
    expect(blocks.filter((block) => block.kind === 'heading').length).toBeGreaterThan(5)
    // 공개 문서라 빈칸이 화면에 `{이름}`으로 남으면 안 된다.
    expect(fillFields(source, LEGAL_FIELDS).match(/\{[^{}]+\}/g)).toBeNull()
  })
})
