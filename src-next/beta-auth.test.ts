import { describe, expect, it } from 'vitest'
import { authGateModeOf, loginAtOf, nicknameOf, signInErrorOf, signInFailureOf } from './betaAuth'

describe('베타 로그인 게이트', () => {
  const configured = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }

  it('Supabase 설정이 있으면 켜진다(개발 서버 포함)', () => {
    expect(authGateModeOf({ DEV: false, ...configured })).toBe('on')
    expect(authGateModeOf({ DEV: true, ...configured })).toBe('on')
  })

  it('VITE_AUTH_GATE=off면 꺼진다', () => {
    expect(authGateModeOf({ DEV: false, VITE_AUTH_GATE: 'off', ...configured })).toBe('off')
  })

  it('설정이 없으면 개발 서버는 열고, 배포 빌드는 막는다', () => {
    expect(authGateModeOf({ DEV: true })).toBe('off')
    expect(authGateModeOf({ DEV: false })).toBe('misconfigured')
    expect(authGateModeOf({ DEV: false, VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBe('misconfigured')
  })

  it('로그인 오류를 틀림 · 잠시 뒤 · 연결로 나눈다', () => {
    expect(signInFailureOf({ status: 400, code: 'invalid_credentials' })).toEqual({ ok: false, reason: 'wrong' })
    expect(signInFailureOf({ status: 429 })).toEqual({ ok: false, reason: 'busy' })
    expect(signInFailureOf({ status: 400, code: 'over_request_rate_limit' })).toEqual({ ok: false, reason: 'busy' })
    expect(signInFailureOf({ name: 'AuthRetryableFetchError', status: 0 })).toEqual({ ok: false, reason: 'network' })
    expect(signInFailureOf({ name: 'AuthRetryableFetchError', status: 502 })).toEqual({ ok: false, reason: 'network' })
  })

  it('로그인 시점은 download일 때만 받을 때, 나머지는 들어올 때', () => {
    expect(loginAtOf({})).toBe('entry')
    expect(loginAtOf({ VITE_LOGIN_AT: 'entry' })).toBe('entry')
    expect(loginAtOf({ VITE_LOGIN_AT: 'download' })).toBe('download')
    expect(loginAtOf({ VITE_LOGIN_AT: 'later' })).toBe('entry')
  })

  it('이름은 베타 아이디, 없으면 카카오 프로필 이름', () => {
    expect(nicknameOf({ nickname: 'test1', name: '민지' })).toBe('test1')
    expect(nicknameOf({ name: ' 민지 ' })).toBe('민지')
    expect(nicknameOf({ preferred_username: 'mj' })).toBe('mj')
    expect(nicknameOf({ nickname: '', name: '' })).toBeNull()
    expect(nicknameOf(undefined)).toBeNull()
  })

  it('돌아온 주소 조각에서 로그인 실패 설명을 읽는다', () => {
    expect(signInErrorOf('')).toBeNull()
    expect(signInErrorOf('#access_token=abc&refresh_token=def')).toBeNull()
    expect(signInErrorOf('#error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+email+from+external+provider'))
      .toBe('Error getting user email from external provider')
    expect(signInErrorOf('#error=access_denied')).toBe('access_denied')
  })
})
