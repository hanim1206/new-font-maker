import type { BoxConfig, Padding, StrokeDataV2 } from '../types'

export interface NormalizedBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** 패딩 기준 좌표계에서 원래 파트 박스가 차지하는 허용 범위 */
export function getBoxBoundsInNormalizedCoordinates(
  containerBox: BoxConfig,
  boundaryBox: BoxConfig,
): NormalizedBounds {
  const width = Math.max(0.01, containerBox.width)
  const height = Math.max(0.01, containerBox.height)
  return {
    minX: (boundaryBox.x - containerBox.x) / width,
    maxX: (boundaryBox.x + boundaryBox.width - containerBox.x) / width,
    minY: (boundaryBox.y - containerBox.y) / height,
    maxY: (boundaryBox.y + boundaryBox.height - containerBox.y) / height,
  }
}

/**
 * 자모 패딩을 박스에 적용하여 축소된 박스를 반환
 * padding은 박스 상대 비율 (0~1)
 */
export function applyJamoPaddingToBox(
  bx: number, by: number, bw: number, bh: number,
  padding?: Padding
): BoxConfig {
  if (!padding) return { x: bx, y: by, width: bw, height: bh }
  return {
    x: bx + padding.left * bw,
    y: by + padding.top * bh,
    width: bw * (1 - padding.left - padding.right),
    height: bh * (1 - padding.top - padding.bottom),
  }
}

/**
 * 스트로크의 컨테이너 박스를 절대 좌표(viewBox 단위)로 계산
 * 혼합중성일 경우 수평/수직 파트별 박스를 선택하고 패딩을 적용
 */
export function getContainerBoxAbsForStroke(
  stroke: StrokeDataV2,
  box: BoxConfig,
  viewBoxSize: number,
  options: {
    isMixed?: boolean
    juHBox?: BoxConfig
    juVBox?: BoxConfig
    horizontalStrokeIds?: Set<string>
    verticalStrokeIds?: Set<string>
    jamoPadding?: Padding
    horizontalPadding?: Padding
    verticalPadding?: Padding
  }
): BoxConfig {
  const { isMixed, juHBox, juVBox, horizontalStrokeIds, verticalStrokeIds, jamoPadding, horizontalPadding, verticalPadding } = options

  if (isMixed && juHBox && juVBox && horizontalStrokeIds && verticalStrokeIds) {
    if (horizontalStrokeIds.has(stroke.id)) {
      return applyJamoPaddingToBox(
        juHBox.x * viewBoxSize, juHBox.y * viewBoxSize,
        juHBox.width * viewBoxSize, juHBox.height * viewBoxSize,
        horizontalPadding ?? jamoPadding
      )
    } else if (verticalStrokeIds.has(stroke.id)) {
      return applyJamoPaddingToBox(
        juVBox.x * viewBoxSize, juVBox.y * viewBoxSize,
        juVBox.width * viewBoxSize, juVBox.height * viewBoxSize,
        verticalPadding ?? jamoPadding
      )
    }
  }

  const boxX = box.x * viewBoxSize
  const boxY = box.y * viewBoxSize
  const boxWidth = box.width * viewBoxSize
  const boxHeight = box.height * viewBoxSize
  return applyJamoPaddingToBox(boxX, boxY, boxWidth, boxHeight, jamoPadding)
}
