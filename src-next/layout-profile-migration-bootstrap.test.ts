import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CANONICAL_LAYOUT_STORAGE_KEY,
  LEGACY_CALIBRATION_STORAGE_KEY,
  LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
  LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY,
  LAYOUT_PROFILE_MIGRATION_VERSION,
  runLayoutProfileMigrationBootstrap,
  type LayoutProfileMigrationBackup,
  type LayoutProfileMigrationJournal,
  type LayoutProfileMigrationStorage,
} from '../src/services/layoutProfileMigrationBootstrap'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import type { LayoutProfile } from '../src/services/legacyLayoutProfileMigration'
import type { LayoutSchema, LayoutType, PartOverride } from '../src/types'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'

const TARGET_LAYOUT: LayoutType = 'choseong-jungseong-vertical'
const EDITED_CH: PartOverride = { top: 0.15, bottom: 0.04, left: 0.08, right: 0.12 }
const OTHER_CH: PartOverride = { top: 0.25, bottom: 0.03, left: 0.07, right: 0.11 }

class MemoryStorage implements LayoutProfileMigrationStorage, Storage {
  private readonly values = new Map<string, string>()
  private writeCount = 0
  private failureConsumed = false
  private readonly failAtWrite: number | undefined
  private readonly silentFailure: boolean

  constructor(
    initial: Record<string, string> = {},
    failAtWrite?: number,
    silentFailure = false,
  ) {
    this.failAtWrite = failAtWrite
    this.silentFailure = silentFailure
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value)
  }

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.writeCount += 1
    if (!this.failureConsumed && this.writeCount === this.failAtWrite) {
      this.failureConsumed = true
      if (this.silentFailure) return
      throw new Error('QuotaExceededError')
    }
    this.values.set(key, value)
  }
}

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function legacyRaw(profile: LayoutProfile): string {
  return JSON.stringify({
    state: {
      layoutProfile: profile,
      fontSpace: { unitsPerEm: 1000, width: 1000, height: 1000 },
      grid: { majorDivisions: 8, minorInterval: 25, snapInterval: 5 },
      metrics: { hangulAdvance: 1000 },
      sampleGlyphEdits: [{ id: 'keep-me' }],
      unknownLegacyField: { preserved: true },
    },
    version: 4,
    unknownEnvelopeField: 'legacy-envelope',
  })
}

function canonicalRaw(profile: LayoutProfile, version = 7): string {
  const layoutSchemas = structuredClone(DEFAULT_LAYOUT_SCHEMAS)
  for (const [layoutType, userPartOverrides] of Object.entries(profile)) {
    layoutSchemas[layoutType as LayoutType].userPartOverrides = structuredClone(userPartOverrides)
  }
  return JSON.stringify({
    state: {
      layoutSchemas,
      globalPadding: { top: 0.075, bottom: 0.075, left: 0.075, right: 0.075 },
      paddingOverrides: {},
      unknownCanonicalState: { preserved: true },
    },
    version,
    unknownEnvelopeField: 'canonical-envelope',
  })
}

function run(storage: LayoutProfileMigrationStorage) {
  return runLayoutProfileMigrationBootstrap({
    storage,
    defaultSchemas: DEFAULT_LAYOUT_SCHEMAS,
    presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
  })
}

function parseStored(storage: MemoryStorage, key: string): Record<string, unknown> {
  const raw = storage.getItem(key)
  if (raw === null) throw new Error(`${key}가 없습니다.`)
  return JSON.parse(raw) as Record<string, unknown>
}

function storedState(storage: MemoryStorage, key: string): Record<string, unknown> {
  const envelope = parseStored(storage, key)
  return envelope.state as Record<string, unknown>
}

function storedSchemas(storage: MemoryStorage): Record<LayoutType, LayoutSchema> {
  return storedState(storage, CANONICAL_LAYOUT_STORAGE_KEY).layoutSchemas as Record<LayoutType, LayoutSchema>
}

