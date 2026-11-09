import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../data/Hangul'
import { KSX1001_SYLLABLES } from '../data/ksx1001Syllables'
import type { BoxConfig, JamoData, Part } from '../types'
import { composeChar, decomposeChar } from './handwritingRead'
import type { JamoSample, Rect, Slot, SyllableRead } from './handwritingRead'

/**
 * 손글씨 수집 은행(플랜 2026-11-09 손글씨 수집 실험실).
 *
 * 읽은 글자(`SyllableRead`)에서 두 가지를 모은다 — 배치 6종(홀자 자리 × 받침 유무)의 평균 상자와, 자모마다의 견본.
 * 첫닿자 견본은 6자리 꼴(V · Vb · H · Hb · M · Mb)로, 받침 견본은 J로 따로 둔다. 확인 카드에서 ㅇㅋ한 것만 `applyChoices`로 들어온다.
 * 글자표는 `planSyllable`이 은행만 보고 그릴 수 있나(다 참 · 반쯤 참 · 빔)를 정하고, `placeSyllable`이 렌더러가 읽는 `BoxConfig`와 자모 지도로 바꾼다.
 */

export type VowelClass = 'V' | 'H' | 'M'
export type SampleType = 'V' | 'Vb' | 'H' | 'Hb' | 'M' | 'Mb' | 'J'
export type LayoutKey = '세로홀자' | '세로홀자 + 받침' | '가로홀자' | '가로홀자 + 받침' | '섞임홀자' | '섞임홀자 + 받침'

export const LAYOUT_KEYS: readonly LayoutKey[] = ['세로홀자', '세로홀자 + 받침', '가로홀자', '가로홀자 + 받침', '섞임홀자', '섞임홀자 + 받침']
export const FIRST_TYPES: readonly SampleType[] = ['V', 'Vb', 'H', 'Hb', 'M', 'Mb']
export const TYPE_NAME: Record<SampleType, string> = {
  V: '세로홀자', Vb: '세로홀자 + 받침', H: '가로홀자', Hb: '가로홀자 + 받침', M: '섞임홀자', Mb: '섞임홀자 + 받침', J: '받침',
}
/** 아홉 자에 여섯 배치가 다 들어 있다. */
export const SEED_SENTENCE = '고향 과일 가게 왼쪽 문'

export const vowelClassOf = (v: string): VowelClass => 'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'.includes(v) ? 'V' : 'ㅗㅛㅜㅠㅡ'.includes(v) ? 'H' : 'M'
export const layoutKeyOf = (v: string, hasFinal: boolean): LayoutKey => `${TYPE_NAME[vowelClassOf(v)]}${hasFinal ? ' + 받침' : ''}` as LayoutKey
export const typeOf = (slot: Slot, v: string, hasFinal: boolean): SampleType => slot === 2 ? 'J' : `${vowelClassOf(v)}${hasFinal ? 'b' : ''}` as SampleType
/** 자모 L을 그 자리 꼴로 보여 줄 본보기 글자(변주 줄). 받침은 ㅇ+ㅏ 아래에. */
export function exampleOf(L: string, type: SampleType): string | null {
  if (type === 'J') return (JONGSEONG_LIST as readonly string[]).includes(L) ? composeChar('ㅇ', 'ㅏ', L) : null
  if (!(CHOSEONG_LIST as readonly string[]).includes(L)) return null
  const vowel = { V: 'ㅏ', Vb: 'ㅏ', H: 'ㅗ', Hb: 'ㅗ', M: 'ㅘ', Mb: 'ㅘ' }[type]
  return composeChar(L, vowel, type.endsWith('b') ? 'ㅁ' : null)
}

export interface Frame { x0: number; y0: number; w: number; h: number }
export interface LayoutEntry {
  /** 글자 잉크 상자를 1로 놓은 부품 상자. 섞임홀자는 JU 대신 JU_H · JU_V. */
  boxes: Partial<Record<Part, Rect>>
  /** 칸 안에서 잉크가 차지한 자리. 글자표가 글씨 크기를 따라가게 한다. */
  frame: Frame
  n: number
  from: string[]
}
export interface TypedSample extends JamoSample { type: SampleType; key: LayoutKey }
export interface JamoEntry {
  rep: TypedSample
  by: Partial<Record<SampleType, TypedSample>>
  versions: TypedSample[]
}
export interface Bank {
  lay: Partial<Record<LayoutKey, LayoutEntry>>
  jamo: Record<string, JamoEntry>
  /** 반영한 글자(문장 순). */
  history: string[]
}
export const emptyBank = (): Bank => ({ lay: {}, jamo: {}, history: [] })

