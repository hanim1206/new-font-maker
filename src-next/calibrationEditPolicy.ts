import type { BoxConfig, StrokeDataV2 } from '../src/types'
import type { NormalizedBounds } from '../src/utils/containerBoxUtils'

/** 레이아웃 슬롯은 안내선일 뿐, 자모 획 편집의 경계가 아니다. */
export const CALIBRATION_FREEFORM_BOUNDS: NormalizedBounds = {
  minX: Number.NEGATIVE_INFINITY,
  maxX: Number.POSITIVE_INFINITY,
  minY: Number.NEGATIVE_INFINITY,
  maxY: Number.POSITIVE_INFINITY,
}

type Vec = { x: number; y: number }

/**
 * 끄는 획의 잉크가 중심선에서 축마다 얼마나 나가는지(em). 두께는 획 방향과 직각으로만 퍼진다 —
 * 보(가로 획)는 위아래로만 두께 절반, 기둥(세로 획)은 좌우로만. 끝은 일자라 진행 방향으로는 안 나간다.
 * 비스듬한 구간은 기울기만큼 두 축에 나눠 받고, 곡선은 핸들 구간의 방향까지 본다. 잴 구간이 없으면 두 축 모두 절반.
 */
function inkMargins(strokes: readonly StrokeDataV2[], box: BoxConfig, weightMultiplier: number): { x: number; y: number } {
  const margins = { x: 0, y: 0 }
  for (const stroke of strokes) {
    const half = (stroke.thickness * weightMultiplier) / 2
    const points = stroke.points
    const segments: [Vec, Vec][] = []
    for (let index = 1; index < points.length; index += 1) segments.push([points[index - 1], points[index]])
    if (stroke.closed && points.length > 1) segments.push([points[points.length - 1], points[0]])
    for (const point of points) {
      if (point.handleIn) segments.push([point.handleIn, point])
      if (point.handleOut) segments.push([point, point.handleOut])
    }
    let measured = false
    for (const [from, to] of segments) {
      const dx = (to.x - from.x) * box.width
      const dy = (to.y - from.y) * box.height
      const length = Math.hypot(dx, dy)
      if (length < 1e-9) continue
      measured = true
      margins.x = Math.max(margins.x, (half * Math.abs(dy)) / length)
      margins.y = Math.max(margins.y, (half * Math.abs(dx)) / length)
    }
    if (!measured) {
      margins.x = Math.max(margins.x, half)
      margins.y = Math.max(margins.y, half)
    }
  }
  return margins
}

/**
 * 가로 · 세로 모두 글자 칸(em) 끝에서 멈춘다 — 점이 아니라 끄는 획의 잉크가 칸에 닿을 때.
 * `strokes`에는 이 한계를 받는(끄는) 획만 준다. 여유는 그 획의 두께 × 굵기 배율을 축마다 따로 재서,
 * 보 끝점을 가로로 끌면 중심선이 칸 끝까지 간다 — 잉크가 진행 방향으로는 안 나간다. 자모 전체 최대 두께로 두 축을
 * 다 막으면 굵은 굵기(900)에서 노토가 잉크를 두는 자리에 중심선을 못 놓는다.
 * 잉크가 칸 밖으로 나가면 그리는 단계(`getJamoRenderBox`)가 자모 전체를 반대쪽으로 밀어 넣어,
 * 끄는 점 하나 대신 나머지 획이 움직여 보인다. 그래서 끄는 쪽이 먼저 칸 끝에 선다.
 * 이미 칸 밖에 나가 있는 점 · 핸들은 그 자리까지는 그대로 둔다 — 누르자마자 튀지 않게.
 */
export function calibrationEditBounds(
  box: BoxConfig,
  strokes: readonly StrokeDataV2[],
  weightMultiplier = 1,
  horizontalBounds = { min: 0, max: 1 },
  verticalBounds = { min: 0, max: 1 },
): NormalizedBounds {
  if (!strokes.length || !(box.width > 0) || !(box.height > 0)) return CALIBRATION_FREEFORM_BOUNDS
  const margins = inkMargins(strokes, box, weightMultiplier)
  const points = strokes.flatMap((stroke) => stroke.points).flatMap((point) => [point, ...(point.handleIn ? [point.handleIn] : []), ...(point.handleOut ? [point.handleOut] : [])])
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min((horizontalBounds.min + margins.x - box.x) / box.width, ...xs),
    maxX: Math.max((horizontalBounds.max - margins.x - box.x) / box.width, ...xs),
    minY: Math.min((verticalBounds.min + margins.y - box.y) / box.height, ...ys),
    maxY: Math.max((verticalBounds.max - margins.y - box.y) / box.height, ...ys),
  }
}
