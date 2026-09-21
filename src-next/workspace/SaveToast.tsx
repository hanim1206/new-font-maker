import { X } from 'lucide-react'
import styles from './SaveToast.module.css'

/**
 * 화면 아래 가운데 토스트. 저장 상태는 머리에 두지 않고 여기서만 알린다.
 * `saving`은 스스로 사라지고, `error`는 놓치면 안 되므로 닫을 때까지 남는다.
 */
export function SaveToast({
  tone,
  message,
  onDismiss,
}: {
  tone: 'saving' | 'error'
  message: string
  /** 주면 닫기 단추가 생긴다. `error`에만 준다. */
  onDismiss?: () => void
}) {
  return (
    <div
      className={styles.toast}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid="save-toast"
    >
      <span>{message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="알림 닫기"><X size={15} /></button>}
    </div>
  )
}
