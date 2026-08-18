import type { JamoData, StrokeMoveDelta, StrokeScale } from '../types'
import type { NormalizedBounds } from '../utils/containerBoxUtils'

const EPSILON = 0.000001

export interface MoveStrokeResult {
  jamo: JamoData
  delta: StrokeMoveDelta
  changed: boolean
}

export interface ScaleStrokeResult {
  jamo: JamoData
  scale: StrokeScale
  changed: boolean
  lockedAxes: { x: boolean; y: boolean }
}

export function cloneJamoData(jamo: JamoData): JamoData {
  return structuredClone(jamo)
}

export function moveStroke(
  source: JamoData,
  strokeId: string,
  requested: StrokeMoveDelta,
  bounds: NormalizedBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  gridStep?: number
): MoveStrokeResult {
  const jamo = cloneJamoData(source)
  const stroke = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
  ].find((item) => item.id === strokeId)
  if (!stroke || stroke.points.length === 0) {
    return { jamo, delta: { x: 0, y: 0 }, changed: false }
  }

  const minX = Math.min(...stroke.points.map((point) => point.x))
  const maxX = Math.max(...stroke.points.map((point) => point.x))
  const minY = Math.min(...stroke.points.map((point) => point.y))
  const maxY = Math.max(...stroke.points.map((point) => point.y))
  const clampAxis = (
    anchor: number,
    requestedDelta: number,
    minimumDelta: number,
    maximumDelta: number
  ): number => {
    if (!gridStep || gridStep <= 0 || Math.abs(requestedDelta) < EPSILON) {
      return Math.max(minimumDelta, Math.min(maximumDelta, requestedDelta))
    }
    const minimumIndex = Math.ceil((anchor + minimumDelta) / gridStep - EPSILON)
    const maximumIndex = Math.floor((anchor + maximumDelta) / gridStep + EPSILON)
    const requestedIndex = Math.round((anchor + requestedDelta) / gridStep)
    const snappedIndex = Math.max(minimumIndex, Math.min(maximumIndex, requestedIndex))
    return snappedIndex * gridStep - anchor
  }
  const firstPoint = stroke.points[0]
  const delta = {
    x: clampAxis(firstPoint.x, requested.x, bounds.minX - minX, bounds.maxX - maxX),
    y: clampAxis(firstPoint.y, requested.y, bounds.minY - minY, bounds.maxY - maxY),
  }

  if (Math.abs(delta.x) < EPSILON && Math.abs(delta.y) < EPSILON) {
    return { jamo, delta: { x: 0, y: 0 }, changed: false }
  }

  stroke.points.forEach((point) => {
    point.x += delta.x
    point.y += delta.y
    if (point.handleIn) {
      point.handleIn.x += delta.x
      point.handleIn.y += delta.y
    }
    if (point.handleOut) {
      point.handleOut.x += delta.x
      point.handleOut.y += delta.y
    }
  })

  return { jamo, delta, changed: true }
}

export function movePoint(
  source: JamoData,
  strokeId: string,
  pointIndex: number,
  requested: StrokeMoveDelta,
  bounds: NormalizedBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  gridStep?: number
): MoveStrokeResult {
  const jamo = cloneJamoData(source)
  const stroke = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
  ].find((item) => item.id === strokeId)
  const point = stroke?.points[pointIndex]
  if (!point) return { jamo, delta: { x: 0, y: 0 }, changed: false }

  const snap = (value: number, delta: number, min: number, max: number): number => {
    const clamped = Math.max(min - value, Math.min(max - value, delta))
    if (!gridStep || gridStep <= 0 || Math.abs(clamped) < EPSILON) return clamped
    const snapped = Math.round((value + clamped) / gridStep) * gridStep - value
    return Math.max(min - value, Math.min(max - value, snapped))
  }
  const delta = {
    x: snap(point.x, requested.x, bounds.minX, bounds.maxX),
    y: snap(point.y, requested.y, bounds.minY, bounds.maxY),
  }
  if (Math.abs(delta.x) < EPSILON && Math.abs(delta.y) < EPSILON) {
    return { jamo, delta: { x: 0, y: 0 }, changed: false }
  }
  point.x += delta.x
  point.y += delta.y
  if (point.handleIn) {
    point.handleIn.x += delta.x
    point.handleIn.y += delta.y
  }
  if (point.handleOut) {
    point.handleOut.x += delta.x
    point.handleOut.y += delta.y
  }
  return { jamo, delta, changed: true }
}

