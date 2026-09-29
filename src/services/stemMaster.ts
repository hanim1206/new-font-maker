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

export type StemMasterName = Exclude<StemName, 'deotjulgi' | 'kkokji'> | 'gidung.inner'

export const STEM_MASTER_NAMES: readonly StemMasterName[] = ['gidung', 'gidung.inner', 'gyeotjulgi', 'jjalbeungidung', 'bo', 'geolchim']

export const STEM_MASTER_LABEL: Readonly<Record<StemMasterName, string>> = {
  gidung: STEM_NAME_LABEL.gidung,
  'gidung.inner': '기둥.안쪽',
  gyeotjulgi: STEM_NAME_LABEL.gyeotjulgi,
  jjalbeungidung: STEM_NAME_LABEL.jjalbeungidung,
  bo: STEM_NAME_LABEL.bo,
  geolchim: STEM_NAME_LABEL.geolchim,
}

/** 마스터 편집 캔버스에 놓을 대표 홀자와 그 안의 마스터 획. ㅣ · ㅡ는 상자가 두께 0이라 대표로 못 쓴다(아래 `thinBox`). */
export const STEM_MASTER_SAMPLE: Readonly<Record<StemMasterName, { char: string; strokeId: string }>> = {
  gidung: { char: 'ㅏ', strokeId: 'ㅏ-1' },
  'gidung.inner': { char: 'ㅐ', strokeId: 'ㅐ-1' },
  gyeotjulgi: { char: 'ㅏ', strokeId: 'ㅏ-2' },
  jjalbeungidung: { char: 'ㅗ', strokeId: 'ㅗ-1' },
  bo: { char: 'ㅗ', strokeId: 'ㅗ-2' },
  geolchim: { char: 'ㅐ', strokeId: 'ㅐ-2' },
}

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

/** 마스터가 없거나 `기둥.안쪽`이 따로 없으면 기둥을 따른다. */
export function masterOf(masters: StemMasters, name: StemMasterName): StemMaster {
  const own = masters[name]
  if (own) return own
  if (name === 'gidung.inner' && masters.gidung) return { ...masters.gidung, name }
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
export function stemReferenceBox(char: string, channel: JamoChannel, stroke: StrokeDataV2): BoxEm {
  const open = medialBoxEmOf(char, channel, 'open')
  if (!thinBox(stroke, open)) return open
  return isVerticalIn(stroke, open)
    ? { width: medialBoxEmOf('ㅏ', 'strokes', 'open').width, height: open.height }
    : { width: open.width, height: medialBoxEmOf('ㅗ', 'strokes', 'open').height }
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
 * 이 획이 따를 마스터 이름. 획 문법 이름 그대로이고, ㅐ ㅔ ㅒ ㅖ처럼 기둥이 둘인 채널의 왼쪽 기둥은 `기둥.안쪽`.
 * 덧줄기 · 꼭지처럼 마스터가 없는 이름, 이름 없는 획, 자유 획은 null.
 */
export function masterNameOf(jamo: Pick<JamoData, 'type' | 'char'>, channelStrokes: readonly StrokeDataV2[], strokeId: string): StemMasterName | null {
  const table = grammarOf(jamo.type, jamo.char)
  const name = table[strokeId]
  if (!name || !(STEM_MASTER_NAMES as readonly string[]).includes(name)) return null
  if (name === 'gidung') {
    const pillars = channelStrokes.filter((stroke) => table[stroke.id] === 'gidung')
    if (pillars.length > 1) {
      const leftmost = pillars.reduce((a, b) => (a.points[0].x < b.points[0].x ? a : b))
      if (leftmost.id === strokeId) return 'gidung.inner'
    }
  }
  return name as StemMasterName
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
      return [{ channel, stroke, name, follows: followsMaster(stroke, masterOf(masters, name), box), blocked: false }]
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
      const previous = masterOf(before, name)
      const current = masterOf(after, name)
      if (previous === current || !followsMaster(stroke, previous, box)) return stroke
      const instance = instanceOf(stroke, current, box)
      if (followsMaster(stroke, current, box)) return stroke
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
  if (followsMaster(strokes[index], master, box)) return null
  const rewritten = [...strokes]
  rewritten[index] = instanceOf(strokes[index], master, box)
  return { ...jamo, [channel]: rewritten }
}
