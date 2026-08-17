import type { JamoData, StrokeMoveDelta } from '../types'
import type { NormalizedBounds } from '../utils/containerBoxUtils'

const EPSILON = 0.000001

export interface MoveStrokeResult {
  jamo: JamoData
  delta: StrokeMoveDelta
  changed: boolean
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
  const stroke = jamo.strokes?.find((item) => item.id === strokeId)
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

export function formatMoveSummary(delta: StrokeMoveDelta): string {
  const horizontal = Math.abs(delta.x) < EPSILON
    ? ''
    : `${delta.x > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(delta.x * 100).toFixed(1)}`
  const vertical = Math.abs(delta.y) < EPSILON
    ? ''
    : `${delta.y > 0 ? '아래' : '위'} ${Math.abs(delta.y * 100).toFixed(1)}`
  return [horizontal, vertical].filter(Boolean).join(' · ')
}
