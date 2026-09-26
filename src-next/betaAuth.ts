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

/** 로그인한 계정 id. 로그인 안 됐으면 null. */
export async function sessionUserId(): Promise<string | null> {
  return (await sessionUser())?.id ?? null
}

/** 로그인한 계정 id와 발급할 때 적은 친구 아이디(`user_metadata.nickname`), 가입 때(계정 페이지). */
export async function sessionUser(): Promise<{ id: string; nickname: string | null; createdAt: string | null } | null> {
  const { data } = await (await client()).auth.getSession()
  const user = data.session?.user
  if (!user) return null
  const nickname = user.user_metadata?.nickname
  return { id: user.id, nickname: typeof nickname === 'string' ? nickname : null, createdAt: user.created_at ?? null }
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

/**
 * 로그아웃하면 새로 불러와 코드 입력 화면으로 돌아간다.
 * 못 올린 변경을 먼저 올리고 브라우저 사본을 지운다(서버에 원본이 있다). 못 올렸으면 물어본다.
 */
export async function signOutAndReload(): Promise<void> {
  const me = await sessionUserId()
  const { flushAccountFont, uploadPendingCopy } = await import('./accountFontSync')
  // 편집 화면이면 지금 폰트를, 메인 화면이면 사본에 남은 변경을 올린다.
  const saved = await flushAccountFont() && (!me || await uploadPendingCopy(me))
  if (!saved && !window.confirm('아직 저장하지 못한 변경이 있어요. 로그아웃하면 이 변경은 사라져요. 그래도 로그아웃할까요?')) return
  const { clearLocalFont, writeStamp } = await import('./accountFont')
  await (await client()).auth.signOut()
  clearLocalFont(window.localStorage)
  // 이름표는 남긴다. 새로고침 직전에 늦게 써진 스토어 값이 있어도 주인 없는 사본이 되지 않아, 다음 사람 계정으로 올라가지 않는다.
  if (me) writeStamp(window.localStorage, { owner: me, fontId: null, pending: false })
  window.location.reload()
}