export function moveHandle(
  source: JamoData,
  strokeId: string,
  pointIndex: number,
  handleType: 'in' | 'out',
  requested: StrokeMoveDelta,
  bounds: NormalizedBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  gridStep?: number
): MoveStrokeResult {
  const jamo = cloneJamoData(source)
  const stroke = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
  ].find((item) => item.id === strokeId)
  const point = stroke?.points[pointIndex]
  const handle = handleType === 'in' ? point?.handleIn : point?.handleOut
  if (!handle) return { jamo, delta: { x: 0, y: 0 }, changed: false }

  const snap = (value: number, delta: number, min: number, max: number): number => {
    const clamped = Math.max(min - value, Math.min(max - value, delta))
    if (!gridStep || gridStep <= 0 || Math.abs(clamped) < EPSILON) return clamped
    const snapped = Math.round((value + clamped) / gridStep) * gridStep - value
    return Math.max(min - value, Math.min(max - value, snapped))
  }
  const delta = {
    x: snap(handle.x, requested.x, bounds.minX, bounds.maxX),
    y: snap(handle.y, requested.y, bounds.minY, bounds.maxY),
  }
  if (Math.abs(delta.x) < EPSILON && Math.abs(delta.y) < EPSILON) return { jamo, delta: { x: 0, y: 0 }, changed: false }
  handle.x += delta.x
  handle.y += delta.y
  return { jamo, delta, changed: true }
}

export function scaleStroke(
  source: JamoData,
  strokeId: string,
  requestedScale: StrokeScale,
  bounds: NormalizedBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  gridStep?: number
): ScaleStrokeResult {
  const jamo = cloneJamoData(source)
  const stroke = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
  ].find((item) => item.id === strokeId)
  if (!stroke || stroke.points.length === 0) {
    return { jamo, scale: { x: 1, y: 1 }, changed: false, lockedAxes: { x: true, y: true } }
  }

  const xs = stroke.points.map((point) => point.x)
  const ys = stroke.points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const lockedAxes = { x: maxX - minX < EPSILON, y: maxY - minY < EPSILON }
  const snap = (value: number): number => gridStep && gridStep > 0
    ? Math.round(value / gridStep) * gridStep
    : value
  const limitAxis = (requested: number, centerValue: number, minValue: number, maxValue: number, minBound: number, maxBound: number, locked: boolean): number => {
    if (locked) return 1
    const negativeDistance = centerValue - minValue
    const positiveDistance = maxValue - centerValue
    const boundsMaximum = Math.min(
      negativeDistance > EPSILON ? (centerValue - minBound) / negativeDistance : 4,
      positiveDistance > EPSILON ? (maxBound - centerValue) / positiveDistance : 4
    )
    const maximum = Math.max(0.25, Math.min(4, boundsMaximum))
    const snappedMaximum = gridStep && gridStep > 0
      ? Math.floor((maximum + EPSILON) / gridStep) * gridStep
      : maximum
    return Math.max(0.25, Math.min(snappedMaximum, snap(requested)))
  }
  const scale = {
    x: limitAxis(requestedScale.x, center.x, minX, maxX, bounds.minX, bounds.maxX, lockedAxes.x),
    y: limitAxis(requestedScale.y, center.y, minY, maxY, bounds.minY, bounds.maxY, lockedAxes.y),
  }
  if (Math.abs(scale.x - 1) < EPSILON && Math.abs(scale.y - 1) < EPSILON) {
    return { jamo, scale: { x: 1, y: 1 }, changed: false, lockedAxes }
  }

  const transform = (point: { x: number; y: number }) => {
    point.x = center.x + (point.x - center.x) * scale.x
    point.y = center.y + (point.y - center.y) * scale.y
  }
  stroke.points.forEach((point) => {
    transform(point)
    if (point.handleIn) transform(point.handleIn)
    if (point.handleOut) transform(point.handleOut)
  })
  return { jamo, scale, changed: true, lockedAxes }
}

export function formatMoveSummary(delta: StrokeMoveDelta): string {
  const horizontal = Math.abs(delta.x) < EPSILON
    ? ''
    : `${delta.x > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(delta.x * 100).toFixed(1)}`
  const vertical = Math.abs(delta.y) < EPSILON
    ? ''
    : `${delta.y > 0 ? '아래' : '위'} ${Math.abs(delta.y * 100).toFixed(1)}`
  return [horizontal, vertical].filter(Boolean).join(' · ')
}

export function formatScaleSummary(before: StrokeScale, after: StrokeScale): string {
  const percent = (value: number) => Number((value * 100).toFixed(1))
  return `가로 ${percent(before.x)}→${percent(after.x)}% · 세로 ${percent(before.y)}→${percent(after.y)}%`
}
