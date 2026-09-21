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

function crossProduct(first: Pair, second: Pair, third: Pair): number {
  return (second[0] - first[0]) * (third[1] - first[1])
    - (second[1] - first[1]) * (third[0] - first[0])
}

function pointOnSegment(point: Pair, start: Pair, end: Pair, epsilon: number): boolean {
  return Math.abs(crossProduct(start, end, point)) <= epsilon
    && point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon
}

function segmentsIntersect(firstStart: Pair, firstEnd: Pair, secondStart: Pair, secondEnd: Pair, epsilon: number): boolean {
  const firstStartSide = crossProduct(firstStart, firstEnd, secondStart)
  const firstEndSide = crossProduct(firstStart, firstEnd, secondEnd)
  const secondStartSide = crossProduct(secondStart, secondEnd, firstStart)
  const secondEndSide = crossProduct(secondStart, secondEnd, firstEnd)
  const crosses = (firstStartSide > epsilon && firstEndSide < -epsilon || firstStartSide < -epsilon && firstEndSide > epsilon)
    && (secondStartSide > epsilon && secondEndSide < -epsilon || secondStartSide < -epsilon && secondEndSide > epsilon)
  if (crosses) return true
  return pointOnSegment(secondStart, firstStart, firstEnd, epsilon)
    || pointOnSegment(secondEnd, firstStart, firstEnd, epsilon)
    || pointOnSegment(firstStart, secondStart, secondEnd, epsilon)
    || pointOnSegment(firstEnd, secondStart, secondEnd, epsilon)
}

function assertSimpleRing(ring: Ring, options: InkBooleanOptions, label: string): void {
  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error(`${label}에 유한하지 않은 좌표가 있습니다.`)
  }
  for (let first = 0; first < ring.length; first += 1) {
    const firstNext = (first + 1) % ring.length
    for (let second = first + 1; second < ring.length; second += 1) {
      const secondNext = (second + 1) % ring.length
      if (first === second || firstNext === second || secondNext === first) continue
      if (segmentsIntersect(ring[first], ring[firstNext], ring[second], ring[secondNext], options.positionEpsilon)) {
        throw new Error(`${label}에 self-intersection이 있어 Boolean을 수행할 수 없습니다.`)
      }
    }
  }
}

function inkRingToPolygonRing(source: readonly InkPoint[], options: InkBooleanOptions, label: string): Ring {
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
  if (ring.length >= 3) assertSimpleRing(ring, options, label)
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
  const outer = inkRingToPolygonRing(region.outer, options, 'InkRegion outer ring')
  if (outer.length < 3 || Math.abs(signedArea(outer)) < options.minRingArea) return null
  const holes = region.holes
    .map((hole) => inkRingToPolygonRing(hole, options, 'InkRegion hole ring'))
    .filter((ring) => ring.length >= 3 && Math.abs(signedArea(ring)) >= options.minRingArea)
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
 * polygon-clipping은 여러 항을 한 번에 union할 때 드물게 SweepLine에서 터진다
 * ("Unable to find segment ..."). 같은 입력도 둘씩 접으면 통과하므로 그때만 접는다.
 * 그래도 안 되는 한 항은 합치지 않고 따로 둔다. 겹친 자리가 뚫릴 수 있어도
 * 폰트 전체를 못 내보내는 것보다 낫다.
 */
function unionPolygons(polygons: Polygon[]): MultiPolygon {
  try {
    return polygonClipping.union(polygons[0], ...polygons.slice(1))
  } catch {
    let merged: MultiPolygon = [polygons[0]]
    for (const polygon of polygons.slice(1)) {
      try { merged = polygonClipping.union(merged, [polygon]) }
      catch { merged = [...merged, polygon] }
    }
    return merged
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
    : unionPolygons(polygons)

  return result
    .map((polygon) => polygonToInkRegion(polygon, options))
    .filter((region): region is InkRegion => region !== null)
}
