/**
 * 이메일/비밀번호 로그인·회원가입 패널
 *
 * 상단 바에서 토글되는 드롭다운 형태 (ProjectManager와 동일 패턴)
 */
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '../stores/authStore'

interface AuthPanelProps {
  open: boolean
  onClose: () => void
}

export function AuthPanel({ open, onClose }: AuthPanelProps) {
  const { user, loading, error, signIn, signUp, signOut, clearError } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 감지
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  // 패널 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setEmail('')
      setPassword('')
      setSignUpSuccess(false)
      clearError()
    }
  }, [open, clearError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    if (mode === 'signup') {
      const success = await signUp(email, password)
      if (success) setSignUpSuccess(true)
    } else {
      const success = await signIn(email, password)
      if (success) onClose()
    }
  }

  const handleSignOut = async () => {
    await signOut()
    onClose()
  }

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-1 w-[320px] bg-surface-2 border border-border rounded-lg shadow-lg z-50 overflow-hidden"
    >
      {/* 로그인 상태: 유저 정보 + 로그아웃 */}
      {user ? (
        <div className="p-4">
          <div className="text-sm text-muted mb-1">로그인됨</div>
          <div className="text-sm font-medium text-foreground mb-3 truncate">
            {user.email}
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={handleSignOut}
            disabled={loading}
            className="w-full"
          >
            로그아웃
          </Button>
        </div>
      ) : (
        /* 비로그인: 로그인/회원가입 */
        <div className="p-4">
          {/* 탭 전환 */}
          <div className="flex gap-1 mb-4">
            <button
              className={`flex-1 py-1.5 text-sm font-medium rounded cursor-pointer transition-colors ${
                mode === 'login'
                  ? 'bg-primary text-white'
                  : 'bg-surface-3 text-muted hover:text-foreground'
              }`}
              onClick={() => { setMode('login'); clearError(); setSignUpSuccess(false) }}
            >
              로그인
            </button>
            <button
              className={`flex-1 py-1.5 text-sm font-medium rounded cursor-pointer transition-colors ${
                mode === 'signup'
                  ? 'bg-primary text-white'
                  : 'bg-surface-3 text-muted hover:text-foreground'
              }`}
              onClick={() => { setMode('signup'); clearError(); setSignUpSuccess(false) }}
            >
              회원가입
            </button>
          </div>

          {/* 회원가입 성공 메시지 */}
          {signUpSuccess && (
            <div className="px-3 py-2 mb-3 bg-green-900/30 border border-green-800/50 rounded text-xs text-green-400">
              가입 완료! 인증 이메일을 확인한 후 로그인해주세요.
            </div>
          )}

          {/* 에러 표시 */}
          {error && (
            <div className="px-3 py-2 mb-3 bg-red-900/30 border border-red-800/50 rounded">
              <div className="flex items-center justify-between">
                <span className="text-xs text-red-400">{error}</span>
                <button
                  className="text-xs text-red-400 hover:text-red-300 cursor-pointer ml-2"
                  onClick={clearError}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* 폼 */}
          {!signUpSuccess && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일"
                required
                className="text-sm"
                autoFocus
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                minLength={6}
                required
                className="text-sm"
              />
              <Button
                type="submit"
                size="sm"
                variant="default"
                disabled={loading}
                className="w-full"
              >
                {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
