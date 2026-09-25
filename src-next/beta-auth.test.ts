import { describe, expect, it } from 'vitest'
import { authGateModeOf, signInFailureOf } from './betaAuth'

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
})
