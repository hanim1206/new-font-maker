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

/**
 * 로그인을 언제 받나(플랜 `2026-10-06_카카오-로그인-다운로드-게이트.md`).
 * - `entry`: 들어올 때(베타 그대로). 기본값.
 * - `download`: 받을 때. 로그인 전엔 손님으로 이 기기 사본을 바로 연다. 값은 배포(Vercel) 환경 변수로 바꾼다.
 */
export type LoginAt = 'entry' | 'download'

export function loginAtOf(env: { VITE_LOGIN_AT?: string }): LoginAt {
  return env.VITE_LOGIN_AT === 'download' ? 'download' : 'entry'
}

export function loginAt(): LoginAt {
  return loginAtOf({ VITE_LOGIN_AT: import.meta.env.VITE_LOGIN_AT })
}

/** 손님 — 게이트는 켜졌지만(`download`) 아직 로그인 안 한 사람. `main.tsx` 게이트가 한 번 정한다. */
let guest = false
export function enterGuest(): void { guest = true }
export function isGuest(): boolean { return guest }

/**
 * 폰트 · 의견이 어디 사는지. 게이트가 꺼졌거나 손님이면 이 기기(localStorage), 아니면 계정(Supabase).
 * `font_projects` · `feedback_messages` 호출은 전부 이 하나를 본다.
 */
export type StorageMode = 'local' | 'account'
export function storageMode(): StorageMode {
  return authGateMode() === 'off' || guest ? 'local' : 'account'
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

/** 로그인한 계정 id와 이름(`nicknameOf`), 가입 때(계정 페이지). */
export async function sessionUser(): Promise<{ id: string; nickname: string | null; createdAt: string | null } | null> {
  const { data } = await (await client()).auth.getSession()
  const user = data.session?.user
  if (!user) return null
  return { id: user.id, nickname: nicknameOf(user.user_metadata), createdAt: user.created_at ?? null }
}

/** 베타 계정은 발급할 때 적은 친구 아이디(`nickname`), 카카오 계정은 카카오 프로필 이름(`name` · `preferred_username`). */
export function nicknameOf(metadata: Record<string, unknown> | null | undefined): string | null {
  for (const key of ['nickname', 'name', 'preferred_username']) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * 카카오에서 돌아온 주소에 실패가 실려 있으면(`#error=…&error_description=…`) 그 설명. 성공이면 null.
 * Supabase가 콜백에서 막히면(이메일 못 받음 등) 세션 없이 이 조각만 달아 보낸다 — 조용히 손님으로 열면 왜 안 됐는지 모른다.
 */
export function signInErrorOf(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.get('error') && !params.get('error_code')) return null
  return params.get('error_description')?.replace(/\+/g, ' ') || params.get('error') || '로그인하지 못했어요.'
}

/**
 * 카카오로 로그인. Supabase 콜백을 거쳐 `returnTo`(이 앱 주소)로 돌아온다 — 카카오 콘솔엔 Supabase 콜백만, 앱 주소는 Supabase URL 설정에 둔다.
 * 돌아오면 `sessionUser()`가 주소 조각(`#access_token`)에서 세션을 읽는다.
 */
export async function signInWithKakao(returnTo = '/dashboard'): Promise<BetaSignInResult> {
  try {
    const { error } = await (await client()).auth.signInWithOAuth({
      provider: 'kakao',
      // 카카오 콘솔 동의항목과 같아야 한다(안 켠 항목을 요청하면 KOE205). 닉네임 필수 · 이메일 선택, 프로필 사진은 안 쓴다.
      options: { redirectTo: new URL(returnTo, window.location.origin).toString(), scopes: 'profile_nickname account_email' },
    })
    return error ? signInFailureOf(error) : { ok: true }
  } catch {
    return { ok: false, reason: 'network' }
  }
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
  const { clearSignedOutCopy, writeStamp } = await import('./accountFont')
  await (await client()).auth.signOut()
  clearSignedOutCopy(window.localStorage)
  // 이름표는 남긴다. 새로고침 직전에 늦게 써진 스토어 값이 있어도 주인 없는 사본이 되지 않아, 다음 사람 계정으로 올라가지 않는다.
  if (me) writeStamp(window.localStorage, { owner: me, fontId: null, pending: false })
  window.location.reload()
}

/**
 * 탈퇴. 날짜를 적고(`withdraw`) 로그아웃한 뒤 새로 불러온다. 저장 안 한 변경은 올리지 않는다 — 탈퇴한 사람의 폰트는 RLS가 막는다.
 * 30일 안에 복구를 원하면 hangulkangul@gmail.com으로(탈퇴 화면 안내).
 */
export async function withdrawAndReload(): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await sessionUserId()
  if (!me) return { ok: false, message: 'not-signed-in' }
  const { withdraw } = await import('./profileApi')
  const done = await withdraw(me)
  if (!done.ok) return done
  const { clearSignedOutCopy } = await import('./accountFont')
  await (await client()).auth.signOut()
  clearSignedOutCopy(window.localStorage)
  try { window.sessionStorage.setItem(WITHDRAWN_FLAG, '1') } catch { /* 안내 없이 로그인 화면 */ }
  window.location.reload()
  return { ok: true }
}

/** 탈퇴 직후 새로 불러온 첫 화면에서 안내를 띄우는 표시. 읽으면 지운다. */
export const WITHDRAWN_FLAG = 'font-maker-withdrawn'
export function takeWithdrawnFlag(): boolean {
  try {
    const had = window.sessionStorage.getItem(WITHDRAWN_FLAG) === '1'
    window.sessionStorage.removeItem(WITHDRAWN_FLAG)
    return had
  } catch { return false }
}
