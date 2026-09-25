/**
 * 굵기 100~900의 400 대비 두께 배율. 노토 산스 KR 가변 폰트를 아홉 굵기로 놓고 잰 첫닿자 세로줄기(기둥) 두께의 중앙값이다.
 * 출처 `reference-data/noto-weight-pooled.v1.json` `verticalThicknessRatio.median` — 표가 바뀌면 `noto-weight-curve.test.ts`가 잡는다.
 * 플랜 `docs/plans/2026-09-25_굵기-곡선-적용.md`.
 */
const NOTO_WEIGHT_MULTIPLIERS: ReadonlyArray<readonly [weight: number, multiplier: number]> = [
  [100, 0.3964],
  [200, 0.5201],
  [300, 0.6438],
  [400, 1],
  [500, 1.2648],
  [600, 1.4362],
  [700, 1.6075],
  [800, 1.7788],
  [900, 1.9502],
]

/**
 * weight 값(100~900)을 두께 배율로 변환한다. 400은 정확히 1.
 * 아홉 칸 사이는 이웃 두 칸을 직선으로 잇고, 표 밖은 끝 칸 값이다.
 * 화면 · 획 fit · 문장 · OTF가 모두 이 함수 하나를 읽는다.
 */
export function weightToMultiplier(weight: number): number {
  const first = NOTO_WEIGHT_MULTIPLIERS[0]
  const last = NOTO_WEIGHT_MULTIPLIERS[NOTO_WEIGHT_MULTIPLIERS.length - 1]
  if (weight <= first[0]) return first[1]
  if (weight >= last[0]) return last[1]
  for (let i = 1; i < NOTO_WEIGHT_MULTIPLIERS.length; i++) {
    const [upperWeight, upperValue] = NOTO_WEIGHT_MULTIPLIERS[i]
    if (weight > upperWeight) continue
    const [lowerWeight, lowerValue] = NOTO_WEIGHT_MULTIPLIERS[i - 1]
    if (weight === upperWeight) return upperValue
    const t = (weight - lowerWeight) / (upperWeight - lowerWeight)
    return lowerValue + (upperValue - lowerValue) * t
  }
  return last[1]
}

/**
 * 09-26 이전의 직선 배율. 100=0.4x, 400=1.0x, 900=2.2x.
 * 제품은 안 쓴다. `/weight-lab`이 옛 결과와 견주는 데만 남겨 둔다.
 */
export function legacyWeightToMultiplier(weight: number): number {
  if (weight <= 400) return 0.4 + (weight - 100) / 300 * 0.6
  return 1 + (weight - 400) / 500 * 1.2
}
