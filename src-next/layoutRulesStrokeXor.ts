import { materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { multiPolygonArea, unionOf } from '../src/services/notoFitReport'
import * as pb from '../src/services/polygonBoolean'
import type { MultiPolygon } from '../src/services/polygonBoolean'
import type { RuleBoxes } from '../src/services/layoutRules'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, DeepReadonly, InkRegion, Part } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'

/**
 * 2차 채점: 노토와 어긋난 잉크(xor)를 획 하나하나에 나눈다.
 * 남는 잉크 = 그 획의 잉크 중 노토 밖. 모자란 잉크 = 노토 잉크 중 우리 잉크 밖 조각을, 조각 무게중심에서 가장 가까운 획에 준다.
 * 둘 다 노토 잉크 면적에 대한 비율이라, 획마다 더하면 글자 xor와 같아진다(겹친 획의 남는 잉크는 두 번 셀 수 있다).
 * 획 바깥 네모로 재지 않는 까닭: 작은 획이 이웃 잉크까지 끌어와 거짓 차이가 많았다.
 */

export interface StrokeXorShare {
  part: Part
  jamo: string
  strokeId: string
  extra: number
  missing: number
}

const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }
/** 이보다 작은 조각(노토 잉크의 0.01%)은 경계 떨림이라 버린다. */
const MIN_PIECE = 1e-4

interface Bounds { l: number; r: number; t: number; b: number }

const boundsOf = (shape: MultiPolygon): Bounds | null => {
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity
  for (const polygon of shape) for (const [x, y] of polygon[0]) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y) }
  return Number.isFinite(l) ? { l, r, t, b } : null
}

const centroidOf = (polygon: MultiPolygon[number]): [number, number] | null => {
  const ring = polygon[0]
  let area = 0, cx = 0, cy = 0
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % ring.length]
    const cross = x0 * y1 - x1 * y0
    area += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross
  }
  return Math.abs(area) < 1e-12 ? null : [cx / (3 * area), cy / (3 * area)]
}

const distanceToBounds = ([x, y]: [number, number], box: Bounds) => Math.hypot(Math.max(box.l - x, 0, x - box.r), Math.max(box.t - y, 0, y - box.b))

export function strokeXorShares(input: {
  syllable: DecomposedSyllable
  boxes: RuleBoxes
  style: GlobalStyle
  ghost: readonly DeepReadonly<InkRegion>[]
}): StrokeXorShare[] {
  const { syllable, boxes, style } = input
  const resolved = resolveGlyphInkPrimitives({
    syllable,
    placement: { kind: 'boxes', boxes: boxes as Partial<Record<Part, BoxConfig>> },
    weightMultiplier: weightToMultiplier(style.weight),
    globalLinecap: style.linecap,
    globalLinejoin: style.linejoin,
    horizontalInkBounds: { min: 0, max: 1 },
  })
  const noto = unionOf(input.ghost)
  const notoArea = multiPolygonArea(noto)
  if (notoArea <= 0) return []
  const strokes = resolved.primitives.flatMap((primitive) => {
    const ink = materializeFinalGlyphInk([primitive], style.strokeStyle, INK_OPTIONS)
    const shape = ink.ok ? unionOf(ink.ink.regions) : []
    const bounds = boundsOf(shape)
    return bounds ? [{ share: { part: primitive.source.part, jamo: primitive.source.jamoId, strokeId: primitive.source.strokeId, extra: 0, missing: 0 } as StrokeXorShare, shape, bounds }] : []
  })
  if (strokes.length === 0) return []
  for (const stroke of strokes) {
    for (const piece of pb.difference(stroke.shape, noto)) {
      const area = multiPolygonArea([piece]) / notoArea
      if (area >= MIN_PIECE) stroke.share.extra += area
    }
  }
  const ours = pb.union(strokes[0].shape, ...strokes.slice(1).map((stroke) => stroke.shape))
  for (const piece of pb.difference(noto, ours)) {
    const area = multiPolygonArea([piece]) / notoArea
    const center = area >= MIN_PIECE ? centroidOf(piece) : null
    if (!center) continue
    let nearest = strokes[0]
    for (const stroke of strokes) if (distanceToBounds(center, stroke.bounds) < distanceToBounds(center, nearest.bounds)) nearest = stroke
    nearest.share.missing += area
  }
  return strokes.map((stroke) => stroke.share)
}
