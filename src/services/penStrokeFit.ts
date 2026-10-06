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
  /** 손떨림 거르기 창(0–1, 호 길이). 꺾임 사이 마디마다 이만큼의 이동 평균을 낸다. 0이면 안 거른다. */
  smoothing?: number
  thickness?: number
  id?: string
  /** 예각 꺾임을 둥글게 돌린다(기본 끔). 끝이 둥근 글씨에서 켠다 — 네모 끝 글씨는 그리기가 예각 이음을 평평하게 깎는다(`ACUTE_MITER_LIMIT`). */
  roundAcute?: boolean
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
/** 안정화 0–100(프로크리에이트 브러시의 안정화 숫자처럼). 100이면 호 길이 0.12 창으로 거른다. */
export const PEN_STABILIZATION_MAX_WINDOW = 0.12
/** 기본 안정화(10-05 사용자 — 50, 조절 없이 고정). */
export const PEN_STABILIZATION = 50
/** 손떨림 거르기 기본 창. */
export const PEN_SMOOTHING = PEN_STABILIZATION / 100 * PEN_STABILIZATION_MAX_WINDOW
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

/** 끝 갈고리로 보는 길이(0–1, 호 길이). 이 안에서 획 몸통의 선을 벗어나면 갈고리다. */
const HOOK_LENGTH = 0.06
/** 갈고리 끝이 몸통 선에서 이만큼 넘게 벗어나야 자른다(손떨림은 안 건드린다). */
const HOOK_MIN_OFFSET = 0.02
/** 몸통 선에서 이만큼 벗어나기 시작한 자리에서 자른다. */
const HOOK_CUT_OFFSET = 0.006
/** 시작과 끝이 이보다 가까우면 닫는 획으로 보고 갈고리를 안 자른다. */
const HOOK_CLOSED_GAP = 0.1
/** 또는 시작과 끝 사이가 획 크기(범위의 대각선)의 이 비율 안이고 한 바퀴 도는 꼴이면 닫으려던 획이다 — 손으로 그은 ㅇ은 끝이 덜 닿거나 지나친다. */
export const PEN_LOOSE_CLOSE_RATIO = 0.4
/** 한 바퀴 도는 꼴: 한쪽으로 돈 각의 합이 이만큼(도)은 되고, */
const LOOP_MIN_TURN = 240
/** 돈 각의 대부분(이 비율)이 같은 쪽이어야 한다. 갈지자로 꺾다가 고리를 지은 획은 이쪽저쪽으로 돌아 여기서 걸린다. */
const LOOP_ONE_WAY_RATIO = 0.75

/** 획을 굵게 다시 찍어(범위 대각선의 1/24 간격) 잰 돈 각의 합. 손떨림은 간격에 묻힌다. `signed`는 방향을 따져 더한 값, `total`은 크기만 더한 값(도). */
function turningOf(points: readonly PenPoint[], size: number): { signed: number; total: number } {
  const step = size / 24
  const coarse: PenPoint[] = [points[0]]
  for (const point of points) if (distance(coarse[coarse.length - 1], point) >= step) coarse.push(point)
  let signed = 0, total = 0
  for (let i = 1; i < coarse.length - 1; i++) {
    const a = subtract(coarse[i], coarse[i - 1]), b = subtract(coarse[i + 1], coarse[i])
    const turn = Math.atan2(a.x * b.y - a.y * b.x, dot(a, b)) * 180 / Math.PI
    signed += turn
    total += Math.abs(turn)
  }
  return { signed, total }
}

/**
 * 닫으려던 획(ㅇ · ㅁ)인지. 두 끝은 갈고리가 아니라 닫는 자리라 자르지도 옮기지도 않는다.
 * 끝이 거의 만났거나, 틈이 제 크기에 견줘 작으면서 한쪽으로 한 바퀴 도는 꼴일 때다. ㄱ · ㄷ처럼 벌어진 획은 틈이 커서, 갈지자로 꺾다가 고리를 지은 획은 한쪽으로만 돌지 않아서 안 든다.
 */
