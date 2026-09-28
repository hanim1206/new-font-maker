import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dateOf, dayOf } from './adminApi'
import { IssuedCard } from './IssuedCard'
import { isUnsent, visibleAccounts } from './accountFilter'
import type { AccountFilter } from './accountFilter'
import type { Account, BetaInvites } from './useBetaInvites'

/** 계정: 발급한 친구 표. `전체 · 안 보냄`으로 거른다(고른 칸은 `AdminApp`이 들고 있어 폰트 상세에 다녀와도 남는다). 닉네임을 누르면 그 친구 폰트 미리보기. 링크 보냄 체크 · 메시지 다시 복사 · 새 코드 · 정지 · 되살리기 · 삭제. 새 코드와 삭제는 한 번 더 눌러야 한다. */
export function AccountsPage({ invites, onOpen, filter, onFilter }: { invites: BetaInvites; onOpen: (email: string) => void; filter: AccountFilter; onFilter: (filter: AccountFilter) => void }) {
  const { accounts, listError, busy, copied, copy, issue, suspend, remove, markSent } = invites
  /** `reissue:<이메일>` · `remove:<이메일>` — 한 번 누른 새 코드 · 삭제 단추(되돌릴 수 없어 두 번 누른다). 정지는 되살리기가 있어 한 번에. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const active = accounts?.filter((account) => !account.suspended) ?? []
  const suspended = accounts?.filter((account) => account.suspended) ?? []
  const unsent = accounts?.filter(isUnsent).length ?? 0
  const shown = accounts ? visibleAccounts(accounts, filter) : []

  const row = (account: Account) => {
    const name = account.nickname
    const confirm = (action: string) => confirming === `${action}:${account.email}`
    const press = (action: 'reissue' | 'remove', run: () => void) => {
      if (!confirm(action)) return setConfirming(`${action}:${account.email}`)
      setConfirming(null)
      run()
    }
    const drop = () => setConfirming((current) => current?.endsWith(`:${account.email}`) ? null : current)
    return <TableRow key={account.email} className={account.suspended ? 'text-text-dim-4' : undefined}>
      <TableCell className="font-semibold">
        <button type="button" className="cursor-pointer underline-offset-4 hover:underline" onClick={() => onOpen(account.email)} title="폰트 보기" data-testid="admin-account-open">
          {name ?? '(닉네임 없음)'}
        </button>
      </TableCell>
      <TableCell>{account.invite
        ? <code className="select-text font-semibold tracking-wider">{account.invite.code}</code>
        : <span className="text-xs text-text-dim-5">코드 모름</span>}</TableCell>
      <TableCell className="max-w-[16rem] truncate text-text-dim-3" title={account.memo || undefined}>{account.memo || <span className="text-text-dim-5">—</span>}</TableCell>
      <TableCell>{account.invite
        ? <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-dim-3">
          <input
            type="checkbox"
            className="size-4 cursor-pointer accent-primary"
            checked={Boolean(account.sentAt)}
            onChange={(event) => void markSent(account.email, event.target.checked)}
            aria-label={`${name ?? account.email} 링크 보냄`}
            data-testid="admin-account-sent"
          />
          {account.sentAt ? dayOf(account.sentAt) : '안 보냄'}
        </label>
        : <span className="text-text-dim-5">—</span>}</TableCell>
      <TableCell className="text-text-dim-4">{dateOf(account.lastSignInAt)}</TableCell>
      <TableCell>{account.suspended ? <Badge variant="muted">정지</Badge> : <Badge>사용 중</Badge>}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1.5">
          {account.suspended
            ? <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void suspend(account.email, false)}>되살리기</Button>
              <Button size="sm" variant={confirm('remove') ? 'destructive' : 'secondary'} disabled={busy} onBlur={drop} onClick={() => press('remove', () => void remove(account.email))} data-testid="admin-account-remove">
                {confirm('remove') ? `한 번 더 — ${name ?? '이 계정'} 폰트까지 지움` : '삭제'}
              </Button>
            </>
            : <>
              {account.invite && <Button size="sm" variant={copied === account.email ? 'primary' : 'secondary'} onClick={() => void copy(account.email, account.invite!.message)}>
                {copied === account.email ? '복사함' : '메시지 복사'}
              </Button>}
              {name && <Button size="sm" variant={confirm('reissue') ? 'destructive' : 'secondary'} disabled={busy} onBlur={drop} onClick={() => press('reissue', () => void issue('reissue', name))}>
                {confirm('reissue') ? '한 번 더 — 옛 코드 끊김' : '새 코드'}
              </Button>}
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void suspend(account.email, true)}>정지</Button>
            </>}
        </div>
      </TableCell>
    </TableRow>
  }

  return <div className="flex flex-col gap-5" data-testid="admin-accounts">
    {invites.failure && <p role="alert" className="text-sm text-[rgb(190_52_48)]">{invites.failure}</p>}
    {invites.issued?.mode === 'reissue' && <div className="max-w-lg"><IssuedCard invites={invites} /></div>}
    {listError && <p className="text-sm text-[rgb(190_52_48)]">{listError}</p>}
    <p className="text-sm text-text-dim-4">
      {accounts ? `사용 중 ${active.length} · 안 보냄 ${unsent} · 정지 ${suspended.length}` : '불러오는 중…'} · 정지는 로그인만 막아요. 폰트와 코드는 그대로예요. 정지한 계정은 삭제할 수 있고, 폰트와 의견까지 지워져 되살릴 수 없어요.
    </p>
    {accounts && <div className="flex gap-1.5" role="group" aria-label="계정 거르기">
      {([['all', `전체 ${accounts.length}`], ['unsent', `안 보냄 ${unsent}`]] as const).map(([key, label]) => <Button
        key={key}
        size="sm"
        variant={filter === key ? 'default' : 'secondary'}
        aria-pressed={filter === key}
        onClick={() => onFilter(key)}
        data-testid={`admin-account-filter-${key}`}
      >{label}</Button>)}
    </div>}
    {accounts && <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>닉네임</TableHead>
          <TableHead>코드</TableHead>
          <TableHead>메모</TableHead>
          <TableHead>보냄</TableHead>
          <TableHead>마지막 로그인</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="text-right">관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.length === 0 && <TableRow><TableCell colSpan={7} className="text-text-dim-5">{filter === 'unsent' && accounts.length > 0 ? '다 보냈어요.' : '아직 없어요.'}</TableCell></TableRow>}
        {shown.map(row)}
      </TableBody>
    </Table>}
  </div>
}
