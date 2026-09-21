import grammar from '../data/strokeGrammar.json'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'

/**
 * 획 문법. 낱자마다 `기본 줄기`(프리셋 획 id)와 그 줄기 이름을 적어 둔 표가 `src/data/strokeGrammar.json`이고,
 * 여기서는 지금 획을 그 표에 비춰 이름 · 모양 · 꺾임 · 머리와 맺음을 돌려준다.
 *
 * - 이름은 획 id에 붙는다. 마디(꺾임과 꺾임 사이)에는 이름이 없고 모양만 계산한다. 이름 없는 기본 줄기도 있다(`ㄱ-1`).
 * - 획 id가 표에 있으면 `귀속 획`, 없으면 `자유 획`. 귀속이 이긴다 — 기둥을 눕혀도 이름은 기둥이고 모양만 바뀐다.
 * - 계산값은 저장하지 않는다. 좌표는 낱자 상자 기준 0–1이라 각도는 상자 안에서의 각이다.
 *
 * 말과 식별자는 『타이포그래피 사전』(typography-dictionary.kr)의 표제어와 주소를 따른다.
 */

export type StemName = 'gidung' | 'bo' | 'gyeotjulgi' | 'jjalbeungidung' | 'geolchim' | 'deotjulgi' | 'kkokji'
export type StemShape = 'garojulgi' | 'serojulgi' | 'ppichim' | 'naerim' | 'dunggeunjulgi'

export const STEM_NAME_LABEL: Readonly<Record<StemName, string>> = {
  gidung: '기둥',
  bo: '보',
  gyeotjulgi: '곁줄기',
  jjalbeungidung: '짧은기둥',
  geolchim: '걸침',
  deotjulgi: '덧줄기',
  kkokji: '꼭지',
}

export const STEM_SHAPE_LABEL: Readonly<Record<StemShape, string>> = {
  garojulgi: '가로줄기',
  serojulgi: '세로줄기',
  ppichim: '삐침',
  naerim: '내림',
  dunggeunjulgi: '둥근줄기',
}

/** 이 각보다 크게 방향이 바뀌고 핸들이 없는 점이 꺾임이다. */
export const CORNER_MIN_TURN_DEGREES = 30
/**
 * 가로 · 세로 축에서 이 각 안이면 가로줄기 · 세로줄기, 벗어나면 삐침 · 내림.
 * 좌표가 낱자 상자에 맞춰 눌려 있어 `ㅆ` · `ㅉ`처럼 폭이 좁은 빗금은 15° 안팎까지 선다. 20°면 그걸 세로줄기로 읽는다.
 */
export const AXIS_TOLERANCE_DEGREES = 10
/** 끝점이 같은 채널의 다른 획에 이 거리 안으로 붙어 있으면 닿은 끝이다. */
export const TOUCH_DISTANCE = 0.1

export type JamoType = JamoData['type']
type GrammarTable = Record<JamoType, Record<string, Record<string, StemName | null>>>
const TABLE = grammar as unknown as GrammarTable

export interface StemSegmentEnd {
  point: number
  x: number
  y: number
  /** 획의 끝이면 `end`, 다음 마디로 꺾여 이어지는 자리면 `corner`. */
  kind: 'end' | 'corner'
  /** 획의 끝이면서 같은 채널의 다른 획에 안 붙어 있을 때만 열린 끝이다. 꺾임은 늘 닫혀 있다. */
  open: boolean
}

export interface StemSegment {
  shape: StemShape
  /** 마디가 시작하고 끝나는 점의 순번(`stroke.points` 기준). 닫힌 획은 끝 순번이 시작보다 작을 수 있다. */
  fromPoint: number
  toPoint: number
  /** 마디의 머리와 맺음. 가로줄기는 왼 · 오른, 나머지는 위 · 아래. 둥근줄기에는 없다. */
  head: StemSegmentEnd | null
  tail: StemSegmentEnd | null
}

export interface StemCorner {
  point: number
  x: number
  y: number
  /** 방향이 바뀐 각(도). 직각이면 90. */
  turn: number
}

