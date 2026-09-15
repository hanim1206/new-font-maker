import type { DeepReadonly, InkPoint, InkRegion, InkRing } from '../types'

/**
 * Noto 실측 윤곽(reference-lab export)의 폰트 단위 operations를 InkRegion 모양의 폴리곤으로 편다.
 * 용도는 측정·고스트(비교 오버레이)뿐이다. Noto 윤곽은 편집 대상이 아니고 잉크 union에도 넣지 않는다.
 * 그래서 ResolvedInkPrimitive를 만들지 않고, 화면용 evenodd 경로만 따로 낸다.
 */

export type NotoOutlinePoint = readonly [number, number]

export interface NotoOutlineOperation {
  operation: string
  arguments: readonly (NotoOutlinePoint | null)[]
}

export interface NotoOutline {
  unitsPerEm: number
  operations: readonly NotoOutlineOperation[]
  /** [a, b, c, d, e, f] 아핀. 없으면 x/upm, ascender − y/upm. */
  fontToGlyphNormalized?: readonly number[]
}

export interface NotoOutlineInkOptions {
  /** 폰트 단위 곡선 허용 오차. finalGlyphInk와 같은 0.5를 기본으로 쓴다. */
  maxCurveErrorFontUnits: number
}

export type NotoOutlineInkResult =
  | { ok: true; regions: InkRegion[] }
  | { ok: false; message: string }

/** notoBoundMaster·OTF ascender(880/1000)와 같은 세로 기준. */
export const NOTO_OUTLINE_ASCENDER = 0.88
export const DEFAULT_NOTO_OUTLINE_INK_OPTIONS: NotoOutlineInkOptions = { maxCurveErrorFontUnits: 0.5 }

type Affine = readonly [number, number, number, number, number, number]

function affineOf(outline: DeepReadonly<NotoOutline>): Affine | null {
  const raw = outline.fontToGlyphNormalized
  if (raw) {
    if (raw.length !== 6 || raw.some((value) => !Number.isFinite(value))) return null
    return [raw[0], raw[1], raw[2], raw[3], raw[4], raw[5]]
  }
  if (!Number.isFinite(outline.unitsPerEm) || outline.unitsPerEm <= 0) return null
  const scale = 1 / outline.unitsPerEm
  return [scale, 0, 0, -scale, 0, NOTO_OUTLINE_ASCENDER]
}

function isPoint(value: unknown): value is NotoOutlinePoint {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
}

function midpoint(a: NotoOutlinePoint, b: NotoOutlinePoint): NotoOutlinePoint {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** 이차 곡선을 허용 오차 안에서 등분한다. 오차 상한 |P0 − 2P1 + P2| / (4n²). */
function flattenQuadratic(p0: NotoOutlinePoint, p1: NotoOutlinePoint, p2: NotoOutlinePoint, tolerance: number, into: NotoOutlinePoint[]): void {
  const dx = p0[0] - 2 * p1[0] + p2[0]
  const dy = p0[1] - 2 * p1[1] + p2[1]
  const segments = Math.max(1, Math.ceil(Math.sqrt(Math.hypot(dx, dy) / (4 * tolerance))))
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments
    const u = 1 - t
    into.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]])
  }
}

/** 삼차 곡선 등분. 오차 상한 (3/4)·max(|P0−2P1+P2|, |P1−2P2+P3|) / n². */
function flattenCubic(p0: NotoOutlinePoint, p1: NotoOutlinePoint, p2: NotoOutlinePoint, p3: NotoOutlinePoint, tolerance: number, into: NotoOutlinePoint[]): void {
  const first = Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1])
  const second = Math.hypot(p1[0] - 2 * p2[0] + p3[0], p1[1] - 2 * p2[1] + p3[1])
  const segments = Math.max(1, Math.ceil(Math.sqrt(0.75 * Math.max(first, second) / tolerance)))
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    into.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]])
  }
}

/** 폰트 단위 operations를 폰트 단위 폴리곤 링으로 편다. TrueType 암시적 on-curve 점을 복원한다. */
function flattenContours(operations: readonly DeepReadonly<NotoOutlineOperation>[], tolerance: number): NotoOutlinePoint[][] | string {
  const contours: NotoOutlinePoint[][] = []
  let current: NotoOutlinePoint[] | null = null
  let open = false
  const close = () => {
    if (current && current.length >= 3) contours.push(current)
    current = null
    open = false
  }
  for (const { operation, arguments: args } of operations) {
    if (operation === 'moveTo') {
      if (open) close()
      if (args.length !== 1 || !isPoint(args[0])) return '원본 moveTo 좌표가 올바르지 않습니다.'
      current = [args[0]]
      open = true
    } else if (operation === 'lineTo') {
      if (!current || args.length !== 1 || !isPoint(args[0])) return '원본 lineTo 좌표가 올바르지 않습니다.'
      current.push(args[0])
    } else if (operation === 'qCurveTo') {
      if (!args.length) return '원본 이차 곡선이 비어 있습니다.'
      const controls = args.slice(0, -1)
      const last = args[args.length - 1]
      if (!controls.every(isPoint) || (last !== null && !isPoint(last))) return '원본 이차 곡선 좌표가 올바르지 않습니다.'
      const points = controls as NotoOutlinePoint[]
      let end: NotoOutlinePoint
      if (last === null) {
        // 컨트롤만 있는 닫힌 이차 곡선: 시작·끝은 첫·끝 컨트롤의 중점.
        if (!points.length) return '암시적 곡선 시작점이 없습니다.'
        end = midpoint(points[0], points[points.length - 1])
        if (open) close()
        current = [end]
        open = true
      } else end = last
      if (!current) return '이차 곡선 앞에 시작점이 없습니다.'
      if (!points.length) { current.push(end); continue }
      let start = current[current.length - 1]
      points.forEach((control, index) => {
        const segmentEnd = index + 1 < points.length ? midpoint(control, points[index + 1]) : end
        flattenQuadratic(start, control, segmentEnd, tolerance, current!)
        start = segmentEnd
      })
    } else if (operation === 'curveTo') {
      if (!current || args.length !== 3 || !args.every(isPoint)) return '삼차 곡선은 제어점 2개와 끝점만 지원합니다.'
      const [c1, c2, end] = args as NotoOutlinePoint[]
      flattenCubic(current[current.length - 1], c1, c2, end, tolerance, current)
    } else if (operation === 'closePath' || operation === 'endPath') {
      if (open) close()
    } else return `미지원 원본 곡선 명령: ${operation}`
  }
  if (open) close()
  return contours
}

