import type { InkRegion } from '../types'
import type { BrushContour, BrushInkGroup, BrushPoint } from './brushGeometry'
import type { Contour, ContourPoint } from './strokeToOutline'

function cloneContour(contour: readonly BrushPoint[]): BrushContour {
  return contour.map((point) => ({ x: point.x, y: point.y }))
}

/**
 * 기존 BrushInkGroup의 첫 링은 outer, 이후 링은 hole이라는 계약을
 * 화면·OTF 공통 InkRegion으로 손실 없이 옮긴다.
 */
export function brushInkGroupToInkRegion(group: readonly BrushContour[]): InkRegion | null {
  const [outer, ...holes] = group
  if (!outer || outer.length < 3) return null
  return {
    outer: cloneContour(outer),
    holes: holes.filter((hole) => hole.length >= 3).map(cloneContour),
  }
}

export function brushInkGroupsToInkRegions(groups: readonly BrushInkGroup[]): InkRegion[] {
  return groups
    .map(brushInkGroupToInkRegion)
    .filter((region): region is InkRegion => region !== null)
}

export function inkRegionToBrushInkGroup(region: Readonly<InkRegion>): BrushInkGroup {
  return [cloneContour(region.outer), ...region.holes.map(cloneContour)]
}

export function inkRegionsToBrushInkGroups(regions: readonly Readonly<InkRegion>[]): BrushInkGroup[] {
  return regions.map(inkRegionToBrushInkGroup)
}

export function contourGroupToInkRegion(group: readonly Contour[]): InkRegion | null {
  const [outer, ...holes] = group
  if (!outer || outer.length < 3) return null
  return {
    outer: cloneContour(outer),
    holes: holes.filter((hole) => hole.length >= 3).map(cloneContour),
  }
}

export function inkRegionToContours(region: Readonly<InkRegion>): Contour[] {
  return [region.outer, ...region.holes].map((ring) => (
    ring.map<ContourPoint>(({ x, y }) => ({ x, y, onCurve: true }))
  ))
}
