import type { BoxConfig, StrokeDataV2 } from '../types'
import { flattenStrokeCenterline } from './brushGeometry'

/**
 * 속공간 지키기 — 최소 속공간 하한선. 플랜 `docs/plans/2026-10-01_속공간-지키기.md` 2단계.
 *
 * 굵기를 올리면 모든 획이 같은 배율로 굵어져, 획이 빽빽한 자소(ㅃ · ㄹ · ㅌ · ㅎ)부터 속공간이 막힌다.
 * 자소 안 획 사이 틈이 하한선(= max(고정 u, 굵어진 두께 × 비율)) 아래로 안 가게, 넘는 자소만 그 자소 전체의 굵기 배율을 낮춘다.
 * 자소 하나 안에서는 한 배율로 묶는다(한 자소 안 획 굵기가 들쑥날쑥하지 않게).
 * 굵기 400에서 이미 하한선보다 좁던 틈(ㅆ 두 ㅅ 다리 언저리 등)은 놓아 준다 — 그 한 곳 때문에 자소 전체가 얇아지지 않게. 노토 900도 ㅅ 속공간을 3u까지 좁힌다.
 *
 * 틈은 획 중심선 토막 사이 거리 − 두 반 두께로 잰다. 나란한 획(ㅌ 가로줄기들)도, 끝과 면(ㅎ 꼭지 ↔ 보)도 같은 셈이다.
 * 굵기 400 이하에서는 아무것도 안 바꾼다(배율 1). 반환값도 1을 넘지 않는다 — 원래보다 굵게 하지는 않는다.
 */

/**
 * 최소 속공간. 단위는 글자 칸(1 = 1000u). `ratio`는 굵어진 두께(자소 획 두께 가운데값 × 굵기 배율)에 곱한다.
 * 덜 굵어진 뒤의 두께가 아니라 목표 굵기의 두께로 잰다 — 하한선이 배율에 따라 움직이지 않게.
 */
export interface CounterFloor {
  fixed: number
  ratio: number
  /**
   * 쌓인 가로줄기 사이 틈의 비율. 없으면 `ratio`. 를의 ㄹ처럼 가로줄기가 쌓인 틈은 낮은 하한선이 낫다(10-01 사용자 고르기).
   * 둘 다 곧은 가로 토막(수평에서 20° 안)이고 가로로 겹친 길이가 두께의 2배 넘는 틈만 — ㅎ 보 ↔ 동그라미 윗부분은 아니다(한은 낮추면 나빠졌다).
   */
  horizontalRatio?: number
}
/** 기본 하한선: 24u, 두께의 1/4(굵기 900 = 34u). 1단계 측정의 막힘 기준과 같다. 값은 2단계에서 사용자가 고른다. */
export const DEFAULT_COUNTER_FLOOR: CounterFloor = { fixed: 0.024, ratio: 0.25 }
/** 굵기 400에서 이보다 좁은 틈(두께 대비)은 원래 붙여 그린 것으로 보고 안 지킨다 — 측정의 `닿음` 기준과 같다. */
const MIN_GAP_RATIO = 0.25

/** `start` · `end`: 획 처음부터 잰 길이(토막 시작 · 끝). `total` · `closed`: 그 획 전체 길이와 닫힘. */
interface Segment { ax: number; ay: number; bx: number; by: number; half: number; stroke: number; start: number; end: number; total: number; closed: boolean }
export interface CounterKeepStroke { stroke: StrokeDataV2; box: BoxConfig }

/** 세로에 가까울수록 `stemScale`만큼 얇다(일자 stroker의 방향별 두께와 같은 sin² 섞기). */
function halfWidthOf(thickness: number, dx: number, dy: number, stemScale: number): number {
  const length = Math.hypot(dx, dy)
  const sin2 = length > 0 ? (dy / length) ** 2 : 0
  return thickness / 2 * (1 + (stemScale - 1) * sin2)
}

function segmentsOf(strokes: readonly CounterKeepStroke[], stemScale: number): Segment[] {
  const out: Segment[] = []
  strokes.forEach(({ stroke, box }, strokeIndex) => {
    const points = flattenStrokeCenterline(stroke, box)
    const own: Segment[] = []
    let walked = 0
    for (let at = 1; at < points.length; at += 1) {
      const a = points[at - 1]
      const b = points[at]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length === 0) continue
      own.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, half: halfWidthOf(stroke.thickness, b.x - a.x, b.y - a.y, stemScale), stroke: strokeIndex, start: walked, end: walked + length, total: 0, closed: Boolean(stroke.closed) })
      walked += length
    }
    for (const segment of own) out.push({ ...segment, total: walked })
  })
  return out
}

