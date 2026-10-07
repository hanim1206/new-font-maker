import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./betaAuth', () => ({ storageMode: () => 'local' }))
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))

import { agreeTerms, fetchProfile, hasAgreed, withdraw } from './profileApi'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => map.clear(),
  }
}

describe('프로필(이 기기)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))

  it('처음엔 한도 3, 동의 · 탈퇴 없음', async () => {
    const got = await fetchProfile('local')
    expect(got.ok && got.value).toMatchObject({ id: 'local', fontLimit: 3, termsVersion: null, licenseId: null, withdrawnAt: null })
  })

  it('동의하면 버전 · 라이선스 · 시각이 남고, 버전이 바뀌면 다시 받는다', async () => {
    const agreed = await agreeTerms('local', '2026-10-09', 'ofl-1.1')
    expect(agreed.ok && agreed.value.agreedAt).toBeTruthy()
    const profile = (await fetchProfile('local')) as { ok: true; value: Parameters<typeof hasAgreed>[0] }
    expect(hasAgreed(profile.value, '2026-10-09', 'ofl-1.1')).toBe(true)
    expect(hasAgreed(profile.value, '2026-11-01', 'ofl-1.1')).toBe(false)
    expect(hasAgreed(profile.value, '2026-10-09', 'cc0')).toBe(false)
    expect(hasAgreed(null, '2026-10-09', 'ofl-1.1')).toBe(false)
  })

  it('탈퇴하면 날짜가 남는다', async () => {
    const done = await withdraw('local')
    expect(done.ok && done.value.withdrawnAt).toBeTruthy()
  })
})
