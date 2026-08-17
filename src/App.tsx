import { useEffect } from 'react'
import { EditorPanel } from './components/EditorPanel/EditorPanel'
import { MobileLayout } from './components/mobile/MobileLayout'
import { NavMenu } from './components/NavMenu'
import { SaveButton } from './components/SaveButton'
import { ProjectListPage } from './components/ProjectListPage'
import { HomePage } from './components/HomePage'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PreviewPanel } from './components/PreviewPanel/PreviewPanel'
import { AuthDialog } from './components/AuthDialog'
import { MobileEditorV2Page } from './features/mobile-editor/MobileEditorV2Page'
import {
  APP_ROUTE_POP_EVENT,
  applyAppRoute,
  appRouteToPath,
  getCurrentRouteHistoryState,
  parseAppRoute,
  pushAppRoute,
  type AppRouteHistoryState,
  type AppRoutePopDetail,
} from './utils/appRoutes'

export default function App() {
  const { isMobile, setIsMobile } = useUIStore()
  const currentPage = useUIStore((s) => s.currentPage)
  const currentProjectName = useUIStore((s) => s.currentProjectName)

  // 브라우저 뒤로/앞으로 가기는 편집기에서 미저장 분기를 처리한 뒤 적용한다.
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const route = parseAppRoute(window.location.pathname)
      const state = event.state as AppRouteHistoryState | null
      if (useUIStore.getState().currentPage === 'editor') {
        window.dispatchEvent(new CustomEvent<AppRoutePopDetail>(APP_ROUTE_POP_EVENT, {
          detail: {
            route,
            state: state?.fontMakerRoute ? state : null,
          },
        }))
        return
      }
      applyAppRoute(route)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // 홈과 프로젝트 목록도 편집 URL에서 정상적으로 왕복할 수 있게 히스토리에 기록한다.
  useEffect(() => {
    if (currentPage === 'editor') return
    const route = currentPage === 'projects'
      ? { page: 'projects' as const }
      : currentPage === 'editor-v2'
        ? { page: 'editor-v2' as const }
        : { page: 'home' as const }
    if (window.location.pathname === appRouteToPath(route)) return
    const currentState = getCurrentRouteHistoryState()
    if (currentState?.route.page === currentPage) return
    pushAppRoute(route)
  }, [currentPage])

  // 인증 상태 리스너 초기화 (initialize 참조 안정성 무관하게 1회만)
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize()
    return unsubscribe
  }, [])

  // 반응형 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setIsMobile])

  // 홈 화면
  if (currentPage === 'home') {
    return (
      <div className="h-screen bg-background text-foreground font-sans">
        <HomePage />
        <AuthDialog />
      </div>
    )
  }

  // 프로젝트 목록 페이지 (PC/모바일 공용)
  if (currentPage === 'projects') {
    return (
      <div className="h-screen bg-background text-foreground font-sans">
        <ProjectListPage />
        <AuthDialog />
      </div>
    )
  }

  if (currentPage === 'editor-v2') {
    return <MobileEditorV2Page />
  }

  // 데스크톱
  if (!isMobile) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-screen bg-background text-foreground font-sans">
          {/* 최상단: 햄버거 + 프로젝트명 + 가로 글자 프리뷰 (인풋 포함) */}
          <div className="shrink-0 border-b border-border-subtle bg-surface">
            <div className="flex items-center gap-3 px-4 py-2">
              <NavMenu />
              <SaveButton />
              <span className="text-xs text-muted truncate max-w-[150px] shrink-0">
                {currentProjectName || '새 폰트 (미저장)'}
              </span>
              <PreviewPanel horizontal />
            </div>
          </div>

          {/* 메인: 편집기 전체 폭 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <EditorPanel />
          </div>
        </div>
        <AuthDialog />
      </TooltipProvider>
    )
  }

  // 모바일: 캔버스 중심 + 드로어 방식
  return (
    <>
      <MobileLayout />
      <AuthDialog />
    </>
  )
}
