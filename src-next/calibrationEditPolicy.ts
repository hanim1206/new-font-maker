import type { BoxConfig, StrokeDataV2 } from '../src/types'
import type { NormalizedBounds } from '../src/utils/containerBoxUtils'

/** 레이아웃 슬롯은 안내선일 뿐, 자모 획 편집의 경계가 아니다. */
export const CALIBRATION_FREEFORM_BOUNDS: NormalizedBounds = {
  minX: Number.NEGATIVE_INFINITY,
  maxX: Number.POSITIVE_INFINITY,
  minY: Number.NEGATIVE_INFINITY,
  maxY: Number.POSITIVE_INFINITY,
}

/**
 * 가로는 글자 칸(em) 끝에서 멈춘다. 잉크가 칸 밖으로 나가면 그리는 단계(`getJamoRenderBox`)가 자모 전체를 반대쪽으로 밀어 넣어,
 * 끄는 점 하나 대신 나머지 획이 움직여 보인다. 그래서 끄는 쪽이 먼저 칸 끝(두께 절반 안쪽)에 선다. 세로는 막지 않는다.
 * 이미 칸 밖에 나가 있는 자모는 지금 범위까지는 그대로 둔다 — 누르자마자 튀지 않게.
 */
export function calibrationEditBounds(
  box: BoxConfig,
  strokes: readonly StrokeDataV2[],
  weightMultiplier = 1,
  horizontalBounds = { min: 0, max: 1 },
): NormalizedBounds {
  if (!strokes.length || !(box.width > 0)) return CALIBRATION_FREEFORM_BOUNDS
  const halfThickness = Math.max(...strokes.map((stroke) => stroke.thickness), 0) * weightMultiplier / 2
  const xs = strokes.flatMap((stroke) => stroke.points.map((point) => point.x))
  const minX = (horizontalBounds.min + halfThickness - box.x) / box.width
  const maxX = (horizontalBounds.max - halfThickness - box.x) / box.width
  return {
    ...CALIBRATION_FREEFORM_BOUNDS,
    minX: Math.min(minX, ...xs),
    maxX: Math.max(maxX, ...xs),
  }
}
