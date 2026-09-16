import { beforeAll, describe, expect, it } from 'vitest'
// 옛 기본 획(2026-02)에 고정한다. 기본 획은 Noto 골격 다듬기로 바뀌지만 이 컴파일러 계약은 그때 획 기준이다.
import baseJamos from '../data/fixtures/baseJamosLegacy2026-02.json'
import basePresets from '../data/basePresets.json'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../data/legacyCalibrationLayoutProfileV1'
import type { LayoutSchema, LayoutType } from '../types'
import { PRESET_SOURCE_MANIFEST } from '../../src-next/presetCandidateSource'
import { createUserPreset01 } from '../../src-next/userPreset01'
import {
  compileNeutralGothicNotoCandidate,
  createPresetCandidateSeedSchemas,
  PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES,
  PRESET_CANDIDATE_GRID,
  PRESET_CANDIDATE_LAYOUT_TYPES,
  type PresetCandidateCompilation,
  type PresetCandidateCompilerSource,
  type PresetCandidateJamoMaps,
} from './presetCandidateCompiler'

const BASE_SCHEMAS = basePresets.schemas as unknown as Record<LayoutType, LayoutSchema>
const BASE_JAMOS = baseJamos as unknown as PresetCandidateJamoMaps
const USER_PRESET_01_JAMOS = createUserPreset01(BASE_JAMOS)
const JAMO_MAPS: PresetCandidateJamoMaps = {
  choseong: { ...BASE_JAMOS.choseong, ...USER_PRESET_01_JAMOS.choseong },
  jungseong: { ...BASE_JAMOS.jungseong, ...USER_PRESET_01_JAMOS.jungseong },
  jongseong: { ...BASE_JAMOS.jongseong, ...USER_PRESET_01_JAMOS.jongseong },
}
const SOURCE = PRESET_SOURCE_MANIFEST as unknown as PresetCandidateCompilerSource

let compilation: PresetCandidateCompilation

beforeAll(() => {
  compilation = compileNeutralGothicNotoCandidate({
    source: SOURCE,
    baseSchemas: BASE_SCHEMAS,
    legacyProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
    jamos: JAMO_MAPS,
  })
})

