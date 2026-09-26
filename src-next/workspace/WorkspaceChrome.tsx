import type { ReactNode } from 'react'
import { ChevronLeft, Redo2, ScanSearch, Shapes, Type, Undo2 } from 'lucide-react'
import { flushAccountFont, useAccountSaveStore } from '../accountFontSync'
import { useFontExportStore } from '../fontExportStore'
import { useUIStore } from '../../src/stores/uiStore'
import { navigate, onLinkClick } from '../router'
import { useHistoryShortcuts } from './keyboardShortcuts'
import { SaveToast } from './SaveToast'
import styles from './WorkspaceChrome.module.css'

/** 폰트 덱의 화면 셋. 하단 탭 하나씩. */
export type WorkspaceArea = 'font' | 'jamo' | 'review'

export interface WorkspaceHistoryControls {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/**
 * 폰트 덱의 셸. 덱 셋(내 폰트 → 폰트 → 획) 가운데 둘째.
 * 머리 왼쪽 `‹ 내 폰트`는 위 덱으로 나가는 문, 가운데는 지금 연 폰트 이름, 오른쪽은 되돌리기 · 다시 실행.
 * 아래는 탭 셋(폰트 · 자소 · 검수). 햄버거 메뉴는 없다 — 항목이 전부 제 자리를 찾았다(출력은 폰트 탭, 로그아웃은 내 폰트).
 */
export function MobileWorkspaceShell({
  children,
  activeArea,
  projectName,
  history,
  tools,
  tabsHidden = false,
  back,
  cover,
}: {
  children: ReactNode
  activeArea: WorkspaceArea
  /** 머리 가운데 이름. 안 넘기면 지금 연 폰트 이름(어느 화면이든 같다). */
  projectName?: string
  history?: WorkspaceHistoryControls
  /** 머리 오른쪽, 되돌리기 앞에 늘 보이는 도구(어느 모드에서든 쓰는 것). */
  tools?: ReactNode
  /** 획 덱처럼 폰트 덱 위에 얹힌 화면은 탭을 감춘다. */
  tabsHidden?: boolean
  /** 머리 왼쪽 문. 기본은 위 덱(`내 폰트`). 폰트 덱 안의 하위 화면(추출 완료)은 `‹ 폰트`처럼 제 상위를 준다. */
  back?: { label: string; href: string }
  /** 머리와 탭 사이(내용 자리)만 덮는 층. 추출 대기처럼 내용은 막되 탭으로는 나갈 수 있어야 하는 것. */
  cover?: ReactNode
}) {
  const openedName = useUIStore((state) => state.currentProjectName)
  const title = projectName ?? openedName ?? '새 한글 폰트'
  // ⌘Z · ⇧⌘Z는 머리의 되돌리기 · 다시 실행 단추와 같은 일.
  useHistoryShortcuts(history)
  return (
    <main className={styles.page}>
      <div className={styles.shell} data-tabs={tabsHidden ? 'hidden' : undefined}>
        <header className={styles.projectHeader}>
          {/* 왼쪽은 위 덱으로 나가는 문 — 화살표만, 대시보드 카드 단추와 같은 40px 원. 이름은 읽기용 레이블에만. 오른쪽은 편집 기록. */}
          {back
            ? <a className={styles.back} href={back.href} onClick={onLinkClick} aria-label={`${back.label}(으)로`} title={back.label} data-testid="workspace-back">
              <ChevronLeft size={20} aria-hidden="true" />
            </a>
            : <button type="button" className={styles.back} onClick={() => void goToFontHome()} aria-label="내 폰트로" title="내 폰트" data-testid="workspace-font-home">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>}
          <div className={styles.projectIdentity}>
            <strong>{title}</strong>
          </div>
          <div className={styles.headerActions} aria-label="프로젝트 편집 기록">
            {tools}
            <button type="button" disabled={!history?.canUndo} onClick={history?.onUndo} aria-label="형태 편집 실행 취소"><Undo2 size={18} /></button>
            <button type="button" disabled={!history?.canRedo} onClick={history?.onRedo} aria-label="형태 편집 다시 실행"><Redo2 size={18} /></button>
          </div>
        </header>

        {/* 내용 자리. 머리 · 탭과 같은 세로 flex라 화면 배분은 전과 같고, `cover`가 이 자리만 덮는다. */}
        <div className={styles.body}>
          {children}
          {cover && <div className={styles.cover}>{cover}</div>}
        </div>

        {!tabsHidden && <nav className={styles.tabs} aria-label="프로젝트 주 내비게이션" data-testid="workspace-tabs">
          <a href="/workspace/font" onClick={onLinkClick} aria-current={activeArea === 'font' ? 'page' : undefined}><Type size={20} aria-hidden="true" /><em>폰트</em></a>
          <a href="/workspace/jamo" onClick={onLinkClick} aria-current={activeArea === 'jamo' ? 'page' : undefined}><Shapes size={20} aria-hidden="true" /><em>자소</em></a>
          <a href="/workspace/review" onClick={onLinkClick} aria-current={activeArea === 'review' ? 'page' : undefined}><ScanSearch size={20} aria-hidden="true" /><em>검수</em></a>
        </nav>}
      </div>
      <AccountSaveToast />
      <ExportNoticeToast />
    </main>
  )
}

/**
 * 추출이 실패했거나 빈 칸으로 넣은 글자가 있으면 그 자리에서 알린다. 닫을 때까지 남는다.
 * 폰트 탭이 아닌 곳에서 추출이 끝나면 화면을 바꾸지 않고 `완료 페이지 보기`만 준다(획을 만지는 중에 화면이 바뀌면 작업이 끊긴다).
 */
function ExportNoticeToast() {
  const notice = useFontExportStore((state) => state.notice)
  const doneElsewhere = useFontExportStore((state) => state.doneElsewhere)
  const dismiss = useFontExportStore((state) => state.dismissNotice)
  if (notice) return <SaveToast tone="error" message={notice} onDismiss={dismiss} />
  if (doneElsewhere) return <SaveToast tone="done" message="OTF가 나왔어요." onDismiss={dismiss} action={{ label: '완료 페이지 보기', onClick: () => { dismiss(); navigate('/workspace/font/export') } }} />
  return null
}

/** 대시보드로(지금 폰트의 한눈 화면). 못 올린 변경은 먼저 올려 본다(못 올려도 사본의 이름표에 남아 다음에 다시 올린다). 같은 마운트라 새로고침 없이 간다. */
async function goToFontHome(): Promise<void> {
  await flushAccountFont()
  navigate('/dashboard')
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
