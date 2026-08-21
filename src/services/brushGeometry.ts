import type { AnchorPoint, BoxConfig, BrushStyle, StrokeDataV2 } from '../types'
import type { Contour } from './strokeToOutline'
import { normalizeClosedStrokePoints } from '../utils/strokePathUtils'

export interface BrushPoint {
  x: number
  y: number
}

export type BrushContour = BrushPoint[]
export type BrushInkGroup = BrushContour[]

const ELLIPSE_VERTEX_COUNT = 32
const MIN_DISTANCE = 1e-10
const DEFAULT_FLATNESS_TOLERANCE = 0.0005

function point(x: number, y: number): BrushPoint {
  return { x, y }
}

function midpoint(first: BrushPoint, second: BrushPoint): BrushPoint {
  return point((first.x + second.x) / 2, (first.y + second.y) / 2)
}

function distanceToLine(target: BrushPoint, start: BrushPoint, end: BrushPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < MIN_DISTANCE) return Math.hypot(target.x - start.x, target.y - start.y)
  const areaTwice = Math.abs(dx * (start.y - target.y) - (start.x - target.x) * dy)
  return areaTwice / Math.sqrt(lengthSquared)
}

function flattenCubic(
  p0: BrushPoint,
  p1: BrushPoint,
  p2: BrushPoint,
  p3: BrushPoint,
  tolerance: number,
  output: BrushPoint[],
  depth = 0,
): void {
  const flatEnough = Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3)) <= tolerance
  if (flatEnough || depth >= 12) {
    output.push(p3)
    return
  }

  const p01 = midpoint(p0, p1)
  const p12 = midpoint(p1, p2)
  const p23 = midpoint(p2, p3)
  const p012 = midpoint(p01, p12)
  const p123 = midpoint(p12, p23)
  const p0123 = midpoint(p012, p123)
  flattenCubic(p0, p01, p012, p0123, tolerance, output, depth + 1)
  flattenCubic(p0123, p123, p23, p3, tolerance, output, depth + 1)
}

function quadraticToCubic(p0: BrushPoint, control: BrushPoint, p2: BrushPoint): [BrushPoint, BrushPoint, BrushPoint, BrushPoint] {
  return [
    p0,
    point(p0.x / 3 + control.x * 2 / 3, p0.y / 3 + control.y * 2 / 3),
    point(p2.x / 3 + control.x * 2 / 3, p2.y / 3 + control.y * 2 / 3),
    p2,
  ]
}

function adjustHandlesForAspectRatio(points: AnchorPoint[], ratio: number): AnchorPoint[] {
  const deviation = Math.abs(ratio - 1)
  const strength = Math.min(deviation * 0.4, 0.3)
  return points.map((source) => {
    const adjusted = { ...source }
    const adjust = (handle: { x: number; y: number } | undefined) => {
      if (!handle) return undefined
      const dx = handle.x - source.x
      const dy = handle.y - source.y
      return ratio > 1
        ? { x: handle.x, y: source.y + dy * (Math.abs(dy) > 0.001 ? 1 + strength : 1) }
        : { x: source.x + dx * (Math.abs(dx) > 0.001 ? 1 + strength : 1), y: handle.y }
    }
    adjusted.handleIn = adjust(source.handleIn)
    adjusted.handleOut = adjust(source.handleOut)
    return adjusted
  })
}

function toGlyphPoint(source: { x: number; y: number }, box: BoxConfig): BrushPoint {
  return point(box.x + source.x * box.width, box.y + source.y * box.height)
}

export function flattenStrokeCenterline(
  stroke: StrokeDataV2,
  box: BoxConfig,
  tolerance = DEFAULT_FLATNESS_TOLERANCE,
): BrushPoint[] {
  let anchors = normalizeClosedStrokePoints(stroke.points, stroke.closed)
  if (stroke.closed && box.width > 0 && box.height > 0) {
    const ratio = box.width / box.height
    if (Math.abs(ratio - 1) > 0.05) anchors = adjustHandlesForAspectRatio(anchors, ratio)
  }
  if (anchors.length < 2) return []

  const output: BrushPoint[] = [toGlyphPoint(anchors[0], box)]
  const segmentCount = stroke.closed ? anchors.length : anchors.length - 1
  for (let index = 0; index < segmentCount; index += 1) {
    const from = anchors[index]
    const to = anchors[(index + 1) % anchors.length]
    const p0 = toGlyphPoint(from, box)
    const p3 = toGlyphPoint(to, box)
    const out = from.handleOut ? toGlyphPoint(from.handleOut, box) : undefined
    const incoming = to.handleIn ? toGlyphPoint(to.handleIn, box) : undefined
    if (out && incoming) flattenCubic(p0, out, incoming, p3, tolerance, output)
    else if (out || incoming) {
      const cubic = quadraticToCubic(p0, out ?? incoming!, p3)
      flattenCubic(cubic[0], cubic[1], cubic[2], cubic[3], tolerance, output)
    } else output.push(p3)
  }

  if (stroke.closed && output.length > 1) output.pop()
  return output.filter((current, index) => index === 0 || Math.hypot(current.x - output[index - 1].x, current.y - output[index - 1].y) > MIN_DISTANCE)
}

