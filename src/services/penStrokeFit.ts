import type { AnchorPoint, StrokeDataV2 } from '../types'

/**
 * 펜으로 그은 점들 → 중심선 획(`StrokeDataV2`).
 *
 * 세 단계로 간다(플랜 2026-10-05 펜으로 획 그리기).
 * 1. 가까운 점 합치기 — 펜이 멈춘 자리의 겹친 점을 뺀다.
 * 2. 꺾임점 찾기 — 앞뒤 `cornerSpan`만큼 떨어진 점으로 방향 변화를 재서 떨림은 넘기고 ㄱ 같은 꺾임만 잡는다.
 * 3. 꺾임점 사이를 직선 또는 3차 베지어로 맞춤 — 허용오차 `epsilon`을 넘으면 가장 먼 점에서 쪼개 다시 맞춘다(Schneider 방식).
 *
 * 한 번 긋기는 획 하나다. 꺾임에서 획을 나누지 않는다(D0, 사용자 결정). 좌표는 전부 0–1 정규화.
 * `contourSimplify.ts`(내보내기 윤곽 Douglas-Peucker)와는 다른 일이라 따로 둔다.
 */

export interface PenPoint {
  x: number
  y: number
}

export interface PenFitOptions {
  /** 곡선 맞춤 허용오차(0–1). 그은 점이 맞춘 선에서 이만큼 넘게 벗어나지 않는다. */
  epsilon?: number
  /** 꺾임으로 보는 방향 변화(도). */
  cornerAngle?: number
  /** 이보다 가까운 점은 하나로 본다(0–1). */
  minGap?: number
  /** 꺾임 각을 잴 때 앞뒤로 보는 거리(0–1). 펜 떨림을 걸러 준다. */
  cornerSpan?: number
  thickness?: number
  id?: string
}

export interface PenFitResult {
  stroke: StrokeDataV2
  /** 정리한 점 가운데 꺾임으로 잡은 인덱스. */
  corners: number[]
  /** 정리한 뒤 남은 점 수. */
  pointCount: number
  anchorCount: number
  /** 정리한 점이 맞춘 선에서 벗어난 최대 거리(0–1). */
  maxDeviation: number
}

/** 기본 허용오차. G0에서 정한다 — 후보는 `PEN_FIT_EPSILON_CANDIDATES`. */
export const PEN_FIT_EPSILON = 0.01
export const PEN_FIT_EPSILON_CANDIDATES = [0.005, 0.01, 0.02] as const
export const PEN_CORNER_ANGLE = 60
const DEFAULT_MIN_GAP = 0.004
const DEFAULT_CORNER_SPAN = 0.03
const DEFAULT_THICKNESS = 0.07
/** 맞춤이 허용오차의 이 배수 안이면 쪼개지 않고 매개변수를 다시 잡아 본다. */
const REPARAM_TOLERANCE_RATIO = 4
const REPARAM_ITERATIONS = 4

const distance = (a: PenPoint, b: PenPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const subtract = (a: PenPoint, b: PenPoint): PenPoint => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: PenPoint, k: number): PenPoint => ({ x: a.x * k, y: a.y * k })
const add = (a: PenPoint, b: PenPoint): PenPoint => ({ x: a.x + b.x, y: a.y + b.y })
const dot = (a: PenPoint, b: PenPoint) => a.x * b.x + a.y * b.y
function normalize(v: PenPoint): PenPoint {
  const length = Math.hypot(v.x, v.y)
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length }
}

/** 점에서 선분까지 거리. */
function distanceToSegment(p: PenPoint, a: PenPoint, b: PenPoint): number {
  const ab = subtract(b, a)
  const length2 = dot(ab, ab)
  if (length2 === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, dot(subtract(p, a), ab) / length2))
  return distance(p, add(a, scale(ab, t)))
}

/** 1단계. 가까운 점을 합친다. 끝점은 가까워도 남긴다 — 획의 끝이 그 자리다. */
export function thinPenPoints(points: readonly PenPoint[], minGap = DEFAULT_MIN_GAP): PenPoint[] {
  const kept: PenPoint[] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (kept.length === 0 || distance(kept[kept.length - 1], point) >= minGap) kept.push({ x: point.x, y: point.y })
  }
  const last = points[points.length - 1]
  if (last && kept.length > 0 && Number.isFinite(last.x) && Number.isFinite(last.y)) {
    const tail = kept[kept.length - 1]
    if (tail.x !== last.x || tail.y !== last.y) {
      if (kept.length >= 2) kept[kept.length - 1] = { x: last.x, y: last.y }
      else kept.push({ x: last.x, y: last.y })
    }
  }
  return kept
}

