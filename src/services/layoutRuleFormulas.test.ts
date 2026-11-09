import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { shapeFeaturesOf } from './jamoShapeFeatures'
import { choBottomNoFinal } from './layoutRuleFormulas'
import { CHO_TARGET } from './layoutRuleTargets'
import type { JamoData } from '../types'

const cho = (key: string) => (baseJamos as { choseong: Record<string, JamoData> }).choseong[key]

describe('첫닿자 아래(받침 없음) 공식', () => {
  it('바닥이 평평한 ㅁ은 뾰족한 ㅅ보다 낮게 앉는다', () => {
    expect(shapeFeaturesOf(cho('ㅁ')).bottomFlat).toBeGreaterThan(shapeFeaturesOf(cho('ㅅ')).bottomFlat)
    expect(choBottomNoFinal(shapeFeaturesOf(cho('ㅁ')))).toBeLessThan(choBottomNoFinal(shapeFeaturesOf(cho('ㅅ'))))
  })
  it('열아홉 첫닿자 모두 표 값과 0.03 안에서 같다', () => {
    for (const key of Object.keys(CHO_TARGET)) expect(Math.abs(choBottomNoFinal(shapeFeaturesOf(cho(key))) - CHO_TARGET[key].bottomNoFinal), key).toBeLessThan(0.03)
  })
})
