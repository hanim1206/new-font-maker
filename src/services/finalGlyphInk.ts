import type {
  DeepReadonly,
  InkPoint,
  InkRegion,
  InkRing,
  ResolvedInkPrimitive,
  StrokeDataV2,
  StrokeRenderStyle,
} from '../types'
import { unionInkRegions } from './inkBoolean'
import { brushInkGroupsToInkRegions } from './inkGeometry'
import { strokeToRenderInkGroups } from './strokeRenderGeometry'
import type { Contour } from './strokeToOutline'

const BOOLEAN_OPTIONS = { positionEpsilon: 1e-9, minRingArea: 1e-12 } as const
const CANONICAL_PRECISION = 1e9

export interface FinalGlyphInk {
  regions: readonly DeepReadonly<InkRegion>[]
}

export type FinalGlyphInkResult =
  | { ok: true; ink: FinalGlyphInk }
  | { ok: false; message: string; primitiveId?: string }

export interface FinalGlyphInkMaterializationOptions {
  unitsPerEm: number
  maxCurveErrorFontUnits: number
}

export function resolveFinalInkEllipseVertexCount(radius: number, options: FinalGlyphInkMaterializationOptions): number {
  if (!Number.isFinite(options.unitsPerEm) || options.unitsPerEm <= 0
    || !Number.isFinite(options.maxCurveErrorFontUnits) || options.maxCurveErrorFontUnits <= 0) return 0
  const normalizedError = options.maxCurveErrorFontUnits / options.unitsPerEm
  if (radius <= normalizedError) return 8
  const angle = Math.acos(Math.max(-1, Math.min(1, 1 - normalizedError / radius)))
  const required = Math.max(8, Math.ceil(Math.PI / angle))
  return required > 256 ? 0 : required
}

function quantize(value: number): number {
  return Math.round(value * CANONICAL_PRECISION) / CANONICAL_PRECISION
}

function comparePoint(first: InkPoint, second: InkPoint): number {
  return first.x - second.x || first.y - second.y
}

function samePoint(first: InkPoint, second: InkPoint): boolean {
  return first.x === second.x && first.y === second.y
}

function canonicalRing(source: DeepReadonly<InkRing>): InkRing {
  const points = source.map(({ x, y }) => ({ x: quantize(x), y: quantize(y) }))
    .filter((point, index, list) => index === 0 || !samePoint(point, list[index - 1]))
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop()
  if (points.length < 3) return []

  let changed = true
  while (changed && points.length >= 3) {
    changed = false
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length]
      const current = points[index]
      const next = points[(index + 1) % points.length]
      const cross = (current.x - previous.x) * (next.y - current.y)
        - (current.y - previous.y) * (next.x - current.x)
      if (Math.abs(cross) <= 1e-12) {
        points.splice(index, 1)
        changed = true
        break
      }
    }
  }
  if (points.length < 3) return []
  let best = points
  for (let index = 0; index < points.length; index += 1) {
    const candidate = [...points.slice(index), ...points.slice(0, index)]
    if (comparePoint(candidate[0], best[0]) < 0 || (samePoint(candidate[0], best[0])
      && compareKey(ringKey(candidate), ringKey(best)) < 0)) best = candidate
  }
  return best
}

function ringKey(ring: DeepReadonly<InkRing>): string {
  return ring.map(({ x, y }) => `${x},${y}`).join(';')
}

function compareKey(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}

/** 입력 순서와 polygon-clipping의 링 시작점에 의존하지 않는 최종 직렬화 순서. */
export function canonicalizeInkRegions(source: readonly DeepReadonly<InkRegion>[]): InkRegion[] {
  return source.map((region) => ({
    outer: canonicalRing(region.outer),
    holes: region.holes.map(canonicalRing).filter((ring) => ring.length >= 3).sort((a, b) => compareKey(ringKey(a), ringKey(b))),
  }))
    .filter((region) => region.outer.length >= 3)
    .sort((a, b) => {
      const outer = compareKey(ringKey(a.outer), ringKey(b.outer))
      return outer || compareKey(a.holes.map(ringKey).join('|'), b.holes.map(ringKey).join('|'))
    })
}

function cloneRegion(region: DeepReadonly<InkRegion>): InkRegion {
  return {
    outer: region.outer.map(({ x, y }) => ({ x, y })),
    holes: region.holes.map((hole) => hole.map(({ x, y }) => ({ x, y }))),
  }
}

/**
 * 모든 양의 선·면 primitive를 같은 glyph-normalized 면으로 바꾼 뒤 한 번 union한다.
 * 반환값만 SVG와 OTF가 소비하며 각 소비자는 Boolean을 다시 수행하지 않는다.
 */