/** `i`에서 `span`만큼 떨어진 앞(-1) · 뒤(+1) 점의 인덱스. 끝에 닿으면 끝. */
function spanIndex(points: readonly PenPoint[], i: number, direction: -1 | 1, span: number): number {
  let j = i + direction
  while (j > 0 && j < points.length - 1 && distance(points[j], points[i]) < span) j += direction
  return Math.max(0, Math.min(points.length - 1, j))
}

/** 2단계. 꺾임점 인덱스. 앞뒤 `span` 거리의 방향 차가 `angleDeg` 이상인 자리에서 가장 많이 꺾인 점 하나씩. */
export function penCornerIndices(points: readonly PenPoint[], angleDeg = PEN_CORNER_ANGLE, span = DEFAULT_CORNER_SPAN): number[] {
  const count = points.length
  if (count < 3) return []
  const limit = (angleDeg * Math.PI) / 180
  const turn = new Array<number>(count).fill(0)
  for (let i = 1; i < count - 1; i++) {
    const back = normalize(subtract(points[i], points[spanIndex(points, i, -1, span)]))
    const forward = normalize(subtract(points[spanIndex(points, i, 1, span)], points[i]))
    if ((back.x === 0 && back.y === 0) || (forward.x === 0 && forward.y === 0)) continue
    turn[i] = Math.acos(Math.max(-1, Math.min(1, dot(back, forward))))
  }
  const corners: number[] = []
  let i = 1
  while (i < count - 1) {
    if (turn[i] < limit) { i++; continue }
    let best = i
    let j = i
    while (j < count - 1 && turn[j] >= limit) {
      if (turn[j] > turn[best]) best = j
      j++
    }
    corners.push(best)
    i = j
  }
  return corners
}

// ===== 3단계. 구간 맞춤 =====

/** 맞춘 조각. 제어점이 없으면 직선. */
interface Segment {
  p0: PenPoint
  p1?: PenPoint
  p2?: PenPoint
  p3: PenPoint
}

function bezierAt(p0: PenPoint, p1: PenPoint, p2: PenPoint, p3: PenPoint, t: number): PenPoint {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

/** 현 길이 매개변수(0–1). */
function chordParameters(points: readonly PenPoint[], first: number, last: number): number[] {
  const u = [0]
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + distance(points[i], points[i - 1]))
  const total = u[u.length - 1]
  return total === 0 ? u.map((_, i) => i / Math.max(1, u.length - 1)) : u.map((value) => value / total)
}

/** 양 끝 접선 방향을 두고 제어점 거리(alpha)만 최소제곱으로 푼다. */
function generateBezier(points: readonly PenPoint[], first: number, last: number, u: readonly number[], tHat1: PenPoint, tHat2: PenPoint): [PenPoint, PenPoint, PenPoint, PenPoint] {
  const p0 = points[first]
  const p3 = points[last]
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
  for (let i = 0; i <= last - first; i++) {
    const t = u[i]
    const s = 1 - t
    const b1 = 3 * s * s * t
    const b2 = 3 * s * t * t
    const a1 = scale(tHat1, b1)
    const a2 = scale(tHat2, b2)
    c00 += dot(a1, a1)
    c01 += dot(a1, a2)
    c11 += dot(a2, a2)
    const base = { x: p0.x * (s * s * s + b1) + p3.x * (b2 + t * t * t), y: p0.y * (s * s * s + b1) + p3.y * (b2 + t * t * t) }
    const diff = subtract(points[first + i], base)
    x0 += dot(a1, diff)
    x1 += dot(a2, diff)
  }
  const det = c00 * c11 - c01 * c01
  let alpha1 = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det
  let alpha2 = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det
  const chord = distance(p0, p3)
  const tiny = 1e-6 * chord
  // 풀이가 무너지면(음수 · 너무 작음) 현의 1/3로 둔다 — Schneider의 보루.
  if (!Number.isFinite(alpha1) || !Number.isFinite(alpha2) || alpha1 < tiny || alpha2 < tiny) {
    alpha1 = chord / 3
    alpha2 = chord / 3
  }
  return [p0, add(p0, scale(tHat1, alpha1)), add(p3, scale(tHat2, alpha2)), p3]
}

