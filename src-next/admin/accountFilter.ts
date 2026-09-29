import type { PaginationState, SortingState } from '@tanstack/react-table'
import type { Account } from './useBetaInvites'

/**
 * 계정 표 상태 거르기. 보냄 · 안 보냄은 정지 안 된 계정만 센다.
 * `sent`: 보냄 체크가 있다. `unsent`: 이 맥에 코드가 있는데 보냄 체크가 없다. 코드를 모르는 계정은 둘 다 아니다(전체에만).
 */
export type AccountStatus = 'all' | 'sent' | 'unsent' | 'suspended'
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = { all: '전체', sent: '보냄', unsent: '안 보냄', suspended: '정지' }

/** 계정 표 보기 상태. 폰트 상세에 다녀와도 남게 `AdminApp`이 들고 있다. */
export interface AccountsView { status: AccountStatus; query: string; sorting: SortingState; pagination: PaginationState }
export const INITIAL_ACCOUNTS_VIEW: AccountsView = { status: 'all', query: '', sorting: [], pagination: { pageIndex: 0, pageSize: 10 } }

/** 코드를 모르는 계정은 보낼 메시지가 없어 빼고 센다(먼저 `새 코드`). */
export const isUnsent = (account: Account): boolean => !account.suspended && Boolean(account.invite) && !account.sentAt
export const isSent = (account: Account): boolean => !account.suspended && Boolean(account.sentAt)

export function matchesStatus(account: Account, status: AccountStatus): boolean {
  if (status === 'sent') return isSent(account)
  if (status === 'unsent') return isUnsent(account)
  if (status === 'suspended') return account.suspended
  return true
}

/** 검색어는 닉네임 · 이메일 · 메모 · 코드에서 찾는다. 띄어 쓴 말은 모두 들어 있어야 한다. 코드는 `-` 없이 쳐도 된다. */
export function matchesQuery(account: Account, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const code = account.invite?.code ?? ''
  const haystack = [account.nickname ?? '', account.email, account.memo, code, code.replace(/-/g, '')].join('\n').toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/** 표에 보일 줄. 사용 중 먼저, 정지는 뒤. */
export function visibleAccounts(accounts: readonly Account[], status: AccountStatus, query = ''): Account[] {
  const shown = accounts.filter((account) => matchesStatus(account, status) && matchesQuery(account, query))
  return [...shown.filter((account) => !account.suspended), ...shown.filter((account) => account.suspended)]
}

/** 상태 탭 옆 숫자. 검색어는 반영한다. */
export function countByStatus(accounts: readonly Account[], query = ''): Record<AccountStatus, number> {
  const matched = accounts.filter((account) => matchesQuery(account, query))
  const count = (status: AccountStatus) => matched.filter((account) => matchesStatus(account, status)).length
  return { all: matched.length, sent: count('sent'), unsent: count('unsent'), suspended: count('suspended') }
}
