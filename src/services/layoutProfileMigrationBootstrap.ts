import type { LayoutSchema, LayoutType } from '../types'
import {
  analyzeLegacyLayoutProfileMigration,
  canonicalSerialize,
  KNOWN_LAYOUT_TYPES,
  type LayoutProfile,
  type LegacyLayoutProfileMigrationPlan,
} from './legacyLayoutProfileMigration'

export const CANONICAL_LAYOUT_STORAGE_KEY = 'font-maker-layout-schemas'
export const LEGACY_CALIBRATION_STORAGE_KEY = 'font-maker-calibration-project'
export const LAYOUT_PROFILE_MIGRATION_BACKUP_KEY = 'font-maker-layout-profile-migration-v1-backup'
export const LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY = 'font-maker-layout-profile-migration-v1-journal'
export const LAYOUT_PROFILE_MIGRATION_VERSION = 1 as const

export interface LayoutProfileMigrationBackup {
  kind: 'layout-profile-migration-backup'
  version: typeof LAYOUT_PROFILE_MIGRATION_VERSION
  canonicalRaw: string | null
  legacyRaw: string | null
}

export interface LayoutProfileMigrationJournal {
  kind: 'layout-profile-migration-journal'
  version: typeof LAYOUT_PROFILE_MIGRATION_VERSION
  status: 'prepared' | 'complete'
  backupKey: typeof LAYOUT_PROFILE_MIGRATION_BACKUP_KEY
  sourceFingerprint: string
  projectLoadLocked: true
}

export interface LayoutProfileMigrationStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LayoutProfileMigrationBootstrapInput {
  storage: LayoutProfileMigrationStorage
  defaultSchemas: Record<LayoutType, LayoutSchema>
  presetProfile: LayoutProfile
}

export type LayoutProfileMigrationBlockedReason =
  | 'storage-read-failed'
  | 'backup-write-failed'
  | 'backup-invalid'
  | 'journal-invalid'
  | 'backup-stale'
  | 'conflict'
  | 'invalid'
  | 'prepared-write-failed'
  | 'canonical-write-failed'
  | 'legacy-write-failed'
  | 'complete-write-failed'
  | 'storage-diverged'

export type LayoutProfileMigrationBootstrapResult =
  | {
      status: 'complete'
      plan: LegacyLayoutProfileMigrationPlan
      resumed: boolean
    }
  | {
      status: 'noop'
      reason: 'already-complete'
    }
  | {
      status: 'blocked'
      reason: LayoutProfileMigrationBlockedReason
      message: string
      plan?: LegacyLayoutProfileMigrationPlan
    }

interface StorageSnapshot {
  journalRaw: string | null
  backupRaw: string | null
  canonicalRaw: string | null
  legacyRaw: string | null
}