const PARTS: readonly Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
const meanRect = (rects: Rect[]): Rect => ({
  x0: rects.reduce((a, r) => a + r.x0, 0) / rects.length, y0: rects.reduce((a, r) => a + r.y0, 0) / rects.length,
  x1: rects.reduce((a, r) => a + r.x1, 0) / rects.length, y1: rects.reduce((a, r) => a + r.y1, 0) / rects.length,
})
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x0: a.x0 + (b.x0 - a.x0) * t, y0: a.y0 + (b.y0 - a.y0) * t, x1: a.x1 + (b.x1 - a.x1) * t, y1: a.y1 + (b.y1 - a.y1) * t })

/** 같은 배치의 글자 여럿을 평균 낸다. 부품마다 상자, 그리고 칸 안 잉크 자리. */
export function averageLayout(reads: SyllableRead[]): LayoutEntry {
  const boxes: Partial<Record<Part, Rect>> = {}
  for (const part of PARTS) {
    const rects = reads.map((r) => r.boxes[part]).filter((r): r is Rect => !!r)
    if (rects.length) boxes[part] = meanRect(rects)
  }
  const m = (f: (fr: Frame) => number) => reads.reduce((a, r) => a + f(r.frame), 0) / reads.length
  return { boxes, frame: { x0: m((f) => f.x0), y0: m((f) => f.y0), w: m((f) => f.w), h: m((f) => f.h) }, n: reads.length, from: reads.map((r) => r.char) }
}

/** 이미 있는 배치에 새 글씨의 배치를 글자 수 비율로 섞는다. */
export function blendLayout(a: LayoutEntry, b: LayoutEntry): LayoutEntry {
  const t = b.n / (a.n + b.n)
  const boxes: Partial<Record<Part, Rect>> = {}
  for (const part of PARTS) {
    const ra = a.boxes[part], rb = b.boxes[part]
    if (ra && rb) boxes[part] = lerpRect(ra, rb, t)
    else if (ra || rb) boxes[part] = ra ?? rb
  }
  const f = (k: keyof Frame) => a.frame[k] + (b.frame[k] - a.frame[k]) * t
  return { boxes, frame: { x0: f('x0'), y0: f('y0'), w: f('w'), h: f('h') }, n: a.n + b.n, from: [...a.from, ...b.from] }
}

/** 1단계는 배치 6종을 모으는 중, 2단계는 자모 모으기. */
export const phaseOf = (bank: Bank): 1 | 2 => LAYOUT_KEYS.every((k) => bank.lay[k]) ? 2 : 1

export interface Gathered {
  reads: SyllableRead[]
  lay: Partial<Record<LayoutKey, SyllableRead[]>>
  jamo: Record<string, TypedSample[]>
  /** 못 읽은 칸의 글자. */
  bad: string[]
}

const isGood = (r: SyllableRead) => r.state === 'ok' && r.parts.every((p) => p.sample)

/** 지금 칸에 쓴 것 가운데 읽힌 것을 배치별 · 자모별로 묶는다. */
export function gather(reads: (SyllableRead | null | undefined)[]): Gathered {
  const good = reads.filter((r): r is SyllableRead => !!r && isGood(r))
  const bad = reads.filter((r): r is SyllableRead => !!r && !isGood(r)).map((r) => r.char)
  const lay: Partial<Record<LayoutKey, SyllableRead[]>> = {}
  const jamo: Record<string, TypedSample[]> = {}
  for (const r of good) {
    const v = r.jamo[1], hasFinal = r.jamo.length === 3
    const key = layoutKeyOf(v, hasFinal)
    ;(lay[key] ??= []).push(r)
    for (const p of r.parts) {
      if (!p.sample) continue
      ;(jamo[p.char] ??= []).push({ ...p.sample, type: typeOf(p.slot, v, hasFinal), key })
    }
  }
  return { reads: good, lay, jamo, bad }
}

