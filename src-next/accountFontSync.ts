import { create } from 'zustand'
import { supabase } from '../src/lib/supabase'
import { applyFontData, collectFontData } from '../src/services/fontDataBridge'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { useShapeSystemStore } from '../src/stores/shapeSystemStore'
import type { FontData } from '../src/types/database'
import { readStamp, startPlanOf, writeStamp } from './accountFont'
import { useLayoutDeltaStore } from './layoutDeltaStore'

/**
 * 계정 저장의 실행 부분. `accountFont.ts`의 규칙대로 들어올 때 불러오고, 고치면 서버에 올린다.
 * 브라우저 사본은 스토어가 지금처럼 바로 쓰고, 서버에는 편집이 멈추면 올린다.
 */

const TABLE = 'font_projects'
/** 편집이 이만큼 멈추면 서버에 올린다. */
export const SERVER_SAVE_IDLE_MS = 10_000
/** 실패하면 이만큼 뒤 다시. 그 전에 또 고치면 그때 올린다. */
const RETRY_MS = 30_000

export type AccountSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const useAccountSaveStore = create<{ status: AccountSaveStatus }>(() => ({ status: 'idle' }))

export type AccountStartResult = { ok: true } | { ok: false; reason: 'network' | 'invalid-font'; message: string }

/** 스토어 다섯 → 저장할 JSON. 레이아웃 조정은 `src-next` 스토어라 브릿지 밖에서 붙인다. */
export function collectAccountFontData(): FontData {
  const data = collectFontData()
  const rules = useLayoutDeltaStore.getState().rules
  if (Object.keys(rules).length > 0) data.layoutDelta = { rules: structuredClone(rules) }
  return data
}

function applyAccountFontData(value: unknown): { ok: true } | { ok: false; message: string } {
  const applied = applyFontData(value)
  if (!applied.ok) return { ok: false, message: applied.error.message }
  useLayoutDeltaStore.getState().restore({ rules: applied.data.layoutDelta?.rules ?? {} })
  return { ok: true }
}

let session: { me: string; fontId: string } | null = null

/**
 * 로그인 뒤, 편집 화면을 열기 전에 부른다(`main.tsx`). 남의 사본은 이미 지운 뒤다.
 * 실패하면 화면을 열지 않는다 — 불러오지 못한 채 열면 자동 저장이 빈 폰트로 서버를 덮는다.
 */
export async function startAccountFont(me: string): Promise<AccountStartResult> {
  const { data: rows, error } = await supabase.from(TABLE).select('id, font_data').eq('user_id', me).limit(1)
  if (error) return { ok: false, reason: 'network', message: error.message }
  const row = rows?.[0] as { id: string; font_data: unknown } | undefined
  const plan = startPlanOf({ hasServerFont: Boolean(row), stamp: readStamp(localStorage), me })

  if (row && plan === 'use-server') {
    const applied = applyAccountFontData(row.font_data)
    if (!applied.ok) return { ok: false, reason: 'invalid-font', message: applied.message }
    session = { me, fontId: row.id }
  } else if (row) {
    session = { me, fontId: row.id }
    const saved = await uploadNow(row.id)
    if (!saved.ok) return { ok: false, reason: 'network', message: saved.message }
  } else {
    const { data, error: insertError } = await supabase
      .from(TABLE)
      .insert({ name: '내 폰트', user_id: me, font_data: collectAccountFontData() })
      .select('id')
      .single()
    // 다른 탭이 먼저 만들었으면(계정당 1개 규칙에 걸림) 그걸 불러온다.
    if (insertError?.code === '23505') return startAccountFont(me)
    if (insertError || !data) return { ok: false, reason: 'network', message: insertError?.message ?? '폰트를 만들지 못했습니다.' }
    session = { me, fontId: (data as { id: string }).id }
  }

  writeStamp(localStorage, { owner: me, pending: false })
  watchStores()
  return { ok: true }
}

/** 서버에 지금 스토어 값을 올린다. 폰트를 돌려받지 않는다(내보내는 데이터양을 늘리지 않게). */
async function uploadNow(fontId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  let fontData: FontData
  try {
    fontData = collectAccountFontData()
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '폰트를 모으지 못했습니다.' }
  }
  const { error, count } = await supabase
    .from(TABLE)
    .update({ font_data: fontData, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', fontId)
  if (error) return { ok: false, message: error.message }
  if (count === 0) return { ok: false, message: '계정의 폰트를 찾지 못했습니다.' }
  return { ok: true }
}

let revision = 0
let savedRevision = 0
let inFlight: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function schedule(ms: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void flushAccountFont() }, ms)
}

function markChanged(): void {
  if (!session) return
  revision += 1
  writeStamp(localStorage, { owner: session.me, pending: true })
  schedule(SERVER_SAVE_IDLE_MS)
}

/** 못 올린 변경이 있으면 지금 올린다. 탭을 벗어날 때 · 로그아웃 전에 부른다. 다 올라갔으면 true. */
export async function flushAccountFont(): Promise<boolean> {
  if (!session) return true
  if (timer) { clearTimeout(timer); timer = null }
  if (inFlight) await inFlight
  if (revision === savedRevision) return true
  const target = revision
  const { fontId, me } = session
  let ok = false
  inFlight = (async () => {
    useAccountSaveStore.setState({ status: 'saving' })
    const result = await uploadNow(fontId)
    if (result.ok) {
      savedRevision = target
      if (revision === target) writeStamp(localStorage, { owner: me, pending: false })
      useAccountSaveStore.setState({ status: 'saved' })
      ok = true
    } else {
      useAccountSaveStore.setState({ status: 'error' })
      schedule(RETRY_MS)
    }
  })()
  await inFlight
  inFlight = null
  // 올리는 사이에 또 고쳤으면 멈춘 뒤 한 번 더.
  if (ok && revision !== savedRevision) schedule(SERVER_SAVE_IDLE_MS)
  return ok && revision === savedRevision
}

export function hasUnsavedAccountChanges(): boolean {
  return session !== null && (revision !== savedRevision || inFlight !== null)
}

let watching = false

/** 폰트를 이루는 값이 바뀌면 표시한다. 화면 설정 · 파생값 · hydrate 표시는 보지 않는다. */
function watchStores(): void {
  if (watching) return
  watching = true
  useJamoStore.subscribe((next, prev) => {
    if (next.choseong !== prev.choseong || next.jungseong !== prev.jungseong || next.jongseong !== prev.jongseong) markChanged()
  })
  useLayoutStore.subscribe((next, prev) => {
    if (next.layoutSchemas !== prev.layoutSchemas || next.globalPadding !== prev.globalPadding || next.paddingOverrides !== prev.paddingOverrides) markChanged()
  })
  useGlobalStyleStore.subscribe((next, prev) => {
    if (next.style !== prev.style || next.exclusions !== prev.exclusions) markChanged()
  })
  useShapeSystemStore.subscribe((next, prev) => {
    if (next.source !== prev.source) markChanged()
  })
  useLayoutDeltaStore.subscribe((next, prev) => {
    if (next.rules !== prev.rules) markChanged()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAccountFont()
  })
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedAccountChanges()) return
    void flushAccountFont()
    event.preventDefault()
    event.returnValue = ''
  })
}

/** 테스트용: 모듈 상태를 되돌린다. */
export function resetAccountFontForTest(): void {
  session = null
  revision = 0
  savedRevision = 0
  inFlight = null
  if (timer) clearTimeout(timer)
  timer = null
  useAccountSaveStore.setState({ status: 'idle' })
}
