import { JUNGSEONG_LIST } from '../src/data/Hangul'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import {
  baseOf,
  boundStrokesOf,
  facetValuesOf,
  instanceOf,
  isUnder,
  JAMO_CHANNELS,
  masterFromStroke,
  masterNameOf,
  masterOf,
  stemAxisOf,
  stemReferenceBox,
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
 * 칸 = 고친 갈래 하나(같은 갈래를 여럿 고쳤으면 마지막 획이 기준), 처음엔 그 갈래만 켜지고 같은 줄기의 다른 갈래는 꺼진 채 보인다.
 * 기준 획은 뺄 수 없다. 뺀 획은 지금 모양 그대로 `풀림`.
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

/**
 * 고친 갈래 하나 = 반영 창의 칸 하나. 같은 갈래 획을 여럿 고쳤으면 마지막에 고친 획이 기준(마스터)이다.
 * `entries`는 그 갈래의 획(처음부터 켜짐), `extras`는 같은 줄기에서 아무도 안 고친 다른 갈래의 획(처음엔 꺼짐, 켜면 이 칸의 모양을 받는다).
 * 한 줄기의 다른 갈래는 그 줄기에서 마지막에 고친 칸에만 붙는다 — 켰을 때 어느 모양을 받는지 하나로 정해진다.
 */
export interface ShapeSection {
  leaf: StemMasterName
  master: StemMaster
  /** 기준 획(`홀자:획 id`). 뺄 수 없다. */
  editedKey: string
  channel: JamoChannel
  entries: StemEntry[]
  extras: StemEntry[]
}

export interface ShapeAsk {
  sections: ShapeSection[]
  changed: ChangedStem[]
}

/**
 * 연 때(`snapshot`)와 지금을 견줘 물을 모양. 고친 이름 있는 획이 없으면 null.
 * `order`는 이번 획 편집에서 고친 획 열쇠를 고친 차례대로 — 뒤에 있을수록 나중이다. 없는 획은 가장 먼저 고친 것으로 본다.
 */
export function shapeAskOf(
  jungseong: Readonly<Record<string, JamoData>>,
  snapshot: Readonly<Record<string, JamoData>>,
  masters: StemMasters,
  order: readonly string[] = [],
): ShapeAsk | null {
  // 자리만 옮긴 획(마스터로 읽으면 연 때와 같은 모양)은 모양이 아니라 그 홀자의 자리 차이 — 묻지 않는다.
  const changed = changedStems(jungseong, snapshot, masters).filter((item) => {
    const before = snapshot[item.char] ? masterFromStroke(snapshot[item.char], item.channel, item.stroke.id) : null
    const after = masterFromStroke(jungseong[item.char], item.channel, item.stroke.id)
    return !before || !after || !sameMaster(before, after)
  })
  if (changed.length === 0) return null
  const when = (item: ChangedStem) => order.lastIndexOf(`${item.char}:${item.stroke.id}`)
  // 갈래마다 마지막에 고친 획.
  const lastOfLeaf = new Map<StemMasterName, ChangedStem>()
  for (const item of changed) {
    const seen = lastOfLeaf.get(item.name)
    if (!seen || when(item) >= when(seen)) lastOfLeaf.set(item.name, item)
  }
  const sections: (ShapeSection & { at: number })[] = []
  for (const [leaf, item] of lastOfLeaf) {
    const master = masterFromStroke(jungseong[item.char], item.channel, item.stroke.id)
    if (!master) continue
    const all = entriesOf(jungseong, masters, baseOf(leaf))
    sections.push({ leaf, master: { ...master, name: leaf }, editedKey: `${item.char}:${item.stroke.id}`, channel: item.channel, entries: all.filter((entry) => entry.name === leaf), extras: [], at: when(item) })
  }
  if (sections.length === 0) return null
  // 같은 줄기의 안 고친 갈래는 그 줄기에서 마지막에 고친 칸에 붙인다.
  for (const base of new Set(sections.map((section) => baseOf(section.leaf)))) {
    const own = sections.filter((section) => baseOf(section.leaf) === base)
    const last = own.reduce((a, b) => (b.at >= a.at ? b : a))
    const edited = new Set(own.map((section) => section.leaf))
    last.extras = entriesOf(jungseong, masters, base).filter((entry) => !edited.has(entry.name))
  }
  sections.sort((a, b) => STEM_BASE_ORDER.indexOf(baseOf(a.leaf)) - STEM_BASE_ORDER.indexOf(baseOf(b.leaf)) || byLeafRank(baseOf(a.leaf))(a.leaf, b.leaf))
  return { sections: sections.map((section) => ({ leaf: section.leaf, master: section.master, editedKey: section.editedKey, channel: section.channel, entries: section.entries, extras: section.extras })), changed }
}

const STEM_BASE_ORDER = Object.keys(STEM_FACETS) as StemBase[]

/** 획 하나의 줄기 이름과 채널. 이름 없는 획이면 null. */
export function namedStemOf(jamo: JamoData, strokeId: string): { channel: JamoChannel; name: StemMasterName } | null {
  for (const channel of JAMO_CHANNELS) {
    const strokes = jamo[channel]
    if (!strokes?.some((stroke) => stroke.id === strokeId)) continue
    const name = masterNameOf(jamo, strokes, strokeId)
    return name ? { channel, name } : null
  }
  return null
}

/**
 * 이 획을 형제에 퍼뜨릴 수 있나 — 이름 있는 줄기이고, 그 모양이 지금 갈래 마스터와 다를 때(연 뒤 고쳤든, 예전에 따로 둔 풀림이든).
 * 마스터와 같은 획엔 `전파`가 안 뜬다.
 */
export function spreadableStem(jamo: JamoData, strokeId: string, masters: StemMasters): boolean {
  const stem = namedStemOf(jamo, strokeId)
  if (!stem) return false
  const shape = masterFromStroke(jamo, stem.channel, strokeId)
  return !!shape && !sameMaster(shape, masterOf(masters, stem.name))
}

/**
 * 획 하나를 기준으로 묻는다(`전파` 단추). 칸은 그 획의 갈래 하나, 같은 줄기의 다른 갈래는 `다른 ○○에도`로 꺼진 채.
 * 세션 없이 그 획의 지금 모양이 마스터라 `changed`는 비어 있다 — 같은 갈래에서 따로 고친 다른 획은 풀림 그대로 남는다.
 */
export function shapeAskForStroke(jungseong: Readonly<Record<string, JamoData>>, masters: StemMasters, char: string, strokeId: string): ShapeAsk | null {
  const jamo = jungseong[char]
  const stem = jamo ? namedStemOf(jamo, strokeId) : null
  if (!jamo || !stem) return null
  const master = masterFromStroke(jamo, stem.channel, strokeId)
  if (!master) return null
  const all = entriesOf(jungseong, masters, baseOf(stem.name))
  return {
    sections: [{ leaf: stem.name, master: { ...master, name: stem.name }, editedKey: `${char}:${strokeId}`, channel: stem.channel, entries: all.filter((entry) => entry.name === stem.name), extras: all.filter((entry) => entry.name !== stem.name) }],
    changed: [],
  }
}

/** 창 머리의 `전`: 기준 획이 지금 갈래 마스터를 따르는 모양(퍼뜨리기 전 형제가 가진 모양). */
export function beforeSpreadJamo(jungseong: Readonly<Record<string, JamoData>>, masters: StemMasters, ask: ShapeAsk): Record<string, JamoData> {
  const before: Record<string, JamoData> = {}
  for (const section of ask.sections) {
    const [char, strokeId] = section.editedKey.split(':')
    const jamo = jungseong[char]
    const strokes = jamo?.[section.channel]
    const stroke = strokes?.find((item) => item.id === strokeId)
    if (!jamo || !strokes || !stroke) continue
    const current = masterOf(masters, section.leaf)
    const instance = instanceOf(stroke, current, stemReferenceBox(char, section.channel, stroke), stemAxisOf(section.leaf))
    before[char] = { ...jamo, [section.channel]: strokes.map((item) => (item.id === strokeId ? instance : item)) }
  }
  return before
}

const SAME_MASTER_TOLERANCE = 1e-6
/** 두 마스터가 같은 모양인가(점 · 핸들의 t · o가 다 같다). */
export function sameMaster(a: StemMaster, b: StemMaster): boolean {
  if (a.points.length !== b.points.length) return false
  const near = (x?: { t: number; o: number }, y?: { t: number; o: number }) => (!x && !y) || (!!x && !!y && Math.abs(x.t - y.t) <= SAME_MASTER_TOLERANCE && Math.abs(x.o - y.o) <= SAME_MASTER_TOLERANCE)
  return a.points.every((point, index) => near(point, b.points[index]) && near(point.handleIn, b.points[index].handleIn) && near(point.handleOut, b.points[index].handleOut))
}

/** 처음 켜 둘 카드: 고친 갈래의 획 전부. 다른 갈래는 꺼 둔다. */
export const defaultPicked = (ask: ShapeAsk) => new Set(ask.sections.flatMap((section) => section.entries.map(keyOf)))

/** 뺄 수 없는 획(칸마다 기준 획). */
export const lockedKeys = (ask: ShapeAsk) => new Set(ask.sections.map((section) => section.editedKey))

/** 칸마다 고른 카드가 든 갈래에 그 칸의 모양을 적는다. */
export function pickedMasters(ask: ShapeAsk, picked: ReadonlySet<string>): StemMaster[] {
  return ask.sections.flatMap((section) => {
    const leaves = new Set([section.leaf, ...section.extras.filter((entry) => picked.has(keyOf(entry))).map((entry) => entry.name)])
    return [...leaves].map((name) => ({ ...section.master, name }))
  })
}

/**
 * 기준이 아닌데 이번에 고친 획. 켜져 있으면 고치기 전으로 돌려 기준을 따르게 하고(반영은 따르던 획만 옮긴다),
 * 꺼져 있으면(`따로`) 고친 모양 그대로 둔다.
 */
export function revertedFollowers(
  jungseong: Readonly<Record<string, JamoData>>,
  snapshot: Readonly<Record<string, JamoData>>,
  ask: ShapeAsk,
  picked: ReadonlySet<string>,
): Record<string, JamoData> {
  const locked = lockedKeys(ask)
  const reverted: Record<string, JamoData> = {}
  for (const item of ask.changed) {
    const key = `${item.char}:${item.stroke.id}`
    if (locked.has(key) || !picked.has(key)) continue
    const before = snapshot[item.char]?.[item.channel]?.find((stroke) => stroke.id === item.stroke.id)
    const jamo = reverted[item.char] ?? jungseong[item.char]
    if (!before || !jamo) continue
    reverted[item.char] = { ...jamo, [item.channel]: (jamo[item.channel] ?? []).map((stroke) => stroke.id === item.stroke.id ? before : stroke) }
  }
  return reverted
}

/** 반영하면 될 홀자 모양(스토어에 안 쓴다). 카드 미리보기가 쓴다. */
export function shapePreview(ask: ShapeAsk, picked: ReadonlySet<string>, jungseong: Readonly<Record<string, JamoData>>, snapshot: Readonly<Record<string, JamoData>>, masters: StemMasters): Record<string, JamoData> {
  const after: StemMasters = { ...masters, ...Object.fromEntries(pickedMasters(ask, picked).map((master) => [master.name, master])) }
  const reverted = revertedFollowers(jungseong, snapshot, ask, picked)
  const base = { ...jungseong, ...reverted }
  return { ...reverted, ...propagatedJungseong(base, masters, after, (char, strokeId) => !picked.has(`${char}:${strokeId}`)) }
}

/** 편집 기록 한 줄(홀자 앞뒤)에서 바뀐 획 열쇠. 고친 차례를 세는 데 쓴다. */
export function editedKeysOf(before: JamoData, after: JamoData): string[] {
  return JAMO_CHANNELS.flatMap((channel) => (after[channel] ?? []).filter((stroke) => {
    const was = before[channel]?.find((item) => item.id === stroke.id)
    return JSON.stringify(was) !== JSON.stringify(stroke)
  }).map((stroke) => `${after.char}:${stroke.id}`))
}
