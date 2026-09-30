import { JUNGSEONG_LIST } from '../src/data/Hangul'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import {
  baseOf,
  boundStrokesOf,
  facetValuesOf,
  isUnder,
  masterFromStroke,
  STEM_FACETS,
  type JamoChannel,
  type StemBase,
  type StemMaster,
  type StemMasterName,
  type StemMasters,
} from '../src/services/stemMaster'
import type { JamoData } from '../src/types'

/**
 * 줄기 모양 반영 고르기의 계산. 홀자 줄기를 고친 뒤 "어디까지 반영할까요?" — 줄기 마스터 랩과 앱 획 편집이 같이 쓴다.
 * 묶음 = 갈래(잎), 카드 = 그 갈래에 귀속된 획 하나. 처음엔 전부 골라져 있고, 고친 획은 뺄 수 없다. 뺀 획은 지금 모양 그대로 `풀림`.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

/** 이 줄기에 귀속된 획 하나(홀자 · 채널 · 획)와 그 갈래(잎 이름 · 질문 답). */
export interface StemEntry { char: string; channel: JamoChannel; strokeId: string; name: StemMasterName; values: Record<string, string>; follows: boolean; curved: boolean }

/** 형제 카드 · 반영 고르기에서 그 획을 칠하는 색. */
export const ACTIVE_STROKE_COLOR = '#d9480f'

/** 대표 글자: ㅇ + 홀자 (+ 받침 ㅇ). */
export function sampleSyllable(jung: string, final: 'open' | 'closed'): string {
  const index = JUNGSEONG_LIST.indexOf(jung as (typeof JUNGSEONG_LIST)[number])
  return String.fromCharCode(0xac00 + (11 * 21 + index) * 28 + (final === 'closed' ? 21 : 0))
}

/**
 * 줄기 안 갈래(잎) 순서 — 단일 · 섞임을 먼저 가르고, 그 안에서 질문 보기 순서대로.
 * 기둥은 바깥 단일 → 안 단일 → 바깥 섞임 → 안 섞임.
 */
function leafRank(base: StemBase, name: StemMasterName): number[] {
  const values = facetValuesOf(name)
  const facets = STEM_FACETS[base]
  const ordered = [...facets.filter((facet) => facet.key === 'kind'), ...facets.filter((facet) => facet.key !== 'kind')]
  return ordered.map((facet) => facet.options.findIndex((option) => option.value === values[facet.key]))
}
export const byLeafRank = (base: StemBase) => (a: StemMasterName, b: StemMasterName) => {
  const ra = leafRank(base, a)
  const rb = leafRank(base, b)
  for (let index = 0; index < ra.length; index += 1) if (ra[index] !== rb[index]) return ra[index] - rb[index]
  return 0
}

/** 획 하나를 가리키는 열쇠(홀자 + 획 id). */
export const keyOf = (entry: Pick<StemEntry, 'char' | 'strokeId'>) => `${entry.char}:${entry.strokeId}`

export const uniqueChars = (entries: readonly StemEntry[]) => [...new Set(entries.map((entry) => entry.char))]

/** 연 때와 달라진 이름 있는 획(마스터 대상). 스토어는 고친 홀자만 새 객체라 같은 참조는 건너뛴다. */
export function changedStems(jungseong: Readonly<Record<string, JamoData>>, snapshot: Readonly<Record<string, JamoData>>, masters: StemMasters) {
  return JUNGSEONG_LIST.flatMap((char) => {
    const current = jungseong[char]
    const before = snapshot[char]
    if (!current || current === before) return []
    return boundStrokesOf(current, masters).filter((item) => {
      const was = before?.[item.channel]?.find((stroke) => stroke.id === item.stroke.id)
      return JSON.stringify(was) !== JSON.stringify(item.stroke)
    }).map((item) => ({ ...item, char }))
  })
}
export type ChangedStem = ReturnType<typeof changedStems>[number]

