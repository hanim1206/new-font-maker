import { useEffect, useState } from 'react'
import { NotFoundPage } from './NotFoundPage'
import { usePageTitle } from './pageTitle'
import type { ReactNode } from 'react'
import { Bug, ChevronDown, ChevronLeft, ChevronRight, Eye, Heart, MessageCircle, MessageSquareWarning, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProfile, fontLimitOf } from './useProfile'
import { listFonts } from './accountFontApi'
import { authGateMode, isGuest, signOutAndReload, withdrawAndReload } from './betaAuth'
import { REPORT_TAG_LABEL, hasUnseenReply, markSeen, readSeen, whenText } from './feedback'
import type { ReportTag } from './feedback'
import { useMe, useThreads } from './useFeedback'
import { Button } from './components/ui/button'
import { navigate } from './router'
import styles from './AccountPage.module.css'

/**
 * 계정 페이지와 한임에게 의견(docs/plans/2026-09-27_계정-페이지와-의견.md). 대시보드 머리 아바타에서 밀려 들어온다.
 * `/account` 계정 · `/account/feedback` 내가 보낸 의견(펼침 목록). 쓰기는 머리 제보 단추.
 * 게이트가 꺼진 개발 서버는 계정 대신 `local`이고 의견은 이 기기(localStorage)에 남는다.
 */

function Bar({ back, title }: { back: string; title?: string }) {
  return <header className={styles.bar}>
    <Button variant="plain" size="icon-lg" aria-label="뒤로" onClick={() => navigate(back)}><ChevronLeft aria-hidden="true" /></Button>
    {title && <h1>{title}</h1>}
  </header>
}

function Shell({ children, testId }: { children: ReactNode; testId: string }) {
  return <main className={styles.page}><div className={styles.shell} data-testid={testId}>{children}</div></main>
}

/** 탈퇴 확인. 폰트는 30일 뒤 지워진다(약관 제9조) — 되돌리려면 메일로. */
async function confirmWithdraw(): Promise<void> {
  if (!window.confirm('탈퇴하면 만든 폰트를 더 받을 수 없고 30일 뒤 지워져요. 탈퇴할까요?')) return
  const done = await withdrawAndReload()
  if (!done.ok) window.alert('탈퇴하지 못했어요. 다시 해 주세요.')
}

function AccountHome() {
  usePageTitle('계정')
  const me = useMe()
  const [fontCount, setFontCount] = useState<number | null>(null)
  const { threads } = useThreads(me)
  const profile = useProfile(me?.id ?? null)
  useEffect(() => {
    if (!me) return
    void listFonts(me.id).then((listed) => { if (listed.ok) setFontCount(listed.value.length) })
  }, [me])
  const seen = me ? readSeen(window.localStorage, me.id) : {}
  const unseen = threads?.some((thread) => hasUnseenReply(thread, seen)) ?? false
  const joined = me?.joinedAt ? new Date(me.joinedAt).toLocaleDateString('ko-KR') : '–'

  return <Shell testId="account-page">
    <Bar back="/dashboard" title={me?.nickname ?? '나'} />
    <div className={styles.body}>
      <p className={styles.sub}>{isGuest() ? '로그인 전' : me?.beta ? '베타 참여자' : '회원'}</p>
      {isGuest()
        ? <p className={styles.guestNote}>지금 만드는 폰트는 이 기기에만 있어요. 받을 때 카카오로 로그인하면 계정에 저장돼요.</p>
        : <dl className={styles.facts}>
          <div><dt>내 폰트</dt><dd data-testid="account-font-count">{fontCount ?? '–'} / {fontLimitOf(profile)}개</dd></div>
          <div><dt>요금제</dt><dd>{me?.beta ? '베타 · 무료' : '무료'}</dd></div>
          <div><dt>가입</dt><dd>{joined}</dd></div>
        </dl>}
      <div className={styles.band} />
      {!isGuest() && <Button variant="plain" size="row" className={styles.link} onClick={() => navigate('/account/feedback')} data-testid="account-feedback">
        <strong>내가 보낸 의견</strong>
        {unseen && <span className={styles.dot} aria-label="새 답장" />}
        <ChevronRight aria-hidden="true" />
      </Button>}
      {authGateMode() === 'on' && (isGuest()
        ? <Button variant="default" size="block" className={styles.signOut} onClick={() => window.location.assign('/login')} data-testid="account-login">카카오로 시작하기</Button>
        : <>
          <Button variant="quiet" size="lg" className={styles.signOut} onClick={() => void signOutAndReload()}>로그아웃</Button>
          <Button variant="faint" size="sm" className={styles.withdraw} onClick={() => void confirmWithdraw()} data-testid="account-withdraw">탈퇴하기</Button>
        </>)}
    </div>
  </Shell>
}

