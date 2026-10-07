/**
 * 약관 · 처리방침 본문용 작은 마크다운 읽개. 새 의존성 없이 문서에 쓰는 꼴만 읽는다:
 * `## 제목`, 문단, `1.` 번호 목록(세 칸 들여 쓰면 한 단계 안쪽), `-` 점 목록, `|` 표, `**굵게**`, `{빈칸}`.
 */

export interface Span { text: string; bold: boolean }
export interface ListItem { spans: Span[]; children: ListBlock | null }
export interface ListBlock { kind: 'list'; ordered: boolean; items: ListItem[] }
export type LegalBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; spans: Span[] }
  | ListBlock
  | { kind: 'table'; head: Span[][]; rows: Span[][][] }

/** `{이름}`을 값으로 바꾼다. 값이 없거나 비면 그대로 둔다. */
export function fillFields(source: string, fields: Record<string, string>): string {
  return source.replace(/\{([^{}]+)\}/g, (whole, name: string) => fields[name] || whole)
}

/** `**굵게**`만 나눈다. */
export function parseSpans(text: string): Span[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith('**') && part.endsWith('**') ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false })
}

const LIST_ITEM = /^( *)(\d+\.|-) (.*)$/
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => parseSpans(cell.trim()))

/** 목록을 들여쓰기 단계(세 칸 또는 두 칸)대로 읽는다. 끝난 줄 번호를 돌려준다. */
function readList(lines: string[], start: number, indent: number): [ListBlock, number] {
  const first = LIST_ITEM.exec(lines[start])!
  const list: ListBlock = { kind: 'list', ordered: first[2] !== '-', items: [] }
  let index = start
  while (index < lines.length) {
    const match = LIST_ITEM.exec(lines[index])
    if (!match || match[1].length < indent) break
    if (match[1].length > indent) {
      const [child, next] = readList(lines, index, match[1].length)
      const last = list.items[list.items.length - 1]
      if (last) last.children = child
      index = next
      continue
    }
    list.items.push({ spans: parseSpans(match[3]), children: null })
    index += 1
  }
  return [list, index]
}

export function parseLegalMarkdown(source: string): LegalBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: LegalBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: line.slice(3).trim() })
      index += 1
    } else if (LIST_ITEM.test(line)) {
      const [list, next] = readList(lines, index, LIST_ITEM.exec(line)![1].length)
      blocks.push(list)
      index = next
    } else if (line.trim().startsWith('|')) {
      const rows: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(lines[index++])
      // 둘째 줄은 `|---|` 구분 줄.
      const body = rows.slice(1).filter((row) => !/^\s*\|[\s|:-]+\|\s*$/.test(row))
      blocks.push({ kind: 'table', head: cells(rows[0]), rows: body.map(cells) })
    } else {
      const text: string[] = []
      while (index < lines.length && lines[index].trim() && !lines[index].startsWith('## ') && !LIST_ITEM.test(lines[index]) && !lines[index].trim().startsWith('|')) text.push(lines[index++].trim())
      blocks.push({ kind: 'paragraph', spans: parseSpans(text.join(' ')) })
    }
  }
  return blocks
}
