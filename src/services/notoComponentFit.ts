import polygonClipping from 'polygon-clipping'
import type { BoxConfig, DeepReadonly, InkRegion, JamoData, Part, ResolvedCenterlinePrimitive, ResolvedStrokeInkSource, StrokeDataV2, StrokeRenderStyle } from '../types'
import { getStrokeCenterlineBounds } from '../utils/jamoGeometry'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { multiPolygonArea, unionOf } from './notoFitReport'
import { notoOutlineToInkRegions } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'

/**
 * 닿자(첫닿자·받침) 2단계-a: 앱의 획(centerline)을 Noto 실측·예측 박스에 맞춰 놓는다.
 * Noto는 닿자에 대해 네 변(roleFaces)만 잰다 — 획 골격은 앱 획이 seed다.
 * 박스는 잉크 바깥면이므로 중심선 상자는 두께 절반만큼 안쪽이다. 축마다 따로 맞춘다(slot-normalized 규약).
 */

export interface ComponentFaces { left: number; right: number; top: number; bottom: number }

export interface ComponentFitInput {
  part: Extract<Part, 'CH' | 'JO'>
  jamo: DeepReadonly<JamoData>
  /** em 좌표 잉크 바깥면. */
  faces: ComponentFaces
  glyphId: string
  weightMultiplier?: number
  globalLinecap?: StrokeDataV2['linecap']
  globalLinejoin?: StrokeDataV2['linejoin']
}

export interface ComponentFitResult {
  part: ComponentFitInput['part']
  jamoId: string
  faces: ComponentFaces
  /** 중심선 좌표계 상자(em). 잉크 = 상자 ± 두께/2 가 faces에 닿는다. */
  box: BoxConfig
  thickness: number
  primitives: ResolvedCenterlinePrimitive<ResolvedStrokeInkSource>[]
}

export type ComponentFitOutcome = { ok: true; fit: ComponentFitResult } | { ok: false; message: string }

const FIT_INK_STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }
const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }
const EPSILON = 1e-6

function strokesOf(jamo: DeepReadonly<JamoData>): StrokeDataV2[] {
  const strokes = jamo.strokes?.length ? jamo.strokes : [...(jamo.verticalStrokes ?? []), ...(jamo.horizontalStrokes ?? [])]
  return strokes.map((stroke) => structuredClone(stroke) as StrokeDataV2)
}

/** 획 중심선 상자를 faces에 두께 절반 안쪽으로 맞춘다. 축별 독립 스케일. */
export function componentBoxFromFaces(strokes: readonly StrokeDataV2[], faces: ComponentFaces, weightMultiplier = 1): { box: BoxConfig; thickness: number } | string {
  const bounds = getStrokeCenterlineBounds(strokes as StrokeDataV2[])
  if (!bounds) return '획 중심선 범위를 잴 수 없습니다.'
  const thickness = Math.max(...strokes.map((stroke) => stroke.thickness), 0) * weightMultiplier
  const innerWidth = faces.right - faces.left - thickness
  const innerHeight = faces.bottom - faces.top - thickness
  if (innerWidth <= EPSILON || innerHeight <= EPSILON) return '박스가 획 두께보다 작습니다.'
  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY
  // 한 방향으로 퍼지지 않는 획(세로 한 줄 등)은 그 축을 상자 가운데에 둔다.
  const width = spanX > EPSILON ? innerWidth / spanX : innerWidth
  const height = spanY > EPSILON ? innerHeight / spanY : innerHeight
  const x = spanX > EPSILON ? faces.left + thickness / 2 - bounds.minX * width : faces.left + thickness / 2 + innerWidth / 2 - bounds.minX * width
  const y = spanY > EPSILON ? faces.top + thickness / 2 - bounds.minY * height : faces.top + thickness / 2 + innerHeight / 2 - bounds.minY * height
  return { box: { x, y, width, height }, thickness }
}

