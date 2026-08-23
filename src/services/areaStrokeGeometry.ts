import type { AngledAreaStrokeRenderStyle, BoxConfig, StrokeDataV2 } from '../types'
import { flattenStrokeCenterline, type BrushContour, type BrushInkGroup, type BrushPoint } from './brushGeometry'

const EPSILON = 1e-8

function add(point: BrushPoint, vector: BrushPoint, scale = 1): BrushPoint {
  return { x: point.x + vector.x * scale, y: point.y + vector.y * scale }
}

function unit(from: BrushPoint, to: BrushPoint): BrushPoint | null {
  const x = to.x - from.x
  const y = to.y - from.y
  const length = Math.hypot(x, y)
  return length > EPSILON ? { x: x / length, y: y / length } : null
}

function cross(first: BrushPoint, second: BrushPoint): number {
  return first.x * second.y - first.y * second.x
}

function capShift(tangent: BrushPoint, normal: BrushPoint, cutDirection: BrushPoint, halfWidth: number): number {
  const denominator = cross(tangent, cutDirection)
  if (Math.abs(denominator) < 0.12) return 0
  return -cross(add({ x: 0, y: 0 }, normal, halfWidth), cutDirection) / denominator
}

function signedTurn(before: BrushPoint, after: BrushPoint): number {
  return Math.atan2(cross(before, after), before.x * after.x + before.y * after.y)
}

function joinPoints(
  previous: BrushPoint,
  current: BrushPoint,
  next: BrushPoint,
  halfWidth: number,
  side: 1 | -1,
  cornerRadius: number,
): BrushPoint[] {
  const before = unit(previous, current)
  const after = unit(current, next)
  if (!before || !after) return []
  const turn = signedTurn(before, after)
  const previousNormal = { x: -before.y * side, y: before.x * side }
  const nextNormal = { x: -after.y * side, y: after.x * side }
  const tangent = { x: before.x + after.x, y: before.y + after.y }
  const tangentLength = Math.hypot(tangent.x, tangent.y)
  const bisector = tangentLength < EPSILON
    ? previousNormal
    : { x: -tangent.y / tangentLength * side, y: tangent.x / tangentLength * side }
  const projection = Math.max(0.5, Math.abs(bisector.x * nextNormal.x + bisector.y * nextNormal.y))
  const miter = add(current, bisector, Math.min(halfWidth / projection, halfWidth * 2))
  const radius = Math.max(0, Math.min(1, cornerRadius))
  const isOuter = turn * side < 0
  if (!isOuter || radius === 0 || Math.abs(turn) < 0.18) return [miter]

  const steps = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 12)))
  const startAngle = Math.atan2(previousNormal.y, previousNormal.x)
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + turn * index / steps
    const arc = { x: current.x + Math.cos(angle) * halfWidth, y: current.y + Math.sin(angle) * halfWidth }
    return { x: miter.x + (arc.x - miter.x) * radius, y: miter.y + (arc.y - miter.y) * radius }
  })
}

function offsetAt(points: BrushPoint[], index: number, halfWidth: number): BrushPoint {
  const before = index > 0 ? unit(points[index - 1], points[index]) : null
  const after = index < points.length - 1 ? unit(points[index], points[index + 1]) : null
  const tangent = before && after
    ? { x: before.x + after.x, y: before.y + after.y }
    : (before ?? after ?? { x: 1, y: 0 })
  const tangentLength = Math.hypot(tangent.x, tangent.y)
  const normal = { x: -tangent.y / tangentLength, y: tangent.x / tangentLength }
  const referenceNormal = after ? { x: -after.y, y: after.x } : before ? { x: -before.y, y: before.x } : normal
  const projection = Math.max(0.5, Math.abs(normal.x * referenceNormal.x + normal.y * referenceNormal.y))
  return { x: normal.x * Math.min(halfWidth / projection, halfWidth * 2), y: normal.y * Math.min(halfWidth / projection, halfWidth * 2) }
}

function signedArea(contour: BrushContour): number {
  return contour.reduce((sum, current, index) => {
    const next = contour[(index + 1) % contour.length]
    return sum + current.x * next.y - next.x * current.y
  }, 0) / 2
}

function closedStrokeGroup(points: BrushPoint[], halfWidth: number, cornerRadius: number): BrushInkGroup {
  const buildSide = (side: 1 | -1) => points.flatMap((current, index) => joinPoints(
    points[(index - 1 + points.length) % points.length], current, points[(index + 1) % points.length], halfWidth, side, cornerRadius,
  ))
  const left = buildSide(1)
  const right = buildSide(-1)
  const [outer, inner] = Math.abs(signedArea(left)) >= Math.abs(signedArea(right)) ? [left, right] : [right, left]
  return [outer, inner.reverse()]
}

function openStrokeContour(points: BrushPoint[], halfWidth: number, cutDirection: BrushPoint, cornerRadius: number): BrushContour {
  const offsets = points.map((_, index) => offsetAt(points, index, halfWidth))
  const firstTangent = unit(points[0], points[1])!
  const lastTangent = unit(points[points.length - 2], points[points.length - 1])!
  const startShift = Math.max(-Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) * 0.45, Math.min(
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) * 0.45,
    capShift(firstTangent, { x: -firstTangent.y, y: firstTangent.x }, cutDirection, halfWidth),
  ))
  const lastLength = Math.hypot(points.at(-1)!.x - points.at(-2)!.x, points.at(-1)!.y - points.at(-2)!.y)
  const endShift = Math.max(-lastLength * 0.45, Math.min(lastLength * 0.45, capShift(lastTangent, { x: -lastTangent.y, y: lastTangent.x }, cutDirection, halfWidth)))
  const left = [
    add(add(points[0], firstTangent, startShift), offsets[0]),
    ...points.slice(1, -1).flatMap((center, innerIndex) => joinPoints(points[innerIndex], center, points[innerIndex + 2], halfWidth, 1, cornerRadius)),
    add(add(points.at(-1)!, lastTangent, endShift), offsets.at(-1)!),
  ]
  const right = [
    add(add(points[0], firstTangent, -startShift), offsets[0], -1),
    ...points.slice(1, -1).flatMap((center, innerIndex) => joinPoints(points[innerIndex], center, points[innerIndex + 2], halfWidth, -1, cornerRadius)),
    add(add(points.at(-1)!, lastTangent, -endShift), offsets.at(-1)!, -1),
  ].reverse()
  return [...left, ...right]
}

/**
 * 중심선의 위치는 유지하고, 각 구간의 양옆 면과 공통 화면 각도의 열린 끝면을 만든다.
 * 꺾임 곡률은 교차부에 원형 결합 면을 더하는 방식이라 급커브에서도 안전하게 bevel로 폴백한다.
 */
export function strokeToAngledAreaInkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
  style: AngledAreaStrokeRenderStyle,
): BrushInkGroup[] {
  const centerline = flattenStrokeCenterline(stroke, box)
  if (centerline.length < 2) return []
  const halfWidth = Math.max(stroke.thickness * weightMultiplier / 2, 0.0005)
  const radians = style.cutAngle * Math.PI / 180
  const cutDirection = { x: Math.cos(radians), y: Math.sin(radians) }
  const groups: BrushInkGroup[] = []

  if (!stroke.closed) {
    groups.push([openStrokeContour(centerline, halfWidth, cutDirection, style.cornerRadius)])
    return groups
  }

  groups.push(closedStrokeGroup(centerline, halfWidth, style.cornerRadius))
  return groups
}