/** 점에서 토막까지 거리와, 가장 가까운 자리의 토막 안 비율(0~1). */
function pointSegment(px: number, py: number, s: Segment): { distance: number; t: number } {
  const dx = s.bx - s.ax
  const dy = s.by - s.ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / lengthSquared))
  return { distance: Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy)), t }
}

/** 속공간을 이루는 두 토막은 나란하거나 마주 본다(ㅌ 가로줄기들, ㅃ 기둥들, ㅇ 맞은편). 이보다 벌어지면(cos) 쐐기다. */
const PARALLEL_COS = Math.cos(20 / 180 * Math.PI)

/** 나란하거나 마주 보는가 — 방향이 20° 안으로 같거나 반대. */
function parallel(p: Segment, q: Segment): boolean {
  const dot = (p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay)
  return Math.abs(dot) >= PARALLEL_COS * Math.hypot(p.bx - p.ax, p.by - p.ay) * Math.hypot(q.bx - q.ax, q.by - q.ay)
}

/** 120° 넘게 돌아 마주 보는가(ㄹ 위 · 가운데 가로줄기, ㅇ 맞은편). */
function facing(p: Segment, q: Segment): boolean {
  const dot = (p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay)
  return dot < -0.5 * Math.hypot(p.bx - p.ax, p.by - p.ay) * Math.hypot(q.bx - q.ax, q.by - q.ay)
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

interface Nearest { distance: number; atP: number; atQ: number; pointP: { x: number; y: number }; pointQ: { x: number; y: number } }

/** 두 토막 사이 거리와, 가장 가까운 두 자리(획 처음부터 잰 길이 · 좌표). */
function nearestBetween(p: Segment, q: Segment): Nearest {
  const raw = nearestOnSegments(p, q)
  const pointOf = (s: Segment, along: number) => {
    const t = s.end === s.start ? 0 : (along - s.start) / (s.end - s.start)
    return { x: s.ax + t * (s.bx - s.ax), y: s.ay + t * (s.by - s.ay) }
  }
  return { ...raw, pointP: pointOf(p, raw.atP), pointQ: pointOf(q, raw.atQ) }
}

function nearestOnSegments(p: Segment, q: Segment): { distance: number; atP: number; atQ: number } {
  const at = (s: Segment, t: number) => s.start + t * (s.end - s.start)
  const d1 = cross(p.ax, p.ay, p.bx, p.by, q.ax, q.ay)
  const d2 = cross(p.ax, p.ay, p.bx, p.by, q.bx, q.by)
  const d3 = cross(q.ax, q.ay, q.bx, q.by, p.ax, p.ay)
  const d4 = cross(q.ax, q.ay, q.bx, q.by, p.bx, p.by)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return { distance: 0, atP: at(p, d3 / (d3 - d4)), atQ: at(q, d1 / (d1 - d2)) }
  }
  const candidates = [
    { ...pointSegment(p.ax, p.ay, q), fromP: 0, onQ: true }, { ...pointSegment(p.bx, p.by, q), fromP: 1, onQ: true },
    { ...pointSegment(q.ax, q.ay, p), fromP: 0, onQ: false }, { ...pointSegment(q.bx, q.by, p), fromP: 1, onQ: false },
  ]
  const best = candidates.reduce((a, b) => b.distance < a.distance ? b : a)
  return best.onQ
    ? { distance: best.distance, atP: at(p, best.fromP), atQ: at(q, best.t) }
    : { distance: best.distance, atP: at(p, best.t), atQ: at(q, best.fromP) }
}

/** 한 획 위 두 자리 사이를 획을 따라 잰 길이. 닫힌 획은 짧은 쪽. */
function alongStroke(a: number, b: number, s: Segment): number {
  const forward = Math.abs(a - b)
  return s.closed ? Math.min(forward, s.total - forward) : forward
}

/** 그 굵기에서의 하한선(글자 칸 단위). `horizontal`이면 가로줄기 사이 비율을 쓴다. */
export function counterFloorAt(floor: CounterFloor, thickness: number, weightMultiplier: number, horizontal = false): number {
  const ratio = horizontal ? floor.horizontalRatio ?? floor.ratio : floor.ratio
  return Math.max(floor.fixed, ratio * thickness * weightMultiplier)
}

const HORIZONTAL_SIN = Math.sin(20 / 180 * Math.PI)
/** 토막이 수평에서 20° 안인가. */
const isHorizontal = (s: Segment) => Math.abs(s.by - s.ay) <= HORIZONTAL_SIN * Math.hypot(s.bx - s.ax, s.by - s.ay)
/** 쌓인 가로줄기인가: 둘 다 가로 토막이고 가로로 `minOverlap` 넘게 겹친다. 곡선을 잘게 쪼갠 토막(ㅇ 윗부분)은 짧아서 빠진다. */
function stackedHorizontal(p: Segment, q: Segment, minOverlap: number): boolean {
  if (!isHorizontal(p) || !isHorizontal(q)) return false
  const overlap = Math.min(Math.max(p.ax, p.bx), Math.max(q.ax, q.bx)) - Math.max(Math.min(p.ax, p.bx), Math.min(q.ax, q.bx))
  return overlap > minOverlap
}

