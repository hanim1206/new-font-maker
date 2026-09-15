import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../data/legacyCalibrationLayoutProfileV1'
import type { JamoData, LayoutType } from '../types'
import { BASE_PRESETS_SCHEMAS } from '../utils/layoutCalculator'
import { USER_PRESET_01_JAMOS } from '../../src-next/userPreset01'
import { PRESET_CANDIDATE_ARTIFACT } from '../../src-next/presetCandidateArtifact'
import { createCurrentPresetSchemas } from './presetCandidateCompiler'
import { measurePresetJointSquareInk } from './presetJointInkMeasurement'

const JAMO_MAPS = {
  choseong: { ...(baseJamos.choseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.choseong },
  jungseong: { ...(baseJamos.jungseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.jungseong },
  jongseong: { ...(baseJamos.jongseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.jongseong },
}

const CURRENT_SCHEMAS = createCurrentPresetSchemas(BASE_PRESETS_SCHEMAS, LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)

describe('프리셋 공동 square 잉크 측정', () => {
  it.each([
    ['가', 'choseong-jungseong-vertical'],
    ['고', 'choseong-jungseong-horizontal'],
    ['과', 'choseong-jungseong-mixed'],
    ['각', 'choseong-jungseong-vertical-jongseong'],
    ['곡', 'choseong-jungseong-horizontal-jongseong'],
    ['곽', 'choseong-jungseong-mixed-jongseong'],
  ] as const)('%s의 실제 square 윤곽에서 파트 경계를 계산한다', (character, layoutType) => {
    const result = measurePresetJointSquareInk({
      character,
      schema: CURRENT_SCHEMAS[layoutType],
      jamos: JAMO_MAPS,
    })
    expect(result.layoutType).toBe(layoutType)
    expect(Object.values(result.partBounds).every((bounds) => (
      bounds.minX < bounds.maxX && bounds.minY < bounds.maxY
    ))).toBe(true)
    expect(Number.isFinite(result.collision.gap)).toBe(true)
  })

  it('r3의 곅 겹침을 공동 CH/JU/JO 충돌 gate로 검출한다', () => {
    const layoutType: LayoutType = 'choseong-jungseong-vertical-jongseong'
    const result = measurePresetJointSquareInk({
      character: '곅',
      schema: PRESET_CANDIDATE_ARTIFACT.layoutSchemas[layoutType],
      jamos: JAMO_MAPS,
    })
    expect(result.collision.beforeParts).toEqual(['CH', 'JU'])
    expect(result.collision.afterParts).toEqual(['JO'])
    expect(result.collision.gap).toBeLessThan(0)
    expect(result.collision.safe).toBe(false)
  })
})
