import { describe, expect, it } from 'vitest'
import {
  analyzeLegacyLayoutProfileMigration,
  canonicalSerialize,
  type LayoutProfile,
} from '../src/services/legacyLayoutProfileMigration'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import type { LayoutType, PartOverride } from '../src/types'

const TARGET_LAYOUT: LayoutType = 'choseong-jungseong-vertical'
const EDITED_CH: PartOverride = { top: 0.15, bottom: 0.04, left: 0.08, right: 0.12 }
const OTHER_CH: PartOverride = { top: 0.25, bottom: 0.03, left: 0.07, right: 0.11 }

function legacyState(profile: LayoutProfile, wrapped = true): unknown {
  const state = { layoutProfile: profile, sampleGlyphEdits: [] }
  return wrapped ? { state, version: 0 } : state
}

function canonicalState(profile: LayoutProfile, wrapped = true): unknown {
  const layoutSchemas = Object.fromEntries(
    Object.entries(profile).map(([layoutType, userPartOverrides]) => [
      layoutType,
      { id: layoutType, slots: [], userPartOverrides },
    ]),
  )
  const state = { layoutSchemas }
  return wrapped ? { state, version: 0 } : state
}

function analyze(legacyRaw: unknown, canonicalRaw: unknown) {
  return analyzeLegacyLayoutProfileMigration({
    legacyRaw,
    canonicalRaw,
    presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
  })
}

function deeplyFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value)) deeplyFreeze(child)
}

