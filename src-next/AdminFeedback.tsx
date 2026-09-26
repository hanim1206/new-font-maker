import { useCallback, useEffect, useState } from 'react'
import { threadsOf, whenText } from './feedback'
import type { FeedbackMessage, FeedbackThread } from './feedback'
import styles from './AdminInvitePage.module.css'

/** `scripts/feedbackAdminApi.ts`와 같은 값. 서버 파일을 가져오면 node 모듈이 번들로 딸려 와서 옮겨 적는다. */
const API = '/api/feedback'
const HEADER = 'x-beta-admin'

type AdminMessage = FeedbackMessage & { userId: string }
interface Listed { messages: AdminMessage[]; nicknames: Record<string, string | null> }

async function call<T>(method: 'GET' | 'POST' | 'PATCH', payload?: unknown): Promise<T> {
  const response = await fetch(API, payload === undefined
    ? { method, headers: { [HEADER]: '1' } }
    : { method, headers: { [HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({ error: `서버가 ${response.status}로 답했습니다.` }))
  if (!response.ok) throw new Error(body.error ?? '실패했습니다.')
  return body as T
}

/** 새 의견: 마지막 말이 친구 것이고 아직 안 읽었다. 답장하거나 `읽음만`을 누르면 지난 의견으로 간다. */
const isPending = (thread: FeedbackThread) => {
  const last = thread.messages.at(-1)!
  return last.author === 'friend' && thread.messages.some((message) => message.author === 'friend' && !message.readAt)
}

/**
 * 관리자 화면 의견 탭. 새 의견이 위, 누르면 그 자리에서 펼쳐 대화 · 보낸 자리 · 답장 칸.
 * 탭이 숨어도 목록은 받아 둔다 — 탭 옆 숫자(`onPending`)를 채운다.
 */
export function AdminFeedback({ hidden, onPending }: { hidden: boolean; onPending: (count: number) => void }) {
  const [listed, setListed] = useState<Listed | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setListed(await call<Listed>('GET'))
      setError('')
    } catch (failure) {
      setError((failure as Error).message)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const threads = listed ? threadsOf(listed.messages) : null
  const pending = threads?.filter(isPending) ?? []
  const past = threads?.filter((thread) => !isPending(thread)) ?? []
  useEffect(() => { onPending(pending.length) }, [onPending, pending.length])

  const nameOf = (thread: FeedbackThread) => listed?.nicknames[(thread.first as AdminMessage).userId] ?? '(닉네임 없음)'

  const act = async (method: 'POST' | 'PATCH', threadId: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await call(method, method === 'POST' ? { threadId, body: draft } : { threadId })
      setDraft('')
      setOpen(null)
    } catch (failure) {
      setError((failure as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  const toggle = (id: string) => {
    setOpen((current) => current === id ? null : id)
    setDraft('')
  }

  const row = (thread: FeedbackThread) => {
    const expanded = open === thread.id
    const context = [...thread.messages].reverse().find((message) => message.author === 'friend')?.context
    return <li key={thread.id} className={styles.feedbackItem} data-past={!isPending(thread) || undefined}>
      <button type="button" className={styles.feedbackHead} aria-expanded={expanded} onClick={() => toggle(thread.id)} data-testid="admin-feedback-thread">
        <span><strong>{nameOf(thread)}</strong>{whenText(thread.updatedAt, new Date(), true)}{thread.status === 'replied' && ' · 답장함'}</span>
        <p>{thread.first.body}</p>
      </button>
      {expanded && <div className={styles.feedbackOpen}>
        {thread.messages.length > 1 && <ol className={styles.feedbackChat}>
          {thread.messages.map((message) => <li key={message.id} data-author={message.author}>
            <p>{message.body}</p>
            <small>{message.author === 'hanim' ? '한임 · ' : ''}{whenText(message.createdAt, new Date(), true)}</small>
          </li>)}
        </ol>}
        {context && <p className={styles.feedbackMeta}>{context.device} · 폰트 {context.font ? `"${context.font}"` : '없음'} · {context.path} · {context.build}</p>}
        <textarea value={draft} placeholder="답장" aria-label="답장" onChange={(event) => setDraft(event.target.value)} data-testid="admin-feedback-reply" />
        <nav>
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
    {error && <p className={styles.failure} role="alert">{error}</p>}
    <section className={styles.list}>
      <h2>새 의견 {threads ? pending.length : ''}</h2>
      {threads && pending.length === 0 && <p className={styles.empty}>다 읽었어요.</p>}
      <ul>{pending.map(row)}</ul>
    </section>
    {past.length > 0 && <section className={styles.list}>
      <h2>지난 의견 {past.length}</h2>
      <ul>{past.map(row)}</ul>
    </section>}
  </>
}
