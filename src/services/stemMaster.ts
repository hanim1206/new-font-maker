import medialBoxEm from '../data/medialBoxEm.json'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'
import { attachedXOf, attachmentOf, beamAttachmentOf, beamGapOf, beamReachOf, endGapOf, endIndexOf, freeXOf, reachOf, withPointX, withPointY, type BeamAttachment } from './stemAttach'
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
  /**
   * 곁줄기 · 걸침. 붙은 끝(걸침은 시작점 쪽)이 기둥 중심선에서 획 안쪽으로 떨어진 틈(글자 폭 em, 기본 획 기준 차이). 없으면 0 — 붙어 있다.
   * 짧은기둥이면 붙은 끝이 보 가운데에서 줄기 몸 쪽으로 떨어진 틈(세로 em). 음수면 보를 뚫고 나간다.
   */
  gap?: number
  /** 걸침만. 끝점 쪽 붙은 끝의 틈(글자 폭 em, 안쪽 +). 없으면 0. */
  gapEnd?: number
  /** 곁줄기 · 짧은기둥. 빈 끝이 기본 획의 빈 끝에서 옮겨진 길이 Δ(곁줄기는 가로, 짧은기둥은 세로 em, 길어짐 +). 없으면 0. */
  reach?: number
}

export type StemMasters = Partial<Record<StemMasterName, StemMaster>>

/** 곧은 마스터. 인스턴스가 프리셋 획과 같다 — 아무것도 안 그린 상태. */
export function straightMaster(name: StemMasterName): StemMaster {
  return { name, points: [{ t: 0, o: 0 }, { t: 1, o: 0 }] }
}

