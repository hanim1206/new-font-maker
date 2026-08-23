import type { BoxConfig, DotPatternStrokeRenderStyle, StrokeDataV2, StrokeRenderStyle } from '../types'
import {
  createBrushTipPolygon,
  flattenStrokeCenterline,
  strokeToBrushInkGroups,
  type BrushContour,
  type BrushInkGroup,
  type BrushPoint,
} from './brushGeometry'
import { strokeToAngledAreaInkGroups } from './areaStrokeGeometry'
import { strokeToGridSystem2InkGroups } from './gridSystem2Geometry'

const DOT_VERTICES = 16

function interpolateAlongPolyline(points: BrushPoint[], closed: boolean, distance: number): { point: BrushPoint; normal: BrushPoint } | null {
  const segmentCount = closed ? points.length : points.length - 1
  let remaining = distance
  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index]
    const to = points[(index + 1) % points.length]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    if (remaining <= length || index === segmentCount - 1) {
      const factor = Math.max(0, Math.min(1, remaining / length))
      return {
        point: { x: from.x + dx * factor, y: from.y + dy * factor },
        normal: { x: -dy / length, y: dx / length },
      }
    }
    remaining -= length
  }
  return null
}

function polylineLength(points: BrushPoint[], closed: boolean): number {
  const segmentCount = closed ? points.length : points.length - 1
  let total = 0
  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index]
    const to = points[(index + 1) % points.length]
    total += Math.hypot(to.x - from.x, to.y - from.y)
  }
  return total
}

function circle(center: BrushPoint, radius: number): BrushContour {
  return Array.from({ length: DOT_VERTICES }, (_, index) => {
    const radians = index / DOT_VERTICES * Math.PI * 2
    return { x: center.x + Math.cos(radians) * radius, y: center.y + Math.sin(radians) * radius }
  })
}

export function strokeToDotPatternInkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
  style: DotPatternStrokeRenderStyle,
): BrushInkGroup[] {
  const centerline = flattenStrokeCenterline(stroke, box)
  if (centerline.length < 2) return []
  const diameter = Math.max(stroke.thickness * weightMultiplier * style.dotSize, 0.001)
  const step = diameter * (1 + style.gap)
  const total = polylineLength(centerline, stroke.closed)
  const count = Math.max(1, Math.floor(total / step) + (stroke.closed ? 0 : 1))
  const actualStep = stroke.closed ? total / count : total / Math.max(1, count - 1)
  const rowCount = Math.max(1, Math.min(3, Math.round(style.rows)))
  const rowCenter = (rowCount - 1) / 2
  const groups: BrushInkGroup[] = []

  for (let row = 0; row < rowCount; row += 1) {
    const phase = style.stagger && row % 2 === 1 ? actualStep / 2 : 0
    for (let index = 0; index < count; index += 1) {
      if (style.omitEvery >= 2 && (index + 1) % style.omitEvery === 0) continue
      const sample = interpolateAlongPolyline(centerline, stroke.closed, Math.min(total, index * actualStep + phase))
      if (!sample) continue
      const offset = (row - rowCenter) * diameter * (1 + style.gap)
      groups.push([circle({ x: sample.point.x + sample.normal.x * offset, y: sample.point.y + sample.normal.y * offset }, diameter / 2)])
    }
  }
  return groups
}

/** 화면과 폰트 출력이 함께 사용하는 중심선 → 닫힌 잉크 컨투어 디스패처. */
export function strokeToRenderInkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
  style: StrokeRenderStyle,
  options?: { ellipseVertexCount?: number },
): BrushInkGroup[] {
  if (style.mode === 'angled-area') return strokeToAngledAreaInkGroups(stroke, box, weightMultiplier, style)
  if (style.mode === 'dot-pattern') return strokeToDotPatternInkGroups(stroke, box, weightMultiplier, style)
  if (style.mode === 'legacy-snapped-centerline') return strokeToGridSystem2InkGroups(stroke, box, weightMultiplier)
  if (style.brush.tip === 'round') {
    const centerline = flattenStrokeCenterline(stroke, box)
    if (centerline.length < 2) return []
    const tip = { ...style.brush, tip: 'ellipse' as const, aspectRatio: 1 }
    const groups = strokeToBrushInkGroups(stroke, box, weightMultiplier, tip, options?.ellipseVertexCount)
    // 기존 원형은 SVG stroke/정밀 OTF 변환을 유지하므로 이 분기는 외부에서 사용하지 않는다.
    return groups
  }
  return strokeToBrushInkGroups(stroke, box, weightMultiplier, style.brush, options?.ellipseVertexCount)
}

export function createDotPreviewContour(diameter: number): BrushContour {
  return createBrushTipPolygon({ tip: 'ellipse', aspectRatio: 1, angle: 0 }, diameter)
}
