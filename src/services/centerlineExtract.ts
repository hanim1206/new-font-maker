import type { MultiPolygon } from './polygonBoolean'
import type { AnchorPoint, BoxConfig, DeepReadonly, JamoData, MedialFamily, StrokeDataV2 } from '../types'
import { fitNotoComponent } from './notoComponentFit'
import type { ComponentFaces } from './notoComponentFit'
import { normalizeSkeleton } from './skeletonFit'

/**
 * 결정적 중심선 추출. xor 최적화 루프 대신, 씨앗 골격을 문맥 상자에 놓고 획을 따라가며
 * 법선 방향으로 Noto 잉크 구간을 찾아 그 중점을 잇는다(국소 중심선). 다각형 Boolean이 없어
 * 자모당 수십 ms이고 멈출 데가 없다. 앵커 수·획 수는 씨앗 그대로, 곡률은 3차 곡선 최소제곱으로 핸들에 담는다.
 */

type Pt = { x: number; y: number }
type Ring = readonly (readonly [number, number])[]

const SAMPLES_PER_SEGMENT = 14
const EPSILON = 1e-9

function ringsOf(ghost: MultiPolygon): Ring[] {
  return ghost.flatMap((polygon) => polygon.map((ring) => ring as Ring))
}

/** 홀수 규칙. 구멍 링도 같은 규칙으로 뒤집힌다. */
export function insideInk(point: Pt, rings: readonly Ring[]): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j]
      if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/**
 * origin에서 dir 방향으로 ±halfLen 선분이 잉크와 겹치는 구간들(t 파라미터, −halfLen..halfLen).
 * 링 변과의 교차 t를 모아 정렬하고, 시작점의 안/밖으로 토글한다.
 */
export function inkIntervalsAlong(origin: Pt, dir: Pt, halfLen: number, rings: readonly Ring[]): { from: number; to: number }[] {
  const a = { x: origin.x - dir.x * halfLen, y: origin.y - dir.y * halfLen }
  const dx = dir.x * halfLen * 2, dy = dir.y * halfLen * 2
  const crossings: number[] = []
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i]
      const ex = x2 - x1, ey = y2 - y1
      const denom = dx * ey - dy * ex
      if (Math.abs(denom) < EPSILON) continue
      const t = ((x1 - a.x) * ey - (y1 - a.y) * ex) / denom
      const u = ((x1 - a.x) * dy - (y1 - a.y) * dx) / denom
      if (t >= 0 && t <= 1 && u >= 0 && u < 1) crossings.push(t)
    }
  }
  crossings.sort((p, q) => p - q)
  let inside = insideInk(a, rings)
  const intervals: { from: number; to: number }[] = []
  let start = 0
  for (const t of crossings) {
    if (inside) intervals.push({ from: start * halfLen * 2 - halfLen, to: t * halfLen * 2 - halfLen })
    inside = !inside
    start = t
  }
  if (inside) intervals.push({ from: start * halfLen * 2 - halfLen, to: halfLen })
  return intervals.filter((interval) => interval.to - interval.from > EPSILON)
}

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t
  return { x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x, y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y }
}

function bezierTangent(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const x = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x)
  const y = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  const len = Math.hypot(x, y)
  if (len > EPSILON) return { x: x / len, y: y / len }
  const c = { x: p3.x - p0.x, y: p3.y - p0.y }
  const cl = Math.hypot(c.x, c.y) || 1
  return { x: c.x / cl, y: c.y / cl }
}

interface Segment { p0: Pt; p1: Pt; p2: Pt; p3: Pt }

function segmentsOf(points: readonly AnchorPoint[], closed: boolean): Segment[] {
  const count = closed ? points.length : points.length - 1
  return Array.from({ length: count }, (_, i) => {
    const a = points[i], b = points[(i + 1) % points.length]
    return { p0: a, p1: a.handleOut ?? a, p2: b.handleIn ?? b, p3: b }
  })
}

const toEm = (p: Pt, box: BoxConfig): Pt => ({ x: box.x + p.x * box.width, y: box.y + p.y * box.height })

/** 점에서 폴리라인까지 거리. 획 소유권 판정용. */
function distanceToPolyline(point: Pt, line: readonly Pt[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1], b = line[i]
    const vx = b.x - a.x, vy = b.y - a.y
    const len2 = vx * vx + vy * vy
    const t = len2 > EPSILON ? Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / len2)) : 0
    best = Math.min(best, Math.hypot(point.x - (a.x + vx * t), point.y - (a.y + vy * t)))
  }
  return best
}

