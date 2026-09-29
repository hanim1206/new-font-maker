import { useEffect, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, Updater } from '@tanstack/react-table'
import { Ban, Check, Copy, Eye, KeyRound, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { dateOf, dayOf } from './adminApi'
import { ACCOUNT_STATUS_LABEL, countByStatus, visibleAccounts } from './accountFilter'
import type { AccountStatus, AccountsView } from './accountFilter'
import { DataTable, DataTablePagination, SortableHeader } from './DataTable'
import { IssuedDialog } from './IssuedDialog'
import { InviteSheet } from './InviteSheet'
import type { Account, BetaInvites } from './useBetaInvites'

type Confirm = { kind: 'reissue' | 'remove'; account: Account }

const byTime = (iso: string | null) => iso ? Date.parse(iso) : 0
const nameOf = (account: Account) => account.nickname ?? '(닉네임 없음)'

/**
 * 계정: 초대한 친구 표(초대 화면을 합쳤다). 위에 상태 탭 · 검색 · `초대하기`, 아래 쪽 넘기기.
 * 초대 메시지 칸에서 복사하고 보냄 체크. 줄 끝 `⋯`에 폰트 보기 · 새 코드 · 정지 · 되살리기 · 삭제.
 * 새 코드와 삭제는 확인 창을 거친다(되돌릴 수 없다). 보기 상태는 `AdminApp`이 들고 있어 폰트 상세에 다녀와도 남는다.
 */
export function AccountsPage({ invites, onOpen, view, onView }: {
  invites: BetaInvites
  onOpen: (email: string) => void
  view: AccountsView
  onView: (view: AccountsView) => void
}) {
  const { accounts, listError, busy, copied, copy, issue, suspend, remove, markSent } = invites
  const [inviting, setInviting] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  /** 방금 초대해 강조할 닉네임. */
  const [fresh, setFresh] = useState<string[]>([])

  const counts = countByStatus(accounts ?? [], view.query)
  const data = accounts ? visibleAccounts(accounts, view.status, view.query) : []

  /** 거르기가 바뀌면 첫 쪽으로. */
  const filterBy = (patch: Partial<Pick<AccountsView, 'status' | 'query'>>) =>
    onView({ ...view, ...patch, pagination: { ...view.pagination, pageIndex: 0 } })
  const apply = <K extends 'sorting' | 'pagination'>(key: K) => (updater: Updater<AccountsView[K]>) =>
    onView({ ...view, [key]: typeof updater === 'function' ? updater(view[key]) : updater })

  const onIssued = (made: string[]) => {
    setFresh(made)
    onView({ status: 'unsent', query: '', sorting: [], pagination: { ...view.pagination, pageIndex: 0 } })
  }

  const columns: ColumnDef<Account>[] = [
    {
      id: 'nickname',
      accessorFn: (account) => account.nickname ?? '',
      sortingFn: (a, b) => (a.original.nickname ?? '').localeCompare(b.original.nickname ?? '', 'ko'),
      header: ({ column }) => <SortableHeader column={column}>닉네임</SortableHeader>,
      cell: ({ row: { original: account } }) => <div className="flex items-center gap-2">
        <button type="button" className="cursor-pointer font-semibold underline-offset-4 hover:underline" onClick={() => onOpen(account.email)} title="폰트 보기" data-testid="admin-account-open">
          {nameOf(account)}
        </button>
        {fresh.includes(account.nickname ?? '') && <Badge className="bg-primary-light text-primary-dark">새로</Badge>}
      </div>,
    },
    {
      id: 'code',
      header: '코드',
      cell: ({ row: { original: account } }) => account.invite
        ? <code className="select-text font-semibold tracking-wider">{account.invite.code}</code>
        : <span className="text-xs text-text-dim-5">코드 모름</span>,
    },
    {
      id: 'memo',
      header: '메모',
      meta: { className: 'max-w-[16rem]' },
      cell: ({ row: { original: account } }) => account.memo
        ? <span className="block truncate text-text-dim-3" title={account.memo}>{account.memo}</span>
        : <span className="text-text-dim-5">—</span>,
    },
    {
      id: 'sent',
      accessorFn: (account) => byTime(account.sentAt),
      header: ({ column }) => <SortableHeader column={column}>초대 메시지</SortableHeader>,
      cell: ({ row: { original: account } }) => {
        if (!account.invite) return <span className="text-text-dim-5">—</span>
        const label = `${nameOf(account)} 링크 보냄`
        return <div className="flex items-center gap-2">
          {!account.suspended && <Button
            size="icon"
            variant="outline"
            className={cn('size-8', copied === account.email && 'border-primary text-primary')}
            onClick={() => void copy(account.email, account.invite!.message)}
            aria-label={`${nameOf(account)} 초대 메시지 복사`}
            title={copied === account.email ? '복사함' : '초대 메시지 복사'}
            data-testid="admin-account-copy"
          >
            {copied === account.email ? <Check /> : <Copy />}
          </Button>}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-dim-3">
            <Checkbox
              checked={Boolean(account.sentAt)}
              onCheckedChange={(checked) => void markSent(account.email, checked === true)}
              aria-label={label}
              data-testid="admin-account-sent"
            />
            {account.sentAt ? `${dayOf(account.sentAt)} 보냄` : '안 보냄'}
          </label>
        </div>
      },
    },
    {
      id: 'lastSignIn',
      accessorFn: (account) => byTime(account.lastSignInAt),
      sortDescFirst: true,
      header: ({ column }) => <SortableHeader column={column}>마지막 로그인</SortableHeader>,
      cell: ({ row: { original: account } }) => <span className="text-text-dim-4">{dateOf(account.lastSignInAt)}</span>,
    },
    {
      id: 'actions',
      meta: { className: 'w-12 text-right' },
      cell: ({ row: { original: account } }) => <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8" aria-label={`${nameOf(account)} 관리`} data-testid="admin-account-menu"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onOpen(account.email)}><Eye />폰트 보기</DropdownMenuItem>
          {!account.suspended && account.nickname && <DropdownMenuItem disabled={busy} onSelect={() => setConfirm({ kind: 'reissue', account })}><KeyRound />새 코드</DropdownMenuItem>}
          <DropdownMenuSeparator />
          {account.suspended
            ? <>
              <DropdownMenuItem disabled={busy} onSelect={() => void suspend(account.email, false)}><RotateCcw />되살리기</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => setConfirm({ kind: 'remove', account })} data-testid="admin-account-remove"><Trash2 />삭제</DropdownMenuItem>
            </>
            : <DropdownMenuItem disabled={busy} onSelect={() => void suspend(account.email, true)} data-testid="admin-account-suspend"><Ban />정지</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>,
    },
  ]

  const table = useReactTable({
    data,
    columns,
    state: { sorting: view.sorting, pagination: view.pagination },
    onSortingChange: apply('sorting'),
    onPaginationChange: apply('pagination'),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (account) => account.email,
    autoResetPageIndex: false,
  })

  /** 줄이 줄어 지금 쪽이 비면 마지막 쪽으로. */
  const pageCount = table.getPageCount()
  useEffect(() => {
    if (pageCount > 0 && view.pagination.pageIndex >= pageCount) onView({ ...view, pagination: { ...view.pagination, pageIndex: pageCount - 1 } })
  }, [pageCount, view, onView])

  const confirmed = confirm && (confirm.kind === 'reissue'
    ? {
      title: `${nameOf(confirm.account)}에게 새 코드를 줄까요?`,
      body: '옛 코드는 바로 끊겨요. 새 메시지를 다시 보내야 해요.',
      action: '새 코드 만들기',
      run: () => void issue('reissue', confirm.account.nickname!),
    }
    : {
      title: `${nameOf(confirm.account)} 계정을 지울까요?`,
      body: '폰트와 의견까지 지워져 되살릴 수 없어요. 로그인만 막으려면 정지로 두세요.',
      action: '삭제',
      run: () => void remove(confirm.account.email),
    })

  return <div className="flex flex-col gap-4" data-testid="admin-accounts">
    {(invites.failure || listError) && <p role="alert" className="rounded-md bg-[rgb(253_236_233)] px-3 py-2 text-sm text-[rgb(190_52_48)]">{invites.failure || listError}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={view.status} onValueChange={(status) => filterBy({ status: status as AccountStatus })}>
        <TabsList aria-label="계정 거르기">
          {(Object.keys(ACCOUNT_STATUS_LABEL) as AccountStatus[]).map((status) => <TabsTrigger key={status} value={status} data-testid={`admin-account-filter-${status}`}>
            {ACCOUNT_STATUS_LABEL[status]}
            <span className="tabular-nums text-text-dim-5">{accounts ? counts[status] : '·'}</span>
          </TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <label className="relative flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-dim-5" />
          <Input
            type="search"
            value={view.query}
            onChange={(event) => filterBy({ query: event.target.value })}
            placeholder="닉네임 · 메모 · 코드"
            aria-label="계정 검색"
            className="pl-9"
            data-testid="admin-account-search"
          />
        </label>
        <Button variant="primary" onClick={() => setInviting(true)} data-testid="admin-invite-open"><Plus />초대하기</Button>
      </div>
    </div>
    {!accounts && !listError && <p className="text-sm text-text-dim-4">불러오는 중…</p>}
    {accounts && <>
      <DataTable
        table={table}
        empty={view.query ? '맞는 계정이 없어요.' : view.status === 'unsent' && accounts.length > 0 ? '다 보냈어요.' : '아직 없어요.'}
        rowProps={(row) => ({
          className: cn(row.original.suspended && 'text-text-dim-4', fresh.includes(row.original.nickname ?? '') && 'bg-primary-light/50 hover:bg-primary-light/60'),
          'data-suspended': row.original.suspended || undefined,
        })}
      />
      <DataTablePagination table={table} unit="명" />
    </>}
    <InviteSheet invites={invites} open={inviting} onOpenChange={setInviting} onIssued={onIssued} />
    <IssuedDialog invites={invites} />
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmed?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmed?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction destructive={confirm?.kind === 'remove'} onClick={() => confirmed?.run()} data-testid="admin-confirm">{confirmed?.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
