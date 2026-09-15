import type { ReactNode } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Grid2X2,
  Home,
  MoreHorizontal,
  Redo2,
  ScanSearch,
  Shapes,
  Undo2,
  Upload,
} from 'lucide-react'
import styles from './WorkspaceChrome.module.css'

export type WorkspaceArea = 'home' | 'skeleton' | 'jamo' | 'review' | 'output'
export type DrawerState = 'collapsed' | 'medium' | 'expanded'

export interface WorkspaceHistoryControls {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export function MobileWorkspaceShell({
  children,
  drawer,
  activeArea,
  projectName = '새 한글 폰트',
  statusLabel = '화면 검토 모드',
  history,
}: {
  children: ReactNode
  drawer?: ReactNode
  activeArea: WorkspaceArea
  projectName?: string
  statusLabel?: string
  history?: WorkspaceHistoryControls
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.projectHeader}>
          <a className={styles.backLink} href="/" aria-label="문장 보정으로 돌아가기">문장 보정</a>
          <div className={styles.projectIdentity}>
            <strong>{projectName}</strong>
            <span>{statusLabel}</span>
          </div>
          <div className={styles.headerActions} aria-label="프로젝트 편집 기록">
            <button type="button" disabled={!history?.canUndo} onClick={history?.onUndo} aria-label="형태 편집 실행 취소"><Undo2 size={18} /></button>
            <button type="button" disabled={!history?.canRedo} onClick={history?.onRedo} aria-label="형태 편집 다시 실행"><Redo2 size={18} /></button>
            <button type="button" disabled aria-label="프로젝트 더보기"><MoreHorizontal size={20} /></button>
          </div>
        </header>

        {children}
        {drawer}

        <nav className={styles.primaryNav} aria-label="프로젝트 주 내비게이션">
          <button type="button" disabled aria-current={activeArea === 'home' ? 'page' : undefined}><Home size={19} /><span>홈</span></button>
          <a href="/workspace/skeleton" aria-current={activeArea === 'skeleton' ? 'page' : undefined}><Grid2X2 size={19} /><span>뼈대</span></a>
          <a href="/workspace/jamos" aria-current={activeArea === 'jamo' ? 'page' : undefined}><Shapes size={19} /><span>자소</span></a>
          <a href="/workspace/review" aria-current={activeArea === 'review' ? 'page' : undefined}><ScanSearch size={19} /><span>검수</span></a>
          <button type="button" disabled aria-current={activeArea === 'output' ? 'page' : undefined}><Upload size={19} /><span>출력</span></button>
        </nav>
      </div>
    </main>
  )
}

export interface EditScopeItem {
  label: string
  value: string
}

export function EditScopeBar({
  items,
  actionLabel = '범위 변경',
  onRequestChange,
}: {
  items: readonly EditScopeItem[]
  actionLabel?: string
  onRequestChange?: () => void
}) {
  return (
    <div className={styles.scopeBar} aria-label="수정 범위">
      {items.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
      <button type="button" disabled={!onRequestChange} onClick={onRequestChange}>{actionLabel}</button>
    </div>
  )
}

export interface ComparisonItem {
  id: string
  label: string
  detail: string
  preview: ReactNode
}

export function ContextComparisonStrip({
  heading,
  eyebrow = '관찰 문맥',
  items,
  observedId,
  onObserve,
  description,
  interactive = true,
}: {
  heading: string
  eyebrow?: string
  items: readonly ComparisonItem[]
  observedId: string
  onObserve?: (id: string) => void
  description?: string
  interactive?: boolean
}) {
  const active = items.find((item) => item.id === observedId) ?? items[0]
  return (
    <section className={styles.comparisonSection} aria-labelledby="workspace-context-heading">
      <div className={styles.sectionHeading}>
        <div><span>{eyebrow}</span><h2 id="workspace-context-heading">{heading}</h2></div>
        {interactive && active && <strong>{active.label} · {active.detail}</strong>}
      </div>
      <ul className={styles.comparisonStrip} aria-label={heading}>
        {items.map((item) => (
          <li key={item.id} data-context-id={item.id}>
            {interactive ? <button
              type="button"
              className={styles.contextCard}
              aria-current={observedId === item.id ? 'true' : undefined}
              onClick={() => onObserve?.(item.id)}
              aria-label={`${item.label} ${item.detail} 관찰`}
            >
              <span className={styles.cardPreview}>{item.preview}</span>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </button> : <div className={styles.contextCard} aria-label={`${item.label} ${item.detail} 연결 결과`}>
              <span className={styles.cardPreview}>{item.preview}</span>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>}
          </li>
        ))}
      </ul>
      {description && <p>{description}</p>}
    </section>
  )
}

export function PrecisionControlDrawer({
  state,
  onStateChange,
  targetLabel,
  children,
}: {
  state: DrawerState
  onStateChange: (state: DrawerState) => void
  targetLabel: string
  children?: ReactNode
}) {
  const expanded = state !== 'collapsed'
  const toggle = () => onStateChange(state === 'collapsed' ? 'medium' : state === 'medium' ? 'expanded' : 'collapsed')
  return (
    <section className={styles.drawer} data-state={state} aria-label="정밀 조절">
      <button type="button" className={styles.drawerHandle} onClick={toggle} aria-expanded={expanded} aria-label="정밀 조절">
        <span><strong>정밀 조절</strong><small>{targetLabel}</small></span>
        {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
      </button>
      {expanded && <div className={styles.drawerBody}>{children}</div>}
    </section>
  )
}
