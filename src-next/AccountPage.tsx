import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../src/stores/uiStore'
import { FONT_LIMIT } from './accountFont'
import { listFonts } from './accountFontApi'
import { authGateMode, signOutAndReload } from './betaAuth'
import { deviceOf, FEEDBACK_MAX_LENGTH, hasUnseenReply, markSeen, readSeen, STATUS_LABEL, threadsOf, whenText } from './feedback'
import type { FeedbackContext, FeedbackMessage } from './feedback'
import { sendFeedback } from './feedbackApi'
import { useMe, useThreads } from './useFeedback'
import { navigate, previousPathname } from './router'
import styles from './AccountPage.module.css'

/**
 * 계정 페이지와 한임에게 의견(docs/plans/2026-09-27_계정-페이지와-의견.md). 대시보드 머리 아바타에서 밀려 들어온다.
 * `/account` 계정 · `/account/feedback` 쓰기 + 보낸 목록 · `/account/feedback/<대화 id>` 대화.
 * 게이트가 꺼진 개발 서버는 계정 대신 `local`이고 의견은 이 기기(localStorage)에 남는다.
 */

/** 보낸 자리. 계정 페이지는 거쳐 가는 곳이라 그 앞 화면을 적는다. 빌드는 진입 번들 이름(해시)으로 가린다. */
function contextNow(): FeedbackContext {
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src
  return {
    path: previousPathname() ?? '/dashboard',
    font: useUIStore.getState().currentProjectName,
    device: deviceOf(navigator.userAgent),
    build: entry ? entry.split('/').pop()!.replace(/\.js$/, '') : 'dev',
  }
}

function Bar({ back, title }: { back: string; title?: string }) {
  return <header className={styles.bar}>
    <button type="button" className={styles.back} aria-label="뒤로" onClick={() => navigate(back)}><ChevronLeft size={24} aria-hidden="true" /></button>
    {title && <h2>{title}</h2>}
  </header>
}

function Shell({ children, testId }: { children: ReactNode; testId: string }) {
  return <main className={styles.page}><div className={styles.shell} data-testid={testId}>{children}</div></main>
}

function AccountHome() {
  const me = useMe()
  const [fontCount, setFontCount] = useState<number | null>(null)
  const { threads } = useThreads(me)
  useEffect(() => {
    if (!me) return
    void listFonts(me.id).then((listed) => { if (listed.ok) setFontCount(listed.value.length) })
  }, [me])
  const seen = me ? readSeen(window.localStorage, me.id) : {}
  const unseen = threads?.some((thread) => hasUnseenReply(thread, seen)) ?? false
  const joined = me?.joinedAt ? new Date(me.joinedAt).toLocaleDateString('ko-KR') : '–'

  return <Shell testId="account-page">
    <Bar back="/dashboard" />
    <div className={styles.body}>
      <h1>{me?.nickname ?? '나'}</h1>
      <p className={styles.sub}>베타 참여자</p>
      <dl className={styles.facts}>
        <div><dt>내 폰트</dt><dd data-testid="account-font-count">{fontCount ?? '–'} / {FONT_LIMIT}개</dd></div>
        <div><dt>요금제</dt><dd>베타 · 무료</dd></div>
        <div><dt>가입</dt><dd>{joined}</dd></div>
      </dl>
      <div className={styles.band} />
      <button type="button" className={styles.link} onClick={() => navigate('/account/feedback')} data-testid="account-feedback">
        <strong>한임에게 의견 보내기</strong>
        {unseen && <span className={styles.dot} aria-label="새 답장" />}
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      {authGateMode() === 'on' && <button type="button" className={styles.signOut} onClick={() => void signOutAndReload()}>로그아웃</button>}
    </div>
  </Shell>
}

