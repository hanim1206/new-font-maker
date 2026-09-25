import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAndMigrateFontData } from '../src/services/fontDataMigration'
import type { FontData } from '../src/types/database'
import { clearLocalFont, dropForeignCopy, LOCAL_STAMP_KEY, readStamp, startPlanOf, writeStamp } from './accountFont'

const storageValues = new Map<string, string>()
const storage = {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key: string) => storageValues.get(key) ?? null,
  key: (index: number) => [...storageValues.keys()][index] ?? null,
  removeItem: (key: string) => { storageValues.delete(key) },
  setItem: (key: string, value: string) => { storageValues.set(key, value) },
} as Storage

/** Supabase 쿼리 사슬을 흉내 낸다. 마지막 호출이 결과를 돌려준다. */
interface Call { op: 'select' | 'insert' | 'update'; payload?: unknown }
const calls: Call[] = []
let serverRows: { id: string; font_data: unknown }[] = []
let updateError: { message: string } | null = null

const fakeSupabase = {
  from: () => {
    let op: Call['op'] = 'select'
    let payload: unknown
    const chain = {
      select: () => { if (op === 'select') calls.push({ op }); return chain },
      insert: (value: unknown) => { op = 'insert'; payload = value; calls.push({ op, payload }); return chain },
      update: (value: unknown) => { op = 'update'; payload = value; calls.push({ op, payload }); return chain },
      eq: () => chain,
      limit: () => Promise.resolve({ data: serverRows, error: null }),
      single: () => Promise.resolve({ data: { id: 'new-font' }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve(op === 'update'
        ? { error: updateError, count: updateError ? null : 1 }
        : { data: null, error: null }),
    }
    void payload
    return chain
  },
}
vi.mock('../src/lib/supabase', () => ({ supabase: fakeSupabase }))

describe('브라우저 사본 이름표', () => {
  beforeEach(() => storageValues.clear())

  it('계정에 폰트가 없으면 사본으로 만든다', () => {
    expect(startPlanOf({ hasServerFont: false, stamp: { owner: null, pending: false }, me: 'a' })).toBe('create-from-local')
    expect(startPlanOf({ hasServerFont: false, stamp: { owner: 'a', pending: true }, me: 'a' })).toBe('create-from-local')
  })

  it('계정에 폰트가 있으면 서버가 이긴다. 내 사본에 못 올린 변경이 있을 때만 사본을 올린다', () => {
    expect(startPlanOf({ hasServerFont: true, stamp: { owner: 'a', pending: false }, me: 'a' })).toBe('use-server')
    expect(startPlanOf({ hasServerFont: true, stamp: { owner: null, pending: true }, me: 'a' })).toBe('use-server')
    expect(startPlanOf({ hasServerFont: true, stamp: { owner: 'a', pending: true }, me: 'a' })).toBe('push-local')
  })

  it('남의 사본은 지우고, 주인 없는 사본과 내 사본은 둔다', () => {
    storage.setItem('font-maker-jamo-data', '{}')
    writeStamp(storage, { owner: 'a', pending: true })
    expect(dropForeignCopy(storage, 'a')).toBe(false)
    expect(dropForeignCopy(storage, 'b')).toBe(true)
    expect(storage.getItem('font-maker-jamo-data')).toBeNull()
    expect(storage.getItem(LOCAL_STAMP_KEY)).toBeNull()

    storage.setItem('font-maker-jamo-data', '{}')
    expect(dropForeignCopy(storage, 'b')).toBe(false)
    expect(storage.getItem('font-maker-jamo-data')).toBe('{}')
  })

  it('망가진 이름표는 주인 없음으로 읽는다', () => {
    storage.setItem(LOCAL_STAMP_KEY, '{oops')
    expect(readStamp(storage)).toEqual({ owner: null, pending: false })
    clearLocalFont(storage)
    expect(storageValues.size).toBe(0)
  })
})

let collectAccountFontData: typeof import('./accountFontSync').collectAccountFontData
let startAccountFont: typeof import('./accountFontSync').startAccountFont
let flushAccountFont: typeof import('./accountFontSync').flushAccountFont
let useAccountSaveStore: typeof import('./accountFontSync').useAccountSaveStore
let resetAccountFontForTest: typeof import('./accountFontSync').resetAccountFontForTest
let useLayoutDeltaStore: typeof import('./layoutDeltaStore').useLayoutDeltaStore
let useGlobalStyleStore: typeof import('../src/stores/globalStyleStore').useGlobalStyleStore
let baseFont: FontData
const DELTA = { rules: { '*': { faces: { CH: { top: 0.02 } } } } } as unknown as NonNullable<FontData['layoutDelta']>

beforeAll(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' })
  const sync = await import('./accountFontSync')
  collectAccountFontData = sync.collectAccountFontData
  startAccountFont = sync.startAccountFont
  flushAccountFont = sync.flushAccountFont
  useAccountSaveStore = sync.useAccountSaveStore
  resetAccountFontForTest = sync.resetAccountFontForTest
  useLayoutDeltaStore = (await import('./layoutDeltaStore')).useLayoutDeltaStore
  useGlobalStyleStore = (await import('../src/stores/globalStyleStore')).useGlobalStyleStore
  baseFont = collectAccountFontData()
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  resetAccountFontForTest()
  calls.length = 0
  serverRows = []
  updateError = null
  storageValues.clear()
  useLayoutDeltaStore.getState().clearAll()
})

describe('저장 형식 1.5', () => {
  it('1.4는 레이아웃 조정 없이 1.5로 올린다', () => {
    const result = parseAndMigrateFontData({ ...structuredClone(baseFont), version: '1.4.0' })
    expect(result.ok && result.migratedFrom).toBe('1.4.0')
    expect(result.ok && result.data.version).toBe('1.5.0')
    expect(result.ok && result.data).not.toHaveProperty('layoutDelta')
  })

  it('1.5의 레이아웃 조정은 그대로 두고, 1.4에 붙은 조정이나 모양이 틀린 조정은 막는다', () => {
    const withDelta = { ...structuredClone(baseFont), layoutDelta: DELTA }
    const ok = parseAndMigrateFontData(withDelta)
    expect(ok.ok && ok.data.layoutDelta).toEqual(DELTA)
    expect(parseAndMigrateFontData({ ...withDelta, version: '1.4.0' }).ok).toBe(false)
    expect(parseAndMigrateFontData({ ...withDelta, layoutDelta: { rules: [] } }).ok).toBe(false)
    expect(parseAndMigrateFontData({ ...withDelta, layoutDelta: { rules: {}, extra: 1 } }).ok).toBe(false)
  })

  it('모으기에 레이아웃 조정이 들어간다', () => {
    useLayoutDeltaStore.getState().restore(DELTA)
    expect(collectAccountFontData().layoutDelta).toEqual(DELTA)
  })
})

describe('계정 폰트 불러오기 · 자동 저장', () => {
  it('계정에 폰트가 있으면 서버 값으로 채운다(레이아웃 조정 포함)', async () => {
    serverRows = [{ id: 'f1', font_data: { ...structuredClone(baseFont), layoutDelta: DELTA } }]
    expect(await startAccountFont('me')).toEqual({ ok: true })
    expect(useLayoutDeltaStore.getState().rules).toEqual(DELTA.rules)
    expect(calls.map((call) => call.op)).toEqual(['select'])
    expect(readStamp(storage)).toEqual({ owner: 'me', pending: false })
  })

  it('계정이 비었으면 지금 값으로 만든다', async () => {
    expect(await startAccountFont('me')).toEqual({ ok: true })
    const insert = calls.find((call) => call.op === 'insert')
    expect(insert?.payload).toMatchObject({ user_id: 'me', font_data: { version: '1.5.0' } })
  })

  it('내 사본에 못 올린 변경이 있으면 서버 값 대신 사본을 올린다', async () => {
    serverRows = [{ id: 'f1', font_data: structuredClone(baseFont) }]
    useLayoutDeltaStore.getState().restore(DELTA)
    writeStamp(storage, { owner: 'me', pending: true })
    expect(await startAccountFont('me')).toEqual({ ok: true })
    expect(useLayoutDeltaStore.getState().rules).toEqual(DELTA.rules)
    expect(calls.find((call) => call.op === 'update')?.payload).toMatchObject({ font_data: { layoutDelta: DELTA } })
  })

  it('고치면 이름표에 표시하고, 10초 멈추면 올린다. 실패하면 알리고 다시 올린다', async () => {
    serverRows = [{ id: 'f1', font_data: structuredClone(baseFont) }]
    await startAccountFont('me')
    calls.length = 0

    useGlobalStyleStore.getState().loadFontData({ style: { ...baseFont.globalStyle.style, weight: baseFont.globalStyle.style.weight + 10 }, exclusions: [] })
    expect(readStamp(storage).pending).toBe(true)
    await vi.advanceTimersByTimeAsync(9_000)
    expect(calls.some((call) => call.op === 'update')).toBe(false)

    updateError = { message: 'offline' }
    await vi.advanceTimersByTimeAsync(1_000)
    expect(useAccountSaveStore.getState().status).toBe('error')
    expect(readStamp(storage).pending).toBe(true)

    updateError = null
    await vi.advanceTimersByTimeAsync(30_000)
    expect(useAccountSaveStore.getState().status).toBe('saved')
    expect(readStamp(storage).pending).toBe(false)
    expect(await flushAccountFont()).toBe(true)
  })
})
