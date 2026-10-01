import type { BoxConfig, StrokeDataV2 } from '../types'
import { flattenStrokeCenterline } from './brushGeometry'

/**
 * 속공간 지키기. 플랜 `docs/plans/2026-10-01_속공간-지키기.md` 2단계.
 *
 * 굵기를 올리면 모든 획이 같은 배율로 굵어져, 획이 빽빽한 자소(ㅃ · ㄹ · ㅌ · ㅎ)부터 속공간이 막힌다.
 * 실제 굵은 폰트처럼 빽빽한 자소는 덜 굵게 한다: 자소 안 획 사이 틈마다 "굵어지며 먹어도 되는 몫"을 정해 두고, 넘으면 그 자소 전체의 굵기 배율을 낮춘다.
 * 자소 하나 안에서는 한 배율로 묶는다(한 자소 안 획 굵기가 들쑥날쑥하지 않게).
 *
 * 틈은 획 중심선 토막 사이 거리 − 두 반 두께로 잰다. 나란한 획(ㅌ 가로줄기들)도, 끝과 면(ㅎ 꼭지 ↔ 보)도 같은 셈이다.
 * 굵기 400 이하에서는 아무것도 안 바꾼다(배율 1). 반환값도 1을 넘지 않는다 — 원래보다 굵게 하지는 않는다.
 */

/** 굵기 400에서의 틈 가운데 굵어진 뒤에도 남길 몫. */
export const DEFAULT_COUNTER_KEEP = 0.5
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

/** 120° 넘게 돌아 마주 보는가(ㄹ 위 · 가운데 가로줄기, ㅇ 맞은편). */
function facing(p: Segment, q: Segment): boolean {
  const dot = (p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay)
  return dot < -0.5 * Math.hypot(p.bx - p.ax, p.by - p.ay) * Math.hypot(q.bx - q.ax, q.by - q.ay)
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

/** 두 토막 사이 거리와, 가장 가까운 두 자리를 각자 획 처음부터 잰 길이. */
function nearestBetween(p: Segment, q: Segment): { distance: number; atP: number; atQ: number } {
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

/**
 * 자소 하나의 굵기 배율 보정. 획 두께에 `weightMultiplier × 이 값`을 곱하면 속공간이 `keep`만큼 남는다.
 * `weightMultiplier ≤ 1`이거나 지킬 틈이 없으면 1.
 */
export function counterKeepScale(
  strokes: readonly CounterKeepStroke[],
  weightMultiplier: number,
  keep = DEFAULT_COUNTER_KEEP,
  stemScale = 1,
): number {
  if (!(weightMultiplier > 1) || strokes.length === 0) return 1
  const segments = segmentsOf(strokes, stemScale)
  const thickness = strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)]
  const minGap = thickness * MIN_GAP_RATIO
  const pairs: { p: Segment; q: Segment; distance: number; atP: number; atQ: number }[] = []
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) pairs.push({ p: segments[i], q: segments[j], ...nearestBetween(segments[i], segments[j]) })
  }
  let limit = weightMultiplier
  for (const { p, q, distance, atP, atQ } of pairs) {
    const halves = p.half + q.half
    const gap = distance - halves
    if (gap <= minGap) continue
    // 한 획 안에서 덜 돌았는데 곧 닿는 토막은 굽은 길의 이웃이다 — 틈이 아니다(ㅇ 둘레의 이웃 토막).
    // 되돌아와 마주 보는 토막(ㄹ 위 · 가운데 가로줄기, ㅇ 맞은편)이나 크게 돌아 다시 나란한 토막(ㄹ 위 · 아래)은 틈이다.
    if (p.stroke === q.stroke && !facing(p, q) && distance >= 0.5 * alongStroke(atP, atQ, p)) continue
    // 굵기 k에서 틈 = 거리 − k × 반 두께 합. 이게 keep × gap 아래로 안 가게.
    limit = Math.min(limit, (gap + halves - keep * gap) / halves)
  }
  return Math.min(1, Math.max(1, limit) / weightMultiplier)
}

/** 획 묶음의 두께를 배율대로 바꾼 사본. 배율이 1이면 받은 획 그대로. */
export function scaleStrokeThickness<T extends { stroke: StrokeDataV2 }>(item: T, scale: number): T {
  return scale === 1 ? item : { ...item, stroke: { ...item.stroke, thickness: item.stroke.thickness * scale } }
}
