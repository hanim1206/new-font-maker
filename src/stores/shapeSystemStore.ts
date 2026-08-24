import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type {
  ContextVariantCommandResult,
  DeepReadonly,
  JamoPartRole,
  LayoutSchema,
  LayoutType,
  RemoveCoreRailOverrideV1Command,
  RoleConstructionScope,
  SetCoreRailOverrideV1Command,
  ShapeSystemHistoryEntry,
  ShapeSystemSourceV2,
  ShapeSystemStoreResult,
  SetSevenContextBaseAreaCellV1Command,
  SetSevenContextBaseCoreRailV2Command,
  SetLayoutGridRailV1Command,
  ValidatedRoleConstructionSourceV1,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { createDebouncedStorage } from '../utils/debouncedStorage'
import {
  removeCoreRailOverrideV1,
  setCoreRailOverrideV1,
} from '../services/jamoContextVariantCommandsV1'
import { SHAPE_SYSTEM_ROLES } from '../services/shapeSystemSourceV1'
import {
  parseAndMigrateShapeSystemSource,
  parseShapeSystemSourceV2,
} from '../services/shapeSystemSourceV2'
import { parseRoleConstructionSourceV1 } from '../services/roleConstructionSourceV1'
import { createStarterShapeSystemV2 } from '../services/defaultShapeSystemV2'
import { setSevenContextBaseCoreRailV2 } from '../services/baseMasterRailCommandsV2'
import { setSevenContextBaseAreaCellV1 } from '../services/baseMasterAreaCommandsV1'
import { connectLayoutGridFromSchemasV1 } from '../services/layoutGridConnectionV1'
import { setLayoutGridRailV1 } from '../services/layoutGridRailCommandsV1'

export const SHAPE_SYSTEM_STORAGE_KEY = 'font-maker-shape-system-v1'
export const SHAPE_SYSTEM_HISTORY_LIMIT = 50

type HydrationStatus = 'ready' | 'blocked'

interface ShapeSystemState {
  source: ValidatedShapeSystemSourceV2 | null
  hydrationStatus: HydrationStatus
  hydrationIssues: string[]
  past: ShapeSystemHistoryEntry[]
  future: ShapeSystemHistoryEntry[]
}

interface ShapeSystemActions {
  connectLayoutGrid: (input: {
    transactionId: string
    schemas: DeepReadonly<Record<LayoutType, LayoutSchema>>
  }) => ShapeSystemStoreResult
  setLayoutGridRail: (command: DeepReadonly<SetLayoutGridRailV1Command>) => ShapeSystemStoreResult
  setSevenContextBaseCoreRail: (
    command: DeepReadonly<SetSevenContextBaseCoreRailV2Command>,
  ) => ShapeSystemStoreResult
  setSevenContextBaseAreaCell: (
    command: DeepReadonly<SetSevenContextBaseAreaCellV1Command>,
  ) => ShapeSystemStoreResult
  setContextCoreRailOverride: (
    role: JamoPartRole,
    command: DeepReadonly<SetCoreRailOverrideV1Command>,
  ) => ShapeSystemStoreResult
  removeContextCoreRailOverride: (
    role: JamoPartRole,
    command: DeepReadonly<RemoveCoreRailOverrideV1Command>,
  ) => ShapeSystemStoreResult
  undo: () => ShapeSystemStoreResult
  redo: () => ShapeSystemStoreResult
  canUndo: () => boolean
  canRedo: () => boolean
}

interface PersistedState {
  source?: unknown
  __parseError?: string
}

const rawStorage = createDebouncedStorage(300)

export function flushShapeSystemStorePersistence(): void {
  rawStorage.flush(SHAPE_SYSTEM_STORAGE_KEY)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const persistedStorage = {
  getItem: (name: string) => {
    const raw = rawStorage.getItem(name) as string | null
    if (raw === null) return null
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!isRecord(parsed)
        || Object.keys(parsed).some((key) => key !== 'state' && key !== 'version')
        || !isRecord(parsed.state)
        || Object.keys(parsed.state).length !== 1
        || !Object.prototype.hasOwnProperty.call(parsed.state, 'source')) {
        return { state: { __parseError: 'persist envelope 구조가 유효하지 않습니다.' }, version: 2 }
      }
      const envelope = parsed as { state: PersistedState; version?: unknown }
      if (envelope.version !== 1 && envelope.version !== 2) return {
        state: {
          __parseError: `지원하지 않는 Shape System store version입니다: ${String(envelope.version)}`,
        },
        version: 2,
      }
      if (envelope.version === 1
        && envelope.state.source !== null
        && envelope.state.source !== undefined) {
        const migrated = parseAndMigrateShapeSystemSource(envelope.state.source)
        if (!migrated.ok) return {
          state: {
            __parseError: migrated.issues.map(({ path, code }) => `${path}:${code}`).join(', '),
          },
          // Zustand의 version migration 재저장을 건너뛰어 손상된 원본 raw를 보존한다.
          version: 2,
        }
      }
      return envelope as { state: PersistedState; version: number }
    } catch {
      return { state: { __parseError: 'persist JSON을 해석할 수 없습니다.' }, version: 2 }
    }
  },
  setItem: (name: string, value: unknown) => {
    rawStorage.setItem(name, JSON.stringify(value))
  },
  removeItem: (name: string) => rawStorage.removeItem(name),
}