export type JamoChoice =
  | { kind: 'new' } | { kind: 'skip' } | { kind: 'keep' } | { kind: 'swap' }
  /** 이 자리 꼴만 넣기(변주 줄의 "이 자리 다시 쓰기"로 받은 것). */
  | { kind: 'slot'; type: SampleType }
export interface CardChoices {
  jamo: Record<string, JamoChoice>
  layout: 'keep' | 'mix'
  /** 배치마다 섞을지. 있으면 `layout`보다 앞선다. */
  mix?: Partial<Record<LayoutKey, boolean>>
}

const isFirstConsonant = (L: string, sample: TypedSample) => (CHOSEONG_LIST as readonly string[]).includes(L) && sample.slot !== 1

/** 이 자모가 은행에서 그 자리(첫닿자 · 홀자 · 받침) 꼴을 이미 갖고 있나. 같은 ㄱ이라도 첫닿자와 받침은 따로 센다. */
export function hasSlot(entry: JamoEntry | undefined, slot: Slot): boolean {
  if (!entry) return false
  if (slot === 0) return FIRST_TYPES.some((t) => entry.by[t]) || entry.rep.slot === 0
  if (slot === 2) return !!entry.by.J || entry.rep.slot === 2
  return entry.rep.slot === 1
}

/**
 * 확인 카드의 선택대로 은행에 넣는다. 원본은 두고 새 은행을 돌려준다.
 * 자리(첫닿자 · 홀자 · 받침)마다 따로 본다 — 은행에 없던 자리는 skip이 아니면 넣고, 있던 자리는 swap · slot일 때만 바꾼다.
 * 배치는 `mix[key]`가 있으면 그대로, 없으면 1단계는 섞고 2단계는 `layout`을 따른다.
 */
export function applyChoices(bank: Bank, gathered: Gathered, choices: CardChoices): Bank {
  const next: Bank = { lay: { ...bank.lay }, jamo: { ...bank.jamo }, history: [...bank.history, ...gathered.reads.map((r) => r.char)] }
  const phase = phaseOf(bank)
  for (const key of LAYOUT_KEYS) {
    const reads = gathered.lay[key]
    if (!reads?.length) continue
    const fresh = averageLayout(reads)
    const had = next.lay[key]
    const mix = choices.mix?.[key] ?? (phase === 1 || choices.layout === 'mix')
    next.lay[key] = !had ? fresh : mix ? blendLayout(had, fresh) : had
  }
  for (const L of Object.keys(gathered.jamo)) {
    const samples = gathered.jamo[L]
    const had = next.jamo[L]
    const choice: JamoChoice = choices.jamo[L] ?? (had ? { kind: 'keep' } : { kind: 'new' })
    // 없던 자모를 두기로 하면 넣지 않는다(예전 동작)
    if (choice.kind === 'skip' || (!had && choice.kind === 'keep')) continue
    let entry: JamoEntry | null = had ? { rep: had.rep, by: { ...had.by }, versions: [...had.versions, ...samples] } : null
    for (const slot of [0, 1, 2] as Slot[]) {
      const inSlot = samples.filter((s) => s.slot === slot)
      if (!inSlot.length) continue
      const sample = choice.kind === 'slot' && slot === 0 ? (inSlot.filter((s) => s.type === choice.type).pop() ?? inSlot[inSlot.length - 1]) : inSlot[inSlot.length - 1]
      if (!entry) { entry = { rep: sample, by: { [sample.type]: sample }, versions: [...samples] }; continue }
      if (!hasSlot(entry, slot)) {
        // 은행에 없던 자리: 그대로 채운다(첫닿자 꼴만 있던 ㄱ에 받침 ㄱ이 들어오는 경우)
        entry.by[sample.type] = sample
        continue
      }
      if (choice.kind === 'slot' && slot === 0) entry.by[sample.type] = sample
      else if (choice.kind === 'swap') {
        if (isFirstConsonant(L, sample)) {
          entry.by[sample.type] = sample
          if (entry.rep.type === sample.type || (slot === 2 && entry.rep.slot === 2)) entry.rep = sample
        } else entry.rep = sample
      }
    }
    if (entry) next.jamo[L] = entry
  }
  return next
}

// ----- 글자 하나를 은행으로 그릴 계획 -----

