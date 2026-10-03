import type { ReactNode } from 'react'
import { ChevronLeft, Redo2, Undo2 } from 'lucide-react'
import { flushAccountFont, useAccountSaveStore } from '../accountFontSync'
import { useFontExportStore } from '../fontExportStore'
import { useUIStore } from '../../src/stores/uiStore'
import { useWorkbenchStore } from '../../src/stores/workbenchStore'
import { navigate, onLinkClick } from '../router'
import { useHistoryShortcuts } from './keyboardShortcuts'
import { SaveToast } from './SaveToast'
import { ReportButton } from '../ReportButton'
import { Pressable } from '../components/ui/pressable'
import styles from './WorkspaceChrome.module.css'

/** 폰트 덱의 화면 셋. 하단 탭은 없다 — 입구는 대시보드(스타일 · 레이아웃 · 섹션 홈 · 검수)가 맡는다. */
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
 * 하단 탭 · 햄버거 메뉴는 없다 — 화면 사이 이동은 대시보드가 하고, 출력은 폰트 화면, 로그아웃은 대시보드 계정 메뉴.
 */
export function MobileWorkspaceShell({
  children,
  projectName,
  history,
  tools,
  back,
  cover,
  heading,
  beforeLeave,
}: {
  children: ReactNode
  /** 어느 화면인지. 탭은 없어졌지만 부르는 쪽이 이름표로 준다. */
  activeArea: WorkspaceArea
  /** 머리 가운데 이름. 안 넘기면 지금 연 폰트 이름(어느 화면이든 같다). */
  projectName?: string
  /** 대시보드에서 들어온 화면의 제목(검수 · 스타일). 주면 `‹` 옆에 왼쪽 정렬로 굵게 둔다 — 대시보드 섹션 홈 머리와 같은 생김새. 편집 기록(`history`)을 안 넘긴 보기 전용 화면은 되돌리기 단추도 뺀다. */
  heading?: string
  history?: WorkspaceHistoryControls
  /** 머리 오른쪽, 되돌리기 앞에 늘 보이는 도구(어느 모드에서든 쓰는 것). */
  tools?: ReactNode
  /** 머리 왼쪽 문. 기본은 위 덱(`내 폰트`). 폰트 덱 안의 하위 화면(추출 완료)은 `‹ 폰트`처럼 제 상위를 준다. 같은 화면 안의 얹힌 층(획 편집 → 레이아웃)은 `onClick`. */
  back?: { label: string; href: string } | { label: string; onClick: () => void }
  /** 머리 아래(내용 자리)만 덮는 층. 추출 대기처럼 내용은 막되 머리 `‹`로는 나갈 수 있어야 하는 것. */
  cover?: ReactNode
  /** 머리 `‹`로 나가기 전에 부르는 문. 주면 나가는 일(`go`)을 넘기고, 부르는 쪽이 물은 뒤 `go`를 부른다(획 편집의 반영 고르기). */
  beforeLeave?: (go: () => void) => void
}) {
  const openedName = useUIStore((state) => state.currentProjectName)
  const title = projectName ?? openedName ?? '새 한글 폰트'
  // ⌘Z · ⇧⌘Z는 머리의 되돌리기 · 다시 실행 단추와 같은 일.
  useHistoryShortcuts(history)
  const leave = (go: () => void) => { if (beforeLeave) beforeLeave(go); else go() }
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.projectHeader}>
          {/* 왼쪽은 위 덱으로 나가는 문 — 화살표만, 오른쪽 머리 단추와 같은 생김새. 이름은 읽기용 레이블에만. 오른쪽은 편집 기록. */}
          {back && 'onClick' in back
            ? <Pressable type="button" className={styles.back} onClick={() => leave(back.onClick)} aria-label={`${back.label}(으)로`} title={back.label} data-testid="workspace-back">
              <ChevronLeft size={20} aria-hidden="true" />
            </Pressable>
            : back
            ? <a className={styles.back} href={back.href} onClick={(event) => { if (!beforeLeave) { onLinkClick(event); return } event.preventDefault(); leave(() => navigate(back.href)) }} aria-label={`${back.label}(으)로`} title={back.label} data-testid="workspace-back">
              <ChevronLeft size={20} aria-hidden="true" />
            </a>
            : <Pressable type="button" className={styles.back} onClick={() => leave(() => void goToFontHome())} aria-label="내 폰트로" title="내 폰트" data-testid="workspace-font-home">
              <ChevronLeft size={20} aria-hidden="true" />
            </Pressable>}
          {heading
            ? <h2 className={styles.heading}>{heading}</h2>
            : <div className={styles.projectIdentity}>
              <strong>{title}</strong>
            </div>}
          {/* 제보는 모든 머리에. 편집 기록을 안 넘긴 보기 전용 화면(검수 · 완성)은 되돌리기만 뺀다. */}
          <div className={styles.headerActions} aria-label="머리 도구">
            {tools}
            <ReportButton />
            {(!heading || history) && <>
              <Pressable type="button" disabled={!history?.canUndo} onClick={history?.onUndo} aria-label="형태 편집 실행 취소"><Undo2 size={18} /></Pressable>
              <Pressable type="button" disabled={!history?.canRedo} onClick={history?.onRedo} aria-label="형태 편집 다시 실행"><Redo2 size={18} /></Pressable>
            </>}
          </div>
        </header>

        {/* 내용 자리. 머리 아래를 다 쓰고, `cover`가 이 자리만 덮는다. */}
        <div className={styles.body}>
          {children}
          {cover && <div className={styles.cover}>{cover}</div>}
        </div>

      </div>
      <AccountSaveToast />
      <ExportNoticeToast />
    </main>
  )
}

/**
 * 추출이 실패했거나 빈 칸으로 넣은 글자가 있으면 그 자리에서 알린다. 닫을 때까지 남는다.
 * 폰트 화면이 아닌 곳에서 추출이 끝나면 화면을 바꾸지 않고 `완료 페이지 보기`만 준다(획을 만지는 중에 화면이 바뀌면 작업이 끊긴다).
 * 대시보드 카드의 다운로드도 이 토스트를 같이 쓴다 — 셸 밖이라 안 그러면 실패가 조용히 지나간다.
 */
export function ExportNoticeToast() {
  const notice = useFontExportStore((state) => state.notice)
  const doneElsewhere = useFontExportStore((state) => state.doneElsewhere)
  const dismiss = useFontExportStore((state) => state.dismissNotice)
  if (notice) return <SaveToast tone="error" message={notice} onDismiss={dismiss} />
  if (doneElsewhere) return <SaveToast tone="done" message="OTF가 나왔어요." onDismiss={dismiss} action={{ label: '완료 페이지 보기', onClick: () => { dismiss(); navigate('/workspace/font/export') } }} />
  return null
}

/**
 * 대시보드로(지금 폰트의 한눈 화면). 섹션 홈에서 도마를 들고 들어왔으면 그 홈으로(묶기 그대로).
 * 못 올린 변경은 먼저 올려 본다(못 올려도 사본의 이름표에 남아 다음에 다시 올린다). 같은 마운트라 새로고침 없이 간다.
 */
async function goToFontHome(): Promise<void> {
  await flushAccountFont()
  navigate(useWorkbenchStore.getState().takeReturnTo() ?? '/dashboard')
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