export interface StemEnd {
  point: number
  x: number
  y: number
  /** 허공에 있으면 열린 끝, 같은 채널의 다른 획에 붙었으면 닿은 끝. */
  open: boolean
}

export interface StrokeDescription {
  strokeId: string
  channel: 'strokes' | 'horizontalStrokes' | 'verticalStrokes'
  /** 표에 있는 기본 줄기에 이어져 있나. */
  bound: boolean
  /** 귀속 획의 줄기 이름. 자유 획이거나 이름 없는 기본 줄기면 null. */
  name: StemName | null
  segments: StemSegment[]
  corners: StemCorner[]
  /** 줄기가 시작되는 끝과 끝나는 끝. 닫힌 획에는 없다. */
  head: StemEnd | null
  tail: StemEnd | null
}

export interface DescribeOptions {
  /** `귀속 풀기`로 풀어 둔 획 id. 표에 있어도 자유 획으로 본다. */
  released?: ReadonlySet<string>
}

/** 그 낱자의 기본 줄기 id → 이름. 표에 없는 낱자면 빈 표. */
export function grammarOf(type: JamoType, char: string): Readonly<Record<string, StemName | null>> {
  return TABLE[type]?.[char] ?? {}
}

const CHANNELS = ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const

export function describeJamoStrokes(jamo: JamoData, options: DescribeOptions = {}): StrokeDescription[] {
  const table = grammarOf(jamo.type, jamo.char)
  return CHANNELS.flatMap((channel) => {
    const strokes = (jamo[channel] ?? []) as StrokeDataV2[]
    return strokes.map((stroke) => {
      const bound = stroke.id in table && !options.released?.has(stroke.id)
      const others = strokes.filter((other) => other.id !== stroke.id)
      return { strokeId: stroke.id, channel, bound, name: bound ? table[stroke.id] : null, ...describeStrokeGeometry(stroke, others) }
    })
  })
}

export type StrokeGeometry = Pick<StrokeDescription, 'segments' | 'corners' | 'head' | 'tail'>

/** 이름표 없이 획 하나의 모양만 읽는다. `others`는 같은 채널의 나머지 획(닿음 판정용). */
export function describeStrokeGeometry(stroke: StrokeDataV2, others: readonly StrokeDataV2[]): StrokeGeometry {
  const points = ringPoints(stroke)
  if (points.length < 2) return { segments: [], corners: [], head: null, tail: null }

  if (stroke.closed && points.every(hasHandle)) {
    return { segments: [{ shape: 'dunggeunjulgi', fromPoint: 0, toPoint: 0, head: null, tail: null }], corners: [], head: null, tail: null }
  }

  const isOpen = (point: number) => others.every((other) => distanceToStroke(points[point], other) > TOUCH_DISTANCE)
  const corners = cornersOf(points, stroke.closed)
  const segments = segmentsOf(points, corners, stroke.closed, isOpen)
  if (stroke.closed) return { segments, corners, head: null, tail: null }

  const last = points.length - 1
  const firstIsHead = comesFirst(points[0], points[last])
  const end = (point: number): StemEnd => ({ point, x: points[point].x, y: points[point].y, open: isOpen(point) })
  return { segments, corners, head: end(firstIsHead ? 0 : last), tail: end(firstIsHead ? last : 0) }
}

/** 닫힌 획이 첫 점을 끝에 한 번 더 적어 둔 경우 그 점을 뺀다. */
function ringPoints(stroke: StrokeDataV2): AnchorPoint[] {
  const points = stroke.points
  if (!stroke.closed || points.length < 3) return points
  const first = points[0]
  const last = points[points.length - 1]
  return Math.hypot(first.x - last.x, first.y - last.y) < 1e-6 ? points.slice(0, -1) : points
}

function hasHandle(point: AnchorPoint): boolean {
  return Boolean(point.handleIn || point.handleOut)
}

/** 위에서 아래로, 높이가 같으면 왼쪽에서 오른쪽으로 쓴다. */
function comesFirst(a: AnchorPoint, b: AnchorPoint): boolean {
  return Math.abs(a.y - b.y) > 0.05 ? a.y < b.y : a.x <= b.x
}

