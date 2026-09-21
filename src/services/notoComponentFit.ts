import polygonClipping from 'polygon-clipping'
import type { BoxConfig, DeepReadonly, InkRegion, JamoData, MedialFamily, Part, ResolvedCenterlinePrimitive, ResolvedStrokeInkSource, StrokeDataV2, StrokeRenderStyle } from '../types'
import { strokesForFamily } from '../utils/jamoContextStrokes'
import { frameJamoOf } from '../utils/jamoFrame'
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
  part: Part
  jamo: DeepReadonly<JamoData>
  /** 혼합 홀자의 가로부·세로부처럼 채널 하나만 놓을 때. 없으면 strokes, 없으면 세로+가로 합. */
  channel?: 'horizontalStrokes' | 'verticalStrokes'
  /** 닿자의 문맥 계열별 획 변형을 고를 때. */
  family?: MedialFamily | null
  /** em 좌표 잉크 바깥면. */
  faces: ComponentFaces
  glyphId: string
  weightMultiplier?: number
  globalLinecap?: StrokeDataV2['linecap']
  globalLinejoin?: StrokeDataV2['linejoin']
  /** 잉크 면을 만드는 획 스타일. 없으면 fit 기본(둥근 붓촉 = 일자 stroker). brush 모드만 받는다. */
  strokeStyle?: StrokeRenderStyle
}

/** 화면이 fit 잉크를 글로벌 스타일로 그릴 때 넘기는 묶음. 검수 캔버스·카드가 자소 탭과 같은 끝 모양으로 보이게. */
export interface FitInkStyle {
  linecap: StrokeDataV2['linecap']
  linejoin: StrokeDataV2['linejoin']
  strokeStyle: StrokeRenderStyle
}

/** brush 모드만 fit 잉크에 쓴다. 면·점 스타일은 일자 끝을 못 만들어 fit 기본으로 돌아간다. */
export const fitStrokeStyleOf = (style?: FitInkStyle): StrokeRenderStyle => style && style.strokeStyle.mode === 'brush' ? style.strokeStyle : FIT_INK_STYLE

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

export function componentStrokesOf(jamo: DeepReadonly<JamoData>, channel?: ComponentFitInput['channel'], family?: MedialFamily | null): StrokeDataV2[] {
  // 리졸버(selectMixedChannel·selectGeneralChannels)와 같은 규칙: 채널이 있으면 그 채널, 없으면 문맥 계열 strokes.
  const base = strokesForFamily(jamo, family)
  const strokes = channel
    ? (jamo[channel]?.length ? jamo[channel] : base) ?? []
    : base?.length ? base : [...(jamo.verticalStrokes ?? []), ...(jamo.horizontalStrokes ?? [])]
  return strokes.map((stroke) => structuredClone(stroke) as StrokeDataV2)
}

/** 획 중심선 상자를 faces에 두께 절반 안쪽으로 맞춘다. 축별 독립 스케일. */
export function componentBoxFromFaces(strokes: readonly StrokeDataV2[], faces: ComponentFaces, weightMultiplier = 1): { box: BoxConfig; thickness: number } | string {
  const bounds = getStrokeCenterlineBounds(strokes as StrokeDataV2[])
  if (!bounds) return '획 중심선 범위를 잴 수 없습니다.'
  const thickness = Math.max(...strokes.map((stroke) => stroke.thickness), 0) * weightMultiplier
  const innerWidth = faces.right - faces.left - thickness
  const innerHeight = faces.bottom - faces.top - thickness
  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY
  // 중심선이 퍼지는 축에서만 상자가 두께보다 커야 한다. ㅡ 한 줄처럼 안 퍼지는 축은
  // 상자 크기가 잉크에 안 쓰이므로(두께가 곧 잉크) 앱 두께가 Noto보다 굵어도 가운데에 두면 된다.
  if ((spanX > EPSILON && innerWidth <= EPSILON) || (spanY > EPSILON && innerHeight <= EPSILON)) return '박스가 획 두께보다 작습니다.'
  const width = spanX > EPSILON ? innerWidth / spanX : Math.max(innerWidth, EPSILON)
  const height = spanY > EPSILON ? innerHeight / spanY : Math.max(innerHeight, EPSILON)
  const x = spanX > EPSILON ? faces.left + thickness / 2 - bounds.minX * width : (faces.left + faces.right) / 2 - bounds.minX * width
  const y = spanY > EPSILON ? faces.top + thickness / 2 - bounds.minY * height : (faces.top + faces.bottom) / 2 - bounds.minY * height
  return { box: { x, y, width, height }, thickness }
}

function inkBounds(regions: readonly DeepReadonly<InkRegion>[]): ComponentFaces | null {
  const points = regions.flatMap((region) => region.outer)
  if (!points.length) return null
  return { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) }
}

/**
 * 잉크 바깥 범위가 faces에 정확히 오도록 상자를 축별로 다듬는다.
 * 두께/2 안쪽 상자는 둥근 끝 가정이라, 일자 끝(butt)이나 기울어진 획 끝에서는 잉크가 faces에 못 미치거나 넘친다.
 * 실제 잉크를 재서 상자를 늘리고 옮기기를 몇 번 반복하면 두께가 고정이어도 빠르게 수렴한다.
 */
