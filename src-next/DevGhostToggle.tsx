import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Ghost } from 'lucide-react'
import styles from './DevGhostToggle.module.css'

/**
 * `Noto 고스트` 토글. 개발용이라 캔버스 밖, 화면 명세 플로팅 버튼(`ScreenSpecButton`) 바로 위에 같은 모양으로 띄운다.
 * 자소 탭의 획 편집과 레이아웃 편집이 같이 쓴다(둘은 동시에 안 뜬다). 켬/끔 기억은 호출자 몫이다.
 * body로 포털해도 React 이벤트는 부모 캔버스로 올라가므로 pointerdown을 막아 선택 해제를 피한다.
 */
export function DevGhostToggle({ pressed, onToggle, testId, children }: { pressed: boolean; onToggle: () => void; testId: string; children?: ReactNode }) {
  return createPortal(
    <button type="button" className={styles.toggle} aria-pressed={pressed} aria-label="Noto 고스트" title="Noto 고스트 (개발용)" data-testid={testId} onPointerDown={(event) => event.stopPropagation()} onClick={onToggle}>
      <span className={styles.tab}><Ghost size={18} /></span>
      {children}
    </button>,
    document.body,
  )
}
