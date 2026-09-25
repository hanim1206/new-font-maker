import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAndMigrateFontData } from '../src/services/fontDataMigration'
import type { FontData } from '../src/types/database'
import {
  clearLocalFont,
  dropForeignCopy,
  editedDayText,
  editorPlanOf,
  keepsLocalForNewFont,
  LOCAL_STAMP_KEY,
  nextFontName,
  openPlanOf,
  readStamp,
  writeStamp,
} from './accountFont'
import type { LocalStamp } from './accountFont'

const storageValues = new Map<string, string>()
const storage = {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key: string) => storageValues.get(key) ?? null,
  key: (index: number) => [...storageValues.keys()][index] ?? null,
  removeItem: (key: string) => { storageValues.delete(key) },
  setItem: (key: string, value: string) => { storageValues.set(key, value) },
} as Storage

/** Supabase 쿼리 사슬 흉내. 끝(await · maybeSingle · single)에서 op에 맞는 결과를 준다. */
interface Call { op: 'select' | 'insert' | 'update' | 'rpc'; payload?: unknown }
const calls: Call[] = []
let serverFont: { id: string; name: string; font_data: unknown } | null = null
let updateError: { message: string } | null = null
let insertError: { message: string } | null = null
let rpcResult: { data: unknown; error: { message: string } | null } = { data: 1, error: null }

const fakeSupabase = vi.hoisted(() => ({
  rpc: (name: string, args: unknown) => { calls.push({ op: 'rpc', payload: { name, args } }); return Promise.resolve(rpcResult) },
  from: () => {
    let op: Call['op'] = 'select'
    const chain = {
      select: () => { if (op === 'select') calls.push({ op }); return chain },
      insert: (value: unknown) => { op = 'insert'; calls.push({ op, payload: value }); return chain },
      update: (value: unknown) => { op = 'update'; calls.push({ op, payload: value }); return chain },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      maybeSingle: () => Promise.resolve({ data: serverFont, error: null }),
      single: () => Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: 'new-font' }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve(op === 'update'
        ? { error: updateError, count: updateError ? null : 1 }
        : { data: [], error: null }),
    }
    return chain
  },
}))
vi.mock('../src/lib/supabase', () => ({ supabase: fakeSupabase }))

const stampOf = (partial: Partial<LocalStamp>): LocalStamp => ({ owner: null, fontId: null, pending: false, ...partial })

describe('브라우저 사본 이름표', () => {
  beforeEach(() => storageValues.clear())

  it('편집 화면을 열 때: 고른 폰트가 없으면 메인 화면, 만들기 표시가 있으면 만들고, 아니면 연다', () => {
    expect(editorPlanOf(stampOf({}), 'a')).toBe('home')
    expect(editorPlanOf(stampOf({ owner: 'a' }), 'a')).toBe('home')
    expect(editorPlanOf(stampOf({ owner: 'a', create: 'test1' }), 'a')).toBe('create')
    expect(editorPlanOf(stampOf({ owner: 'a', fontId: 'f1' }), 'a')).toBe('open')
    expect(editorPlanOf(stampOf({ owner: 'b', fontId: 'f1' }), 'a')).toBe('home')
  })

  it('서버가 이긴다. 같은 폰트의 내 사본에 못 올린 변경이 있을 때만 사본을 올린다', () => {
    expect(openPlanOf(stampOf({ owner: 'a', fontId: 'f1' }), 'a', 'f1')).toBe('use-server')
    expect(openPlanOf(stampOf({ owner: 'a', fontId: 'f1', pending: true }), 'a', 'f1')).toBe('push-local')
    expect(openPlanOf(stampOf({ owner: 'a', fontId: 'f2', pending: true }), 'a', 'f1')).toBe('use-server')
  })

  it('남의 사본은 지우고, 주인 없는 사본과 내 사본은 둔다', () => {
    storage.setItem('font-maker-jamo-data', '{}')
    writeStamp(storage, stampOf({ owner: 'a', fontId: 'f1', pending: true }))
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
    expect(readStamp(storage)).toEqual(stampOf({}))
    clearLocalFont(storage)
    expect(storageValues.size).toBe(0)
  })

  it('새 폰트 이름은 친구 아이디, 겹치면 번호. 아이디가 없으면 My Font', () => {
    expect(nextFontName('test1', [])).toBe('test1')
    expect(nextFontName('test1', ['test1'])).toBe('test1 2')
    expect(nextFontName('test1', ['test1', 'test1 2'])).toBe('test1 3')
    expect(nextFontName('test1', ['test1 2'])).toBe('test1')
    expect(nextFontName(null, [])).toBe('My Font')
  })

  it('로그인 전 작업은 계정이 비었을 때만 첫 폰트가 된다', () => {
    expect(keepsLocalForNewFont(stampOf({}), 0, true)).toBe(true)
    expect(keepsLocalForNewFont(stampOf({}), 1, true)).toBe(false)
    expect(keepsLocalForNewFont(stampOf({ owner: 'a' }), 0, true)).toBe(false)
    expect(keepsLocalForNewFont(stampOf({}), 0, false)).toBe(false)
  })

  it('마지막 고친 날', () => {
    const now = new Date(2026, 8, 25, 18)
    expect(editedDayText(new Date(2026, 8, 25, 1).toISOString(), now)).toBe('오늘 고침')
    expect(editedDayText(new Date(2026, 8, 24, 23).toISOString(), now)).toBe('어제 고침')
    expect(editedDayText(new Date(2026, 8, 20).toISOString(), now)).toBe('5일 전 고침')
    expect(editedDayText(new Date(2026, 7, 3).toISOString(), now)).toBe('8월 3일 고침')
  })
})

