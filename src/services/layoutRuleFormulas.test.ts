import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { shapeFeaturesOf } from './jamoShapeFeatures'
import { choBottomNoFinal, choTopDropNoFinal } from './layoutRuleFormulas'
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

describe('받침 없을 때 첫닿자 윗면이 내려오는 양', () => {
  it('꼭지 있는 ㅎ이 가장 덜 내려오고 바닥이 뾰족한 ㅋ이 가장 많이 내려온다', () => {
    const drop = (key: string) => choTopDropNoFinal(shapeFeaturesOf(cho(key)))
    expect(drop('ㅎ')).toBeLessThan(drop('ㅁ'))
    expect(drop('ㅁ')).toBeLessThan(drop('ㅋ'))
    for (const key of Object.keys(CHO_TARGET)) expect(drop(key), key).toBeGreaterThan(0)
  })
})