/** 가장 먼 점의 거리²와 인덱스. */
function maxBezierError(points: readonly PenPoint[], first: number, last: number, bezier: [PenPoint, PenPoint, PenPoint, PenPoint], u: readonly number[]): { error2: number; split: number } {
  let error2 = 0
  let split = Math.floor((last - first + 1) / 2) + first
  for (let i = first + 1; i < last; i++) {
    const on = bezierAt(bezier[0], bezier[1], bezier[2], bezier[3], u[i - first])
    const diff = subtract(on, points[i])
    const d2 = dot(diff, diff)
    if (d2 > error2) { error2 = d2; split = i }
  }
  return { error2, split }
}

/** 뉴턴-랩슨으로 매개변수를 한 번 더 잡는다. */
function reparameterize(points: readonly PenPoint[], first: number, u: readonly number[], bezier: [PenPoint, PenPoint, PenPoint, PenPoint]): number[] {
  const [p0, p1, p2, p3] = bezier
  return u.map((t, i) => {
    const point = points[first + i]
    const q = bezierAt(p0, p1, p2, p3, t)
    // 1차 · 2차 도함수
    const d1 = {
      x: 3 * ((1 - t) * (1 - t) * (p1.x - p0.x) + 2 * (1 - t) * t * (p2.x - p1.x) + t * t * (p3.x - p2.x)),
      y: 3 * ((1 - t) * (1 - t) * (p1.y - p0.y) + 2 * (1 - t) * t * (p2.y - p1.y) + t * t * (p3.y - p2.y)),
    }
    const d2 = {
      x: 6 * ((1 - t) * (p2.x - 2 * p1.x + p0.x) + t * (p3.x - 2 * p2.x + p1.x)),
      y: 6 * ((1 - t) * (p2.y - 2 * p1.y + p0.y) + t * (p3.y - 2 * p2.y + p1.y)),
    }
    const diff = subtract(q, point)
    const numerator = dot(diff, d1)
    const denominator = dot(d1, d1) + dot(diff, d2)
    if (denominator === 0) return t
    const next = t - numerator / denominator
    return Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : t
  })
}

/** 쪼갠 자리의 접선. 앞뒤 점의 방향을 평균해 두 조각이 매끈하게 이어진다. */
function centerTangent(points: readonly PenPoint[], center: number): PenPoint {
  const v1 = subtract(points[center - 1], points[center])
  const v2 = subtract(points[center], points[center + 1])
  return normalize({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 })
}

/** 끝점의 접선. 떨림을 피하려고 `span`만큼 떨어진 점을 본다. */
function endTangent(points: readonly PenPoint[], index: number, direction: -1 | 1, span: number): PenPoint {
  const target = spanIndex(points, index, direction, span)
  const tangent = normalize(subtract(points[target], points[index]))
  return tangent.x === 0 && tangent.y === 0 ? normalize(subtract(points[index + direction], points[index])) : tangent
}

function fitCubic(points: readonly PenPoint[], first: number, last: number, tHat1: PenPoint, tHat2: PenPoint, epsilon: number, out: Segment[]): void {
  const p0 = points[first]
  const p3 = points[last]
  if (last - first < 1) return
  // 직선으로 충분하면 직선. 손으로 그은 가로 · 세로가 곡선이 되지 않게.
  let straight = 0
  for (let i = first + 1; i < last; i++) straight = Math.max(straight, distanceToSegment(points[i], p0, p3))
  if (straight <= epsilon || last - first === 1) {
    out.push({ p0, p3 })
    return
  }
  let u = chordParameters(points, first, last)
  let bezier = generateBezier(points, first, last, u, tHat1, tHat2)
  let { error2, split } = maxBezierError(points, first, last, bezier, u)
  const epsilon2 = epsilon * epsilon
  if (error2 <= epsilon2) {
    out.push({ p0, p1: bezier[1], p2: bezier[2], p3 })
    return
  }
  if (error2 <= epsilon2 * REPARAM_TOLERANCE_RATIO * REPARAM_TOLERANCE_RATIO) {
    for (let i = 0; i < REPARAM_ITERATIONS; i++) {
      u = reparameterize(points, first, u, bezier)
      bezier = generateBezier(points, first, last, u, tHat1, tHat2)
      ;({ error2, split } = maxBezierError(points, first, last, bezier, u))
      if (error2 <= epsilon2) {
        out.push({ p0, p1: bezier[1], p2: bezier[2], p3 })
        return
      }
    }
  }
  // 가장 먼 점에서 쪼갠다. 끝에 붙은 쪼갬은 안쪽으로 한 칸.
  split = Math.max(first + 1, Math.min(last - 1, split))
  const tangent = centerTangent(points, split)
  fitCubic(points, first, split, tHat1, tangent, epsilon, out)
  fitCubic(points, split, last, scale(tangent, -1), tHat2, epsilon, out)
}

