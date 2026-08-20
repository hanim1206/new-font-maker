import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from 'polygon-clipping'
import type { Contour, ContourPoint } from './strokeToOutline'

const POSITION_EPSILON = 1e-6
const MIN_RING_AREA = 0.5

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function samePosition(first: Pair, second: Pair): boolean {
  return Math.abs(first[0] - second[0]) <= POSITION_EPSILON
    && Math.abs(first[1] - second[1]) <= POSITION_EPSILON
}

function signedArea(points: Array<readonly [number, number]>): number {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area / 2
}

function contourToRing(contour: Contour): Ring {
  const ring: Ring = []
  for (const point of contour) {
    const pair: Pair = [point.x, point.y]
    if (ring.length === 0 || !samePosition(ring[ring.length - 1], pair)) ring.push(pair)
  }
  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1])) ring.pop()
  return ring
}

function normalizeRing(ring: Ring, direction: 'cw' | 'ccw'): Contour | null {
  const cleaned: Pair[] = []
  for (const pair of ring) {
    if (cleaned.length === 0 || !samePosition(cleaned[cleaned.length - 1], pair)) cleaned.push(pair)
  }
  if (cleaned.length > 1 && samePosition(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop()
  if (cleaned.length < 3 || Math.abs(signedArea(cleaned)) < MIN_RING_AREA) return null

  const shouldReverse = direction === 'cw' ? signedArea(cleaned) > 0 : signedArea(cleaned) < 0
  const directed = shouldReverse ? [...cleaned].reverse() : cleaned
  return directed.map<ContourPoint>(([x, y]) => ({ x, y, onCurve: true }))
}

function contourGroupToPolygon(group: Contour[]): Polygon | null {
  const rings = group.map(contourToRing).filter((ring) => ring.length >= 3)
  return rings.length > 0 ? rings : null
}

function polygonToContours(polygon: Polygon): Contour[] {
  const contours: Contour[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const contour = normalizeRing(polygon[index], index === 0 ? 'cw' : 'ccw')
    if (contour) contours.push(contour)
  }
  return contours
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

/** CFF 1의 even-odd fill에서 교차부가 뚫리지 않도록 획 잉크를 겹침 없는 컨투어로 합친다. */
export function mergeStrokeContourGroupsForCff(groups: Contour[][]): Contour[] {
  const polygons = groups
    .map(contourGroupToPolygon)
    .filter((polygon): polygon is Polygon => polygon !== null)

  if (polygons.length === 0) return []
  if (polygons.length === 1 || !hasPossibleOverlap(polygons)) {
    return polygons.flatMap(polygonToContours)
  }

  const unioned: MultiPolygon = polygonClipping.union(polygons[0], ...polygons.slice(1))
  return unioned.flatMap(polygonToContours)
}
