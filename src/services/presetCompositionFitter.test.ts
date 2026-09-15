import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { MIXED_JUNGSEONG } from '../data/Hangul'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../data/legacyCalibrationLayoutProfileV1'
import type { JamoData } from '../types'
import { BASE_PRESETS_SCHEMAS } from '../utils/layoutCalculator'
import { USER_PRESET_01_JAMOS } from '../../src-next/userPreset01'
import { buildPresetCompositionBoard, buildPresetCompositionTarget, type PresetCompositionTarget } from '../../src-next/presetCompositionInput'
import { createCurrentPresetSchemas } from './presetCandidateCompiler'
import {
  PRESET_COMPOSITION_FITTER_GRID,
  PRESET_COMPOSITION_MINIMUM_GAP,
  fitPresetCompositionNoFinal,
} from './presetCompositionFitter'

const JAMO_MAPS = {
  choseong: { ...(baseJamos.choseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.choseong },
  jungseong: { ...(baseJamos.jungseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.jungseong },
  jongseong: { ...(baseJamos.jongseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.jongseong },
}
const CURRENT_SCHEMAS = createCurrentPresetSchemas(BASE_PRESETS_SCHEMAS, LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)

function fit(character: string) {
  const target = buildPresetCompositionBoard('ㄱ').find((candidate) => candidate.character === character)
  if (!target) throw new Error(`${character} 입력 없음`)
  return fitPresetCompositionNoFinal({
    target,
    baseSchema: CURRENT_SCHEMAS[layoutSchema(target.structure)],
    jamos: JAMO_MAPS,
  })
}

function layoutSchema(structure: PresetCompositionTarget['structure']) {
  return structure === 'right'
    ? 'choseong-jungseong-vertical'
    : structure === 'bottom'
      ? 'choseong-jungseong-horizontal'
      : 'choseong-jungseong-mixed'
}

function fitTarget(target: PresetCompositionTarget) {
  return fitPresetCompositionNoFinal({ target, baseSchema: CURRENT_SCHEMAS[layoutSchema(target.structure)], jamos: JAMO_MAPS })
}

describe('r4 무받침 공동 layout fitter', () => {
  it.each(['가', '고', '과'])('%s의 초성·홀자를 같은 글자에서 fit한다', (character) => {
    const result = fit(character)
    expect(result.productionEligible).toBe(false)
    expect(result.candidateRmse).toBeLessThan(result.currentRmse)
    expect(result.improvement).toBeGreaterThan(0)
    expect(Object.values(result.boxes).every((box) => (
      [box.x, box.y, box.width, box.height].every(Number.isFinite)
    ))).toBe(true)
    expect(Object.values(result.boxes).flatMap((box) => Object.values(box)).every((value) => (
      Math.abs(value / PRESET_COMPOSITION_FITTER_GRID - Math.round(value / PRESET_COMPOSITION_FITTER_GRID)) < 1e-8
    ))).toBe(true)
    expect(result.collision.minimumGap).toBe(PRESET_COMPOSITION_MINIMUM_GAP)
  })

  it('ㄱ × 21홀자 무받침 후보를 모두 계산한다', () => {
    const targets = buildPresetCompositionBoard('ㄱ').filter(({ finalJamo }) => finalJamo === null)
    const results = targets.map((target) => fitPresetCompositionNoFinal({
      target,
      baseSchema: CURRENT_SCHEMAS[layoutSchema(target.structure)],
      jamos: JAMO_MAPS,
    }))
    expect(results).toHaveLength(21)
    expect(new Set(results.map(({ character }) => character)).size).toBe(21)
    expect(results.every(({ candidateRmse, currentRmse }) => candidateRmse < currentRmse)).toBe(true)
  })

  it('혼합중성 21자 이상에서 충돌 안전 기준을 지킨다', () => {
    const initialChoseongs: PresetCompositionTarget['initialJamo'][] = ['ㄱ', 'ㄲ', 'ㅍ', 'ㅂ']
    const targets = initialChoseongs.flatMap((initialJamo) => buildPresetCompositionBoard(initialJamo).filter((
      (target): target is PresetCompositionTarget => target.finalJamo === null && target.structure === 'mixed' && MIXED_JUNGSEONG.includes(target.medialJamo),
    )))
    const results = targets.map((target) => fitTarget(target))
    expect(results).toHaveLength(initialChoseongs.length * MIXED_JUNGSEONG.length)
    const minimumGap = PRESET_COMPOSITION_MINIMUM_GAP - 1e-4
    const gapOkResults = results.filter(({ collision }) => collision.gap >= minimumGap)
    expect(gapOkResults).toHaveLength(results.length)
    const nonImprovingMixedResults = results.filter(({ candidateRmse, currentRmse }) => candidateRmse >= currentRmse)
    expect(nonImprovingMixedResults).toHaveLength(0)
    expect(results.filter(({ status }) => status === 'blocked-collision')).toHaveLength(0)
  })

  it.each([
    ['ㄱ', 'ㅘ'],
    ['ㄲ', 'ㅘ'],
    ['ㅍ', 'ㅘ'],
    ['ㅂ', 'ㅘ'],
  ] as const)('%s×%s 동형군 회귀를 검사한다', (initialJamo, medialJamo) => {
    const target = buildPresetCompositionTarget({ initialJamo, medialJamo, finalJamo: null })
    const result = fitTarget(target)
    expect(result.candidateRmse).toBeLessThan(result.currentRmse)
    expect(result.collision.safe).toBe(true)
    expect(result.status).toBe('ready-user-review')
    expect(result.collision.gap).toBeGreaterThanOrEqual(PRESET_COMPOSITION_MINIMUM_GAP)
    expect(target.character).toBeTruthy()
  })

  it('받침 입력은 fitter에 넣지 않는다', () => {
    const target = buildPresetCompositionTarget({ initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: 'ㄱ' })
    expect(() => fitPresetCompositionNoFinal({
      target,
      baseSchema: CURRENT_SCHEMAS['choseong-jungseong-vertical-jongseong'],
      jamos: JAMO_MAPS,
    })).toThrow('무받침 layout fit 대상 아님')
  })
})