export interface PlannedPart { char: string; slot: Slot; sample: TypedSample | null }
export interface SyllablePlan {
  char: string
  jamo: [string, string, string | null]
  key: LayoutKey
  layout: LayoutEntry | null
  parts: PlannedPart[]
  missing: string[]
  /** 배치가 있고 자모가 다 있다. */
  ok: boolean
  /** 배치는 있는데 자모가 일부 빈다. */
  partial: boolean
}

/** 자모 L을 이 자리에 놓을 때 쓸 견본. 첫닿자는 6자리 꼴을 먼저 찾고, 받침은 J를 먼저 찾는다. */
export function sampleFor(entry: JamoEntry | undefined, slot: Slot, type: SampleType): TypedSample | null {
  if (!entry) return null
  if (slot === 0) return entry.by[type] ?? entry.by[type[0] as SampleType] ?? entry.rep
  if (slot === 2) return entry.by.J ?? entry.rep
  return entry.rep
}

export function planSyllable(bank: Bank, char: string, override?: Record<string, TypedSample>): SyllablePlan | null {
  const jamo = decomposeChar(char)
  if (!jamo) return null
  const [cho, jung, jong] = jamo
  const hasFinal = jong !== null
  const key = layoutKeyOf(jung, hasFinal)
  const want: [string, Slot][] = hasFinal ? [[cho, 0], [jung, 1], [jong, 2]] : [[cho, 0], [jung, 1]]
  const parts: PlannedPart[] = want.map(([L, slot]) => ({ char: L, slot, sample: override?.[L] ?? sampleFor(bank.jamo[L], slot, typeOf(slot, jung, hasFinal)) }))
  const missing = parts.filter((p) => !p.sample).map((p) => p.char)
  const layout = bank.lay[key] ?? null
  return { char, jamo, key, layout, parts, missing, ok: !!layout && missing.length === 0, partial: !!layout && missing.length > 0 && missing.length < parts.length }
}

/** 홀자별로 상자를 줄일 때 어느 쪽에 붙일지. 왼가지 홀자는 왼쪽, 오른가지는 오른쪽, ㅗ는 아래, ㅜ는 위. */
const ANCHOR: Record<string, 'l' | 'r' | 't' | 'b'> = { 'ㅏ': 'l', 'ㅑ': 'l', 'ㅐ': 'l', 'ㅒ': 'l', 'ㅣ': 'l', 'ㅓ': 'r', 'ㅕ': 'r', 'ㅔ': 'r', 'ㅖ': 'r', 'ㅗ': 'b', 'ㅛ': 'b', 'ㅜ': 't', 'ㅠ': 't' }
const ASPECT_CAP = 1.6
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** 배치 상자(잉크 기준) → 칸 기준 BoxConfig. 견본 비율에서 1.6배 넘게 찌그러지면 줄인다. */
export function fitBox(rect: Rect, frame: Frame, asp: number | null, anchor: 'l' | 'r' | 't' | 'b' | 'c'): BoxConfig {
  const box = { x: frame.x0 + clamp01(rect.x0) * frame.w, y: frame.y0 + clamp01(rect.y0) * frame.h, width: Math.max(1e-3, (clamp01(rect.x1) - clamp01(rect.x0)) * frame.w), height: Math.max(1e-3, (clamp01(rect.y1) - clamp01(rect.y0)) * frame.h) }
  if (asp === null) return box
  const sA = Math.min(4, Math.max(0.25, asp)), ar = box.width / box.height
  if (ar > sA * ASPECT_CAP) {
    const nw = box.height * sA * ASPECT_CAP
    box.x += anchor === 'l' ? 0 : anchor === 'r' ? box.width - nw : (box.width - nw) / 2
    box.width = nw
  } else if (ar < sA / ASPECT_CAP) {
    const nh = box.width / (sA / ASPECT_CAP)
    box.y += anchor === 't' ? 0 : anchor === 'b' ? box.height - nh : (box.height - nh) / 2
    box.height = nh
  }
  return box
}

export interface PlacedSyllable {
  plan: SyllablePlan
  boxes: Partial<Record<Part, BoxConfig>>
  /** 견본이 없는 자리의 상자(점선으로 보여 줄 때). */
  missingBoxes: Partial<Record<Part, BoxConfig>>
  choseongMap: Record<string, JamoData>
  jungseongMap: Record<string, JamoData>
  jongseongMap: Record<string, JamoData>
}

