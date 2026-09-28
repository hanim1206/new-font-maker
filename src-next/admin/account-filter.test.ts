import { describe, expect, it } from 'vitest'
import { isUnsent, visibleAccounts } from './accountFilter'
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

  it('안 보냄 = 사용 중 · 코드 있음 · 보냄 체크 없음', () => {
    expect([sent, unsent, noCode, stopped].map(isUnsent)).toEqual([false, true, false, false])
    expect(visibleAccounts([sent, stopped, unsent, noCode], 'unsent').map((item) => item.email)).toEqual(['unsent'])
  })

  it('전체는 사용 중 먼저, 정지는 뒤', () => {
    expect(visibleAccounts([stopped, sent, unsent], 'all').map((item) => item.email)).toEqual(['sent', 'unsent', 'stopped'])
  })
})
