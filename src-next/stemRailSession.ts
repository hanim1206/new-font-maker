import type { ContextBoxDelta } from '../src/services/contextBoxResolver'
import { medialPartGroups } from '../src/services/contextBoxResolver'
import type { Part } from '../src/types'
import { LAYOUT_CONTEXT_LABEL } from './reviewPropagation'
import { ruleOfContext, type ScopeRule } from './scopeRule'

/**
 * 획 편집에서 줄기 끝을 끌어 옮긴 보선(이 레이아웃 Δ)을 모아, 나갈 때 한 번 "어디까지 반영할까요?"를 묻는다.
 * 묶음 = 레이아웃 칸, 카드 = 그 칸의 홀자 중 옮긴 역할을 가진 것. 처음엔 전부 골라져 있고, 고친 홀자는 뺄 수 없다.
 * 뺀 홀자는 `이 자모만` 층(범위 규칙 + 홀자 목록)에 반대 Δ를 적는다 — 이번 편집만 빠진다(D0 · G1 결정, 09-29).
 * 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md
 */

type MedialPart = Extract<Part, 'JU' | 'JU_H' | 'JU_V'>

/** 끌기 한 번이 옮긴 보선. 되돌리기 기록에 실어 두고, 세션은 기록에서 다시 읽는다(되돌린 끌기는 빠진다). */
export interface StemRailEdit {
  contextId: string
  medialJamo: string
  part: MedialPart
  keys: readonly string[]
  /** em. 위가 음수. */
  delta: number
}

export interface StemRailGroup {
  contextId: string
  label: string
  /** 옮긴 역할을 가진 이 칸의 홀자. 홀자 순서. */
  medials: string[]
  /** 획 편집에서 직접 고친 홀자. 모양의 출처라 뺄 수 없다. */
  edited: string[]
  /** 칸 전체에 들어간 Δ. part → 역할 키 → em. */
  medial: Partial<Record<MedialPart, Record<string, number>>>
}

/** 반영 고르기 카드 키 = 칸:홀자. */
export const railCardKey = (contextId: string, medial: string) => `${contextId}:${medial}`

const FAMILY_MEDIALS: Readonly<Record<string, string>> = { right: 'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ', bottom: 'ㅗㅛㅜㅠㅡ', mixed: 'ㅘㅙㅚㅝㅞㅟㅢ' }
const familyOf = (contextId: string) => contextId.replace(/-final$/, '')

/** 이 홀자가 이 칸 · 역할 키를 가지나(`primaryBeam.center` → 그 part에 primaryBeam이 있나). */
function hasKey(medial: string, part: MedialPart, key: string): boolean {
  const role = key.slice(0, key.lastIndexOf('.'))
  return (medialPartGroups(medial) ?? []).some((group) => group.part === part && group.roleIds.includes(role))
}

/** 기록 속 끌기들을 레이아웃 칸별로 모은다. Δ가 다 0으로 돌아온 칸은 뺀다. */
export function stemRailGroups(edits: readonly StemRailEdit[]): StemRailGroup[] {
  const byContext = new Map<string, StemRailGroup>()
  for (const edit of edits) {
    const group = byContext.get(edit.contextId) ?? { contextId: edit.contextId, label: LAYOUT_CONTEXT_LABEL[edit.contextId] ?? edit.contextId, medials: [], edited: [], medial: {} }
    byContext.set(edit.contextId, group)
    const rails = (group.medial[edit.part] ??= {})
    for (const key of edit.keys) rails[key] = (rails[key] ?? 0) + edit.delta
    if (!group.edited.includes(edit.medialJamo)) group.edited.push(edit.medialJamo)
  }
  const groups: StemRailGroup[] = []
  for (const group of byContext.values()) {
    for (const [part, rails] of Object.entries(group.medial) as [MedialPart, Record<string, number>][]) {
      for (const [key, value] of Object.entries(rails)) if (Math.abs(value) < 1e-9) delete rails[key]
      if (Object.keys(rails).length === 0) delete group.medial[part]
    }
    if (Object.keys(group.medial).length === 0) continue
    const touched = Object.entries(group.medial).flatMap(([part, rails]) => Object.keys(rails!).map((key) => [part as MedialPart, key] as const))
    group.medials = [...(FAMILY_MEDIALS[familyOf(group.contextId)] ?? '')].filter((medial) => touched.some(([part, key]) => hasKey(medial, part, key)))
    group.edited = group.edited.filter((medial) => group.medials.includes(medial))
    groups.push(group)
  }
  return groups
}

/** 뺀 홀자마다 `이 자모만` 층에 적을 반대 Δ. 그 홀자에 없는 역할 키는 안 적는다. */
export function exclusionDeltas(group: StemRailGroup, excluded: readonly string[]): Array<{ rule: ScopeRule; delta: ContextBoxDelta }> {
  return excluded.filter((medial) => !group.edited.includes(medial)).flatMap((medial) => {
    const medialDelta: NonNullable<ContextBoxDelta['medial']> = {}
    for (const [part, rails] of Object.entries(group.medial) as [MedialPart, Record<string, number>][]) {
      const own = Object.entries(rails).filter(([key]) => hasKey(medial, part, key))
      if (own.length) medialDelta[part] = Object.fromEntries(own.map(([key, value]) => [key, -value]))
    }
    return Object.keys(medialDelta).length ? [{ rule: { ...ruleOfContext(group.contextId), medial: [medial] }, delta: { medial: medialDelta } }] : []
  })
}