/**
 * 곡선 위 한 점에서 법선으로 찔러 "내 획"의 잉크 중점을 찾는다.
 * 구간 중점이 다른 획의 현재 중심선에 더 가까우면 그 구간은 남의 잉크다(교차·근접 획 배제).
 * 두께 2배 넘는 구간이 씨앗 점을 덮으면 교차부다 — 씨앗 점을 그대로 둔다(정보 없음, 앵커 흘러가지 않게).
 */
function snapToOwnInk(point: Pt, tangent: Pt, thickness: number, rings: readonly Ring[], polylines: readonly (readonly Pt[])[], self: number, reach: number): { point: Pt; width: number | null } | null {
  const normal = { x: -tangent.y, y: tangent.x }
  const intervals = inkIntervalsAlong(point, normal, thickness * reach, rings)
  let best: { mid: number; width: number } | null = null
  let junction = false
  for (const interval of intervals) {
    const mid = (interval.from + interval.to) / 2
    const width = interval.to - interval.from
    if (width > thickness * 2.2) { if (interval.from <= 0 && interval.to >= 0) junction = true; continue }
    if (width < thickness * 0.3) continue
    const candidate = { x: point.x + normal.x * mid, y: point.y + normal.y * mid }
    const mine = distanceToPolyline(candidate, polylines[self])
    const owner = polylines.reduce((winner, line, index) => (index !== self && distanceToPolyline(candidate, line) < mine - 1e-9 ? index : winner), self)
    if (owner !== self) continue
    if (!best || Math.abs(mid) < Math.abs(best.mid)) best = { mid, width }
  }
  if (best) return { point: { x: point.x + normal.x * best.mid, y: point.y + normal.y * best.mid }, width: best.width }
  return junction ? { point: { ...point }, width: null } : null
}

/** 양 끝 고정 3차 곡선 최소제곱. 현 길이 파라미터. 점이 2개면 직선. */
export function fitCubic(samples: readonly Pt[], p0: Pt, p3: Pt): { p1: Pt; p2: Pt } {
  if (samples.length < 3) return { p1: { ...p0 }, p2: { ...p3 } }
  const lengths = [0]
  for (let i = 1; i < samples.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y))
  const total = lengths[lengths.length - 1] || 1
  let a11 = 0, a12 = 0, a22 = 0, rx1 = 0, ry1 = 0, rx2 = 0, ry2 = 0
  samples.forEach((s, i) => {
    const t = lengths[i] / total, u = 1 - t
    const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t
    a11 += b1 * b1; a12 += b1 * b2; a22 += b2 * b2
    const cx = s.x - b0 * p0.x - b3 * p3.x, cy = s.y - b0 * p0.y - b3 * p3.y
    rx1 += b1 * cx; ry1 += b1 * cy; rx2 += b2 * cx; ry2 += b2 * cy
  })
  const det = a11 * a22 - a12 * a12
  if (Math.abs(det) < 1e-12) return { p1: { ...p0 }, p2: { ...p3 } }
  return {
    p1: { x: (a22 * rx1 - a12 * rx2) / det, y: (a22 * ry1 - a12 * ry2) / det },
    p2: { x: (a11 * rx2 - a12 * rx1) / det, y: (a11 * ry2 - a12 * ry1) / det },
  }
}

/** 곡선이 현에서 얼마나 벗어나는지(최대). 이보다 작으면 직선으로 저장한다. */
function chordDeviation(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  const cx = p3.x - p0.x, cy = p3.y - p0.y
  const len = Math.hypot(cx, cy) || 1
  let worst = 0
  for (let i = 1; i < 8; i += 1) {
    const p = bezier(p0, p1, p2, p3, i / 8)
    worst = Math.max(worst, Math.abs((p.x - p0.x) * cy - (p.y - p0.y) * cx) / len)
  }
  return worst
}

/** 잉크 경계까지 접선 방향으로 끝점을 민다(또는 잉크 밖이면 당긴다). butt 끝이라 중심선은 잉크 끝에서 끝난다. */
function slideToBoundary(point: Pt, outward: Pt, thickness: number, rings: readonly Ring[]): Pt {
  const step = thickness / 8
  let current = { ...point }
  if (insideInk(current, rings)) {
    for (let i = 0; i < 40; i += 1) {
      const next = { x: current.x + outward.x * step, y: current.y + outward.y * step }
      if (!insideInk(next, rings)) break
      current = next
    }
  } else {
    for (let i = 0; i < 40; i += 1) {
      const next = { x: current.x - outward.x * step, y: current.y - outward.y * step }
      current = next
      if (insideInk(current, rings)) break
    }
  }
  return current
}