function cornersOf(points: readonly AnchorPoint[], closed: boolean): StemCorner[] {
  const count = points.length
  const out: StemCorner[] = []
  for (let index = 0; index < count; index += 1) {
    if (!closed && (index === 0 || index === count - 1)) continue
    const point = points[index]
    if (hasHandle(point)) continue
    const before = points[(index - 1 + count) % count]
    const after = points[(index + 1) % count]
    const incoming = before.handleOut ?? before
    const outgoing = after.handleIn ?? after
    const turn = turnDegrees(point.x - incoming.x, point.y - incoming.y, outgoing.x - point.x, outgoing.y - point.y)
    if (turn >= CORNER_MIN_TURN_DEGREES) out.push({ point: index, x: point.x, y: point.y, turn: Math.round(turn * 10) / 10 })
  }
  return out
}

function turnDegrees(ax: number, ay: number, bx: number, by: number): number {
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by)
  if (lengths === 0) return 0
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / lengths))
  return Math.acos(cosine) * 180 / Math.PI
}

function segmentsOf(points: readonly AnchorPoint[], corners: readonly StemCorner[], closed: boolean, isOpen: (point: number) => boolean): StemSegment[] {
  const last = points.length - 1
  const isStrokeEnd = (point: number) => !closed && (point === 0 || point === last)
  const end = (point: number): StemSegmentEnd => {
    const kind = isStrokeEnd(point) ? 'end' : 'corner'
    return { point, x: points[point].x, y: points[point].y, kind, open: kind === 'end' && isOpen(point) }
  }
  const segment = (fromPoint: number, toPoint: number): StemSegment => {
    const shape = shapeOf(points[fromPoint], points[toPoint])
    const from = points[fromPoint]
    const to = points[toPoint]
    // 가로줄기는 왼쪽이 머리, 나머지는 위쪽이 머리.
    const fromIsHead = shape === 'garojulgi' ? from.x <= to.x : from.y <= to.y
    return { shape, fromPoint, toPoint, head: end(fromIsHead ? fromPoint : toPoint), tail: end(fromIsHead ? toPoint : fromPoint) }
  }
  if (!closed) {
    const stops = [0, ...corners.map(({ point }) => point), last]
    return stops.slice(1).map((toPoint, index) => segment(stops[index], toPoint))
  }
  if (corners.length === 0) return [segment(0, last)]
  return corners.map(({ point }, index) => segment(point, corners[(index + 1) % corners.length].point))
}

function shapeOf(from: AnchorPoint, to: AnchorPoint): Exclude<StemShape, 'dunggeunjulgi'> {
  const [top, bottom] = from.y <= to.y ? [from, to] : [to, from]
  const dx = bottom.x - top.x
  const dy = bottom.y - top.y
  const fromHorizontal = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI
  if (fromHorizontal <= AXIS_TOLERANCE_DEGREES) return 'garojulgi'
  if (fromHorizontal >= 90 - AXIS_TOLERANCE_DEGREES) return 'serojulgi'
  return dx < 0 ? 'ppichim' : 'naerim'
}

function distanceToStroke(point: AnchorPoint, stroke: StrokeDataV2): number {
  const line = flatten(stroke)
  let best = Infinity
  for (let index = 1; index < line.length; index += 1) best = Math.min(best, distanceToLine(point, line[index - 1], line[index]))
  return best
}

const CURVE_STEPS = 8

/** 중심선을 꺾은선으로 편다. 핸들이 있는 구간만 잘게 나눈다. */
function flatten(stroke: StrokeDataV2): Array<{ x: number; y: number }> {
  const points = stroke.points
  const out: Array<{ x: number; y: number }> = [points[0]]
  const count = stroke.closed ? points.length : points.length - 1
  for (let index = 0; index < count; index += 1) {
    const from = points[index]
    const to = points[(index + 1) % points.length]
    if (!from.handleOut && !to.handleIn) { out.push(to); continue }
    const c1 = from.handleOut ?? from
    const c2 = to.handleIn ?? to
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS
      const u = 1 - t
      out.push({
        x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
        y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
      })
    }
  }
  return out
}

function distanceToLine(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}
