import medialBoxEm from '../data/medialBoxEm.json'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'
import { grammarOf, STEM_NAME_LABEL, type StemName } from './strokeGrammar'

/**
 * 홀자 줄기 마스터. 줄기(기둥 · 곁줄기 · 짧은기둥 · 보 · 걸침)를 한 번 그리면 같은 이름의 형제 획이 전부 그 모양을 따른다.
 * 마스터는 축 좌표로 산다 — `t`는 시작(0)에서 끝(1)까지, `o`는 축에 수직인 오프셋(글자 폭 em 기준).
 * 인스턴스는 마스터를 그 획의 시작점 · 끝점 사이에 놓은 것이다. 시작 · 끝은 지금 획의 끝점이라 자리는 기준선(레이아웃)이 주고 모양만 마스터에서 온다.
 * 오프셋을 상자가 아니라 글자 폭 기준으로 두는 이유: 섞임홀자 세로부처럼 좁은 상자에서도 ㅏ와 같은 정도로 휘어야 해서다.
 * 두께는 없다(전역). 귀속은 획 문법 이름표로 정한다 — 이름이 있는 획만 인스턴스가 된다.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

/** 마스터가 있는 줄기 이름. 덧줄기 · 꼭지는 마스터가 없다. */
export type StemBase = Exclude<StemName, 'deotjulgi' | 'kkokji'>

export const STEM_BASES: readonly StemBase[] = ['gidung', 'gyeotjulgi', 'jjalbeungidung', 'bo', 'geolchim']

/**
 * 같은 줄기라도 대조군에 따라 역할이 다르다. 역할을 질문(갈래 기준) 몇 개로 나눈다 — 반영할 때 이 질문을 차례로 물어 좁힌다.
 * 질문 순서가 곧 이름 순서다.
 */
export interface StemFacet {
  key: string
  /** 반영 질문 */
  question: string
  options: readonly { value: string; label: string }[]
}

const KIND: StemFacet = { key: 'kind', question: '어떤 홀자?', options: [{ value: 'single', label: '단일' }, { value: 'mixed', label: '섞임' }] }

export const STEM_FACETS: Readonly<Record<StemBase, readonly StemFacet[]>> = {
  gidung: [
    { key: 'side', question: '어느 기둥?', options: [{ value: 'outer', label: '바깥' }, { value: 'inner', label: '안' }] },
    KIND,
  ],
  gyeotjulgi: [
    { key: 'side', question: '어느 쪽으로 뻗나?', options: [{ value: 'right', label: '오른' }, { value: 'left', label: '왼' }] },
    { key: 'count', question: '몇 개?', options: [{ value: 'one', label: '하나' }, { value: 'upper', label: '둘 · 위' }, { value: 'lower', label: '둘 · 아래' }] },
    KIND,
  ],
  jjalbeungidung: [
    { key: 'dir', question: '보에서 어느 쪽?', options: [{ value: 'up', label: '솟음' }, { value: 'down', label: '내림' }] },
    { key: 'count', question: '몇 개?', options: [{ value: 'one', label: '하나' }, { value: 'pair', label: '둘' }] },
    KIND,
  ],
  bo: [
    { key: 'role', question: '짧은기둥은?', options: [{ value: 'up', label: '솟음 받침' }, { value: 'down', label: '내림 매닮' }, { value: 'none', label: '없음' }] },
    KIND,
  ],
  geolchim: [],
}

/**
 * 마스터 이름 = 줄기 + 질문 답을 순서대로 이은 것(`gidung.inner.mixed`). 가장 잘게 나눈 갈래(잎)가 획이 따르는 이름이고,
 * 앞쪽만 있는 이름(`gidung.inner`, `gidung`)은 부모다. 잎 마스터가 없으면 부모를 거슬러 올라가 처음 있는 것을 따른다.
 */
export type StemMasterName = string

export function baseOf(name: StemMasterName): StemBase {
  return name.split('.')[0] as StemBase
}