export interface ExtractedStroke {
  stroke: StrokeDataV2
  /** 법선 구간 폭의 중앙값(em). 두께 참고용. */
  measuredThickness: number | null
  /** 잉크를 찾은 샘플 비율. 낮으면 씨앗이 잉크에서 멀었다. */
  coverage: number
}

function flattenForOwnership(points: readonly AnchorPoint[], closed: boolean): Pt[] {
  const out: Pt[] = []
  for (const segment of segmentsOf(points, closed)) for (let k = 0; k <= 8; k += 1) out.push(bezier(segment.p0, segment.p1, segment.p2, segment.p3, k / 8))
  return out
}

/**
 * 자모의 획들을 한꺼번에 뽑는다. 입력 획은 상자 좌표, 출력 획은 em 좌표.
 * 매 pass마다 모든 획의 현재 중심선으로 잉크 소유권을 가른 뒤, 획마다 샘플 → 법선 스냅 → 앵커 평균 → 3차 최소제곱.
 */
export function extractStrokesJointly(seeds: readonly DeepReadonly<StrokeDataV2>[], box: BoxConfig, ghost: MultiPolygon, thickness: number, passes = 5): ExtractedStroke[] {
  const rings = ringsOf(ghost)
  const strokes: AnchorPoint[][] = seeds.map((seed) => seed.points.map((p) => ({
    ...toEm(p, box),
    ...(p.handleIn ? { handleIn: toEm(p.handleIn, box) } : {}),
    ...(p.handleOut ? { handleOut: toEm(p.handleOut, box) } : {}),
  })))
  const found = seeds.map(() => 0), total = seeds.map(() => 0)
  const widths: number[][] = seeds.map(() => [])
  for (let pass = 0; pass < passes; pass += 1) {
    const polylines = strokes.map((points, index) => flattenForOwnership(points, seeds[index].closed))
    const reach = pass === 0 ? 4 : 2
    strokes.forEach((points, si) => {
      const closed = seeds[si].closed
      const segments = segmentsOf(points, closed)
      const next: AnchorPoint[] = points.map((p) => ({ x: p.x, y: p.y }))
      const anchorSamples: Pt[][] = points.map(() => [])
      const segmentSamples: Pt[][] = segments.map(() => [])
      segments.forEach((segment, index) => {
        for (let k = 0; k <= SAMPLES_PER_SEGMENT; k += 1) {
          const t = k / SAMPLES_PER_SEGMENT
          const on = bezier(segment.p0, segment.p1, segment.p2, segment.p3, t)
          const tangent = bezierTangent(segment.p0, segment.p1, segment.p2, segment.p3, t)
          total[si] += 1
          const snapped = snapToOwnInk(on, tangent, thickness, rings, polylines, si, reach)
          if (!snapped) continue
          found[si] += 1
          // 교차부(정보 없음)는 곡선 맞춤에서 뺀다. 앵커 자리만 잡아 준다.
          if (snapped.width !== null) { segmentSamples[index].push(snapped.point); widths[si].push(snapped.width) }
          if (k === 0) anchorSamples[index].push(snapped.point)
          if (k === SAMPLES_PER_SEGMENT) anchorSamples[(index + 1) % points.length].push(snapped.point)
        }
      })
      // 앵커 = 이웃 세그먼트 끝 샘플의 평균(없으면 그대로).
      points.forEach((_, index) => {
        const s = anchorSamples[index]
        if (s.length) next[index] = { x: s.reduce((a, b) => a + b.x, 0) / s.length, y: s.reduce((a, b) => a + b.y, 0) / s.length }
      })
      // 열린 획의 양 끝은 잉크 경계까지 민다.
      if (!closed && segments.length) {
        const first = segments[0], last = segments[segments.length - 1]
        const startTan = bezierTangent(first.p0, first.p1, first.p2, first.p3, 0)
        const endTan = bezierTangent(last.p0, last.p1, last.p2, last.p3, 1)
        next[0] = slideToBoundary(next[0], { x: -startTan.x, y: -startTan.y }, thickness, rings)
        next[next.length - 1] = slideToBoundary(next[next.length - 1], endTan, thickness, rings)
      }
      // 핸들 = 새 앵커 사이 샘플에 3차 최소제곱. 샘플이 적으면 직선, 핸들이 현보다 길게 튀면 잘라 낸다.
      segments.forEach((_, index) => {
        const samples = segmentSamples[index]
        const a = next[index], b = next[(index + 1) % next.length]
        const { p1, p2 } = samples.length >= 5 ? fitCubic(samples, a, b) : { p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y } }
        const chord = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const limit = chord * 0.6
        const clamp = (h: Pt, anchor: Pt) => { const d = Math.hypot(h.x - anchor.x, h.y - anchor.y); const k = d > limit ? limit / d : 1; return { x: anchor.x + (h.x - anchor.x) * k, y: anchor.y + (h.y - anchor.y) * k } }
        const c1 = clamp(p1, a), c2 = clamp(p2, b)
        if (chordDeviation(a, c1, c2, b) > 0.006) { a.handleOut = c1; b.handleIn = c2 }
        else { delete a.handleOut; delete b.handleIn }
      })
      strokes[si] = next
    })
  }
  return seeds.map((seed, si) => {
    const sorted = [...widths[si]].sort((a, b) => a - b)
    return {
      stroke: { ...structuredClone(seed) as StrokeDataV2, points: strokes[si] },
      measuredThickness: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      coverage: total[si] ? found[si] / total[si] : 0,
    }
  })
}

