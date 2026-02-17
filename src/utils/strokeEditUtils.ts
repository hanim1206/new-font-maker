import type { StrokeDataV2, AnchorPoint } from '../types'

/**
 * 두 획을 합칩니다.
 * 첫 번째 획의 끝점과 두 번째 획의 시작점이 가까우면 연결합니다.
 * 가장 가까운 끝점 쌍을 찾아 자동으로 방향을 결정합니다.
 *
 * @returns 합쳐진 새 stroke, 또는 합칠 수 없으면 null
 */
export function mergeStrokes(strokeA: StrokeDataV2, strokeB: StrokeDataV2): StrokeDataV2 | null {
  if (strokeA.closed || strokeB.closed) return null
  if (strokeA.points.length < 2 || strokeB.points.length < 2) return null

  const aFirst = strokeA.points[0]
  const aLast = strokeA.points[strokeA.points.length - 1]
  const bFirst = strokeB.points[0]
  const bLast = strokeB.points[strokeB.points.length - 1]

  // 4가지 끝점 쌍의 거리 계산
  const pairs = [
    { dist: dist2d(aLast, bFirst), aReverse: false, bReverse: false },   // A끝→B시작
    { dist: dist2d(aLast, bLast), aReverse: false, bReverse: true },     // A끝→B끝
    { dist: dist2d(aFirst, bFirst), aReverse: true, bReverse: false },   // A시작→B시작
    { dist: dist2d(aFirst, bLast), aReverse: true, bReverse: true },     // A시작→B끝
  ]

  // 가장 가까운 쌍 선택
  const best = pairs.reduce((min, p) => p.dist < min.dist ? p : min, pairs[0])

  const pointsA = best.aReverse ? [...strokeA.points].reverse() : [...strokeA.points]
  const pointsB = best.bReverse ? [...strokeB.points].reverse() : [...strokeB.points]

  // 연결점: A의 마지막과 B의 첫 번째의 중간점
  const connectionPt = pointsA[pointsA.length - 1]

  // B의 첫 번째 점이 연결점과 거의 같으면 제거
  const bStartDist = dist2d(connectionPt, pointsB[0])
  const bPoints = bStartDist < 0.05 ? pointsB.slice(1) : pointsB

  const mergedPoints: AnchorPoint[] = [...pointsA, ...bPoints]

  return {
    id: strokeA.id,
    points: mergedPoints,
    closed: false,
    thickness: (strokeA.thickness + strokeB.thickness) / 2,
    label: undefined,
  }
}

/**
 * 획을 선택한 포인트에서 분리합니다.
 * 선택한 포인트가 양쪽 stroke에 모두 포함됩니다.
 *
 * @returns [앞쪽 stroke, 뒤쪽 stroke] 또는 분리 불가 시 null
 */
export function splitStroke(stroke: StrokeDataV2, pointIndex: number): [StrokeDataV2, StrokeDataV2] | null {
  if (stroke.closed) return null
  if (pointIndex <= 0 || pointIndex >= stroke.points.length - 1) return null

  const firstHalf = stroke.points.slice(0, pointIndex + 1)
  const secondHalf = stroke.points.slice(pointIndex)

  const strokeA: StrokeDataV2 = {
    id: stroke.id,
    points: firstHalf,
    closed: false,
    thickness: stroke.thickness,
    label: stroke.label,
  }

  const strokeB: StrokeDataV2 = {
    id: `${stroke.id}-b`,
    points: secondHalf,
    closed: false,
    thickness: stroke.thickness,
    label: stroke.label,
  }

  return [strokeA, strokeB]
}

/**
 * 포인트에 베지어 핸들을 추가하여 곡선화합니다.
 * 인접 포인트 방향으로 핸들을 자동 생성합니다.
 */
export function addHandlesToPoint(
  stroke: StrokeDataV2,
  pointIndex: number,
  handleLength: number = 0.15
): StrokeDataV2 {
  const points = stroke.points
  const point = points[pointIndex]
  if (!point) return stroke

  const prev = pointIndex > 0 ? points[pointIndex - 1] : (stroke.closed ? points[points.length - 1] : null)
  const next = pointIndex < points.length - 1 ? points[pointIndex + 1] : (stroke.closed ? points[0] : null)

  let handleIn: { x: number; y: number } | undefined
  let handleOut: { x: number; y: number } | undefined

  if (prev) {
    const dx = prev.x - point.x
    const dy = prev.y - point.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      handleIn = {
        x: point.x + (dx / len) * handleLength,
        y: point.y + (dy / len) * handleLength,
      }
    }
  }

  if (next) {
    const dx = next.x - point.x
    const dy = next.y - point.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      handleOut = {
        x: point.x + (dx / len) * handleLength,
        y: point.y + (dy / len) * handleLength,
      }
    }
  }

  const newPoints = points.map((p, i) => {
    if (i !== pointIndex) return p
    return { ...p, handleIn, handleOut }
  })

  return { ...stroke, points: newPoints }
}

/**
 * 포인트에서 베지어 핸들을 제거하여 직선화합니다.
 */
export function removeHandlesFromPoint(
  stroke: StrokeDataV2,
  pointIndex: number
): StrokeDataV2 {
  const newPoints = stroke.points.map((p, i) => {
    if (i !== pointIndex) return p
    const { handleIn: _hi, handleOut: _ho, ...rest } = p
    return rest
  })

  return { ...stroke, points: newPoints }
}

/**
 * 포인트에 핸들이 있는지 확인
 */
export function pointHasHandles(stroke: StrokeDataV2, pointIndex: number): boolean {
  const point = stroke.points[pointIndex]
  return !!(point?.handleIn || point?.handleOut)
}

// 2D 유클리드 거리
function dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}