export function isStraight(master: StemMaster): boolean {
  return master.points.length === 2 && master.points.every((point) => point.o === 0 && !point.handleIn && !point.handleOut) && !master.gap && !master.gapEnd && !master.reach
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

/**
 * 줄기의 축 방향. 축은 끝점끼리 잇는 선이 아니라 시작점에서 줄기 방향(가로줄기 = 가로, 세로줄기 = 세로)으로 뻗는 선이다.
 * 줄기의 자리 · 길이는 보선이 정하지만 한쪽 끝만 따로 위아래로 잡는 보선은 없어서, 끝을 옮긴 기울기는 모양이다 — 끝점의 수직 오프셋을 마스터에 담는다.
 * 이름 있는 줄기는 전부 축이 있다(기본 획은 모두 정확히 수평 · 수직이라 곧은 마스터를 그대로 따른다).
 */
export type StemAxis = 'x' | 'y'
export function stemAxisOf(name: StemMasterName): StemAxis {
  return isUnder(name, 'gyeotjulgi') || isUnder(name, 'bo') || isUnder(name, 'geolchim') ? 'x' : 'y'
}

/** 축의 끝. 획의 끝점을 시작점에서 줄기 방향으로 뻗은 선 위로 내린 자리(기울기를 뺀 자리). 축이 없으면 끝점 그대로. */
function axisEndOf(start: { x: number; y: number }, end: { x: number; y: number }, axis?: StemAxis | null) {
  return axis === 'x' ? { x: end.x, y: start.y } : axis === 'y' ? { x: start.x, y: end.y } : end
}

/**
 * 마스터를 이 획의 시작점에서 줄기 방향으로 놓는다. 시작점 · 축 방향 길이는 그대로, 사이 모양과 끝점의 수직 자리(기울기)는 마스터.
 * 축은 획이 그려진 방향 그대로다 — 거울을 안 쓴다. ㅏ의 곁줄기를 ㅓ에 놓으면 같은 방향으로 옮겨 놓은 모양이 된다(빈 끝이 반대편이어도).
 */
export function instanceOf(stroke: StrokeDataV2, master: StemMaster, box: BoxEm, axis?: StemAxis | null): StrokeDataV2 {
  const start = stroke.points[0]
  const end = axisEndOf(start, stroke.points[stroke.points.length - 1], axis)
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
export function followsMaster(stroke: StrokeDataV2, master: StemMaster, box: BoxEm, axis?: StemAxis | null): boolean {
  if (stroke.points.length < 2) return false
  return matchesInstance(stroke, instanceOf(stroke, master, box, axis))
}

function matchesInstance(stroke: StrokeDataV2, expected: StrokeDataV2): boolean {
  if (expected.points.length !== stroke.points.length) return false
  const near = (a?: { x: number; y: number }, b?: { x: number; y: number }) => (!a && !b) || (!!a && !!b && Math.abs(a.x - b.x) <= FOLLOW_TOLERANCE && Math.abs(a.y - b.y) <= FOLLOW_TOLERANCE)
  return expected.points.every((point, index) => {
    const actual = stroke.points[index]
    return near(point, actual) && near(point.handleIn, actual.handleIn) && near(point.handleOut, actual.handleOut)
  })
}

/** 이 짧은기둥이 보에 붙는 꼴. 짧은기둥이 아니면 null. 솟는 짧은기둥(ㅗ 계열)은 아래 끝이, 내리는 짧은기둥(ㅜ 계열)은 위 끝이 보에 붙는다. */
function shortStemAttachmentOf(jamo: JamoData, strokes: readonly StrokeDataV2[], strokeId: string): BeamAttachment | null {
  const name = masterNameOf(jamo, strokes, strokeId)
  if (!name || !isUnder(name, 'jjalbeungidung')) return null
  return beamAttachmentOf(jamo, strokeId, facetValuesOf(name).dir === 'down' ? 'top' : 'bottom')
}

/**
 * 곁줄기 · 걸침이면 붙은 끝을 마스터의 틈만큼 기둥 시작점에서 띄우고, 빈 끝을 길이 Δ만큼 옮긴 저장 획.
 * 짧은기둥이면 붙은 끝을 틈만큼 보에서 띄우고(세로), 빈 끝을 길이 Δ만큼 옮긴다. 아니면 그대로. 인스턴스는 이 틀 위에 놓인다.
 */
function framedForMaster(jamo: JamoData, strokes: readonly StrokeDataV2[], stroke: StrokeDataV2, master: StemMaster, box: BoxEm): StrokeDataV2 {
  const beam = shortStemAttachmentOf(jamo, strokes, stroke.id)
  if (beam) {
    if (box.height <= 0) return stroke
    const joined = withPointY(stroke, endIndexOf(stroke, beam.joined), beam.baseJoinedY + ((master.gap ?? 0) / box.height) * beam.away)
    return withPointY(joined, endIndexOf(joined, beam.free), beam.baseFreeY + ((master.reach ?? 0) / box.height) * beam.away)
  }
  const attachment = attachmentOf(jamo, stroke.id)
  if (!attachment || box.width <= 0) return stroke
  let framed = stroke
  attachment.ends.forEach((end, order) => {
    const pillar = strokes.find((item) => item.id === end.pillarId)
    if (!pillar || pillar.points.length < 1) return
    const gap = (order === 0 ? master.gap : master.gapEnd) ?? 0
    framed = withPointX(framed, endIndexOf(framed, end.end), attachedXOf(pillar.points[0].x, end, gap / box.width))
  })
  const freeX = freeXOf(attachment, (master.reach ?? 0) / box.width)
  return freeX === null || !attachment.free ? framed : withPointX(framed, endIndexOf(framed, attachment.free.end), freeX)
}

/** 이 홀자 안에서 획 하나를 마스터 인스턴스로. 곁줄기는 붙은 끝의 틈까지 마스터를 따른다. */
export function instanceInJamo(jamo: JamoData, channel: JamoChannel, stroke: StrokeDataV2, master: StemMaster): StrokeDataV2 {
  const strokes = jamo[channel] ?? []
  const box = stemReferenceBox(jamo.char, channel, stroke)
  const axis = stemAxisOf(masterNameOf(jamo, strokes, stroke.id) ?? master.name)
  return instanceOf(framedForMaster(jamo, strokes, stroke, master, box), master, box, axis)
}

/** 이 홀자 안에서 획이 마스터를 따르는가(`followsMaster` + 곁줄기 틈). */
export function followsInJamo(jamo: JamoData, channel: JamoChannel, stroke: StrokeDataV2, master: StemMaster): boolean {
  if (stroke.points.length < 2) return false
  return matchesInstance(stroke, instanceInJamo(jamo, channel, stroke, master))
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
      return [{ channel, stroke, name, follows: followsInJamo(jamo, channel, stroke, masterOf(masters, name)), blocked: false }]
    })
  })
}

/**
 * 마스터 하나를 바꿨을 때 이 홀자를 다시 쓴다. 바뀐 획이 없으면 null. `기둥.안쪽` 마스터가 따로 없으면 안쪽 기둥도 기둥을 따라 같이 바뀐다.
 * `keep`이 없으면(마스터만 고침) 바뀌기 전 마스터를 따르던 획만 옮기고 풀린 획은 그대로.
 * `keep`이 있으면(반영 창에서 카드를 골랐다) 고른 획은 풀렸어도 덮는다 — 모양 복사. 뺀 획(`keep`)만 지금 모양으로 남는다.
 */
