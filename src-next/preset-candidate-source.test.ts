import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { JUNGSEONG_LIST } from '../src/data/Hangul'
import {
  PRESET_SOURCE_MANIFEST,
  parsePresetSourceManifest,
  type PresetSourceManifest,
} from './presetCandidateSource'

function mutableManifest(): PresetSourceManifest {
  return structuredClone(PRESET_SOURCE_MANIFEST)
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('Noto 단일 출처 기본 고딕 입력', () => {
  it('ㄱ × 현대 홀자 21자 × 무받침/ㄱ 42자를 정확히 고정한다', () => {
    expect(PRESET_SOURCE_MANIFEST.productionEligible).toBe(false)
    expect(PRESET_SOURCE_MANIFEST.policy.promotion).toBe('explicit-user-approval-only')
    expect(PRESET_SOURCE_MANIFEST.cases).toHaveLength(42)
    expect(PRESET_SOURCE_MANIFEST.caseCounts).toEqual({ approvedAnalysis: 14, automaticCandidate: 28, userApprovedCandidate: 28 })

    for (const medialJamo of JUNGSEONG_LIST) {
      const pair = PRESET_SOURCE_MANIFEST.cases.filter((candidateCase) => candidateCase.medialJamo === medialJamo)
      expect(pair.map(({ finalJamo }) => finalJamo)).toEqual([null, 'ㄱ'])
      expect(pair.every(({ initialJamo }) => initialJamo === 'ㄱ')).toBe(true)
    }
  })

  it('승인 골드와 사용자 확인 자동 후보의 출처 등급을 섞지 않는다', () => {
    const gold = PRESET_SOURCE_MANIFEST.cases.filter(({ sourceClass }) => sourceClass === 'approved-analysis')
    const approvedCandidates = PRESET_SOURCE_MANIFEST.cases.filter(({ sourceClass }) => sourceClass === 'automatic-candidate')

    expect(new Set(gold.map(({ medialJamo }) => medialJamo))).toEqual(new Set(['ㅏ', 'ㅓ', 'ㅣ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅘ']))
    expect(gold.every(({ reviewStatus, productionEligible }) => reviewStatus === 'user-approved-analysis' && !productionEligible)).toBe(true)
    expect(approvedCandidates.every(({ reviewStatus, productionEligible }) => reviewStatus === 'user-approved-candidate' && !productionEligible)).toBe(true)
    expect(approvedCandidates.flatMap(({ elements }) => elements).every(({ match }) => match?.confidence === 'medium')).toBe(true)
    expect(approvedCandidates.flatMap(({ elements }) => elements).every(({ provenance }) => provenance.extractorVersion === 'geometric-role-matcher-v9')).toBe(true)
  })

  it('09-15 기록의 신규 프로젝트 기준값과 localStorage 제외 정책이 digest로 스스로 맞는다', () => {
    const baseline = PRESET_SOURCE_MANIFEST.currentBaseline
    expect(baseline.sourceClass).toBe('current-fallback')
    expect(baseline.storageInput).toBe('excluded')
    expect(baseline.layouts.mutableLayoutTypes).toHaveLength(6)
    expect(baseline.layouts.frozenLayoutTypes).toHaveLength(4)

    // 2026-09-15에 뜬 기록이다. 그 뒤로 원본 파일(기본 자모 · 프리셋 · 레이아웃 계산 · 전역 스타일)이 계속 바뀌어
    // 지금 파일과 견주면 늘 깨진다(10-03). 기록이 스스로 맞는지만 본다 — 적힌 원본 지문으로 기준값 지문을 다시 낸다.
    // 기준값 지문은 이 여섯 원본(이 순서)으로 냈다.
    const sourceDigests = Object.fromEntries((['baseJamos', 'userPreset01', 'basePresets', 'layoutCalculator', 'legacyLayoutProfile', 'globalStyleStore'] as const)
      .map((id) => [id, PRESET_SOURCE_MANIFEST.sourceDigests[id]]))

    const { digest: recordedBaselineDigest, ...baselineCore } = baseline
    expect(sha256(JSON.stringify({ sourceDigests, baseline: baselineCore }))).toBe(recordedBaselineDigest)
    expect(sha256(JSON.stringify({
      sourceDigests: PRESET_SOURCE_MANIFEST.sourceDigests,
      currentBaseline: baseline,
      scope: {
        medialObservationInitialJamo: PRESET_SOURCE_MANIFEST.scope.medialObservationInitialJamo,
        medials: PRESET_SOURCE_MANIFEST.scope.medials,
        finalJamos: PRESET_SOURCE_MANIFEST.scope.finalJamos,
        legacyConsonantInitialJamos: PRESET_SOURCE_MANIFEST.scope.legacyConsonantInitialJamos,
        legacyConsonantContextCount: PRESET_SOURCE_MANIFEST.scope.legacyConsonantContextCount,
      },
    }))).toBe(PRESET_SOURCE_MANIFEST.inputDigest)
  })

  it('무효화된 extractor가 다시 들어오면 전체 manifest를 거부한다', () => {
    for (const extractorVersion of ['geometric-role-matcher-v4', 'geometric-role-matcher-v6', 'geometric-role-matcher-v7', 'geometric-role-matcher-v8']) {
      const manifest = mutableManifest()
      const pendingCase = manifest.cases.find(({ sourceClass }) => sourceClass === 'automatic-candidate')
      expect(pendingCase).toBeDefined()
      const mutableCase = pendingCase as unknown as { elements: Array<{ provenance: { extractorVersion: string } }> }
      mutableCase.elements[0].provenance.extractorVersion = extractorVersion

      expect(() => parsePresetSourceManifest(manifest)).toThrow('무효화된 extractor')
    }
  })

  it('제품 사용 가능 표시로 바뀐 분석 manifest를 거부한다', () => {
    const manifest = mutableManifest() as unknown as { productionEligible: boolean }
    manifest.productionEligible = true

    expect(() => parsePresetSourceManifest(manifest)).toThrow('productionEligible')
  })
})
