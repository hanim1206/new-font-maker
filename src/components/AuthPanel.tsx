/**
 * 이메일/비밀번호 로그인·회원가입 패널
 *
 * Popover 내부 콘텐츠로 렌더링
 */
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '../stores/authStore'

interface AuthPanelProps {
  onClose: () => void
}

export function AuthPanel({ onClose }: AuthPanelProps) {
  const { user, loading, error, signIn, signUp, signOut, clearError } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  // 모드 변경 시 상태 초기화
  useEffect(() => {
    setEmail('')
    setPassword('')
    setSignUpSuccess(false)
    clearError()
  }, [mode, clearError])

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

  // 로그인 상태
  if (user) {
    return (
      <div className="w-[300px] p-4">
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
    )
  }

  // 비로그인: 로그인/회원가입
  return (
    <div className="w-[300px] p-4">
      {/* 탭 전환 */}
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as 'login' | 'signup')}
        className="mb-4"
      >
        <TabsList className="w-full">
          <TabsTrigger value="login" className="flex-1">로그인</TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">회원가입</TabsTrigger>
        </TabsList>
      </Tabs>

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
  )
}