describe('legacy layoutProfile migration analysis', () => {
  it('두 저장 키가 모두 없으면 정상 fresh state로 판정한다', () => {
    const missingNull = analyze(null, null)
    const missingUndefined = analyze(undefined, undefined)

    expect(missingNull.decisions[TARGET_LAYOUT].status).toBe('preset-seed')
    expect(missingNull.candidates).toEqual({})
    expect(missingNull.issues).toEqual([])
    expect(missingNull.canApply).toBe(true)
    expect(missingUndefined.decisions[TARGET_LAYOUT].status).toBe('preset-seed')
    expect(missingUndefined.candidates).toEqual({})
    expect(missingUndefined.issues).toEqual([])
    expect(missingUndefined.canApply).toBe(true)
  })

  it('legacy 저장 키만 없고 canonical override가 있으면 canonical-only로 유지한다', () => {
    const result = analyze(
      null,
      canonicalState({ [TARGET_LAYOUT]: { CH: EDITED_CH } }),
    )

    expect(result.decisions[TARGET_LAYOUT]).toMatchObject({
      status: 'canonical-only',
      migrationCandidate: false,
      canonical: { CH: EDITED_CH },
    })
    expect(result.candidates).toEqual({})
    expect(result.canApply).toBe(true)
  })

  it('canonical 저장 키만 없고 edited legacy가 있으면 user candidate로 만든다', () => {
    const result = analyze(
      legacyState({ [TARGET_LAYOUT]: { CH: EDITED_CH } }),
      undefined,
    )

    expect(result.decisions[TARGET_LAYOUT]).toMatchObject({
      status: 'user-candidate',
      migrationCandidate: true,
      legacy: { CH: EDITED_CH },
    })
    expect(result.candidates).toEqual({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
    expect(result.canApply).toBe(true)
  })

  it('fresh Calibration 기본 프리셋은 seed로 판정하고 이관하지 않는다', () => {
    const result = analyze(
      legacyState(structuredClone(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)),
      canonicalState({}),
    )

    expect(result.decisions[TARGET_LAYOUT].status).toBe('preset-seed')
    expect(result.decisions['choseong-only'].status).toBe('preset-seed')
    expect(result.candidates).toEqual({})
    expect(result.conflicts).toEqual([])
    expect(result.issues).toEqual([])
    expect(result.canApply).toBe(true)
  })

  it('preset과 다른 legacy 값만 canonical이 비었을 때 사용자 이관 후보로 만든다', () => {
    const legacyProfile = structuredClone(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)
    legacyProfile[TARGET_LAYOUT] = { CH: EDITED_CH }

    const result = analyze(legacyState(legacyProfile), canonicalState({}))

    expect(result.decisions[TARGET_LAYOUT]).toMatchObject({
      status: 'user-candidate',
      migrationCandidate: true,
      legacy: { CH: EDITED_CH },
    })
    expect(result.candidates).toEqual({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
    expect(result.canApply).toBe(true)
  })

  it('legacy가 없고 canonical만 있으면 canonical-only로 유지한다', () => {
    const result = analyze(
      legacyState({}),
      canonicalState({ [TARGET_LAYOUT]: { CH: EDITED_CH } }),
    )

    expect(result.decisions[TARGET_LAYOUT]).toMatchObject({
      status: 'canonical-only',
      migrationCandidate: false,
      canonical: { CH: EDITED_CH },
    })
    expect(result.candidates).toEqual({})
    expect(result.canApply).toBe(true)
  })

  it('legacy와 canonical이 같으면 equal no-op으로 판정한다', () => {
    const profile: LayoutProfile = { [TARGET_LAYOUT]: { CH: EDITED_CH } }
    const result = analyze(legacyState(profile), canonicalState(profile))

    expect(result.decisions[TARGET_LAYOUT].status).toBe('equal')
    expect(result.decisions[TARGET_LAYOUT].migrationCandidate).toBe(false)
    expect(result.candidates).toEqual({})
    expect(result.conflicts).toEqual([])
    expect(result.canApply).toBe(true)
  })

  it('서로 다른 legacy와 canonical은 섞지 않고 conflict로 차단한다', () => {
    const result = analyze(
      legacyState({ [TARGET_LAYOUT]: { CH: EDITED_CH } }),
      canonicalState({ [TARGET_LAYOUT]: { CH: OTHER_CH } }),
    )

    expect(result.decisions[TARGET_LAYOUT]).toMatchObject({
      status: 'conflict',
      migrationCandidate: false,
      legacy: { CH: EDITED_CH },
      canonical: { CH: OTHER_CH },
    })
    expect(result.candidates).toEqual({})
    expect(result.conflicts).toEqual([TARGET_LAYOUT])
    expect(result.canApply).toBe(false)
  })

  it('알 수 없는 타입·파트와 유한수가 아닌 보정값을 관찰 가능한 invalid로 만든다', () => {
    const legacyRaw = {
      state: {
        layoutProfile: {
          [TARGET_LAYOUT]: {
            CH: { ...EDITED_CH, top: Number.POSITIVE_INFINITY },
            BAD_PART: EDITED_CH,
          },
          'unknown-layout': { CH: EDITED_CH },
        },
      },
      version: 0,
    }
    const result = analyze(legacyRaw, canonicalState({}))

    expect(result.decisions[TARGET_LAYOUT].status).toBe('invalid')
    expect(result.invalidLayouts).toContain(TARGET_LAYOUT)
    expect(result.candidates).toEqual({})
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'invalid-part-override',
      'unknown-part',
      'unknown-layout',
    ]))
    expect(result.canApply).toBe(false)
  })

  it('손상 JSON과 잘못된 Zustand wrapper를 전체 invalid로 반환한다', () => {
    const malformed = analyze('{not-json', canonicalState({}))
    const serializedNull = analyze('null', canonicalState({}))
    const invalidWrapper = analyze({ state: null, version: 0 }, canonicalState({}))

    expect(malformed.issues.some((issue) => issue.code === 'invalid-json')).toBe(true)
    expect(malformed.invalidLayouts).toHaveLength(10)
    expect(malformed.canApply).toBe(false)
    expect(serializedNull.issues.some((issue) => issue.code === 'invalid-envelope')).toBe(true)
    expect(serializedNull.invalidLayouts).toHaveLength(10)
    expect(serializedNull.canApply).toBe(false)
    expect(invalidWrapper.issues.some((issue) => issue.code === 'invalid-envelope')).toBe(true)
    expect(invalidWrapper.invalidLayouts).toHaveLength(10)
    expect(invalidWrapper.canApply).toBe(false)
  })

  it('wrapper 유무와 객체 키 순서에 무관하며 같은 입력을 반복해도 동일하고 원본을 바꾸지 않는다', () => {
    const profile: LayoutProfile = { [TARGET_LAYOUT]: { CH: EDITED_CH } }
    const wrappedLegacy = legacyState(profile)
    const wrappedCanonical = canonicalState({})
    const bareLegacy = legacyState({ [TARGET_LAYOUT]: { CH: { right: 0.12, left: 0.08, bottom: 0.04, top: 0.15 } } }, false)
    const bareCanonical = canonicalState({}, false)
    const legacyBefore = structuredClone(wrappedLegacy)
    const canonicalBefore = structuredClone(wrappedCanonical)
    deeplyFreeze(wrappedLegacy)
    deeplyFreeze(wrappedCanonical)

    const first = analyze(wrappedLegacy, wrappedCanonical)
    const second = analyze(wrappedLegacy, wrappedCanonical)
    const bare = analyze(bareLegacy, bareCanonical)

    expect(second).toEqual(first)
    expect(bare.decisions).toEqual(first.decisions)
    expect(bare.candidates).toEqual(first.candidates)
    expect(bare.sourceFingerprint).toBe(first.sourceFingerprint)
    expect(wrappedLegacy).toEqual(legacyBefore)
    expect(wrappedCanonical).toEqual(canonicalBefore)
    expect(canonicalSerialize({ b: 2, a: 1 })).toBe(canonicalSerialize({ a: 1, b: 2 }))
  })
})