/** 갈래 태그별 목록 아이콘. 태그가 없는 옛 의견은 말풍선. */
const TAG_ICON: Record<ReportTag, LucideIcon> = { broken: Bug, odd: Eye, wish: Sparkles, praise: Heart, other: MessageCircle }

/**
 * 내가 보낸 의견(토스식). 큰 두 줄 제목에 보낸 개수, 옅은 안내 한 줄, 줄마다 갈래 색 아이콘 · 글 · 화면.
 * 대화방이 아니라 글 목록 — 답을 기다리게 하지 않는다. 쓴 글은 늘 전체가 보이고, 한임 답이 생긴 줄에만 `한임 답 보기` 토글이 생긴다.
 * `고쳤어요`(해결) 표시는 선별 단계(피드백 42)에서 — 지금 DB에 해결 칸이 없다.
 * 쓰기는 화면 머리의 제보 단추(`ReportButton`)가 한다. `/account/feedback/<대화 id>`로 오면 그 줄의 답을 펼쳐 둔다(옛 링크).
 */
function FeedbackHome({ openId = null }: { openId?: string | null }) {
  usePageTitle('내가 보낸 의견')
  const me = useMe()
  const { threads, failed } = useThreads(me)
  const [open, setOpen] = useState<string | null>(openId)
  const [seen, setSeen] = useState(() => me ? readSeen(window.localStorage, me.id) : {})
  useEffect(() => { if (me) setSeen(readSeen(window.localStorage, me.id)) }, [me])
  const count = threads?.length ?? 0

  // 답을 펼치면 본 것으로 — 아바타 · 계정 행의 빨간 점이 사라진다.
  useEffect(() => {
    if (!me || !open) return
    markSeen(window.localStorage, me.id, open, new Date().toISOString())
    setSeen(readSeen(window.localStorage, me.id))
  }, [me, open, threads])

  return <Shell testId="feedback-page">
    <Bar back="/account" title="내가 보낸 의견" />
    <div className={styles.body}>
      <h1 className={styles.mineTitle} data-testid="feedback-count">
        {count > 0 ? <>지금까지 의견을<br /><em>{count}개</em> 보냈어요</> : <>피드백은<br />언제나 환영해요</>}
      </h1>
      <p className={styles.mineHint}>
        {count > 0 && <>피드백은 언제나 환영해요.<br /></>}화면 위 <span className={styles.reportIcon} aria-label="제보 단추"><MessageSquareWarning size={12} aria-hidden="true" /></span> 를 누르면 그 화면에 대해 보낼 수 있어요.
      </p>
      {count > 0 && <ul className={styles.mine}>
        {threads!.map((thread) => {
          const unseen = hasUnseenReply(thread, seen)
          const expanded = open === thread.id
          const context = thread.first.context
          const tag = context?.tag ?? null
          const Icon = TAG_ICON[tag ?? 'other']
          const mine = thread.messages.filter((message) => message.author === 'friend')
          const replies = thread.messages.filter((message) => message.author === 'hanim')
          return <li key={thread.id} data-testid="feedback-thread">
            <span className={styles.mineIcon} data-tag={tag ?? 'other'}><Icon size={20} aria-hidden="true" /></span>
            <div className={styles.mineText}>
              {mine.map((message) => <p key={message.id}>{message.body}</p>)}
              <small>{[context?.screen, tag && REPORT_TAG_LABEL[tag], whenText(thread.first.createdAt)].filter(Boolean).join(' · ')}</small>
              {replies.length > 0 && <Button variant="soft" size="sm" className={styles.mineToggle} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : thread.id)} data-highlight={unseen || undefined} data-testid="feedback-reply-toggle">
                <MessageCircle aria-hidden="true" />답 {expanded ? '접기' : '보기'}
                {unseen && <span className={styles.mineDot} aria-label="새 답장" />}
                <ChevronDown aria-hidden="true" />
              </Button>}
              {expanded && <div className={styles.mineReplies} data-testid="feedback-open">
                {replies.map((reply) => <div key={reply.id} className={styles.mineReply}>
                  <p>{reply.body}</p>
                  <small>한글칸글 · {whenText(reply.createdAt, new Date(), true)}</small>
                </div>)}
              </div>}
            </div>
          </li>
        })}
      </ul>}
      {failed && <p className={styles.error}>보낸 의견을 불러오지 못했어요.</p>}
    </div>
  </Shell>
}

/** `/account` 아래 주소를 나눈다. 모르는 주소는 계정 페이지로. */
export function AccountPage({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[1] === 'feedback') return <FeedbackHome openId={parts[2] ?? null} />
  if (parts.length > 1) return <NotFoundPage />
  return <AccountHome />
}
