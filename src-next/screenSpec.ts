/**
 * 화면 명세(`docs/specs/화면/*.md`) 읽기. 형식은 `화면 → 영역 → 기능` 세 단이다.
 * 머리말(`route` `name` `status` `updated`) + `# 화면` + `## N. 영역` + `- N.M 기능 — 설명`.
 * 다른 화면과 같은 영역은 다시 쓰지 않고 `` `자소편집 3` ``처럼 번호로 가리킨다. 가리킨 곳은 `resolveReference`로 푼다.
 */

export const SCREEN_SPEC_STATUSES = ['사용 중', '폐기 예정', '실험'] as const
export type ScreenSpecStatus = typeof SCREEN_SPEC_STATUSES[number]

export type ScreenSpecBlock =
  | { kind: 'title'; text: string }
  | { kind: 'section'; number: number; title: string }
  /** `number`가 없으면 번호 없는 줄(다른 화면을 통째로 가리키는 줄 등). */
  | { kind: 'feature'; section: number; number?: string; text: string }
  | { kind: 'note'; text: string }

export interface ScreenSpec {
  route: string
  name: string
  status: string
  updated: string
  blocks: ScreenSpecBlock[]
}

export interface ScreenSpecReference {
  name: string
  section: number
  /** 기능 번호 범위(`5.1~5.4`면 1·4, `5.5`면 5·5). 없으면 영역 전체. */
  from?: number
  to?: number
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/
const SECTION = /^## (\d+)\. (.+)$/
const FEATURE = /^- (?:(\d+\.\d+) )?(.+)$/

export function parseScreenSpec(raw: string): ScreenSpec {
  const text = raw.replace(/\r\n/g, '\n')
  const front = FRONT_MATTER.exec(text)
  const meta: Record<string, string> = {}
  for (const line of front?.[1].split('\n') ?? []) {
    const at = line.indexOf(':')
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  const blocks: ScreenSpecBlock[] = []
  let section = 0
  for (const line of text.slice(front?.[0].length ?? 0).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const sectionMatch = SECTION.exec(trimmed)
    const featureMatch = FEATURE.exec(trimmed)
    if (trimmed.startsWith('# ')) blocks.push({ kind: 'title', text: trimmed.slice(2) })
    else if (sectionMatch) { section = Number(sectionMatch[1]); blocks.push({ kind: 'section', number: section, title: sectionMatch[2] }) }
    else if (featureMatch && section > 0) blocks.push({ kind: 'feature', section, number: featureMatch[1], text: featureMatch[2] })
    else blocks.push({ kind: 'note', text: trimmed })
  }
  return { route: meta.route ?? '', name: meta.name ?? '', status: meta.status ?? '', updated: meta.updated ?? '', blocks }
}

export function screenSpecForPath(specs: readonly ScreenSpec[], pathname: string): ScreenSpec | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return specs.find((spec) => spec.route === path)
}

/** 글 안에서 `` `이름 3` `` `` `이름 5.5` `` `` `이름 5.1~5.4` `` 꼴로 다른 명세를 가리킨 곳. 아는 이름만 잡는다. */
export function findReferences(text: string, names: readonly string[]): ScreenSpecReference[] {
  const found: ScreenSpecReference[] = []
  for (const match of text.matchAll(/`([^`\s]+) (\d+)(?:\.(\d+)(?:~\d+\.(\d+))?)?`/g)) {
    if (!names.includes(match[1])) continue
    const from = match[3] ? Number(match[3]) : undefined
    found.push({ name: match[1], section: Number(match[2]), from, to: match[4] ? Number(match[4]) : from })
  }
  return found
}

/** 가리킨 영역(또는 기능 범위)의 기능 줄. 못 찾으면 빈 배열. */
export function resolveReference(specs: readonly ScreenSpec[], reference: ScreenSpecReference): Extract<ScreenSpecBlock, { kind: 'feature' }>[] {
  const spec = specs.find((item) => item.name === reference.name)
  if (!spec) return []
  return spec.blocks.filter((block): block is Extract<ScreenSpecBlock, { kind: 'feature' }> => {
    if (block.kind !== 'feature' || block.section !== reference.section) return false
    if (reference.from === undefined) return true
    const index = Number(block.number?.split('.')[1])
    return Number.isFinite(index) && index >= reference.from && index <= (reference.to ?? reference.from)
  })
}
