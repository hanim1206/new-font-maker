import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Supabase 환경변수가 유효하게 설정되어 있는지 여부 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn('Supabase 환경변수가 설정되지 않았습니다 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

// createClient는 빈 문자열을 거부하므로 플레이스홀더 사용
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)