export function parentOf(name: StemMasterName): StemMasterName | null {
  const at = name.lastIndexOf('.')
  return at < 0 ? null : name.slice(0, at)
}

/** `name`이 `ancestor` 자신이거나 그 갈래인가. */
export function isUnder(name: StemMasterName, ancestor: StemMasterName): boolean {
  return name === ancestor || name.startsWith(`${ancestor}.`)
}

/** 이름의 질문 답. 앞쪽만 있는 이름이면 뒤 질문은 비어 있다. */
export function facetValuesOf(name: StemMasterName): Record<string, string> {
  const [base, ...values] = name.split('.')
  const facets = STEM_FACETS[base as StemBase] ?? []
  return Object.fromEntries(values.map((value, index) => [facets[index]?.key ?? String(index), value]))
}

/** 사람이 읽는 이름. `기둥 · 안 · 섞임` */
export function stemMasterLabel(name: StemMasterName): string {
  const [base, ...values] = name.split('.')
  const facets = STEM_FACETS[base as StemBase] ?? []
  const parts = values.map((value, index) => facets[index]?.options.find((option) => option.value === value)?.label ?? value)
  return [STEM_NAME_LABEL[base as StemBase] ?? base, ...parts].join(' · ')
}

/** 짧은기둥이 보에서 위로 솟는 홀자 · 아래로 내리는 홀자 · 섞임홀자(오른쪽 세로부가 있어 보가 짧다). */
const RISING = new Set(['ㅗ', 'ㅛ', 'ㅘ', 'ㅙ', 'ㅚ'])
const HANGING = new Set(['ㅜ', 'ㅠ', 'ㅝ', 'ㅞ', 'ㅟ'])
const MIXED = new Set(['ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ'])
/** 곁줄기가 기둥에서 오른쪽으로 뻗는 홀자. 나머지(ㅓ ㅕ ㅔ ㅖ ㅝ ㅞ)는 왼쪽. */
const RIGHTWARD = new Set(['ㅏ', 'ㅑ', 'ㅘ'])

export interface AxisPoint {
  /** 시작 0 → 끝 1 */
  t: number
  /** 축에 수직인 오프셋. 글자 폭 em 기준, +는 진행 방향의 오른쪽(화면 좌표 — 위→아래 기둥이면 오른쪽, 왼→오른 보면 위). */
  o: number
  handleIn?: { t: number; o: number }
  handleOut?: { t: number; o: number }
}

export interface StemMaster {
  name: StemMasterName
  /** 첫 점은 t 0, 마지막 점은 t 1. */
  points: AxisPoint[]
}

export type StemMasters = Partial<Record<StemMasterName, StemMaster>>

/** 곧은 마스터. 인스턴스가 프리셋 획과 같다 — 아무것도 안 그린 상태. */
export function straightMaster(name: StemMasterName): StemMaster {
  return { name, points: [{ t: 0, o: 0 }, { t: 1, o: 0 }] }
}

export function isStraight(master: StemMaster): boolean {
  return master.points.length === 2 && master.points.every((point) => point.o === 0 && !point.handleIn && !point.handleOut)
}

/** 이 이름의 마스터. 따로 없으면 부모를 거슬러 올라가 처음 있는 것(`기둥.안쪽` → 기둥, `보.솟음.섞임` → 보.솟음 → 보). 끝까지 없으면 곧다. */
export function masterOf(masters: StemMasters, name: StemMasterName): StemMaster {
  for (let at: StemMasterName | null = name; at; at = parentOf(at)) {
    const own = masters[at]
    if (own) return at === name ? own : { ...own, name }
  }
  return straightMaster(name)
}

export type JamoChannel = 'strokes' | 'horizontalStrokes' | 'verticalStrokes'
export const JAMO_CHANNELS: readonly JamoChannel[] = ['strokes', 'horizontalStrokes', 'verticalStrokes']

