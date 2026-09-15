import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
import type { DeepReadonly, InkRegion, StrokeRenderStyle } from '../types'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { partForJamoRole } from './jamoContextRoles'
import { fitNotoMedialMaster } from './notoMedialMasterFit'
import type { MedialFitInput, MedialFitResult } from './notoMedialMasterFit'
import { notoOutlineToInkRegions } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'
import { resolveShapeGlyphInkPrimitives } from './shapeGlyphInkResolver'

/**
 * 획 마스터 fit 결과를 Noto 고스트와 겹쳐 얼마나·어디서 벗어났는지 숫자로 낸다.
 * 게이트가 아니라 리포트다. xor 비율은 "얼마나", rail 오차는 "어느 기준선이".
 */

// 면 primitive만 넘기므로 중심선 스타일은 round/round 기본으로 충분하다.
const FIT_INK_STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }
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

function regionToPolygon(region: DeepReadonly<InkRegion>): Polygon {
  return [region.outer, ...region.holes].map((ring) => ring.map((point) => [point.x, point.y] as [number, number]))
}

function multiPolygonArea(shape: MultiPolygon): number {
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

function unionOf(regions: readonly DeepReadonly<InkRegion>[]): MultiPolygon {
  const polygons = regions.map(regionToPolygon)
  if (!polygons.length) return []
  return polygonClipping.union(polygons[0], ...polygons.slice(1))
}

/** 측정 face와 fit 중심선을 같은 자리로 되돌려 비교한다. 직접 fit이면 0, 모델 예측 rail이면 예측 오차가 된다. */
export function railErrorsOf(fit: MedialFitResult, measurements: MedialFitInput['measurements']): RailError[] {
  return fit.strokes.map((stroke) => {
    const m = measurements[stroke.roleId]
    const inward = stroke.orientation === 'vertical' ? (m.faceSide === 'right' ? -1 : 1) : (m.faceSide === 'top' ? 1 : -1)
    const fitted = stroke.center - inward * stroke.thickness / 2
    return { roleId: stroke.roleId, measured: m.face, fitted, errorUnits: (fitted - m.face) * 1000 }
  })
}

export function reportMedialFit(input: MedialFitInput & { ghostOutline: DeepReadonly<NotoOutline>; weightMultiplier?: number }): MedialFitReport {
  const base = { jamoId: input.jamoId, role: input.role }
  const outcome = fitNotoMedialMaster(input)
  if (!outcome.ok) return { ...base, ok: false, message: outcome.message, railErrors: [] }
  const { fit } = outcome
  const primitives = resolveShapeGlyphInkPrimitives({
    source: fit.scope, masterId: fit.master.id, glyphId: `fit:${input.jamoId}`,
    part: partForJamoRole(input.role), slot: fit.slot, weightMultiplier: input.weightMultiplier ?? 1,
  })
  if (!primitives.ok) return { ...base, ok: false, message: primitives.issues[0]?.message ?? '마스터를 해석할 수 없습니다.', railErrors: railErrorsOf(fit, input.measurements), slot: fit.slot }
  const ink = materializeFinalGlyphInk(primitives.primitives, FIT_INK_STYLE, INK_OPTIONS)
  if (!ink.ok) return { ...base, ok: false, message: ink.message, railErrors: railErrorsOf(fit, input.measurements), slot: fit.slot }
  const ghost = notoOutlineToInkRegions(input.ghostOutline)
  if (!ghost.ok) return { ...base, ok: false, message: ghost.message, railErrors: railErrorsOf(fit, input.measurements), slot: fit.slot }
  const mine = unionOf(ink.ink.regions)
  const theirs = unionOf(ghost.regions)
  const ghostArea = multiPolygonArea(theirs)
  if (ghostArea <= 0) return { ...base, ok: false, message: 'Noto 고스트 면적이 0입니다.', railErrors: railErrorsOf(fit, input.measurements), slot: fit.slot }
  const xor = polygonClipping.xor(mine, theirs)
  return {
    ...base, ok: true,
    xorRatio: multiPolygonArea(xor) / ghostArea,
    inkRatio: multiPolygonArea(mine) / ghostArea,
    railErrors: railErrorsOf(fit, input.measurements),
    slot: fit.slot,
  }
}
