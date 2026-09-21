import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Ghost } from 'lucide-react'
import styles from './DevGhostToggle.module.css'

/**
 * 개발용 스티키 토글. 캔버스 밖, 화면 명세 플로팅 버튼(`ScreenSpecButton`) 바로 위에 같은 모양으로 띄운다.
 * `children`은 버튼 옆 표지(짧은 글), `panel`은 켰을 때 옆에 뜨는 도구(select 같은 입력)다.
 * body로 포털해도 React 이벤트는 부모로 올라가므로 pointerdown을 막아 캔버스 선택 해제를 피한다.
 */
export function DevStickyToggle({ pressed, onToggle, testId, label, icon, children, panel }: { pressed: boolean; onToggle: () => void; testId: string; label: string; icon: ReactNode; children?: ReactNode; panel?: ReactNode }) {
  return createPortal(
    <>
      <button type="button" className={styles.toggle} aria-pressed={pressed} aria-label={label} title={`${label} (개발용)`} data-testid={testId} onPointerDown={(event) => event.stopPropagation()} onClick={onToggle}>
        <span className={styles.tab}>{icon}</span>
        {children}
      </button>
      {pressed && panel && <div className={styles.panel} onPointerDown={(event) => event.stopPropagation()}>{panel}</div>}
    </>,
    document.body,
  )
}

/** `Noto 고스트` 토글. 자소 탭의 획 편집과 레이아웃 편집이 같이 쓴다(둘은 동시에 안 뜬다). 켬/끔 기억은 호출자 몫이다. */
export function DevGhostToggle({ pressed, onToggle, testId, children }: { pressed: boolean; onToggle: () => void; testId: string; children?: ReactNode }) {
  return <DevStickyToggle pressed={pressed} onToggle={onToggle} testId={testId} label="Noto 고스트" icon={<Ghost size={18} />}>{children}</DevStickyToggle>
}
