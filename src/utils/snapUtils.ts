import type { StrokeDataV2 } from '../types'

// === 상수 ===

/** 그리드 간격 (가시 그리드 + 키보드 MOVE_STEP과 동일) */
export const GRID_STEP = 0.025

/** 그리드 스냅 감지 거리 (GRID_STEP의 40%) */
export const GRID_SNAP_THRESHOLD = 0.01

/** 교차 획 스냅 감지 거리 (그리드보다 넓음) */
export const CROSS_SNAP_THRESHOLD = 0.015

/** 병합 힌트 표시 거리 */
export const MERGE_PROXIMITY = 0.03

// === 타입 ===

export interface SnapTarget {
  x: number
  y: number
  type: 'endpoint' | 'midpoint'
  strokeId: string
}

export interface SnapGuideLine {
  axis: 'x' | 'y'
  value: number // 0~1 정규화 좌표
  type: 'grid' | 'endpoint' | 'midpoint'
  targetStrokeId?: string
}

export interface SnapResult {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
  guideLines: SnapGuideLine[]
}

export interface MergeHint {
  sourceStrokeId: string
  sourcePointIndex: number
  targetStrokeId: string
  targetPointIndex: number
  targetPoint: { x: number; y: number }
  distance: number
}

// === 핵심 함수 ===

/**
 * 단일 값을 GRID_STEP 그리드에 스냅
 * threshold 이내면 스냅, 아니면 원래 값 유지
 */
export function snapToGrid(
  value: number,
  threshold: number = GRID_SNAP_THRESHOLD
): { snapped: number; didSnap: boolean } {
  const nearest = Math.round(value / GRID_STEP) * GRID_STEP
  const dist = Math.abs(value - nearest)
  if (dist <= threshold) {
    return { snapped: Math.round(nearest * 1000) / 1000, didSnap: true }
  }
  return { snapped: value, didSnap: false }
}

/**
 * 다른 획들의 스냅 타겟 수집
 * 각 획의 앵커 포인트 좌표 + 세그먼트 중간점
 */
export function collectSnapTargets(
  strokes: StrokeDataV2[],
  excludeStrokeId: string
): SnapTarget[] {
  const targets: SnapTarget[] = []

  for (const stroke of strokes) {
    if (stroke.id === excludeStrokeId) continue

    for (let i = 0; i < stroke.points.length; i++) {
      const pt = stroke.points[i]
      const isEndpoint = i === 0 || i === stroke.points.length - 1
      targets.push({
        x: pt.x,
        y: pt.y,
        type: isEndpoint ? 'endpoint' : 'midpoint',
        strokeId: stroke.id,
      })
    }

    // 세그먼트 중간점 (직선 기준: 인접 두 점의 평균)
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const a = stroke.points[i]
      const b = stroke.points[i + 1]
      targets.push({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        type: 'midpoint',
        strokeId: stroke.id,
      })
    }
  }

  return targets
}

/**
 * 포인트를 스냅 (X/Y 독립)
 * 우선순위: ① 교차 획 끝점 ② 교차 획 중간점 ③ 그리드
 */
export function snapPoint(
  x: number,
  y: number,
  targets: SnapTarget[]
): SnapResult {
  const guideLines: SnapGuideLine[] = []
  let finalX = x
  let finalY = y
  let snappedX = false
  let snappedY = false

  // 교차 획 스냅 (우선순위 높음)
  // endpoint가 midpoint보다 우선
  let bestCrossX: { value: number; dist: number; target: SnapTarget } | null = null
  let bestCrossY: { value: number; dist: number; target: SnapTarget } | null = null

  for (const target of targets) {
    const distX = Math.abs(x - target.x)
    const distY = Math.abs(y - target.y)

    // X축 스냅
    if (distX <= CROSS_SNAP_THRESHOLD) {
      const priority = target.type === 'endpoint' ? 0 : 1
      const currentPriority = bestCrossX ? (bestCrossX.target.type === 'endpoint' ? 0 : 1) : 2
      if (priority < currentPriority || (priority === currentPriority && distX < (bestCrossX?.dist ?? Infinity))) {
        bestCrossX = { value: target.x, dist: distX, target }
      }
    }

    // Y축 스냅
    if (distY <= CROSS_SNAP_THRESHOLD) {
      const priority = target.type === 'endpoint' ? 0 : 1
      const currentPriority = bestCrossY ? (bestCrossY.target.type === 'endpoint' ? 0 : 1) : 2
      if (priority < currentPriority || (priority === currentPriority && distY < (bestCrossY?.dist ?? Infinity))) {
        bestCrossY = { value: target.y, dist: distY, target }
      }
    }
  }

  // X축: 교차 스냅 > 그리드 스냅
  if (bestCrossX) {
    finalX = bestCrossX.value
    snappedX = true
    guideLines.push({
      axis: 'x',
      value: bestCrossX.value,
      type: bestCrossX.target.type,
      targetStrokeId: bestCrossX.target.strokeId,
    })
  } else {
    const gridX = snapToGrid(x)
    if (gridX.didSnap) {
      finalX = gridX.snapped
      snappedX = true
      guideLines.push({ axis: 'x', value: gridX.snapped, type: 'grid' })
    }
  }

  // Y축: 교차 스냅 > 그리드 스냅
  if (bestCrossY) {
    finalY = bestCrossY.value
    snappedY = true
    guideLines.push({
      axis: 'y',
      value: bestCrossY.value,
      type: bestCrossY.target.type,
      targetStrokeId: bestCrossY.target.strokeId,
    })
  } else {
    const gridY = snapToGrid(y)
    if (gridY.didSnap) {
      finalY = gridY.snapped
      snappedY = true
      guideLines.push({ axis: 'y', value: gridY.snapped, type: 'grid' })
    }
  }

  return { x: finalX, y: finalY, snappedX, snappedY, guideLines }
}

/**
 * 병합 힌트 감지
 * 드래그 중인 포인트가 끝점이고, 다른 획의 끝점과 가까우면 힌트 반환
 */
export function detectMergeHint(
  strokes: StrokeDataV2[],
  dragStrokeId: string,
  dragPointIndex: number
): MergeHint | null {
  const dragStroke = strokes.find(s => s.id === dragStrokeId)
  if (!dragStroke || dragStroke.closed) return null

  // 끝점만 병합 가능
  const isEndpoint = dragPointIndex === 0 || dragPointIndex === dragStroke.points.length - 1
  if (!isEndpoint) return null

  const dragPoint = dragStroke.points[dragPointIndex]
  let best: MergeHint | null = null

  for (const stroke of strokes) {
    if (stroke.id === dragStrokeId || stroke.closed) continue

    // 다른 획의 끝점만 검사
    const endpoints = [
      { index: 0, point: stroke.points[0] },
      { index: stroke.points.length - 1, point: stroke.points[stroke.points.length - 1] },
    ]

    for (const ep of endpoints) {
      const dist = Math.sqrt(
        (dragPoint.x - ep.point.x) ** 2 + (dragPoint.y - ep.point.y) ** 2
      )
      if (dist <= MERGE_PROXIMITY && (!best || dist < best.distance)) {
        best = {
          sourceStrokeId: dragStrokeId,
          sourcePointIndex: dragPointIndex,
          targetStrokeId: stroke.id,
          targetPointIndex: ep.index,
          targetPoint: { x: ep.point.x, y: ep.point.y },
          distance: dist,
        }
      }
    }
  }

  return best
}
