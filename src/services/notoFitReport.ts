import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
import type { DeepReadonly, InkRegion } from '../types'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { partForJamoRole } from './jamoContextRoles'
import { fitNotoMedialMaster } from './notoMedialMasterFit'
import type { MedialFitInput, MedialFitResult } from './notoMedialMasterFit'
import { notoOutlineToInkRegions } from './notoOutlineInk'
import { medialRoleGeometry } from './notoVariationModel'
import type { NotoOutline } from './notoOutlineInk'
import { resolveShapeGlyphInkPrimitives } from './shapeGlyphInkResolver'
import { fitStrokeStyleOf } from './notoComponentFit'
import type { FitInkStyle } from './notoComponentFit'

/**
 * 획 마스터 fit 결과를 Noto 고스트와 겹쳐 얼마나·어디서 벗어났는지 숫자로 낸다.
 * 게이트가 아니라 리포트다. xor 비율은 "얼마나", rail 오차는 "어느 기준선이".
 */

// 캡·조인은 primitive 쪽(butt/miter)이 정하므로 붓 모양은 두께만 뜻한다.
const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }

export interface RailError {
  roleId: string
  /** 측정 face(em) */
  measured: number
  /** fit이 그 face 자리에 둔 값(em) = 중심선 ∓ 두께/2 */
  fitted: number
  /** 1000u 단위 오차 */
  errorUnits: number
}

export interface MedialFitReport {
  jamoId: string
  role: MedialFitInput['role']
  ok: boolean
  message?: string
  /** xor 면적 / Noto 면적. 0 = 완전 일치. */
  xorRatio?: number
  /** 내 잉크 면적 / Noto 면적. */
  inkRatio?: number
  railErrors: RailError[]
  slot?: MedialFitResult['slot']
}

export function regionToPolygon(region: DeepReadonly<InkRegion>): Polygon {
  return [region.outer, ...region.holes].map((ring) => ring.map((point) => [point.x, point.y] as [number, number]))
}

export function multiPolygonArea(shape: MultiPolygon): number {
  let total = 0
  for (const polygon of shape) {
    polygon.forEach((ring, index) => {
      let area = 0
      for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i]
        const [x2, y2] = ring[(i + 1) % ring.length]
        area += x1 * y2 - x2 * y1
      }
      // polygon-clipping은 outer를 CCW, hole을 CW로 주므로 부호가 이미 반대다. 절댓값으로 outer − holes.
      total += (index === 0 ? 1 : -1) * Math.abs(area / 2)
    })
  }
  return total
}

export function unionOf(regions: readonly DeepReadonly<InkRegion>[]): MultiPolygon {
  const polygons = regions.map(regionToPolygon)
  if (!polygons.length) return []
  return polygonClipping.union(polygons[0], ...polygons.slice(1))
}

/** 측정 face와 fit 중심선을 같은 자리로 되돌려 비교한다. 직접 fit이면 0, 모델 예측 rail이면 예측 오차가 된다. */
export function railErrorsOf(fit: MedialFitResult, measurements: MedialFitInput['measurements']): RailError[] {
  return fit.strokes.flatMap((stroke) => {
    const m = measurements[stroke.roleId]
    if (!m) return []
    const inward = stroke.orientation === 'vertical' ? (m.faceSide === 'right' ? -1 : 1) : (m.faceSide === 'top' ? 1 : -1)
    const fitted = stroke.center - inward * stroke.thickness / 2
    return [{ roleId: stroke.roleId, measured: m.face, fitted, errorUnits: (fitted - m.face) * 1000 }]
  })
}

/**
 * 변화량 모델 예측(face·spanFrom·spanTo, 1000u)에서 fit 입력을 만든다.
 * 역할 기하(방향·면)는 corpus 상수, 두께는 자모별 대표값을 호출자가 준다.
 */