const jamoDataOf = (sample: TypedSample | null, L: string, type: JamoData['type']): JamoData => {
  if (!sample) return { char: L, type, strokes: [] }
  if (sample.horizontalStrokes || sample.verticalStrokes) return { char: L, type, horizontalStrokes: sample.horizontalStrokes ?? [], verticalStrokes: sample.verticalStrokes ?? [] }
  return { char: L, type, strokes: sample.strokes }
}

/** 렌더러(`SvgRenderer`)에 줄 상자와 자모 지도. 배치가 없으면 null. 견본이 비는 자리는 빈 자모로 둬 배치 종류는 그대로 간다. */
export function placeSyllable(bank: Bank, char: string, override?: Record<string, TypedSample>): PlacedSyllable | null {
  const plan = planSyllable(bank, char, override)
  if (!plan?.layout) return null
  const { layout } = plan
  const boxes: Partial<Record<Part, BoxConfig>> = {}
  const missingBoxes: Partial<Record<Part, BoxConfig>> = {}
  const maps = { choseongMap: {} as Record<string, JamoData>, jungseongMap: {} as Record<string, JamoData>, jongseongMap: {} as Record<string, JamoData> }
  for (const p of plan.parts) {
    const partsOf: Part[] = p.slot === 0 ? ['CH'] : p.slot === 2 ? ['JO'] : layout.boxes.JU ? ['JU'] : ['JU_H', 'JU_V']
    for (const part of partsOf) {
      const rect = layout.boxes[part]
      if (!rect) continue
      const anchor = p.slot === 1 ? ANCHOR[p.char] ?? 'c' : 'c'
      const box = fitBox(rect, layout.frame, p.sample && part !== 'JU_H' && part !== 'JU_V' ? p.sample.asp : null, anchor)
      boxes[part] = box
      if (!p.sample) missingBoxes[part] = box
    }
    const type: JamoData['type'] = p.slot === 0 ? 'choseong' : p.slot === 1 ? 'jungseong' : 'jongseong'
    const map = p.slot === 0 ? maps.choseongMap : p.slot === 1 ? maps.jungseongMap : maps.jongseongMap
    map[p.char] = jamoDataOf(p.sample, p.char, type)
  }
  return { plan, boxes, missingBoxes, ...maps }
}

// ----- 글자표 통계와 진행 -----

export const CHART_SYLLABLES: readonly string[] = [...KSX1001_SYLLABLES]
export interface ChartStats { ok: number; partial: number; okSet: Set<string> }

export function chartStats(bank: Bank): ChartStats {
  let ok = 0, partial = 0
  const okSet = new Set<string>()
  for (const ch of CHART_SYLLABLES) {
    const plan = planSyllable(bank, ch)
    if (plan?.ok) { ok++; okSet.add(ch) } else if (plan?.partial) partial++
  }
  return { ok, partial, okSet }
}

export const ALL_JAMO: readonly string[] = [...new Set([...CHOSEONG_LIST, ...JUNGSEONG_LIST, ...JONGSEONG_LIST.filter(Boolean)])]
export function progressOf(bank: Bank) {
  const has = (list: readonly string[]) => list.filter((L) => L && bank.jamo[L]).length
  return { layouts: LAYOUT_KEYS.filter((k) => bank.lay[k]).length, choseong: has(CHOSEONG_LIST), jungseong: has(JUNGSEONG_LIST), jongseong: has(JONGSEONG_LIST) }
}

// ----- 문장 고르기 -----

const lettersOf = (text: string) => [...text.replace(/\s+/g, '')]

/** 이 문장을 쓰면 새로 모이는 자모 수. */
export function jamoGain(bank: Bank, text: string): number {
  const seen = new Set<string>()
  for (const ch of lettersOf(text)) {
    const d = decomposeChar(ch)
    if (!d) continue
    for (const L of d) if (L && !bank.jamo[L]) seen.add(L)
  }
  return seen.size
}
/** 이 문장을 쓰면 새로 모이는 배치 수. */
export function layoutGain(bank: Bank, text: string): number {
  const keys = new Set<LayoutKey>()
  for (const ch of lettersOf(text)) {
    const d = decomposeChar(ch)
    if (!d) continue
    const key = layoutKeyOf(d[1], d[2] !== null)
    if (!bank.lay[key]) keys.add(key)
  }
  return keys.size
}
/** 문장에서 아직 없는 자모. */
export function newJamoIn(bank: Bank, text: string): string[] {
  const out: string[] = []
  for (const ch of lettersOf(text)) for (const L of decomposeChar(ch) ?? []) if (L && !bank.jamo[L] && !out.includes(L)) out.push(L)
  return out
}

