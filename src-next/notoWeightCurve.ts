import pooled from '../reference-data/noto-weight-pooled.v1.json'
import { legacyWeightToMultiplier, weightToMultiplier } from '../src/utils/globalStyleUtils'

/**
 * 노토 굵기 곡선. `scripts/reference-lab/measure_weight_offsets.py`가 노토 가변 폰트를 100~900으로 놓고 잰
 * 첫닿자 줄기 두께 · 속공간 · 바깥 변 성장 몫의 400 대비 중앙값이다(`reference-data/noto-weight-pooled.v1.json`).
 * 세로줄기 배율 아홉 칸은 09-26부터 제품의 `weightToMultiplier`에 상수로 들어갔다(플랜 `2026-09-25_굵기-곡선-적용`).
 * 여기는 실험실(`/weight-lab`)이 가로줄기 · 속공간 · 바깥 변 몫 · 옛 직선 오차를 볼 때 읽는다.
 */

interface Quantile { median: number; q1: number; q3: number; n: number }

interface PooledRow {
  verticalThicknessRatio: Quantile | null
  horizontalThicknessRatio: Quantile | null
  counterRatioAcrossX: Quantile | null
  counterRatioAcrossY: Quantile | null
  outerEdgeGrowthShare: Quantile | null
  centerShiftPerThicknessDelta: Quantile | null
  medialStemRatio: Quantile | null
  medialBeamRatio: Quantile | null
  boxWidthRatio: Quantile | null
  boxHeightRatio: Quantile | null
  appMultiplier: number
  appThicknessError: number | null
}

interface PooledTable {
  baseWeight: number
  weights: number[]
  pooled: Record<string, PooledRow>
}

const TABLE = pooled as unknown as PooledTable

/** 표에 있는 굵기(100 단위 아홉 칸). */
export const NOTO_WEIGHT_STEPS: readonly number[] = TABLE.weights

/** 그 굵기의 표 한 줄. 없으면 null. */
export function notoWeightRow(weight: number): PooledRow | null {
  return TABLE.pooled[String(weight)] ?? null
}

/** 표 사이 굵기는 이웃 두 칸을 직선으로 잇는다. 표 밖은 끝 칸 값. */
function interpolate(weight: number, pick: (row: PooledRow) => number | null): number | null {
  const steps = NOTO_WEIGHT_STEPS
  const clamped = Math.min(Math.max(weight, steps[0]), steps[steps.length - 1])
  const upperIndex = steps.findIndex((step) => step >= clamped)
  const lower = steps[Math.max(upperIndex - 1, 0)]
  const upper = steps[upperIndex]
  const lowerValue = pick(TABLE.pooled[String(lower)])
  const upperValue = pick(TABLE.pooled[String(upper)])
  if (lowerValue === null || upperValue === null) return lowerValue ?? upperValue
  if (upper === lower) return upperValue
  const t = (clamped - lower) / (upper - lower)
  return lowerValue + (upperValue - lowerValue) * t
}

/** 노토가 그 굵기에서 400 대비 줄기를 몇 배로 그리는가. 세로줄기(기둥) 기준이 기본. 400은 정확히 1. */
export function notoThicknessMultiplier(weight: number, axis: 'vertical' | 'horizontal' = 'vertical'): number {
  if (weight === TABLE.baseWeight) return 1
  const value = interpolate(weight, (row) => (axis === 'vertical' ? row.verticalThicknessRatio : row.horizontalThicknessRatio)?.median ?? null)
  return value ?? weightToMultiplier(weight)
}

/** 두께가 자란 양 중 바깥 변으로 나간 몫. 0.5면 중심선 고정(지금 앱), 0이면 바깥 변 고정. 400은 정의가 없어 0.5. */
export function notoOuterEdgeGrowthShare(weight: number): number {
  if (weight === TABLE.baseWeight) return 0.5
  return interpolate(weight, (row) => row.outerEdgeGrowthShare?.median ?? null) ?? 0.5
}

/**
 * 중심선 상자를 안으로 얼마나 밀어야 노토처럼 바깥 변이 덜 자라는가(정규화 단위, 한 변).
 * 중심선 고정이면 바깥 변이 Δt/2 자라고, 노토는 Δt × 몫만 자라니 그 차이만큼 상자를 줄인다.
 */
export function notoCenterlineInset(weight: number, baseThickness: number): number {
  const delta = baseThickness * (notoThicknessMultiplier(weight) - 1)
  return delta * (0.5 - notoOuterEdgeGrowthShare(weight))
}

/** 09-26 이전 직선 배율이 노토보다 몇 % 두꺼웠나(+면 옛 앱이 두껍다). 지금 제품 배율은 노토 곡선 그대로라 오차가 0이다. */
export function legacyThicknessErrorAt(weight: number): number {
  return legacyWeightToMultiplier(weight) / notoThicknessMultiplier(weight) - 1
}
