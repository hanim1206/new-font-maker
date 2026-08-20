import type { BoxConfig, DecomposedSyllable, MobileEditorPart, Part } from '../types'
import { getRenderedStrokeTargets, type RenderedStrokeTarget } from '../services/mobileEditorContext'

const CURVE_STEPS = 12
const EPSILON = 0.000001

interface Point {
  x: number
  y: number
}

interface InkPolyline {
  points: Point[]
  radius: number
}

function toGlyphPoint(point: Point, box: BoxConfig): Point {
  return {
    x: box.x + point.x * box.width,
    y: box.y + point.y * box.height,
  }
}

function quadraticAt(start: Point, control: Point, end: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  }
}

function cubicAt(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * mt * start.x + 3 * mt * mt * t * control1.x + 3 * mt * t * t * control2.x + t * t * t * end.x,
    y: mt * mt * mt * start.y + 3 * mt * mt * t * control1.y + 3 * mt * t * t * control2.y + t * t * t * end.y,
  }
}

function sampleSegment(
  from: RenderedStrokeTarget['stroke']['points'][number],
  to: RenderedStrokeTarget['stroke']['points'][number],
  box: BoxConfig,
): Point[] {
  const start = toGlyphPoint(from, box)
  const end = toGlyphPoint(to, box)
  const out = from.handleOut ? toGlyphPoint(from.handleOut, box) : null
  const incoming = to.handleIn ? toGlyphPoint(to.handleIn, box) : null
  if (!out && !incoming) return [end]

  const points: Point[] = []
  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const t = step / CURVE_STEPS
    if (out && incoming) points.push(cubicAt(start, out, incoming, end, t))
    else points.push(quadraticAt(start, out ?? incoming!, end, t))
  }
  return points
}

function toInkPolyline(target: RenderedStrokeTarget): InkPolyline | null {
  const source = target.stroke.points
  if (source.length === 0) return null
  const points = [toGlyphPoint(source[0], target.box)]
  for (let index = 1; index < source.length; index += 1) {
    points.push(...sampleSegment(source[index - 1], source[index], target.box))
  }
  if (target.stroke.closed && source.length > 1) {
    points.push(...sampleSegment(source[source.length - 1], source[0], target.box))
  }
  return { points, radius: target.stroke.thickness / 2 }
}

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < EPSILON) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(point: Point, start: Point, end: Point): boolean {
  return Math.abs(cross(start, end, point)) < EPSILON
    && point.x >= Math.min(start.x, end.x) - EPSILON
    && point.x <= Math.max(start.x, end.x) + EPSILON
    && point.y >= Math.min(start.y, end.y) - EPSILON
    && point.y <= Math.max(start.y, end.y) + EPSILON
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true
  return (Math.abs(abC) < EPSILON && onSegment(c, a, b))
    || (Math.abs(abD) < EPSILON && onSegment(d, a, b))
    || (Math.abs(cdA) < EPSILON && onSegment(a, c, d))
    || (Math.abs(cdB) < EPSILON && onSegment(b, c, d))
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(
    pointToSegmentDistance(a, c, d),
    pointToSegmentDistance(b, c, d),
    pointToSegmentDistance(c, a, b),
    pointToSegmentDistance(d, a, b),
  )
}

function polylineDistance(first: InkPolyline, second: InkPolyline): number {
  if (first.points.length === 1 && second.points.length === 1) {
    return Math.hypot(first.points[0].x - second.points[0].x, first.points[0].y - second.points[0].y)
  }
  let minimum = Number.POSITIVE_INFINITY
  const firstSegments = first.points.length === 1 ? [[first.points[0], first.points[0]]] : first.points.slice(1).map((point, index) => [first.points[index], point])
  const secondSegments = second.points.length === 1 ? [[second.points[0], second.points[0]]] : second.points.slice(1).map((point, index) => [second.points[index], point])
  for (const [a, b] of firstSegments) {
    for (const [c, d] of secondSegments) {
      minimum = Math.min(minimum, segmentDistance(a, b, c, d))
    }
  }
  return minimum
}

/** 선택 컴포넌트와 다른 컴포넌트 사이의 최소 실제 잉크 간격. */
export function getMinimumInterComponentInkGap(
  syllable: DecomposedSyllable,
  boxes: Partial<Record<Part, BoxConfig>>,
  activePart: MobileEditorPart,
): number {
  const targets = getRenderedStrokeTargets(syllable, boxes)
  const active = targets.filter((target) => target.editorPart === activePart).map(toInkPolyline).filter((value): value is InkPolyline => value !== null)
  const others = targets.filter((target) => target.editorPart !== activePart).map(toInkPolyline).filter((value): value is InkPolyline => value !== null)
  if (active.length === 0 || others.length === 0) return Number.POSITIVE_INFINITY

  let minimum = Number.POSITIVE_INFINITY
  for (const selected of active) {
    for (const other of others) {
      minimum = Math.min(minimum, polylineDistance(selected, other) - selected.radius - other.radius)
    }
  }
  return minimum
}

export function preservesMinimumInkGap(
  syllable: DecomposedSyllable,
  boxes: Partial<Record<Part, BoxConfig>>,
  activePart: MobileEditorPart,
  minimumGap: number,
): boolean {
  return getMinimumInterComponentInkGap(syllable, boxes, activePart) + EPSILON >= minimumGap
}

/** 요청한 편집이 충돌하면 0–1 구간을 이분 탐색해 가장 큰 안전 비율을 찾는다. */
export function findMaximumSafeEditFactor(isSafe: (factor: number) => boolean): number {
  if (isSafe(1)) return 1
  if (!isSafe(0)) return 0
  let safe = 0
  let unsafe = 1
  for (let index = 0; index < 12; index += 1) {
    const candidate = (safe + unsafe) / 2
    if (isSafe(candidate)) safe = candidate
    else unsafe = candidate
  }
  return safe
}
