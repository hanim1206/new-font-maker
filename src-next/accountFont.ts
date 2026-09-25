/**
 * 계정 저장의 규칙 부분(플랜 `docs/plans/2026-09-25_계정-저장.md`). 스토어를 가져오지 않는다 —
 * 스토어는 가져오는 순간 localStorage를 읽으므로, 남의 사본을 지우는 일은 그보다 먼저 여기서 끝낸다.
 *
 * 폰트는 서버(계정)가 원본이고 브라우저에는 지금 연 폰트 하나의 사본을 둔다. 사본에는 이름표를 붙인다:
 * 누구의(`owner`) 어느 폰트인지(`fontId`), 아직 서버에 못 올린 변경이 있는지(`pending`).
 */

/** 폰트를 이루는 브라우저 저장 키. 스토어 이름과 같아야 한다(가져오면 hydrate되므로 문자열로 둔다). */
export const LOCAL_FONT_KEYS = [
  'font-maker-jamo-data',
  'font-maker-layout-schemas',
  'font-maker-global-style',
  'font-maker-shape-system-v1',
  'noto-layout-delta-v1',
  // 되돌리기 기록도 그 폰트 것이라 주인이 바뀌면 같이 지운다.
  'font-maker-editor-v2-history',
] as const

export const LOCAL_STAMP_KEY = 'font-maker-account-owner-v1'

/** 계정당 지우지 않은 폰트 수 한도. DB 트리거(`limit_font_projects_per_user`)와 같은 숫자. */
export const FONT_LIMIT = 3

export interface LocalStamp {
  /** 이 사본의 주인 계정 id. 로그인 없이 만든 사본이면 null. */
  owner: string | null
  /** 이 사본이 어느 폰트인지. 아직 고르지 않았으면 null. */
  fontId: string | null
  /** 서버에 아직 못 올린 변경이 있다. */
  pending: boolean
  /** 편집 화면을 열 때 이 이름으로 새 폰트를 만든다(메인 화면의 `새 폰트 만들기`). */
  create?: string
}

const EMPTY_STAMP: LocalStamp = { owner: null, fontId: null, pending: false }

export function readStamp(storage: Storage): LocalStamp {
  try {
    const value = JSON.parse(storage.getItem(LOCAL_STAMP_KEY) ?? 'null') as Partial<LocalStamp> | null
    if (!value || typeof value !== 'object') return EMPTY_STAMP
    const stamp: LocalStamp = {
      owner: typeof value.owner === 'string' ? value.owner : null,
      fontId: typeof value.fontId === 'string' ? value.fontId : null,
      pending: value.pending === true,
    }
    if (typeof value.create === 'string' && value.create.trim()) stamp.create = value.create.trim()
    return stamp
  } catch {
    return EMPTY_STAMP
  }
}

export function writeStamp(storage: Storage, stamp: LocalStamp): void {
  storage.setItem(LOCAL_STAMP_KEY, JSON.stringify(stamp))
}

export function hasLocalFont(storage: Storage): boolean {
  return LOCAL_FONT_KEYS.some((key) => storage.getItem(key) !== null)
}

/** 브라우저 사본을 지운다. 이름표도 지우므로, 필요하면 부른 쪽이 새 이름표를 쓴다. */
export function clearLocalFont(storage: Storage): void {
  for (const key of LOCAL_FONT_KEYS) storage.removeItem(key)
  storage.removeItem(LOCAL_STAMP_KEY)
}

/** 남의 이름표가 붙은 사본이면 지운다. 지웠으면 true. 스토어를 가져오기 전에 부른다. */
export function dropForeignCopy(storage: Storage, me: string): boolean {
  const { owner } = readStamp(storage)
  if (owner === null || owner === me) return false
  clearLocalFont(storage)
  return true
}

/**
 * 편집 화면을 열 때 무엇을 할지. `dropForeignCopy` 뒤라 사본은 주인이 없거나 나다.
 * - `home`: 아직 고른 폰트가 없다 → 메인 화면으로.
 * - `create`: 메인 화면에서 `새 폰트 만들기`를 눌렀다 → 지금 사본(비웠으면 기본값)으로 만든다.
 * - `open`: 이름표의 폰트를 연다.
 */
export type EditorPlan = 'home' | 'create' | 'open'

export function editorPlanOf(stamp: LocalStamp, me: string): EditorPlan {
  if (stamp.owner !== me) return 'home'
  if (stamp.create) return 'create'
  return stamp.fontId ? 'open' : 'home'
}

/** 연 폰트에서 서버 값과 사본 중 무엇을 쓸지. 서버가 이기고, 이 폰트의 사본에 못 올린 변경이 있을 때만 사본을 올린다. */
export function openPlanOf(stamp: LocalStamp, me: string, fontId: string): 'use-server' | 'push-local' {
  return stamp.owner === me && stamp.fontId === fontId && stamp.pending ? 'push-local' : 'use-server'
}

/**
 * 새 폰트 이름. 발급할 때 적은 친구 아이디(`user_metadata.nickname`)로, 겹치면 `test1 2` · `test1 3`.
 * 아이디가 없으면 `My Font`.
 */
export function nextFontName(nickname: string | null | undefined, taken: readonly string[]): string {
  const base = nickname?.trim() || 'My Font'
  const used = new Set(taken.map((name) => name.trim()))
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) if (!used.has(`${base} ${n}`)) return `${base} ${n}`
}

/** 메인 화면에서 폰트를 새로 만들 때 지금 사본을 그 폰트로 쓸지. 로그인 전에 만든 작업이 있고 계정이 비었을 때만. */
export function keepsLocalForNewFont(stamp: LocalStamp, liveFontCount: number, hasLocal: boolean): boolean {
  return stamp.owner === null && liveFontCount === 0 && hasLocal
}

/** 마지막 고친 날. 오늘 · 어제 · N일 전 · M월 D일. */
export function editedDayText(updatedAt: string, now = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const then = new Date(updatedAt)
  const days = Math.round((day(now) - day(then)) / 86_400_000)
  if (days <= 0) return '오늘 고침'
  if (days === 1) return '어제 고침'
  if (days < 7) return `${days}일 전 고침`
  return `${then.getMonth() + 1}월 ${then.getDate()}일 고침`
}