function segmentsToAnchors(segments: readonly Segment[]): AnchorPoint[] {
  if (segments.length === 0) return []
  const anchors: AnchorPoint[] = [{ x: segments[0].p0.x, y: segments[0].p0.y }]
  for (const segment of segments) {
    const tail = anchors[anchors.length - 1]
    const next: AnchorPoint = { x: segment.p3.x, y: segment.p3.y }
    if (segment.p1 && segment.p2) {
      tail.handleOut = { x: segment.p1.x, y: segment.p1.y }
      next.handleIn = { x: segment.p2.x, y: segment.p2.y }
    }
    anchors.push(next)
  }
  return anchors
}

/** 획을 촘촘한 점으로 편다 — 이탈 거리 재기용. */
function sampleStroke(points: readonly AnchorPoint[], steps = 32): PenPoint[] {
  const sampled: PenPoint[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.handleOut && b.handleIn) {
      for (let s = 0; s < steps; s++) sampled.push(bezierAt(a, a.handleOut, b.handleIn, b, s / steps))
    } else {
      sampled.push({ x: a.x, y: a.y })
    }
  }
  const last = points[points.length - 1]
  if (last) sampled.push({ x: last.x, y: last.y })
  return sampled
}

/** 그은 점들이 맞춘 획에서 벗어난 최대 거리(0–1). 곡선은 32조각으로 펴서 잰다. */
export function penFitDeviation(points: readonly PenPoint[], stroke: Pick<StrokeDataV2, 'points'>): number {
  const sampled = sampleStroke(stroke.points)
  if (sampled.length < 2) return points.length === 0 ? 0 : Infinity
  let worst = 0
  for (const point of points) {
    let best = Infinity
    for (let i = 0; i < sampled.length - 1; i++) best = Math.min(best, distanceToSegment(point, sampled[i], sampled[i + 1]))
    worst = Math.max(worst, best)
  }
  return worst
}

/**
 * 펜으로 그은 점들을 획 하나로. 점이 둘 미만이면(톡 찍기만 하면) null.
 * 돌려주는 `maxDeviation`은 정리한 점 기준이다 — 합쳐서 뺀 점은 `minGap` 안이라 그만큼은 더 벗어날 수 있다.
 */
export function fitPenStroke(points: readonly PenPoint[], options: PenFitOptions = {}): PenFitResult | null {
  const epsilon = options.epsilon ?? PEN_FIT_EPSILON
  const span = options.cornerSpan ?? DEFAULT_CORNER_SPAN
  const thinned = thinPenPoints(points, options.minGap ?? DEFAULT_MIN_GAP)
  if (thinned.length < 2) return null
  const corners = penCornerIndices(thinned, options.cornerAngle ?? PEN_CORNER_ANGLE, span)
  const breaks = [0, ...corners, thinned.length - 1]
  const segments: Segment[] = []
  for (let i = 0; i < breaks.length - 1; i++) {
    const first = breaks[i]
    const last = breaks[i + 1]
    if (last <= first) continue
    const tHat1 = endTangent(thinned.slice(first, last + 1), 0, 1, span)
    const tHat2 = endTangent(thinned.slice(first, last + 1), last - first, -1, span)
    fitCubic(thinned, first, last, tHat1, tHat2, epsilon, segments)
  }
  const anchors = segmentsToAnchors(segments)
  if (anchors.length < 2) return null
  const stroke: StrokeDataV2 = {
    id: options.id ?? `stroke-${Date.now()}`,
    points: anchors,
    closed: false,
    thickness: options.thickness ?? DEFAULT_THICKNESS,
  }
  return { stroke, corners, pointCount: thinned.length, anchorCount: anchors.length, maxDeviation: penFitDeviation(thinned, stroke) }
}