export function medialInputFromPrediction(input: {
  jamoId: string
  role: MedialFitInput['role']
  roleIds: readonly string[]
  predicted: (target: string) => number | null
  thickness: Readonly<Record<string, number>>
}): { ok: true; input: MedialFitInput } | { ok: false; message: string } {
  const measurements: Record<string, MedialFitInput['measurements'][string]> = {}
  for (const roleId of input.roleIds) {
    const face = input.predicted(`medial.${roleId}.face`)
    const from = input.predicted(`medial.${roleId}.spanFrom`)
    const to = input.predicted(`medial.${roleId}.spanTo`)
    if (face === null || from === null || to === null) return { ok: false, message: `${roleId}: 이 문맥의 face·span 예측이 없습니다.` }
    measurements[roleId] = { ...medialRoleGeometry(roleId), face: face / 1000, visibleSpans: [{ from: from / 1000, to: to / 1000 }] }
  }
  return { ok: true, input: { jamoId: input.jamoId, role: input.role, measurements, thickness: input.thickness } }
}

/** fit 결과를 리졸버 → 잉크로 만든다. 화면 오버레이와 리포트가 같은 잉크를 쓴다. */
/**
 * fit 결과를 잉크 면으로. 측정·xor는 style 없이(Noto 획 끝은 일자라 butt/miter 고정) 부르고,
 * 화면은 글로벌 스타일을 넘겨 자소 탭과 같은 끝 모양으로 그린다.
 */
export function inkOfFit(fit: MedialFitResult, weightMultiplier = 1, style?: FitInkStyle): { ok: true; regions: readonly DeepReadonly<InkRegion>[] } | { ok: false; message: string } {
  const primitives = resolveShapeGlyphInkPrimitives({
    source: fit.scope, masterId: fit.master.id, glyphId: `fit:${fit.jamoId}`,
    part: partForJamoRole(fit.role), slot: fit.slot, weightMultiplier,
    // Noto 획 끝은 일자다. 둥근 캡이면 끝이 삐져 xor가 부풀고 화면에서도 다른 획과 어긋나 보인다.
    globalLinecap: style?.linecap ?? 'butt', globalLinejoin: style?.linejoin ?? 'miter',
  })
  if (!primitives.ok) return { ok: false, message: primitives.issues[0]?.message ?? '마스터를 해석할 수 없습니다.' }
  const ink = materializeFinalGlyphInk(primitives.primitives, fitStrokeStyleOf(style), INK_OPTIONS)
  return ink.ok ? { ok: true, regions: ink.ink.regions } : { ok: false, message: ink.message }
}

/** 이미 만든 fit(편집 뒤 포함)을 고스트·기준 측정과 비교한다. */
export function reportFitResult(input: {
  fit: MedialFitResult
  ghostOutline: DeepReadonly<NotoOutline>
  referenceMeasurements: MedialFitInput['measurements']
  weightMultiplier?: number
}): MedialFitReport {
  const { fit } = input
  const base = { jamoId: fit.jamoId, role: fit.role, slot: fit.slot, railErrors: railErrorsOf(fit, input.referenceMeasurements) }
  const ink = inkOfFit(fit, input.weightMultiplier)
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

export function reportMedialFit(input: MedialFitInput & {
  ghostOutline: DeepReadonly<NotoOutline>
  weightMultiplier?: number
  /** rail 오차를 잴 기준 측정. 없으면 fit 입력 자신(직접 fit이면 0). 모델 예측으로 fit할 때 실측을 넣는다. */
  referenceMeasurements?: MedialFitInput['measurements']
}): MedialFitReport {
  const outcome = fitNotoMedialMaster(input)
  if (!outcome.ok) return { jamoId: input.jamoId, role: input.role, ok: false, message: outcome.message, railErrors: [] }
  return reportFitResult({ fit: outcome.fit, ghostOutline: input.ghostOutline, referenceMeasurements: input.referenceMeasurements ?? input.measurements, weightMultiplier: input.weightMultiplier })
}
