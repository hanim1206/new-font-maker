/**
 * weight 값(100~900)을 두께 배율로 변환한다.
 * 100=0.4x, 400=1.0x, 900=2.2x.
 */
export function weightToMultiplier(weight: number): number {
  if (weight <= 400) return 0.4 + (weight - 100) / 300 * 0.6
  return 1 + (weight - 400) / 500 * 1.2
}
