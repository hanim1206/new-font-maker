import { fitPenStroke, PEN_STABILIZATION_MAX_WINDOW, penClosesOnItself } from '../src/services/penStrokeFit'
import type { PenFitResult, PenPoint } from '../src/services/penStrokeFit'
import { boundStrokesOf, isUnder, JAMO_CHANNELS, stemReferenceBox, type AxisPoint, type StemMaster, type StemMasters } from '../src/services/stemMaster'
import { DEFAULT_LAYOUT_CONFIGS } from '../src/data/layoutConfigs'
import type { AnchorPoint, JamoData, LayoutType, StrokeDataV2 } from '../src/types'

/**
 * 획 긋기 시험판(학습 단계 프로토타입)의 계산. 줄기 여섯을 한 번씩 그으면 글자 전체에 퍼뜨린다.
 * - 모음 줄기 넷(세로선 · 세로 짧은 선 · 가로선 · 가로 긴 선)은 홀자 줄기 마스터(기둥 · 짧은기둥 · 곁줄기 · 보)가 되어 기존 엔진(`propagatedJungseong`)으로 퍼진다.
 * - 닿자는 엔진에 퍼뜨리기가 없어 여기서 간이로 한다: 곧은 마디는 길이에 따라 가로선 · 가로 긴 선 · 세로선 · 세로 짧은 선 모양, 사선 획은 대각선(뒤집어 씀), 둥근 닫힌 획은 동그라미.
 *   닿자 칸은 짜임마다 가로세로 비율이 달라서(가로 짜임 받침 칸은 납작하다) 모양을 em으로 놓는다 — 휨이 칸 비율 따라 들쭉날쭉하지 않게.
 * 모양(휨 · 기울기)은 그은 대로 살리고 손 떨림만 지운다. 길이 · 자리 · 굵기는 서비스가 정한다(하니무스 2026-11-20).
 * 떨림 정리는 중간으로 고정(하니무스 2026-11-20). 저장하지 않고 제품 값도 안 바꾼다.
 * 기획: 고양이 `학습-단계-뼈대-2026-11-20.md`.
 */

export type StemKind = 'vertical' | 'shortVertical' | 'horizontal' | 'longHorizontal' | 'diagonal' | 'circle'

export interface StemInfo {
  kind: StemKind
  /** 화면 이름(긋기 전) */
  label: string
  /** 긋고 나서 알려 주는 우리 말(어휘사전) */
  term: string
  /** 긋는 판 안내 */
  hint: string
  /** 모음 마스터 이름. 닿자에만 쓰는 줄기는 없다. */
  master?: 'gidung' | 'jjalbeungidung' | 'gyeotjulgi' | 'bo'
}

export const STEMS: readonly StemInfo[] = [
  { kind: 'vertical', label: '세로선', term: '기둥', hint: '위에서 아래로 길게', master: 'gidung' },
  { kind: 'shortVertical', label: '세로 짧은 선', term: '짧은기둥', hint: '위에서 아래로 짧게', master: 'jjalbeungidung' },
  { kind: 'horizontal', label: '가로선', term: '곁줄기', hint: '왼쪽에서 오른쪽으로 짧게', master: 'gyeotjulgi' },
  { kind: 'longHorizontal', label: '가로 긴 선', term: '보', hint: '왼쪽에서 오른쪽으로 길게', master: 'bo' },
  { kind: 'diagonal', label: '대각선', term: '삐침과 내림', hint: '오른쪽 위에서 왼쪽 아래로' },
  { kind: 'circle', label: '동그라미', term: '둥근줄기', hint: '한 바퀴 돌려서' },
]

export const stemInfo = (kind: StemKind): StemInfo => STEMS.find((stem) => stem.kind === kind)!

/** 떨림 정리. 중간(안정화 25 · ε 0.01)으로 고정 — 약하게 10 · 0.005, 세게 50 · 0.02와 견준 뒤 정함. */
const CALM = { stabilization: 25, epsilon: 0.01 }
const MIN_LENGTH = 0.12
const MAX_SLOPE = 0.6
const FIT_THICKNESS = 0.07

