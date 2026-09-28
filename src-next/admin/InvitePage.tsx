import { useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { isDrawableName } from '../betaWelcome'
import { dateOf } from './adminApi'
import type { BetaInvites, NewRow } from './useBetaInvites'

type Draft = NewRow & { key: number }

const cellInput = 'h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground placeholder:text-text-dim-5 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-foreground aria-[invalid=true]:border-[rgb(214_69_65)]'

/**
 * 초대: 이미 초대한 친구(잠긴 줄) 아래에 새 줄을 원하는 만큼 붙여 닉네임 · 메모를 적고 한 번에 발급한다.
 * 엑셀에서 `닉네임 ⇥ 메모` 여러 줄을 닉네임 칸에 붙여 넣으면 줄로 나뉜다. 발급된 줄은 위 잠긴 줄로 올라가 `메시지 복사`가 생긴다.
 */
export function InvitePage({ invites }: { invites: BetaInvites }) {
  const { accounts, busy, copied, copy } = invites
  const nextKey = useRef(1)
  const blank = (): Draft => ({ key: nextKey.current++, nickname: '', memo: '' })
  const [drafts, setDrafts] = useState<Draft[]>(() => [blank()])
  /** 방금 발급해 위로 올라간 닉네임 — 잠긴 줄에서 강조. */
  const [fresh, setFresh] = useState<string[]>([])
  const table = useRef<HTMLTableSectionElement>(null)

  const members = [...(accounts ?? [])].reverse()
  const taken = new Set(members.map((account) => account.nickname).filter(Boolean))
  const filled = drafts.filter((draft) => draft.nickname.trim() || draft.memo.trim())
  const problemOf = (draft: Draft): string | null => {
    const name = draft.nickname.trim()
    if (!name) return draft.memo.trim() ? '닉네임을 적어 주세요' : null
    if (!isDrawableName(name)) return '한글 1~6자'
    if (taken.has(name)) return '이미 있는 닉네임'
    if (drafts.filter((other) => other.nickname.trim() === name).length > 1) return '표에 두 번'
    return null
  }
  const ready = filled.length > 0 && filled.every((draft) => !problemOf(draft))

  const update = (key: number, patch: Partial<NewRow>) =>
    setDrafts((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row))
  const remove = (key: number) =>
    setDrafts((rows) => rows.length === 1 ? [blank()] : rows.filter((row) => row.key !== key))
  const focusLast = () => requestAnimationFrame(() =>
    table.current?.querySelector<HTMLInputElement>('tr:last-child input[data-field="nickname"]')?.focus())
  const addRow = () => {
    setDrafts((rows) => [...rows, blank()])
    focusLast()
  }

  /** 여러 줄 붙여넣기: 줄마다 한 명, 탭 뒤는 메모. */
  const paste = (key: number, event: ClipboardEvent<HTMLInputElement>) => {
    const lines = event.clipboardData.getData('text').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length < 2 && !lines[0]?.includes('\t')) return
    event.preventDefault()
    const pasted = lines.map((line) => {
      const [nickname = '', ...memo] = line.split('\t')
      return { key: nextKey.current++, nickname: nickname.trim(), memo: memo.join(' ').trim() }
    })
    setDrafts((rows) => {
      const at = rows.findIndex((row) => row.key === key)
      const keep = rows[at] && !rows[at].nickname && !rows[at].memo ? 1 : 0
      return [...rows.slice(0, at + 1 - keep), ...pasted, ...rows.slice(at + 1)]
    })
  }

  /** 마지막 줄에서 Enter면 새 줄. */
  const enter = (key: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (drafts.at(-1)?.key === key) addRow()
  }

  const submit = async () => {
    const made = await invites.issueMany(filled.map(({ nickname, memo }) => ({ nickname: nickname.trim(), memo: memo.trim() })))
    if (made.length === 0) return
    setFresh(made)
    setDrafts((rows) => {
      const left = rows.filter((row) => !made.includes(row.nickname.trim()) && (row.nickname.trim() || row.memo.trim()))
      return left.length ? left : [blank()]
    })
  }

  return <div className="flex flex-col gap-4" data-testid="admin-invite">
    <p className="text-sm text-text-dim-4">
      {accounts ? `초대한 친구 ${members.length}명` : '불러오는 중…'} · 아래 빈 줄에 닉네임 · 메모를 적고 한 번에 발급해요. 엑셀에서 여러 줄을 붙여 넣어도 돼요.
    </p>
    {invites.listError && <p className="text-sm text-[rgb(190_52_48)]">{invites.listError}</p>}
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 text-right">#</TableHead>
          <TableHead className="min-w-[8rem]">친구 닉네임</TableHead>
          <TableHead className="min-w-[14rem]">메모</TableHead>
          <TableHead className="w-44">코드</TableHead>
          <TableHead className="w-36">마지막 로그인</TableHead>
          <TableHead className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody ref={table}>
        {members.map((account, index) => <TableRow key={account.email} className={cn(fresh.includes(account.nickname ?? '') && 'bg-primary-light/60 hover:bg-primary-light/60')} data-member>
          <TableCell className="text-right text-xs text-text-dim-5">{index + 1}</TableCell>
          <TableCell><input className={cn(cellInput, 'font-semibold')} value={account.nickname ?? '(닉네임 없음)'} disabled aria-label="친구 닉네임" /></TableCell>
          <TableCell><input className={cn(cellInput, 'text-text-dim-3')} value={account.memo} placeholder="—" disabled aria-label="메모" /></TableCell>
          <TableCell>{account.invite
            ? <code className="select-text text-sm font-semibold tracking-wider">{account.invite.code}</code>
            : <span className="text-xs text-text-dim-5">코드 모름</span>}</TableCell>
          <TableCell className="text-text-dim-4">
            {account.suspended ? <Badge variant="muted">정지</Badge> : dateOf(account.lastSignInAt)}
          </TableCell>
          <TableCell className="text-right">
            {account.invite && !account.suspended && <Button size="sm" variant={copied === account.email ? 'primary' : 'secondary'} onClick={() => void copy(account.email, account.invite!.message)}>
              {copied === account.email ? '복사함' : '메시지 복사'}
            </Button>}
          </TableCell>
        </TableRow>)}
        {drafts.map((draft, index) => {
          const problem = problemOf(draft)
          return <TableRow key={draft.key} className="bg-surface hover:bg-surface" data-testid="admin-invite-draft">
            <TableCell className="text-right text-xs text-text-dim-5">{members.length + index + 1}</TableCell>
            <TableCell>
              <input
                className={cellInput}
                value={draft.nickname}
                onChange={(event) => update(draft.key, { nickname: event.target.value })}
                onPaste={(event) => paste(draft.key, event)}
                onKeyDown={(event) => enter(draft.key, event)}
                placeholder="민지"
                maxLength={6}
                autoComplete="off"
                aria-label="친구 닉네임"
                aria-invalid={Boolean(problem) || undefined}
                data-field="nickname"
                data-testid="admin-invite-nickname"
              />
            </TableCell>
            <TableCell>
              <input
                className={cellInput}
                value={draft.memo}
                onChange={(event) => update(draft.key, { memo: event.target.value })}
                onKeyDown={(event) => enter(draft.key, event)}
                placeholder="어떻게 아는 사이 · 기기 · 부탁할 것"
                maxLength={200}
                autoComplete="off"
                aria-label="메모"
                data-testid="admin-invite-memo"
              />
            </TableCell>
            <TableCell colSpan={2} className={cn('text-xs', problem ? 'text-[rgb(190_52_48)]' : 'text-text-dim-5')}>{problem ?? (draft.nickname.trim() ? '발급하면 코드가 생겨요' : '')}</TableCell>
            <TableCell className="text-right">
              <Button size="icon" variant="ghost" onClick={() => remove(draft.key)} aria-label="이 줄 지우기"><X /></Button>
            </TableCell>
          </TableRow>
        })}
      </TableBody>
    </Table>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={addRow} data-testid="admin-invite-add-row"><Plus />줄 추가</Button>
      <Button variant="primary" disabled={busy || !ready} onClick={() => void submit()} data-testid="admin-invite-submit">
        {busy ? '만드는 중…' : filled.length > 0 ? `${filled.length}명 발급` : '발급'}
      </Button>
      {invites.failure && <p role="alert" className="text-sm text-[rgb(190_52_48)]">{invites.failure}</p>}
    </div>
  </div>
}
