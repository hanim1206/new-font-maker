import { describe, expect, it } from 'vitest'
import basePresets from '../src/data/basePresets.json'
import {
  PRESET_CANDIDATE_ARTIFACT,
  parsePresetCandidateArtifact,
} from './presetCandidateArtifact'

describe('기본 고딕 01 공간 구조 후보 r3', () => {
  it('제품 미반영 상태와 G2 불변식을 고정한다', () => {
    expect(PRESET_CANDIDATE_ARTIFACT.status).toBe('user-review-required')
    expect(PRESET_CANDIDATE_ARTIFACT.productionEligible).toBe(false)
    expect(PRESET_CANDIDATE_ARTIFACT.invariants).toMatchObject({
      jamoMutationCount: 0,
      globalStyleMutationCount: 1,
      frozenLayoutMutationCount: 0,
      userPartOverrideCount: 0,
      legacyConsonantOverrideCount: 114,
      invalidBoxCount: 0,
      offGridParameterCount: 0,
      localTangentShapeMutationCount: 0,
    })
  })

  it('끝면만 네모로 바꾸고 접합과 붓촉은 둥글게 유지한다', () => {
    expect(PRESET_CANDIDATE_ARTIFACT.frozen.globalStyle.linecap).toBe('square')
    expect(PRESET_CANDIDATE_ARTIFACT.frozen.globalStyle.linejoin).toBe('round')
    expect(PRESET_CANDIDATE_ARTIFACT.frozen.globalStyle.brush.tip).toBe('round')
    expect(PRESET_CANDIDATE_ARTIFACT.policy.styleMutationScope).toBe('global-linecap-only')
  })

  it('네 단독 레이아웃과 자모 형태를 그대로 두고 역할 오차만 줄인다', () => {
    for (const layoutType of PRESET_CANDIDATE_ARTIFACT.frozenLayoutTypes) {
      expect(PRESET_CANDIDATE_ARTIFACT.layoutSchemas[layoutType]).toEqual(basePresets.schemas[layoutType])
    }
    expect(PRESET_CANDIDATE_ARTIFACT.comparison.cases).toHaveLength(42)
    expect(PRESET_CANDIDATE_ARTIFACT.comparison.candidateRmse)
      .toBeLessThan(PRESET_CANDIDATE_ARTIFACT.comparison.currentRmse)
    expect(PRESET_CANDIDATE_ARTIFACT.comparison.legacyConsonantObservationCount).toBe(342)
    expect(PRESET_CANDIDATE_ARTIFACT.comparison.legacyCandidateRmse)
      .toBeLessThan(PRESET_CANDIDATE_ARTIFACT.comparison.legacyCurrentRmse)
    expect(PRESET_CANDIDATE_ARTIFACT.comparison.regressionCharacters).toEqual([])
  })

  it('제품 승인이나 형태 변경으로 위장한 파일을 거부한다', () => {
    const production = structuredClone(PRESET_CANDIDATE_ARTIFACT) as unknown as { productionEligible: boolean }
    production.productionEligible = true
    expect(() => parsePresetCandidateArtifact(production)).toThrow('productionEligible')

    const shape = structuredClone(PRESET_CANDIDATE_ARTIFACT) as unknown as {
      invariants: { localTangentShapeMutationCount: number }
    }
    shape.invariants.localTangentShapeMutationCount = 1
    expect(() => parsePresetCandidateArtifact(shape)).toThrow('localTangentShapeMutationCount')
  })
})
