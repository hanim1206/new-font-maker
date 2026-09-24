import type { Padding } from '../src/types'
import type { DesignBody, FontSpace } from './calibrationProjectStore'
import { designBodyPaddingForSize } from '../src/services/designBodyPlacement'

const MIN_BODY_SIZE = 100

export function paddingToDesignBody(padding: Padding, fontSpace: FontSpace): DesignBody {
  return {
    x: padding.left * fontSpace.width,
    y: padding.top * fontSpace.height,
    width: (1 - padding.left - padding.right) * fontSpace.width,
    height: (1 - padding.top - padding.bottom) * fontSpace.height,
  }
}

/** 가로 · 세로 크기 → 여백. 남는 칸은 기본 네모꼴의 여백 비율로 나눈다(가운데 정렬이 아니다). 기본 크기면 정확히 기본 네모꼴. */
export function designBodyPaddingOfSize(
  width: number,
  height: number,
  fontSpace: FontSpace,
): Padding {
  const safeWidth = Math.min(fontSpace.width, Math.max(MIN_BODY_SIZE, width))
  const safeHeight = Math.min(fontSpace.height, Math.max(MIN_BODY_SIZE, height))
  return designBodyPaddingForSize(safeWidth, safeHeight, fontSpace)
}
