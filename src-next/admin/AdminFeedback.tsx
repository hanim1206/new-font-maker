import { useCallback, useEffect, useState } from 'react'
import { threadsOf, whenText } from '../feedback'
import { REPORT_TAG_LABEL } from '../feedback'
import type { FeedbackThread } from '../feedback'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEEDBACK_API, adminCall } from './adminApi'
import { EMPTY_FEEDBACK_FILTER, FEEDBACK_FILTER_LABEL, isPending, matchesFeedback, userOf } from './feedbackFilter'
import type { AdminMessage, FeedbackFilter, FeedbackFilterStatus } from './feedbackFilter'
import styles from './AdminFeedback.module.css'

interface Listed { messages: AdminMessage[]; nicknames: Record<string, string | null> }

/**
 * 관리자 의견 화면. 위에 검색 · 상태 · 친구 필터, 새 의견이 위, 누르면 그 자리에서 펼쳐 대화 · 보낸 자리 · 답장 칸.
 * 다른 메뉴에 있어도 목록은 받아 둔다 — 메뉴 옆 숫자(`onPending`)를 채운다.
 * 펼친 대화에서 내 답장 고치기 · 메시지 지우기 · 대화 지우기. 지우기는 두 번 눌러야 한다(되돌릴 수 없다).
 */