function FeedbackHome() {
  const me = useMe()
  const { threads, failed, setThreads } = useThreads(me)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const body = draft.trim()
  const seen = me ? readSeen(window.localStorage, me.id) : {}

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!me || !body || busy) return
    setBusy(true)
    setError('')
    const sent = await sendFeedback(me.id, body, contextNow())
    setBusy(false)
    if (!sent.ok) { setError('보내지 못했어요. 잠시 뒤 다시 해 주세요.'); return }
    setDraft('')
    setThreads((list) => threadsOf([...(list ?? []).flatMap((thread) => thread.messages), sent.value]))
  }

  return <Shell testId="feedback-page">
    <Bar back="/account" />
    <div className={styles.body}>
      <h1>한임에게</h1>
      <p className={styles.sub}>불편한 점, 바라는 점 뭐든 좋아요.</p>
      <form className={styles.compose} onSubmit={(event) => void submit(event)}>
        <textarea value={draft} maxLength={FEEDBACK_MAX_LENGTH} placeholder="ㄲ이 좀 뚱뚱해 보여요" aria-label="의견" onChange={(event) => setDraft(event.target.value)} data-testid="feedback-draft" />
        <small>보던 화면 주소 · 폰트 이름 · 기기가 같이 가요.</small>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" disabled={!body || busy} data-testid="feedback-send">{busy ? '보내는 중…' : '보내기'}</button>
      </form>
      {(threads?.length ?? 0) > 0 && <section className={styles.threads}>
        <h3>보낸 의견</h3>
        <ul>
          {threads!.map((thread) => {
            const unseen = hasUnseenReply(thread, seen)
            return <li key={thread.id}>
              <button type="button" onClick={() => navigate(`/account/feedback/${thread.id}`)} data-testid="feedback-thread">
                <strong>{thread.first.body}</strong>
                <small data-new={unseen || undefined}>{unseen ? '답장 왔어요' : STATUS_LABEL[thread.status]} · {whenText(thread.updatedAt)}</small>
              </button>
            </li>
          })}
        </ul>
      </section>}
      {failed && <p className={styles.error}>보낸 의견을 불러오지 못했어요.</p>}
    </div>
  </Shell>
}

function FeedbackThreadView({ threadId }: { threadId: string }) {
  const me = useMe()
  const { threads, failed, setThreads } = useThreads(me)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const thread = threads?.find((item) => item.id === threadId) ?? null
  const count = thread?.messages.length ?? 0

  // 열면 본 것으로 — 빨간 점이 사라진다. 새 말이 오면 맨 아래로.
  useEffect(() => { if (me && thread) markSeen(window.localStorage, me.id, thread.id, new Date().toISOString()) }, [me, thread])
  useLayoutEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [count])
  useEffect(() => { if (threads && !thread) navigate('/account/feedback', { replace: true }) }, [threads, thread])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!me || !body || busy) return
    setBusy(true)
    setError('')
    const sent = await sendFeedback(me.id, body, contextNow(), threadId)
    setBusy(false)
    if (!sent.ok) { setError('보내지 못했어요. 다시 해 주세요.'); return }
    setDraft('')
    setThreads((list) => threadsOf([...(list ?? []).flatMap((item) => item.messages), sent.value]))
  }

  return <Shell testId="feedback-thread-page">
    <Bar back="/account/feedback" title="보낸 의견" />
    <div className={styles.chat}>
      {thread?.messages.map((message: FeedbackMessage) => <div key={message.id} className={styles.message} data-author={message.author}>
        {message.author === 'hanim' && <span className={styles.who}>한임</span>}
        <p>{message.body}</p>
        <small>{whenText(message.createdAt, new Date(), true)}</small>
      </div>)}
      {failed && <p className={styles.error}>대화를 불러오지 못했어요.</p>}
      <div ref={end} />
    </div>
    <form className={styles.composer} onSubmit={(event) => void submit(event)}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div>
        <input value={draft} maxLength={FEEDBACK_MAX_LENGTH} placeholder="더 보내기" aria-label="더 보내기" onChange={(event) => setDraft(event.target.value)} data-testid="feedback-reply-draft" />
        <button type="submit" aria-label="보내기" disabled={!draft.trim() || busy}><ArrowUp size={20} aria-hidden="true" /></button>
      </div>
    </form>
  </Shell>
}

/** `/account` 아래 주소를 나눈다. 모르는 주소는 계정 페이지로. */
export function AccountPage({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[1] === 'feedback' && parts[2]) return <FeedbackThreadView threadId={parts[2]} />
  if (parts[1] === 'feedback') return <FeedbackHome />
  return <AccountHome />
}