/**
 * 편집기에서 고쳤지만 반영 고르기에서 뺀 획은 고치기 전 모양으로 돌린 홀자들. 뺀 카드는 "안 바뀐다"여야 해서,
 * 편집기에서 이미 바뀐 그 획도 연 때의 모양으로 돌아가야 한다.
 */
export function revertedUnpicked(
  jungseong: Readonly<Record<string, JamoData>>,
  snapshot: Readonly<Record<string, JamoData>>,
  changed: readonly { char: string; channel: JamoChannel; stroke: { id: string } }[],
  picked: ReadonlySet<string>,
): Record<string, JamoData> {
  const reverted: Record<string, JamoData> = {}
  for (const item of changed) {
    if (picked.has(`${item.char}:${item.stroke.id}`)) continue
    const before = snapshot[item.char]?.[item.channel]?.find((stroke) => stroke.id === item.stroke.id)
    const jamo = reverted[item.char] ?? jungseong[item.char]
    if (!before || !jamo) continue
    reverted[item.char] = { ...jamo, [item.channel]: (jamo[item.channel] ?? []).map((stroke) => stroke.id === item.stroke.id ? before : stroke) }
  }
  return reverted
}

export function entriesOf(jungseong: Readonly<Record<string, JamoData>>, masters: StemMasters, base: StemBase): StemEntry[] {
  return JUNGSEONG_LIST.flatMap((char) => {
    const jamo = jungseong[char]
    if (!jamo) return []
    return boundStrokesOf(jamo, masters).filter((item) => isUnder(item.name, base)).map((item): StemEntry => ({
      char, channel: item.channel, strokeId: item.stroke.id, name: item.name, values: facetValuesOf(item.name), follows: item.follows,
      curved: item.stroke.points.some((point) => point.handleIn || point.handleOut),
    }))
  })
}

/** 반영할 모양 하나와 그 줄기의 카드들. 고친 획이 여럿이면 첫째가 마스터다(랩과 같음). */
export interface ShapeAsk {
  base: StemBase
  master: StemMaster
  entries: StemEntry[]
  editedKey: string
  changed: ChangedStem[]
}

/** 연 때(`snapshot`)와 지금을 견줘 물을 모양. 고친 이름 있는 획이 없으면 null. */
export function shapeAskOf(jungseong: Readonly<Record<string, JamoData>>, snapshot: Readonly<Record<string, JamoData>>, masters: StemMasters): ShapeAsk | null {
  const changed = changedStems(jungseong, snapshot, masters)
  const edited = changed[0]
  if (!edited) return null
  const master = masterFromStroke(jungseong[edited.char], edited.channel, edited.stroke.id)
  if (!master) return null
  const base = baseOf(master.name)
  return { base, master, entries: entriesOf(jungseong, masters, base), editedKey: `${edited.char}:${edited.stroke.id}`, changed }
}

/** 고른 카드가 하나라도 든 갈래 — 그 갈래에 모양을 적는다. */
export const pickedLeaves = (entries: readonly StemEntry[], picked: ReadonlySet<string>) => [...new Set(entries.filter((entry) => picked.has(keyOf(entry))).map((entry) => entry.name))]

/** 반영하면 될 홀자 모양(스토어에 안 쓴다). 카드 미리보기가 쓴다. */
export function shapePreview(ask: ShapeAsk, picked: ReadonlySet<string>, jungseong: Readonly<Record<string, JamoData>>, snapshot: Readonly<Record<string, JamoData>>, masters: StemMasters): Record<string, JamoData> {
  const names = pickedLeaves(ask.entries, picked)
  const after: StemMasters = { ...masters, ...Object.fromEntries(names.map((name) => [name, { ...ask.master, name }])) }
  const reverted = revertedUnpicked(jungseong, snapshot, ask.changed, picked)
  const base = { ...jungseong, ...reverted }
  return { ...reverted, ...propagatedJungseong(base, masters, after, (char, strokeId) => !picked.has(`${char}:${strokeId}`)) }
}
