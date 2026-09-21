import { CORPUS_FINALS, CORPUS_INITIALS, CORPUS_MEDIALS, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import { MEDIAL_ROLE_SETS } from '../src/services/notoVariationModel'
import { criterionFor, sameGroupJamos, sameTraitJamos } from './jamoLiteratureGroups'
import { roleLabel } from './notoMedialFitView'
import { familyOfContext, finalOfContext, matchesRule, normalizeRule, ruleGlyphCount, ruleName } from './scopeRule'
import type { MedialFamilyId, RuleJamoPart, ScopeRule } from './scopeRule'

/**
 * 범위 고르기 화면(`LayoutScopePicker`)의 계산. 계약은 `docs/specs/적용범위-규칙식.md` §6·§7.
 *
 * 표에서 머리를 누르는 건 **축 값을 켜고 끄는 일**이고, 저장은 규칙식 하나다.
 * 그래서 규칙식 ↔ 축 값 집합을 오가는 길(`setsOfRule` · `ruleOfSets`)이 이 파일의 가운데다.
 * 집합으로 풀면 머리 토글·드래그가 단순해지고, 접을 때 계열·받침 유무 같은 짧은 말로 도로 줄어든다.
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
  if (!sameItems(sets.final, CORPUS_FINALS)) {
    const hasNone = sets.final.has(null)
    const finals = [...sets.final].filter((value): value is string => value !== null)
    // 받침 없음만 = `hasFinal: false`, 받침 전부 = `hasFinal: true`, 그 사이는 자모 목록.
    // 목록은 받침이 있다는 뜻을 품으므로 `없음`은 목록과 같이 못 산다 — 그때는 없음을 버린다(화면의 받침 세그먼트가 막는다).
    if (hasNone && finals.length === 0) rule.hasFinal = false
    else if (!hasNone && finals.length === FINAL_JAMOS.length) rule.hasFinal = true
    else if (finals.length > 0) rule.final = finals
    else rule.hasFinal = false
  }
  return normalizeRule(rule)
}

/** 그 축 값 하나가 지금 켜져 있나. */
export const axisOn = (sets: ScopeSets, axis: 'initial' | 'medial' | 'final', value: string | null): boolean =>
  axis === 'final' ? sets.final.has(value) : axis === 'initial' ? sets.initial.has(value as string) : sets.medial.has(value as string)

/** 축 값 여럿을 한꺼번에 켜거나 끈다. 마지막 하나까지 끄면 아무 글자도 안 닿으므로 그때는 안 끈다. */
export function toggleAxis(sets: ScopeSets, axis: 'initial' | 'medial' | 'final', values: readonly (string | null)[], on: boolean): ScopeSets {
  const next: ScopeSets = { initial: new Set(sets.initial), medial: new Set(sets.medial), final: new Set(sets.final) }
  const target = next[axis] as Set<string | null>
  for (const value of values) { if (on) target.add(value); else target.delete(value) }
  if (target.size === 0) return sets
  return next
}

export interface ScopeChip {
  id: string
  label: string
  /** 닿는 글자 수. */
  count: number
  rule: ScopeRule
}

const RULE_PART_LABEL: Record<RuleJamoPart, string> = { initial: '첫닿자', medial: '홀자', final: '받침' }
const jamoPhrase = (jamos: readonly string[]) => jamos.length > 3 ? `${jamos.slice(0, 2).join('·')} 외 ${jamos.length - 2}` : jamos.join('·')

/**
 * 추천 칩. 지금 고친 것에서 나오고, 누르면 표를 그 규칙으로 **갈아치운다**(합치지 않는다).
 * 순서는 계약 §7 그대로 — 구조군 · rail 역할 · 속공간 · 높이. 홀자를 잡았으면 구조군은 없다(구조군 표가 닿자 것이라서).
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
    if (jamos.length > 1) add('group', `${jamo}과 같은 구조군 ${RULE_PART_LABEL[part]}`, { ...base, [part]: jamos })
  }
  if (railRole) {
    // 그 rail 역할을 가진 홀자 전부. 계열을 안 가린다 — 역할이 같으면 같은 자리가 움직여서다.
    const medials = CORPUS_MEDIALS.filter((medial) => MEDIAL_ROLE_SETS[medial]?.includes(railRole))
    if (medials.length > 1) add('role', `${roleLabel(railRole)} 있는 홀자`, { hasFinal: base.hasFinal, medial: medials })
  }
  if (jamo && part !== 'medial') {
    const space = sameTraitJamos('inkSpaceGroup', jamo)
    if (space.length > 1) add('space', `속공간이 같은 ${RULE_PART_LABEL[part]} ${jamoPhrase(space)}`, { ...base, [part]: space })
    const height = sameTraitJamos('height', jamo)
    if (height.length > 1 && height.length < CORPUS_INITIALS.length) add('height', `높이가 같은 ${RULE_PART_LABEL[part]} ${jamoPhrase(height)}`, { ...base, [part]: height })
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
