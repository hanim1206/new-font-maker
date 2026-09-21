import { CORPUS_INITIALS, CORPUS_MEDIALS, CORPUS_TOTAL, corpusIdentity } from './notoCorpus'

/**
 * 배치 Δ 하나가 닿는 글자 집합. 계약은 `docs/specs/적용범위-규칙식.md`.
 *
 * 조건은 **AND**(다 만족해야 닿는다), 조건 안의 목록은 **OR**이다.
 * 옛 세 층(`전체` · `이 레이아웃` · `이 자모만`)이 전부 이 하나의 특수형이다 —
 * `{}`는 전체, `{ medialFamily, hasFinal }`은 이 레이아웃, 거기에 자모 목록이 붙으면 이 자모만.
 * 그래서 넓이를 층 이름이 아니라 **닿는 글자 수**로 잰다.
 */
export interface ScopeRule {
  /** 홀자 계열. 없으면 안 따진다. */
  medialFamily?: MedialFamilyId[]
  /** 받침 유무. 없으면 안 따진다. */
  hasFinal?: boolean
  /** 부품별 자모 목록. 없으면 안 따진다. 혼합 홀자는 쪼개지 않고 홀자 하나로 본다(`ㅘ`). */
  initial?: string[]
  medial?: string[]
  final?: string[]
}

export type MedialFamilyId = 'right' | 'bottom' | 'mixed'
export type RuleJamoPart = 'initial' | 'medial' | 'final'
/** 조건이 붙는 순서. 넓이가 같을 때 앞엣것이 붙은 쪽을 넓게 본다(순서가 흔들리면 안 된다). */
const CONDITION_ORDER = ['medialFamily', 'hasFinal', 'initial', 'medial', 'final'] as const

export const EMPTY_RULE: ScopeRule = {}
export const isEmptyRule = (rule: ScopeRule): boolean => CONDITION_ORDER.every((key) => rule[key] === undefined)

/** 문맥 여섯 값(`right` · `right-final` …)을 계열과 받침 유무로 가른다. */
export const familyOfContext = (contextId: string): MedialFamilyId =>
  contextId.startsWith('mixed') ? 'mixed' : contextId.startsWith('bottom') ? 'bottom' : 'right'
export const finalOfContext = (contextId: string): boolean => contextId.endsWith('-final')
/** 그 문맥에 닿는 규칙. 옛 `이 레이아웃`과 같은 뜻이다. */
export const ruleOfContext = (contextId: string): ScopeRule => ({ medialFamily: [familyOfContext(contextId)], hasFinal: finalOfContext(contextId) })

interface RuleIdentity { initialJamo: string; medialJamo: string; finalJamo: string | null; contextId: string }

/** 글자 하나가 이 규칙에 닿나. 다섯 조건을 다 만족해야 한다. */
export function matchesRule(rule: ScopeRule, identity: RuleIdentity): boolean {
  if (rule.medialFamily && !rule.medialFamily.includes(familyOfContext(identity.contextId))) return false
  if (rule.hasFinal !== undefined && rule.hasFinal !== (identity.finalJamo !== null)) return false
  if (rule.initial && !rule.initial.includes(identity.initialJamo)) return false
  if (rule.medial && !rule.medial.includes(identity.medialJamo)) return false
  if (rule.final && (identity.finalJamo === null || !rule.final.includes(identity.finalJamo))) return false
  return true
}

