import type { InkRegion } from '../types'
import { unionInkRegions } from './inkBoolean'
import { inkRegionToContours } from './inkGeometry'
import type { Contour } from './strokeToOutline'

const CFF_BOOLEAN_OPTIONS = {
  positionEpsilon: 1e-6,
  minRingArea: 0.5,
} as const

function sameCffPosition(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>,
): boolean {
  return Math.abs(first.x - second.x) <= CFF_BOOLEAN_OPTIONS.positionEpsilon
    && Math.abs(first.y - second.y) <= CFF_BOOLEAN_OPTIONS.positionEpsilon
}

function cleanLegacyCffRing(contour: Contour): InkRegion['outer'] {
  const ring: InkRegion['outer'] = []
  for (const point of contour) {
    const candidate = { x: point.x, y: point.y }
    if (ring.length === 0 || !sameCffPosition(ring[ring.length - 1], candidate)) {
      ring.push(candidate)
    }
  }
  if (ring.length > 1 && sameCffPosition(ring[0], ring[ring.length - 1])) ring.pop()
  return ring
}

/** 구 CFF facade처럼 중복점을 먼저 정리하고 첫 유효 링을 outer로 선택한다. */
function contourGroupToLegacyCffRegion(group: Contour[]): InkRegion | null {
  const [outer, ...holes] = group
    .map(cleanLegacyCffRing)
    .filter((ring) => ring.length >= 3)
  return outer ? { outer, holes } : null
}

/** CFF 1의 even-odd fill에서 교차부가 뚫리지 않도록 획 잉크를 겹침 없는 컨투어로 합친다. */
export function mergeStrokeContourGroupsForCff(groups: Contour[][]): Contour[] {
  const regions = groups
    .map(contourGroupToLegacyCffRegion)
    .filter((region): region is InkRegion => region !== null)
  return unionInkRegions(regions, CFF_BOOLEAN_OPTIONS)
    .flatMap(inkRegionToContours)
}