export function materializeFinalGlyphInk(
  primitives: readonly DeepReadonly<ResolvedInkPrimitive>[],
  strokeStyle: DeepReadonly<StrokeRenderStyle>,
  options: FinalGlyphInkMaterializationOptions,
): FinalGlyphInkResult {
  if (options.unitsPerEm !== 1000 || options.maxCurveErrorFontUnits !== 0.5) {
    return { ok: false, message: '현재 Shape final ink prototype은 1000 UPM / 0.5 unit 오차만 지원합니다.' }
  }
  const regions: InkRegion[] = []
  for (const primitive of primitives) {
    if (primitive.kind === 'region') {
      regions.push(cloneRegion(primitive.region))
      continue
    }
    if (primitive.effectiveLinecap !== 'round' || primitive.effectiveLinejoin !== 'round') {
      return {
        ok: false,
        primitiveId: primitive.id,
        message: `중심선 ${primitive.id}의 ${primitive.effectiveLinecap}/${primitive.effectiveLinejoin} 윤곽 변환은 아직 지원하지 않습니다.`,
      }
    }
    const vertices = resolveFinalInkEllipseVertexCount(primitive.stroke.thickness * primitive.weightMultiplier / 2, options)
    if (vertices === 0) return { ok: false, primitiveId: primitive.id, message: '최종 잉크 곡선 오차 옵션이 유효하지 않습니다.' }
    const groups = strokeToRenderInkGroups(
      primitive.stroke as StrokeDataV2,
      { ...primitive.box },
      primitive.weightMultiplier,
      strokeStyle as StrokeRenderStyle,
      { ellipseVertexCount: vertices },
    )
    const strokeRegions = brushInkGroupsToInkRegions(groups)
    if (strokeRegions.length === 0) {
      return { ok: false, primitiveId: primitive.id, message: `중심선 ${primitive.id}을 면으로 만들 수 없습니다.` }
    }
    regions.push(...strokeRegions)
  }
  if (regions.length === 0) return { ok: false, message: '최종 잉크 primitive가 비어 있습니다.' }
  if (regions.some((region) => [...region.outer, ...region.holes.flat()].some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y)))) {
    return { ok: false, message: '최종 잉크에 유한하지 않은 좌표가 있습니다.' }
  }
  try {
    return { ok: true, ink: { regions: canonicalizeInkRegions(unionInkRegions(regions, BOOLEAN_OPTIONS)) } }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function format(value: number): string {
  return String(Number(value.toFixed(6)))
}

/** 공통 final regions의 SVG evenodd 직렬화. */
export function finalGlyphInkToSvgPath(ink: DeepReadonly<FinalGlyphInk>, viewBoxSize = 100): string {
  const rings = ink.regions.flatMap((region) => [
    { kind: 'outer' as const, ring: region.outer },
    ...region.holes.map((ring) => ({ kind: 'hole' as const, ring })),
  ])
  return rings.map(({ ring }) => {
    const [first, ...rest] = ring
    if (!first) return ''
    return `M ${format(first.x * viewBoxSize)} ${format(first.y * viewBoxSize)} ${rest.map((point) => `L ${format(point.x * viewBoxSize)} ${format(point.y * viewBoxSize)}`).join(' ')} Z`
  }).filter(Boolean).join(' ')
}

/** 공통 final regions에 출력 좌표 투영만 적용한다. */
export function projectFinalGlyphInkToFontContours(
  ink: DeepReadonly<FinalGlyphInk>,
  options: { upm: number; ascender: number; slant: number; originX?: number },
): Contour[] {
  if (!Number.isFinite(options.upm) || options.upm <= 0
    || !Number.isFinite(options.ascender) || !Number.isFinite(options.slant)
    || (options.originX !== undefined && !Number.isFinite(options.originX))) {
    throw new Error('OTF final ink projection 옵션이 유효하지 않습니다.')
  }
  const tangent = Math.tan(options.slant * Math.PI / 180)
  const verticalCenter = options.ascender - options.upm / 2
  const originX = options.originX ?? 0
  const rings = ink.regions.flatMap((region) => [
    { kind: 'outer' as const, ring: region.outer },
    ...region.holes.map((ring) => ({ kind: 'hole' as const, ring })),
  ])
  return rings.map(({ kind, ring }) => {
    const projected = ring.map((point) => {
      const fontY = options.ascender - point.y * options.upm
      const fontX = (point.x - originX) * options.upm + (fontY - verticalCenter) * tangent
      return { x: Math.round(fontX), y: Math.round(fontY), onCurve: true }
    }).filter((point, index, list) => index === 0 || point.x !== list[index - 1].x || point.y !== list[index - 1].y)
    if (projected.length > 1 && projected[0].x === projected[projected.length - 1].x
      && projected[0].y === projected[projected.length - 1].y) projected.pop()
    const area = projected.reduce((sum, point, index) => {
      const next = projected[(index + 1) % projected.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0) / 2
    if (projected.length < 3 || area === 0
      || (kind === 'outer' && area < 0) || (kind === 'hole' && area > 0)) {
      throw new Error(`OTF 투영 뒤 ${kind} winding을 유지할 수 없습니다.`)
    }
    return projected
  })
}
