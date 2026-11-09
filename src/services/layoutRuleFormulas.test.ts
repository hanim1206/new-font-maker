import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { shapeFeaturesOf } from './jamoShapeFeatures'
import { PILLAR_RIGHT, RIGHT_BRANCH_OUT, branchInsetOf, choBottomLiftOf, choSideInsetOf, hasChoWall, choBottomNoFinal, choTopDropNoFinal, vowelBranchKindOf } from './layoutRuleFormulas'
import { CHO_TARGET, JUNG_TARGET } from './layoutRuleTargets'

const CHO_TARGET_A_RIGHT = JUNG_TARGET['ㅏ'].right
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

describe('홀자 가지 갈래', () => {
  it('오른쪽 홀자 아홉이 갈래 넷으로 나뉜다', () => {
    expect(['ㅏ', 'ㅑ'].map(vowelBranchKindOf)).toEqual(['right', 'right'])
    expect(['ㅓ', 'ㅕ'].map(vowelBranchKindOf)).toEqual(['left', 'left'])
    expect(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ'].map(vowelBranchKindOf)).toEqual(['twoStem', 'twoStem', 'twoStem', 'twoStem'])
    expect(vowelBranchKindOf('ㅣ')).toBe('none')
  })
  it('기둥은 가지 반대쪽으로 비켜서고 오른가지 끝은 표의 ㅏ 오른면과 같다', () => {
    expect(PILLAR_RIGHT.right).toBeLessThan(PILLAR_RIGHT.none)
    expect(PILLAR_RIGHT.left).toBeGreaterThan(PILLAR_RIGHT.none)
    expect(Math.abs(PILLAR_RIGHT.right + RIGHT_BRANCH_OUT - CHO_TARGET_A_RIGHT)).toBeLessThan(0.005)
  })
})

describe('왼가지 끝 — 첫닿자 오른쪽 모양', () => {
  it('오른쪽 위가 빈 ㄴ ㅅ은 위부터 막힌 ㄱ ㅁ보다 가지가 더 파고든다', () => {
    const top = (k: string) => shapeFeaturesOf(cho(k))!.rightTop
    expect(top('ㄴ')).toBeGreaterThan(top('ㅅ'))
    expect(top('ㅅ')).toBeGreaterThan(top('ㅁ'))
    expect(top('ㄱ')).toBeLessThan(0.05)
    expect(branchInsetOf(shapeFeaturesOf(cho('ㄴ'))!)).toBeLessThan(branchInsetOf(shapeFeaturesOf(cho('ㅁ'))!) - 0.05)
  })
})

describe('첫닿자 양옆 — 세로벽', () => {
  it('ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅋ ㅌ는 벽이 있고 ㅅ ㅈ ㅊ ㅎ ㅇ ㅍ은 없다', () => {
    const wall = (k: string) => hasChoWall(shapeFeaturesOf(cho(k))!)
    for (const k of 'ㄱㄴㄷㄹㅁㅂㅋㅌ') expect(wall(k), k).toBe(true)
    for (const k of 'ㅅㅈㅊㅎㅇㅍ') expect(wall(k), k).toBe(false)
  })
  it('오른쪽 위가 빈 ㄴ은 왼면만 들이고, 쌍닿자는 오른면을 밖으로 낸다', () => {
    const inset = (k: string) => choSideInsetOf(k, shapeFeaturesOf(cho(k))!)
    expect(inset('ㄴ').right).toBeLessThan(0.01)
    expect(inset('ㅁ').right).toBeGreaterThan(0.05)
    expect(inset('ㅆ').right).toBeLessThan(0)
  })
})

describe('첫닿자 아랫면 — 바닥 모양', () => {
  it('바닥이 막힌 ㄴ ㅁ은 세로줄기 끝만 내려오는 ㄱ ㅋ보다 많이 올린다', () => {
    const lift = (k: string, hasFinal: boolean) => choBottomLiftOf(shapeFeaturesOf(cho(k))!, hasFinal)
    expect(lift('ㄴ', false) - lift('ㄱ', false)).toBeGreaterThan(0.06)
    expect(lift('ㅁ', true) - lift('ㅋ', true)).toBeGreaterThan(0.05)
  })
})
