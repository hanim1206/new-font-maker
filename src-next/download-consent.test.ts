import { describe, expect, it, vi } from 'vitest'

vi.mock('./betaAuth', () => ({ authGateMode: () => 'on', storageMode: () => 'local', sessionUserId: async () => null }))
vi.mock('./profileApi', () => ({ agreeTerms: vi.fn(), hasAgreed: () => false, loadProfile: async () => null, rememberProfile: vi.fn() }))

import { allChecked, NO_CHECKS, PENDING_KEY, PRESET_LICENSE, savePendingDownload, takePendingDownload, TERMS_VERSION, termsVersionOf } from './downloadConsent'
import { LEGAL_FIELDS } from './legal/legalInfo'

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

describe('다운로드 직전 동의', () => {
  it('약관 버전은 시행일을 날짜로 — legalInfo와 같이 움직인다', () => {
    expect(termsVersionOf('2026년 10월 9일')).toBe('2026-10-09')
    expect(termsVersionOf('2027년 1월 15일')).toBe('2027-01-15')
    expect(TERMS_VERSION).toBe(termsVersionOf(LEGAL_FIELDS.시행일))
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('필수 넷을 다 체크해야 한다', () => {
    expect(allChecked(NO_CHECKS)).toBe(false)
    expect(allChecked({ terms: true, age: true, public: true, license: false })).toBe(false)
    expect(allChecked({ terms: true, age: true, public: true, license: true })).toBe(true)
  })

  it('프리셋마다 라이선스 id가 있다', () => {
    expect(PRESET_LICENSE['basic-gothic'].id).toBe('ofl-1.1')
    expect(PRESET_LICENSE['basic-gothic-v2'].id).toBeTruthy()
  })

  it('카카오 갔다 올 동안 받던 폰트 이름을 남기고, 읽으면 지운다', () => {
    const storage = memoryStorage()
    expect(takePendingDownload(storage)).toBeNull()
    savePendingDownload(storage, { fontName: '민지체', version: '2026-10-09', license: 'ofl-1.1' })
    expect(takePendingDownload(storage)).toEqual({ fontName: '민지체', version: '2026-10-09', license: 'ofl-1.1' })
    expect(storage.getItem(PENDING_KEY)).toBeNull()
    storage.setItem(PENDING_KEY, '{"fontName": 3}')
    expect(takePendingDownload(storage)).toBeNull()
  })
})
