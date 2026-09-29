import { useCallback, useEffect, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { REPORT_TAG_LABEL, threadsOf, whenText } from '../feedback'
import type { FeedbackContext, FeedbackThread, ReportTag } from '../feedback'
import { FEEDBACK_API, adminCall } from './adminApi'
import { DataTable, DataTablePagination, SortableHeader } from './DataTable'
import { EMPTY_FEEDBACK_FILTER, FEEDBACK_FILTER_LABEL, isPending, matchesFeedback, userOf } from './feedbackFilter'
import type { AdminMessage, FeedbackFilter, FeedbackFilterStatus } from './feedbackFilter'

interface Listed { messages: AdminMessage[]; nicknames: Record<string, string | null> }
type Removing = { kind: 'message'; id: string } | { kind: 'thread'; id: string; count: number }

/** 제보 판과 같은 갈래 글자색. */
const TAG_CLASS: Record<ReportTag, string> = {
  broken: 'bg-[rgb(253_236_233)] text-[rgb(214_50_31)]',
  odd: 'bg-[rgb(255_243_224)] text-[rgb(196_100_0)]',
  wish: 'bg-[rgb(232_240_255)] text-[rgb(35_88_201)]',
  praise: 'bg-[rgb(228_245_235)] text-[rgb(22_128_72)]',
  other: 'bg-surface-3 text-text-dim-2',
}

function ContextChips({ context }: { context?: FeedbackContext | null }) {
  if (!context?.screen && !context?.tag) return null
  return <>
    {context.screen && <Badge className="font-medium">{context.screen}</Badge>}
    {context.tag && <Badge className={TAG_CLASS[context.tag]}>{REPORT_TAG_LABEL[context.tag]}</Badge>}
  </>
}

function StatusBadge({ thread }: { thread: FeedbackThread }) {
  if (isPending(thread)) return <Badge variant="alert">새 의견</Badge>
  if (thread.status === 'replied') return <Badge>답장함</Badge>
  return <Badge variant="muted">읽음</Badge>
}

/**
 * 관리자 의견 화면. 위에 상태 탭 · 친구 · 검색, 가운데 표(새 의견 먼저), 아래 쪽 넘기기.
 * 줄을 누르면 오른쪽 패널에서 대화 · 보낸 자리 · 답장. 내 답장 고치기 · 메시지 지우기 · 대화 지우기(지우기는 확인 창).
 * 다른 메뉴에 있어도 목록은 받아 둔다 — 메뉴 옆 숫자(`onPending`)를 채운다.
 */
export function AdminFeedback({ hidden, onPending }: { hidden: boolean; onPending: (count: number) => void }) {
  const [listed, setListed] = useState<Listed | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<FeedbackFilter>(EMPTY_FEEDBACK_FILTER)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  /** 고치는 중인 내 답장. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [removing, setRemoving] = useState<Removing | null>(null)

  const refresh = useCallback(async () => {
    try {
      setListed(await adminCall<Listed>(FEEDBACK_API))
      setError('')
    } catch (failure) {
      setError((failure as Error).message)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const threads = listed ? threadsOf(listed.messages) : null
  const pendingCount = threads?.filter(isPending).length ?? 0
  useEffect(() => { onPending(pendingCount) }, [onPending, pendingCount])

  const nicknameOf = (thread: FeedbackThread) => listed?.nicknames[userOf(thread)] ?? null
  const nameOf = (thread: FeedbackThread) => nicknameOf(thread) ?? '(닉네임 없음)'
  const matched = threads?.filter((thread) => matchesFeedback(thread, filter, nicknameOf(thread))) ?? []
  /** 새 의견 먼저, 그 안에선 받은 순서(최근 먼저). */
  const data = [...matched.filter(isPending), ...matched.filter((thread) => !isPending(thread))]
  const filtering = filter.status !== 'all' || filter.friend !== 'all' || filter.query.trim() !== ''
  const friends = [...new Set(threads?.map(userOf) ?? [])].map((id) => ({ id, name: listed?.nicknames[id] ?? '(닉네임 없음)' }))
  const countOf = (status: FeedbackFilterStatus) => threads?.filter((thread) => matchesFeedback(thread, { ...filter, status }, nicknameOf(thread))).length ?? 0
  const current = threads?.find((thread) => thread.id === open) ?? null

  const filterBy = (patch: Partial<FeedbackFilter>) => {
    setFilter((value) => ({ ...value, ...patch }))
    setPagination((value) => ({ ...value, pageIndex: 0 }))
  }

  /** 답장(POST) · 읽음만(PATCH). 패널은 열어 둔다. */
  const act = async (method: 'POST' | 'PATCH', threadId: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await adminCall(FEEDBACK_API, method, method === 'POST' ? { threadId, body: draft } : { threadId })
      setDraft('')
    } catch (failure) {
      setError((failure as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  /** 고치기 · 지우기. 성공하면 목록을 다시 받는다. 대화를 지우면 패널을 닫는다. */
  const change = async (method: 'PATCH' | 'DELETE', payload: { messageId: string; body?: string } | { threadId: string }) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await adminCall(FEEDBACK_API, method, payload)
      setEditing(null)
      if ('threadId' in payload) setOpen(null)
    } catch (failure) {
      setError((failure as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  const show = (thread: FeedbackThread | null) => {
    setOpen(thread?.id ?? null)
    setDraft('')
    setEditing(null)
  }

  const columns: ColumnDef<FeedbackThread>[] = [
    { id: 'status', header: '상태', meta: { className: 'w-24' }, cell: ({ row }) => <StatusBadge thread={row.original} /> },
    {
      id: 'friend',
      accessorFn: (thread) => nameOf(thread),
      sortingFn: (a, b) => nameOf(a.original).localeCompare(nameOf(b.original), 'ko'),
      header: ({ column }) => <SortableHeader column={column}>친구</SortableHeader>,
      meta: { className: 'w-32' },
      cell: ({ row }) => <span className="font-semibold">{nameOf(row.original)}</span>,
    },
    {
      id: 'body',
      header: '내용',
      meta: { className: 'max-w-[1px] w-full' },
      cell: ({ row: { original: thread } }) => <div className="flex min-w-0 items-center gap-2">
        <span className={cn('min-w-0 truncate', !isPending(thread) && 'text-text-dim-3')}>{thread.first.body}</span>
        <ContextChips context={thread.first.context} />
      </div>,
    },
    { id: 'count', header: '말', meta: { className: 'w-14 text-right tabular-nums text-text-dim-4' }, cell: ({ row }) => row.original.messages.length },
    {
      id: 'updated',
      accessorFn: (thread) => Date.parse(thread.updatedAt),
      sortDescFirst: true,
      header: ({ column }) => <SortableHeader column={column}>최근</SortableHeader>,
      meta: { className: 'w-32' },
      cell: ({ row }) => <span className="text-text-dim-4">{whenText(row.original.updatedAt, new Date(), true)}</span>,
    },
  ]

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (thread) => thread.id,
    autoResetPageIndex: false,
  })

  const pageCount = table.getPageCount()
  useEffect(() => {
    if (pageCount > 0 && pagination.pageIndex >= pageCount) setPagination((value) => ({ ...value, pageIndex: pageCount - 1 }))
  }, [pageCount, pagination.pageIndex])

  if (hidden) return null

  const context = current && [...current.messages].reverse().find((message) => message.author === 'friend')?.context

  return <div className="flex flex-col gap-4" data-testid="admin-feedback">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={filter.status} onValueChange={(status) => filterBy({ status: status as FeedbackFilterStatus })}>
        <TabsList aria-label="의견 거르기">
          {(Object.keys(FEEDBACK_FILTER_LABEL) as FeedbackFilterStatus[]).map((status) => <TabsTrigger key={status} value={status} data-testid={`admin-feedback-filter-${status}`}>
            {FEEDBACK_FILTER_LABEL[status]}
            <span className="tabular-nums text-text-dim-5">{countOf(status)}</span>
          </TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
        <Select value={filter.friend} onValueChange={(friend) => filterBy({ friend })}>
          <SelectTrigger className="w-36" aria-label="친구"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">친구 전체</SelectItem>
            {friends.map((friend) => <SelectItem key={friend.id} value={friend.id}>{friend.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-dim-5" />
          <Input
            type="search"
            value={filter.query}
            onChange={(event) => filterBy({ query: event.target.value })}
            placeholder="글 · 닉네임 · 폰트 · 기기"
            aria-label="의견 검색"
            className="pl-9"
            data-testid="admin-feedback-search"
          />
        </label>
        {filtering && <Button variant="ghost" onClick={() => filterBy(EMPTY_FEEDBACK_FILTER)}>초기화</Button>}
      </div>
    </div>
    {error && !current && <p role="alert" className="rounded-md bg-[rgb(253_236_233)] px-3 py-2 text-sm text-[rgb(190_52_48)]">{error}</p>}
    {!threads && !error && <p className="text-sm text-text-dim-4">불러오는 중…</p>}
    {threads && <>
      <DataTable
        table={table}
        empty={filtering ? '맞는 의견이 없어요.' : '아직 의견이 없어요.'}
        onRowClick={show}
        rowProps={(row) => ({
          className: cn(row.original.id === open && 'bg-surface-3 hover:bg-surface-3'),
          'data-testid': 'admin-feedback-thread',
          'data-pending': isPending(row.original) || undefined,
        })}
      />
      <DataTablePagination table={table} unit="개" />
    </>}

    <Sheet open={Boolean(current)} onOpenChange={(next) => { if (!next) show(null) }}>
      <SheetContent className="sm:max-w-lg" data-testid="admin-feedback-sheet">
        {current && <>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">{nameOf(current)} <StatusBadge thread={current} /></SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-1.5">
              <span>{whenText(current.first.createdAt, new Date(), true)} · 말 {current.messages.length}개</span>
              <ContextChips context={current.first.context} />
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 pb-4">
            <ol className="flex flex-col gap-3">
              {current.messages.map((message) => {
                const mine = message.author === 'hanim'
                const isFirst = message.id === current.id
                if (editing?.id === message.id) return <li key={message.id} className="flex flex-col gap-2">
                  <Textarea value={editing.text} aria-label="답장 고치기" onChange={(event) => setEditing({ id: message.id, text: event.target.value })} data-testid="admin-feedback-edit" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>취소</Button>
                    <Button size="sm" disabled={busy || !editing.text.trim() || editing.text.trim() === message.body} onClick={() => void change('PATCH', { messageId: message.id, body: editing.text })} data-testid="admin-feedback-edit-save">저장</Button>
                  </div>
                </li>
                return <li key={message.id} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')} data-author={message.author}>
                  <p className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]', mine ? 'bg-foreground text-surface' : 'bg-surface-3 text-foreground')}>{message.body}</p>
                  <small className="flex items-center gap-2.5 text-[11.5px] text-text-dim-5">
                    {mine ? '한임 · ' : ''}{whenText(message.createdAt, new Date(), true)}
                    {mine && <button type="button" className="cursor-pointer font-semibold hover:text-foreground" disabled={busy} onClick={() => setEditing({ id: message.id, text: message.body })} data-testid="admin-feedback-edit-start">고치기</button>}
                    {!isFirst && <button type="button" className="cursor-pointer font-semibold hover:text-[rgb(214_69_65)]" disabled={busy} onClick={() => setRemoving({ kind: 'message', id: message.id })} data-testid="admin-feedback-remove-message">지우기</button>}
                  </small>
                </li>
              })}
            </ol>
            {context && <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-2 p-3 text-xs" data-testid="admin-feedback-context">
              <dt className="text-text-dim-5">화면</dt><dd className="[overflow-wrap:anywhere]">{context.screen ?? context.path}</dd>
              <dt className="text-text-dim-5">기기</dt><dd>{context.device}</dd>
              <dt className="text-text-dim-5">폰트</dt><dd>{context.font ? `"${context.font}"` : '없음'}{context.fontId ? ` (${context.fontId.slice(0, 8)})` : ' (id 없음)'}</dd>
              <dt className="text-text-dim-5">경로</dt><dd className="[overflow-wrap:anywhere]">{context.path}</dd>
              <dt className="text-text-dim-5">빌드</dt><dd>{context.build}</dd>
            </dl>}
          </SheetBody>
          <SheetFooter className="border-t border-border-subtle">
            {error && <p role="alert" className="text-sm text-[rgb(190_52_48)]">{error}</p>}
            <Textarea value={draft} placeholder="답장" aria-label="답장" className="min-h-24" onChange={(event) => setDraft(event.target.value)} data-testid="admin-feedback-reply" />
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="text-[rgb(214_69_65)] hover:bg-[rgb(253_236_233)] hover:text-[rgb(190_52_48)]" disabled={busy} onClick={() => setRemoving({ kind: 'thread', id: current.id, count: current.messages.length })} data-testid="admin-feedback-remove-thread">대화 지우기</Button>
              <div className="flex-1" />
              {isPending(current) && <Button variant="outline" disabled={busy} onClick={() => void act('PATCH', current.id)}>읽음만</Button>}
              <Button disabled={busy || !draft.trim()} onClick={() => void act('POST', current.id)} data-testid="admin-feedback-send">
                {busy ? '보내는 중…' : '답장 보내기'}
              </Button>
            </div>
          </SheetFooter>
        </>}
      </SheetContent>
    </Sheet>

    <AlertDialog open={Boolean(removing)} onOpenChange={(next) => { if (!next) setRemoving(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{removing?.kind === 'thread' ? `대화 ${removing.count}개를 지울까요?` : '이 메시지를 지울까요?'}</AlertDialogTitle>
          <AlertDialogDescription>지우면 되돌릴 수 없어요. 친구 화면에서도 사라져요.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            destructive
            onClick={() => {
              if (!removing) return
              void change('DELETE', removing.kind === 'thread' ? { threadId: removing.id } : { messageId: removing.id })
              setRemoving(null)
            }}
            data-testid="admin-confirm"
          >지우기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
