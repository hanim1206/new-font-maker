import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  CoreXRailRole,
  CoreYRailRole,
  JamoPartRole,
  RoleConstructionScope,
  SetSevenContextBaseCoreRailV2Command,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { createEmptyJamoRoleMaster, createRoleConstructionSourceV1 } from '../services/jamoConstruction'
import { createBasePartGrid } from '../services/railGridResolver'
import {
  createShapeSystemSourceV1,
  SHAPE_SYSTEM_ROLES,
} from '../services/shapeSystemSourceV1'
import {
  createShapeSystemSourceV2,
  parseShapeSystemSourceV2,
} from '../services/shapeSystemSourceV2'
import { createConnectedShapeSystemV2Fixture } from '../../tests/fixtures/shapeSystemV2'
import { BASE_PRESETS_SCHEMAS } from '../utils/layoutCalculator'

const STORAGE_KEY = 'font-maker-shape-system-v1'
const values = new Map<string, string>()
const writes: Array<{ key: string; value: string }> = []
const storage = {
  get length() { return values.size },
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null,
  removeItem: (key: string) => { values.delete(key) },
  setItem: (key: string, value: string) => {
    values.set(key, value)
    writes.push({ key, value })
  },
}

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}

function sourceFor(role: JamoPartRole): RoleConstructionScope {
  const grid = createBasePartGrid({ role, xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const masters = [createEmptyJamoRoleMaster({ jamoId: `fixture:${role}`, role, gridId: grid.id })]
  return createRoleConstructionSourceV1({ grid, masters })
}

function roleSourceRecord(): Record<JamoPartRole, RoleConstructionScope> {
  return Object.fromEntries(
    SHAPE_SYSTEM_ROLES.map((role) => [role, sourceFor(role)]),
  ) as Record<JamoPartRole, RoleConstructionScope>
}

function envelope(): ShapeSystemSourceV2 {
  return createShapeSystemSourceV2({ roleSources: roleSourceRecord() })
}

function persisted(source: unknown, version = 2): string {
  return JSON.stringify({ state: { source }, version })
}

function sevenContextCommand(
  source: NonNullable<ReturnType<typeof createConnectedShapeSystemV2Fixture>>,
  value = 0.25,
): SetSevenContextBaseCoreRailV2Command {
  const target = (role: 'STANDALONE' | 'CH') => ({
    masterId: source.roleSources[role].masters[0].id,
    railId: source.roleSources[role].grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.id,
  })
  return {
    transactionId: `tx:store:base:${value}`,
    jamoId: 'ㄱ',
    coreRole: 'inner-left',
    position: { kind: 'absolute', value },
    targets: { STANDALONE: target('STANDALONE'), CH: target('CH') },
  }
}

async function importStore(raw?: string) {
  values.clear()
  writes.length = 0
  vi.clearAllTimers()
  if (raw !== undefined) values.set(STORAGE_KEY, raw)
  vi.resetModules()
  return import('./shapeSystemStore')
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  vi.clearAllTimers()
  values.clear()
  writes.length = 0
})

afterAll(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shapeSystemStore canonical persistence and session history', () => {
  it('저장 key가 없으면 임의 core 위치를 seed하지 않고 uninitialized ready로 시작한다', async () => {
    const useStore = (await importStore()).useShapeSystemStore
    expect(useStore.getState().source).toBeNull()
    expect(useStore.getState().hydrationStatus).toBe('ready')
    expect(values.has(STORAGE_KEY)).toBe(false)
    expect(writes).toHaveLength(0)
  })

  it('명시적 추천 구조 시작만 source를 만들고 reload에서 exact 복원한다', async () => {
    const storeModule = await importStore()
    expect(storeModule.useShapeSystemStore.getState().source).toBeNull()
    expect(storeModule.initializeStarterShapeSystem()).toEqual({ ok: true })
    const source = structuredClone(storeModule.useShapeSystemStore.getState().source)
    expect(source?.roleSources.CH.masters[0].jamoId).toBe('ㄱ')
    expect(storeModule.useShapeSystemStore.getState().past).toEqual([])
    vi.advanceTimersByTime(300)
    const reloaded = await importStore(values.get(STORAGE_KEY))
    expect(reloaded.useShapeSystemStore.getState().source).toEqual(source)
  })

  it('명시적 공통 layout grid 연결은 한 source transaction으로 저장하고 Undo/Redo한다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    expect(storeModule.initializeStarterShapeSystem()).toEqual({ ok: true })
    const before = structuredClone(useStore.getState().source)!
    expect(useStore.getState().connectLayoutGrid({
      transactionId: 'tx:store:connect-layout', schemas: BASE_PRESETS_SCHEMAS,
    })).toEqual({ ok: true })
    const after = structuredClone(useStore.getState().source)!
    expect(after.layoutGridSystem).not.toBeNull()
    expect(useStore.getState().past).toHaveLength(1)
    expect(useStore.getState().undo()).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(before)
    expect(useStore.getState().redo()).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(after)
  })

  it('strict source만 로드하고 source 외 history·파생값을 persist하지 않는다', async () => {
    const storeModule = await importStore()
    const source = envelope()
    expect(storeModule.loadShapeSystemFromFontData(source)).toEqual({ ok: true })
    vi.advanceTimersByTime(300)
    const raw = values.get(STORAGE_KEY)
    if (!raw) throw new Error('shape source가 저장되지 않았습니다.')
    const state = (JSON.parse(raw) as { state: Record<string, unknown> }).state
    expect(Object.keys(state)).toEqual(['source'])
    expect(state.source).toEqual(source)
    for (const forbiddenKey of ['past', 'future', 'provenance', 'resolvedPartGrid', 'InkRegion', 'outer', 'holes']) {
      expect(raw).not.toContain(`"${forbiddenKey}":`)
    }
  })

  it('store v1의 Shape v1 source를 v2 null/null로 한 번만 이관한다', async () => {
    const legacy = createShapeSystemSourceV1(roleSourceRecord())
    const storeModule = await importStore(persisted(legacy, 1))
    const source = storeModule.useShapeSystemStore.getState().source
    expect(source?.version).toBe(2)
    expect(source?.layoutGridSystem).toBeNull()
    expect(source?.contextPresetCatalog).toBeNull()
    expect(source?.roleSources).toEqual(legacy.roleSources)
    expect(storeModule.useShapeSystemStore.getState().hydrationStatus).toBe('ready')
  })

  it('core override set/remove와 Undo/Redo가 각각 한 session transaction 경계를 지킨다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    const source = envelope()
    storeModule.loadShapeSystemFromFontData(source)
    vi.advanceTimersByTime(300)
    const masterId = source.roleSources.CH.masters[0].id
    const setResult = useStore.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:store:core:set', masterId,
      context: { baseContext: 'horizontal' }, coreRole: 'inner-left',
      position: { kind: 'absolute', value: 0.25 },
    })
    expect(setResult).toEqual({ ok: true })
    expect(useStore.getState().past).toHaveLength(1)
    expect(useStore.getState().future).toHaveLength(0)
    expect(useStore.getState().source?.roleSources.CH.masters[0].contextVariants?.[0]
      .coreRailOverrides?.['inner-left']).toEqual({ kind: 'absolute', value: 0.25 })

    expect(useStore.getState().undo()).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(source)
    expect(useStore.getState().past).toHaveLength(0)
    expect(useStore.getState().future).toHaveLength(1)
    expect(useStore.getState().redo()).toEqual({ ok: true })
    expect(useStore.getState().past).toHaveLength(1)

    const removeResult = useStore.getState().removeContextCoreRailOverride('CH', {
      transactionId: 'tx:store:core:remove', masterId,
      context: { baseContext: 'horizontal' }, coreRole: 'inner-left',
    })
    expect(removeResult).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(source)
    expect(useStore.getState().past).toHaveLength(2)
    expect(useStore.getState().future).toHaveLength(0)
  })

  it('7문맥 base Rail aggregate는 history 한 건, future clear, Undo/Redo exact, source-only reload를 지킨다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    expect(storeModule.initializeStarterShapeSystem()).toEqual({ ok: true })
    const before = structuredClone(useStore.getState().source)!
    expect(useStore.getState().setSevenContextBaseCoreRail(sevenContextCommand(before))).toEqual({ ok: true })
    const after = structuredClone(useStore.getState().source)
    expect(useStore.getState().past).toHaveLength(1)
    expect(useStore.getState().future).toHaveLength(0)
    expect(useStore.getState().past[0].transaction.before).toEqual(before)
    expect(useStore.getState().past[0].transaction.after).toEqual(after)

    expect(useStore.getState().undo()).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(before)
    expect(useStore.getState().past).toHaveLength(0)
    expect(useStore.getState().future).toHaveLength(1)
    expect(useStore.getState().redo()).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(after)

    expect(useStore.getState().undo()).toEqual({ ok: true })
    expect(useStore.getState().setSevenContextBaseCoreRail(sevenContextCommand(before, 0.26))).toEqual({ ok: true })
    expect(useStore.getState().future).toHaveLength(0)
    const committed = structuredClone(useStore.getState().source)
    vi.advanceTimersByTime(300)
    const raw = values.get(STORAGE_KEY)
    if (!raw) throw new Error('aggregate source가 저장되지 않았습니다.')
    expect(Object.keys((JSON.parse(raw) as { state: Record<string, unknown> }).state)).toEqual(['source'])
    const reloaded = await importStore(raw)
    expect(reloaded.useShapeSystemStore.getState().source).toEqual(committed)
    expect(reloaded.useShapeSystemStore.getState().past).toEqual([])
    expect(reloaded.useShapeSystemStore.getState().future).toEqual([])
  })

  it('7문맥 base Rail no-op/stale/minGap 실패는 source/history/storage를 exact 보존한다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    expect(storeModule.initializeStarterShapeSystem()).toEqual({ ok: true })
    vi.advanceTimersByTime(300)
    const source = useStore.getState().source!
    const attempts = [
      sevenContextCommand(source, 0.2),
      (() => {
        const value = sevenContextCommand(source)
        value.targets.CH.railId = 'rail:stale'
        return value
      })(),
      sevenContextCommand(source, 0.49),
    ]
    for (const attempt of attempts) {
      const before = {
        source: structuredClone(useStore.getState().source),
        past: structuredClone(useStore.getState().past),
        future: structuredClone(useStore.getState().future),
        raw: values.get(STORAGE_KEY),
      }
      expect(useStore.getState().setSevenContextBaseCoreRail(attempt)).toEqual(expect.objectContaining({ ok: false }))
      expect(useStore.getState().source).toEqual(before.source)
      expect(useStore.getState().past).toEqual(before.past)
      expect(useStore.getState().future).toEqual(before.future)
      vi.advanceTimersByTime(300)
      expect(values.get(STORAGE_KEY)).toBe(before.raw)
    }
  })

  it('7문맥 whole-source history의 stale Undo/Redo도 source/history/storage를 exact 보존한다', async () => {
    const drift = (source: ShapeSystemSourceV2): ValidatedShapeSystemSourceV2 => {
      const next = structuredClone(source)
      next.roleSources.JO.grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!.position = {
        kind: 'absolute', value: 0.95,
      }
      const parsed = parseShapeSystemSourceV2(next)
      if (!parsed.ok) throw new Error('aggregate stale fixture parse 실패')
      return parsed.source
    }

    const undoModule = await importStore()
    const undoStore = undoModule.useShapeSystemStore
    undoModule.initializeStarterShapeSystem()
    const undoStart = undoStore.getState().source!
    undoStore.getState().setSevenContextBaseCoreRail(sevenContextCommand(undoStart))
    undoStore.setState({ source: drift(undoStore.getState().source!) })
    vi.advanceTimersByTime(300)
    const undoBefore = {
      source: structuredClone(undoStore.getState().source),
      past: structuredClone(undoStore.getState().past),
      future: structuredClone(undoStore.getState().future),
      raw: values.get(STORAGE_KEY),
    }
    expect(undoStore.getState().undo()).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'stale-history' }),
    }))
    expect(undoStore.getState().source).toEqual(undoBefore.source)
    expect(undoStore.getState().past).toEqual(undoBefore.past)
    expect(undoStore.getState().future).toEqual(undoBefore.future)
    vi.advanceTimersByTime(300)
    expect(values.get(STORAGE_KEY)).toBe(undoBefore.raw)

    const redoModule = await importStore()
    const redoStore = redoModule.useShapeSystemStore
    redoModule.initializeStarterShapeSystem()
    const redoStart = redoStore.getState().source!
    redoStore.getState().setSevenContextBaseCoreRail(sevenContextCommand(redoStart))
    redoStore.getState().undo()
    redoStore.setState({ source: drift(redoStore.getState().source!) })
    vi.advanceTimersByTime(300)
    const redoBefore = {
      source: structuredClone(redoStore.getState().source),
      past: structuredClone(redoStore.getState().past),
      future: structuredClone(redoStore.getState().future),
      raw: values.get(STORAGE_KEY),
    }
    expect(redoStore.getState().redo()).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'stale-history' }),
    }))
    expect(redoStore.getState().source).toEqual(redoBefore.source)
    expect(redoStore.getState().past).toEqual(redoBefore.past)
    expect(redoStore.getState().future).toEqual(redoBefore.future)
    vi.advanceTimersByTime(300)
    expect(values.get(STORAGE_KEY)).toBe(redoBefore.raw)
  })

  it('catalog preset이 연결된 source도 set/remove/Undo/Redo와 재접속 round-trip을 유지한다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    const source = createConnectedShapeSystemV2Fixture()
    expect(storeModule.loadShapeSystemFromFontData(source)).toEqual({ ok: true })
    const masterId = source.roleSources.CH.masters[0].id
    const context = { baseContext: 'horizontal' } as const

    expect(useStore.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:store:catalog:set',
      masterId,
      context,
      coreRole: 'inner-right',
      position: { kind: 'absolute', value: 0.76 },
    })).toEqual({ ok: true })
    expect(useStore.getState().past).toHaveLength(1)
    expect(useStore.getState().undo()).toEqual({ ok: true })
    expect(useStore.getState().redo()).toEqual({ ok: true })
    expect(useStore.getState().removeContextCoreRailOverride('CH', {
      transactionId: 'tx:store:catalog:remove',
      masterId,
      context,
      coreRole: 'inner-right',
    })).toEqual({ ok: true })
    expect(useStore.getState().source).toEqual(source)

    vi.advanceTimersByTime(300)
    const raw = values.get(STORAGE_KEY)
    const reloadedModule = await importStore(raw)
    expect(reloadedModule.useShapeSystemStore.getState().source).toEqual(source)
    expect(reloadedModule.useShapeSystemStore.getState().past).toEqual([])
    expect(reloadedModule.useShapeSystemStore.getState().future).toEqual([])
  })

  it('semantic no-op과 실패 명령은 source/history/storage를 바꾸지 않는다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    const source = envelope()
    storeModule.loadShapeSystemFromFontData(source)
    vi.advanceTimersByTime(300)
    const beforeRaw = values.get(STORAGE_KEY)
    const beforeSource = structuredClone(useStore.getState().source)
    const result = useStore.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:store:no-op', masterId: source.roleSources.CH.masters[0].id,
      context: { baseContext: 'horizontal' }, coreRole: 'inner-left',
      position: { value: 0.2, kind: 'absolute' },
    })
    expect(result.ok).toBe(false)
    expect(useStore.getState().source).toEqual(beforeSource)
    expect(useStore.getState().past).toHaveLength(0)
    vi.advanceTimersByTime(300)
    expect(values.get(STORAGE_KEY)).toBe(beforeRaw)
  })

  it('Undo 뒤 새 commit은 future를 제거하고 reload는 source만 복원한다', async () => {
    const source = envelope()
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    storeModule.loadShapeSystemFromFontData(source)
    const masterId = source.roleSources.CH.masters[0].id
    useStore.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:store:first', masterId, context: { baseContext: 'horizontal' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    useStore.getState().undo()
    useStore.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:store:second', masterId, context: { baseContext: 'vertical' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.26 },
    })
    expect(useStore.getState().future).toHaveLength(0)
    const expected = structuredClone(useStore.getState().source)
    vi.advanceTimersByTime(300)
    const raw = values.get(STORAGE_KEY)
    const reloadedModule = await importStore(raw)
    const reloaded = reloadedModule.useShapeSystemStore
    expect(reloaded.getState().source).toEqual(expected)
    expect(reloaded.getState().past).toHaveLength(0)
    expect(reloaded.getState().future).toHaveLength(0)
  })

  it.each([
    ['malformed JSON', '{bad-json'],
    ['null state', JSON.stringify({ state: null, version: 2 })],
    ['array state', JSON.stringify({ state: [], version: 2 })],
    ['empty state', JSON.stringify({ state: {}, version: 2 })],
    ['outer future field', JSON.stringify({ state: { source: null }, version: 2, future: true })],
    ['invalid nested source', persisted({ schema: 'shape-system', version: 2, roleSources: {} })],
    ['future store version', JSON.stringify({ state: { source: envelope() }, version: 3 })],
  ])('%s hydration은 blocked이고 raw byte를 덮어쓰지 않는다', async (_label, raw) => {
    const storeModule = await importStore(raw)
    const useStore = storeModule.useShapeSystemStore
    expect(useStore.getState().hydrationStatus).toBe('blocked')
    expect(useStore.getState().source).toBeNull()
    expect(useStore.getState().past).toHaveLength(0)
    expect(useStore.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:blocked', masterId: 'missing', context: { baseContext: 'horizontal' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })).toEqual(expect.objectContaining({ ok: false }))
    expect(useStore.getState().setSevenContextBaseCoreRail({
      transactionId: 'tx:blocked:base', jamoId: 'ㄱ', coreRole: 'inner-left',
      position: { kind: 'absolute', value: 0.25 },
      targets: {
        STANDALONE: { masterId: 'missing', railId: 'missing' },
        CH: { masterId: 'missing', railId: 'missing' },
      },
    })).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'hydration-blocked' }),
    }))
    expect(storeModule.loadShapeSystemFromFontData(null)).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'hydration-blocked' }),
    }))
    vi.advanceTimersByTime(1_000)
    expect(values.get(STORAGE_KEY)).toBe(raw)
    expect(writes).toHaveLength(0)
  })

  it('손상된 store v1 Shape 원본도 migration 재저장 없이 raw byte를 보존한다', async () => {
    const legacy = createShapeSystemSourceV1(roleSourceRecord())
    delete (legacy.roleSources as unknown as Record<string, unknown>).JO
    const raw = persisted(legacy, 1)
    const storeModule = await importStore(raw)
    expect(storeModule.useShapeSystemStore.getState().hydrationStatus).toBe('blocked')
    expect(storeModule.useShapeSystemStore.getState().source).toBeNull()
    vi.advanceTimersByTime(1_000)
    expect(values.get(STORAGE_KEY)).toBe(raw)
    expect(writes).toHaveLength(0)
  })

  it('stale Undo/Redo는 양방향 모두 source/history/storage를 변경하지 않는다', async () => {
    const source = envelope()
    const firstModule = await importStore()
    const first = firstModule.useShapeSystemStore
    firstModule.loadShapeSystemFromFontData(source)
    const masterId = source.roleSources.CH.masters[0].id
    first.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:stale:undo', masterId, context: { baseContext: 'horizontal' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.25 },
    })
    const drifted = structuredClone(first.getState().source) as ShapeSystemSourceV2
    const outerRight = drifted.roleSources.CH.grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!
    outerRight.position = { kind: 'absolute', value: 0.95 }
    const parsedDrift = parseShapeSystemSourceV2(drifted)
    if (!parsedDrift.ok) throw new Error('stale fixture parse 실패')
    first.setState({ source: parsedDrift.source })
    vi.advanceTimersByTime(300)
    const undoBefore = {
      source: structuredClone(first.getState().source),
      past: structuredClone(first.getState().past),
      future: structuredClone(first.getState().future),
      raw: values.get(STORAGE_KEY),
    }
    const undo = first.getState().undo()
    expect(undo).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'stale-history' }),
    }))
    expect(first.getState().source).toEqual(undoBefore.source)
    expect(first.getState().past).toEqual(undoBefore.past)
    expect(first.getState().future).toEqual(undoBefore.future)
    vi.advanceTimersByTime(300)
    expect(values.get(STORAGE_KEY)).toBe(undoBefore.raw)

    const secondModule = await importStore()
    const second = secondModule.useShapeSystemStore
    secondModule.loadShapeSystemFromFontData(source)
    second.getState().setContextCoreRailOverride('CH', {
      transactionId: 'tx:stale:redo', masterId, context: { baseContext: 'vertical' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.26 },
    })
    second.getState().undo()
    const redoDrift = structuredClone(second.getState().source) as ShapeSystemSourceV2
    const redoOuter = redoDrift.roleSources.CH.grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!
    redoOuter.position = { kind: 'absolute', value: 0.95 }
    const parsedRedoDrift = parseShapeSystemSourceV2(redoDrift)
    if (!parsedRedoDrift.ok) throw new Error('redo stale fixture parse 실패')
    second.setState({ source: parsedRedoDrift.source })
    vi.advanceTimersByTime(300)
    const redoBefore = {
      source: structuredClone(second.getState().source),
      past: structuredClone(second.getState().past),
      future: structuredClone(second.getState().future),
      raw: values.get(STORAGE_KEY),
    }
    const redo = second.getState().redo()
    expect(redo).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'stale-history' }),
    }))
    expect(second.getState().source).toEqual(redoBefore.source)
    expect(second.getState().past).toEqual(redoBefore.past)
    expect(second.getState().future).toEqual(redoBefore.future)
    vi.advanceTimersByTime(300)
    expect(values.get(STORAGE_KEY)).toBe(redoBefore.raw)
  })

  it('session history를 50개로 제한하고 runtime unknown role을 throw 없이 거부한다', async () => {
    const storeModule = await importStore()
    const useStore = storeModule.useShapeSystemStore
    const source = envelope()
    storeModule.loadShapeSystemFromFontData(source)
    const masterId = source.roleSources.CH.masters[0].id
    for (let index = 0; index < 55; index += 1) {
      const result = useStore.getState().setContextCoreRailOverride('CH', {
        transactionId: `tx:history:${index}`, masterId,
        context: { baseContext: 'horizontal' }, coreRole: 'inner-left',
        position: { kind: 'absolute', value: 0.25 + index * 0.001 },
      })
      expect(result.ok).toBe(true)
    }
    expect(useStore.getState().past).toHaveLength(50)
    expect(() => useStore.getState().setContextCoreRailOverride('FUTURE' as JamoPartRole, {
      transactionId: 'tx:bad-role', masterId, context: { baseContext: 'horizontal' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.31 },
    })).not.toThrow()
    expect(useStore.getState().setContextCoreRailOverride('FUTURE' as JamoPartRole, {
      transactionId: 'tx:bad-role:result', masterId, context: { baseContext: 'horizontal' },
      coreRole: 'inner-left', position: { kind: 'absolute', value: 0.31 },
    })).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'invalid-role' }),
    }))
    expect(useStore.getState().past).toHaveLength(50)
  })

  it('store 공개 API가 raw resolver·retile·generic transaction 적용을 노출하지 않는다', async () => {
    const useStore = (await importStore()).useShapeSystemStore
    expect(Object.keys(useStore.getState()).sort()).toEqual([
      'canRedo', 'canUndo', 'connectLayoutGrid', 'future', 'hydrationIssues', 'hydrationStatus',
      'past', 'redo', 'removeContextCoreRailOverride',
      'setContextCoreRailOverride', 'setSevenContextBaseCoreRail', 'source', 'undo',
    ])
  })
})
