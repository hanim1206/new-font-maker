import type { AnchorPoint, BoxConfig, StrokeDataV2 } from '../types'
import type { BrushInkGroup } from './brushGeometry'
import { strokeToAngledAreaInkGroups } from './areaStrokeGeometry'

export const GRID_SYSTEM_2_UNIT = 0.025
export const GRID_SYSTEM_2_STROKE_UNITS = 3
export const GRID_SYSTEM_2_CUT_ANGLE = 35

function snap(value: number): number {
  return Math.round(value / GRID_SYSTEM_2_UNIT) * GRID_SYSTEM_2_UNIT
}

function snapPointToGlyphGrid(point: { x: number; y: number }, box: BoxConfig): { x: number; y: number } {
  const glyphX = snap(box.x + point.x * box.width)
  const glyphY = snap(box.y + point.y * box.height)
  return {
    x: box.width === 0 ? point.x : (glyphX - box.x) / box.width,
    y: box.height === 0 ? point.y : (glyphY - box.y) / box.height,
  }
}

function snapAnchor(anchor: AnchorPoint, box: BoxConfig): AnchorPoint {
  return {
    ...snapPointToGlyphGrid(anchor, box),
    handleIn: anchor.handleIn ? snapPointToGlyphGrid(anchor.handleIn, box) : undefined,
    handleOut: anchor.handleOut ? snapPointToGlyphGrid(anchor.handleOut, box) : undefined,
  }
}

/** 원본 중심선은 보존하고 렌더 입력만 25-unit 형태 그리드에 투영한다. */
export function snapStrokeToGridSystem2(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
): StrokeDataV2 {
  const requestedThickness = stroke.thickness * weightMultiplier
  const thicknessUnits = Math.max(
    1,
    Math.round(requestedThickness / GRID_SYSTEM_2_UNIT),
  )
  const regularThicknessUnits = weightMultiplier === 1 ? GRID_SYSTEM_2_STROKE_UNITS : thicknessUnits
  return {
    ...stroke,
    points: stroke.points.map((anchor) => snapAnchor(anchor, box)),
    thickness: regularThicknessUnits * GRID_SYSTEM_2_UNIT,
  }
}

/**
 * Grid 2 프로토타입: 정돈된 골격 → 25-unit 배수 획 면 → 규격 곡률 → 35° 평행 절단면.
 */
export function strokeToGridSystem2InkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
): BrushInkGroup[] {
  const snapped = snapStrokeToGridSystem2(stroke, box, weightMultiplier)
  return strokeToAngledAreaInkGroups(snapped, box, 1, {
    mode: 'angled-area',
    cutAngle: GRID_SYSTEM_2_CUT_ANGLE,
    cornerRadius: 1,
  })
}
