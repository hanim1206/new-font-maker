import { describe, expect, it } from 'vitest'
import type { BrushStyle, StrokeDataV2 } from '../src/types'
import {
  brushInkGroupsToFontContours,
  createBrushTipPolygon,
  flattenStrokeCenterline,
  strokeToBrushInkGroups,
} from '../src/services/brushGeometry'

const box = { x: 0, y: 0, width: 1, height: 1 }
const ellipse: BrushStyle = { tip: 'ellipse', aspectRatio: 0.5, angle: 0 }

function straight(points: StrokeDataV2['points']): StrokeDataV2 {
  return { id: 'line', closed: false, thickness: 0.1, points }
}

function bounds(groups: ReturnType<typeof strokeToBrushInkGroups>) {
  const points = groups.flat(2)
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

describe('고정각 붓촉 sweep', () => {
  it('직선 방향과 무관하게 붓촉 각도를 고정한다', () => {
    const horizontal = bounds(strokeToBrushInkGroups(straight([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]), box, 1, ellipse))
    const vertical = bounds(strokeToBrushInkGroups(straight([{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }]), box, 1, ellipse))
    expect(horizontal.maxY - horizontal.minY).toBeCloseTo(0.05, 4)
    expect(vertical.maxX - vertical.minX).toBeCloseTo(0.1, 4)
  })

  it('사각형 대각선이 획 지름과 같아 원형 반경을 넘지 않는다', () => {
    const polygon = createBrushTipPolygon({ tip: 'rectangle', aspectRatio: 0.5, angle: 37 }, 0.1)
    expect(Math.max(...polygon.map((point) => Math.hypot(point.x, point.y)))).toBeCloseTo(0.05, 8)
  })

  it('열린 획 양 끝에 붓촉 전체를 남긴다', () => {
    const result = bounds(strokeToBrushInkGroups(straight([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]), box, 1, ellipse))
    expect(result.minX).toBeCloseTo(0.15, 4)
    expect(result.maxX).toBeCloseTo(0.85, 4)
  })

  it('베지어를 허용 오차 안의 polyline으로 세분화한다', () => {
    const curved = straight([
      { x: 0.1, y: 0.8, handleOut: { x: 0.1, y: 0.1 } },
      { x: 0.9, y: 0.8, handleIn: { x: 0.9, y: 0.1 } },
    ])
    const flattened = flattenStrokeCenterline(curved, box)
    expect(flattened.length).toBeGreaterThan(10)
    expect(Math.min(...flattened.map((point) => point.y))).toBeLessThan(0.3)
  })

  it('폰트 투영에서 y축과 각도 의미를 함께 보존한다', () => {
    const groups = strokeToBrushInkGroups(straight([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]), box, 1, { ...ellipse, angle: -35 })
    const projected = brushInkGroupsToFontContours(groups, 1000, 880, 0).flat(2)
    expect(projected.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(Math.min(...projected.map((point) => point.x))).toBeLessThan(200)
    expect(Math.max(...projected.map((point) => point.x))).toBeGreaterThan(800)
  })
})
