import { betaCredentialsOf, DEFAULT_BETA_EMAIL_DOMAIN } from './betaCode'

/**
 * 베타 로그인 게이트. 로그인 안 된 사람은 앱 대신 코드 입력 화면을 본다.
 *
 * - `on`: Supabase 설정이 있으면 켠다(개발 서버 포함).
 * - `off`: `VITE_AUTH_GATE=off`이거나, 개발 서버에 Supabase 설정이 없을 때. e2e도 이 값으로 돈다.
 * - `misconfigured`: 배포 빌드인데 Supabase 설정이 없을 때. 조용히 열어 두지 않고 막는다.
 *
 * Supabase 클라이언트는 게이트가 켜졌을 때만 불러온다.
 */

export type AuthGateMode = 'on' | 'off' | 'misconfigured'

interface AuthGateEnv {
  DEV: boolean
  VITE_AUTH_GATE?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export function authGateModeOf(env: AuthGateEnv): AuthGateMode {
  if (env.VITE_AUTH_GATE === 'off') return 'off'
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return 'on'
  return env.DEV ? 'off' : 'misconfigured'
}

export function authGateMode(): AuthGateMode {
  return authGateModeOf(import.meta.env)
}

export function betaEmailDomain(): string {
  return import.meta.env.VITE_BETA_EMAIL_DOMAIN || DEFAULT_BETA_EMAIL_DOMAIN
}

async function client() {
  return (await import('../src/lib/supabase')).supabase
}

export async function hasSession(): Promise<boolean> {
  const { data } = await (await client()).auth.getSession()
  return data.session !== null
}

export type BetaSignInResult = { ok: true } | { ok: false; reason: 'format' | 'wrong' | 'busy' | 'network' }

/** Supabase 오류를 화면 문구 네 갈래로 나눈다. */
export function signInFailureOf(error: { status?: number; code?: string; name?: string }): BetaSignInResult {
  if (error.status === 429 || error.code === 'over_request_rate_limit') return { ok: false, reason: 'busy' }
  if (error.name === 'AuthRetryableFetchError' || !error.status) return { ok: false, reason: 'network' }
  return { ok: false, reason: 'wrong' }
}

export async function signInWithBetaCode(code: string): Promise<BetaSignInResult> {
  const credentials = betaCredentialsOf(code, betaEmailDomain())
  if (!credentials) return { ok: false, reason: 'format' }
  try {
    const { error } = await (await client()).auth.signInWithPassword(credentials)
    return error ? signInFailureOf(error) : { ok: true }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/** 로그아웃하면 새로 불러와 코드 입력 화면으로 돌아간다. */
export async function signOutAndReload(): Promise<void> {
  await (await client()).auth.signOut()
  window.location.reload()
}