/** 축 방향 모양. `t` 0→1은 줄기 방향, `r`은 그은 길이에 견준 옆 어긋남(+는 진행 방향의 오른쪽, 화면 좌표). 길이와 상관없이 같은 꼴. */
export interface RelPoint { t: number; r: number; handleIn?: { t: number; r: number }; handleOut?: { t: number; r: number } }

export type DrawnStem =
  | { ok: true; kind: StemKind; fit: PenFitResult; shape?: RelPoint[]; loop?: AnchorPoint[] }
  | { ok: false; kind: StemKind; reason: 'short' | 'direction' | 'open' | 'fit' }

const fit = (points: readonly PenPoint[]) => fitPenStroke(points, {
  epsilon: CALM.epsilon,
  smoothing: CALM.stabilization / 100 * PEN_STABILIZATION_MAX_WINDOW,
  thickness: FIT_THICKNESS,
})

/** 곧은 줄기(세로 · 가로 · 대각선). 정해진 방향(세로는 위→아래, 가로는 왼→오른, 대각선은 위→아래)으로 돌려 맞춘 뒤 시작→끝 현을 축으로 잰다. */
function straightStem(raw: readonly PenPoint[], kind: StemKind): DrawnStem {
  const first = raw[0], last = raw[raw.length - 1]
  const dx = last.x - first.x, dy = last.y - first.y
  const chord = Math.hypot(dx, dy)
  if (chord < MIN_LENGTH) return { ok: false, kind, reason: 'short' }
  const vertical = kind === 'vertical' || kind === 'shortVertical'
  const horizontal = kind === 'horizontal' || kind === 'longHorizontal'
  if (vertical && Math.abs(dx) > Math.abs(dy) * MAX_SLOPE) return { ok: false, kind, reason: 'direction' }
  if (horizontal && Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return { ok: false, kind, reason: 'direction' }
  // 대각선: 너무 눕거나 서면 아니다(15°~75°).
  if (kind === 'diagonal' && (Math.abs(dy) < chord * 0.26 || Math.abs(dx) < chord * 0.26)) return { ok: false, kind, reason: 'direction' }
  const flip = horizontal ? dx < 0 : dy < 0
  const fitted = fit(flip ? [...raw].reverse() : raw)
  if (!fitted) return { ok: false, kind, reason: 'fit' }
  const anchors = fitted.stroke.points
  const start = anchors[0], end = anchors[anchors.length - 1]
  // 세로 · 가로는 축이 곧다(시작점에서 줄기 방향) — 끝의 옆 어긋남은 기울기 모양으로 남는다. 대각선은 현이 축이다.
  const axis = vertical ? { x: 0, y: 1 } : horizontal ? { x: 1, y: 0 } : normalized({ x: end.x - start.x, y: end.y - start.y })
  const length = (end.x - start.x) * axis.x + (end.y - start.y) * axis.y
  if (length <= 0) return { ok: false, kind, reason: 'fit' }
  const normal = { x: axis.y, y: -axis.x }
  const rel = (point: { x: number; y: number }) => {
    const px = point.x - start.x, py = point.y - start.y
    return { t: (px * axis.x + py * axis.y) / length, r: (px * normal.x + py * normal.y) / length }
  }
  const lastIndex = anchors.length - 1
  const shape: RelPoint[] = anchors.map((point, index) => ({
    ...(index === 0 ? { t: 0, r: 0 } : index === lastIndex ? { t: 1, r: rel(point).r } : rel(point)),
    ...(point.handleIn ? { handleIn: rel(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: rel(point.handleOut) } : {}),
  }))
  return { ok: true, kind, fit: fitted, shape }
}

function normalized(v: { x: number; y: number }) {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}

/** 동그라미. 한 바퀴 돈 선이어야 한다. 그은 범위를 0–1로 편 닫힌 앵커를 남긴다. */
function circleStem(raw: readonly PenPoint[]): DrawnStem {
  const xs = raw.map((point) => point.x), ys = raw.map((point) => point.y)
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys)
  if (Math.min(width, height) < MIN_LENGTH) return { ok: false, kind: 'circle', reason: 'short' }
  if (!penClosesOnItself(raw)) return { ok: false, kind: 'circle', reason: 'open' }
  const fitted = fit(raw)
  if (!fitted) return { ok: false, kind: 'circle', reason: 'fit' }
  let anchors = fitted.stroke.points
  // 끝이 시작에 거의 닿았으면 마지막 앵커를 빼고 닫는다(닫힌 획이 시작으로 돌아간다).
  const head = anchors[0], tail = anchors[anchors.length - 1]
  if (anchors.length > 2 && Math.hypot(head.x - tail.x, head.y - tail.y) < Math.max(width, height) * 0.15) {
    anchors = [{ ...head, ...(tail.handleIn ? { handleIn: tail.handleIn } : {}) }, ...anchors.slice(1, -1)]
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys)
  const unit = (point: { x: number; y: number }) => ({ x: (point.x - x0) / width, y: (point.y - y0) / height })
  const loop = anchors.map((point) => ({ ...unit(point), ...(point.handleIn ? { handleIn: unit(point.handleIn) } : {}), ...(point.handleOut ? { handleOut: unit(point.handleOut) } : {}) }))
  return { ok: true, kind: 'circle', fit: fitted, loop }
}

/** 그은 점(긋는 판 좌표, 판 높이 = 1) → 줄기. */
export function drawnStem(raw: readonly PenPoint[], kind: StemKind): DrawnStem {
  if (raw.length < 2) return { ok: false, kind, reason: 'short' }
  return kind === 'circle' ? circleStem(raw) : straightStem(raw, kind)
}

// ── 모음(홀자): 마스터로 바꿔 기존 엔진으로 퍼뜨린다 ──

/** 이 마스터 갈래 줄기의 보통 길이(em, 중앙값). 그은 모양의 비율을 em 오프셋으로 바꿀 때 쓴다. */
export function typicalLengthEm(jungseong: Readonly<Record<string, JamoData>>, base: NonNullable<StemInfo['master']>): number {
  const lengths: number[] = []
  for (const jamo of Object.values(jungseong)) {
    for (const item of boundStrokesOf(jamo, {})) {
      if (!isUnder(item.name, base)) continue
      const { points } = item.stroke
      const box = stemReferenceBox(jamo.char, item.channel, item.stroke)
      const start = points[0], end = points[points.length - 1]
      lengths.push(Math.hypot((end.x - start.x) * box.width, (end.y - start.y) * box.height))
    }
  }
  lengths.sort((a, b) => a - b)
  return lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0.5
}

/**
 * 모양 → 마스터. 마스터 오프셋 +는 진행 방향의 오른쪽(`instanceOf`). 그은 모양의 r도 같은 셈(진행 방향 오른쪽 +)이라 부호 그대로,
 * 길이만 이 갈래의 보통 길이로 바꾼다.
 */
export function masterOf(stem: DrawnStem, lengthEm: number): StemMaster | null {
  const base = stemInfo(stem.kind).master
  if (!stem.ok || !stem.shape || !base) return null
  const axis = (point: { t: number; r: number }): { t: number; o: number } => ({ t: point.t, o: point.r * lengthEm })
  const points: AxisPoint[] = stem.shape.map((point) => ({
    ...axis(point),
    ...(point.handleIn ? { handleIn: axis(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: axis(point.handleOut) } : {}),
  }))
  return { name: base, points }
}

/** 그은 모음 줄기들 → 마스터 묶음. */
export function mastersOf(stems: Partial<Record<StemKind, DrawnStem>>, jungseong: Readonly<Record<string, JamoData>>): StemMasters {
  const masters: StemMasters = {}
  for (const info of STEMS) {
    const stem = stems[info.kind]
    if (!info.master || !stem?.ok) continue
    const master = masterOf(stem, typicalLengthEm(jungseong, info.master))
    if (master) masters[info.master] = master
  }
  return masters
}

/** 홀자마다 줄기 종류별 획(`홀자:획id` → 종류). 색으로 "내 줄기가 쓰인 자리"를 보일 때 쓴다. */
export function vowelStemKeys(jungseong: Readonly<Record<string, JamoData>>): Map<string, StemKind> {
  const keys = new Map<string, StemKind>()
  for (const [char, jamo] of Object.entries(jungseong)) {
    for (const item of boundStrokesOf(jamo, {})) {
      const info = STEMS.find((stem) => stem.master && isUnder(item.name, stem.master))
      if (info) keys.set(`${char}:${item.stroke.id}`, info.kind)
    }
  }
  return keys
}

/**
 * 그은 획의 두께 — 한 펜으로 그었으니 획마다 같다. 저장된 「ㅣ」 기둥 두께(없으면 모음 획 가운데값)를 쓴다.
 * 저장소 자모는 획마다 두께가 다를 수 있다(이은 획 ㄹ · ㅇ · ㅅ이 가로 · 세로 사이 값으로 들어온 것 등). 그 값을 그은 획에 그대로 물려주면
 * 기본 굵기에서 그은 ㄹ · ㅇ · ㅅ만 가늘어진다(하니무스 2026-11-24 8:40). 굵을 때는 자소마다 두께를 다시 정해 가려졌다.
 */
export function penThicknessOf(jungseong: Readonly<Record<string, JamoData>>): number {
  const stem = jungseong['ㅣ']?.strokes?.find((stroke) => stroke.thickness > 0)
  if (stem) return stem.thickness
  const all = Object.values(jungseong).flatMap((jamo) => JAMO_CHANNELS.flatMap((channel) => jamo[channel] ?? [])).map((stroke) => stroke.thickness).filter((t) => t > 0).sort((a, b) => a - b)
  return all.length ? all[Math.floor(all.length / 2)] : FIT_THICKNESS
}

/** 그은 줄기가 입혀진 홀자 획(`홀자:획id`)에 펜 두께를 준다. 안 그은 획은 그대로. */
export function withPenThicknessVowels(jungseong: Readonly<Record<string, JamoData>>, drawnKinds: ReadonlySet<StemKind>, thickness: number): Record<string, JamoData> {
  const keys = vowelStemKeys(jungseong)
  const out: Record<string, JamoData> = {}
  for (const [char, jamo] of Object.entries(jungseong)) {
    let touched = false
    const next = { ...jamo }
    for (const channel of JAMO_CHANNELS) {
      const strokes = jamo[channel]
      if (!strokes) continue
      next[channel] = strokes.map((stroke) => {
        const kind = keys.get(`${char}:${stroke.id}`)
        if (!kind || !drawnKinds.has(kind) || stroke.thickness === thickness) return stroke
        touched = true
        return { ...stroke, thickness }
      })
    }
    out[char] = touched ? next : jamo
  }
  return out
}

// ── 닿자: 간이 퍼뜨리기 ──

type Vec = { x: number; y: number }

/** 닿자 칸의 크기(em). 획 좌표(칸 안 0–1)를 em으로 펴서 모양을 놓는다. */
export interface BoxSize { width: number; height: number }
const SQUARE: BoxSize = { width: 1, height: 1 }

/** 짜임 목록(기본 짜임 표 순서). */
export const LAYOUTS = Object.keys(DEFAULT_LAYOUT_CONFIGS) as LayoutType[]

/** 짜임별 닿자 칸 크기(em). 기본 짜임 표의 첫닿 · 받침 칸. */
export function consonantBoxesOf(layout: LayoutType): { CH: BoxSize; JO: BoxSize } {
  const boxes = DEFAULT_LAYOUT_CONFIGS[layout]?.boxes
  const size = (box?: { width: number; height: number }) => (box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : SQUARE)
  return { CH: size(boxes?.CH), JO: size(boxes?.JO ?? boxes?.CH) }
}

/**
 * A→B 사이에 모양을 놓은 앵커들(A 포함, B 포함). `mirror`면 옆 어긋남을 뒤집는다.
 * 닿자는 끝이 다른 획과 이어지니 두 끝을 제자리에 둔다 — 끝의 옆 어긋남(기울기)만큼 기울여 빼고 휨만 남긴다.
 * 휨은 em에서 잰다: 칸 좌표를 칸 크기로 펴서 놓고 다시 접는다. 그래야 납작한 칸에서 세로 마디가 덜 휘고 가로 마디가 더 휘는 일이 없다.
 */
function placeShape(shape: readonly RelPoint[], a: Vec, b: Vec, mirror = false, box: BoxSize = SQUARE): AnchorPoint[] {
  const d = { x: (b.x - a.x) * box.width, y: (b.y - a.y) * box.height }
  const normal = { x: d.y, y: -d.x }
  const sign = mirror ? -1 : 1
  const tilt = shape[shape.length - 1].r
  const at = (point: { t: number; r: number }) => {
    const r = (point.r - tilt * point.t) * sign
    return { x: a.x + (d.x * point.t + normal.x * r) / box.width, y: a.y + (d.y * point.t + normal.y * r) / box.height }
  }
  return shape.map((point, index) => {
    const placed: AnchorPoint = index === 0 ? { ...a } : index === shape.length - 1 ? { ...b } : at(point)
    return { ...placed, ...(point.handleIn ? { handleIn: at(point.handleIn) } : {}), ...(point.handleOut ? { handleOut: at(point.handleOut) } : {}) }
  })
}

/** 앵커 줄을 거꾸로(손잡이도 바꿔 단다). */
function reversed(points: readonly AnchorPoint[]): AnchorPoint[] {
  return [...points].reverse().map(({ handleIn, handleOut, ...rest }) => ({ ...rest, ...(handleOut ? { handleIn: handleOut } : {}), ...(handleIn ? { handleOut: handleIn } : {}) }))
}

/** 곧은 마디의 방향. 손잡이가 있거나 비스듬하면 null. */
function segmentKind(a: AnchorPoint, b: AnchorPoint): 'horizontal' | 'vertical' | null {
  if (a.handleOut || b.handleIn) return null
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
  if (dx < 1e-6 && dy < 1e-6) return null
  if (dx >= dy * 2.5) return 'horizontal'
  if (dy >= dx * 2.5) return 'vertical'
  return null
}

export interface ConsonantShapes {
  horizontal?: RelPoint[]
  longHorizontal?: RelPoint[]
  vertical?: RelPoint[]
  shortVertical?: RelPoint[]
  diagonal?: { shape: RelPoint[]; leftward: boolean }
  loop?: AnchorPoint[]
}

export function consonantShapesOf(stems: Partial<Record<StemKind, DrawnStem>>): ConsonantShapes {
  const shapes: ConsonantShapes = {}
  const h = stems.horizontal, lh = stems.longHorizontal, v = stems.vertical, sv = stems.shortVertical, d = stems.diagonal, c = stems.circle
  if (h?.ok && h.shape) shapes.horizontal = h.shape
  if (lh?.ok && lh.shape) shapes.longHorizontal = lh.shape
  if (v?.ok && v.shape) shapes.vertical = v.shape
  if (sv?.ok && sv.shape) shapes.shortVertical = sv.shape
  if (d?.ok && d.shape) {
    const points = d.fit.stroke.points
    shapes.diagonal = { shape: d.shape, leftward: points[points.length - 1].x < points[0].x }
  }
  if (c?.ok && c.loop) shapes.loop = c.loop
  return shapes
}

/** 이 획이 대각선(삐침 · 내림)인가 — 열린 두 앵커 획이고 15°~75°. */
function isDiagonal(stroke: StrokeDataV2): boolean {
  if (stroke.closed || stroke.points.length !== 2) return false
  const [a, b] = stroke.points
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), chord = Math.hypot(dx, dy)
  // 0.15: ㅆ · ㅉ의 안쪽 다리, ㄽ · ㅄ의 ㅅ처럼 좁은 칸에서 가파른 다리도 대각선이다(하니무스 2026-11-21 "쌍시옷 이슈").
  return chord > 0.2 && dx > chord * 0.15 && dy > chord * 0.15
}

/** 둥근 닫힌 획(ㅇ · ㅎ의 동그라미) — 손잡이가 있는 닫힌 획. */
const isRound = (stroke: StrokeDataV2) => stroke.closed && stroke.points.some((point) => point.handleIn || point.handleOut)

/** 칸 한 변의 이만큼 이상을 가로지르는 마디는 긴 선이다(ㄱ · ㄷ · ㅁ의 가로, ㄴ · ㅁ · ㅂ의 세로). 짧은 건 ㅎ · ㅊ의 꼭지, ㅌ · ㅍ의 안쪽 같은 것. */
const LONG_SPAN = 0.6

/**
 * 곧은 마디에 쓸 줄기. 가로는 길면 가로 긴 선, 세로는 짧으면 세로 짧은 선 — 안 그었으면 짝(가로선 · 세로선)으로 대신한다.
 */
function segmentShape(kind: 'horizontal' | 'vertical', a: Vec, b: Vec, shapes: ConsonantShapes): { kind: StemKind; shape: RelPoint[] } | null {
  const pick = (first: StemKind, second: StemKind) => {
    const shape = shapes[first as keyof ConsonantShapes] as RelPoint[] | undefined
    if (shape) return { kind: first, shape }
    const fallback = shapes[second as keyof ConsonantShapes] as RelPoint[] | undefined
    return fallback ? { kind: second, shape: fallback } : null
  }
  if (kind === 'horizontal') {
    return Math.abs(b.x - a.x) >= LONG_SPAN ? pick('longHorizontal', 'horizontal') : pick('horizontal', 'longHorizontal')
  }
  return Math.abs(b.y - a.y) >= LONG_SPAN ? pick('vertical', 'shortVertical') : pick('shortVertical', 'vertical')
}

/**
 * 닿자 획 하나에 줄기 모양을 입힌다. 바뀐 줄기 종류도 돌려준다(색 표시용).
 * 곧은 마디는 각 마디를 가로 · 세로 줄기 모양으로 바꾸고 꺾인 자리는 그대로 둔다 — 꺾임은 따로 긋지 않고 가로선과 세로선을 잇는다(하니무스 2026-11-20).
 * `box`는 이 닿자 칸의 크기(em). 모양을 em에서 놓아 칸 비율에 휨이 끌려가지 않게 한다.
 */
export function shapeConsonantStroke(stroke: StrokeDataV2, shapes: ConsonantShapes, box: BoxSize = SQUARE): { stroke: StrokeDataV2; kinds: StemKind[] } {
  if (isRound(stroke)) {
    if (!shapes.loop) return { stroke, kinds: [] }
    const xs = stroke.points.flatMap((point) => [point.x]), ys = stroke.points.flatMap((point) => [point.y])
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
    const place = (point: Vec) => ({ x: x0 + point.x * w, y: y0 + point.y * h })
    const points = shapes.loop.map((point) => ({ ...place(point), ...(point.handleIn ? { handleIn: place(point.handleIn) } : {}), ...(point.handleOut ? { handleOut: place(point.handleOut) } : {}) }))
    return { stroke: { ...stroke, points, closed: true }, kinds: ['circle'] }
  }
  if (isDiagonal(stroke)) {
    if (!shapes.diagonal) return { stroke, kinds: [] }
    const [a, b] = stroke.points
    // 위에서 아래로 놓고, 그은 대각선과 좌우가 다르면 뒤집어 쓴다(삐침 ↔ 내림).
    const [top, bottom] = a.y <= b.y ? [a, b] : [b, a]
    const leftward = bottom.x < top.x
    const placed = placeShape(shapes.diagonal.shape, { x: top.x, y: top.y }, { x: bottom.x, y: bottom.y }, leftward !== shapes.diagonal.leftward, box)
    return { stroke: { ...stroke, points: a.y <= b.y ? placed : reversed(placed) }, kinds: ['diagonal'] }
  }
  const points = stroke.points
  const count = stroke.closed ? points.length : points.length - 1
  if (count < 1) return { stroke, kinds: [] }
  const kinds = new Set<StemKind>()
  const out: AnchorPoint[] = []
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const kind = segmentKind(a, b)
    const chosen = kind ? segmentShape(kind, a, b, shapes) : null
    let segment: AnchorPoint[]
    if (chosen && kind) {
      kinds.add(chosen.kind)
      // 모양은 가로 왼→오른, 세로 위→아래로 잰 것이다. 거꾸로 가는 마디는 바르게 놓고 뒤집는다.
      const forward = kind === 'horizontal' ? b.x >= a.x : b.y >= a.y
      const placed = forward ? placeShape(chosen.shape, a, b, false, box) : reversed(placeShape(chosen.shape, b, a, false, box))
      segment = placed.map((point, index) => (index === 0 ? { ...point, ...(a.handleIn ? { handleIn: a.handleIn } : {}) } : point))
    } else {
      segment = [{ ...a }, { ...b }]
    }
    // 마디의 끝은 다음 마디의 시작이다 — 겹치지 않게 시작만 잇는다(끝 손잡이는 다음 시작에 옮긴다).
    if (out.length) {
      const joint = out[out.length - 1]
      const head = segment[0]
      out[out.length - 1] = { ...joint, ...(head.handleOut ? { handleOut: head.handleOut } : {}) }
      out.push(...segment.slice(1))
    } else {
      out.push(...segment)
    }
  }
  if (kinds.size === 0) return { stroke, kinds: [] }
  // 닫힌 획은 마지막 점이 첫 점과 같은 자리다 — 손잡이를 첫 점으로 넘기고 뺀다.
  if (stroke.closed && out.length > 1) {
    const tail = out.pop()!
    out[0] = { ...out[0], ...(tail.handleIn ? { handleIn: tail.handleIn } : {}) }
  }
  return { stroke: { ...stroke, points: out }, kinds: [...kinds] }
}

