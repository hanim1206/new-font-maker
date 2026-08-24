import { describe, expect, it } from 'vitest'
import type { InkPoint, InkRegion, InkRing } from '../types'
import { unionInkRegions, type InkBooleanOptions } from './inkBoolean'

const NORMALIZED: InkBooleanOptions = {
  positionEpsilon: 1e-9,
  minRingArea: 1e-9,
}

function rectangle(x: number, y: number, width: number, height: number): InkRegion {
  return {
    outer: [
      { x, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width, y },
    ],
    holes: [],
  }
}

function ring(outer: InkRing, holes: InkRing[] = []): InkRegion {
  return { outer, holes }
}

function signedArea(ring: InkRing): number {
  return ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function pointInRing(target: InkPoint, ring: InkRing): boolean {
  let inside = false
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex++) {
    const current = ring[currentIndex]
    const previous = ring[previousIndex]
    const crosses = (current.y > target.y) !== (previous.y > target.y)
      && target.x < ((previous.x - current.x) * (target.y - current.y)) / (previous.y - current.y) + current.x
    if (crosses) inside = !inside
  }
  return inside
}

function filled(target: InkPoint, regions: InkRegion[]): boolean {
  return regions.some((region) => pointInRing(target, region.outer)
    && !region.holes.some((hole) => pointInRing(target, hole)))
}

function topology(regions: InkRegion[]) {
  return {
    regions: regions.length,
    holes: regions.map((region) => region.holes.length),
  }
}

