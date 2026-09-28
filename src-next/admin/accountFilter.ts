import type { Account } from './useBetaInvites'

/** 계정 표 거르기. `unsent`: 초대 메시지를 아직 안 보낸 사람 — 정지 안 됐고, 이 맥에 코드가 있고, 보냄 체크가 없다. */
export type AccountFilter = 'all' | 'unsent'

/** 코드를 모르는 계정은 보낼 메시지가 없어 빼고 센다(먼저 `새 코드`). */
export const isUnsent = (account: Account): boolean => !account.suspended && Boolean(account.invite) && !account.sentAt

/** 표에 보일 줄. 사용 중 먼저, 정지는 뒤. */
export function visibleAccounts(accounts: readonly Account[], filter: AccountFilter): Account[] {
  if (filter === 'unsent') return accounts.filter(isUnsent)
  return [...accounts.filter((account) => !account.suspended), ...accounts.filter((account) => account.suspended)]
}
