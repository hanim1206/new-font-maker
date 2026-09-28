import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './CalibrationSentenceEditor.module.css'
import mode from './GlobalStyleMode.module.css'
import { StylePicto, type StylePictoKind } from './StylePicto'

export type GlobalStylePanel = 'body' | 'brush' | 'beak'

const TABS: { id: GlobalStylePanel; label: string; short: string; picto: StylePictoKind }[] = [
  { id: 'body', label: '글자 네모꼴', short: '네모꼴', picto: 'body' },
  // 굵기 · 대비 · 붓 · 둥글기는 모두 획의 속성이라 한 탭(09-28 사용자).
  { id: 'brush', label: '획', short: '획', picto: 'weight' },
  { id: 'beak', label: '부리', short: '부리', picto: 'beak' },
]

export function GlobalStyleTrackpad({
  panel,
  onPanelChange,
  onClose,
  bodyControls,
  brushControls,
  beakControls,
  fill = false,
  closable = true,
}: {
  panel: GlobalStylePanel
  onPanelChange: (panel: GlobalStylePanel) => void
  onClose: () => void
  bodyControls: ReactNode
  brushControls: ReactNode
  beakControls: ReactNode
  /** 셸 안: 하단에 붙은 작은 패널이 아니라 문장 · 캔버스 아래 남은 높이를 다 쓴다. */
  fill?: boolean
  /** 폰트 탭처럼 패널이 화면 자체인 곳은 닫기가 없다. 그런 곳은 머리 글줄도 없고, 탭이 화면 아래에 그림과 함께 붙는다. */
  closable?: boolean
}) {
  const tabs = <div className={`${mode.tabs} ${closable ? '' : mode.dock}`} role="tablist" aria-label="글로벌 스타일 항목">
    {TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={panel === tab.id} onClick={() => onPanelChange(tab.id)}>
      {closable ? tab.label : <><StylePicto kind={tab.picto} /><span>{tab.short}</span></>}
    </button>)}
  </div>
  return (
    <section className={`${styles.brushSection} ${mode.panel} ${fill ? mode.fill : ''}`} aria-label="글로벌 스타일 설정">
      <div className={styles.brushDrawer}>
        {closable && <header className={styles.brushHeader}>
          <div><strong>글로벌 스타일</strong><span>글자 전체 인상 설정</span></div>
          <button type="button" onClick={onClose} aria-label="글로벌 스타일 설정 닫기"><X size={17} /></button>
        </header>}

        {closable && tabs}
        {panel === 'body' ? bodyControls : panel === 'brush' ? brushControls : beakControls}
        {!closable && tabs}
      </div>
    </section>
  )
}
