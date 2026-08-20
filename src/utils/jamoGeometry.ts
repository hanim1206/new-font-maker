import type { AnchorPoint, BoxConfig, JamoData, StrokeDataV2 } from '../types'

const EPSILON = 0.000001

export interface JamoGeometryMetrics {
  centerlineBounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  inkBounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  width: number
  height: number
  aspectRatio: number
}

interface MutableBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function include(bounds: MutableBounds, x: number, y: number) {
  bounds.minX = Math.min(bounds.minX, x)
  bounds.maxX = Math.max(bounds.maxX, x)
  bounds.minY = Math.min(bounds.minY, y)
  bounds.maxY = Math.max(bounds.maxY, y)
}

function cubicAt(a: number, b: number, c: number, d: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d
}

function cubicExtrema(a: number, b: number, c: number, d: number): number[] {
  const qa = -a + 3 * b - 3 * c + d
  const qb = 2 * (a - 2 * b + c)
  const qc = b - a

  if (Math.abs(qa) < EPSILON) {
    if (Math.abs(qb) < EPSILON) return []
    const t = -qc / qb
    return t > 0 && t < 1 ? [t] : []
  }

  const discriminant = qb * qb - 4 * qa * qc
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  return [(-qb + root) / (2 * qa), (-qb - root) / (2 * qa)]
    .filter((t) => t > 0 && t < 1)
}

function includeSegment(bounds: MutableBounds, start: AnchorPoint, end: AnchorPoint) {
  const control1 = start.handleOut ?? start
  const control2 = end.handleIn ?? end
  include(bounds, start.x, start.y)
  include(bounds, end.x, end.y)

  const extrema = new Set([
    ...cubicExtrema(start.x, control1.x, control2.x, end.x),
    ...cubicExtrema(start.y, control1.y, control2.y, end.y),
  ])
  extrema.forEach((t) => {
    include(
      bounds,
      cubicAt(start.x, control1.x, control2.x, end.x, t),
      cubicAt(start.y, control1.y, control2.y, end.y, t),
    )
  })
}

export function getStrokeCenterlineBounds(strokes: StrokeDataV2[]): JamoGeometryMetrics['centerlineBounds'] | null {
  const bounds: MutableBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }

  for (const stroke of strokes) {
    if (stroke.points.length === 1) {
      include(bounds, stroke.points[0].x, stroke.points[0].y)
      continue
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      includeSegment(bounds, stroke.points[index - 1], stroke.points[index])
    }
    if (stroke.closed && stroke.points.length > 2) {
      includeSegment(bounds, stroke.points[stroke.points.length - 1], stroke.points[0])
    }
  }

  return Number.isFinite(bounds.minX) ? bounds : null
}

/** 실제 곡선 경계와 획 두께를 포함한 자모 고유 비율을 계산한다. */
export function measureJamoGeometry(strokes: StrokeDataV2[]): JamoGeometryMetrics | null {
  const centerlineBounds = getStrokeCenterlineBounds(strokes)
  if (!centerlineBounds) return null
  const halfThickness = Math.max(...strokes.map((stroke) => stroke.thickness), 0) / 2
  const inkBounds = {
    minX: centerlineBounds.minX - halfThickness,
    maxX: centerlineBounds.maxX + halfThickness,
    minY: centerlineBounds.minY - halfThickness,
    maxY: centerlineBounds.maxY + halfThickness,
  }
  const width = inkBounds.maxX - inkBounds.minX
  const height = inkBounds.maxY - inkBounds.minY
  return {
    centerlineBounds,
    inkBounds,
    width,
    height,
    aspectRatio: height > EPSILON ? width / height : 1,
  }
}

/** 자모의 모든 획을 한 잉크 마스터로 측정한다. */
export function measureJamoMaster(jamo: JamoData): JamoGeometryMetrics | null {
  return measureJamoGeometry([
    ...(jamo.strokes ?? []),
    ...(jamo.horizontalStrokes ?? []),
    ...(jamo.verticalStrokes ?? []),
  ])
}

