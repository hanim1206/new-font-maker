import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './CalibrationSentenceEditor.module.css'
import mode from './GlobalStyleMode.module.css'

export type GlobalStylePanel = 'body' | 'brush' | 'tone' | 'beak'

const TABS: { id: GlobalStylePanel; label: string }[] = [
  { id: 'body', label: '글자 네모꼴' },
  { id: 'brush', label: '획 스타일' },
  { id: 'tone', label: '굵기' },
  { id: 'beak', label: '부리' },
]

export function GlobalStyleTrackpad({
  panel,
  onPanelChange,
  onClose,
  bodyControls,
  brushControls,
  toneControls,
  beakControls,
  fill = false,
  closable = true,
}: {
  panel: GlobalStylePanel
  onPanelChange: (panel: GlobalStylePanel) => void
  onClose: () => void
  bodyControls: ReactNode
  brushControls: ReactNode
  toneControls: ReactNode
  beakControls: ReactNode
  /** 셸 안: 하단에 붙은 작은 패널이 아니라 문장 · 캔버스 아래 남은 높이를 다 쓴다. */
  fill?: boolean
  /** 폰트 탭처럼 패널이 화면 자체인 곳은 닫기가 없다. */
  closable?: boolean
}) {
  return (
    <section className={`${styles.brushSection} ${mode.panel} ${fill ? mode.fill : ''}`} aria-label="글로벌 스타일 설정">
      <div className={styles.brushDrawer}>
        <header className={styles.brushHeader}>
          <div><strong>글로벌 스타일</strong><span>글자 전체 인상 설정</span></div>
          {closable && <button type="button" onClick={onClose} aria-label="글로벌 스타일 설정 닫기"><X size={17} /></button>}
        </header>

        <div className={mode.tabs} role="tablist" aria-label="글로벌 스타일 항목">
          {TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={panel === tab.id} onClick={() => onPanelChange(tab.id)}>{tab.label}</button>)}
        </div>

        {panel === 'body' ? bodyControls : panel === 'brush' ? brushControls : panel === 'tone' ? toneControls : beakControls}
      </div>
    </section>
  )
}