/** 홀자 채널 상자의 글자 폭 · 높이(em). 오프셋을 상자 좌표로 바꿀 때 쓴다. */
export interface BoxEm { width: number; height: number }

type BoxTable = Record<string, Partial<Record<JamoChannel, { open: BoxEm; closed: BoxEm }>>>
const BOX_TABLE = (medialBoxEm as { box: BoxTable }).box
/** 상자 한 변이 이보다 작으면 이 값으로 본다 — 줄기 하나짜리(ㅣ · ㅡ)의 상자는 두께가 0이라 나눗셈이 안 된다. */
const MIN_BOX_EM = 0.001
/**
 * 휠 방향의 상자 변이 이보다 얇으면 칸 비율로 휨을 적을 수 없다(폭 0에 가까운 칸).
 * ㅣ · ㅡ와 ㅚ ㅟ ㅢ의 세로부(폭 0.013em) · ㅢ 가로부(높이 0)가 여기 걸리고, 그 변은 `stemReferenceBox`가 빌린다.
 */
const THIN_BOX_EM = 0.05

/**
 * 칸 표의 항목. 표는 그리는 부위(통째 JU → `strokes`)로 모았다. ㅒ · ㅖ처럼 통째 칸에 그리면서 획은 `verticalStrokes`에 둔 홀자는
 * 그 채널 항목이 없으니 통째 칸(`strokes`)을 쓴다.
 */
function boxEntryOf(char: string, channel: JamoChannel) {
  const entries = BOX_TABLE[char]
  return entries?.[channel] ?? (entries && !entries.horizontalStrokes && !entries.verticalStrokes ? entries.strokes : undefined)
}

/** 이 홀자 채널이 칸 표에 있는가. 없으면 `medialBoxEmOf`가 1×1을 돌려준다. */
export function hasMedialBoxEm(char: string, channel: JamoChannel): boolean {
  return Boolean(boxEntryOf(char, channel))
}

/** 이 홀자 채널의 평균 칸. `final`을 안 주면 받침 없음 · 있음의 평균. 표에 없으면 1×1. */
export function medialBoxEmOf(char: string, channel: JamoChannel, final?: 'open' | 'closed'): BoxEm {
  const entry = boxEntryOf(char, channel)
  if (!entry) return { width: 1, height: 1 }
  const box = final ? entry[final] : { width: (entry.open.width + entry.closed.width) / 2, height: (entry.open.height + entry.closed.height) / 2 }
  return { width: Math.max(box.width, MIN_BOX_EM), height: Math.max(box.height, MIN_BOX_EM) }
}

/**
 * 이 획의 휨을 재는 기준 칸(em). 받침 없는 칸이고, 휠 방향의 변이 얇으면(ㅣ · ㅡ · ㅚ ㅟ ㅢ의 한 줄기 채널) 그 변만 빌린다 —
 * 세로 줄기는 ㅏ 칸의 폭, 가로 줄기는 ㅗ 칸의 높이. 칸 비율로 적힌 휨이 이 칸에서 em이 된다.
 */
export function stemReferenceBox(char: string, channel: JamoChannel, stroke: StrokeDataV2, final: 'open' | 'closed' = 'open'): BoxEm {
  const box = medialBoxEmOf(char, channel, final)
  if (!thinBox(stroke, box)) return box
  return isVerticalIn(stroke, box)
    ? { width: medialBoxEmOf('ㅏ', 'strokes', 'open').width, height: box.height }
    : { width: box.width, height: medialBoxEmOf('ㅗ', 'strokes', 'open').height }
}

function isVerticalIn(stroke: StrokeDataV2, box: BoxEm): boolean {
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  return Math.abs((end.y - start.y) * box.height) >= Math.abs((end.x - start.x) * box.width)
}