export function penClosesOnItself(points: readonly PenPoint[]): boolean {
  if (points.length < 3) return false
  const gap = distance(points[0], points[points.length - 1])
  if (gap < HOOK_CLOSED_GAP) return true
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y)
  const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  if (gap > size * PEN_LOOSE_CLOSE_RATIO) return false
  const { signed, total } = turningOf(points, size)
  return Math.abs(signed) >= LOOP_MIN_TURN && Math.abs(signed) >= total * LOOP_ONE_WAY_RATIO
}

/**
 * 펜을 대고 떼는 순간의 갈고리를 잘라 낸다. 남기면 끝 마디가 옆을 향해, 평평한 끝이 비스듬해지거나 꺾임 이음이 길게 뾰족해진다.
 * 끝에서 `HOOK_LENGTH` 안쪽 점을 그 바로 안쪽 몸통(같은 길이)의 현을 늘인 선과 견준다. 꺾임 검사와 상관없이 본다 — 짧은 갈고리는 꺾임으로 안 잡힌다.
 * 길이는 끝점에서 곧게 잰 거리다. 호 길이로 재면 펜을 대고 머뭇거린 떨림 · 나갔다 돌아온 갈고리가 길이를 다 써서 몸통을 못 찾는다.
 * 끝점이 몸통 선 위로 돌아와 있어도 그 사이에 벗어난 점이 있으면 갈고리다.
 */
export function trimPenHooks(points: readonly PenPoint[]): PenPoint[] {
  const arc = [0]
  for (let i = 1; i < points.length; i++) arc.push(arc[i - 1] + distance(points[i - 1], points[i]))
  const total = arc[arc.length - 1]
  if (total < HOOK_LENGTH * 3) return [...points]
  // 시작과 끝이 만나는 획(ㅇ · ㅁ)은 끝이 갈고리가 아니라 닫는 자리다.
  if (penClosesOnItself(points)) return [...points]
  /** `from` 끝에서 안쪽으로 걸어 자를 인덱스(그 점까지 남는다). 갈고리가 아니면 끝 그대로. */
  const cutFrom = (forward: boolean): number => {
    const end = forward ? 0 : points.length - 1
    const inward = forward ? 1 : -1
    const other = points.length - 1 - end
    const at = (length: number) => {
      let i = end
      while (i !== other && distance(points[i], points[end]) < length) i += inward
      return i
    }
    const bodyNear = at(HOOK_LENGTH)
    const bodyFar = at(HOOK_LENGTH * 2)
    const a = points[bodyFar], b = points[bodyNear]
    const length = distance(a, b)
    if (length === 0) return end
    const off = (p: PenPoint) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length
    let worst = 0
    for (let i = end; i !== bodyNear; i += inward) worst = Math.max(worst, off(points[i]))
    if (worst <= HOOK_MIN_OFFSET) return end
    for (let i = bodyNear; i !== end; i -= inward) if (off(points[i - inward]) > HOOK_CUT_OFFSET) return i
    return end
  }
  const first = cutFrom(true)
  const last = cutFrom(false)
  return last > first ? points.slice(first, last + 1) : [...points]
}

/**
 * 손떨림 거르기. 호 길이 `window` 창의 이동 평균을 두 번 낸다. 끝점은 그 자리에 두고, 끝에 가까울수록 창을 좁혀 획이 짧아지지 않게 한다.
 * 꺾임을 뭉개지 않도록 부르는 쪽이 꺾임 사이 마디마다 따로 부른다.
 */
