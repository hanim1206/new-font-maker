import { CORPUS_FINALS, CORPUS_INITIALS, CORPUS_MEDIALS, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import { MEDIAL_ROLE_SETS } from '../src/services/notoVariationModel'
import { criterionFor, JAMO_LITERATURE_GROUPS, sameGroupJamos, sameTraitJamos } from './jamoLiteratureGroups'
import { roleLabel } from './notoMedialFitView'
import { familyOfContext, finalOfContext, matchesRule, normalizeRule, ruleGlyphCount, ruleName } from './scopeRule'
import type { MedialFamilyId, RuleJamoPart, ScopeRule } from './scopeRule'

/**
 * 범위 고르기 화면(`LayoutScopePicker`)의 계산. 계약은 `docs/specs/적용범위-규칙식.md` §6·§7.
 *
 * 화면은 **축마다 자모 줄 하나**다(첫닿자 · 홀자 · 받침). 저장은 규칙식 하나고, 그 사이를 잇는 길이
 * `setsOfRule` · `ruleOfSets`다. 집합으로 풀면 줄 토글이 단순해지고, 접을 때 계열·받침 유무 같은 짧은 말로 도로 줄어든다.
 * 표(격자)로 고르는 길은 9/22에 버렸다 — 축이 셋인데 표는 둘밖에 못 담아 셋째 축이 늘 밖으로 샜다.
 */

export const MEDIAL_FAMILY_ITEMS: Readonly<Record<MedialFamilyId, string[]>> = {
  right: [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'], bottom: [...'ㅗㅛㅜㅠㅡ'], mixed: [...'ㅘㅙㅚㅝㅞㅟㅢ'],
}
const FAMILY_OF_MEDIAL = new Map<string, MedialFamilyId>(
  (Object.entries(MEDIAL_FAMILY_ITEMS) as [MedialFamilyId, string[]][]).flatMap(([family, items]) => items.map((jamo) => [jamo, family] as const)),
)
const FINAL_JAMOS = CORPUS_FINALS.filter((value): value is string => value !== null)

export interface ScopeSets {
  initial: Set<string>
  medial: Set<string>
  /** `null` = 받침 없음. */
  final: Set<string | null>
}

const sameItems = (set: ReadonlySet<unknown>, items: readonly unknown[]) => set.size === items.length && items.every((item) => set.has(item))

/** 규칙식 → 축 값 집합. 조건이 없으면 그 축은 전부다. */
export function setsOfRule(rule: ScopeRule): ScopeSets {
  const medial = rule.medial?.length
    ? new Set(rule.medial)
    : new Set(rule.medialFamily?.length ? rule.medialFamily.flatMap((family) => MEDIAL_FAMILY_ITEMS[family]) : CORPUS_MEDIALS)
  const final: Set<string | null> = rule.final?.length
    ? new Set<string | null>(rule.final)
    : rule.hasFinal === true ? new Set<string | null>(FINAL_JAMOS)
    : rule.hasFinal === false ? new Set<string | null>([null])
    : new Set<string | null>(CORPUS_FINALS)
  return { initial: new Set(rule.initial?.length ? rule.initial : CORPUS_INITIALS), medial, final }
}

/** 축 값 집합 → 규칙식. 전부 켜진 축은 조건을 안 붙이고, 홀자는 계열로·받침은 유무로 접을 수 있으면 접는다. */
export function ruleOfSets(sets: ScopeSets): ScopeRule {
  const rule: ScopeRule = {}
  if (!sameItems(sets.initial, CORPUS_INITIALS)) rule.initial = [...sets.initial]
  if (!sameItems(sets.medial, CORPUS_MEDIALS)) {
    const families = (Object.keys(MEDIAL_FAMILY_ITEMS) as MedialFamilyId[]).filter((family) => MEDIAL_FAMILY_ITEMS[family].every((jamo) => sets.medial.has(jamo)))
    const covered = families.flatMap((family) => MEDIAL_FAMILY_ITEMS[family])
    // 켠 홀자가 계열 몇 개로 딱 떨어지면 계열 조건으로 접는다. 아니면 자모 목록 그대로.
    if (families.length > 0 && covered.length === sets.medial.size) rule.medialFamily = families
    else rule.medial = [...sets.medial]
  }
  // 받침은 목록 그대로 넘긴다. `없음`만 · 받침 자모 전부는 `normalizeRule`이 유무 조건으로 접는다.
  if (!sameItems(sets.final, CORPUS_FINALS)) rule.final = CORPUS_FINALS.filter((value) => sets.final.has(value))
  return normalizeRule(rule)
}

/** 그 축 값 하나가 지금 켜져 있나. */
export const axisOn = (sets: ScopeSets, axis: 'initial' | 'medial' | 'final', value: string | null): boolean =>
  axis === 'final' ? sets.final.has(value) : axis === 'initial' ? sets.initial.has(value as string) : sets.medial.has(value as string)

/**
 * 축 하나에서 자모를 넣고 뺀다. 마지막 하나까지 빼면 아무 글자도 안 닿으므로 그때는 안 뺀다.
 * 범위 고르기가 축마다 줄 하나를 놓기 때문에(표가 아니라) 조작은 이 하나면 된다.
 */
export function toggleAxisValue(sets: ScopeSets, axis: 'initial' | 'medial' | 'final', value: string | null): ScopeSets {
  const next: ScopeSets = { initial: new Set(sets.initial), medial: new Set(sets.medial), final: new Set(sets.final) }
  const target = next[axis] as Set<string | null>
  if (target.has(value)) { if (target.size === 1) return sets; target.delete(value) } else target.add(value)
  return next
}

/**
 * 줄 머리의 `전체`. 전부 안 켜졌으면 전부 켜고, 이미 전부면 **하나만 남긴다**(`keep`, 보통 지금 글자의 자모).
 * 전부 끄기를 안 두는 건 아무 글자도 안 닿는 범위를 만들 수 없어서다.
 */
export function toggleAxisAll(sets: ScopeSets, axis: 'initial' | 'medial' | 'final', items: readonly (string | null)[], keep: string | null): ScopeSets {
  const next: ScopeSets = { initial: new Set(sets.initial), medial: new Set(sets.medial), final: new Set(sets.final) }
  const whole = items.every((item) => (sets[axis] as Set<string | null>).has(item)) && (sets[axis] as Set<string | null>).size === items.length
  const only = items.includes(keep) ? keep : items[0]
  next[axis] = new Set(whole ? [only] : items) as never
  return next
}

/** 그 축이 지금 전부 켜져 있나. 줄 머리 `전체`의 눌림 표시. */
export const axisAllOn = (sets: ScopeSets, axis: 'initial' | 'medial' | 'final', items: readonly (string | null)[]): boolean =>
  (sets[axis] as Set<string | null>).size === items.length && items.every((item) => (sets[axis] as Set<string | null>).has(item))

export interface ScopeChip {
  id: string
  label: string
  /** 닿는 글자 수. */
  count: number
  rule: ScopeRule
}

/**
 * 추천 칩. 지금 고친 것에서 나오고, 누르면 표를 그 규칙으로 **갈아치운다**(합치지 않는다).
 * 순서는 계약 §7 그대로 — 구조군 · rail 역할 · 속공간 · 높이. 홀자를 잡았으면 구조군은 없다(구조군 표가 닿자 것이라서).
 * 이름은 짧게 짓는다(`구조군 ㅁ`) — 긴 설명은 칩 줄을 옆으로 밀어 버린다. 무엇이 같은지는 켠 표가 말한다.
 */
export function scopeChipsFor(input: { source: CorpusIdentity; part: RuleJamoPart; railRole?: string }): ScopeChip[] {
  const { source, part, railRole } = input
  const base: ScopeRule = { medialFamily: [familyOfContext(source.contextId)], hasFinal: finalOfContext(source.contextId) }
  const jamo = part === 'initial' ? source.initialJamo : part === 'final' ? source.finalJamo : source.medialJamo
  const chips: ScopeChip[] = []
  const add = (id: string, label: string, rule: ScopeRule) => {
    const normalized = normalizeRule(rule)
    const count = ruleGlyphCount(normalized)
    if (count > 0) chips.push({ id, label, count, rule: normalized })
  }
  if (jamo && (part === 'initial' || part === 'final')) {
    const jamos = sameGroupJamos(criterionFor(part, source.contextId), jamo)
    if (jamos.length > 1) add('group', `구조군 ${jamo}`, { ...base, [part]: jamos })
  }
  if (railRole) {
    // 그 rail 역할을 가진 홀자 전부. 계열을 안 가린다 — 역할이 같으면 같은 자리가 움직여서다.
    const medials = CORPUS_MEDIALS.filter((medial) => MEDIAL_ROLE_SETS[medial]?.includes(railRole))
    if (medials.length > 1) add('role', `${roleLabel(railRole)} 홀자`, { hasFinal: base.hasFinal, medial: medials })
  }
  if (jamo && part !== 'medial') {
    const space = sameTraitJamos('inkSpaceGroup', jamo)
    if (space.length > 1) add('space', '속공간', { ...base, [part]: space })
    const height = sameTraitJamos('height', jamo)
    const heightLabel = JAMO_LITERATURE_GROUPS[jamo]?.height
    if (height.length > 1 && height.length < CORPUS_INITIALS.length) add('height', `높이 ${heightLabel ?? '같음'}`, { ...base, [part]: height })
  }
  return chips.slice(0, 4)
}

/** 그 규칙에 닿는 글자 몇 개. 표본 줄과 머리에 쓴다. 원본 글자는 맨 앞에 두지 않는다. */
export function ruleSamples(rule: ScopeRule, count: number, exclude?: number): CorpusIdentity[] {
  const picked: CorpusIdentity[] = []
  for (const final of CORPUS_FINALS) for (const medial of CORPUS_MEDIALS) for (const initial of CORPUS_INITIALS) {
    const codepoint = corpusCodepoint(initial, medial, final)
    if (codepoint === exclude) continue
    const identity = corpusIdentity(codepoint)
    if (!matchesRule(rule, identity)) continue
    picked.push(identity)
    if (picked.length >= count) return picked
  }
  return picked
}

/** 그 규칙이 가리키는 칸(여섯 중 하나). 계열이 여럿이면 첫 계열로, 조건이 없으면 지금 글자의 칸으로 그린다. */
export function contextIdOfRule(rule: ScopeRule, fallbackContextId: string): string {
  const family = rule.medialFamily?.[0] ?? familyOfContext(fallbackContextId)
  const hasFinal = rule.hasFinal ?? finalOfContext(fallbackContextId)
  return hasFinal ? `${family}-final` : family
}

/** 화면에 적는 이름. 규칙에서 매번 짓는다(저장하지 않는다). */
export const scopeTitle = (rule: ScopeRule) => ruleName(rule)

/** 홀자 자모가 속한 계열. 몬드리안 썸네일이 어느 칸 모양을 그릴지 정할 때 쓴다. */
export const familyOfMedial = (medial: string): MedialFamilyId => FAMILY_OF_MEDIAL.get(medial) ?? 'right'
