import { describe, expect, it } from 'vitest'
import { polylineToFlatInkGroups, ringSelfIntersects, strokeToFlatInkGroups } from './flatStrokeGeometry'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import type { StrokeDataV2 } from '../types'
import { unionInkRegions } from './inkBoolean'
import { brushInkGroupsToInkRegions } from './inkGeometry'
import type { InkRegion } from '../types'

function area(region: InkRegion): number {
  const ring = region.outer
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

function bounds(regions: InkRegion[]) {
  const points = regions.flatMap((r) => r.outer)
  const round = (v: number) => Number(v.toFixed(9))
  return {
    left: round(Math.min(...points.map((p) => p.x))), right: round(Math.max(...points.map((p) => p.x))),
    top: round(Math.min(...points.map((p) => p.y))), bottom: round(Math.max(...points.map((p) => p.y))),
  }
}

const union = (groups: ReturnType<typeof polylineToFlatInkGroups>) => unionInkRegions(brushInkGroupsToInkRegions(groups), { positionEpsilon: 1e-9, minRingArea: 1e-12 })

describe('polylineToFlatInkGroups', () => {
  it('butt 캡은 끝점에서 자르고 square 캡은 두께 절반만큼 늘린다', () => {
    const line = [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]
    const butt = union(polylineToFlatInkGroups(line, false, 0.1, 'butt', 'miter'))
    expect(butt).toHaveLength(1)
    expect(bounds(butt)).toEqual({ left: 0.2, right: 0.8, top: 0.45, bottom: 0.55 })
    expect(area(butt[0])).toBeCloseTo(0.06, 9)
    const square = union(polylineToFlatInkGroups(line, false, 0.1, 'square', 'miter'))
    expect(bounds(square)).toEqual({ left: 0.15, right: 0.85, top: 0.45, bottom: 0.55 })
  })

  it('직각 꺾임의 miter 조인은 바깥 모서리를 채워 ㄱ이 한 덩어리 사각 모서리가 된다', () => {
    const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const mitered = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter'))
    expect(mitered).toHaveLength(1)
    // 바깥 모서리(1.1, -0.1)가 잉크 안에 있어야 한다.
    expect(bounds(mitered)).toEqual({ left: 0, right: 1.1, top: -0.1, bottom: 1 })
    // 면적 = 가로 1×0.2 + 세로 1×0.2 − 겹침 0.2×0.2 + 모서리 0.1×0.1 … = 두 사각형 union(L자)에 모서리 정사각형까지
    expect(area(mitered[0])).toBeCloseTo(1 * 0.2 + 1.1 * 0.2 - 0.2 * 0.1, 9)
    const beveled = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'bevel'))
    expect(area(beveled[0])).toBeLessThan(area(mitered[0]))
  })

  it('닫힌 사각형은 구멍이 있는 한 면이 된다', () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const ink = union(polylineToFlatInkGroups(square, true, 0.2, 'butt', 'miter'))
    expect(ink).toHaveLength(1)
    expect(ink[0].holes).toHaveLength(1)
    expect(bounds(ink)).toEqual({ left: -0.1, right: 1.1, top: -0.1, bottom: 1.1 })
  })

  it('급한 S자 곡선을 납작한 상자에 놓아도 잉크가 나온다(윤곽이 제 몸을 지나면 조각으로)', () => {
    // 사용자 프리셋 01의 ㄱ 갈고리를 ㅝ 문맥의 납작한 첫닿자 상자에 놓은 경우. 윤곽 하나는 self-intersection이 났다.
    const stroke: StrokeDataV2 = { id: 'ㄱ-1', closed: false, thickness: 0.07, points: [{ x: 0, y: 0.002 }, { x: 1, y: 0.002, handleOut: { x: 1, y: -0.047 } }, { x: 0.92, y: 1, handleIn: { x: 0.995, y: 0.585 } }] }
    const box = { x: 0.1, y: 0.1, width: 0.45, height: 0.22 }
    const groups = strokeToFlatInkGroups(stroke, box, 1, 'butt', 'miter')
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.every((group) => !ringSelfIntersects(group[0]))).toBe(true)
    const ink = materializeFinalGlyphInk([{
      kind: 'centerline', coordinateSpace: 'stroke-local-with-glyph-box', id: 'p', stroke, box, weightMultiplier: 1,
      effectiveLinecap: 'butt', effectiveLinejoin: 'miter',
      source: { kind: 'stroke', glyphId: 'g', part: 'CH', channel: 'strokes', jamoId: 'ㄱ', strokeId: 'ㄱ-1' },
    }], { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 })
    expect(ink.ok).toBe(true)
  })

  it('둥근 캡·조인은 호로 잇는다', () => {
    const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const ink = union(polylineToFlatInkGroups(corner, false, 0.2, 'round', 'round'))
    expect(ink).toHaveLength(1)
    const b = bounds(ink)
    expect(b.left).toBeCloseTo(-0.1, 6)
    expect(b.bottom).toBeCloseTo(1.1, 6)
    expect(b.right).toBeCloseTo(1.1, 6)
    expect(b.top).toBeCloseTo(-0.1, 6)
    // 둥근 모서리는 miter보다 작고 bevel보다 크다.
    const mitered = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter'))
    expect(area(ink[0])).toBeLessThan(area(mitered[0]) + 0.02 * 2)
  })
})
