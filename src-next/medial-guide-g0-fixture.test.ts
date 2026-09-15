import { describe, expect, it } from 'vitest'
import { MEDIAL_DEFINITIONS } from './medialGuideModel'
import { MEDIAL_GUIDE_P0_G0_FIXTURE } from './fixtures/medialGuideP0G0.v1'

describe('홀자 기준선 P0 G0 fixture', () => {
  it('가로 홀자의 짧은 세로줄기를 보와 별도 역할로 정의한다', () => {
    expect(MEDIAL_DEFINITIONS['ㅗ'].roles.map(({ id, side }) => [id, side])).toEqual([
      ['basePillarFace', 'right'], ['baseStemTipFace', 'top'], ['primaryBeamFace', 'top'],
    ])
    expect(MEDIAL_DEFINITIONS['ㅜ'].roles.map(({ id, side }) => [id, side])).toEqual([
      ['basePillarFace', 'right'], ['baseStemTipFace', 'bottom'], ['primaryBeamFace', 'top'],
    ])
    expect(MEDIAL_DEFINITIONS['ㅛ'].roles.map(({ id, side }) => [id, side])).toEqual([
      ['leftStemFace', 'right'], ['leftStemTipFace', 'top'], ['rightStemFace', 'right'], ['rightStemTipFace', 'top'], ['primaryBeamFace', 'top'],
    ])
    expect(MEDIAL_DEFINITIONS['ㅠ'].roles.map(({ id, side }) => [id, side])).toEqual([
      ['leftStemFace', 'right'], ['leftStemTipFace', 'bottom'], ['rightStemFace', 'right'], ['rightStemTipFace', 'bottom'], ['primaryBeamFace', 'top'],
    ])
    expect(MEDIAL_DEFINITIONS['ㅡ'].roles.map(({ id }) => id)).toEqual(['primaryBeamFace'])
  })

  it('ㄱ × 7홀자 × 받침 없음/ㄱ의 14글자와 28개 구조 요소를 고정한다', () => {
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.status).toBe('approved-analysis-gold')
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.approvedAt).toBe('2026-09-14')
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.review).toEqual({ approved: true, gold: true, productionEligible: false })
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.roleDefinitionVersion).toBe('medial-guide-role-v3')
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.legacyRoleDefinitionVersion).toBe('medial-guide-role-v2')
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.tuningCases).toHaveLength(7)

    const characters = new Set<string>()
    let roleCount = 0
    let elementCount = 0
    MEDIAL_GUIDE_P0_G0_FIXTURE.tuningCases.forEach((tuningCase) => {
      const definition = MEDIAL_DEFINITIONS[tuningCase.medialJamo]
      expect(tuningCase.characters).toEqual([
        String.fromCodePoint(0xac00 + definition.index * 28),
        String.fromCodePoint(0xac00 + definition.index * 28 + 1),
      ])
      expect(tuningCase.roles).toEqual(definition.roles.map(({ id }) => id))
      tuningCase.characters.forEach((character) => characters.add(character))
      roleCount += tuningCase.roles.length * 2
      elementCount += tuningCase.elements.length * 2
    })

    expect(characters.size).toBe(14)
    expect(roleCount).toBe(34)
    expect(elementCount).toBe(28)
  })

  it('여섯 문맥 ROI와 제외 역할을 shared-baseline 계약으로 고정한다', () => {
    const entries = Object.entries(MEDIAL_GUIDE_P0_G0_FIXTURE.contexts)
    expect(entries).toHaveLength(6)
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.boundaryRule).toEqual({
      include: 'closed',
      membership: 'inside-any-include',
      foreignInkPolicy: 'classify-contour-or-abstain',
    })
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.excludedRoles).toEqual(['initial', 'final'])

    entries.forEach(([contextId, context]) => {
      expect(context.include.length).toBeGreaterThan(0)
      context.include.forEach((region) => {
        expect(Number.isFinite(region.x + region.y + region.width + region.height)).toBe(true)
        expect(region.width).toBeGreaterThan(0)
        expect(region.height).toBeGreaterThan(0)
        expect(region.x).toBeGreaterThanOrEqual(75)
        expect(region.y).toBeGreaterThanOrEqual(75)
        expect(region.x + region.width).toBeLessThanOrEqual(925)
        expect(region.y + region.height).toBeLessThanOrEqual(925)
      })
      expect(contextId.startsWith('initial-')).toBe(true)
    })

    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.contexts['initial-mixed'].include).toHaveLength(2)
    expect(MEDIAL_GUIDE_P0_G0_FIXTURE.contexts['initial-mixed-final'].include).toHaveLength(2)
  })

})
