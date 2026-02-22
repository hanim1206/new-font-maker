import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
}

interface AuthActions {
  // 초기화: onAuthStateChange 리스너 등록
  initialize: () => () => void
  // 이메일/비밀번호 회원가입
  signUp: (email: string, password: string) => Promise<boolean>
  // 이메일/비밀번호 로그인
  signIn: (email: string, password: string) => Promise<boolean>
  // 로그아웃
  signOut: () => Promise<void>
  // 에러 클리어
  clearError: () => void
}

/** 로그인 여부 확인 (컴포넌트 외부에서도 사용 가능) */
export function isLoggedIn(): boolean {
  return useAuthStore.getState().user !== null
}

export const useAuthStore = create<AuthState & AuthActions>()(
  immer((set) => ({
    user: null,
    session: null,
    loading: true,
    error: null,

    initialize: () => {
      // 현재 세션 확인
      supabase.auth.getSession().then(({ data: { session } }) => {
        set((state) => {
          state.session = session as Session | null
          state.user = session?.user as User | null ?? null
          state.loading = false
        })
      })

      // 인증 상태 변경 리스너
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          set((state) => {
            state.session = session as Session | null
            state.user = session?.user as User | null ?? null
            state.loading = false
          })
        }
      )

      return () => subscription.unsubscribe()
    },

    signUp: async (email, password) => {
      set((state) => { state.loading = true; state.error = null })
      const { error } = await supabase.auth.signUp({ email, password })
      set((state) => {
        state.loading = false
        if (error) state.error = error.message
      })
      return !error
    },

    signIn: async (email, password) => {
      set((state) => { state.loading = true; state.error = null })
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      set((state) => {
        state.loading = false
        if (error) state.error = error.message
      })
      return !error
    },

    signOut: async () => {
      set((state) => { state.loading = true; state.error = null })
      const { error } = await supabase.auth.signOut()
      set((state) => {
        state.loading = false
        if (error) state.error = error.message
      })
    },

    clearError: () => set((state) => { state.error = null }),
  }))
)
