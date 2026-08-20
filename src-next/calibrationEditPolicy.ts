import type { NormalizedBounds } from '../src/utils/containerBoxUtils'

/** 레이아웃 슬롯은 안내선일 뿐, 자모 획 편집의 경계가 아니다. */
export const CALIBRATION_FREEFORM_BOUNDS: NormalizedBounds = {
  minX: Number.NEGATIVE_INFINITY,
  maxX: Number.POSITIVE_INFINITY,
  minY: Number.NEGATIVE_INFINITY,
  maxY: Number.POSITIVE_INFINITY,
}