let collectAccountFontData: typeof import('./accountFontSync').collectAccountFontData
let startAccountFont: typeof import('./accountFontSync').startAccountFont
let flushAccountFont: typeof import('./accountFontSync').flushAccountFont
let nextExportRevision: typeof import('./accountFontSync').nextExportRevision
let accountFontName: typeof import('./accountFontSync').accountFontName
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
  nextExportRevision = sync.nextExportRevision
  accountFontName = sync.accountFontName
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
  serverFont = null
  updateError = null
  insertError = null
  rpcResult = { data: 1, error: null }
  storageValues.clear()
  useLayoutDeltaStore.getState().clearAll()
})

describe('저장 형식 1.5', () => {
  it('1.4는 레이아웃 조정 · preset 없이 1.5로 올린다', () => {
    const withoutPreset: Partial<FontData> = structuredClone(baseFont)
    delete withoutPreset.preset
    const result = parseAndMigrateFontData({ ...withoutPreset, version: '1.4.0' })
    expect(result.ok && result.migratedFrom).toBe('1.4.0')
    expect(result.ok && result.data.version).toBe('1.5.0')
    expect(result.ok && result.data).not.toHaveProperty('layoutDelta')
  })

  it('1.5의 레이아웃 조정 · preset은 그대로 두고, 모양이 틀리면 막는다', () => {
    const withDelta = { ...structuredClone(baseFont), layoutDelta: DELTA }
    const ok = parseAndMigrateFontData(withDelta)
    expect(ok.ok && ok.data.layoutDelta).toEqual(DELTA)
    expect(ok.ok && ok.data.preset).toBe('basic-gothic')
    expect(parseAndMigrateFontData({ ...withDelta, version: '1.4.0' }).ok).toBe(false)
    expect(parseAndMigrateFontData({ ...withDelta, layoutDelta: { rules: [] } }).ok).toBe(false)
    expect(parseAndMigrateFontData({ ...withDelta, layoutDelta: { rules: {}, extra: 1 } }).ok).toBe(false)
    expect(parseAndMigrateFontData({ ...withDelta, preset: 'noto-sans-kr' }).ok).toBe(false)
  })

  it('모으기에 레이아웃 조정과 preset이 들어간다', () => {
    useLayoutDeltaStore.getState().restore(DELTA)
    const data = collectAccountFontData()
    expect(data.layoutDelta).toEqual(DELTA)
    expect(data.preset).toBe('basic-gothic')
  })
})

