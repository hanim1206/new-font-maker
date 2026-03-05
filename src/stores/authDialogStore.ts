/**
 * 인증 다이얼로그 상태 관리
 *
 * plain Zustand (Immer/persist 없음) — pendingAction에 함수를 저장하므로
 * Immer의 drafting이나 persist의 직렬화를 사용할 수 없다.
 */
import { create } from 'zustand'

interface AuthDialogState {
  open: boolean
  pendingAction: (() => void) | null
  contextMessage: string | null
}

interface AuthDialogActions {
  openWithAction: (action: (() => void) | null, message?: string) => void
  close: () => void
  consumeAndClose: () => void
}

export const useAuthDialogStore = create<AuthDialogState & AuthDialogActions>(
  (set, get) => ({
    open: false,
    pendingAction: null,
    contextMessage: null,

    openWithAction: (action, message) =>
      set({ open: true, pendingAction: action, contextMessage: message ?? null }),

    close: () =>
      set({ open: false, pendingAction: null, contextMessage: null }),

    consumeAndClose: () => {
      const action = get().pendingAction
      set({ open: false, pendingAction: null, contextMessage: null })
      action?.()
    },
  })
)