export function fitNotoComponent(input: ComponentFitInput): ComponentFitOutcome {
  const strokes = strokesOf(input.jamo)
  if (!strokes.length) return { ok: false, message: `${input.jamo.char}: 앱 획이 없습니다.` }
  if (![input.faces.left, input.faces.right, input.faces.top, input.faces.bottom].every(Number.isFinite)) return { ok: false, message: '박스 네 변이 없습니다.' }
  const placed = componentBoxFromFaces(strokes, input.faces, input.weightMultiplier ?? 1)
  if (typeof placed === 'string') return { ok: false, message: placed }
  const primitives = strokes.map((stroke): ResolvedCenterlinePrimitive<ResolvedStrokeInkSource> => {
    const source: ResolvedStrokeInkSource = { kind: 'stroke', glyphId: input.glyphId, part: input.part, channel: 'strokes', jamoId: input.jamo.char, strokeId: stroke.id }
    return {
      kind: 'centerline', coordinateSpace: 'stroke-local-with-glyph-box',
      id: ['centerline', source.glyphId, source.part, source.channel, source.jamoId, source.strokeId].map(encodeURIComponent).join(':'),
      source, stroke, box: { ...placed.box }, weightMultiplier: input.weightMultiplier ?? 1,
      effectiveLinecap: stroke.linecap ?? input.globalLinecap ?? 'round',
      effectiveLinejoin: stroke.linejoin ?? input.globalLinejoin ?? 'round',
    }
  })
  return { ok: true, fit: { part: input.part, jamoId: input.jamo.char, faces: { ...input.faces }, box: placed.box, thickness: placed.thickness, primitives } }
}

export function inkOfComponentFit(fit: ComponentFitResult): { ok: true; regions: readonly DeepReadonly<InkRegion>[] } | { ok: false; message: string } {
  const ink = materializeFinalGlyphInk(fit.primitives, FIT_INK_STYLE, INK_OPTIONS)
  return ink.ok ? { ok: true, regions: ink.ink.regions } : { ok: false, message: ink.message }
}

export interface FaceError { side: keyof ComponentFaces; measured: number; fitted: number; errorUnits: number }

export interface ComponentFitReport {
  part: ComponentFitInput['part']
  jamoId: string
  ok: boolean
  message?: string
  xorRatio?: number
  inkRatio?: number
  /** 박스 네 변 오차(1000u). 기준 faces(실측)가 있을 때만. 모델 박스로 fit하면 예측 오차가 된다. */
  faceErrors: FaceError[]
}

export function faceErrorsOf(fit: ComponentFitResult, reference: ComponentFaces): FaceError[] {
  return (['left', 'right', 'top', 'bottom'] as const).map((side) => ({ side, measured: reference[side], fitted: fit.faces[side], errorUnits: (fit.faces[side] - reference[side]) * 1000 }))
}

export function reportComponentFit(input: { fit: ComponentFitResult; ghostOutline: DeepReadonly<NotoOutline>; referenceFaces?: ComponentFaces }): ComponentFitReport {
  const { fit } = input
  const base = { part: fit.part, jamoId: fit.jamoId, faceErrors: input.referenceFaces ? faceErrorsOf(fit, input.referenceFaces) : [] }
  const ink = inkOfComponentFit(fit)
  if (!ink.ok) return { ...base, ok: false, message: ink.message }
  const ghost = notoOutlineToInkRegions(input.ghostOutline)
  if (!ghost.ok) return { ...base, ok: false, message: ghost.message }
  const mine = unionOf(ink.regions)
  const theirs = unionOf(ghost.regions)
  const ghostArea = multiPolygonArea(theirs)
  if (ghostArea <= 0) return { ...base, ok: false, message: 'Noto 고스트 면적이 0입니다.' }
  const xor = polygonClipping.xor(mine, theirs)
  return { ...base, ok: true, xorRatio: multiPolygonArea(xor) / ghostArea, inkRatio: multiPolygonArea(mine) / ghostArea }
}
