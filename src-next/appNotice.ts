import { create } from 'zustand'

/**
 * 화면 아래 한 줄 알림(`AppNotice`)의 자리 하나. 종류마다 한 칸, 한 번에 하나만 보인다(`NOTICE_ORDER` 앞이 먼저).
 * 새 알림이 필요하면 종류만 늘린다. 저장 실패 토스트(`SaveToast`)와는 따로다 — 이건 앱 전체(내 폰트 · 로그인 화면 포함)에 뜬다.
 */

/** `font-list`: 대시보드에서 폰트 바꾸기 · 만들기 · 이름 · 지우기가 실패했다. */
export type AppNoticeKind = 'conflict' | 'local-copy' | 'font-list' | 'update'

/** 앞이 먼저 보인다. 작업을 잃을 수 있는 것부터. */
export const NOTICE_ORDER: readonly AppNoticeKind[] = ['conflict', 'local-copy', 'font-list', 'update']

export interface AppNoticeAction {
  label: string
  run: () => void
}

export interface AppNotice {
  message: string
  tone: 'info' | 'error'
  actions?: readonly AppNoticeAction[]
  /** 닫기 단추. 없으면 고를 때까지 남는다(충돌처럼). */
  dismissable?: boolean
}

interface AppNoticeState {
  notices: Partial<Record<AppNoticeKind, AppNotice>>
  /** 이 탭에서 닫은 종류. `once`로 띄운 알림은 다시 안 뜬다. */
  dismissed: Partial<Record<AppNoticeKind, true>>
}

export const useAppNoticeStore = create<AppNoticeState>(() => ({ notices: {}, dismissed: {} }))

/** `once`면 이 탭에서 한 번 닫은 종류는 다시 띄우지 않는다. */
export function showAppNotice(kind: AppNoticeKind, notice: AppNotice, options: { once?: boolean } = {}): void {
  const state = useAppNoticeStore.getState()
  if (options.once && state.dismissed[kind]) return
  useAppNoticeStore.setState({ notices: { ...state.notices, [kind]: notice } })
}

/** 사용자가 닫았다. 다시 띄우지 않을 표시도 남긴다. */
export function dismissAppNotice(kind: AppNoticeKind): void {
  const { notices, dismissed } = useAppNoticeStore.getState()
  const next = { ...notices }
  delete next[kind]
  useAppNoticeStore.setState({ notices: next, dismissed: { ...dismissed, [kind]: true } })
}

/** 할 일을 마쳐 알림을 치운다(닫은 표시는 남기지 않는다). */
export function clearAppNotice(kind: AppNoticeKind): void {
  const { notices } = useAppNoticeStore.getState()
  if (!notices[kind]) return
  const next = { ...notices }
  delete next[kind]
  useAppNoticeStore.setState({ notices: next })
}

export function topAppNotice(state: Pick<AppNoticeState, 'notices'>): { kind: AppNoticeKind; notice: AppNotice } | null {
  for (const kind of NOTICE_ORDER) {
    const notice = state.notices[kind]
    if (notice) return { kind, notice }
  }
  return null
}

/** 테스트용. */
export function resetAppNoticeForTest(): void {
  useAppNoticeStore.setState({ notices: {}, dismissed: {} })
}
