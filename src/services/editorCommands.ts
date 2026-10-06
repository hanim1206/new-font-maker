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

type Vec = { x: number; y: number }
/**
 * 점과 그 곡선 핸들. 한계는 핸들까지 본다 — 점만 보면 점 · 획을 옮기거나 키울 때 핸들이 딸려 나가 글자 칸 밖에서 가려지고(못 잡는다) 곡선이 칸을 넘는다.
 * 핸들을 직접 끌 때(`moveHandle`)는 전부터 한계 안에서 멈췄다.
 */
const withHandles = (points: readonly { x: number; y: number; handleIn?: Vec; handleOut?: Vec }[]): Vec[] =>
  points.flatMap((point) => [point, ...(point.handleIn ? [point.handleIn] : []), ...(point.handleOut ? [point.handleOut] : [])])

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

  const extent = withHandles(stroke.points)
  const minX = Math.min(...extent.map((point) => point.x))
  const maxX = Math.max(...extent.map((point) => point.x))
  const minY = Math.min(...extent.map((point) => point.y))
  const maxY = Math.max(...extent.map((point) => point.y))
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

  // 점을 옮기면 핸들도 같이 간다. 점과 핸들 어느 것도 한계를 넘지 않는 만큼만 간다.
  const extent = withHandles([point])
  const snap = (value: number, delta: number, low: number, high: number): number => {
    const clamped = Math.max(low, Math.min(high, delta))
    if (!gridStep || gridStep <= 0 || Math.abs(clamped) < EPSILON) return clamped
    const snapped = Math.round((value + clamped) / gridStep) * gridStep - value
    return Math.max(low, Math.min(high, snapped))
  }
  const delta = {
    x: snap(point.x, requested.x, bounds.minX - Math.min(...extent.map((item) => item.x)), bounds.maxX - Math.max(...extent.map((item) => item.x))),
    y: snap(point.y, requested.y, bounds.minY - Math.min(...extent.map((item) => item.y)), bounds.maxY - Math.max(...extent.map((item) => item.y))),
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
  // 가운데 · 잠긴 축은 점으로 정하고, 한계에 닿는 배율은 핸들까지 본다.
  const extent = withHandles(allPoints)
  const scale = {
    x: limitAxis(requestedScale.x, center.x, Math.min(...extent.map((point) => point.x)), Math.max(...extent.map((point) => point.x)), bounds.minX, bounds.maxX, lockedAxes.x),
    y: limitAxis(requestedScale.y, center.y, Math.min(...extent.map((point) => point.y)), Math.max(...extent.map((point) => point.y)), bounds.minY, bounds.maxY, lockedAxes.y),
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

const renderedStrokesOf = (jamo: JamoData) => [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]
const allStrokesOf = (jamo: JamoData) => [...renderedStrokesOf(jamo), ...Object.values(jamo.contextStrokes ?? {}).flatMap((variant) => variant ?? [])]

/** 자소 통째 크기의 기준 가운데 — 모든 채널 · 문맥 변형 점의 중심선 범위 가운데. 키우는 쪽과 한계를 재는 쪽이 같이 쓴다. */
function jamoScaleCenter(jamo: JamoData): Vec | null {
  const points = allStrokesOf(jamo).flatMap((stroke) => stroke.points)
  if (!points.length) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

/**
 * 자소 전체를 같은 비율로 키우고 줄인다. 모든 채널의 점 · 핸들을 중심선 범위의 가운데를 기준으로 옮기고, 두께는 그대로 둔다.
 * 상자 경계로 막지 않는다 — 틀이 상자를 붙잡으니 넘친 만큼 상자 밖으로 나간다.
 * `shift`는 키운 뒤 통째로 옮길 거리(`limitJamoScale`이 글자 칸 끝에 닿은 쪽을 붙잡으려고 준다).
 */
export function scaleJamoStrokes(source: JamoData, factor: number, shift: StrokeMoveDelta = { x: 0, y: 0 }): JamoData {
  const jamo = cloneJamoData(source)
  const center = jamoScaleCenter(jamo)
  if (!center || !Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < EPSILON) return jamo
  const transform = (point: { x: number; y: number }) => {
    point.x = center.x + (point.x - center.x) * factor + shift.x
    point.y = center.y + (point.y - center.y) * factor + shift.y
  }
  for (const point of allStrokesOf(jamo).flatMap((stroke) => stroke.points)) {
    transform(point)
    if (point.handleIn) transform(point.handleIn)
    if (point.handleOut) transform(point.handleOut)
  }
  return jamo
}

/** 획 하나가 놓인 상자에서의 편집 한계(상자 좌표)를 준다. 모르는 획이면 undefined — 그 획은 한계를 안 본다. */
export type StrokeBoundsOf = (strokeId: string) => NormalizedBounds | undefined

/** 자소 통째 크기에 실제로 쓸 배율과, 글자 칸 안에 두려고 같이 옮길 거리. `scaleJamoStrokes`에 그대로 넘긴다. */
export interface JamoScaleFit {
  factor: number
  shift: StrokeMoveDelta
}

/**
 * 자소 통째 크기를 글자 칸 안에 가둔다. 자소 상자는 넘어도 되지만(틀이 상자를 붙잡는다) 글자 칸 밖으로는 못 나간다.
 * 가운데 기준으로 키우다 한쪽이 칸 끝에 닿으면 그쪽을 붙잡고 반대쪽으로 더 키운다 — 닿은 만큼만 통째로 민다(`shift`).
 * 한 축의 양쪽이 다 닿으면 거기서 멈춘다(가로 · 세로 같은 비율이라 배율은 하나다). 줄일 때는 막지도 밀지도 않는다.
 * 한계는 점 · 핸들을 다 본다. 기준 가운데는 `scaleJamoStrokes`와 같다.
 */
export function limitJamoScale(source: JamoData, factor: number, boundsOf: StrokeBoundsOf): JamoScaleFit {
  const free: JamoScaleFit = { factor, shift: { x: 0, y: 0 } }
  const center = jamoScaleCenter(source)
  if (!Number.isFinite(factor) || factor <= 1 || !center) return free
  // 획마다 점 · 핸들이 차지한 범위와 그 획의 한계. 한계가 획마다 다를 수 있다(섞임홀자의 가로부 · 세로부).
  const spans = renderedStrokesOf(source).flatMap((stroke) => {
    const bounds = boundsOf(stroke.id)
    const points = withHandles(stroke.points)
    if (!bounds || !points.length) return []
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    return [{
      x: { from: Math.min(...xs), to: Math.max(...xs), min: bounds.minX, max: bounds.maxX },
      y: { from: Math.min(...ys), to: Math.max(...ys), min: bounds.minY, max: bounds.maxY },
    }]
  })
  if (!spans.length) return free
  const axes = ['x', 'y'] as const
  // 키운 뒤 통째로 밀어 칸 안에 넣을 자리가 있으려면, 어느 두 획을 잡아도 (한 획의 끝 − 다른 획의 시작) × 배율이 두 한계 사이에 들어야 한다.
  let limit = factor
  for (const axis of axes) {
    for (const head of spans) {
      for (const tail of spans) {
        const length = tail[axis].to - head[axis].from
        if (length > EPSILON) limit = Math.min(limit, (tail[axis].max - head[axis].min) / length)
      }
    }
  }
  const applied = Math.max(1, limit)
  // 그 배율에서 칸 안에 드는 가장 작은 이동. 안 닿았으면 0이다.
  const shiftOn = (axis: 'x' | 'y') => {
    const low = Math.max(...spans.map((span) => span[axis].min - center[axis] - (span[axis].from - center[axis]) * applied))
    const high = Math.min(...spans.map((span) => span[axis].max - center[axis] - (span[axis].to - center[axis]) * applied))
    return Math.min(Math.max(0, low), high)
  }
  return { factor: applied, shift: applied - 1 < EPSILON ? { x: 0, y: 0 } : { x: shiftOn('x'), y: shiftOn('y') } }
}

/** 자소 통째 이동을 글자 칸 안에 가둔다. 어느 점이든 한계에 닿는 만큼까지만 간다(가로 · 세로 따로). */
export function limitJamoMoveDelta(source: JamoData, delta: StrokeMoveDelta, boundsOf: StrokeBoundsOf): StrokeMoveDelta {
  let lowX = -Infinity; let highX = Infinity; let lowY = -Infinity; let highY = Infinity
  for (const stroke of renderedStrokesOf(source)) {
    const bounds = boundsOf(stroke.id)
    if (!bounds) continue
    for (const point of withHandles(stroke.points)) {
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