function success(): ShapeSystemStoreResult {
  return { ok: true }
}

function failure(
  code: Exclude<ShapeSystemStoreResult, { ok: true }>['error']['code'],
  message: string,
): ShapeSystemStoreResult {
  return { ok: false, error: { code, message } }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function replaceRoleSource(
  source: DeepReadonly<ValidatedShapeSystemSourceV2>,
  role: JamoPartRole,
  roleSource: DeepReadonly<RoleConstructionScope>,
): ReturnType<typeof parseShapeSystemSourceV2> {
  const next = structuredClone(source) as unknown as ShapeSystemSourceV2
  next.roleSources[role] = structuredClone(roleSource) as RoleConstructionScope
  return parseShapeSystemSourceV2(next)
}

export const useShapeSystemStore = create<ShapeSystemState & ShapeSystemActions>()(
  persist(
    immer((set, get) => {
      const commitRoleCommand = (
        role: JamoPartRole,
        execute: (
          source: ValidatedRoleConstructionSourceV1,
          knownPresetIds: ReadonlySet<string>,
        ) => ContextVariantCommandResult,
      ): ShapeSystemStoreResult => {
        const current = get()
        if (current.hydrationStatus === 'blocked') {
          return failure('hydration-blocked', '손상되거나 지원하지 않는 저장 데이터를 먼저 복구해야 합니다.')
        }
        if (!SHAPE_SYSTEM_ROLES.includes(role)) {
          return failure('invalid-role', `알 수 없는 Shape System 역할입니다: ${String(role)}`)
        }
        if (!current.source) return failure('not-initialized', 'Shape System이 아직 연결되지 않았습니다.')
        const knownPresetIds = new Set(
          current.source.contextPresetCatalog?.contextPresets.map(({ id }) => id) ?? [],
        )
        const roleSource = parseRoleConstructionSourceV1(
          current.source.roleSources[role],
          { knownPresetIds },
        )
        if (!roleSource.ok) return failure('invalid-source', '현재 역할 source가 strict 계약을 통과하지 못했습니다.')
        const result = execute(roleSource.source, knownPresetIds)
        if (!result.ok) return failure('command-failed', result.error.message)
        const parsed = replaceRoleSource(current.source, role, result.scope)
        if (!parsed.ok) {
          return failure('invalid-source', `Shape System command 결과가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
        }
        const entry: ShapeSystemHistoryEntry = {
          role,
          transaction: structuredClone(result.transaction),
        }
        set((state) => {
          state.source = parsed.source as unknown as typeof state.source
          state.past.push(entry)
          if (state.past.length > SHAPE_SYSTEM_HISTORY_LIMIT) {
            state.past.splice(0, state.past.length - SHAPE_SYSTEM_HISTORY_LIMIT)
          }
          state.future = []
        })
        return success()
      }

      return {
        source: null,
        hydrationStatus: 'ready',
        hydrationIssues: [],
        past: [],
        future: [],

        connectLayoutGrid: (input) => {
          const current = get()
          if (current.hydrationStatus === 'blocked') {
            return failure('hydration-blocked', '손상되거나 지원하지 않는 저장 데이터를 먼저 복구해야 합니다.')
          }
          if (!current.source) return failure('not-initialized', 'Shape System이 아직 연결되지 않았습니다.')
          const result = connectLayoutGridFromSchemasV1({ source: current.source, ...input })
          if (!result.ok) return failure('command-failed', result.error.message)
          const entry: ShapeSystemHistoryEntry = { transaction: structuredClone(result.transaction) }
          set((state) => {
            state.source = result.source as unknown as typeof state.source
            state.past.push(entry)
            if (state.past.length > SHAPE_SYSTEM_HISTORY_LIMIT) {
              state.past.splice(0, state.past.length - SHAPE_SYSTEM_HISTORY_LIMIT)
            }
            state.future = []
          })
          return success()
        },

        setLayoutGridRail: (command) => {
          const current = get()
          if (current.hydrationStatus === 'blocked') {
            return failure('hydration-blocked', '손상되거나 지원하지 않는 저장 데이터를 먼저 복구해야 합니다.')
          }
          if (!current.source) return failure('not-initialized', 'Shape System이 아직 연결되지 않았습니다.')
          const result = setLayoutGridRailV1(current.source, command)
          if (!result.ok) return failure('command-failed', result.error.message)
          const entry: ShapeSystemHistoryEntry = { transaction: structuredClone(result.transaction) }
          set((state) => {
            state.source = result.source as unknown as typeof state.source
            state.past.push(entry)
            if (state.past.length > SHAPE_SYSTEM_HISTORY_LIMIT) {
              state.past.splice(0, state.past.length - SHAPE_SYSTEM_HISTORY_LIMIT)
            }
            state.future = []
          })
          return success()
        },

        setContextCoreRailOverride: (role, command) => commitRoleCommand(
          role,
          (source, knownPresetIds) => setCoreRailOverrideV1(source, command, { knownPresetIds }),
        ),

        removeContextCoreRailOverride: (role, command) => commitRoleCommand(
          role,
          (source, knownPresetIds) => removeCoreRailOverrideV1(source, command, { knownPresetIds }),
        ),

        setSevenContextBaseCoreRail: (command) => {
          const current = get()
          if (current.hydrationStatus === 'blocked') {
            return failure('hydration-blocked', '손상되거나 지원하지 않는 저장 데이터를 먼저 복구해야 합니다.')
          }
          if (!current.source) return failure('not-initialized', 'Shape System이 아직 연결되지 않았습니다.')
          const result = setSevenContextBaseCoreRailV2(current.source, command)
          if (!result.ok) return failure('command-failed', result.error.message)
          const entry: ShapeSystemHistoryEntry = {
            transaction: structuredClone(result.transaction),
          }
          set((state) => {
            state.source = result.source as unknown as typeof state.source
            state.past.push(entry)
            if (state.past.length > SHAPE_SYSTEM_HISTORY_LIMIT) {
              state.past.splice(0, state.past.length - SHAPE_SYSTEM_HISTORY_LIMIT)
            }
            state.future = []
          })
          return success()
        },

        setSevenContextBaseAreaCell: (command) => {
          const current = get()
          if (current.hydrationStatus === 'blocked') {
            return failure('hydration-blocked', '손상되거나 지원하지 않는 저장 데이터를 먼저 복구해야 합니다.')
          }
          if (!current.source) return failure('not-initialized', 'Shape System이 아직 연결되지 않았습니다.')
          const result = setSevenContextBaseAreaCellV1(current.source, command)
          if (!result.ok) return failure('command-failed', result.error.message)
          const entry: ShapeSystemHistoryEntry = {
            transaction: structuredClone(result.transaction),
          }
          set((state) => {
            state.source = result.source as unknown as typeof state.source
            state.past.push(entry)
            if (state.past.length > SHAPE_SYSTEM_HISTORY_LIMIT) {
              state.past.splice(0, state.past.length - SHAPE_SYSTEM_HISTORY_LIMIT)
            }
            state.future = []
          })
          return success()
        },

        undo: () => {
          const current = get()
          if (current.hydrationStatus === 'blocked') return failure('hydration-blocked', '차단된 저장 상태에서는 Undo할 수 없습니다.')
          if (!current.source || current.past.length === 0) return failure('no-history', 'Undo할 변경이 없습니다.')
          const entry = current.past[current.past.length - 1]
          const currentTarget = 'role' in entry
            ? current.source.roleSources[entry.role]
            : current.source
          if (canonicalJson(currentTarget) !== canonicalJson(entry.transaction.after)) {
            return failure('stale-history', '현재 source가 Undo transaction의 after와 일치하지 않습니다.')
          }
          const parsed = 'role' in entry
            ? replaceRoleSource(current.source, entry.role, entry.transaction.before)
            : parseShapeSystemSourceV2(entry.transaction.before)
          if (!parsed.ok) return failure('invalid-source', 'Undo 결과가 Shape System 계약을 통과하지 못했습니다.')
          set((state) => {
            state.source = parsed.source as unknown as typeof state.source
            state.past.pop()
            state.future.push(structuredClone(entry))
          })
          return success()
        },

        redo: () => {
          const current = get()
          if (current.hydrationStatus === 'blocked') return failure('hydration-blocked', '차단된 저장 상태에서는 Redo할 수 없습니다.')
          if (!current.source || current.future.length === 0) return failure('no-history', 'Redo할 변경이 없습니다.')
          const entry = current.future[current.future.length - 1]
          const currentTarget = 'role' in entry
            ? current.source.roleSources[entry.role]
            : current.source
          if (canonicalJson(currentTarget) !== canonicalJson(entry.transaction.before)) {
            return failure('stale-history', '현재 source가 Redo transaction의 before와 일치하지 않습니다.')
          }
          const parsed = 'role' in entry
            ? replaceRoleSource(current.source, entry.role, entry.transaction.after)
            : parseShapeSystemSourceV2(entry.transaction.after)
          if (!parsed.ok) return failure('invalid-source', 'Redo 결과가 Shape System 계약을 통과하지 못했습니다.')
          set((state) => {
            state.source = parsed.source as unknown as typeof state.source
            state.future.pop()
            state.past.push(structuredClone(entry))
            if (state.past.length > SHAPE_SYSTEM_HISTORY_LIMIT) {
              state.past.splice(0, state.past.length - SHAPE_SYSTEM_HISTORY_LIMIT)
            }
          })
          return success()
        },

        canUndo: () => get().past.length > 0,
        canRedo: () => get().future.length > 0,
      }
    }),
    {
      name: SHAPE_SYSTEM_STORAGE_KEY,
      version: 2,
      storage: persistedStorage,
      partialize: (state) => ({ source: state.source }),
      migrate: (persisted, version) => {
        if (version !== 1 || !isRecord(persisted)
          || !Object.prototype.hasOwnProperty.call(persisted, 'source')) {
          return { __parseError: `지원하지 않는 Shape System store version입니다: ${version}` }
        }
        if (persisted.source === null || persisted.source === undefined) return { source: null }
        const migrated = parseAndMigrateShapeSystemSource(persisted.source)
        return migrated.ok
          ? { source: migrated.source }
          : { __parseError: migrated.issues.map(({ path, code }) => `${path}:${code}`).join(', ') }
      },
      merge: (persisted, current) => {
        const candidate = persisted as PersistedState | undefined
        if (!candidate) return current
        if (candidate.__parseError) return {
          ...current,
          source: null,
          hydrationStatus: 'blocked' as const,
          hydrationIssues: [candidate.__parseError],
          past: [],
          future: [],
        }
        const keys = Object.keys(candidate)
        if (keys.some((key) => key !== 'source')) return {
          ...current,
          source: null,
          hydrationStatus: 'blocked' as const,
          hydrationIssues: ['persist state에 지원하지 않는 필드가 있습니다.'],
          past: [],
          future: [],
        }
        if (candidate.source === null || candidate.source === undefined) return {
          ...current,
          source: null,
          hydrationStatus: 'ready' as const,
          hydrationIssues: [],
          past: [],
          future: [],
        }
        const parsed = parseShapeSystemSourceV2(candidate.source)
        return parsed.ok
          ? {
            ...current,
            source: parsed.source,
            hydrationStatus: 'ready' as const,
            hydrationIssues: [],
            past: [],
            future: [],
          }
          : {
            ...current,
            source: null,
            hydrationStatus: 'blocked' as const,
            hydrationIssues: parsed.issues.map(({ code, path }) => `${path}:${code}`),
            past: [],
            future: [],
          }
      },
    },
  ),
)

/**
 * FontData/project 전체 검증이 끝난 뒤에만 사용하는 명시적 ingress다.
 * 손상된 local hydration은 별도 복구 승인 없이 덮어쓰지 않는다.
 */
export function loadShapeSystemFromFontData(value: unknown | null): ShapeSystemStoreResult {
  const current = useShapeSystemStore.getState()
  if (current.hydrationStatus === 'blocked') {
    return failure('hydration-blocked', '차단된 저장 원본은 일반 프로젝트 불러오기로 덮어쓸 수 없습니다.')
  }
  if (value === null) {
    useShapeSystemStore.setState({
      source: null,
      hydrationStatus: 'ready',
      hydrationIssues: [],
      past: [],
      future: [],
    })
    return success()
  }
  const parsed = parseShapeSystemSourceV2(value)
  if (!parsed.ok) {
    return failure('invalid-source', `Shape System source가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }
  useShapeSystemStore.setState({
    source: parsed.source,
    hydrationStatus: 'ready',
    hydrationIssues: [],
    past: [],
    future: [],
  })
  return success()
}

/** 기존 프로젝트를 자동 변환하지 않고 사용자의 명시적 시작 동작에서만 호출한다. */
export function initializeStarterShapeSystem(): ShapeSystemStoreResult {
  const current = useShapeSystemStore.getState()
  if (current.hydrationStatus === 'blocked') {
    return failure('hydration-blocked', '차단된 저장 원본이 있어 추천 구조를 만들 수 없습니다.')
  }
  if (current.source) return success()
  try {
    useShapeSystemStore.setState({
      source: createStarterShapeSystemV2(),
      hydrationStatus: 'ready',
      hydrationIssues: [],
      past: [],
      future: [],
    })
    return success()
  } catch (error) {
    return failure('invalid-source', error instanceof Error ? error.message : '추천 구조를 만들 수 없습니다.')
  }
}