/** 목록은 자모 순으로, 빈 조건은 빼고, 키 순서는 고정. 같은 뜻이면 같은 결과여야 한다. */
export function normalizeRule(rule: ScopeRule): ScopeRule {
  const next: ScopeRule = {}
  if (rule.medialFamily?.length) next.medialFamily = ['right', 'bottom', 'mixed'].filter((family) => rule.medialFamily!.includes(family as MedialFamilyId)) as MedialFamilyId[]
  if (rule.hasFinal !== undefined) next.hasFinal = rule.hasFinal
  if (rule.initial?.length) next.initial = sortedJamos(rule.initial, CORPUS_INITIALS)
  if (rule.medial?.length) next.medial = sortedJamos(rule.medial, CORPUS_MEDIALS)
  if (rule.final?.length) next.final = sortedJamos(rule.final, FINAL_JAMOS)
  return next
}
const FINAL_JAMOS = [...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const sortedJamos = (jamos: readonly string[], order: readonly string[]): string[] =>
  Array.from(new Set(jamos)).sort((a, b) => order.indexOf(a) - order.indexOf(b))

/** 저장소 키. 정규화한 규칙을 그대로 읽을 수 있는 문자열로. `{}`는 빈 문자열이다. */
export function ruleKey(rule: ScopeRule): string {
  const normalized = normalizeRule(rule)
  const parts: string[] = []
  if (normalized.medialFamily) parts.push(`f=${normalized.medialFamily.join('')}`)
  if (normalized.hasFinal !== undefined) parts.push(`j=${normalized.hasFinal ? '1' : '0'}`)
  if (normalized.initial) parts.push(`i=${normalized.initial.join('')}`)
  if (normalized.medial) parts.push(`m=${normalized.medial.join('')}`)
  if (normalized.final) parts.push(`n=${normalized.final.join('')}`)
  return parts.join('|')
}

/** 키에서 규칙으로. 저장분을 읽을 때 쓴다. 모르는 조각은 버린다. */
export function ruleFromKey(key: string): ScopeRule {
  const rule: ScopeRule = {}
  for (const part of key.split('|')) {
    const [name, value] = [part.slice(0, 1), part.slice(2)]
    if (!part.includes('=')) continue
    if (name === 'f') rule.medialFamily = ([...value.matchAll(/right|bottom|mixed/g)].map(([match]) => match) as MedialFamilyId[])
    else if (name === 'j') rule.hasFinal = value === '1'
    else if (name === 'i') rule.initial = [...value]
    else if (name === 'm') rule.medial = [...value]
    else if (name === 'n') rule.final = [...value]
  }
  return normalizeRule(rule)
}

/** 닿는 글자 수. 11,172자 전수에서 센다. 키로 메모한다. */
const countCache = new Map<string, number>()
export function ruleGlyphCount(rule: ScopeRule): number {
  const key = ruleKey(rule)
  if (key === '') return CORPUS_TOTAL
  const cached = countCache.get(key)
  if (cached !== undefined) return cached
  let count = 0
  for (let offset = 0; offset < CORPUS_TOTAL; offset += 1) {
    if (matchesRule(rule, corpusIdentity(0xac00 + offset))) count += 1
  }
  countCache.set(key, count)
  return count
}

/**
 * 넓은 것부터. 닿는 글자가 많은 쪽이 넓고, 같으면 조건이 먼저 붙은 쪽(`계열 → 받침 → 첫닿자 → 홀자 → 받침자모`)이 넓다.
 * Δ를 이 순서로 더해야 좁은 층의 변 고정(`{ at }`)이 넓은 층 값을 덮는다.
 */
export function compareBreadth(a: ScopeRule, b: ScopeRule): number {
  const gap = ruleGlyphCount(b) - ruleGlyphCount(a)
  if (gap !== 0) return gap
  for (const key of CONDITION_ORDER) {
    const [hasA, hasB] = [a[key] !== undefined, b[key] !== undefined]
    if (hasA !== hasB) return hasA ? -1 : 1
  }
  return ruleKey(a).localeCompare(ruleKey(b))
}

const FAMILY_LABEL: Record<MedialFamilyId, string> = { right: '오른쪽 홀자', bottom: '아래 홀자', mixed: '섞임 홀자' }
/** 여섯 칸 이름. `reviewPropagation`의 `LAYOUT_CONTEXT_LABEL`과 같은 말을 쓴다(그쪽을 가져오면 모듈이 서로 물린다). */
const CONTEXT_LABEL: Record<string, string> = {
  right: '오른쪽 홀자', 'right-final': '오른쪽 홀자 · 받침',
  bottom: '아래 홀자', 'bottom-final': '아래 홀자 · 받침',
  mixed: '섞임 홀자', 'mixed-final': '섞임 홀자 · 받침',
}
const PART_LABEL: Record<RuleJamoPart, string> = { initial: '첫닿자', medial: '홀자', final: '받침' }
const jamoPhrase = (jamos: readonly string[]): string => jamos.length > 3 ? `${jamos[0]} 외 ${jamos.length - 1}` : jamos.join('·')

/**
 * 규칙에서 이름을 짓는다. 저장하지 않는다 — 범위가 바뀌면 이름도 따라 바뀌어야 한다.
 * 계열+받침이 온전히 한 문맥을 가리키면 여섯 칸 이름(`오른쪽 홀자 · 받침`)을 그대로 쓴다.
 */
export function ruleName(rule: ScopeRule): string {
  const normalized = normalizeRule(rule)
  if (isEmptyRule(normalized)) return '전체'
  const head: string[] = []
  if (normalized.medialFamily?.length === 1 && normalized.hasFinal !== undefined) {
    head.push(CONTEXT_LABEL[`${normalized.medialFamily[0]}${normalized.hasFinal ? '-final' : ''}`] ?? FAMILY_LABEL[normalized.medialFamily[0]])
  } else {
    if (normalized.medialFamily) head.push(normalized.medialFamily.map((family) => FAMILY_LABEL[family]).join('·'))
    if (normalized.hasFinal !== undefined) head.push(normalized.hasFinal ? '받침 있음' : '받침 없음')
  }
  const tail = (['initial', 'medial', 'final'] as const)
    .flatMap((part) => normalized[part]?.length ? [`${PART_LABEL[part]} ${jamoPhrase(normalized[part]!)}`] : [])
  return [...head, ...tail].join(' · ')
}

/** 규칙에 자모 조건을 얹은 새 규칙. 좁히기. */
export const withJamos = (rule: ScopeRule, part: RuleJamoPart, jamos: readonly string[]): ScopeRule =>
  normalizeRule({ ...rule, [part]: jamos.length ? [...jamos] : undefined })

/** 옛 저장분(전체 · 레이아웃 · 자모 층)의 자리를 새 규칙으로 옮긴다. */
export function ruleOfLegacy(layer: 'all' | 'layer' | 'jamo', contextId?: string, jamoKey?: string): ScopeRule {
  if (layer === 'all' || !contextId) return {}
  const base = ruleOfContext(contextId)
  if (layer === 'layer' || !jamoKey) return base
  const [group, jamo] = [jamoKey.slice(0, jamoKey.indexOf(':')), jamoKey.slice(jamoKey.indexOf(':') + 1)]
  const part: RuleJamoPart = group === 'CH' ? 'initial' : group === 'JO' ? 'final' : 'medial'
  return withJamos(base, part, [jamo])
}