/**
 * 자소 하나의 굵기 배율 보정. 획 두께에 `weightMultiplier × 이 값`을 곱하면 지킬 틈마다 하한선이 남는다.
 * `weightMultiplier ≤ 1`이거나 지킬 틈이 없으면 1.
 */
export function counterKeepScale(
  strokes: readonly CounterKeepStroke[],
  weightMultiplier: number,
  floor: CounterFloor = DEFAULT_COUNTER_FLOOR,
  stemScale = 1,
): number {
  if (!(weightMultiplier > 1) || strokes.length === 0) return 1
  const segments = segmentsOf(strokes, stemScale)
  const thickness = strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)]
  const minGap = thickness * MIN_GAP_RATIO
  const requiredOf = (p: Segment, q: Segment) => counterFloorAt(floor, thickness, weightMultiplier, floor.horizontalRatio !== undefined && stackedHorizontal(p, q, thickness * 2))
  const pairs: ({ p: Segment; q: Segment } & Nearest)[] = []
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) pairs.push({ p: segments[i], q: segments[j], ...nearestBetween(segments[i], segments[j]) })
  }
  // 서로 이어진 두 획의 이음 자리(잉크가 겹치는 가장 가까운 곳). ㅅ 두 다리 꼭대기, ㅁ 모서리.
  const joints = new Map<string, { x: number; y: number; distance: number }>()
  for (const pair of pairs) {
    if (pair.p.stroke === pair.q.stroke || pair.distance > pair.p.half + pair.q.half) continue
    const key = `${pair.p.stroke}:${pair.q.stroke}`
    if ((joints.get(key)?.distance ?? Infinity) <= pair.distance) continue
    joints.set(key, { x: (pair.pointP.x + pair.pointQ.x) / 2, y: (pair.pointP.y + pair.pointQ.y) / 2, distance: pair.distance })
  }
  let limit = weightMultiplier
  for (const { p, q, distance, atP, atQ, pointP, pointQ } of pairs) {
    const halves = p.half + q.half
    const gap = distance - halves
    // 원래 붙여 그린 틈, 굵기 400에서 이미 하한선보다 좁던 틈은 안 지킨다.
    const required = requiredOf(p, q)
    if (gap <= minGap || gap <= required) continue
    // 벌어진 두 토막 사이(ㅆ 안쪽 두 다리가 엇갈린 X, ㅈ · ㅊ 다리)는 속공간이 아니다 — 굵어지면 쐐기 끝이 조금 물러날 뿐이다.
    if (!parallel(p, q)) continue
    // 한 획 안에서 덜 돌았는데 곧 닿는 토막은 굽은 길의 이웃이다 — 틈이 아니다(ㅇ 둘레의 이웃 토막).
    // 되돌아와 마주 보는 토막(ㄹ 위 · 가운데 가로줄기, ㅇ 맞은편)이나 크게 돌아 다시 나란한 토막(ㄹ 위 · 아래)은 틈이다.
    if (p.stroke === q.stroke && !facing(p, q) && distance >= 0.5 * alongStroke(atP, atQ, p)) continue
    // 이어진 두 획이 이음 자리에서 벌어지는 쐐기(ㅅ 두 다리)도 같다 — 틈이 0부터 연속이라, 지키면 하한선이 몇이든 자소 전체가 굵기 400에 묶인다.
    const joint = p.stroke === q.stroke ? undefined : joints.get(`${p.stroke}:${q.stroke}`)
    if (joint && !facing(p, q) && distance >= 0.5 * (Math.hypot(pointP.x - joint.x, pointP.y - joint.y) + Math.hypot(pointQ.x - joint.x, pointQ.y - joint.y))) continue
    // 굵기 k에서 틈 = 거리 − k × 반 두께 합. 이게 하한선 아래로 안 가게.
    limit = Math.min(limit, (distance - required) / halves)
  }
  return Math.min(1, Math.max(1, limit) / weightMultiplier)
}

/** 획 묶음의 두께를 배율대로 바꾼 사본. 배율이 1이면 받은 획 그대로. */
export function scaleStrokeThickness<T extends { stroke: StrokeDataV2 }>(item: T, scale: number): T {
  return scale === 1 ? item : { ...item, stroke: { ...item.stroke, thickness: item.stroke.thickness * scale } }
}