/** 획 하나만 뽑을 때. */
export function extractStrokeCenterline(seed: DeepReadonly<StrokeDataV2>, box: BoxConfig, ghost: MultiPolygon, thickness: number, passes = 5): ExtractedStroke {
  return extractStrokesJointly([seed], box, ghost, thickness, passes)[0]
}

export interface ExtractedJamo {
  /** 상자 정규화(0~1) 좌표의 획. 씨앗과 같은 채널·순서·앵커 수. */
  strokes: StrokeDataV2[]
  measuredThickness: (number | null)[]
  coverage: number
}

/**
 * 자모 한 채널의 모든 획을 문맥 하나에서 뽑는다. 씨앗을 문맥 상자에 놓는 규칙은 렌더러와 같다(fitNotoComponent).
 * 결과는 축별 0~1로 정규화해 돌려준다 — 렌더러가 상자에 맞출 때 축별 아핀은 무시되므로 형태만 남긴다.
 */
export function extractJamoInContext(input: {
  jamo: DeepReadonly<JamoData>
  faces: ComponentFaces
  ghost: MultiPolygon
  part: 'CH' | 'JO' | 'JU' | 'JU_H' | 'JU_V'
  family?: MedialFamily | null
  channel?: 'horizontalStrokes' | 'verticalStrokes'
}): ExtractedJamo | null {
  const fit = fitNotoComponent({ part: input.part, jamo: input.jamo, faces: input.faces, family: input.family, channel: input.channel, glyphId: 'extract' })
  if (!fit.ok) return null
  const seeds = fit.fit.primitives.map((primitive) => primitive.stroke as DeepReadonly<StrokeDataV2>)
  const extracted = extractStrokesJointly(seeds, fit.fit.box, input.ghost, fit.fit.thickness)
  const strokes = extracted.map((item) => item.stroke)
  normalizeSkeleton(strokes)
  return {
    strokes,
    measuredThickness: extracted.map((item) => item.measuredThickness),
    coverage: extracted.reduce((sum, item) => sum + item.coverage, 0) / Math.max(1, extracted.length),
  }
}

/** 같은 위상의 획 묶음 여럿을 좌표별로 평균한다(문맥 여러 개 → 계열 대표). */
export function averageStrokes(sets: readonly (readonly StrokeDataV2[])[]): StrokeDataV2[] {
  if (!sets.length) return []
  const base = structuredClone(sets[0]) as StrokeDataV2[]
  base.forEach((stroke, si) => stroke.points.forEach((point, pi) => {
    const peers = sets.map((set) => set[si].points[pi])
    const mean = (pick: (p: AnchorPoint) => number | undefined) => {
      const values = peers.map(pick).filter((v): v is number => v !== undefined)
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined
    }
    point.x = mean((p) => p.x)!
    point.y = mean((p) => p.y)!
    const inCount = peers.filter((p) => p.handleIn).length, outCount = peers.filter((p) => p.handleOut).length
    // 과반이 곡선이면 곡선으로(없는 쪽은 앵커 자리로 쳐서 평균).
    if (inCount * 2 > peers.length) point.handleIn = { x: mean((p) => (p.handleIn ?? p).x)!, y: mean((p) => (p.handleIn ?? p).y)! }
    else delete point.handleIn
    if (outCount * 2 > peers.length) point.handleOut = { x: mean((p) => (p.handleOut ?? p).x)!, y: mean((p) => (p.handleOut ?? p).y)! }
    else delete point.handleOut
  }))
  normalizeSkeleton(base)
  for (const stroke of base) for (const point of stroke.points) {
    point.x = round3(point.x); point.y = round3(point.y)
    if (point.handleIn) point.handleIn = { x: round3(point.handleIn.x), y: round3(point.handleIn.y) }
    if (point.handleOut) point.handleOut = { x: round3(point.handleOut.x), y: round3(point.handleOut.y) }
  }
  return base
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
