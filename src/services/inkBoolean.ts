import * as polygonBoolean from './polygonBoolean'
import type { MultiPolygon, Pair, Polygon, Ring } from './polygonBoolean'
import type { InkPoint, InkRegion, InkRing } from '../types'

export interface InkBooleanOptions {
  /** 입력 좌표계 단위로 표현한 중복점 허용 오차. */
  positionEpsilon: number
  /** 입력 좌표계 제곱 단위로 표현한 최소 링 면적. */
  minRingArea: number
  /**
   * 스스로 겹친 링을 만나면 던지지 않고 Clipper2 union(NonZero)으로 푼다. 기본은 던진다(fail-closed).
   * 스트로커가 만든 획 윤곽처럼 NonZero가 맞는 채우기일 때만 켠다(OTF 합치기).
   */
  resolveSelfIntersections?: boolean
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

function assertFiniteRing(ring: Ring, label: string): void {
  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error(`${label}에 유한하지 않은 좌표가 있습니다.`)
  }
}

function isSimpleRing(ring: Ring, options: InkBooleanOptions): boolean {
  for (let first = 0; first < ring.length; first += 1) {
    const firstNext = (first + 1) % ring.length
    for (let second = first + 1; second < ring.length; second += 1) {
      const secondNext = (second + 1) % ring.length
      if (first === second || firstNext === second || secondNext === first) continue
      if (segmentsIntersect(ring[first], ring[firstNext], ring[second], ring[secondNext], options.positionEpsilon)) return false
    }
  }
  return true
}

/** 링 하나를 정리한다. 스스로 겹쳤으면 옵션에 따라 던지거나 `selfIntersecting`에 표시한다. */
function inkRingToPolygonRing(source: readonly InkPoint[], options: InkBooleanOptions, label: string, flags: { selfIntersecting: boolean }): Ring {
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
  if (ring.length >= 3) {
    assertFiniteRing(ring, label)
    if (!isSimpleRing(ring, options)) {
      if (!options.resolveSelfIntersections) throw new Error(`${label}에 self-intersection이 있어 Boolean을 수행할 수 없습니다.`)
      flags.selfIntersecting = true
    }
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

function inkRegionToPolygon(region: Readonly<InkRegion>, options: InkBooleanOptions, flags: { selfIntersecting: boolean }): Polygon | null {
  const outer = inkRingToPolygonRing(region.outer, options, 'InkRegion outer ring', flags)
  // 스스로 겹친 링은 부호 면적이 서로 상쇄돼 작게 나올 수 있어 면적으로 거르지 않는다.
  if (outer.length < 3 || (!flags.selfIntersecting && Math.abs(signedArea(outer)) < options.minRingArea)) return null
  const holes = region.holes
    .map((hole) => inkRingToPolygonRing(hole, options, 'InkRegion hole ring', flags))
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
 * 좌표계의 크기나 방향을 가정하지 않고, 호출자가 넘긴 정밀도 정책으로
 * 잉크 면을 합친다. 결과 outer는 CW, hole은 CCW로 정규화한다.
 */
export function unionInkRegions(
  regions: readonly Readonly<InkRegion>[],
  options: InkBooleanOptions,
): InkRegion[] {
  validateOptions(options)
  const flags = { selfIntersecting: false }
  const polygons = regions
    .map((region) => inkRegionToPolygon(region, options, flags))
    .filter((polygon): polygon is Polygon => polygon !== null)

  if (polygons.length === 0) return []
  // 스스로 겹친 링이 있으면 하나뿐이어도 union을 거쳐 겹침 없는 링으로 푼다.
  const result: MultiPolygon = !flags.selfIntersecting && (polygons.length === 1 || !hasPossibleOverlap(polygons))
    ? polygons.map((polygon) => polygon)
    : polygonBoolean.union(polygons[0], ...polygons.slice(1))

  return result
    .map((polygon) => polygonToInkRegion(polygon, options))
    .filter((region): region is InkRegion => region !== null)
}
