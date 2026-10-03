import { X } from 'lucide-react'
import { dismissAppNotice, topAppNotice, useAppNoticeStore } from './appNotice'
import styles from './AppNoticeBar.module.css'
import { Button } from './components/ui/button'
import { NoticeIcon } from './components/ui/notice-icon'
import { Pressable } from './components/ui/pressable'

/**
 * 화면 아래 알림. 모든 화면의 뿌리(`main.tsx`)에 하나만 둔다.
 * 단추가 하나 이하면 토스식 어두운 막대(파란 글자 단추), 둘이면 하단 드로어를 줄인 흰 카드(큰 단추 둘) — 10-03 사용자.
 * 오류도 바탕은 바꾸지 않고 왼쪽 아이콘만 빨강.
 */
export function AppNoticeBar() {
  // 선택자가 새 객체를 돌려주면 zustand v5가 끝없이 다시 그린다. 칸 묶음만 받고 여기서 고른다.
  const notices = useAppNoticeStore((state) => state.notices)
  const top = topAppNotice({ notices })
  if (!top) return null
  const { kind, notice } = top
  const actions = notice.actions ?? []
  const card = actions.length >= 2
  const close = notice.dismissable && <Pressable type="button" className={styles.close} onClick={() => dismissAppNotice(kind)} aria-label="알림 닫기"><X aria-hidden="true" /></Pressable>
  return (
    <div className={card ? styles.card : styles.bar} data-tone={notice.tone} data-kind={kind} data-layout={card ? 'card' : 'bar'} role={notice.tone === 'error' ? 'alert' : 'status'} data-testid="app-notice">
      <NoticeIcon tone={notice.tone} className={styles.icon} />
      <span className={styles.message}>{notice.message}</span>
      {card
        ? <div className={styles.actions}>{actions.map((action, index) => (
          <Button key={action.label} type="button" size="sheet" variant={index === 0 ? 'default' : 'secondary'} className={styles.cardAction} onClick={action.run}>{action.label}</Button>
        ))}</div>
        : actions.map((action) => <Pressable key={action.label} type="button" className={styles.action} onClick={action.run}>{action.label}</Pressable>)}
      {close}
    </div>
  )
}