/** 이 획이 휠 방향(축의 수직)의 상자 변이 두께보다 얇은가. 얇으면 `stemReferenceBox`가 그 변을 빌린다. */
export function thinBox(stroke: StrokeDataV2, box: BoxEm): boolean {
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  if (!start || !end) return true
  return (isVerticalIn(stroke, box) ? box.width : box.height) < THIN_BOX_EM
}

/**
 * 이 획이 따를 마스터 이름(잎). 획 문법 이름에 질문 답을 잇는다 — 기둥은 바깥 · 안(기둥이 둘인 채널의 왼쪽) × 단일 · 섞임,
 * 곁줄기는 오른 · 왼 × 하나 · 둘의 위 · 아래 × 단일 · 섞임, 짧은기둥은 솟음 · 내림 × 하나 · 둘 × 단일 · 섞임, 보는 솟음 받침 · 내림 매닮 · 없음 × 단일 · 섞임.
 * 덧줄기 · 꼭지처럼 마스터가 없는 이름, 이름 없는 획, 자유 획은 null.
 */
export function masterNameOf(jamo: Pick<JamoData, 'type' | 'char'>, channelStrokes: readonly StrokeDataV2[], strokeId: string): StemMasterName | null {
  const table = grammarOf(jamo.type, jamo.char)
  const base = table[strokeId]
  if (!base || !(STEM_BASES as readonly string[]).includes(base)) return null
  const kind = MIXED.has(jamo.char) ? 'mixed' : 'single'
  const same = channelStrokes.filter((stroke) => table[stroke.id] === base && stroke.points.length >= 2)
  const self = same.find((stroke) => stroke.id === strokeId)
  if (base === 'gidung') {
    const leftmost = same.length > 1 ? same.reduce((a, b) => (a.points[0].x < b.points[0].x ? a : b)) : null
    return `gidung.${leftmost?.id === strokeId ? 'inner' : 'outer'}.${kind}`
  }
  if (base === 'gyeotjulgi') {
    const side = RIGHTWARD.has(jamo.char) ? 'right' : 'left'
    const middle = (stroke: StrokeDataV2) => (stroke.points[0].y + stroke.points[stroke.points.length - 1].y) / 2
    const count = same.length < 2 || !self ? 'one' : same.every((other) => other === self || middle(self) <= middle(other)) ? 'upper' : 'lower'
    return `gyeotjulgi.${side}.${count}.${kind}`
  }
  if (base === 'jjalbeungidung') {
    const dir = HANGING.has(jamo.char) ? 'down' : 'up'
    return `jjalbeungidung.${dir}.${same.length > 1 ? 'pair' : 'one'}.${kind}`
  }
  if (base === 'bo') {
    const role = RISING.has(jamo.char) ? 'up' : HANGING.has(jamo.char) ? 'down' : 'none'
    return `bo.${role}.${kind}`
  }
  return base
}

function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/**
 * 곁가지 줄기의 축은 몸에 닿는 끝 → 빈 끝이다. 짧은기둥은 보에, 곁줄기는 기둥에 닿는다.
 * 솟는 짧은기둥(위 → 아래로 그려져 끝이 보에 닿음)이나 ㅓ의 곁줄기(왼 → 오른으로 그려져 끝이 기둥에 닿음)는 획 방향과 반대라 뒤집는다.
 * 뒤집을 때 휨 방향도 같이 뒤집어(`mirroredMaster`) 솟음 · 내림, 오른 · 왼에 같은 마스터를 주면 몸을 사이에 두고 거울처럼 휜다. 다른 줄기는 획 방향 그대로.
 */
export function axisReversed(jamo: Pick<JamoData, 'type' | 'char'>, channelStrokes: readonly StrokeDataV2[], stroke: StrokeDataV2): boolean {
  const name = masterNameOf(jamo, channelStrokes, stroke.id)
  if (!name || stroke.points.length < 2) return false
  const body: StemName | null = isUnder(name, 'jjalbeungidung') ? 'bo' : isUnder(name, 'gyeotjulgi') ? 'gidung' : null
  if (!body) return false
  const table = grammarOf(jamo.type, jamo.char)
  const bars = channelStrokes.filter((item) => table[item.id] === body && item.points.length >= 2)
  if (bars.length === 0) return false
  const gap = (point: { x: number; y: number }) => Math.min(...bars.map((bar) => distanceToSegment(point, bar.points[0], bar.points[bar.points.length - 1])))
  return gap(stroke.points[stroke.points.length - 1]) < gap(stroke.points[0])
}

