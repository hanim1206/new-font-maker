import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import baseJamos from '../src/data/baseJamos.json'
import basePresets from '../src/data/basePresets.json'
import type { JamoData, LayoutSchema, LayoutType, Padding } from '../src/types'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import baseline from './fixtures/legacy-layout-boxes-v1.json'

const CASES = [
  ['ㄱ', 'choseong-only'],
  ['ㅏ', 'jungseong-vertical-only'],
  ['ㅗ', 'jungseong-horizontal-only'],
  ['ㅘ', 'jungseong-mixed-only'],
  ['가', 'choseong-jungseong-vertical'],
  ['고', 'choseong-jungseong-horizontal'],
  ['과', 'choseong-jungseong-mixed'],
  ['각', 'choseong-jungseong-vertical-jongseong'],
  ['곡', 'choseong-jungseong-horizontal-jongseong'],
  ['곽', 'choseong-jungseong-mixed-jongseong'],
] as const satisfies ReadonlyArray<readonly [string, LayoutType]>

const jamos = baseJamos as unknown as {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}

const schemas = basePresets.schemas as unknown as Record<LayoutType, LayoutSchema>
const storageValues = new Map<string, string>()

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
  })
})

afterAll(() => vi.unstubAllGlobals())

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  )
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function collectBoxes(useCalibrationPreset: boolean, runtimePadding: Padding) {
  return Object.fromEntries(CASES.map(([char, expectedLayoutType]) => {
    const syllable = decomposeSyllable(char, jamos.choseong, jamos.jungseong, jamos.jongseong)
    expect(syllable.layoutType).toBe(expectedLayoutType)
    const storedSchema = schemas[syllable.layoutType]
    const schema = {
      ...storedSchema,
      userPartOverrides: useCalibrationPreset
        ? LEGACY_CALIBRATION_LAYOUT_PROFILE_V1[syllable.layoutType] ?? storedSchema.userPartOverrides
        : storedSchema.userPartOverrides,
      padding: runtimePadding,
      designBodyPadding: runtimePadding,
    }
    const boxes = calculateBoxes(schema, {
      cho: syllable.choseong?.char ?? '',
      jung: syllable.jungseong?.char ?? '',
      jong: syllable.jongseong?.char ?? '',
    })
    return [char, { layoutType: syllable.layoutType, boxes }]
  }))
}

function collectBaseline(runtimePadding: Padding) {
  return {
    version: 1,
    mapping: Object.fromEntries(CASES),
    runtimePadding,
    baseLayoutStore: collectBoxes(false, runtimePadding),
    calibrationUserPreset01: collectBoxes(true, runtimePadding),
  }
}

describe('Step 1 레이아웃 좌표 기준값', () => {
  it('layoutStore와 Calibration USER_PRESET_01의 fresh-state 좌표를 exact canonical JSON으로 보존한다', async () => {
    const { DEFAULT_GLOBAL_PADDING } = await import('../src/stores/layoutStore')
    const actual = collectBaseline(DEFAULT_GLOBAL_PADDING)
    expect(canonicalJson(actual)).toBe(canonicalJson(baseline))
  })
})
