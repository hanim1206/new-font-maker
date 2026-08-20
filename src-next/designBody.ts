import type { Padding } from '../src/types'
import type { DesignBody, FontSpace } from './calibrationProjectStore'

const MIN_BODY_SIZE = 100

export function paddingToDesignBody(padding: Padding, fontSpace: FontSpace): DesignBody {
  return {
    x: padding.left * fontSpace.width,
    y: padding.top * fontSpace.height,
    width: (1 - padding.left - padding.right) * fontSpace.width,
    height: (1 - padding.top - padding.bottom) * fontSpace.height,
  }
}

export function centeredDesignBodyPadding(
  width: number,
  height: number,
  fontSpace: FontSpace,
): Padding {
  const safeWidth = Math.min(fontSpace.width, Math.max(MIN_BODY_SIZE, width))
  const safeHeight = Math.min(fontSpace.height, Math.max(MIN_BODY_SIZE, height))
  const horizontalInset = (fontSpace.width - safeWidth) / 2 / fontSpace.width
  const verticalInset = (fontSpace.height - safeHeight) / 2 / fontSpace.height
  return {
    top: verticalInset,
    right: horizontalInset,
    bottom: verticalInset,
    left: horizontalInset,
  }
}
