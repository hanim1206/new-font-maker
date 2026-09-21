import type { ReactNode } from 'react'
import { Italic, Paintbrush, Scan, X } from 'lucide-react'
import styles from './CalibrationSentenceEditor.module.css'

export type GlobalStylePanel = 'body' | 'brush' | 'tone'

export function GlobalStyleTrackpad({
  panel,
  onPanelChange,
  onClose,
  bodyControls,
  brushControls,
  toneControls,
}: {
  panel: GlobalStylePanel
  onPanelChange: (panel: GlobalStylePanel) => void
  onClose: () => void
  bodyControls: ReactNode
  brushControls: ReactNode
  toneControls: ReactNode
}) {
  return (
    <section className={styles.brushSection} aria-label="글로벌 스타일 설정">
      <div className={styles.brushDrawer}>
        <header className={styles.brushHeader}>
          <div><strong>글로벌 스타일</strong><span>글자 전체 인상 설정</span></div>
          <button type="button" onClick={onClose} aria-label="글로벌 스타일 설정 닫기"><X size={17} /></button>
        </header>

        <div className={styles.globalStyleTabs} role="tablist" aria-label="글로벌 스타일 항목">
          <button type="button" role="tab" aria-selected={panel === 'body'} onClick={() => onPanelChange('body')}>
            <Scan size={16} aria-hidden="true" />
            <span><strong>글자 네모꼴</strong><small>크기와 여백</small></span>
          </button>
          <button type="button" role="tab" aria-selected={panel === 'brush'} onClick={() => onPanelChange('brush')}>
            <Paintbrush size={16} aria-hidden="true" />
            <span><strong>획 스타일</strong><small>붓촉과 방향</small></span>
          </button>
          <button type="button" role="tab" aria-selected={panel === 'tone'} onClick={() => onPanelChange('tone')}>
            <Italic size={16} aria-hidden="true" />
            <span><strong>굵기 · 기울기</strong><small>폰트 전체 한 값</small></span>
          </button>
        </div>

        {panel === 'body' ? bodyControls : panel === 'brush' ? brushControls : toneControls}
      </div>
    </section>
  )
}
