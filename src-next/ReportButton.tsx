import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleHelp, MapPin, MessageSquareWarning } from 'lucide-react'
import { FEEDBACK_MAX_LENGTH, REPORT_TAGS, REPORT_TAG_LABEL } from './feedback'
import type { FeedbackContext, ReportTag } from './feedback'
import { feedbackContextOf } from './feedbackContext'
import { sendFeedback } from './feedbackApi'
import { navigate } from './router'
import { useMe } from './useFeedback'
import { BetaGuideSheet } from './BetaGuideSheet'
import styles from './ReportButton.module.css'

/**
 * 머리의 제보 단추(마이페이지 왼쪽). 누르면 그 자리에서 아래 판이 올라와 "이 화면"에 대해 쓴다.
 * 판 맨 위에 누른 화면 · 폰트 · 기기를 태그로 박아 두고(친구는 못 고친다) 갈래 태그를 하나 고른다.
 * 크기는 머리마다 달라 `className`을 받고, 색(연한 빨강 바탕 · 빨간 아이콘) · 둥글기는 여기서 덮는다.
 */
export function ReportButton({ className }: { className?: string }) {
  const [context, setContext] = useState<FeedbackContext | null>(null)
  return <>
    <button type="button" className={`${styles.trigger} ${className ?? ''}`} aria-label="이 화면 제보하기" title="이 화면 제보하기" onClick={() => setContext(feedbackContextOf(window.location.pathname))} data-testid="report-open">
      <MessageSquareWarning size={16} aria-hidden="true" />
    </button>
    {context && <ReportSheet context={context} onClose={() => setContext(null)} />}
  </>
}

/** 제보 판. 머리 단추 말고도 연다 — 폰트 완성의 `한임에게 자랑하기`는 `잘했어요` + 문구를 채워 연다. */
export function ReportSheet({ context, onClose, initialTag = null, initialDraft = '' }: { context: FeedbackContext; onClose: () => void; initialTag?: ReportTag | null; initialDraft?: string }) {
  const me = useMe()
  const [tag, setTag] = useState<ReportTag | null>(initialTag)
  const [draft, setDraft] = useState(initialDraft.slice(0, FEEDBACK_MAX_LENGTH))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [closing, setClosing] = useState(false)
  // 판 머리 `둘러보기` — 처음 들어올 때 본 안내를 다시 연다. 열면 제보 판 자리를 안내가 차지하고, 안내를 닫으면 같이 닫힌다.
  const [guide, setGuide] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const body = draft.trim()

  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 240)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!me || !body || busy) return
    setBusy(true)
    setError('')
    const result = await sendFeedback(me.id, body, { ...context, tag })
    setBusy(false)
    if (!result.ok) { setError('보내지 못했어요. 잠시 뒤 다시 해 주세요.'); return }
    setSent(true)
  }

  const where = [context.screen, context.font && `"${context.font}"`, context.device].filter(Boolean) as string[]

  if (guide) return <BetaGuideSheet onClose={onClose} />

  return createPortal(<div className={styles.layer} data-closing={closing || undefined} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="이 화면 제보하기" data-testid="report-sheet">
      {sent
        ? <div className={styles.done}>
          <span className={styles.doneMark}><Check size={26} strokeWidth={3} aria-hidden="true" /></span>
          <h3>보냈어요</h3>
          <p>한임이 읽고 답하면 마이페이지에 빨간 점이 떠요.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => { close(); navigate('/account/feedback') }}>보낸 의견 보기</button>
            <button type="button" data-primary onClick={close}>닫기</button>
          </div>
        </div>
        : <form onSubmit={(event) => void submit(event)}>
          <div className={styles.head}>
            <h3>이 화면 제보하기</h3>
            <button type="button" className={styles.guide} onClick={() => setGuide(true)} data-testid="report-guide"><CircleHelp size={15} aria-hidden="true" />둘러보기</button>
          </div>
          <div className={styles.tags} role="radiogroup" aria-label="어떤 제보인가요">
            {REPORT_TAGS.map(({ key, label }) => <button
              key={key}
              type="button"
              role="radio"
              aria-checked={tag === key}
              data-tag={key}
              onClick={() => { setTag((current) => current === key ? null : key); field.current?.focus() }}
              data-testid={`report-tag-${key}`}
            >{label}</button>)}
          </div>
          <div className={styles.field}>
            <div className={styles.fieldTags} aria-label="보낼 때 같이 가는 정보" data-testid="report-context">
              <span className={styles.where}><MapPin size={13} aria-hidden="true" />{where.join(' · ')}</span>
              {tag && <span className={styles.picked} data-tag={tag}>{REPORT_TAG_LABEL[tag]}</span>}
            </div>
            <textarea
              ref={field}
              value={draft}
              maxLength={FEEDBACK_MAX_LENGTH}
              placeholder={PLACEHOLDER[tag ?? 'other']}
              aria-label="제보 내용"
              onChange={(event) => setDraft(event.target.value)}
              data-testid="report-draft"
            />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={close}>취소</button>
            <button type="submit" data-primary disabled={!body || busy || !me} data-testid="report-send">{busy ? '보내는 중…' : '보내기'}</button>
          </div>
        </form>}
    </div>
  </div>, document.body)
}

const PLACEHOLDER: Record<ReportTag, string> = {
  broken: '무엇을 눌렀더니 어떻게 됐나요?',
  odd: '어느 글자가 어떻게 이상해 보이나요?',
  wish: '이렇게 되면 좋겠어요',
  praise: '어떤 게 좋았나요?',
  other: '이 화면에서 느낀 걸 적어 주세요',
}