/** 획을 거꾸로(점 순서와 핸들 방향을 뒤집는다). 모양은 같다. */
export function reverseStroke(stroke: StrokeDataV2): StrokeDataV2 {
  return {
    ...stroke,
    points: [...stroke.points].reverse().map(({ handleIn, handleOut, ...point }) => ({
      ...point,
      ...(handleOut ? { handleIn: handleOut } : {}),
      ...(handleIn ? { handleOut: handleIn } : {}),
    })),
  }
}

/**
 * 수직 오프셋을 뒤집은 마스터. 축을 뒤집으면 `o`의 기준(진행 방향 오른쪽)도 같이 돌아가 180° 돌린 모양이 된다.
 * `o`까지 뒤집어야 몸(기둥 · 보)을 사이에 둔 거울이 된다 — ㅏ의 곁줄기 끝이 위로 휘면 ㅓ도 위로, ㅗ의 짧은기둥이 오른쪽으로 휘면 ㅜ도 오른쪽.
 */
export function mirroredMaster(master: StemMaster): StemMaster {
  const flip = (point: { t: number; o: number }) => ({ t: point.t, o: -point.o })
  return {
    ...master,
    points: master.points.map((point) => ({
      ...point,
      o: -point.o,
      ...(point.handleIn ? { handleIn: flip(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: flip(point.handleOut) } : {}),
    })),
  }
}

/** 축 방향을 따진 인스턴스 · 따름 판정. 뒤집힌 축은 거울 마스터로 놓는다. */
function orientedInstance(stroke: StrokeDataV2, master: StemMaster, box: BoxEm, reversed: boolean): StrokeDataV2 {
  return reversed ? reverseStroke(instanceOf(reverseStroke(stroke), mirroredMaster(master), box)) : instanceOf(stroke, master, box)
}
function orientedFollows(stroke: StrokeDataV2, master: StemMaster, box: BoxEm, reversed: boolean): boolean {
  return reversed ? followsMaster(reverseStroke(stroke), mirroredMaster(master), box) : followsMaster(stroke, master, box)
}

/** 마스터를 이 획의 시작점 · 끝점 사이에 놓는다. 끝점은 그대로, 사이 모양만 마스터. */
export function instanceOf(stroke: StrokeDataV2, master: StemMaster, box: BoxEm): StrokeDataV2 {
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const dx = end.x - start.x
  const dy = end.y - start.y
  // 수직 방향은 글자 좌표(em)에서 재고 상자 좌표로 돌려놓는다. 상자가 좁아도 같은 em만큼 휜다.
  const uxEm = dx * box.width
  const uyEm = dy * box.height
  const length = Math.hypot(uxEm, uyEm) || 1
  const normal = { x: (uyEm / length) / box.width, y: (-uxEm / length) / box.height }
  const at = (point: { t: number; o: number }) => ({ x: start.x + point.t * dx + point.o * normal.x, y: start.y + point.t * dy + point.o * normal.y })
  const points: AnchorPoint[] = master.points.map((point) => ({
    ...at(point),
    ...(point.handleIn ? { handleIn: at(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: at(point.handleOut) } : {}),
  }))
  return { ...stroke, points }
}

const FOLLOW_TOLERANCE = 0.002

/** 이 획이 마스터를 따르고 있는가. 인스턴스를 다시 만들어도 같으면 따르는 것이고, 다르면 자모에서 손댄(풀린) 획이다. */
export function followsMaster(stroke: StrokeDataV2, master: StemMaster, box: BoxEm): boolean {
  if (stroke.points.length < 2) return false
  const expected = instanceOf(stroke, master, box)
  if (expected.points.length !== stroke.points.length) return false
  const near = (a?: { x: number; y: number }, b?: { x: number; y: number }) => (!a && !b) || (!!a && !!b && Math.abs(a.x - b.x) <= FOLLOW_TOLERANCE && Math.abs(a.y - b.y) <= FOLLOW_TOLERANCE)
  return expected.points.every((point, index) => {
    const actual = stroke.points[index]
    return near(point, actual) && near(point.handleIn, actual.handleIn) && near(point.handleOut, actual.handleOut)
  })
}

export interface BoundStroke {
  channel: JamoChannel
  stroke: StrokeDataV2
  name: StemMasterName
  follows: boolean
  /** 예전엔 얇은 상자를 뺐다. 이제는 기준 칸이 그 변을 빌려 늘 false. */
  blocked: boolean
}

/** 이 홀자에서 마스터에 귀속된 획 전부와 따름 여부. */
export function boundStrokesOf(jamo: JamoData, masters: StemMasters): BoundStroke[] {
  return JAMO_CHANNELS.flatMap((channel) => {
    const strokes = jamo[channel] ?? []
    return strokes.flatMap((stroke) => {
      const name = masterNameOf(jamo, strokes, stroke.id)
      if (!name) return []
      const box = stemReferenceBox(jamo.char, channel, stroke)
      const reversed = axisReversed(jamo, strokes, stroke)
      return [{ channel, stroke, name, follows: orientedFollows(stroke, masterOf(masters, name), box, reversed), blocked: false }]
    })
  })
}

/**
 * 마스터 하나를 바꿨을 때 이 홀자를 다시 쓴다. 바뀌기 전 마스터를 따르던 획만 새 마스터로 옮기고, 풀린 획은 그대로.
 * 바뀐 획이 없으면 null. `기둥.안쪽` 마스터가 따로 없으면 안쪽 기둥도 기둥을 따라 같이 바뀐다.
 */
export function applyMaster(jamo: JamoData, before: StemMasters, after: StemMasters): JamoData | null {
  let changed = false
  const next: JamoData = { ...jamo }
  for (const channel of JAMO_CHANNELS) {
    const strokes = jamo[channel]
    if (!strokes) continue
    const rewritten = strokes.map((stroke) => {
      const name = masterNameOf(jamo, strokes, stroke.id)
      if (!name) return stroke
      const box = stemReferenceBox(jamo.char, channel, stroke)
      const reversed = axisReversed(jamo, strokes, stroke)
      const previous = masterOf(before, name)
      const current = masterOf(after, name)
      if (previous === current || !orientedFollows(stroke, previous, box, reversed)) return stroke
      const instance = orientedInstance(stroke, current, box, reversed)
      if (orientedFollows(stroke, current, box, reversed)) return stroke
      changed = true
      return instance
    })
    next[channel] = rewritten
  }
  return changed ? next : null
}

/** 풀린 획 하나를 다시 마스터에 붙인다. 이미 따르면 null. */
export function refollow(jamo: JamoData, masters: StemMasters, channel: JamoChannel, strokeId: string): JamoData | null {
  const strokes = jamo[channel]
  if (!strokes) return null
  const name = masterNameOf(jamo, strokes, strokeId)
  if (!name) return null
  const master = masterOf(masters, name)
  const index = strokes.findIndex((stroke) => stroke.id === strokeId)
  if (index < 0) return null
  const box = stemReferenceBox(jamo.char, channel, strokes[index])
  const reversed = axisReversed(jamo, strokes, strokes[index])
  if (orientedFollows(strokes[index], master, box, reversed)) return null
  const rewritten = [...strokes]
  rewritten[index] = orientedInstance(strokes[index], master, box, reversed)
  return { ...jamo, [channel]: rewritten }
}
