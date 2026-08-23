import { describe, expect, it } from 'vitest'
import type { StrokeDataV2, StrokeRenderStyle } from '../types'
import type { BrushInkGroup } from './brushGeometry'
import type { Contour } from './strokeToOutline'
import { strokeToRenderInkGroups } from './strokeRenderGeometry'
import {
  brushInkGroupToInkRegion,
  brushInkGroupsToInkRegions,
  inkRegionToBrushInkGroup,
  inkRegionToContours,
  inkRegionsToBrushInkGroups,
  contourGroupToInkRegion,
} from './inkGeometry'

const OUTER = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: 0 },
]
const HOLE = [
  { x: 0.25, y: 0.25 },
  { x: 0.75, y: 0.25 },
  { x: 0.75, y: 0.75 },
  { x: 0.25, y: 0.75 },
]

describe('BrushInkGroup ↔ InkRegion 어댑터', () => {
  it('outer와 hole을 순서·좌표 손실 없이 왕복한다', () => {
    const group: BrushInkGroup = [OUTER, HOLE]
    const region = brushInkGroupToInkRegion(group)
    expect(region).toEqual({ outer: OUTER, holes: [HOLE] })
    expect(inkRegionToBrushInkGroup(region!)).toEqual(group)
  })

  it('입력 점을 공유하거나 변경하지 않는다', () => {
    const group: BrushInkGroup = [structuredClone(OUTER), structuredClone(HOLE)]
    const before = structuredClone(group)
    const region = brushInkGroupToInkRegion(group)!
    region.outer[0].x = 99
    region.holes[0][0].y = 99
    expect(group).toEqual(before)

    const roundTripped = inkRegionToBrushInkGroup({ outer: OUTER, holes: [HOLE] })
    roundTripped[0][0].x = 88
    expect(OUTER[0].x).toBe(0)
  })

  it('유효하지 않은 outer를 버리고 짧은 hole만 제외한다', () => {
    const short = [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    expect(brushInkGroupToInkRegion([short])).toBeNull()
    expect(brushInkGroupsToInkRegions([[OUTER, short], [short]])).toEqual([
      { outer: OUTER, holes: [] },
    ])
    expect(brushInkGroupToInkRegion([short, OUTER, HOLE])).toBeNull()
    const shortContour = short.map(({ x, y }) => ({ x, y, onCurve: true }))
    const outerContour = OUTER.map(({ x, y }) => ({ x, y, onCurve: true }))
    expect(contourGroupToInkRegion([shortContour, outerContour])).toBeNull()
  })

  it('여러 면 묶음의 순서를 유지한다', () => {
    const second = OUTER.map((point) => ({ x: point.x + 2, y: point.y }))
    const regions = brushInkGroupsToInkRegions([[OUTER], [second]])
    expect(inkRegionsToBrushInkGroups(regions)).toEqual([[OUTER], [second]])
  })

  it('CFF contour facade에서 좌표를 보존하고 onCurve로 복원한다', () => {
    const group: Contour[] = [OUTER, HOLE].map((ring) => (
      ring.map(({ x, y }) => ({ x, y, onCurve: false }))
    ))
    const region = contourGroupToInkRegion(group)
    expect(region).toEqual({ outer: OUTER, holes: [HOLE] })
    expect(inkRegionToContours(region!)).toEqual([OUTER, HOLE].map((ring) => (
      ring.map(({ x, y }) => ({ x, y, onCurve: true }))
    )))
  })

  it('기존 비원형 렌더 모드의 점·링·그룹을 exact 보존한다', () => {
    const stroke: StrokeDataV2 = {
      id: 'sample',
      closed: false,
      thickness: 0.08,
      points: [{ x: 0.15, y: 0.25 }, { x: 0.7, y: 0.25 }, { x: 0.8, y: 0.8 }],
    }
    const box = { x: 0.05, y: 0.1, width: 0.85, height: 0.8 }
    const styles: StrokeRenderStyle[] = [
      { mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.5, angle: -35 } },
      { mode: 'brush', brush: { tip: 'rectangle', aspectRatio: 0.5, angle: 37 } },
      { mode: 'angled-area', cutAngle: 35, cornerRadius: 0.2 },
      { mode: 'dot-pattern', dotSize: 1, gap: 0.5, rows: 2, stagger: true, omitEvery: 3 },
      { mode: 'legacy-snapped-centerline' },
    ]

    for (const style of styles) {
      const groups = strokeToRenderInkGroups(stroke, box, 1, style)
      expect(inkRegionsToBrushInkGroups(brushInkGroupsToInkRegions(groups))).toEqual(groups)
    }
  })
})
