import { describe, expect, it } from 'vitest'
import { countByStatus, isSent, isUnsent, matchesQuery, visibleAccounts } from './accountFilter'
import type { Account } from './useBetaInvites'

const invite = { nickname: '가', code: 'ABCD-EFGH', link: 'https://x', message: 'm' }
const account = (email: string, patch: Partial<Account> = {}): Account => ({
  nickname: email, email, createdAt: '2026-09-28T00:00:00Z', lastSignInAt: null, invite, suspended: false, memo: '', sentAt: null, ...patch,
})

describe('계정 거르기', () => {
  const sent = account('sent', { sentAt: '2026-09-28T01:00:00Z' })
  const unsent = account('unsent')
  const noCode = account('no-code', { invite: undefined })
  const stopped = account('stopped', { suspended: true })
  const all = [sent, stopped, unsent, noCode]

  it('안 보냄 = 사용 중 · 코드 있음 · 보냄 체크 없음', () => {
    expect([sent, unsent, noCode, stopped].map(isUnsent)).toEqual([false, true, false, false])
    expect(visibleAccounts(all, 'unsent').map((item) => item.email)).toEqual(['unsent'])
  })

  it('전체는 사용 중 먼저, 정지는 뒤', () => {
    expect(visibleAccounts([stopped, sent, unsent], 'all').map((item) => item.email)).toEqual(['sent', 'unsent', 'stopped'])
  })

  it('보냄 = 사용 중 · 보냄 체크 있음. 정지는 체크가 있어도 정지 탭', () => {
    const stoppedSent = account('stopped-sent', { suspended: true, sentAt: '2026-09-28T01:00:00Z' })
    expect([sent, unsent, noCode, stopped, stoppedSent].map(isSent)).toEqual([true, false, false, false, false])
    expect(visibleAccounts([...all, stoppedSent], 'sent').map((item) => item.email)).toEqual(['sent'])
  })

  it('코드 모르는 계정은 보냄 · 안 보냄 어디에도 없고 전체에만', () => {
    expect(visibleAccounts(all, 'sent').map((item) => item.email)).not.toContain('no-code')
    expect(visibleAccounts(all, 'unsent').map((item) => item.email)).not.toContain('no-code')
    expect(visibleAccounts(all, 'all').map((item) => item.email)).toContain('no-code')
  })

  it('정지 탭', () => {
    expect(visibleAccounts(all, 'suspended').map((item) => item.email)).toEqual(['stopped'])
  })

  it('탭 숫자는 검색어를 따른다', () => {
    expect(countByStatus(all)).toEqual({ all: 4, sent: 1, unsent: 1, suspended: 1 })
    expect(countByStatus(all, 'stop')).toEqual({ all: 1, sent: 0, unsent: 0, suspended: 1 })
  })
})

describe('계정 검색', () => {
  const friend = account('abcd@beta.example', { nickname: '민지', memo: '회사 동료 · 아이폰' })

  it('닉네임 · 메모 · 이메일 · 코드에서 찾는다', () => {
    expect(matchesQuery(friend, '민지')).toBe(true)
    expect(matchesQuery(friend, '아이폰')).toBe(true)
    expect(matchesQuery(friend, 'abcd@')).toBe(true)
    expect(matchesQuery(friend, 'abcd-efgh')).toBe(true)
    expect(matchesQuery(friend, 'abcdefgh')).toBe(true)
  })

  it('띄어 쓴 말은 모두 들어 있어야 한다', () => {
    expect(matchesQuery(friend, '민지 동료')).toBe(true)
    expect(matchesQuery(friend, '민지 안드로이드')).toBe(false)
  })
})