export function smoothPenPoints(points: readonly PenPoint[], window: number): PenPoint[] {
  if (window <= 0 || points.length < 3) return points.map((point) => ({ ...point }))
  let current = points.map((point) => ({ ...point }))
  for (let pass = 0; pass < 2; pass++) {
    const arc = [0]
    for (let i = 1; i < current.length; i++) arc.push(arc[i - 1] + distance(current[i - 1], current[i]))
    const total = arc[arc.length - 1]
    const next = current.map((point) => ({ ...point }))
    let lo = 0, hi = 0
    for (let i = 1; i < current.length - 1; i++) {
      const half = Math.min(window / 2, arc[i], total - arc[i])
      while (arc[lo] < arc[i] - half) lo++
      while (hi + 1 < current.length && arc[hi + 1] <= arc[i] + half) hi++
      let sx = 0, sy = 0
      for (let j = lo; j <= hi; j++) { sx += current[j].x; sy += current[j].y }
      next[i] = { x: sx / (hi - lo + 1), y: sy / (hi - lo + 1) }
    }
    current = next
  }
  return current
}

/**
 * `points[end]`를 그 끝에서 `window`의 반 · 하나만큼 안쪽 점 둘을 잇는 선 위로 옮긴다(선에 수직으로 내린 자리). `limit`은 끝이 속한 마디의 반대쪽 끝.
 * 마디가 `window`의 두 배보다 짧으면 그대로 둔다.
 * 안쪽 점은 끝점에서 곧게 잰 거리로 고른다 — 펜을 대고 머뭇거린 떨림이 호 길이를 다 써 버리면 두 점이 한자리에 잡혀 끝이 엉뚱한 데로 접힌다.
 */
