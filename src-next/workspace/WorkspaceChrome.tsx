import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FolderOpen,
  LogOut,
  Menu,
  Redo2,
  ScanSearch,
  Shapes,
  Undo2,
} from 'lucide-react'
import { flushAccountFont, useAccountSaveStore } from '../accountFontSync'
import { authGateMode, signOutAndReload } from '../betaAuth'
import { useFontExportStore } from '../fontExportStore'
import { onLinkClick } from '../router'
import { useUIStore } from '../../src/stores/uiStore'
import { SaveToast } from './SaveToast'
import styles from './WorkspaceChrome.module.css'

export type WorkspaceArea = 'jamo' | 'review'

export interface WorkspaceHistoryControls {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export function MobileWorkspaceShell({
  children,
  activeArea,
  projectName,
  history,
  menu,
  menuBadge,
  tools,
}: {
  children: ReactNode
  activeArea: WorkspaceArea
  /** 머리 가운데 이름. 안 넘기면 지금 연 폰트 이름(어느 화면이든 같다). */
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
  const openedName = useUIStore((state) => state.currentProjectName)
  const title = projectName ?? openedName ?? '새 한글 폰트'
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
                <a href="/workspace/jamo" onClick={onLinkClick} aria-current={activeArea === 'jamo' ? 'page' : undefined}><Shapes size={18} /><em>자소</em></a>
                <a href="/workspace/review" onClick={onLinkClick} aria-current={activeArea === 'review' ? 'page' : undefined}><ScanSearch size={18} /><em>검수</em></a>
              </nav>
              {menu}
              {/* 로그아웃은 자주 누를 일이 없어 메뉴 맨 끝에 둔다. 로그인 게이트가 꺼진 개발 서버에서는 없다. */}
              {authGateMode() === 'on' && <nav className={styles.menuNav} aria-label="계정">
                <button type="button" onClick={() => void goToFontHome()} data-testid="workspace-font-home"><FolderOpen size={18} /><em>내 폰트</em></button>
                <button type="button" onClick={() => void signOutAndReload()} data-testid="workspace-sign-out"><LogOut size={18} /><em>로그아웃</em></button>
              </nav>}
            </div>
          </div>
          <div className={styles.projectIdentity}>
            <strong>{title}</strong>
          </div>
          <div className={styles.headerActions} aria-label="프로젝트 편집 기록">
            {tools}
            <button type="button" disabled={!history?.canUndo} onClick={history?.onUndo} aria-label="형태 편집 실행 취소"><Undo2 size={18} /></button>
            <button type="button" disabled={!history?.canRedo} onClick={history?.onRedo} aria-label="형태 편집 다시 실행"><Redo2 size={18} /></button>
          </div>
        </header>

        {children}
      </div>
      <AccountSaveToast />
      <ExportNoticeToast />
    </main>
  )
}

/** 추출이 실패했거나 빈 칸으로 넣은 글자가 있으면 그 자리에서 알린다. 닫을 때까지 남는다. */
function ExportNoticeToast() {
  const notice = useFontExportStore((state) => state.notice)
  const dismiss = useFontExportStore((state) => state.dismissNotice)
  if (!notice) return null
  return <SaveToast tone="error" message={notice} onDismiss={dismiss} />
}

/** 메인 화면으로. 못 올린 변경은 먼저 올려 본다(못 올려도 사본의 이름표에 남아 메인 화면이 다시 올린다). */
async function goToFontHome(): Promise<void> {
  await flushAccountFont()
  window.location.assign('/fonts')
}

/** 계정 자동 저장이 실패했을 때만 알린다. 성공은 알리지 않고, 저장 중에도 편집을 막지 않는다. */
function AccountSaveToast() {
  const failed = useAccountSaveStore((state) => state.status === 'error')
  if (!failed) return null
  return <SaveToast
    tone="error"
    message="계정에 저장하지 못했어요. 이 기기에는 남아 있고, 잠시 뒤 다시 올려요."
    onDismiss={() => useAccountSaveStore.setState({ status: 'idle' })}
  />
}
