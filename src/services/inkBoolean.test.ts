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

  it('좌표계별 허용치를 필수 유한값으로 검증한다', () => {
    expect(() => unionInkRegions([], { positionEpsilon: -1, minRingArea: 0 })).toThrow(/positionEpsilon/)
    expect(() => unionInkRegions([], { positionEpsilon: 0, minRingArea: Number.NaN })).toThrow(/minRingArea/)
  })
})
