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
 * 줄기 모양 전파의 계산. 획 편집에서 획을 잡고 `전파`를 누르면 그 획 하나가 기준이다 — 줄기 마스터 랩과 앱 획 편집이 같이 쓴다.
 * 카드 = 홀자 하나, 카드 안 자리(`slot`) = 같은 홀자 안에서 갈리는 줄기(기둥이면 바깥 · 안). 기본은 고친 획과 같은 자리 전부(단일 · 섞임 안 가름).
 * 뺀 획은 지금 모양 그대로 `풀림`. 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md
 */

/** 이 줄기에 귀속된 획 하나(홀자 · 채널 · 획)와 그 갈래(잎 이름 · 질문 답). */
export interface StemEntry { char: string; channel: JamoChannel; strokeId: string; name: StemMasterName; values: Record<string, string>; follows: boolean; curved: boolean }

/** 형제 카드 · 반영 창에서 그 획을 칠하는 색. */
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
 * 전파 물음 하나 = 기준 획 하나. `leaf`는 그 획의 갈래, `master`는 그 획을 읽은 모양.
 * `entries`는 같은 갈래의 획(같은 자리의 기본 켜짐은 `defaultPicked`가 자리 기준으로 다시 잰다), `extras`는 같은 줄기의 나머지 갈래 획.
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
}

const SAME_MASTER_TOLERANCE = 1e-6
/** 두 마스터가 같은 모양인가(점 · 핸들의 t · o가 다 같다). */
export function sameMaster(a: StemMaster, b: StemMaster): boolean {
  if (a.points.length !== b.points.length) return false
  const near = (x?: { t: number; o: number }, y?: { t: number; o: number }) => (!x && !y) || (!!x && !!y && Math.abs(x.t - y.t) <= SAME_MASTER_TOLERANCE && Math.abs(x.o - y.o) <= SAME_MASTER_TOLERANCE)
  return a.points.every((point, index) => near(point, b.points[index]) && near(point.handleIn, b.points[index].handleIn) && near(point.handleOut, b.points[index].handleOut))
}

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

/** 획 하나를 기준으로 묻는다(`전파` 단추). `entries`는 같은 갈래, `extras`는 같은 줄기의 다른 갈래. 이름 없는 획이면 null. */
export function shapeAskForStroke(jungseong: Readonly<Record<string, JamoData>>, masters: StemMasters, char: string, strokeId: string): ShapeAsk | null {
  const jamo = jungseong[char]
  const stem = jamo ? namedStemOf(jamo, strokeId) : null
  if (!jamo || !stem) return null
  const master = masterFromStroke(jamo, stem.channel, strokeId)
  if (!master) return null
  const all = entriesOf(jungseong, masters, baseOf(stem.name))
  return {
    sections: [{ leaf: stem.name, master: { ...master, name: stem.name }, editedKey: `${char}:${strokeId}`, channel: stem.channel, entries: all.filter((entry) => entry.name === stem.name), extras: all.filter((entry) => entry.name !== stem.name) }],
  }
}

/** 물음의 획 전부(같은 갈래 + 다른 갈래). */
export const askEntries = (ask: ShapeAsk): StemEntry[] => ask.sections.flatMap((section) => [...section.entries, ...section.extras])

/**
 * 자리 = 같은 홀자 안에서 갈리는 질문(기둥이면 `side` 바깥 · 안, 곁줄기면 `count` 하나 · 둘 위 · 둘 아래).
 * 홀자 하나에 답이 둘 이상인 질문이 있으면 그것, 없으면 null(카드마다 자리 하나).
 */
export function slotFacetOf(entries: readonly StemEntry[]): string | null {
  const byChar = new Map<string, StemEntry[]>()
  for (const entry of entries) byChar.set(entry.char, [...(byChar.get(entry.char) ?? []), entry])
  const base = entries[0] ? baseOf(entries[0].name) : null
  for (const facet of base ? STEM_FACETS[base] : []) {
    if (facet.key === 'kind') continue
    for (const own of byChar.values()) if (new Set(own.map((entry) => entry.values[facet.key])).size > 1) return facet.key
  }
  return null
}

/** 획의 자리 값. 자리 질문이 없으면 ''. */
export const slotOf = (entry: StemEntry, slotFacet: string | null) => (slotFacet ? entry.values[slotFacet] ?? '' : '')

/** 처음 켜 둘 획: 고친 획과 같은 자리 전부(단일 · 섞임을 안 가른다). 자리 질문이 없으면 이 줄기 획 전부. */
export function defaultPicked(ask: ShapeAsk): Set<string> {
  const entries = askEntries(ask)
  const facet = slotFacetOf(entries)
  const picked = new Set<string>()
  for (const section of ask.sections) {
    const edited = entries.find((entry) => keyOf(entry) === section.editedKey)
    const slot = edited ? slotOf(edited, facet) : ''
    for (const entry of entries) if (slotOf(entry, facet) === slot) picked.add(keyOf(entry))
  }
  return picked
}

/** 뺄 수 없는 획(기준 획). */
export const lockedKeys = (ask: ShapeAsk) => new Set(ask.sections.map((section) => section.editedKey))

/** 고른 획이 하나라도 든 갈래에 기준 획의 모양을 적는다. */
export function pickedMasters(ask: ShapeAsk, picked: ReadonlySet<string>): StemMaster[] {
  return ask.sections.flatMap((section) => {
    const leaves = new Set([section.leaf, ...section.extras.filter((entry) => picked.has(keyOf(entry))).map((entry) => entry.name)])
    return [...leaves].map((name) => ({ ...section.master, name }))
  })
}

/** 반영하면 될 홀자 모양(스토어에 안 쓴다). 카드 미리보기가 쓴다. */
export function shapePreview(ask: ShapeAsk, picked: ReadonlySet<string>, jungseong: Readonly<Record<string, JamoData>>, masters: StemMasters): Record<string, JamoData> {
  const after: StemMasters = { ...masters, ...Object.fromEntries(pickedMasters(ask, picked).map((master) => [master.name, master])) }
  return propagatedJungseong(jungseong, masters, after, (char, strokeId) => !picked.has(`${char}:${strokeId}`))
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
