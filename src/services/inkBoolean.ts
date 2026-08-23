import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from 'polygon-clipping'
import type { InkPoint, InkRegion, InkRing } from '../types'

export interface InkBooleanOptions {
  /** 입력 좌표계 단위로 표현한 중복점 허용 오차. */
  positionEpsilon: number
  /** 입력 좌표계 제곱 단위로 표현한 최소 링 면적. */
  minRingArea: number
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function samePosition(first: Pair, second: Pair, epsilon: number): boolean {
  return Math.abs(first[0] - second[0]) <= epsilon
    && Math.abs(first[1] - second[1]) <= epsilon
}

function signedArea(points: ArrayLike<readonly [number, number]>): number {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area / 2
}

function inkRingToPolygonRing(source: readonly InkPoint[], options: InkBooleanOptions): Ring {
  const ring: Ring = []
  for (const point of source) {
    const pair: Pair = [point.x, point.y]
    if (ring.length === 0 || !samePosition(ring[ring.length - 1], pair, options.positionEpsilon)) {
      ring.push(pair)
    }
  }
  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1], options.positionEpsilon)) {
    ring.pop()
  }
  return ring
}

function normalizeRing(
  ring: Ring,
  direction: 'cw' | 'ccw',
  options: InkBooleanOptions,
): InkRing | null {
  const cleaned: Pair[] = []
  for (const pair of ring) {
    if (cleaned.length === 0 || !samePosition(cleaned[cleaned.length - 1], pair, options.positionEpsilon)) {
      cleaned.push(pair)
    }
  }
  if (cleaned.length > 1 && samePosition(cleaned[0], cleaned[cleaned.length - 1], options.positionEpsilon)) {
    cleaned.pop()
  }
  const area = signedArea(cleaned)
  if (cleaned.length < 3 || Math.abs(area) < options.minRingArea) return null

  const shouldReverse = direction === 'cw' ? area > 0 : area < 0
  const directed = shouldReverse ? [...cleaned].reverse() : cleaned
  return directed.map(([x, y]) => ({ x, y }))
}

function inkRegionToPolygon(region: Readonly<InkRegion>, options: InkBooleanOptions): Polygon | null {
  const outer = inkRingToPolygonRing(region.outer, options)
  if (outer.length < 3) return null
  const holes = region.holes
    .map((hole) => inkRingToPolygonRing(hole, options))
    .filter((ring) => ring.length >= 3)
  return [outer, ...holes]
}

function polygonToInkRegion(polygon: Polygon, options: InkBooleanOptions): InkRegion | null {
  const outer = normalizeRing(polygon[0], 'cw', options)
  if (!outer) return null
  const holes = polygon
    .slice(1)
    .map((ring) => normalizeRing(ring, 'ccw', options))
    .filter((ring): ring is InkRing => ring !== null)
  return { outer, holes }
}

function polygonBounds(polygon: Polygon): Bounds {
  const outer = polygon[0]
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const [x, y] of outer) {
    bounds.minX = Math.min(bounds.minX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.maxY = Math.max(bounds.maxY, y)
  }
  return bounds
}

function boundsOverlap(first: Bounds, second: Bounds): boolean {
  return first.minX <= second.maxX && second.minX <= first.maxX
    && first.minY <= second.maxY && second.minY <= first.maxY
}

function hasPossibleOverlap(polygons: Polygon[]): boolean {
  const bounds = polygons.map(polygonBounds)
  for (let first = 0; first < bounds.length; first += 1) {
    for (let second = first + 1; second < bounds.length; second += 1) {
      if (boundsOverlap(bounds[first], bounds[second])) return true
    }
  }
  return false
}

function validateOptions(options: InkBooleanOptions): void {
  if (!Number.isFinite(options.positionEpsilon) || options.positionEpsilon < 0) {
    throw new Error('positionEpsilon은 0 이상의 유한한 값이어야 합니다.')
  }
  if (!Number.isFinite(options.minRingArea) || options.minRingArea < 0) {
    throw new Error('minRingArea는 0 이상의 유한한 값이어야 합니다.')
  }
}

/**
 * 좌표계의 크기나 방향을 가정하지 않고, 호출자가 넘긴 정밀도 정책으로
 * 잉크 면을 합친다. 결과 outer는 CW, hole은 CCW로 정규화한다.
 */
export function unionInkRegions(
  regions: readonly Readonly<InkRegion>[],
  options: InkBooleanOptions,
): InkRegion[] {
  validateOptions(options)
  const polygons = regions
    .map((region) => inkRegionToPolygon(region, options))
    .filter((polygon): polygon is Polygon => polygon !== null)

  if (polygons.length === 0) return []
  const result: MultiPolygon = polygons.length === 1 || !hasPossibleOverlap(polygons)
    ? polygons.map((polygon) => polygon)
    : polygonClipping.union(polygons[0], ...polygons.slice(1))

  return result
    .map((polygon) => polygonToInkRegion(polygon, options))
    .filter((region): region is InkRegion => region !== null)
}