/** 닿자 자모 묶음 전체에 줄기 모양을 입힌다. 바뀐 자모와 `자모:획id` → 종류 표를 돌려준다. */
export function shapeConsonants(jamos: Readonly<Record<string, JamoData>>, shapes: ConsonantShapes, box: BoxSize = SQUARE, thickness?: number): { changed: Record<string, JamoData>; keys: Map<string, StemKind[]> } {
  const changed: Record<string, JamoData> = {}
  const keys = new Map<string, StemKind[]>()
  if (!Object.values(shapes).some(Boolean)) return { changed, keys }
  for (const [char, jamo] of Object.entries(jamos)) {
    if (!jamo.strokes?.length) continue
    let touched = false
    const strokes = jamo.strokes.map((stroke) => {
      const result = shapeConsonantStroke(stroke, shapes, box)
      if (result.kinds.length === 0) return stroke
      touched = true
      keys.set(`${char}:${stroke.id}`, result.kinds)
      // 그은 모양을 입힌 획은 펜 두께 하나로(`penThicknessOf`).
      return thickness === undefined ? result.stroke : { ...result.stroke, thickness }
    })
    if (touched) changed[char] = { ...jamo, strokes }
  }
  return { changed, keys }
}

/** 닿자에서 줄기 종류별로 쓰이는 획(색 표시용, 그은 것과 상관없이). */
export function consonantStemKeys(jamos: Readonly<Record<string, JamoData>>): Map<string, StemKind[]> {
  const line = (): RelPoint[] => [{ t: 0, r: 0 }, { t: 1, r: 0 }]
  const all: ConsonantShapes = {
    horizontal: line(),
    longHorizontal: line(),
    vertical: line(),
    shortVertical: line(),
    diagonal: { shape: [{ t: 0, r: 0 }, { t: 1, r: 0 }], leftward: true },
    loop: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }],
  }
  return shapeConsonants(jamos, all).keys
}