export function getJamoGeometryMode(jamo: JamoData): NonNullable<JamoData['geometryMode']> {
  return jamo.geometryMode ?? 'slot-normalized'
}

/**
 * 원본 x/y 비율을 유지한 채 실제 잉크 경계를 슬롯 안에 맞춘다.
 * 반환 박스는 pointsToSvgD가 사용할 source→target 균일 변환이다.
 */
export function fitStrokesToBox(strokes: StrokeDataV2[], target: BoxConfig): BoxConfig {
  const metrics = measureJamoGeometry(strokes)
  if (!metrics) return target

  const { centerlineBounds } = metrics
  const sourceWidth = centerlineBounds.maxX - centerlineBounds.minX
  const sourceHeight = centerlineBounds.maxY - centerlineBounds.minY
  const maxThickness = Math.max(...strokes.map((stroke) => stroke.thickness), 0)
  const availableWidth = Math.max(EPSILON, target.width - maxThickness)
  const availableHeight = Math.max(EPSILON, target.height - maxThickness)
  const scaleX = sourceWidth > EPSILON ? availableWidth / sourceWidth : Number.POSITIVE_INFINITY
  const scaleY = sourceHeight > EPSILON ? availableHeight / sourceHeight : Number.POSITIVE_INFINITY
  const scale = Number.isFinite(Math.min(scaleX, scaleY))
    ? Math.min(scaleX, scaleY)
    : Math.max(availableWidth, availableHeight)
  const sourceCenterX = (centerlineBounds.minX + centerlineBounds.maxX) / 2
  const sourceCenterY = (centerlineBounds.minY + centerlineBounds.maxY) / 2

  return {
    x: target.x + target.width / 2 - sourceCenterX * scale,
    y: target.y + target.height / 2 - sourceCenterY * scale,
    width: scale,
    height: scale,
  }
}

/**
 * 기존 자모의 0–1 좌표는 슬롯 비율을 전제로 만들어졌으므로 x/y를 각각 매핑한다.
 * 실제 잉크 비율을 보존해 정규화한 신규 마스터에만 균일 스케일을 적용한다.
 */
export function getJamoRenderBox(
  jamo: JamoData,
  strokes: StrokeDataV2[],
  target: BoxConfig,
  weightMultiplier = 1,
  horizontalBounds = { min: 0, max: 1 },
): BoxConfig {
  const rendered = getJamoGeometryMode(jamo) === 'ink-normalized'
    ? fitStrokesToBox(strokes, target)
    : target

  const centerlineBounds = getStrokeCenterlineBounds(strokes)
  if (!centerlineBounds) return rendered

  // 고정폭 글리프에서는 슬롯 밖 편집을 허용하되 실제 잉크가 EM 폭을
  // 넘지 않도록 source→target 가로 스케일만 필요한 만큼 줄인다.
  const halfThickness = Math.max(...strokes.map((stroke) => stroke.thickness), 0)
    * weightMultiplier / 2
  const leftLimit = horizontalBounds.min + halfThickness
  const rightLimit = horizontalBounds.max - halfThickness
  const sourceMin = centerlineBounds.minX
  const sourceMax = centerlineBounds.maxX
  const sourceSpan = sourceMax - sourceMin
  let x = rendered.x
  let width = rendered.width

  // source 좌표가 음수로 뻗는 획도 먼저 전체 span을 맞춘 뒤 위치를 옮긴다.
  // x가 이미 왼쪽 한계보다 작다는 이유로 width를 0에 가깝게 축소하면
  // ㅜ처럼 슬롯 밖으로 조금 돌출된 가로획이 점으로 붕괴한다.
  if (sourceSpan > EPSILON) {
    width = Math.min(width, Math.max(EPSILON, (rightLimit - leftLimit) / sourceSpan))
  }
  const minimumX = leftLimit - sourceMin * width
  const maximumX = rightLimit - sourceMax * width
  x = minimumX <= maximumX
    ? Math.min(maximumX, Math.max(minimumX, x))
    : minimumX

  return { ...rendered, x, width }
}