export function AdminFeedback({ hidden, onPending }: { hidden: boolean; onPending: (count: number) => void }) {
  const [listed, setListed] = useState<Listed | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<FeedbackFilter>(EMPTY_FEEDBACK_FILTER)
  /** 고치는 중인 내 답장. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  /** 한 번 누른 지우기 단추 — `message:<id>` · `thread:<id>`. */
  const [confirming, setConfirming] = useState<string | null>(null)

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

  const nameOf = (thread: FeedbackThread) => listed?.nicknames[userOf(thread)] ?? '(닉네임 없음)'
  const shown = threads?.filter((thread) => matchesFeedback(thread, filter, listed?.nicknames[userOf(thread)] ?? null)) ?? []
  const pending = shown.filter(isPending)
  const past = shown.filter((thread) => !isPending(thread))
  const filtering = filter.status !== 'all' || filter.friend !== 'all' || filter.query.trim() !== ''
  /** 의견을 보낸 친구(필터 목록). */
  const friends = [...new Set(threads?.map(userOf) ?? [])].map((id) => ({ id, name: listed?.nicknames[id] ?? '(닉네임 없음)' }))
  const countOf = (status: FeedbackFilterStatus) => threads?.filter((thread) => matchesFeedback(thread, { ...filter, status }, listed?.nicknames[userOf(thread)] ?? null)).length ?? 0

  const act = async (method: 'POST' | 'PATCH', threadId: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await adminCall(FEEDBACK_API, method, method === 'POST' ? { threadId, body: draft } : { threadId })
      setDraft('')
      setOpen(null)
    } catch (failure) {
      setError((failure as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  /** 고치기 · 지우기. 성공하면 목록을 다시 받는다. 대화를 지우면 접는다. */
  const change = async (method: 'PATCH' | 'DELETE', payload: { messageId: string; body?: string } | { threadId: string }) => {
    if (busy) return
    setBusy(true)
    setError('')
    setConfirming(null)
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

  /** 두 번 눌러야 도는 지우기. 첫 누름은 단추 글만 바꾼다. */
  const pressRemove = (key: string, run: () => void) => {
    if (confirming !== key) return setConfirming(key)
    run()
  }

  const toggle = (id: string) => {
    setOpen((current) => current === id ? null : id)
    setDraft('')
    setEditing(null)
    setConfirming(null)
  }

  const row = (thread: FeedbackThread) => {
    const expanded = open === thread.id
    const context = [...thread.messages].reverse().find((message) => message.author === 'friend')?.context
    return <li key={thread.id} className={styles.feedbackItem} data-past={!isPending(thread) || undefined}>
      <button type="button" className={styles.feedbackHead} aria-expanded={expanded} onClick={() => toggle(thread.id)} data-testid="admin-feedback-thread">
        <span>
          <strong>{nameOf(thread)}</strong>{whenText(thread.updatedAt, new Date(), true)}{thread.status === 'replied' && ' · 답장함'}
          {thread.first.context?.screen && <em className={styles.feedbackScreen}>{thread.first.context.screen}</em>}
          {thread.first.context?.tag && <em className={styles.feedbackTag} data-tag={thread.first.context.tag}>{REPORT_TAG_LABEL[thread.first.context.tag]}</em>}
        </span>
        <p>{thread.first.body}</p>
      </button>
      {expanded && <div className={styles.feedbackOpen}>
        {thread.messages.length > 1 && <ol className={styles.feedbackChat}>
          {thread.messages.map((message) => {
            const removeKey = `message:${message.id}`
            const isFirst = message.id === thread.id
            if (editing?.id === message.id) return <li key={message.id} data-author={message.author} className={styles.feedbackEditing}>
              <textarea value={editing.text} aria-label="답장 고치기" onChange={(event) => setEditing({ id: message.id, text: event.target.value })} data-testid="admin-feedback-edit" />
              <span className={styles.feedbackActions}>
                <button type="button" onClick={() => setEditing(null)}>취소</button>
                <button type="button" disabled={busy || !editing.text.trim() || editing.text.trim() === message.body} onClick={() => void change('PATCH', { messageId: message.id, body: editing.text })} data-testid="admin-feedback-edit-save">저장</button>
              </span>
            </li>
            return <li key={message.id} data-author={message.author}>
              <p>{message.body}</p>
              <small>
                {message.author === 'hanim' ? '한임 · ' : ''}{whenText(message.createdAt, new Date(), true)}
                <span className={styles.feedbackActions}>
                  {message.author === 'hanim' && <button type="button" disabled={busy} onClick={() => { setConfirming(null); setEditing({ id: message.id, text: message.body }) }} data-testid="admin-feedback-edit-start">고치기</button>}
                  {!isFirst && <button type="button" disabled={busy} data-confirm={confirming === removeKey || undefined} onBlur={() => setConfirming((current) => current === removeKey ? null : current)} onClick={() => pressRemove(removeKey, () => void change('DELETE', { messageId: message.id }))} data-testid="admin-feedback-remove-message">
                    {confirming === removeKey ? '한 번 더 — 지움' : '지우기'}
                  </button>}
                </span>
              </small>
            </li>
          })}
        </ol>}
        {context && <p className={styles.feedbackMeta}>{context.screen ?? context.path} · {context.device} · 폰트 {context.font ? `"${context.font}"` : '없음'}{context.fontId ? ` (${context.fontId.slice(0, 8)})` : ' (id 없음)'} · {context.path} · {context.build}</p>}
        <textarea value={draft} placeholder="답장" aria-label="답장" onChange={(event) => setDraft(event.target.value)} data-testid="admin-feedback-reply" />
        <nav>
          <button
            type="button"
            className={styles.feedbackDelete}
            disabled={busy}
            data-confirm={confirming === `thread:${thread.id}` || undefined}
            onBlur={() => setConfirming((current) => current === `thread:${thread.id}` ? null : current)}
            onClick={() => pressRemove(`thread:${thread.id}`, () => void change('DELETE', { threadId: thread.id }))}
            data-testid="admin-feedback-remove-thread"
          >
            {confirming === `thread:${thread.id}` ? `한 번 더 — 대화 ${thread.messages.length}개 지움` : '대화 지우기'}
          </button>
          {isPending(thread) && <button type="button" disabled={busy} onClick={() => void act('PATCH', thread.id)}>읽음만</button>}
          <button type="button" className={styles.feedbackSend} disabled={busy || !draft.trim()} onClick={() => void act('POST', thread.id)} data-testid="admin-feedback-send">
            {busy ? '보내는 중…' : '답장 보내기'}
          </button>
        </nav>
      </div>}
    </li>
  }

  if (hidden) return null
  return <>
    <div className="mb-4 flex flex-col gap-2.5">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim-5" />
        <input
          type="search"
          value={filter.query}
          onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
          placeholder="글 · 닉네임 · 폰트 · 기기로 찾기"
          aria-label="의견 검색"
          className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-text-dim-5 focus:outline-none focus:ring-2 focus:ring-ring/30"
          data-testid="admin-feedback-search"
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(FEEDBACK_FILTER_LABEL) as FeedbackFilterStatus[]).map((status) => <button
          key={status}
          type="button"
          onClick={() => setFilter((current) => ({ ...current, status }))}
          aria-pressed={filter.status === status}
          className={cn(
            'h-8 rounded-full px-3 text-xs font-semibold transition-colors',
            filter.status === status ? 'bg-foreground text-surface' : 'bg-surface-3 text-text-dim-3 hover:bg-surface-4'
          )}
          data-testid={`admin-feedback-filter-${status}`}
        >
          {FEEDBACK_FILTER_LABEL[status]} <span className="tabular-nums opacity-60">{countOf(status)}</span>
        </button>)}
        <select
          value={filter.friend}
          onChange={(event) => setFilter((current) => ({ ...current, friend: event.target.value }))}
          aria-label="친구"
          className="h-8 rounded-full border-0 bg-surface-3 px-3 text-xs font-semibold text-text-dim-3 focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="all">친구 전체</option>
          {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.name}</option>)}
        </select>
        {filtering && <button type="button" onClick={() => setFilter(EMPTY_FEEDBACK_FILTER)} className="h-8 px-2 text-xs font-semibold text-text-dim-4 hover:text-foreground">초기화</button>}
      </div>
    </div>
    {error && <p className={styles.failure} role="alert">{error}</p>}
    {threads && shown.length === 0 && <p className={styles.empty}>{filtering ? '맞는 의견이 없어요.' : '아직 의견이 없어요.'}</p>}
    {pending.length > 0 && <section className={styles.list}>
      <h2>새 의견 {pending.length}</h2>
      <ul>{pending.map(row)}</ul>
    </section>}
    {threads && !filtering && pending.length === 0 && shown.length > 0 && <p className={styles.empty}>새 의견은 다 읽었어요.</p>}
    {past.length > 0 && <section className={styles.list}>
      <h2>지난 의견 {past.length}</h2>
      <ul>{past.map(row)}</ul>
    </section>}
  </>
}