describe('Noto 기본 고딕 공간 구조 후보 컴파일러', () => {
  it('42자 역할 오차를 줄인 사용자 검수 후보만 만든다', () => {
    expect(compilation.comparison.cases).toHaveLength(42)
    expect(compilation.comparison.roleObservationCount).toBe(358)
    expect(compilation.comparison.legacyConsonantObservationCount).toBe(342)
    expect(compilation.comparison.candidateRmse).toBeLessThan(compilation.comparison.currentRmse)
    expect(compilation.comparison.legacyCandidateRmse).toBeLessThan(compilation.comparison.legacyCurrentRmse)
    expect(compilation.comparison.legacyRegressionCharacters).toEqual([])
    expect(compilation.comparison.regressionCharacters).toEqual([])
    expect(compilation.invariants).toMatchObject({
      productionEligible: false,
      jamoMutationCount: 0,
      globalStyleMutationCount: 0,
      localTangentShapeMutationCount: 0,
      invalidBoxCount: 0,
      offGridParameterCount: 0,
      userPartOverrideCount: 0,
      legacyConsonantOverrideCount: 114,
    })
  })

  it('Noto 레거시 19초성의 6문맥 상하선만 닿자 목표로 사용한다', () => {
    expect(new Set(compilation.comparison.legacy.map(({ initialJamo }) => initialJamo)).size).toBe(19)
    expect(new Set(compilation.comparison.legacy.map(({ contextId }) => contextId)).size).toBe(6)
    expect(compilation.comparison.legacy).toHaveLength(342)
  })

  it('레거시의 horizontal은 오른쪽 홀자 ㅏ, vertical은 아래 홀자 ㅗ로 연결한다', () => {
    const charactersByContext = new Map(
      compilation.comparison.legacy
        .filter(({ initialJamo }) => initialJamo === 'ㄱ')
        .map(({ contextId, character }) => [contextId, character]),
    )
    expect(charactersByContext.get('initial-horizontal')).toBe('가')
    expect(charactersByContext.get('initial-horizontal-final')).toBe('각')
    expect(charactersByContext.get('initial-vertical')).toBe('고')
    expect(charactersByContext.get('initial-vertical-final')).toBe('곡')
    expect(charactersByContext.get('initial-mixed')).toBe('과')
    expect(charactersByContext.get('initial-mixed-final')).toBe('곽')
  })

  it('여섯 조합 레이아웃만 바꾸고 네 단독 레이아웃은 byte-equivalent로 보존한다', () => {
    expect(compilation.changedLayoutTypes).toEqual(PRESET_CANDIDATE_LAYOUT_TYPES)
    expect(compilation.frozenLayoutTypes).toEqual(PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES)
    for (const layoutType of PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES) {
      expect(compilation.layoutSchemas[layoutType]).toEqual(BASE_SCHEMAS[layoutType])
    }
    for (const layoutType of PRESET_CANDIDATE_LAYOUT_TYPES) {
      expect(compilation.layoutSchemas[layoutType].userPartOverrides).toBeUndefined()
    }
  })

  it('모든 후보 레이아웃 수치를 5-unit 격자에 둔다', () => {
    const numericValues = (value: unknown): number[] => {
      if (typeof value === 'number') return [value]
      if (Array.isArray(value)) return value.flatMap(numericValues)
      if (!value || typeof value !== 'object') return []
      return Object.entries(value).flatMap(([key, child]) => (
        ['priority'].includes(key) ? [] : numericValues(child)
      ))
    }
    for (const layoutType of PRESET_CANDIDATE_LAYOUT_TYPES) {
      const schema = compilation.layoutSchemas[layoutType]
      const parameters = {
        padding: schema.padding,
        designBodyPadding: schema.designBodyPadding,
        splits: schema.splits?.map(({ value }) => value),
        gaps: schema.gaps?.map(({ size, beforeInset, afterInset }) => ({ size, beforeInset, afterInset })),
        partOverrides: schema.partOverrides,
        partOverridesByJungseong: schema.partOverridesByJungseong,
      }
      expect(numericValues(parameters).every((value) => (
        Math.abs(value / PRESET_CANDIDATE_GRID - Math.round(value / PRESET_CANDIDATE_GRID)) < 1e-8
      ))).toBe(true)
    }
  })

  it('국소 접선은 곡선 span이 아니라 시작 anchor x/y만 비교한다', () => {
    const tangentObservations = compilation.comparison.cases.flatMap(({ observations }) => (
      observations.filter(({ referenceMode }) => referenceMode === 'start-side-local-tangent')
    ))
    expect(tangentObservations.length).toBeGreaterThan(0)
    expect(new Set(tangentObservations.map(({ kind }) => kind))).toEqual(new Set(['anchor-x', 'anchor-y']))
    expect(compilation.invariants.localTangentShapeMutationCount).toBe(0)
  })

  it('공통값으로 설명되지 않는 중성만 문맥 오버라이드 차이표에 남긴다', () => {
    expect(compilation.layoutDiffs.some(({ path }) => path.startsWith('partOverridesByJungseong.'))).toBe(true)
    expect(compilation.layoutDiffs.every(({ current, candidate, delta }) => (
      Math.abs(candidate - current - delta) < 1e-6
    ))).toBe(true)
  })

  it('같은 입력에서 byte-identical 결과를 만든다', () => {
    const second = compileNeutralGothicNotoCandidate({
      source: SOURCE,
      baseSchemas: BASE_SCHEMAS,
      legacyProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
      jamos: JAMO_MAPS,
    })
    expect(JSON.stringify(second)).toBe(JSON.stringify(compilation))
  })

  it('분석 입력의 production 경계가 풀리면 중단한다', () => {
    const invalid = structuredClone(SOURCE) as unknown as PresetCandidateCompilerSource & { productionEligible: boolean }
    invalid.productionEligible = true
    expect(() => compileNeutralGothicNotoCandidate({
      source: invalid as PresetCandidateCompilerSource,
      baseSchemas: createPresetCandidateSeedSchemas(BASE_SCHEMAS, LEGACY_CALIBRATION_LAYOUT_PROFILE_V1),
      legacyProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
      jamos: JAMO_MAPS,
    })).toThrow('productionEligible=false')
  })
})