export function applyMaster(jamo: JamoData, before: StemMasters, after: StemMasters, keep?: (strokeId: string) => boolean): JamoData | null {
  let changed = false
  const next: JamoData = { ...jamo }
  for (const channel of JAMO_CHANNELS) {
    const strokes = jamo[channel]
    if (!strokes) continue
    const rewritten = strokes.map((stroke) => {
      const name = masterNameOf(jamo, strokes, stroke.id)
      if (!name || keep?.(stroke.id)) return stroke
      const previous = masterOf(before, name)
      const current = masterOf(after, name)
      if (previous === current || (!keep && !followsInJamo(jamo, channel, stroke, previous))) return stroke
      if (followsInJamo(jamo, channel, stroke, current)) return stroke
      changed = true
      return instanceInJamo(jamo, channel, stroke, current)
    })
    next[channel] = rewritten
  }
  return changed ? next : null
}

/**
 * 자모에서 고친 획 하나를 마스터로 읽는다(`instanceOf`의 역). 편집기에서 고친 모양을 형제에게 반영할 때 쓴다.
 * 시작점에서 줄기 방향으로 뻗은 축(t)과 기준 칸 em의 수직 오프셋(o)으로 잰다. 끝점의 오프셋(기울기)도 담긴다. 이름 없는 획이면 null.
 */
export function masterFromStroke(jamo: JamoData, channel: JamoChannel, strokeId: string): StemMaster | null {
  const strokes = jamo[channel]
  const stroke = strokes?.find((item) => item.id === strokeId)
  if (!strokes || !stroke || stroke.points.length < 2) return null
  const name = masterNameOf(jamo, strokes, strokeId)
  if (!name) return null
  const box = stemReferenceBox(jamo.char, channel, stroke)
  const axis = stemAxisOf(name)
  const start = stroke.points[0]
  const end = axisEndOf(start, stroke.points[stroke.points.length - 1], axis)
  const uxEm = (end.x - start.x) * box.width
  const uyEm = (end.y - start.y) * box.height
  const length = Math.hypot(uxEm, uyEm) || 1
  const toAxis = (point: { x: number; y: number }) => {
    const dxEm = (point.x - start.x) * box.width
    const dyEm = (point.y - start.y) * box.height
    return { t: (dxEm * uxEm + dyEm * uyEm) / (length * length), o: (dxEm * uyEm - dyEm * uxEm) / length }
  }
  const last = stroke.points.length - 1
  // 곁줄기 · 걸침은 붙은 끝이 기둥에서 떨어진 틈과 빈 끝의 길이 Δ도 모양이다(글자 폭 em).
  const attachment = attachmentOf(jamo, strokeId)
  // 짧은기둥은 붙은 끝이 보에서 떨어진 틈과 빈 끝의 길이 Δ가 모양이다(세로 em).
  const beam = shortStemAttachmentOf(jamo, strokes, strokeId)
  const gapOf = (order: number) => { const end = attachment?.ends[order]; const gap = end ? endGapOf(strokes, stroke, end) : null; return gap === null ? 0 : gap * box.width }
  const gapEm = beam ? beamGapOf(stroke, beam) * box.height : gapOf(0)
  const gapEndEm = gapOf(1)
  const reachEm = beam ? beamReachOf(stroke, beam) * box.height : attachment ? reachOf(stroke, attachment) * box.width : 0
  return {
    name,
    points: stroke.points.map((point, index) => ({
      // 끝점의 수직 자리(기울기)도 모양으로 담는다.
      ...(index === 0 ? { t: 0, o: 0 } : index === last ? { t: 1, o: toAxis(point).o } : toAxis(point)),
      ...(point.handleIn ? { handleIn: toAxis(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: toAxis(point.handleOut) } : {}),
    })),
    ...(Math.abs(gapEm) > 1e-9 ? { gap: gapEm } : {}),
    ...(Math.abs(gapEndEm) > 1e-9 ? { gapEnd: gapEndEm } : {}),
    ...(Math.abs(reachEm) > 1e-9 ? { reach: reachEm } : {}),
  }
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
  if (followsInJamo(jamo, channel, strokes[index], master)) return null
  const rewritten = [...strokes]
  rewritten[index] = instanceInJamo(jamo, channel, strokes[index], master)
  return { ...jamo, [channel]: rewritten }
}