interface WriteResult {
  ok: boolean
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStorageSnapshot(storage: LayoutProfileMigrationStorage): StorageSnapshot | Error {
  try {
    return {
      journalRaw: storage.getItem(LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY),
      backupRaw: storage.getItem(LAYOUT_PROFILE_MIGRATION_BACKUP_KEY),
      canonicalRaw: storage.getItem(CANONICAL_LAYOUT_STORAGE_KEY),
      legacyRaw: storage.getItem(LEGACY_CALIBRATION_STORAGE_KEY),
    }
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

function writeAndVerify(
  storage: LayoutProfileMigrationStorage,
  key: string,
  value: string,
): WriteResult {
  try {
    storage.setItem(key, value)
    if (storage.getItem(key) !== value) {
      return { ok: false, message: `${key} 쓰기 검증에 실패했습니다.` }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function parseBackup(raw: string): LayoutProfileMigrationBackup | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return undefined
    if (parsed.kind !== 'layout-profile-migration-backup') return undefined
    if (parsed.version !== LAYOUT_PROFILE_MIGRATION_VERSION) return undefined
    if (!(typeof parsed.canonicalRaw === 'string' || parsed.canonicalRaw === null)) return undefined
    if (!(typeof parsed.legacyRaw === 'string' || parsed.legacyRaw === null)) return undefined
    return parsed as unknown as LayoutProfileMigrationBackup
  } catch {
    return undefined
  }
}

function parseJournal(raw: string): LayoutProfileMigrationJournal | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return undefined
    if (parsed.kind !== 'layout-profile-migration-journal') return undefined
    if (parsed.version !== LAYOUT_PROFILE_MIGRATION_VERSION) return undefined
    if (parsed.status !== 'prepared' && parsed.status !== 'complete') return undefined
    if (parsed.backupKey !== LAYOUT_PROFILE_MIGRATION_BACKUP_KEY) return undefined
    if (typeof parsed.sourceFingerprint !== 'string') return undefined
    if (parsed.projectLoadLocked !== true) return undefined
    return parsed as unknown as LayoutProfileMigrationJournal
  } catch {
    return undefined
  }
}

function cloneSchemas(defaultSchemas: Record<LayoutType, LayoutSchema>): Record<LayoutType, LayoutSchema> {
  return structuredClone(defaultSchemas)
}

function cloneProfile(profile: LayoutProfile): LayoutProfile {
  return structuredClone(profile)
}

function profileFromLegacyDecisions(plan: LegacyLayoutProfileMigrationPlan): LayoutProfile {
  const profile: LayoutProfile = {}
  for (const layoutType of KNOWN_LAYOUT_TYPES) {
    const decision = plan.decisions[layoutType]
    if (decision.legacy !== undefined) profile[layoutType] = structuredClone(decision.legacy)
  }
  return profile
}

function applyProfile(
  schemas: Record<LayoutType, LayoutSchema>,
  profile: LayoutProfile,
): Record<LayoutType, LayoutSchema> {
  const next = cloneSchemas(schemas)
  for (const layoutType of KNOWN_LAYOUT_TYPES) {
    if (Object.hasOwn(profile, layoutType)) {
      next[layoutType].userPartOverrides = structuredClone(profile[layoutType] ?? {})
    } else {
      delete next[layoutType].userPartOverrides
    }
  }
  return next
}

function parseEnvelope(raw: string): { envelope: Record<string, unknown>; state: Record<string, unknown>; wrapped: boolean } {
  const envelope = JSON.parse(raw) as unknown
  if (!isRecord(envelope)) throw new Error('저장 envelope가 객체가 아닙니다.')
  if (Object.hasOwn(envelope, 'state')) {
    if (!isRecord(envelope.state)) throw new Error('저장 envelope의 state가 객체가 아닙니다.')
    return { envelope, state: envelope.state, wrapped: true }
  }
  return { envelope, state: envelope, wrapped: false }
}

function serializeEnvelope(
  parsed: { envelope: Record<string, unknown>; state: Record<string, unknown>; wrapped: boolean },
): string {
  if (parsed.wrapped) parsed.envelope.state = parsed.state
  return JSON.stringify(parsed.envelope)
}

function buildCanonicalTarget(
  backup: LayoutProfileMigrationBackup,
  plan: LegacyLayoutProfileMigrationPlan,
  defaultSchemas: Record<LayoutType, LayoutSchema>,
  presetProfile: LayoutProfile,
): string {
  if (backup.canonicalRaw === null) {
    const sourceProfile = backup.legacyRaw === null
      ? cloneProfile(presetProfile)
      : profileFromLegacyDecisions(plan)
    return JSON.stringify({
      state: { layoutSchemas: applyProfile(defaultSchemas, sourceProfile) },
      version: 0,
    })
  }

  if (Object.keys(plan.candidates).length === 0) return backup.canonicalRaw

  const parsed = parseEnvelope(backup.canonicalRaw)
  if (!isRecord(parsed.state.layoutSchemas)) throw new Error('canonical layoutSchemas가 없습니다.')
  for (const layoutType of KNOWN_LAYOUT_TYPES) {
    if (!Object.hasOwn(plan.candidates, layoutType)) continue
    const schema = parsed.state.layoutSchemas[layoutType]
    if (!isRecord(schema)) throw new Error(`${layoutType} canonical schema가 없습니다.`)
    schema.userPartOverrides = structuredClone(plan.candidates[layoutType] ?? {})
  }
  return serializeEnvelope(parsed)
}

function buildLegacyTarget(legacyRaw: string | null): string | null {
  if (legacyRaw === null) return null
  const parsed = parseEnvelope(legacyRaw)
  delete parsed.state.layoutProfile
  return serializeEnvelope(parsed)
}

function advanceStorageValue(
  storage: LayoutProfileMigrationStorage,
  key: string,
  original: string | null,
  target: string | null,
): WriteResult & { diverged?: boolean } {
  let current: string | null
  try {
    current = storage.getItem(key)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  if (current === target) return { ok: true }
  if (current !== original) {
    return { ok: false, diverged: true, message: `${key}가 migration 도중 외부에서 변경되었습니다.` }
  }
  if (target === null) return { ok: true }
  return writeAndVerify(storage, key, target)
}

function blocked(
  reason: LayoutProfileMigrationBlockedReason,
  message: string,
  plan?: LegacyLayoutProfileMigrationPlan,
): LayoutProfileMigrationBootstrapResult {
  return { status: 'blocked', reason, message, ...(plan && { plan }) }
}

export function runLayoutProfileMigrationBootstrap(
  input: LayoutProfileMigrationBootstrapInput,
): LayoutProfileMigrationBootstrapResult {
  const snapshot = readStorageSnapshot(input.storage)
  if (snapshot instanceof Error) {
    return blocked('storage-read-failed', `저장소를 읽지 못했습니다: ${snapshot.message}`)
  }

  const existingJournal = snapshot.journalRaw === null ? undefined : parseJournal(snapshot.journalRaw)
  if (snapshot.journalRaw !== null && !existingJournal) {
    return blocked('journal-invalid', 'migration journal이 손상되어 자동 이관을 중단했습니다.')
  }
  if (existingJournal?.status === 'complete') {
    return { status: 'noop', reason: 'already-complete' }
  }

  let backup: LayoutProfileMigrationBackup
  if (snapshot.backupRaw === null) {
    backup = {
      kind: 'layout-profile-migration-backup',
      version: LAYOUT_PROFILE_MIGRATION_VERSION,
      canonicalRaw: snapshot.canonicalRaw,
      legacyRaw: snapshot.legacyRaw,
    }
    const backupWrite = writeAndVerify(
      input.storage,
      LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
      JSON.stringify(backup),
    )
    if (!backupWrite.ok) {
      return blocked('backup-write-failed', `원본 backup을 저장하지 못했습니다: ${backupWrite.message ?? '알 수 없는 오류'}`)
    }
  } else {
    const parsedBackup = parseBackup(snapshot.backupRaw)
    if (!parsedBackup) {
      return blocked('backup-invalid', '기존 migration backup이 손상되어 덮어쓰지 않고 중단했습니다.')
    }
    backup = parsedBackup
  }

  if (!existingJournal
    && (snapshot.canonicalRaw !== backup.canonicalRaw || snapshot.legacyRaw !== backup.legacyRaw)) {
    return blocked('backup-stale', '기존 backup 이후 저장값이 변경되어 자동 이관을 중단했습니다.')
  }

  const plan = analyzeLegacyLayoutProfileMigration({
    legacyRaw: backup.legacyRaw,
    canonicalRaw: backup.canonicalRaw,
    presetProfile: input.presetProfile,
  })
  if (!plan.canApply) {
    return blocked(
      plan.conflicts.length > 0 ? 'conflict' : 'invalid',
      plan.conflicts.length > 0
        ? 'canonical과 legacy 레이아웃 값이 충돌하여 원본만 backup했습니다.'
        : '저장값이 손상되었거나 지원하지 않는 형식이라 원본만 backup했습니다.',
      plan,
    )
  }

  if (existingJournal && existingJournal.sourceFingerprint !== plan.sourceFingerprint) {
    return blocked('journal-invalid', 'prepared journal과 backup fingerprint가 일치하지 않습니다.', plan)
  }

  let canonicalTarget: string
  let legacyTarget: string | null
  try {
    canonicalTarget = buildCanonicalTarget(backup, plan, input.defaultSchemas, input.presetProfile)
    legacyTarget = buildLegacyTarget(backup.legacyRaw)
  } catch (error) {
    return blocked(
      'invalid',
      `migration target을 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      plan,
    )
  }

  const preparedJournal: LayoutProfileMigrationJournal = {
    kind: 'layout-profile-migration-journal',
    version: LAYOUT_PROFILE_MIGRATION_VERSION,
    status: 'prepared',
    backupKey: LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
    sourceFingerprint: plan.sourceFingerprint,
    projectLoadLocked: true,
  }
  if (!existingJournal) {
    const preparedWrite = writeAndVerify(
      input.storage,
      LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY,
      JSON.stringify(preparedJournal),
    )
    if (!preparedWrite.ok) {
      return blocked('prepared-write-failed', `prepared journal을 저장하지 못했습니다: ${preparedWrite.message ?? '알 수 없는 오류'}`, plan)
    }
  }

  const canonicalWrite = advanceStorageValue(
    input.storage,
    CANONICAL_LAYOUT_STORAGE_KEY,
    backup.canonicalRaw,
    canonicalTarget,
  )
  if (!canonicalWrite.ok) {
    return blocked(
      canonicalWrite.diverged ? 'storage-diverged' : 'canonical-write-failed',
      `canonical 저장을 완료하지 못했습니다: ${canonicalWrite.message ?? '알 수 없는 오류'}`,
      plan,
    )
  }

  const legacyWrite = advanceStorageValue(
    input.storage,
    LEGACY_CALIBRATION_STORAGE_KEY,
    backup.legacyRaw,
    legacyTarget,
  )
  if (!legacyWrite.ok) {
    return blocked(
      legacyWrite.diverged ? 'storage-diverged' : 'legacy-write-failed',
      `legacy 정리를 완료하지 못했습니다: ${legacyWrite.message ?? '알 수 없는 오류'}`,
      plan,
    )
  }

  const completeJournal: LayoutProfileMigrationJournal = {
    ...preparedJournal,
    status: 'complete',
  }
  const completeWrite = writeAndVerify(
    input.storage,
    LAYOUT_PROFILE_MIGRATION_JOURNAL_KEY,
    JSON.stringify(completeJournal),
  )
  if (!completeWrite.ok) {
    return blocked('complete-write-failed', `complete marker를 저장하지 못했습니다: ${completeWrite.message ?? '알 수 없는 오류'}`, plan)
  }

  return {
    status: 'complete',
    plan,
    resumed: existingJournal?.status === 'prepared',
  }
}

export function serializeLayoutProfileMigrationBackup(backup: LayoutProfileMigrationBackup): string {
  return canonicalSerialize(backup)
}
