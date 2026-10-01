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
  return scaleStrokes(source, [strokeId], requestedScale, bounds, gridStep)
}

/**
 * 획 여럿을 한 덩어리로 키우고 줄인다(획 묶음). 묶인 획 전체 범위의 가운데를 기준으로, 길이가 없는 축은 잠근다.
 * 획 하나면 `scaleStroke`와 같다.
 */
export function scaleStrokes(
  source: JamoData,
  strokeIds: readonly string[],
  requestedScale: StrokeScale,
  bounds: NormalizedBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  gridStep?: number
): ScaleStrokeResult {
  const jamo = cloneJamoData(source)
  const strokes = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
  ].filter((item) => strokeIds.includes(item.id))
  const allPoints = strokes.flatMap((item) => item.points)
  if (allPoints.length === 0) {
    return { jamo, scale: { x: 1, y: 1 }, changed: false, lockedAxes: { x: true, y: true } }
  }

  const xs = allPoints.map((point) => point.x)
  const ys = allPoints.map((point) => point.y)
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
  allPoints.forEach((point) => {
    transform(point)
    if (point.handleIn) transform(point.handleIn)
    if (point.handleOut) transform(point.handleOut)
  })
  return { jamo, scale, changed: true, lockedAxes }
}

/**
 * 자소 전체를 같은 비율로 키우고 줄인다. 모든 채널의 점 · 핸들을 중심선 범위의 가운데를 기준으로 옮기고, 두께는 그대로 둔다.
 * 상자 경계로 막지 않는다 — 틀이 상자를 붙잡으니 넘친 만큼 상자 밖으로 나간다.
 */
export function scaleJamoStrokes(source: JamoData, factor: number): JamoData {
  const jamo = cloneJamoData(source)
  const strokes = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
    ...Object.values(jamo.contextStrokes ?? {}).flatMap((variant) => variant ?? []),
  ]
  const points = strokes.flatMap((stroke) => stroke.points)
  if (!points.length || !Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < EPSILON) return jamo
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  const transform = (point: { x: number; y: number }) => {
    point.x = center.x + (point.x - center.x) * factor
    point.y = center.y + (point.y - center.y) * factor
  }
  for (const point of points) {
    transform(point)
    if (point.handleIn) transform(point.handleIn)
    if (point.handleOut) transform(point.handleOut)
  }
  return jamo
}

/** 획 하나가 놓인 상자에서의 편집 한계(상자 좌표)를 준다. 모르는 획이면 undefined — 그 획은 한계를 안 본다. */
export type StrokeBoundsOf = (strokeId: string) => NormalizedBounds | undefined

const renderedStrokesOf = (jamo: JamoData) => [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]

/**
 * 자소 통째 크기 배율을 글자 칸 안에 가둔다. 자소 상자는 넘어도 되지만(틀이 상자를 붙잡는다) 글자 칸 밖으로는 못 나간다.
 * 키울 때만 줄인다 — 어느 점이든 한계에 먼저 닿는 배율에서 멈춘다(가로 · 세로 같은 비율이라 하나로 정해진다).
 * 기준 가운데는 `scaleJamoStrokes`와 같다.
 */
export function limitJamoScaleFactor(source: JamoData, factor: number, boundsOf: StrokeBoundsOf): number {
  if (!Number.isFinite(factor) || factor <= 1) return factor
  const all = [...renderedStrokesOf(source), ...Object.values(source.contextStrokes ?? {}).flatMap((variant) => variant ?? [])].flatMap((stroke) => stroke.points)
  if (!all.length) return factor
  const xs = all.map((point) => point.x)
  const ys = all.map((point) => point.y)
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  let limit = factor
  const reach = (value: number, centerValue: number, min: number, max: number) => {
    const distance = value - centerValue
    if (distance > EPSILON) limit = Math.min(limit, (max - centerValue) / distance)
    else if (distance < -EPSILON) limit = Math.min(limit, (centerValue - min) / -distance)
  }
  for (const stroke of renderedStrokesOf(source)) {
    const bounds = boundsOf(stroke.id)
    if (!bounds) continue
    for (const point of stroke.points) {
      reach(point.x, center.x, bounds.minX, bounds.maxX)
      reach(point.y, center.y, bounds.minY, bounds.maxY)
    }
  }
  return Math.max(1, limit)
}