describe('layout profile startup migration bootstrap', () => {
  it('App과 store를 static import하지 않고 blocked return 뒤에서만 App을 dynamic import한다', () => {
    const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
    const bootstrapSource = readFileSync(
      new URL('../src/services/layoutProfileMigrationBootstrap.ts', import.meta.url),
      'utf8',
    )

    const bootstrapCallIndex = mainSource.indexOf('const migration = runLayoutProfileMigrationBootstrap')
    const blockedBranchIndex = mainSource.indexOf("if (migration.status === 'blocked')")
    const blockedReturnIndex = mainSource.indexOf('\n    return', blockedBranchIndex)
    const dynamicImportIndex = mainSource.indexOf("await import('./App')")

    expect(mainSource).not.toMatch(/^import\s+App\s+from/m)
    expect(bootstrapCallIndex).toBeGreaterThan(-1)
    expect(blockedBranchIndex).toBeGreaterThan(bootstrapCallIndex)
    expect(blockedReturnIndex).toBeGreaterThan(blockedBranchIndex)
    expect(dynamicImportIndex).toBeGreaterThan(blockedReturnIndex)
    expect(mainSource.slice(blockedBranchIndex, dynamicImportIndex)).toContain('role="alert"')
    expect(mainSource.slice(blockedBranchIndex, dynamicImportIndex)).toContain('자동으로 해결하거나')
    expect(mainSource.slice(blockedBranchIndex, dynamicImportIndex)).toContain('LAYOUT_PROFILE_MIGRATION_BACKUP_KEY')
    expect(bootstrapSource).not.toMatch(/stores\//)
  })

  it('두 저장소가 모두 없으면 legacy Calibration v1 전체를 default schemas에 seed한다', () => {
    const storage = new MemoryStorage()
    const result = run(storage)

    expect(result.status).toBe('complete')
    const schemas = storedSchemas(storage)
    for (const [layoutType, overrides] of Object.entries(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)) {
      expect(schemas[layoutType as LayoutType].userPartOverrides).toEqual(overrides)
    }
    expect(storage.getItem(LEGACY_CALIBRATION_STORAGE_KEY)).toBeNull()

    const backup = parseStored(storage, LAYOUT_PROFILE_MIGRATION_BACKUP_KEY) as unknown as LayoutProfileMigrationBackup
    const journal = parseStored(storage, LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY) as unknown as LayoutProfileMigrationJournal
    expect(backup).toEqual({
      kind: 'layout-profile-migration-backup',
      version: LAYOUT_PROFILE_MIGRATION_VERSION,
      canonicalRaw: null,
      legacyRaw: null,
    })
    expect(journal).toMatchObject({
      kind: 'layout-profile-migration-journal',
      version: LAYOUT_PROFILE_MIGRATION_VERSION,
      status: 'complete',
      backupKey: LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
      projectLoadLocked: true,
    })
  })

  it('fresh bootstrap envelope를 실제 layoutStore와 OTF 수집기가 canonical preset으로 hydrate한다', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    expect(run(storage).status).toBe('complete')
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()

    const { useLayoutStore } = await import('../src/stores/layoutStore')
    expect(useLayoutStore.persist.hasHydrated()).toBe(true)
    const seededOverrides = structuredClone(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1[TARGET_LAYOUT])
    expect(useLayoutStore.getState().layoutSchemas[TARGET_LAYOUT].userPartOverrides)
      .toEqual(seededOverrides)

    const { collectGlyphDataForChar } = await import('../src/services/fontExportUtils')
    const seededGlyph = collectGlyphDataForChar('가')
    const seededChoseongBox = seededGlyph?.strokes.find(({ stroke }) => stroke.id.startsWith('ㄱ'))?.box
    expect(seededChoseongBox).toBeDefined()

    useLayoutStore.getState().setUserPartOverrides(TARGET_LAYOUT, undefined)
    const baseGlyph = collectGlyphDataForChar('가')
    const baseChoseongBox = baseGlyph?.strokes.find(({ stroke }) => stroke.id.startsWith('ㄱ'))?.box
    expect(baseChoseongBox).toBeDefined()
    expect(seededChoseongBox).not.toEqual(baseChoseongBox)

    useLayoutStore.getState().setUserPartOverrides(TARGET_LAYOUT, seededOverrides)
    const restoredGlyph = collectGlyphDataForChar('가')
    const restoredChoseongBox = restoredGlyph?.strokes.find(({ stroke }) => stroke.id.startsWith('ㄱ'))?.box
    expect(restoredChoseongBox).toEqual(seededChoseongBox)
  })

  it('canonical이 없으면 persisted preset profile 전체를 canonical default schemas에 적용한다', () => {
    const rawLegacy = legacyRaw(structuredClone(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1))
    const storage = new MemoryStorage({ [LEGACY_CALIBRATION_STORAGE_KEY]: rawLegacy })

    expect(run(storage).status).toBe('complete')
    const schemas = storedSchemas(storage)
    for (const [layoutType, overrides] of Object.entries(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)) {
      expect(schemas[layoutType as LayoutType].userPartOverrides).toEqual(overrides)
    }
    expect(storedState(storage, LEGACY_CALIBRATION_STORAGE_KEY)).not.toHaveProperty('layoutProfile')
  })

  it('canonical이 존재하고 비어 있으면 exact preset legacy를 seed로 보고 canonical raw를 byte-exact 유지한다', () => {
    const rawCanonical = canonicalRaw({})
    const rawLegacy = legacyRaw(structuredClone(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1))
    const storage = new MemoryStorage({
      [CANONICAL_LAYOUT_STORAGE_KEY]: rawCanonical,
      [LEGACY_CALIBRATION_STORAGE_KEY]: rawLegacy,
    })

    const result = run(storage)

    expect(result.status).toBe('complete')
    expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBe(rawCanonical)
    expect(storedState(storage, LEGACY_CALIBRATION_STORAGE_KEY)).not.toHaveProperty('layoutProfile')
    const backup = parseStored(storage, LAYOUT_PROFILE_MIGRATION_BACKUP_KEY) as unknown as LayoutProfileMigrationBackup
    expect(backup.canonicalRaw).toBe(rawCanonical)
    expect(backup.legacyRaw).toBe(rawLegacy)
  })

  it('canonical이 있으면 빈 userPartOverrides에 user candidate만 적용하고 모든 unknown/schema 필드를 보존한다', () => {
    const rawCanonical = canonicalRaw({})
    const rawLegacy = legacyRaw({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
    const storage = new MemoryStorage({
      [CANONICAL_LAYOUT_STORAGE_KEY]: rawCanonical,
      [LEGACY_CALIBRATION_STORAGE_KEY]: rawLegacy,
    })

    const result = run(storage)

    expect(result.status).toBe('complete')
    expect(storedSchemas(storage)[TARGET_LAYOUT].userPartOverrides).toEqual({ CH: EDITED_CH })
    const canonicalEnvelope = parseStored(storage, CANONICAL_LAYOUT_STORAGE_KEY)
    const canonicalState = canonicalEnvelope.state as Record<string, unknown>
    const originalSchema = (JSON.parse(rawCanonical) as { state: { layoutSchemas: Record<LayoutType, LayoutSchema> } }).state.layoutSchemas[TARGET_LAYOUT]
    const migratedSchema = (canonicalState.layoutSchemas as Record<LayoutType, LayoutSchema>)[TARGET_LAYOUT]
    expect(canonicalEnvelope.version).toBe(7)
    expect(canonicalEnvelope.unknownEnvelopeField).toBe('canonical-envelope')
    expect(canonicalState.unknownCanonicalState).toEqual({ preserved: true })
    expect(migratedSchema.slots).toEqual(originalSchema.slots)
    expect(migratedSchema.splits).toEqual(originalSchema.splits)
    expect(migratedSchema.partOverrides).toEqual(originalSchema.partOverrides)

    const migratedLegacyEnvelope = parseStored(storage, LEGACY_CALIBRATION_STORAGE_KEY)
    const migratedLegacyState = migratedLegacyEnvelope.state as Record<string, unknown>
    expect(migratedLegacyEnvelope.version).toBe(4)
    expect(migratedLegacyEnvelope.unknownEnvelopeField).toBe('legacy-envelope')
    expect(migratedLegacyState).not.toHaveProperty('layoutProfile')
    expect(migratedLegacyState.fontSpace).toEqual({ unitsPerEm: 1000, width: 1000, height: 1000 })
    expect(migratedLegacyState.grid).toEqual({ majorDivisions: 8, minorInterval: 25, snapInterval: 5 })
    expect(migratedLegacyState.metrics).toEqual({ hangulAdvance: 1000 })
    expect(migratedLegacyState.sampleGlyphEdits).toEqual([{ id: 'keep-me' }])
    expect(migratedLegacyState.unknownLegacyField).toEqual({ preserved: true })
  })

  it('canonical-only와 equal은 canonical을 바꾸지 않고 legacy profile만 제거한다', () => {
    const cases: Array<{ legacy: LayoutProfile; canonical: LayoutProfile }> = [
      { legacy: {}, canonical: { [TARGET_LAYOUT]: { CH: EDITED_CH } } },
      {
        legacy: { [TARGET_LAYOUT]: { CH: EDITED_CH } },
        canonical: { [TARGET_LAYOUT]: { CH: EDITED_CH } },
      },
    ]

    for (const item of cases) {
      const rawCanonical = canonicalRaw(item.canonical)
      const storage = new MemoryStorage({
        [CANONICAL_LAYOUT_STORAGE_KEY]: rawCanonical,
        [LEGACY_CALIBRATION_STORAGE_KEY]: legacyRaw(item.legacy),
      })

      expect(run(storage).status).toBe('complete')
      expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBe(rawCanonical)
      expect(storedState(storage, LEGACY_CALIBRATION_STORAGE_KEY)).not.toHaveProperty('layoutProfile')
    }
  })

  it('divergent conflict는 backup만 남기고 canonical과 legacy 원본을 쓰지 않는다', () => {
    const rawCanonical = canonicalRaw({ [TARGET_LAYOUT]: { CH: OTHER_CH } })
    const rawLegacy = legacyRaw({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
    const storage = new MemoryStorage({
      [CANONICAL_LAYOUT_STORAGE_KEY]: rawCanonical,
      [LEGACY_CALIBRATION_STORAGE_KEY]: rawLegacy,
    })

    const result = run(storage)

    expect(result).toMatchObject({ status: 'blocked', reason: 'conflict' })
    expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBe(rawCanonical)
    expect(storage.getItem(LEGACY_CALIBRATION_STORAGE_KEY)).toBe(rawLegacy)
    expect(storage.getItem(LAYOUT_PROFILE_MIGRATION_BACKUP_KEY)).not.toBeNull()
    expect(storage.getItem(LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY)).toBeNull()
  })

  it('손상 raw는 exact backup만 남기고 canonical을 만들지 않는다', () => {
    const malformedLegacy = '{not-json'
    const storage = new MemoryStorage({ [LEGACY_CALIBRATION_STORAGE_KEY]: malformedLegacy })

    const result = run(storage)

    expect(result).toMatchObject({ status: 'blocked', reason: 'invalid' })
    expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_CALIBRATION_STORAGE_KEY)).toBe(malformedLegacy)
    const backup = parseStored(storage, LAYOUT_PROFILE_MIGRATION_BACKUP_KEY) as unknown as LayoutProfileMigrationBackup
    expect(backup.legacyRaw).toBe(malformedLegacy)
    expect(backup.canonicalRaw).toBeNull()
    expect(storage.getItem(LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY)).toBeNull()
  })

  it('기존 backup 이후 두 live raw가 바뀌면 backup-stale로 차단하고 세 raw를 모두 그대로 둔다', () => {
    const originalCanonical = canonicalRaw({ [TARGET_LAYOUT]: { CH: OTHER_CH } })
    const originalLegacy = legacyRaw({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
    const storage = new MemoryStorage({
      [CANONICAL_LAYOUT_STORAGE_KEY]: originalCanonical,
      [LEGACY_CALIBRATION_STORAGE_KEY]: originalLegacy,
    })
    expect(run(storage)).toMatchObject({ status: 'blocked', reason: 'conflict' })

    const backupBefore = storage.getItem(LAYOUT_PROFILE_MIGRATION_BACKUP_KEY)
    const changedCanonical = canonicalRaw({ [TARGET_LAYOUT]: { CH: EDITED_CH } }, 19)
    const changedLegacy = legacyRaw({ [TARGET_LAYOUT]: { CH: OTHER_CH } })
    storage.setItem(CANONICAL_LAYOUT_STORAGE_KEY, changedCanonical)
    storage.setItem(LEGACY_CALIBRATION_STORAGE_KEY, changedLegacy)

    const result = run(storage)

    expect(result).toMatchObject({ status: 'blocked', reason: 'backup-stale' })
    expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBe(changedCanonical)
    expect(storage.getItem(LEGACY_CALIBRATION_STORAGE_KEY)).toBe(changedLegacy)
    expect(storage.getItem(LAYOUT_PROFILE_MIGRATION_BACKUP_KEY)).toBe(backupBefore)
    expect(storage.getItem(LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY)).toBeNull()
  })

  it('각 write 단계 crash 후 backup에서 재시작해 멱등하게 완료한다', () => {
    for (const failAtWrite of [1, 2, 3, 4, 5]) {
      const rawCanonical = canonicalRaw({})
      const rawLegacy = legacyRaw({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
      const storage = new MemoryStorage({
        [CANONICAL_LAYOUT_STORAGE_KEY]: rawCanonical,
        [LEGACY_CALIBRATION_STORAGE_KEY]: rawLegacy,
      }, failAtWrite)

      const crashed = run(storage)
      expect(crashed.status, `write ${failAtWrite}`).toBe('blocked')

      const resumed = run(storage)
      expect(resumed, `write ${failAtWrite}`).toMatchObject({ status: 'complete' })
      expect(storedSchemas(storage)[TARGET_LAYOUT].userPartOverrides).toEqual({ CH: EDITED_CH })
      expect(storedState(storage, LEGACY_CALIBRATION_STORAGE_KEY)).not.toHaveProperty('layoutProfile')
      expect(parseStored(storage, LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY)).toMatchObject({ status: 'complete' })

      const secondRun = run(storage)
      expect(secondRun).toEqual({ status: 'noop', reason: 'already-complete' })
      const backup = parseStored(storage, LAYOUT_PROFILE_MIGRATION_BACKUP_KEY) as unknown as LayoutProfileMigrationBackup
      expect(backup.canonicalRaw).toBe(rawCanonical)
      expect(backup.legacyRaw).toBe(rawLegacy)
    }
  })

  it('backup quota/silent failure면 prepared나 canonical write를 시작하지 않는다', () => {
    const rawLegacy = legacyRaw({ [TARGET_LAYOUT]: { CH: EDITED_CH } })
    for (const silentFailure of [false, true]) {
      const storage = new MemoryStorage({ [LEGACY_CALIBRATION_STORAGE_KEY]: rawLegacy }, 1, silentFailure)
      const result = run(storage)

      expect(result).toMatchObject({ status: 'blocked', reason: 'backup-write-failed' })
      expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBeNull()
      expect(storage.getItem(LEGACY_CALIBRATION_STORAGE_KEY)).toBe(rawLegacy)
      expect(storage.getItem(LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY)).toBeNull()
    }
  })

  it('complete marker 이후 project/FontData 값이 바뀌어도 migration을 재적용하지 않는다', () => {
    const storage = new MemoryStorage()
    expect(run(storage).status).toBe('complete')
    const projectCanonical = canonicalRaw({ [TARGET_LAYOUT]: { CH: OTHER_CH } }, 12)
    storage.setItem(CANONICAL_LAYOUT_STORAGE_KEY, projectCanonical)

    expect(run(storage)).toEqual({ status: 'noop', reason: 'already-complete' })
    expect(storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY)).toBe(projectCanonical)
  })
})
