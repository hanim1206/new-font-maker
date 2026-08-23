import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../src/types'
import {
  GRID_SYSTEM_2_CUT_ANGLE,
  GRID_SYSTEM_2_UNIT,
  snapStrokeToGridSystem2,
  strokeToGridSystem2InkGroups,
} from '../src/services/gridSystem2Geometry'

const box = { x: 0.075, y: 0.075, width: 0.85, height: 0.85 }
const stroke: StrokeDataV2 = {
  id: 'grid-2',
  closed: false,
  thickness: 0.07,
  points: [
    { x: 0.013, y: 0.021, handleOut: { x: 0.287, y: 0.019 } },
    { x: 0.992, y: 0.987, handleIn: { x: 0.711, y: 0.991 } },
  ],
}

function isOnGrid(value: number): boolean {
  return Math.abs(value / GRID_SYSTEM_2_UNIT - Math.round(value / GRID_SYSTEM_2_UNIT)) < 1e-8
}

describe('그리드 시스템 2 형태 생성', () => {
  it('원본은 바꾸지 않고 앵커와 베지어 핸들을 25-unit 형태 그리드에 정돈한다', () => {
    const before = structuredClone(stroke)
    const snapped = snapStrokeToGridSystem2(stroke, box, 1)
    const glyphPoints = snapped.points.flatMap((point) => [point, point.handleIn, point.handleOut].filter(Boolean)).map((point) => ({
      x: box.x + point!.x * box.width,
      y: box.y + point!.y * box.height,
    }))
    expect(glyphPoints.every((point) => isOnGrid(point.x) && isOnGrid(point.y))).toBe(true)
    expect(stroke).toEqual(before)
  })

  it('기본 70-unit 획을 형태 그리드 3칸인 75-unit으로 정돈한다', () => {
    expect(snapStrokeToGridSystem2(stroke, box, 1).thickness).toBeCloseTo(0.075, 8)
  })

  it('정돈된 골격을 닫힌 벡터 면으로 만들고 모든 끝면에 35°를 사용한다', () => {
    const straight: StrokeDataV2 = { id: 'line', closed: false, thickness: 0.07, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] }
    const contour = strokeToGridSystem2InkGroups(straight, box, 1)[0][0]
    const first = contour[0]
    const last = contour.at(-1)!
    const raw = Math.atan2(last.y - first.y, last.x - first.x) * 180 / Math.PI
    const angle = ((raw % 180) + 180) % 180
    expect(angle).toBeCloseTo(GRID_SYSTEM_2_CUT_ANGLE, 5)
    expect(contour.length).toBeGreaterThanOrEqual(4)
    expect(contour.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })
})
