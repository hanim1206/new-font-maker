import { X } from 'lucide-react'
import { dismissAppNotice, topAppNotice, useAppNoticeStore } from './appNotice'
import styles from './AppNoticeBar.module.css'

/** 화면 아래 한 줄 알림. 모든 화면의 뿌리(`main.tsx`)에 하나만 둔다. */
export function AppNoticeBar() {
  // 선택자가 새 객체를 돌려주면 zustand v5가 끝없이 다시 그린다. 칸 묶음만 받고 여기서 고른다.
  const notices = useAppNoticeStore((state) => state.notices)
  const top = topAppNotice({ notices })
  if (!top) return null
  const { kind, notice } = top
  return (
    <div className={styles.bar} data-tone={notice.tone} data-kind={kind} role={notice.tone === 'error' ? 'alert' : 'status'} data-testid="app-notice">
      <span>{notice.message}</span>
      {notice.actions?.map((action) => (
        <button key={action.label} type="button" className={styles.action} onClick={action.run}>{action.label}</button>
      ))}
      {notice.dismissable && <button type="button" className={styles.close} onClick={() => dismissAppNotice(kind)} aria-label="알림 닫기"><X size={15} /></button>}
    </div>
  )
}