function rotate(source: BrushPoint, radians: number): BrushPoint {
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return point(source.x * cosine - source.y * sine, source.x * sine + source.y * cosine)
}

export function createBrushTipPolygon(brush: BrushStyle, diameter: number): BrushContour {
  const aspectRatio = Math.max(0.2, Math.min(1, brush.aspectRatio))
  const radians = Math.max(-90, Math.min(90, brush.angle)) * Math.PI / 180
  if (brush.tip === 'ellipse') {
    const longRadius = diameter / 2
    const shortRadius = longRadius * aspectRatio
    return Array.from({ length: ELLIPSE_VERTEX_COUNT }, (_, index) => {
      const theta = index / ELLIPSE_VERTEX_COUNT * Math.PI * 2
      return rotate(point(Math.cos(theta) * longRadius, Math.sin(theta) * shortRadius), radians)
    })
  }

  const longSide = diameter / Math.sqrt(1 + aspectRatio * aspectRatio)
  const shortSide = longSide * aspectRatio
  const halfLong = longSide / 2
  const halfShort = shortSide / 2
  return [
    point(-halfLong, -halfShort),
    point(halfLong, -halfShort),
    point(halfLong, halfShort),
    point(-halfLong, halfShort),
  ].map((corner) => rotate(corner, radians))
}

function cross(origin: BrushPoint, first: BrushPoint, second: BrushPoint): number {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
}

export function convexHull(points: BrushPoint[]): BrushContour {
  const sorted = [...points].sort((first, second) => first.x - second.x || first.y - second.y)
  if (sorted.length <= 2) return sorted
  const lower: BrushPoint[] = []
  for (const candidate of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], candidate) <= 0) lower.pop()
    lower.push(candidate)
  }
  const upper: BrushPoint[] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const candidate = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], candidate) <= 0) upper.pop()
    upper.push(candidate)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function translated(polygon: BrushContour, center: BrushPoint): BrushContour {
  return polygon.map((vertex) => point(vertex.x + center.x, vertex.y + center.y))
}

export function strokeToBrushInkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
  brush: BrushStyle,
): BrushInkGroup[] {
  if (brush.tip === 'round') return []
  const centerline = flattenStrokeCenterline(stroke, box)
  if (centerline.length < 2) return []
  const tip = createBrushTipPolygon(brush, Math.max(stroke.thickness * weightMultiplier, 0.001))
  const segmentCount = stroke.closed ? centerline.length : centerline.length - 1
  const groups: BrushInkGroup[] = []
  for (let index = 0; index < segmentCount; index += 1) {
    const from = centerline[index]
    const to = centerline[(index + 1) % centerline.length]
    const hull = convexHull([...translated(tip, from), ...translated(tip, to)])
    if (hull.length >= 3) groups.push([hull])
  }
  return groups
}

export function brushInkGroupsToSvgPaths(groups: BrushInkGroup[], viewBoxSize: number): string[] {
  return groups.flatMap((group) => group.map((contour) => {
    if (contour.length < 3) return ''
    const [first, ...rest] = contour
    return `M ${first.x * viewBoxSize} ${first.y * viewBoxSize} ${rest.map((item) => `L ${item.x * viewBoxSize} ${item.y * viewBoxSize}`).join(' ')} Z`
  })).filter(Boolean)
}

export function brushInkGroupsToFontContours(
  groups: BrushInkGroup[],
  upm: number,
  ascender: number,
  slant: number,
): Contour[][] {
  const tangent = Math.tan(slant * Math.PI / 180)
  const verticalCenter = ascender - upm / 2
  return groups.map((group) => group.map((contour) => contour.map((source) => {
    const fontY = ascender - source.y * upm
    const fontX = source.x * upm + (fontY - verticalCenter) * tangent
    return { x: Math.round(fontX), y: Math.round(fontY), onCurve: true }
  })))
}
