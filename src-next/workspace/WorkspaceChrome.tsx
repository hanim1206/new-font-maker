import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Menu,
  Redo2,
  ScanSearch,
  Shapes,
  Undo2,
} from 'lucide-react'
import styles from './WorkspaceChrome.module.css'

export type WorkspaceArea = 'jamo' | 'review'
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
  history,
  menu,
  menuBadge,
  tools,
}: {
  children: ReactNode
  drawer?: ReactNode
  activeArea: WorkspaceArea
  projectName?: string
  history?: WorkspaceHistoryControls
  /** 머리 `☰` 메뉴에서 화면 이동(자소 · 검수) 아래에 넣을 도구(링크·버튼). 항목을 누르면 메뉴는 닫힌다. */
  menu?: ReactNode
  /** 메뉴 안 도구의 진행 상태를 `☰` 단추에 점으로 보인다. */
  menuBadge?: 'busy' | 'done' | 'failed' | null
  /** 머리 오른쪽, 되돌리기 앞에 늘 보이는 도구(어느 모드에서든 쓰는 것). */
  tools?: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.projectHeader}>
          {/* 왼쪽은 이동(햄버거), 오른쪽은 편집 기록. 읽기만 하는 모드 표시는 두지 않는다. */}
          <div className={styles.headerMenu}>
            <button type="button" aria-label="주 메뉴" aria-haspopup="menu" aria-expanded={menuOpen} data-badge={menuBadge ?? undefined} onClick={() => setMenuOpen((open) => !open)}><Menu size={20} /></button>
            {/* 메뉴는 늘 DOM에 있다(도구의 상태·testid가 닫혀 있어도 읽힌다). 닫히면 숨기기만 한다. */}
            {menuOpen && <div className={styles.moreBackdrop} onClick={() => setMenuOpen(false)} aria-hidden="true" />}
            <div className={styles.moreMenu} hidden={!menuOpen} onClick={() => setMenuOpen(false)} data-testid="workspace-more-menu">
              {/* 하단 내비를 없애고 화면 이동을 여기로 옮겼다. 출력은 화면이 넘기는 도구의 `OTF 추출`이 맡는다. */}
              <nav className={styles.menuNav} aria-label="프로젝트 주 내비게이션">
                <a href="/workspace/jamo" aria-current={activeArea === 'jamo' ? 'page' : undefined}><Shapes size={18} /><em>자소</em></a>
                <a href="/workspace/review" aria-current={activeArea === 'review' ? 'page' : undefined}><ScanSearch size={18} /><em>검수</em></a>
              </nav>
              {menu}
            </div>
          </div>
          <div className={styles.projectIdentity}>
            <strong>{projectName}</strong>
          </div>
          <div className={styles.headerActions} aria-label="프로젝트 편집 기록">
            {tools}
            <button type="button" disabled={!history?.canUndo} onClick={history?.onUndo} aria-label="형태 편집 실행 취소"><Undo2 size={18} /></button>
            <button type="button" disabled={!history?.canRedo} onClick={history?.onRedo} aria-label="형태 편집 다시 실행"><Redo2 size={18} /></button>
          </div>
        </header>

        {children}
        {drawer}
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
