import { describe, expect, it } from 'vitest'
import { CHOSEONG_LIST } from '../src/data/Hangul'
import {
  INVALIDATED_PRESET_REVISIONS,
  PRESET_COMPOSITION_FONT_SHA256,
  PRESET_COMPOSITION_STYLE,
  PRESET_FINAL_EVALUATION,
  PRESET_FINAL_SOURCE,
  PRESET_INITIAL_SOURCE,
  buildPresetCompositionBoard,
  buildPresetCompositionTarget,
  presetCompositionEvidence,
} from './presetCompositionInput'

describe('Noto 공동 조합 입력', () => {
  it('모든 조합 중 실제 조합의 승인 입력만 확인 상태로 표시한다', () => {
    const targets = CHOSEONG_LIST.flatMap(buildPresetCompositionBoard)
    expect(targets.filter((target) => presetCompositionEvidence(target) === 'confirmed-input')
      .map(({ character }) => character)).toEqual(['가', '고', '과'])
    for (const character of ['게', '꽈', '파']) {
      expect(presetCompositionEvidence(targets.find((target) => target.character === character)!)).toBe('projected-input')
    }
    expect(presetCompositionEvidence(targets.find(({ character }) => character === '각')!)).toBe('review-required')
  })
  it('초성 114건과 종성 81건을 같은 Noto identity로 고정한다', () => {
    expect(PRESET_INITIAL_SOURCE.cases).toHaveLength(114)
    expect(PRESET_FINAL_SOURCE.cases).toHaveLength(81)
    expect(PRESET_INITIAL_SOURCE.font.fileSha256).toBe(PRESET_COMPOSITION_FONT_SHA256)
    expect(PRESET_FINAL_SOURCE.font.fileSha256).toBe(PRESET_COMPOSITION_FONT_SHA256)
    expect(PRESET_INITIAL_SOURCE.cases.every(({ status }) => status === 'candidate')).toBe(true)
    expect(PRESET_FINAL_SOURCE.cases.every(({ state }) => state === 'candidate')).toBe(true)
    expect(PRESET_FINAL_EVALUATION.structuralCheckStatus).toBe('pass')
    expect(PRESET_FINAL_EVALUATION.visualReviewStatus).toBe('pending')
  })

  it('19초성마다 21홀자 × 무받침/ㄱ 42개를 같은 보드 순서로 만든다', () => {
    const boards = CHOSEONG_LIST.map((initialJamo) => buildPresetCompositionBoard(initialJamo))
    expect(boards).toHaveLength(19)
    expect(boards.every((board) => board.length === 42)).toBe(true)
    expect(new Set(boards.flat().map(({ character }) => character))).toHaveLength(798)
  })

  it('대표 문맥은 exact, 나머지는 구조 문맥 projection으로 명시한다', () => {
    const exact = buildPresetCompositionTarget({ initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null })
    expect(exact.character).toBe('가')
    expect(exact.initial.projection).toBe('exact-reference-context')
    expect(exact.medial.projection).toBe('exact-reference-context')
    expect(exact.gate).toBe('ready-for-layout-fit')

    const projected = buildPresetCompositionTarget({ initialJamo: 'ㅍ', medialJamo: 'ㅝ', finalJamo: null })
    expect(projected.character).toBe('풔')
    expect(projected.structure).toBe('mixed')
    expect(projected.initial.source.contextId).toBe('mixed')
    expect(projected.initial.source.medialJamo).toBe('ㅘ')
    expect(projected.initial.projection).toBe('structure-context-projection')
    expect(projected.medial.projection).toBe('structure-context-projection')
  })

  it('종성 후보는 연결하되 사용자 시각 승인 전 layout fit을 차단한다', () => {
    const target = buildPresetCompositionTarget({ initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: 'ㄱ' })
    expect(target.character).toBe('각')
    expect(target.final?.source.identity.finalJamo).toBe('ㄱ')
    expect(target.final?.projection).toBe('exact-reference-context')
    expect(target.final?.reviewState).toBe('visual-review-required')
    expect(target.gate).toBe('blocked-final-visual-review')
    expect(target.productionEligible).toBe(false)
  })

  it('r3을 포함한 기존 후보를 막고 요청한 끝면 계약을 고정한다', () => {
    expect(INVALIDATED_PRESET_REVISIONS.map(({ revision }) => revision)).toEqual(['r1', 'r2', 'r3'])
    expect(PRESET_COMPOSITION_STYLE).toEqual({ linecap: 'square', linejoin: 'round', brushTip: 'round' })
  })
})