function signedArea(ring: readonly InkPoint[]): number {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

function containsPoint(ring: readonly InkPoint[], target: InkPoint): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const before = ring[previous]
    if ((current.y > target.y) !== (before.y > target.y)
      && target.x < ((before.x - current.x) * (target.y - current.y)) / (before.y - current.y) + current.x) inside = !inside
  }
  return inside
}

/**
 * TrueType은 바깥 윤곽이 시계 방향(y 위 기준), 구멍이 반시계다.
 * 화면 좌표(y 아래)로 뒤집으면 부호가 반대가 되므로 양수 면적을 outer, 음수를 hole로 읽고
 * 구멍은 그 첫 점을 담는 가장 작은 outer에 붙인다.
 */
function nestRings(rings: InkRing[]): InkRegion[] {
  const outers: { ring: InkRing; area: number; holes: InkRing[] }[] = []
  const holes: InkRing[] = []
  for (const ring of rings) {
    const area = signedArea(ring)
    if (area > 0) outers.push({ ring, area, holes: [] })
    else if (area < 0) holes.push(ring)
  }
  for (const hole of holes) {
    const parent = outers
      .filter((outer) => containsPoint(outer.ring, hole[0]))
      .sort((a, b) => a.area - b.area)[0]
    // 담는 outer가 없는 구멍은 뒤집힌 고립 윤곽이므로 잉크로 살린다.
    if (parent) parent.holes.push(hole)
    else outers.push({ ring: [...hole].reverse(), area: -signedArea(hole), holes: [] })
  }
  return outers.map(({ ring, holes: inner }) => ({ outer: ring, holes: inner }))
}

export function notoOutlineToInkRegions(
  outline: DeepReadonly<NotoOutline>,
  options: NotoOutlineInkOptions = DEFAULT_NOTO_OUTLINE_INK_OPTIONS,
): NotoOutlineInkResult {
  if (!outline || typeof outline !== 'object' || !Array.isArray(outline.operations)) {
    return { ok: false, message: 'Noto 윤곽 operations가 없습니다.' }
  }
  if (!Number.isFinite(options.maxCurveErrorFontUnits) || options.maxCurveErrorFontUnits <= 0) {
    return { ok: false, message: '곡선 허용 오차는 양수여야 합니다.' }
  }
  const affine = affineOf(outline)
  if (!affine) return { ok: false, message: 'Noto 윤곽 좌표 변환을 만들 수 없습니다.' }
  const [a, b, c, d, e, f] = affine
  // 허용 오차는 폰트 단위 기준이다. operations가 이미 0~1로 정규화돼 항등 아핀으로 들어와도
  // 같은 촘촘함이 되도록, 아핀의 x축 배율로 source 단위 오차를 환산한다.
  const scale = Math.hypot(a, b) * outline.unitsPerEm
  if (!Number.isFinite(scale) || scale <= 0) return { ok: false, message: 'Noto 윤곽 좌표 배율이 올바르지 않습니다.' }
  const contours = flattenContours(outline.operations, options.maxCurveErrorFontUnits / scale)
  if (typeof contours === 'string') return { ok: false, message: contours }
  const rings = contours.map((contour) => contour.map(([x, y]): InkPoint => ({ x: a * x + c * y + e, y: b * x + d * y + f })))
  const regions = nestRings(rings)
  if (regions.length === 0) return { ok: false, message: 'Noto 윤곽에 잉크 면이 없습니다.' }
  return { ok: true, regions }
}

function format(value: number): string {
  return String(Number(value.toFixed(6)))
}

/** 고스트 표시용 SVG evenodd 경로. union을 거치지 않는다 — 잉크가 아니라 비교 오버레이다. */
export function notoOutlineGhostPath(
  outline: DeepReadonly<NotoOutline>,
  options: NotoOutlineInkOptions = DEFAULT_NOTO_OUTLINE_INK_OPTIONS,
  viewBoxSize = 1,
): { ok: true; path: string } | { ok: false; error: string } {
  const result = notoOutlineToInkRegions(outline, options)
  if (!result.ok) return { ok: false, error: result.message }
  const rings = result.regions.flatMap((region) => [region.outer, ...region.holes])
  const path = rings.map((ring) => {
    const [first, ...rest] = ring
    return `M ${format(first.x * viewBoxSize)} ${format(first.y * viewBoxSize)} ${rest.map((point) => `L ${format(point.x * viewBoxSize)} ${format(point.y * viewBoxSize)}`).join(' ')} Z`
  }).join(' ')
  return { ok: true, path }
}