export interface Recommendation {
  text: string
  /** 이 문장을 다 쓰고 반영하면 글자표에 새로 다 차는 글자 수. */
  fills: number
  /** 새로 반쯤 차게 되는 글자 수(배치는 있고 자모 일부만 생김). */
  halfFills: number
  /** 새로 모이는 자모. */
  newJamo: string[]
  /** 1단계에서 새로 잡히는 배치 수. */
  layouts: number
}

/**
 * 문장마다 "쓰면 글자표가 몇 자 차나"를 센다. 2,350자마다 지금 은행에서 모자란 자모만 미리 적어 두고,
 * 문장이 주는 새 자모가 그 모자람을 다 덮으면 다 참, 일부만 덮으면 반쯤 참으로 센다. 배치가 없는 글자는 안 센다(배치는 1단계가 잡는다).
 */
export function recommendSentences(bank: Bank, current: string, count = 3, pool: readonly string[] = SENTENCE_POOL): Recommendation[] {
  const cur = current.replace(/\s+/g, '')
  const phase = phaseOf(bank)
  // 글자마다 모자란 자모(배치 있는 글자만)
  const missing: { all: string[]; had: boolean }[] = []
  for (const ch of CHART_SYLLABLES) {
    const plan = planSyllable(bank, ch)
    if (!plan?.layout || plan.ok) continue
    missing.push({ all: plan.missing, had: plan.partial })
  }
  const out: Recommendation[] = []
  for (const t of pool) {
    if (t.replace(/\s+/g, '') === cur) continue
    const newJamo = newJamoIn(bank, t)
    const layouts = layoutGain(bank, t)
    if (newJamo.length === 0 && layouts === 0) continue
    const give = new Set(newJamo)
    let fills = 0, halfFills = 0
    for (const m of missing) {
      const covered = m.all.filter((L) => give.has(L)).length
      if (covered === m.all.length) fills++
      else if (covered > 0 && !m.had) halfFills++
    }
    out.push({ text: t, fills, halfFills, newJamo, layouts })
  }
  const n = (r: Recommendation) => lettersOf(r.text).length
  out.sort((a, b) => phase === 1
    ? b.layouts - a.layouts || b.fills - a.fills || n(a) - n(b)
    : b.fills - a.fills || b.halfFills - a.halfFills || b.newJamo.length - a.newJamo.length || n(a) - n(b))
  if (phase === 1 && layoutGain(bank, SEED_SENTENCE) && SEED_SENTENCE.replace(/\s+/g, '') !== cur) {
    const i = out.findIndex((r) => r.text === SEED_SENTENCE)
    if (i > 0) out.unshift(...out.splice(i, 1))
  }
  return out.slice(0, count)
}

/** 주사위. 추천 1순위 — 1단계는 배치를 많이 잡는 문장(씨앗 먼저), 2단계는 글자표가 가장 많이 차는 문장. 지금 문장은 피한다. */
export function pickSentence(bank: Bank, current: string, pool: readonly string[] = SENTENCE_POOL): string | null {
  return recommendSentences(bank, current, 1, pool)[0]?.text ?? null
}

/** 이 자모들을 담은 문장 가운데 가장 많이 담고 짧은 것(글자표 칸을 눌렀을 때). */
export function sentenceFor(need: readonly string[], pool: readonly string[] = SENTENCE_POOL): string | null {
  let best: { t: string; g: number; n: number } | null = null
  for (const t of pool) {
    const has = new Set(lettersOf(t).flatMap((ch) => decomposeChar(ch) ?? []).filter((L): L is string => !!L))
    const g = need.filter((L) => has.has(L)).length
    if (!g) continue
    const n = lettersOf(t).length
    if (!best || g > best.g || (g === best.g && n < best.n)) best = { t, g, n }
  }
  return best?.t ?? null
}