describe('계정 폰트 열기 · 자동 저장', () => {
  it('고른 폰트가 없으면 메인 화면으로 보낸다', async () => {
    expect(await startAccountFont('me')).toEqual({ ok: false, reason: 'home' })
    expect(calls).toEqual([])
  })

  it('이름표의 폰트를 서버 값으로 채운다(레이아웃 조정 포함)', async () => {
    writeStamp(storage, stampOf({ owner: 'me', fontId: 'f1' }))
    serverFont = { id: 'f1', name: 'test1', font_data: { ...structuredClone(baseFont), layoutDelta: DELTA } }
    expect(await startAccountFont('me')).toEqual({ ok: true })
    expect(useLayoutDeltaStore.getState().rules).toEqual(DELTA.rules)
    expect(accountFontName()).toBe('test1')
    expect(readStamp(storage)).toEqual(stampOf({ owner: 'me', fontId: 'f1' }))
  })

  it('다른 기기에서 지운 폰트면 메인 화면으로 보내고 이름표의 폰트를 비운다', async () => {
    writeStamp(storage, stampOf({ owner: 'me', fontId: 'gone' }))
    expect(await startAccountFont('me')).toEqual({ ok: false, reason: 'home' })
    expect(readStamp(storage)).toEqual(stampOf({ owner: 'me' }))
  })

  it('만들기 표시가 있으면 그 이름으로 만든다. 한도에 걸리면 메인 화면으로', async () => {
    writeStamp(storage, stampOf({ owner: 'me', create: 'test1 2' }))
    expect(await startAccountFont('me')).toEqual({ ok: true })
    expect(calls.find((call) => call.op === 'insert')?.payload).toMatchObject({ user_id: 'me', name: 'test1 2', font_data: { version: '1.5.0', preset: 'basic-gothic' } })
    expect(readStamp(storage)).toEqual(stampOf({ owner: 'me', fontId: 'new-font' }))

    resetAccountFontForTest()
    insertError = { message: 'font-limit' }
    writeStamp(storage, stampOf({ owner: 'me', create: 'test1 4' }))
    expect(await startAccountFont('me')).toEqual({ ok: false, reason: 'home' })
  })

  it('내 사본에 못 올린 변경이 있으면 서버 값 대신 사본을 올린다', async () => {
    serverFont = { id: 'f1', name: 'test1', font_data: structuredClone(baseFont) }
    useLayoutDeltaStore.getState().restore(DELTA)
    writeStamp(storage, stampOf({ owner: 'me', fontId: 'f1', pending: true }))
    expect(await startAccountFont('me')).toEqual({ ok: true })
    expect(useLayoutDeltaStore.getState().rules).toEqual(DELTA.rules)
    expect(calls.find((call) => call.op === 'update')?.payload).toMatchObject({ font_data: { layoutDelta: DELTA } })
  })

  it('고치면 이름표에 표시하고, 10초 멈추면 올린다. 실패하면 알리고 다시 올린다', async () => {
    writeStamp(storage, stampOf({ owner: 'me', fontId: 'f1' }))
    serverFont = { id: 'f1', name: 'test1', font_data: structuredClone(baseFont) }
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
    expect(readStamp(storage)).toEqual(stampOf({ owner: 'me', fontId: 'f1' }))
    expect(await flushAccountFont()).toBe(true)
  })

  it('추출 버전: 계정 폰트면 서버가 세고, 안 되면 이 브라우저에서 센다', async () => {
    expect(await nextExportRevision()).toBe(1)
    expect(await nextExportRevision()).toBe(2)
    expect(calls.some((call) => call.op === 'rpc')).toBe(false)

    writeStamp(storage, stampOf({ owner: 'me', fontId: 'f1' }))
    serverFont = { id: 'f1', name: 'test1', font_data: structuredClone(baseFont) }
    await startAccountFont('me')
    rpcResult = { data: 5, error: null }
    expect(await nextExportRevision()).toBe(5)
    expect(calls.find((call) => call.op === 'rpc')?.payload).toEqual({ name: 'bump_font_export_revision', args: { font_id: 'f1' } })
  })
})
