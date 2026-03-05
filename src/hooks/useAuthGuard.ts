/**
 * 인증이 필요한 액션을 감싸는 훅
 *
 * 로그인 상태면 즉시 실행, 비로그인이면 AuthDialog를 열고
 * 로그인 성공 후 원래 액션을 자동 실행한다.
 *
 * 주의: pendingAction 클로저는 안정적인 참조(Zustand setter 등)만 캡처해야 한다.
 * 컴포넌트 로컬 상태를 캡처하면 stale closure 문제가 발생할 수 있다.
 */
import { useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useAuthDialogStore } from '../stores/authDialogStore'

export function useAuthGuard() {
  const user = useAuthStore((s) => s.user)
  const openWithAction = useAuthDialogStore((s) => s.openWithAction)

  return useCallback(
    (action: () => void, contextMessage?: string) => {
      if (user) {
        action()
      } else {
        openWithAction(action, contextMessage)
      }
    },
    [user, openWithAction]
  )
}
