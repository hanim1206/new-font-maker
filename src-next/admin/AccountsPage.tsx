import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dateOf } from './adminApi'
import { IssuedCard } from './IssuedCard'
import type { Account, BetaInvites } from './useBetaInvites'

/** 계정: 발급한 친구 표. 메시지 다시 복사 · 새 코드 · 정지 · 되살리기. 새 코드만 한 번 더 눌러야 한다. */
export function AccountsPage({ invites }: { invites: BetaInvites }) {
  const { accounts, listError, busy, copied, copy, issue, suspend } = invites
  /** `reissue:<이메일>` — 한 번 누른 새 코드 단추(옛 코드가 끊겨 되돌릴 수 없어 두 번 누른다). 정지는 되살리기가 있어 한 번에. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const active = accounts?.filter((account) => !account.suspended) ?? []
  const suspended = accounts?.filter((account) => account.suspended) ?? []

  const row = (account: Account) => {
    const name = account.nickname
    const confirm = (action: string) => confirming === `${action}:${account.email}`
    const press = (action: 'reissue', run: () => void) => {
      if (!confirm(action)) return setConfirming(`${action}:${account.email}`)
      setConfirming(null)
      run()
    }
    const drop = () => setConfirming((current) => current?.endsWith(`:${account.email}`) ? null : current)
    return <TableRow key={account.email} className={account.suspended ? 'text-text-dim-4' : undefined}>
      <TableCell className="font-semibold">{name ?? '(닉네임 없음)'}</TableCell>
      <TableCell>{account.invite
        ? <code className="select-text font-semibold tracking-wider">{account.invite.code}</code>
        : <span className="text-xs text-text-dim-5">코드 모름</span>}</TableCell>
      <TableCell className="max-w-[16rem] truncate text-text-dim-3" title={account.memo || undefined}>{account.memo || <span className="text-text-dim-5">—</span>}</TableCell>
      <TableCell className="text-text-dim-4">{dateOf(account.lastSignInAt)}</TableCell>
      <TableCell>{account.suspended ? <Badge variant="muted">정지</Badge> : <Badge>사용 중</Badge>}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1.5">
          {account.suspended
            ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void suspend(account.email, false)}>되살리기</Button>
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
      {accounts ? `사용 중 ${active.length} · 정지 ${suspended.length}` : '불러오는 중…'} · 정지는 로그인만 막아요. 폰트와 코드는 그대로예요.
    </p>
    {accounts && <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>닉네임</TableHead>
          <TableHead>코드</TableHead>
          <TableHead>메모</TableHead>
          <TableHead>마지막 로그인</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="text-right">관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.length === 0 && <TableRow><TableCell colSpan={6} className="text-text-dim-5">아직 없어요.</TableCell></TableRow>}
        {active.map(row)}
        {suspended.map(row)}
      </TableBody>
    </Table>}
  </div>
}
