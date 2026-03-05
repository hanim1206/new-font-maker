/**
 * 전역 인증 다이얼로그
 *
 * authDialogStore로 제어. 비로그인 사용자가 인증 필요 기능을 시도하면
 * 자동으로 열리고, 로그인 성공 후 원래 액션을 이어서 실행한다.
 * onAuthStateChange에 의한 user 전환을 effect로 감지하여 race condition 방지.
 */
import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { AuthForm } from './AuthForm'
import { useAuthStore } from '../stores/authStore'
import { useAuthDialogStore } from '../stores/authDialogStore'

export function AuthDialog() {
  const open = useAuthDialogStore((s) => s.open)
  const contextMessage = useAuthDialogStore((s) => s.contextMessage)
  const consumeAndClose = useAuthDialogStore((s) => s.consumeAndClose)
  const close = useAuthDialogStore((s) => s.close)

  const user = useAuthStore((s) => s.user)
  const prevUserRef = useRef(user)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')

  // user null → non-null 전환 감지 → pendingAction 실행
  useEffect(() => {
    if (prevUserRef.current === null && user !== null && open) {
      consumeAndClose()
    }
    prevUserRef.current = user
  }, [user, open, consumeAndClose])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{authMode === 'login' ? '로그인' : '회원가입'}</DialogTitle>
          {contextMessage && (
            <DialogDescription>{contextMessage}</DialogDescription>
          )}
        </DialogHeader>
        <AuthForm
          onLoginSuccess={() => {/* onAuthStateChange effect에서 처리 */}}
          onModeChange={setAuthMode}
        />
      </DialogContent>
    </Dialog>
  )
}