/** 주사위가 고르는 문장 풀. 자주 쓰는 말로, 2,350자를 채우는 데 드문 자모(ㄺ ㄼ ㅀ ㅄ ㅙ ㅞ 등)까지 들어 있다. */
export const SENTENCE_POOL: readonly string[] = [
  SEED_SENTENCE, '다람쥐 헌 쳇바퀴에 타고파', '봄바람이 불어요', '햇살 좋은 오후', '꽃잎이 떨어진다', '밤하늘의 별빛', '따뜻한 커피 한 잔', '우리 같이 걸을까', '노을 지는 바닷가',
  '작은 새가 노래해', '눈 내리는 겨울밤', '푸른 숲속 오솔길', '괜찮아 잘하고 있어', '비 온 뒤 무지개', '뭐 먹을지 고민돼', '꿈꾸는 소년과 소녀', '흰 구름 위의 고래',
  '여름 수박 한 통', '퀴즈 왕 됐어요', '엄마 손 칼국수', '짧은 편지를 써요', '늦은 밤 라디오', '똑똑 누구세요', '쉬는 날엔 낮잠', '의자에 앉은 고양이',
  '읽고 싶은 책 한 권', '닭갈비 먹으러 가자', '샘물처럼 맑은 웃음', '웬 떡이야', '훨훨 날아가렴', '뛰어놀던 운동장', '싫어도 해야 해', '값진 하루였어',
  '흙냄새 나는 정원', '고마운 날', '얘가 왜 웃지', '옛날 옛적 호랑이', '몫을 나눠 갖자', '넋 놓고 앉았다', '많이 끓인 국', '삶은 달걀 두 알',
  '젊은 날의 꿈', '넓은 들판을 밟고', '외곬으로 걷는 길', '접시를 핥는 강아지', '훑어보고 읊조리다', '잃어버린 열쇠', '없는 게 없네', '부엌 창밖 저녁녘',
  '밭에 심은 콩', '끝까지 해 보자', '앞마당 감나무 잎', '빛나는 꽃밭', '낮말은 새가 듣고', '밖에서 닦은 신발', '쌀 씻는 소리', '짜장면 곱빼기',
  '빵 굽는 냄새', '뒷산 윗집 할머니', '스웨터 입은 곰', '얜 누구야', '걘 좀 늦는대', '궤짝 속 귤 하나', '쇳물이 흐르네', '왼손으로 쓴 글씨',
  '황금빛 관을 쓴 왕', '용감한 욕심쟁이', '율무차 한 잔', '약국 옆 양말 가게', '원숭이가 웬일로', '된장찌개 끓였어', '펭귄이 뒤뚱뒤뚱', '캥거루가 깡충 뛰네',
  '쪽지를 쥐여 줬다', '뭘 찾고 있니', '꿩 먹고 알 먹고', '쾌청한 가을 하늘', '최고의 하루야', '퇴근길 노을', '휴지 좀 줄래', '교실 창가 자리',
  '결혼식 축가', '계단을 뛰어 올라', '예쁜 혜성이 떴다', '폐교된 학교', '돼지 저금통', '괴물이 나타났다', '쥐구멍에 볕 들 날', '틈틈이 책을 읽자',
  '튼튼한 다리', '켜켜이 쌓인 눈', '흩날리는 벚꽃', '뚫린 구멍 메우기', '얇은 종이 한 장', '옳고 그름', '붉은 노을 아래', '굵은 빗방울',
  '늙은 소나무', '맑은 샘물', '얕은 시냇물', '찜질방 식혜', '쫄깃한 떡볶이', '씩씩한 꼬마', '삐약삐약 병아리', '뻐꾸기 시계',
  '쯧쯧 혀를 찬다', '깻잎 한 묶음', '뜯어 먹는 빵', '덮밥 곱빼기', '엎질러진 물', '늪에 빠진 오리', '갚을 빚이 있다', '놓친 버스',
  '낳은 알 세 개', '쌓인 먼지 털기', '닿을 듯 말 듯', '빚진 마음', '짖는 개', '젖은 운동화', '쫓고 쫓기는', '얹혀 사는 고양이',
  '끊어진 다리', '귀찮은 숙제', '뭉게구름 둥실', '휘파람 부는 아이', '쉰 김치 볶음밥', '뒹굴뒹굴 주말', '웃음꽃 핀 얼굴', '쾅쾅 문 두드림',
  '와르르 무너졌다', '솨솨 바람 소리', '꽹과리 치는 날', '왱왱 모기 소리',
]
