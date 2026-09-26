import { create } from 'zustand'
import { LOCAL_OWNER } from './localFontApi'
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
import { clearAppNotice, showAppNotice } from './appNotice'
import { useLayoutDeltaStore } from './layoutDeltaStore'
import { registerWorkGuard } from './workGuard'

/**
 * 계정 저장의 실행 부분. 편집 화면을 열 때 이름표의 폰트를 불러오고(`accountFont.ts` 규칙), 고치면 서버에 올린다.
 * 브라우저 사본은 스토어가 지금처럼 바로 쓰고, 서버에는 편집이 멈추면 올린다.
 */

/** 편집이 이만큼 멈추면 서버에 올린다. */
export const SERVER_SAVE_IDLE_MS = 10_000
/** 실패하면 이만큼 뒤 다시. 그 전에 또 고치면 그때 올린다. */
const RETRY_MS = 30_000

/** `conflict`: 다른 기기가 먼저 저장했다. 고를 때까지 올리지 않는다. */
export type AccountSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export const useAccountSaveStore = create<{ status: AccountSaveStatus }>(() => ({ status: 'idle' }))

/** `home`이면 고를 폰트가 없다 — `main.tsx`가 최근 폰트를 고르고(`autoPickOf`) 다시 연다. 나머지 실패는 화면을 열지 않는다. */
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

/** `updatedAt`: 내가 마지막으로 읽거나 올린 서버 값의 표. 다음 저장은 서버가 이 값일 때만 덮는다. */
let session: { me: string; fontId: string; name: string; updatedAt: string | null } | null = null
/** 다른 탭이 편집을 가져갔다. 이 탭은 더 올리지 않는다. */
let suspended = false

/** 지금 연 계정 폰트의 이름. 로그인 게이트가 꺼졌으면 null. 머리와 추출 창이 쓴다. */
export function accountFontName(): string | null {
  return session?.name ?? null
}

/** 지금 연 폰트의 주인 · id. 대시보드 폰트 카드가 목록에서 지금 폰트를 가린다. 열기 전이면 null. */
export function accountFontSession(): { me: string; fontId: string } | null {
  return session ? { me: session.me, fontId: session.fontId } : null
}

/** 서버에서 이름을 바꾼 뒤 부른다. 머리 · 추출 창 이름이 따라간다. */
export function renamedAccountFont(name: string): void {
  if (session) session.name = name
  useUIStore.setState({ currentProjectName: name })
}

/** 지금 연 계정 폰트를 서버가 마지막으로 받은 때(ISO). 게이트가 꺼졌거나 아직 안 올렸으면 null. 폰트 탭이 쓴다. */
export function accountFontUpdatedAt(): string | null {
  return session?.updatedAt ?? null
}

function opened(me: string, fontId: string, name: string, updatedAt: string | null): AccountStartResult {
  session = { me, fontId, name, updatedAt }
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
      // 한도에 걸렸으면(다른 기기에서 먼저 만들었을 때) 최근 폰트를 다시 고른다.
      writeStamp(localStorage, { owner: me, fontId: null, pending: false })
      return created.limit ? { ok: false, reason: 'home' } : { ok: false, reason: 'network', message: created.message }
    }
    return opened(me, created.value.id, name, created.value.updatedAt)
  }

  const fontId = stamp.fontId!
  const fetched = await fetchFont(fontId)
  if (!fetched.ok) return { ok: false, reason: 'network', message: fetched.message }
  if (!fetched.value) {
    // 다른 기기에서 지웠다. 사본은 버리고 최근 폰트를 다시 고른다.
    writeStamp(localStorage, { owner: me, fontId: null, pending: false })
    return { ok: false, reason: 'home' }
  }
  let updatedAt = fetched.value.updatedAt
  if (openPlanOf(stamp, me, fontId, me === LOCAL_OWNER) === 'push-local') {
    const saved = await saveFont(fontId, collectAccountFontData())
    if (!saved.ok) return { ok: false, reason: 'network', message: saved.message }
    updatedAt = saved.value
  } else {
    const applied = applyAccountFontData(fetched.value.fontData)
    if (!applied.ok) return { ok: false, reason: 'invalid-font', message: applied.message }
  }
  return opened(me, fontId, fetched.value.name, updatedAt)
}

