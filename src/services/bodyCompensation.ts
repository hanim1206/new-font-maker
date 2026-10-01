import type { Padding, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle } from '../types'
import { weightToMultiplier } from '../utils/globalStyleUtils'
import { designBodyScale, isReferenceBody } from './designBodyPlacement'

/**
 * 네모꼴 자동 굵기 보정. 플랜 `docs/plans/2026-10-01_네모꼴-열기.md` 3단계.
 *
 * 네모꼴 가로를 좁히면 칸은 줄어드는데 획 두께는 그대로라 속공간이 막히고 글자가 검어진다. 그래서 **세로줄기만** 가로 비율을 따라 얇게 한다.
 * 장체 폰트가 쓰는 방법이다. 가로줄기는 안 건드린다 — 세로는 고정이라서.
 * 넓힐 때는 보정하지 않는다: 굵게 하면 자소끼리 새로 닿는 글자가 두 배로 늘고(가로 920에서 63 → 136, 3,724자 표본), 안 해도 검기는 1%p 차이다.
 *
 * 보정은 얹는 층이다. 저장된 굵기 · 대비는 그대로 두고 실효 스타일(`getEffectiveStyle`)에만 `strokeStyle.stemScale`로 실린다.
 * 끄면(`autoCompensation: false`) 보정 없는 글자와 점 하나까지 같다. 기본 네모꼴이면 받은 스타일 객체를 그대로 돌려준다.
 */

/**
 * 세로줄기 배율 = 가로 비율 ^ 세기. 세기 0이면 보정 없음, 1이면 가로 비율 그대로(세로줄기가 칸과 같이 눌린다).
 * 이 값은 굵기 400에서의 세기다. 굵을수록 속공간이 원래 좁아 같은 만큼 좁혀도 먼저 막히니, 세기는 굵기 배율에 비례해 세진다(`stemScaleExponentFor`).
 */
export const STEM_SCALE_EXPONENT = 0.5

/**
 * 이 굵기에서의 보정 세기 = 0.5 × 굵기 배율, 최대 1. 굵기 400이면 0.5, 700이면 0.8 안팎, 800 넘으면 1이다. 가는 굵기는 더 약하다.
 * 촘촘한 자소(기둥 간격 150u)에서 가로 600일 때 남는 속공간이 굵기와 상관없이 60% 안팎으로 맞는다(고정 0.5면 굵기 700에서 32%).
 */
export function stemScaleExponentFor(weight: number): number {
  const multiplier = weightToMultiplier(weight)
  return Number.isFinite(multiplier) && multiplier > 0 ? Math.min(1, STEM_SCALE_EXPONENT * multiplier) : STEM_SCALE_EXPONENT
}
const MIN_STEM_SCALE = 0.5

/** 이 네모꼴에서의 세로줄기 굵기 배율. 기본 네모꼴이면 1. */
export function stemScaleForBody(padding: Padding | undefined, exponent = STEM_SCALE_EXPONENT): number {
  if (!padding || isReferenceBody(padding)) return 1
  const scale = designBodyScale(padding).x
  if (!(scale > 0) || !Number.isFinite(scale) || scale >= 1) return 1
  return Math.max(MIN_STEM_SCALE, scale ** exponent)
}

interface CompensatedStyle {
  weight: number
  linecap: StrokeLinecap
  linejoin: StrokeLinejoin
  strokeStyle: StrokeRenderStyle
  autoCompensation?: boolean
}

/**
 * 방향별 두께는 일자 stroker(각진 끝 윤곽)만 낼 수 있다. 그래서 둥근 붓촉에 각진 끝이거나, 이미 그 윤곽으로 그리는 스타일(둥글기 · 대비)에만 건다.
 * 둥근 끝 · 납작 붓 · 면 · 점 스타일은 보정 없이 그대로다.
 */
function canCompensate(style: CompensatedStyle): boolean {
  const stroke = style.strokeStyle
  if (stroke.mode !== 'brush' || stroke.brush.tip !== 'round') return false
  const flatAlready = (stroke.roundness ?? 0) > 0 || (stroke.innerRoundness ?? 0) > 0 || (stroke.contrast ?? 0) !== 0
  return flatAlready || (style.linecap === 'butt' && style.linejoin === 'miter')
}

/** 실효 스타일에 네모꼴 보정을 얹는다. 얹을 게 없으면 받은 객체 그대로. `exponent`를 안 주면 그 스타일의 굵기에 맞는 세기를 쓴다. */
export function withBodyCompensation<T extends CompensatedStyle>(style: T, padding: Padding | undefined, exponent = stemScaleExponentFor(style.weight)): T {
  if (style.autoCompensation === false || !canCompensate(style)) return style
  const stemScale = stemScaleForBody(padding, exponent)
  if (stemScale === 1 || style.strokeStyle.mode !== 'brush') return style
  return { ...style, strokeStyle: { ...style.strokeStyle, stemScale } }
}
