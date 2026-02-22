import { useEffect } from 'react'
import { EditorPanel } from './components/EditorPanel/EditorPanel'
import { MobileLayout } from './components/mobile/MobileLayout'
import { NavMenu } from './components/NavMenu'
import { ProjectListPage } from './components/ProjectListPage'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PreviewPanel } from './components/PreviewPanel/PreviewPanel'

export default function App() {
  const { isMobile, setIsMobile } = useUIStore()
  const currentPage = useUIStore((s) => s.currentPage)

  // 인증 상태 리스너 초기화 (initialize 참조 안정성 무관하게 1회만)
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize()
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 프로젝트 목록 페이지 (PC/모바일 공용)
  if (currentPage === 'projects') {
    return (
      <div className="h-screen bg-background text-foreground font-sans">
        <ProjectListPage />
      </div>
    )
  }

  // 데스크톱
  if (!isMobile) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-screen bg-background text-foreground font-sans">
          {/* 최상단: 햄버거 + 가로 글자 프리뷰 (인풋 포함) */}
          <div className="shrink-0 border-b border-border-subtle bg-[#0f0f0f]">
            <div className="flex items-center gap-3 px-4 py-2">
              <NavMenu />
              <PreviewPanel horizontal />
            </div>
          </div>

          {/* 메인: 편집기 전체 폭 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <EditorPanel />
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // 모바일: 캔버스 중심 + 드로어 방식
  return <MobileLayout />
}