function settlePenEnd(points: PenPoint[], end: number, limit: number, window: number): void {
  const step = end === 0 ? 1 : -1
  let near = -1
  let far = -1
  for (let i = end; i !== limit; i += step) {
    const length = distance(points[end], points[i + step])
    if (near < 0 && length >= window / 2) near = i + step
    if (length >= window) { far = i + step; break }
  }
  if (near < 0 || far < 0 || distance(points[near], points[far]) < window / 4) return
  let rest = 0
  for (let i = far; i !== limit; i += step) rest += distance(points[i], points[i + step])
  if (rest < window) return
  const direction = normalize(subtract(points[near], points[far]))
  const along = dot(subtract(points[end], points[near]), direction)
  points[end] = add(points[near], scale(direction, along))
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
    const before = points[spanIndex(points, i, -1, span)]
    const after = points[spanIndex(points, i, 1, span)]
    // 끝에 닿아 짧은 벡터로 재면 떨림이 큰 각이 된다. 양쪽이 span의 반은 돼야 잰다 — 끝에서 그만큼 안쪽 꺾임은 못 잡는다.
    if (distance(before, points[i]) < span / 2 || distance(after, points[i]) < span / 2) continue
    const back = normalize(subtract(points[i], before))
    const forward = normalize(subtract(after, points[i]))
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

function fitCubic(points: readonly PenPoint[], first: number, last: number, tHat1: PenPoint, tHat2: PenPoint, epsilon: number, out: Segment[], whole = true): void {
  const p0 = points[first]
  const p3 = points[last]
  if (last - first < 1) return
  // 꺾임 사이 마디 전체가 직선으로 충분하면 직선. 손으로 그은 가로 · 세로가 곡선이 되지 않게.
  // 곡선을 쪼갠 조각은 직선으로 두지 않는다 — 이웃 곡선과 방향이 어긋나 둥근 획(ㅇ)에 모가 난다.
  let straight = 0
  for (let i = first + 1; i < last; i++) straight = Math.max(straight, distanceToSegment(points[i], p0, p3))
  if (whole && (straight <= epsilon || last - first === 1)) {
    out.push({ p0, p3 })
    return
  }
  if (last - first === 1) {
    const third = distance(p0, p3) / 3
    out.push({ p0, p1: add(p0, scale(tHat1, third)), p2: add(p3, scale(tHat2, third)), p3 })
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
  fitCubic(points, first, split, tHat1, tangent, epsilon, out, false)
  fitCubic(points, split, last, scale(tangent, -1), tHat2, epsilon, out, false)
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

/** 이보다 크게 꺾이면(도, 방향 변화) 예각이다 — 안쪽 각이 75도보다 좁다. 손으로 그은 직각은 10도쯤 흔들려 여유를 둔다. */
const ACUTE_TURN = 105
/** 둥글린 자리에서 꺾임점까지의 거리는 옆 마디의 이 비율을 넘지 않는다. */
const ROUND_MAX_SHARE = 0.4
/** 둥글린 호의 핸들 길이(꺾임점까지 거리의 비율). 0.55면 직각 호가 원에 가깝다. */
const ROUND_HANDLE = 0.55

/**
 * 예각으로 꺾인 앵커를 둥글게 돌린다 — 끝이 둥근 글씨에서 갈지자처럼 접히는 자리를 실제 펜처럼 둥글게(10-06 사용자 결정: 끝 모양 따라가기). ㄱ 같은 직각은 그대로다.
 * 꺾임점을 떼고 양옆 마디 위 두 점을 핸들이 꺾임점 쪽을 향하는 호로 잇는다. 반지름은 굵기만큼(마디가 짧으면 그만큼 줄인다).
 */
function roundAcuteCorners(anchors: readonly AnchorPoint[], cornerAt: ReadonlySet<string>, radius: number): AnchorPoint[] {
  const key = (point: PenPoint) => `${point.x},${point.y}`
  const out: AnchorPoint[] = []
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    const prev = out[out.length - 1]
    const next = anchors[i + 1]
    if (!prev || !next || !cornerAt.has(key(anchor))) { out.push({ ...anchor }); continue }
    // 들어오는 · 나가는 방향은 핸들이 있으면 핸들로, 없으면 옆 앵커로 잰다.
    const toPrev = normalize(subtract(anchor.handleIn ?? prev, anchor))
    const toNext = normalize(subtract(anchor.handleOut ?? next, anchor))
    const turn = 180 - Math.acos(Math.max(-1, Math.min(1, dot(toPrev, toNext)))) * 180 / Math.PI
    if (turn <= ACUTE_TURN) { out.push({ ...anchor }); continue }
    const inner = (180 - turn) * Math.PI / 180
    const wanted = radius * Math.tan(Math.PI / 2 - inner / 2)
    const d = Math.min(wanted, distance(anchor, prev) * ROUND_MAX_SHARE, distance(anchor, next) * ROUND_MAX_SHARE)
    if (!(d > 0)) { out.push({ ...anchor }); continue }
    const a: AnchorPoint = add(anchor, scale(toPrev, d))
    const b: AnchorPoint = add(anchor, scale(toNext, d))
    // 들어오던 곡선의 접선은 지키고 길이만 줄인다.
    if (anchor.handleIn) a.handleIn = add(a, scale(subtract(anchor.handleIn, anchor), 0.7))
    if (anchor.handleOut) b.handleOut = add(b, scale(subtract(anchor.handleOut, anchor), 0.7))
    a.handleOut = add(a, scale(subtract(anchor, a), ROUND_HANDLE))
    b.handleIn = add(b, scale(subtract(anchor, b), ROUND_HANDLE))
    out.push(a, b)
  }
  return out
}

/** 획을 촘촘한 점으로 편다 — 이탈 거리 재기용. 96조각이면 꺾은선 오차가 ε의 1/1000 아래다. */
function sampleStroke(points: readonly AnchorPoint[], steps = 96): PenPoint[] {
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

/** 그은 점들이 맞춘 획에서 벗어난 최대 거리(0–1). 곡선은 96조각으로 펴서 잰다. */
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
/** 꺾임을 찾고 꺾임 사이 마디마다 손떨림을 거른다. 맞춤과 긋는 중 미리보기가 같이 쓴다. */
function smoothBetweenCorners(raw: readonly PenPoint[], options: PenFitOptions): { thinned: PenPoint[]; corners: number[]; breaks: number[]; window: number } {
  const span = options.cornerSpan ?? DEFAULT_CORNER_SPAN
  // 꺾임은 꺾임 재는 거리만큼만 살짝 거른 점에서 찾는다 — 손떨림이 가짜 꺾임으로 잡히지 않고, ㄱ의 모서리는 그대로 잡힌다.
  const corners = penCornerIndices(smoothPenPoints(raw, span), options.cornerAngle ?? PEN_CORNER_ANGLE, span)
  const breaks = [0, ...corners, raw.length - 1]
  // 꺾임 사이 마디만 세게 거른다 — 모서리는 날카롭게 남는다.
  const window = options.smoothing ?? PEN_SMOOTHING
  const thinned = raw.map((point) => ({ ...point }))
  for (let i = 0; i < breaks.length - 1; i++) {
    const smoothed = smoothPenPoints(raw.slice(breaks[i], breaks[i + 1] + 1), window)
    smoothed.forEach((point, k) => { thinned[breaks[i] + k] = point })
  }
  return { thinned, corners, breaks, window }
}

/**
 * 긋는 중에 보여 줄 선. 손떨림만 거른 점을 그대로 돌려준다 — 곡선 맞춤은 하지 않는다.
 * 맞춤은 점이 늘 때마다 조각을 새로 나눠, 긋는 내내 다시 맞추면 이미 지나온 곡선이 계속 흔들린다(둥근 획에서 칸의 8%까지).
 * 거르기는 가까운 점끼리만 보므로 지나온 부분은 그대로 서 있고 펜 끝 근처만 따라 바뀐다. 갈고리 자르기 · 끝점 정리도 손을 뗄 때만 한다.
 */
export function stabilizePenPoints(points: readonly PenPoint[], options: PenFitOptions = {}): PenPoint[] {
  const raw = thinPenPoints(points, options.minGap ?? DEFAULT_MIN_GAP)
  return raw.length < 3 ? raw : smoothBetweenCorners(raw, options).thinned
}

export function fitPenStroke(points: readonly PenPoint[], options: PenFitOptions = {}): PenFitResult | null {
  const epsilon = options.epsilon ?? PEN_FIT_EPSILON
  const span = options.cornerSpan ?? DEFAULT_CORNER_SPAN
  const raw = trimPenHooks(thinPenPoints(points, options.minGap ?? DEFAULT_MIN_GAP))
  if (raw.length < 2) return null
  const { thinned, corners, breaks, window } = smoothBetweenCorners(raw, options)
  // 획의 두 끝(꺾임 말고)은 거른 몸통이 향하는 선 위로 옮긴다. 끝점만 손떨림 그대로 남아 끝이 휘는 것을 막는다.
  // 닫는 획(ㅇ · ㅁ)은 두 끝이 만나야 하므로 그대로 둔다.
  if (!penClosesOnItself(raw)) {
    settlePenEnd(thinned, 0, breaks[1], window)
    settlePenEnd(thinned, thinned.length - 1, breaks[breaks.length - 2], window)
  }
  const segments: Segment[] = []
  for (let i = 0; i < breaks.length - 1; i++) {
    const first = breaks[i]
    const last = breaks[i + 1]
    if (last <= first) continue
    const tHat1 = endTangent(thinned.slice(first, last + 1), 0, 1, span)
    const tHat2 = endTangent(thinned.slice(first, last + 1), last - first, -1, span)
    fitCubic(thinned, first, last, tHat1, tHat2, epsilon, segments)
  }
  const fitted = segmentsToAnchors(segments)
  if (fitted.length < 2) return null
  const thickness = options.thickness ?? DEFAULT_THICKNESS
  const anchors = options.roundAcute ? roundAcuteCorners(fitted, new Set(corners.map((index) => `${thinned[index].x},${thinned[index].y}`)), thickness) : fitted
  const stroke: StrokeDataV2 = {
    id: options.id ?? `stroke-${Date.now()}`,
    points: anchors,
    closed: false,
    thickness,
  }
  return { stroke, corners, pointCount: thinned.length, anchorCount: anchors.length, maxDeviation: penFitDeviation(thinned, stroke) }
}
