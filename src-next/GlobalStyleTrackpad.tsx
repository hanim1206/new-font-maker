import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './CalibrationSentenceEditor.module.css'
import mode from './GlobalStyleMode.module.css'
import { DEV_TOOLS_ENABLED } from './devTools'
import { StylePicto, type StylePictoKind } from './StylePicto'

export type GlobalStylePanel = 'body' | 'brush' | 'beak'

const TABS: { id: GlobalStylePanel; label: string; short: string; picto: StylePictoKind }[] = [
  { id: 'body', label: '글자 네모꼴', short: '네모꼴', picto: 'body' },
  // 굵기 · 대비 · 붓 · 둥글기는 모두 획의 속성이라 한 탭(09-28 사용자).
  { id: 'brush', label: '획', short: '획', picto: 'weight' },
  { id: 'beak', label: '부리', short: '부리', picto: 'beak' },
]
/**
 * 스타일 화면에서 잠근 탭(`개발 중이에요` 표시 · 누를 수 없음). 네모꼴은 편집 화면이 네모꼴을 따르게 된 뒤(`2026-10-01_네모꼴-열기`) 풀었지만,
 * 속공간 지키기까지 끝나기 전에는 배포 빌드에서 사용자에게 열지 않는다(10-01 다시 잠금). 개발 서버 · e2e는 열려 있다.
 * 풀 때는 이 줄을 `[]`로 되돌린다.
 */
const LOCKED: readonly GlobalStylePanel[] = DEV_TOOLS_ENABLED ? [] : ['body']

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
  const locked = (id: GlobalStylePanel) => !closable && LOCKED.includes(id)
  // 잠긴 탭으로 열리면(기본 탭 · 옛 상태) 첫 번째 열린 탭을 보인다.
  const shown = locked(panel) ? TABS.find((tab) => !locked(tab.id))!.id : panel
  const tabs = <div className={`${mode.tabs} ${closable ? '' : mode.dock}`} role="tablist" aria-label="글로벌 스타일 항목">
    {TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={shown === tab.id} disabled={locked(tab.id)} data-locked={locked(tab.id) || undefined} onClick={() => onPanelChange(tab.id)}>
      {closable ? tab.label : <><StylePicto kind={tab.picto} /><span>{tab.short}</span>{locked(tab.id) && <small>개발 중이에요</small>}</>}
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
        {shown === 'body' ? bodyControls : shown === 'brush' ? brushControls : beakControls}
        {!closable && tabs}
      </div>
    </section>
  )
}