/** 자소 통째 이동을 글자 칸 안에 가둔다. 어느 점이든 한계에 닿는 만큼까지만 간다(가로 · 세로 따로). */
export function limitJamoMoveDelta(source: JamoData, delta: StrokeMoveDelta, boundsOf: StrokeBoundsOf): StrokeMoveDelta {
  let lowX = -Infinity; let highX = Infinity; let lowY = -Infinity; let highY = Infinity
  for (const stroke of renderedStrokesOf(source)) {
    const bounds = boundsOf(stroke.id)
    if (!bounds) continue
    for (const point of stroke.points) {
      lowX = Math.max(lowX, bounds.minX - point.x); highX = Math.min(highX, bounds.maxX - point.x)
      lowY = Math.max(lowY, bounds.minY - point.y); highY = Math.min(highY, bounds.maxY - point.y)
    }
  }
  // 한계는 지금 점을 품고 있어 낮은 쪽은 0 이하, 높은 쪽은 0 이상이다.
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, Math.min(low, 0)), Math.max(high, 0))
  return { x: clamp(delta.x, lowX, highX), y: clamp(delta.y, lowY, highY) }
}

/**
 * 자소 전체를 통째로 옮긴다. 모든 채널의 점 · 핸들을 같은 만큼. 상자 경계로 막지 않는다(자소 통째 크기와 같다).
 */
export function translateJamoStrokes(source: JamoData, delta: StrokeMoveDelta): JamoData {
  const jamo = cloneJamoData(source)
  if (Math.abs(delta.x) < EPSILON && Math.abs(delta.y) < EPSILON) return jamo
  const strokes = [
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
    ...Object.values(jamo.contextStrokes ?? {}).flatMap((variant) => variant ?? []),
  ]
  const shift = (point: { x: number; y: number }) => {
    point.x += delta.x
    point.y += delta.y
  }
  for (const point of strokes.flatMap((stroke) => stroke.points)) {
    shift(point)
    if (point.handleIn) shift(point.handleIn)
    if (point.handleOut) shift(point.handleOut)
  }
  return jamo
}

/** 자소 통째 이동이 파트 상자 정가운데에 붙는 반경(상자 좌표 0–1). */
export const WHOLE_JAMO_CENTER_SNAP = 0.025

/**
 * 자소 통째 이동을 파트 상자 정가운데(0.5)에 붙인다. 중심선 범위의 가운데가 반경 안에 들면 그 축만 딱 맞춘다(가로 · 세로 따로).
 * `centerOf`는 옮기기 전 자소의 중심선 범위 가운데.
 */
export function snapWholeJamoDelta(center: { x: number; y: number }, delta: StrokeMoveDelta, radius = WHOLE_JAMO_CENTER_SNAP): { delta: StrokeMoveDelta; centered: { x: boolean; y: boolean } } {
  const axis = (from: number, requested: number) => Math.abs(from + requested - 0.5) <= radius ? { value: 0.5 - from, hit: true } : { value: requested, hit: false }
  const x = axis(center.x, delta.x)
  const y = axis(center.y, delta.y)
  return { delta: { x: x.value, y: y.value }, centered: { x: x.hit, y: y.hit } }
}

/** 자소 중심선 범위(모든 채널 점)의 가운데. 점이 없으면 상자 가운데. */
export function jamoCenterlineCenter(source: JamoData): { x: number; y: number } {
  const points = [...(source.strokes ?? []), ...(source.horizontalStrokes ?? []), ...(source.verticalStrokes ?? [])].flatMap((stroke) => stroke.points)
  if (!points.length) return { x: 0.5, y: 0.5 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
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
