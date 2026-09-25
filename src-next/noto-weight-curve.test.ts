import { describe, expect, it } from 'vitest'
import pooled from '../reference-data/noto-weight-pooled.v1.json'
import { legacyWeightToMultiplier, weightToMultiplier } from '../src/utils/globalStyleUtils'
import { NOTO_WEIGHT_STEPS, legacyThicknessErrorAt, notoCenterlineInset, notoOuterEdgeGrowthShare, notoThicknessMultiplier, notoWeightRow } from './notoWeightCurve'

describe('노토 굵기 곡선', () => {
  it('표는 100부터 900까지 아홉 칸이고 400이 기준이다', () => {
    expect(NOTO_WEIGHT_STEPS).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
    expect(notoThicknessMultiplier(400)).toBe(1)
    expect(notoThicknessMultiplier(400, 'horizontal')).toBe(1)
    expect(notoOuterEdgeGrowthShare(400)).toBe(0.5)
    expect(notoCenterlineInset(400, 0.07)).toBe(0)
  })

  it('굵기가 오르면 배율이 단조롭게 오르고, 900은 앱 배율 2.2보다 얇다', () => {
    let previous = 0
    for (const weight of NOTO_WEIGHT_STEPS) {
      const multiplier = notoThicknessMultiplier(weight)
      expect(multiplier).toBeGreaterThan(previous)
      previous = multiplier
    }
    expect(notoThicknessMultiplier(900)).toBeLessThan(legacyWeightToMultiplier(900))
    expect(legacyThicknessErrorAt(900)).toBeGreaterThan(0.1)
    // 100은 앱과 거의 같다(0.4 근처).
    expect(Math.abs(legacyThicknessErrorAt(100))).toBeLessThan(0.05)
  })

  it('표 사이 굵기는 이웃 칸을 직선으로 잇고, 표 밖은 끝 칸 값이다', () => {
    const at500 = notoThicknessMultiplier(500)
    const at600 = notoThicknessMultiplier(600)
    expect(notoThicknessMultiplier(550)).toBeCloseTo((at500 + at600) / 2, 10)
    expect(notoThicknessMultiplier(950)).toBe(notoThicknessMultiplier(900))
    expect(notoThicknessMultiplier(50)).toBe(notoThicknessMultiplier(100))
  })

  it('바깥 변 몫이 0.5보다 작으면 상자를 안으로 민다', () => {
    const share = notoOuterEdgeGrowthShare(900)
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(0.5)
    const inset = notoCenterlineInset(900, 0.07)
    expect(inset).toBeCloseTo(0.07 * (notoThicknessMultiplier(900) - 1) * (0.5 - share), 12)
    expect(inset).toBeGreaterThan(0)
  })

  it('표 한 줄에는 앱 배율과 오차가 같이 있다', () => {
    const row = notoWeightRow(900)
    expect(row?.appMultiplier).toBe(2.2)
    expect(row?.verticalThicknessRatio?.n).toBeGreaterThan(30)
    expect(notoWeightRow(450)).toBeNull()
  })
})

describe('제품 굵기 배율 weightToMultiplier', () => {
  const table = pooled as unknown as { weights: number[]; pooled: Record<string, { verticalThicknessRatio: { median: number } | null }> }

  it('400은 정확히 1이다', () => {
    expect(weightToMultiplier(400)).toBe(1)
  })

  it('아홉 칸이 노토 세로줄기 중앙값(JSON)과 같다', () => {
    for (const weight of table.weights) {
      const expected = weight === 400 ? 1 : table.pooled[String(weight)].verticalThicknessRatio?.median
      expect(expected).toBeTypeOf('number')
      expect(weightToMultiplier(weight)).toBeCloseTo(expected as number, 4)
      expect(weightToMultiplier(weight)).toBeCloseTo(notoThicknessMultiplier(weight), 4)
    }
  })

  it('칸 사이는 직선, 표 밖은 끝 칸 값이다', () => {
    expect(weightToMultiplier(450)).toBeCloseTo((weightToMultiplier(400) + weightToMultiplier(500)) / 2, 10)
    expect(weightToMultiplier(50)).toBe(weightToMultiplier(100))
    expect(weightToMultiplier(1000)).toBe(weightToMultiplier(900))
    let previous = 0
    for (let weight = 100; weight <= 900; weight += 50) {
      expect(weightToMultiplier(weight)).toBeGreaterThan(previous)
      previous = weightToMultiplier(weight)
    }
  })

  it('옛 직선은 900에서 13% 두껍고 400에서는 같다', () => {
    expect(legacyWeightToMultiplier(400)).toBe(1)
    expect(legacyWeightToMultiplier(900)).toBe(2.2)
    expect(legacyWeightToMultiplier(900) / weightToMultiplier(900) - 1).toBeCloseTo(0.128, 2)
  })
})
