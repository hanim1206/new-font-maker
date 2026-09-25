/**
 * 계정 저장의 규칙 부분(플랜 `docs/plans/2026-09-25_계정-저장.md`). 스토어를 가져오지 않는다 —
 * 스토어는 가져오는 순간 localStorage를 읽으므로, 남의 사본을 지우는 일은 그보다 먼저 여기서 끝낸다.
 *
 * 폰트는 서버(계정)가 원본이고 브라우저에는 사본을 둔다. 사본에는 이름표(`owner`)와
 * 아직 서버에 못 올린 변경이 있는지(`pending`)를 적는다.
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

export interface LocalStamp {
  /** 이 사본의 주인 계정 id. 로그인 없이 만든 사본이면 null. */
  owner: string | null
  /** 서버에 아직 못 올린 변경이 있다. */
  pending: boolean
}

const EMPTY_STAMP: LocalStamp = { owner: null, pending: false }

export function readStamp(storage: Storage): LocalStamp {
  try {
    const value = JSON.parse(storage.getItem(LOCAL_STAMP_KEY) ?? 'null') as Partial<LocalStamp> | null
    if (!value || typeof value !== 'object') return EMPTY_STAMP
    return { owner: typeof value.owner === 'string' ? value.owner : null, pending: value.pending === true }
  } catch {
    return EMPTY_STAMP
  }
}

export function writeStamp(storage: Storage, stamp: LocalStamp): void {
  storage.setItem(LOCAL_STAMP_KEY, JSON.stringify(stamp))
}

/** 브라우저 사본을 지운다. 로그아웃, 또는 남의 사본을 만났을 때. */
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
 * 들어올 때 무엇을 할지. `dropForeignCopy` 뒤라 사본은 주인이 없거나 나다.
 * - `use-server`: 계정에 폰트가 있으면 서버가 이긴다.
 * - `push-local`: 단, 내 사본에 못 올린 변경이 남아 있으면(끊긴 채 닫았을 때) 사본을 올린다.
 * - `create-from-local`: 계정이 비었으면 지금 사본(없으면 기본값)으로 만든다.
 */
export type StartPlan = 'use-server' | 'push-local' | 'create-from-local'

export function startPlanOf(input: { hasServerFont: boolean; stamp: LocalStamp; me: string }): StartPlan {
  if (!input.hasServerFont) return 'create-from-local'
  return input.stamp.owner === input.me && input.stamp.pending ? 'push-local' : 'use-server'
}
