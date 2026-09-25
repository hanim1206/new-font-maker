import { create } from 'zustand'
import { applyFontData, collectFontData } from '../src/services/fontDataBridge'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { useShapeSystemStore } from '../src/stores/shapeSystemStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FONT_PRESET } from '../src/types/database'
import type { FontData } from '../src/types/database'
import { editorPlanOf, openPlanOf, readStamp, writeStamp } from './accountFont'
import { bumpExportRevision, createFont, fetchFont, saveFont } from './accountFontApi'
import { useLayoutDeltaStore } from './layoutDeltaStore'

/**
 * 계정 저장의 실행 부분. 편집 화면을 열 때 이름표의 폰트를 불러오고(`accountFont.ts` 규칙), 고치면 서버에 올린다.
 * 브라우저 사본은 스토어가 지금처럼 바로 쓰고, 서버에는 편집이 멈추면 올린다.
 */

/** 편집이 이만큼 멈추면 서버에 올린다. */
export const SERVER_SAVE_IDLE_MS = 10_000
/** 실패하면 이만큼 뒤 다시. 그 전에 또 고치면 그때 올린다. */
const RETRY_MS = 30_000

export type AccountSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const useAccountSaveStore = create<{ status: AccountSaveStatus }>(() => ({ status: 'idle' }))

/** `home`이면 메인 화면(`/fonts`)으로 보낸다. 나머지 실패는 화면을 열지 않는다. */
export type AccountStartResult =
  | { ok: true }
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'network' | 'invalid-font'; message: string }

/** 스토어 다섯 → 저장할 JSON. 레이아웃 조정은 `src-next` 스토어라 브릿지 밖에서 붙인다. */
export function collectAccountFontData(): FontData {
  const data = collectFontData()
  data.preset = DEFAULT_FONT_PRESET
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

let session: { me: string; fontId: string; name: string } | null = null

/** 지금 연 계정 폰트의 이름. 로그인 게이트가 꺼졌으면 null. 머리와 추출 창이 쓴다. */
export function accountFontName(): string | null {
  return session?.name ?? null
}

function opened(me: string, fontId: string, name: string): AccountStartResult {
  session = { me, fontId, name }
  writeStamp(localStorage, { owner: me, fontId, pending: false })
  useUIStore.setState({ currentProjectName: name })
  watchStores()
  return { ok: true }
}

/**
 * 로그인 뒤, 편집 화면을 열기 전에 부른다(`main.tsx`). 남의 사본은 이미 지운 뒤다.
 * 실패하면 화면을 열지 않는다 — 불러오지 못한 채 열면 자동 저장이 엉뚱한 값으로 서버를 덮는다.
 */
export async function startAccountFont(me: string): Promise<AccountStartResult> {
  const stamp = readStamp(localStorage)
  const plan = editorPlanOf(stamp, me)
  if (plan === 'home') return { ok: false, reason: 'home' }

  if (plan === 'create') {
    const name = stamp.create ?? 'My Font'
    const created = await createFont(me, name, collectAccountFontData())
    if (!created.ok) {
      // 한도에 걸렸으면(다른 기기에서 먼저 만들었을 때) 메인 화면에서 다시 고른다.
      writeStamp(localStorage, { owner: me, fontId: null, pending: false })
      return created.limit ? { ok: false, reason: 'home' } : { ok: false, reason: 'network', message: created.message }
    }
    return opened(me, created.value, name)
  }

  const fontId = stamp.fontId!
  const fetched = await fetchFont(fontId)
  if (!fetched.ok) return { ok: false, reason: 'network', message: fetched.message }
  if (!fetched.value) {
    // 다른 기기에서 지웠다. 사본은 버리고 메인 화면에서 다시 고른다.
    writeStamp(localStorage, { owner: me, fontId: null, pending: false })
    return { ok: false, reason: 'home' }
  }
  if (openPlanOf(stamp, me, fontId) === 'push-local') {
    const saved = await saveFont(fontId, collectAccountFontData())
    if (!saved.ok) return { ok: false, reason: 'network', message: saved.message }
  } else {
    const applied = applyAccountFontData(fetched.value.fontData)
    if (!applied.ok) return { ok: false, reason: 'invalid-font', message: applied.message }
  }
  return opened(me, fontId, fetched.value.name)
}

/**
 * 메인 화면에서 다른 폰트로 가기 전에, 지금 사본에 못 올린 변경이 있으면 올린다.
 * 스토어를 가져오므로(사본을 읽는다) 필요할 때만 부른다. 올렸거나 올릴 게 없으면 true.
 */
export async function uploadPendingCopy(me: string): Promise<boolean> {
  const stamp = readStamp(localStorage)
  if (stamp.owner !== me || !stamp.pending || !stamp.fontId) return true
  const saved = await saveFont(stamp.fontId, collectAccountFontData())
  if (!saved.ok) return false
  writeStamp(localStorage, { ...stamp, pending: false })
  return true
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
  writeStamp(localStorage, { owner: session.me, fontId: session.fontId, pending: true })
  schedule(SERVER_SAVE_IDLE_MS)
}

/** 못 올린 변경이 있으면 지금 올린다. 탭을 벗어날 때 · 메인 화면으로 갈 때 · 로그아웃 전에 부른다. 다 올라갔으면 true. */
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
    const result = await saveFont(fontId, collectAccountFontData())
    if (result.ok) {
      savedRevision = target
      if (revision === target) writeStamp(localStorage, { owner: me, fontId, pending: false })
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

const LOCAL_EXPORT_REVISION_KEY = 'font-export-revision-v1'

/**
 * 이번 추출의 버전 번호(1부터). 계정 폰트면 서버가 센다(기기가 달라도 이어진다).
 * 게이트가 꺼졌거나 서버가 안 되면 이 브라우저에서 센다 — 추출은 막지 않는다.
 */
export async function nextExportRevision(): Promise<number> {
  if (session) {
    const bumped = await bumpExportRevision(session.fontId)
    if (bumped.ok) return bumped.value
  }
  try {
    const next = (Number(localStorage.getItem(LOCAL_EXPORT_REVISION_KEY)) || 0) + 1
    localStorage.setItem(LOCAL_EXPORT_REVISION_KEY, String(next))
    return next
  } catch {
    return 0
  }
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