/**
 * 대시보드에서 다른 폰트로 가기 전에, 지금 사본에 못 올린 변경이 있으면 올린다.
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
  if (!session || suspended) return
  revision += 1
  writeStamp(localStorage, { owner: session.me, fontId: session.fontId, pending: true })
  schedule(SERVER_SAVE_IDLE_MS)
}

/** 못 올린 변경이 있으면 지금 올린다. 탭을 벗어날 때 · 다른 폰트로 갈 때 · 로그아웃 전에 부른다. 다 올라갔으면 true. */
export async function flushAccountFont(): Promise<boolean> {
  if (!session || suspended) return true
  if (timer) { clearTimeout(timer); timer = null }
  if (inFlight) await inFlight
  if (revision === savedRevision) return true
  // 충돌은 사용자가 고를 때까지 올리지 않는다(아무 쪽도 잃지 않게).
  if (useAccountSaveStore.getState().status === 'conflict') return false
  const target = revision
  const current = session
  let ok = false
  inFlight = (async () => {
    useAccountSaveStore.setState({ status: 'saving' })
    const result = await saveFont(current.fontId, collectAccountFontData(), current.updatedAt)
    if (result.ok) {
      savedRevision = target
      current.updatedAt = result.value
      if (revision === target) writeStamp(localStorage, { owner: current.me, fontId: current.fontId, pending: false })
      useAccountSaveStore.setState({ status: 'saved' })
      ok = true
    } else if (result.conflict) {
      useAccountSaveStore.setState({ status: 'conflict' })
      showConflictNotice()
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
  return session !== null && !suspended && (revision !== savedRevision || inFlight !== null)
}

/** `그걸 불러오기` 전에 내 것을 남기는 칸(최신 하나만). 되살리기는 아직 없다. */
export const CONFLICT_BACKUP_KEY = 'font-maker-conflict-backup-v1'

function showConflictNotice(): void {
  showAppNotice('conflict', {
    tone: 'error',
    message: '다른 기기에서 이 폰트를 먼저 고쳤어요.',
    actions: [
      { label: '그걸 불러오기', run: () => resolveAccountConflict('theirs') },
      { label: '내 것으로 덮기', run: () => void resolveAccountConflict('mine') },
    ],
  })
}

/**
 * 충돌 풀기. `theirs`: 내 것을 백업 칸에 남기고 서버 값으로 다시 연다(새로 불러오기).
 * `mine`: 조건 없이 한 번 덮고, 그다음부터 다시 조건 저장.
 */
export async function resolveAccountConflict(choice: 'theirs' | 'mine'): Promise<void> {
  if (!session) return
  clearAppNotice('conflict')
  if (choice === 'theirs') {
    try {
      localStorage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), fontId: session.fontId, fontData: collectAccountFontData() }))
    } catch { /* 백업 칸을 못 쓰면 그래도 서버 값을 연다 — 사용자가 고른 쪽 */ }
    writeStamp(localStorage, { owner: session.me, fontId: session.fontId, pending: false })
    suspended = true
    if (timer) { clearTimeout(timer); timer = null }
    window.location.reload()
    return
  }
  session.updatedAt = null
  useAccountSaveStore.setState({ status: 'idle' })
  await flushAccountFont()
}

/** 다른 탭이 편집을 가져갔다. 올리던 것은 끝까지 두고, 더는 올리지 않는다. 못 올린 건 사본 이름표(`pending`)로 새 탭이 올린다. */
export function suspendAccountFont(): void {
  suspended = true
  if (timer) { clearTimeout(timer); timer = null }
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
  suspended = false
  revision = 0
  savedRevision = 0
  inFlight = null
  if (timer) clearTimeout(timer)
  timer = null
  useAccountSaveStore.setState({ status: 'idle' })
}

registerWorkGuard({
  flush: flushAccountFont,
  collect: collectAccountFontData,
  name: () => accountFontName() ?? useUIStore.getState().currentProjectName ?? null,
  suspend: suspendAccountFont,
})