function refineBoxToFaces(strokes: readonly StrokeDataV2[], box: BoxConfig, faces: ComponentFaces, makePrimitives: (box: BoxConfig) => ResolvedCenterlinePrimitive<ResolvedStrokeInkSource>[], strokeStyle: StrokeRenderStyle = FIT_INK_STYLE): BoxConfig {
  const bounds = getStrokeCenterlineBounds(strokes as StrokeDataV2[])
  if (!bounds) return box
  const spreads = { x: bounds.maxX - bounds.minX > EPSILON, y: bounds.maxY - bounds.minY > EPSILON }
  let current = { ...box }
  for (let pass = 0; pass < 4; pass += 1) {
    const ink = materializeFinalGlyphInk(makePrimitives(current), strokeStyle, INK_OPTIONS)
    if (!ink.ok) return current
    const actual = inkBounds(ink.ink.regions)
    if (!actual) return current
    const error = Math.max(Math.abs(actual.left - faces.left), Math.abs(actual.right - faces.right), Math.abs(actual.top - faces.top), Math.abs(actual.bottom - faces.bottom))
    if (error < 1e-6) return current
    const next = { ...current }
    if (spreads.x && actual.right - actual.left > EPSILON) {
      const scale = (faces.right - faces.left) / (actual.right - actual.left)
      next.width = current.width * scale
      next.x = current.x + faces.left - (current.x + (actual.left - current.x) * scale)
    } else {
      next.x = current.x + (faces.left + faces.right) / 2 - (actual.left + actual.right) / 2
    }
    if (spreads.y && actual.bottom - actual.top > EPSILON) {
      const scale = (faces.bottom - faces.top) / (actual.bottom - actual.top)
      next.height = current.height * scale
      next.y = current.y + faces.top - (current.y + (actual.top - current.y) * scale)
    } else {
      next.y = current.y + (faces.top + faces.bottom) / 2 - (actual.top + actual.bottom) / 2
    }
    if (!(next.width > EPSILON) || !(next.height > EPSILON)) return current
    current = next
  }
  return current
}

/**
 * 기준 틀 밖으로 나간 양(em, 변마다 0 이상). 틀이 없으면 null — 그때는 획이 곧 틀이라 튀어나올 수 없다.
 * 중심선 범위끼리 견준다. 저장하는 값이 아니라 볼 때마다 계산하는 값이다.
 */
export function componentProtrusion(input: Pick<ComponentFitInput, 'jamo' | 'channel' | 'family'>, box: BoxConfig): ComponentFaces | null {
  const frameJamo = frameJamoOf(input.jamo)
  if (!frameJamo) return null
  const frame = getStrokeCenterlineBounds(componentStrokesOf(frameJamo, input.channel, input.family))
  const actual = getStrokeCenterlineBounds(componentStrokesOf(input.jamo, input.channel, input.family))
  if (!frame || !actual) return null
  return {
    left: Math.max(0, frame.minX - actual.minX) * box.width,
    right: Math.max(0, actual.maxX - frame.maxX) * box.width,
    top: Math.max(0, frame.minY - actual.minY) * box.height,
    bottom: Math.max(0, actual.maxY - frame.maxY) * box.height,
  }
}

export function fitNotoComponent(input: ComponentFitInput): ComponentFitOutcome {
  const strokes = componentStrokesOf(input.jamo, input.channel, input.family)
  if (!strokes.length) return { ok: false, message: `${input.jamo.char}: 앱 획이 없습니다.` }
  if (![input.faces.left, input.faces.right, input.faces.top, input.faces.bottom].every(Number.isFinite)) return { ok: false, message: '박스 네 변이 없습니다.' }
  // 기준 틀이 있으면 상자는 틀(고치기 전 획 사본)로 정하고, 지금 획은 그 상자에 그대로 놓는다 — 틀 밖으로 나간 획은 faces 밖으로 튀어나온다.
  const frameJamo = frameJamoOf(input.jamo)
  const framed = frameJamo ? componentStrokesOf(frameJamo, input.channel, input.family) : []
  const boxStrokes = framed.length ? framed : strokes
  const placed = componentBoxFromFaces(boxStrokes, input.faces, input.weightMultiplier ?? 1)
  if (typeof placed === 'string') return { ok: false, message: placed }
  const primitivesOf = (source: readonly StrokeDataV2[]) => (box: BoxConfig) => source.map((stroke): ResolvedCenterlinePrimitive<ResolvedStrokeInkSource> => {
    const source: ResolvedStrokeInkSource = { kind: 'stroke', glyphId: input.glyphId, part: input.part, channel: input.channel ?? 'strokes', jamoId: input.jamo.char, strokeId: stroke.id }
    return {
      kind: 'centerline', coordinateSpace: 'stroke-local-with-glyph-box',
      id: ['centerline', source.glyphId, source.part, source.channel, source.jamoId, source.strokeId].map(encodeURIComponent).join(':'),
      source, stroke, box: { ...box }, weightMultiplier: input.weightMultiplier ?? 1,
      // Noto 닿자 끝은 일자다. 기본을 butt/miter로 두어 홀자 fit 획과 같은 모양으로 놓는다.
      effectiveLinecap: stroke.linecap ?? input.globalLinecap ?? 'butt',
      effectiveLinejoin: stroke.linejoin ?? input.globalLinejoin ?? 'miter',
    }
  })
  const box = refineBoxToFaces(boxStrokes, placed.box, input.faces, primitivesOf(boxStrokes), input.strokeStyle?.mode === 'brush' ? input.strokeStyle : FIT_INK_STYLE)
  return { ok: true, fit: { part: input.part, jamoId: input.jamo.char, faces: { ...input.faces }, box, thickness: placed.thickness, primitives: primitivesOf(strokes)(box) } }
}

export function inkOfComponentFit(fit: ComponentFitResult, style?: FitInkStyle): { ok: true; regions: readonly DeepReadonly<InkRegion>[] } | { ok: false; message: string } {
  const ink = materializeFinalGlyphInk(fit.primitives, fitStrokeStyleOf(style), INK_OPTIONS)
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
