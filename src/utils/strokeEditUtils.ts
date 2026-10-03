import type { StrokeDataV2, AnchorPoint } from '../types'

/**
 * 두 획을 합칩니다.
 * 가장 가까운 끝점 쌍을 찾아 잇습니다. 첫 번째 획(남는 획)은 그려진 방향 그대로이고,
 * 두 번째 획을 그 앞이나 뒤에 붙입니다(필요하면 두 번째 획만 뒤집습니다).
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

  // 4가지 끝점 쌍의 거리 계산. A는 늘 그려진 방향 그대로 두고 B만 뒤집는다 — A가 남는 획(기둥 등)이라
  // A를 뒤집으면 시작 · 끝이 바뀌어, 첫 점에서 재는 줄기 모양이 형제에 위아래 거꾸로 퍼진다.
  const pairs = [
    { dist: dist2d(aLast, bFirst), bFirstSide: false, bReverse: false },  // A끝→B시작: A + B
    { dist: dist2d(aLast, bLast), bFirstSide: false, bReverse: true },    // A끝→B끝: A + 뒤집은 B
    { dist: dist2d(aFirst, bFirst), bFirstSide: true, bReverse: true },   // A시작→B시작: 뒤집은 B + A
    { dist: dist2d(aFirst, bLast), bFirstSide: true, bReverse: false },   // A시작→B끝: B + A
  ]

  // 가장 가까운 쌍 선택
  const best = pairs.reduce((min, p) => p.dist < min.dist ? p : min, pairs[0])

  // 뒤집을 때는 점마다 들어오는 · 나가는 손잡이도 서로 바꾼다 — 안 바꾸면 손잡이가 엉뚱한 구간에 붙어 곡선이 펴진다.
  const pointsA = structuredClone(strokeA.points)
  const pointsB = best.bReverse ? reversedPoints(strokeB.points) : structuredClone(strokeB.points)

  let mergedPoints: AnchorPoint[]
  if (!best.bFirstSide) {
    // 이음매: A의 마지막 점. B의 첫 점이 거의 같은 자리면 지우되, 그 점이 B 쪽으로 뻗던 손잡이는 이음매 점에 옮겨 단다.
    const joint = pointsA[pointsA.length - 1]
    const dropsB = dist2d(joint, pointsB[0]) < 0.05
    if (dropsB && pointsB[0].handleOut) joint.handleOut = pointsB[0].handleOut
    mergedPoints = [...pointsA, ...(dropsB ? pointsB.slice(1) : pointsB)]
  } else {
    // 이음매: A의 첫 점. B의 마지막 점이 거의 같은 자리면 지우되, 그 점으로 들어오던 손잡이는 이음매 점에 옮겨 단다.
    const joint = pointsA[0]
    const dropsB = dist2d(joint, pointsB[pointsB.length - 1]) < 0.05
    if (dropsB && pointsB[pointsB.length - 1].handleIn) joint.handleIn = pointsB[pointsB.length - 1].handleIn
    mergedPoints = [...(dropsB ? pointsB.slice(0, -1) : pointsB), ...pointsA]
  }

  // 끝 모양 · 꺾임 같은 획 설정은 A 것을 그대로 둔다. 가로 · 세로 같은 이름표는 합치면 맞지 않아 뺀다.
  return {
    ...strokeA,
    id: strokeA.id,
    points: mergedPoints,
    closed: false,
    thickness: (strokeA.thickness + strokeB.thickness) / 2,
    label: undefined,
  }
}

/** 점 순서를 거꾸로. 점마다 `handleIn` ↔ `handleOut`을 바꾼다. */
function reversedPoints(points: AnchorPoint[]): AnchorPoint[] {
  return structuredClone(points).reverse().map(({ handleIn, handleOut, ...point }) => ({
    ...point,
    ...(handleOut ? { handleIn: handleOut } : {}),
    ...(handleIn ? { handleOut: handleIn } : {}),
  }))
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

  // 분리점은 양쪽 획에 포함되지만 같은 객체를 공유하면 안 됩니다.
  // 공유된 상태에서는 한 획을 이동할 때 다른 획의 끝점도 함께 움직입니다.
  const firstHalf = structuredClone(stroke.points.slice(0, pointIndex + 1))
  const secondHalf = structuredClone(stroke.points.slice(pointIndex))

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
    const rest = { ...p }
    delete rest.handleIn
    delete rest.handleOut
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