describe('좌표계 독립 InkRegion Boolean', () => {
  it('교차하는 두 면을 하나로 합치고 교차부를 채운다', () => {
    const vertical = rectangle(0.4, 0, 0.2, 1)
    const horizontal = rectangle(0, 0.4, 1, 0.2)
    const merged = unionInkRegions([vertical, horizontal], NORMALIZED)
    expect(merged).toHaveLength(1)
    expect(filled({ x: 0.5, y: 0.5 }, merged)).toBe(true)
  })

  it('꼭짓점만 닿는 positive 면은 별개의 island로 유지한다', () => {
    const merged = unionInkRegions([
      rectangle(0, 0, 1, 1),
      rectangle(1, 1, 1, 1),
    ], NORMALIZED)

    expect(topology(merged)).toEqual({ regions: 2, holes: [0, 0] })
    expect(filled({ x: 0.5, y: 0.5 }, merged)).toBe(true)
    expect(filled({ x: 1.5, y: 1.5 }, merged)).toBe(true)
  })

  it('변을 공유하거나 완전히 겹치는 positive 면은 하나의 region으로 합친다', () => {
    const sharedEdge = unionInkRegions([
      rectangle(0, 0, 1, 1),
      rectangle(1, 0, 1, 1),
    ], NORMALIZED)
    const fullOverlap = unionInkRegions([
      rectangle(0, 0, 1, 1),
      rectangle(0, 0, 1, 1),
    ], NORMALIZED)

    expect(topology(sharedEdge)).toEqual({ regions: 1, holes: [0] })
    expect(filled({ x: 1.5, y: 0.5 }, sharedEdge)).toBe(true)
    expect(topology(fullOverlap)).toEqual({ regions: 1, holes: [0] })
  })

  it('outer와 hole의 위상을 유지하고 방향을 정규화한다', () => {
    const ring: InkRegion = {
      outer: rectangle(0, 0, 1, 1).outer,
      holes: [[
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
      ]],
    }
    const merged = unionInkRegions([ring], NORMALIZED)
    expect(topology(merged)).toEqual({ regions: 1, holes: [1] })
    expect(signedArea(merged[0].outer)).toBeLessThan(0)
    expect(signedArea(merged[0].holes[0])).toBeGreaterThan(0)
    expect(filled({ x: 0.5, y: 0.5 }, merged)).toBe(false)
    expect(filled({ x: 0.1, y: 0.5 }, merged)).toBe(true)
  })

  it('hole 경계에 닿는 positive 잉크는 hole의 해당 부분만 채운다', () => {
    const merged = unionInkRegions([
      ring(rectangle(0, 0, 4, 4).outer, [rectangle(1, 1, 2, 2).outer]),
      rectangle(1, 1.5, 1, 1),
    ], NORMALIZED)

    expect(topology(merged)).toEqual({ regions: 1, holes: [1] })
    expect(filled({ x: 1.5, y: 2 }, merged)).toBe(true)
    expect(filled({ x: 2.5, y: 1.5 }, merged)).toBe(false)
    expect(filled({ x: 0.5, y: 2 }, merged)).toBe(true)
  })

  it('hole 안에 분리된 positive island를 hole 밖으로 합치지 않는다', () => {
    const merged = unionInkRegions([
      ring(rectangle(0, 0, 4, 4).outer, [rectangle(1, 1, 2, 2).outer]),
      rectangle(1.25, 1.25, 0.5, 0.5),
    ], NORMALIZED)

    expect(topology(merged)).toEqual({ regions: 2, holes: [1, 0] })
    expect(filled({ x: 1.5, y: 1.5 }, merged)).toBe(true)
    expect(filled({ x: 1.1, y: 1.1 }, merged)).toBe(false)
  })

  it('떨어진 면은 union을 건너뛰며 입력 순서를 유지한다', () => {
    const first = rectangle(0, 0, 1, 1)
    const second = rectangle(3, 0, 1, 1)
    expect(unionInkRegions([first, second], NORMALIZED)).toEqual([first, second])
  })

  it('deep-frozen 입력을 변경하지 않는다', () => {
    const input = [rectangle(0.4, 0, 0.2, 1), rectangle(0, 0.4, 1, 0.2)]
    const before = structuredClone(input)
    for (const region of input) {
      Object.freeze(region.outer)
      Object.freeze(region.holes)
      Object.freeze(region)
    }
    Object.freeze(input)
    expect(() => unionInkRegions(input, NORMALIZED)).not.toThrow()
    expect(input).toEqual(before)
  })

  it('좌표와 tolerance를 함께 확대해도 topology가 같다', () => {
    const source = [rectangle(0.4, 0, 0.2, 1), rectangle(0, 0.4, 1, 0.2)]
    const scale = 1000
    const scaled = source.map((region) => ({
      outer: region.outer.map(({ x, y }) => ({ x: x * scale, y: y * scale })),
      holes: region.holes.map((hole) => hole.map(({ x, y }) => ({ x: x * scale, y: y * scale }))),
    }))
    expect(topology(unionInkRegions(scaled, {
      positionEpsilon: NORMALIZED.positionEpsilon * scale,
      minRingArea: NORMALIZED.minRingArea * scale * scale,
    }))).toEqual(topology(unionInkRegions(source, NORMALIZED)))
  })

  it('minRingArea보다 작은 outer와 hole은 positive ink로 승격하지 않는다', () => {
    const tiny = rectangle(0, 0, 0.00001, 0.00001)
    const withTinyHole = ring(rectangle(0, 0, 1, 1).outer, [
      rectangle(0.5, 0.5, 0.00001, 0.00001).outer,
    ])

    expect(unionInkRegions([tiny], NORMALIZED)).toEqual([])
    expect(topology(unionInkRegions([withTinyHole], NORMALIZED))).toEqual({ regions: 1, holes: [0] })
    expect(filled({ x: 0.5, y: 0.5 }, unionInkRegions([withTinyHole], NORMALIZED))).toBe(true)
  })

  it('self-intersection 입력은 일부 윤곽을 만들지 않고 fail-closed한다', () => {
    const bowTie = ring([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ])

    expect(() => unionInkRegions([bowTie], NORMALIZED)).toThrow(/self-intersection/)
  })

  it('좌표계별 허용치를 필수 유한값으로 검증한다', () => {
    expect(() => unionInkRegions([], { positionEpsilon: -1, minRingArea: 0 })).toThrow(/positionEpsilon/)
    expect(() => unionInkRegions([], { positionEpsilon: 0, minRingArea: Number.NaN })).toThrow(/minRingArea/)
  })
})
