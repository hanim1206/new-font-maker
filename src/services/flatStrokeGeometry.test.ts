import { describe, expect, it } from 'vitest'
import { contrastWidthOf, polylineToFlatInkGroups, ringSelfIntersects, strokeToFlatInkGroups } from './flatStrokeGeometry'
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

describe('전역 둥글기(roundness)', () => {
  const line = [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]
  const ends = new Set([0, 1])

  it('둥글기 0이면 각진 끝과 점 하나까지 같다', () => {
    const plain = polylineToFlatInkGroups(line, false, 0.1, 'butt', 'miter')
    const zero = polylineToFlatInkGroups(line, false, 0.1, 'butt', 'miter', undefined, { radius: 0, anchors: ends })
    expect(zero).toEqual(plain)
  })

  it('둥글기 1의 직선은 끝이 반원이 되고 잉크가 각진 끝의 네모 밖으로 안 나간다', () => {
    const ink = union(polylineToFlatInkGroups(line, false, 0.1, 'butt', 'miter', undefined, { radius: 0.05, anchors: ends }))
    expect(ink).toHaveLength(1)
    expect(bounds(ink)).toEqual({ left: 0.2, right: 0.8, top: 0.45, bottom: 0.55 })
    // 네모 0.06에서 양 끝 모서리 넷(반지름 0.05의 사분원 밖)이 빠진다. 다각형 호라 조금 더 작다.
    const expected = 0.06 - 4 * (0.05 * 0.05 - Math.PI * 0.05 * 0.05 / 4)
    expect(area(ink[0])).toBeLessThan(0.06)
    expect(area(ink[0])).toBeGreaterThan(expected * 0.98)
    // 끝면 가운데(중심선 끝)에는 잉크가 닿고, 끝 모서리 쪽 점은 전부 반지름 0.05의 원(중심 0.75, 0.5) 위에 있다(3차 곡선 근사, 오차 0.03%).
    const pts = ink[0].outer
    expect(pts.some((p) => Math.abs(p.x - 0.8) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9)).toBe(true)
    const endQuadrant = pts.filter((p) => p.x > 0.75 + 1e-9)
    expect(endQuadrant.length).toBeGreaterThan(4)
    for (const p of endQuadrant) expect(Math.hypot(p.x - 0.75, p.y - 0.5)).toBeCloseTo(0.05, 4)
  })

  it('반쯤(0.5)이면 끝면에 곧은 가운데가 남는다', () => {
    const ink = union(polylineToFlatInkGroups(line, false, 0.1, 'butt', 'miter', undefined, { radius: 0.025, anchors: ends }))
    expect(bounds(ink)).toEqual({ left: 0.2, right: 0.8, top: 0.45, bottom: 0.55 })
    const face = ink[0].outer.filter((p) => Math.abs(p.x - 0.8) < 1e-9).map((p) => p.y).sort()
    expect(face[0]).toBeCloseTo(0.475, 9)
    expect(face[face.length - 1]).toBeCloseTo(0.525, 9)
  })

  it('직각 꺾임은 안팎 모서리가 다 굴려지고, 둥글기 1이면 바깥이 원형 결합과 같다', () => {
    const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const anchors = new Set([0, 1, 2])
    const rounded = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter', undefined, { radius: 0.1, anchors }))
    const mitered = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter'))
    expect(rounded).toHaveLength(1)
    // 바깥 모서리(1.1, -0.1)는 비고, 꼭짓점(1, 0)에서 반폭 안에 든다 = 원형 결합.
    const outerCorner = rounded[0].outer.filter((p) => p.x > 1 && p.y < 0)
    expect(outerCorner.length).toBeGreaterThan(2)
    for (const p of outerCorner) expect(Math.hypot(p.x - 1, p.y)).toBeCloseTo(0.1, 6)
    // 안쪽 모서리(0.9, 0.1)도 호로 파인다: 그 점은 잉크 안쪽 오프셋 교점인데 윤곽에 없다.
    expect(rounded[0].outer.some((p) => Math.abs(p.x - 0.9) < 1e-9 && Math.abs(p.y - 0.1) < 1e-9)).toBe(false)
    expect(area(rounded[0])).toBeLessThan(area(mitered[0]))
  })

  it('곡선을 잘게 편 점은 굴리지 않는다 — 앵커가 아닌 꺾임은 그대로', () => {
    // 세 점을 앵커 없이(끝 둘만 앵커) 주면 가운데 꺾임은 miter 그대로다.
    const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const rounded = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter', undefined, { radius: 0.1, anchors: new Set([0, 2]) }))
    expect(bounds(rounded)).toEqual({ left: 0, right: 1.1, top: -0.1, bottom: 1 })
  })

  it('획 데이터에서는 앵커 자리를 따라 굴리고, 곡선 획도 상자 밖으로 안 나간다', () => {
    const curve: StrokeDataV2 = {
      id: 'c', thickness: 0.1, closed: false,
      points: [{ x: 0.1, y: 0.1, handleOut: { x: 0.9, y: 0.1 } }, { x: 0.9, y: 0.9, handleIn: { x: 0.9, y: 0.1 } }],
    }
    const box = { x: 0, y: 0, width: 1, height: 1 }
    const plain = union(strokeToFlatInkGroups(curve, box, 1, 'butt', 'miter'))
    const rounded = union(strokeToFlatInkGroups(curve, box, 1, 'butt', 'miter', undefined, 1))
    expect(rounded).toHaveLength(1)
    // 끝이 비스듬해 모서리를 굴리면 극점이 아주 조금 안으로 든다. 밖으로는 절대 안 나간다.
    const before = bounds(plain), after = bounds(rounded)
    expect(after.left).toBeGreaterThanOrEqual(before.left - 1e-9)
    expect(after.top).toBeGreaterThanOrEqual(before.top - 1e-9)
    expect(after.right).toBeLessThanOrEqual(before.right + 1e-9)
    expect(after.bottom).toBeLessThanOrEqual(before.bottom + 1e-9)
    expect(area(rounded[0])).toBeLessThan(area(plain[0]))
    expect(area(rounded[0])).toBeGreaterThan(area(plain[0]) * 0.97)
  })

  it('바깥과 안쪽 둥글기를 따로 준다 — 안쪽 0이면 안 모서리는 각지고, 바깥 0이면 끝과 바깥 모서리는 각진다', () => {
    const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const anchors = new Set([0, 1, 2])
    const outerOnly = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter', undefined, { radius: 0.1, innerRadius: 0, anchors }))
    // 안쪽 교점(0.9, 0.1)이 그대로 있고 바깥 모서리(1.1, -0.1)는 비었다.
    expect(outerOnly[0].outer.some((p) => Math.abs(p.x - 0.9) < 1e-9 && Math.abs(p.y - 0.1) < 1e-9)).toBe(true)
    expect(outerOnly[0].outer.some((p) => Math.abs(p.x - 1.1) < 1e-9 && Math.abs(p.y + 0.1) < 1e-9)).toBe(false)
    const innerOnly = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter', undefined, { radius: 0, innerRadius: 0.1, anchors }))
    // 바깥 모서리와 끝면 모서리는 그대로, 안쪽 교점만 호로 파였다.
    expect(bounds(innerOnly)).toEqual({ left: 0, right: 1.1, top: -0.1, bottom: 1 })
    expect(innerOnly[0].outer.some((p) => Math.abs(p.x - 1.1) < 1e-9 && Math.abs(p.y + 0.1) < 1e-9)).toBe(true)
    expect(innerOnly[0].outer.some((p) => Math.abs(p.x) < 1e-9 && Math.abs(p.y - 0.1) < 1e-9)).toBe(true)
    expect(innerOnly[0].outer.some((p) => Math.abs(p.x - 0.9) < 1e-9 && Math.abs(p.y - 0.1) < 1e-9)).toBe(false)
    // 닫힌 획: 안쪽 0이면 구멍은 각진 사각형 그대로.
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const ring = union(polylineToFlatInkGroups(square, true, 0.2, 'butt', 'miter', undefined, { radius: 0.1, innerRadius: 0, anchors: new Set([0, 1, 2, 3]) }))
    expect(ring[0].holes[0]).toHaveLength(4)
    expect(ring[0].outer.length).toBeGreaterThan(4)
  })

  it('가로·세로 대비: 세로 토막은 굵고 가로 토막은 얇으며, ㄱ 꺾임에서 두 폭이 교점으로 만난다', () => {
    const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const width = contrastWidthOf(1) // 세로 1.5 · 가로 0.5
    expect(width({ x: 1, y: 0 })).toBeCloseTo(0.5, 9)
    expect(width({ x: 0, y: 1 })).toBeCloseTo(1.5, 9)
    expect(width({ x: 1, y: 1 })).toBeCloseTo(1, 9)
    const ink = union(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter', undefined, undefined, width))
    expect(ink).toHaveLength(1)
    // 가로 토막 반폭 0.05, 세로 토막 반폭 0.15.
    expect(bounds(ink)).toEqual({ left: 0, right: 1.15, top: -0.05, bottom: 1 })
    // 바깥 모서리 교점(1.15, -0.05)과 안쪽 교점(0.85, 0.05)이 윤곽에 있다.
    expect(ink[0].outer.some((p) => Math.abs(p.x - 1.15) < 1e-9 && Math.abs(p.y + 0.05) < 1e-9)).toBe(true)
    expect(ink[0].outer.some((p) => Math.abs(p.x - 0.85) < 1e-9 && Math.abs(p.y - 0.05) < 1e-9)).toBe(true)
    // 대비 0이면 전과 점 하나까지 같다.
    const plain = polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter')
    expect(polylineToFlatInkGroups(corner, false, 0.2, 'butt', 'miter', undefined, undefined, contrastWidthOf(0))).toEqual(plain)
  })
})
