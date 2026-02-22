import { useEffect, useCallback, useState, useRef } from 'react'
import { ControlPanel } from './components/ControlPanel/ControlPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { EditorPanel } from './components/EditorPanel/EditorPanel'
import { ProjectManager } from './components/ProjectManager'
import { AuthPanel } from './components/AuthPanel'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { generateAndDownloadFont } from './services/fontGenerator'

export default function App() {
  const { viewMode, setViewMode, isMobile, setIsMobile, inputText, setInputText } = useUIStore()
  const user = useAuthStore((s) => s.user)
  const [projectManagerOpen, setProjectManagerOpen] = useState(false)
  const [authPanelOpen, setAuthPanelOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  const exportingRef = useRef(false)

  const handleExportTTF = useCallback(async () => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportProgress('준비 중...')
    try {
      const result = await generateAndDownloadFont({
        familyName: 'FontMaker',
        onProgress: (_completed, _total, phase) => {
          setExportProgress(phase)
        },
      })
      if (!result.success) {
        alert(`내보내기 실패: ${result.error}`)
      }
    } finally {
      setExporting(false)
      setExportProgress('')
      exportingRef.current = false
    }
  }, [])

  // 인증 상태 리스너 초기화 (initialize 참조 안정성 무관하게 1회만)
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize()
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClearStorage = useCallback(() => {
    if (confirm('로컬스토리지를 비우면 모든 편집 데이터가 초기화됩니다.\n계속하시겠습니까?')) {
      // Supabase 세션 토큰은 보존하고 앱 데이터만 삭제
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && !key.startsWith('sb-')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
      window.location.reload()
    }
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

  // 데스크톱: 상단 (인풋 + 가로 프리뷰) → 하단 편집기
  if (!isMobile) {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground font-sans">
        {/* 최상단: 텍스트 입력 + 가로 글자 프리뷰 */}
        <div className="shrink-0 border-b border-border-subtle bg-[#0f0f0f]">
          <div className="flex items-center gap-3 px-4 py-2">
            <Input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="한글 입력 (예: 한글샘플)"
              maxLength={50}
              className="w-[240px] shrink-0 px-3 py-2 text-base bg-surface-2 border border-border rounded-lg text-foreground font-sans focus:border-primary"
            />
            <div className="relative shrink-0">
              <Button
                variant="default"
                size="sm"
                onClick={() => setProjectManagerOpen(!projectManagerOpen)}
                title="프로젝트 저장/불러오기"
              >
                프로젝트
              </Button>
              <ProjectManager
                open={projectManagerOpen}
                onClose={() => setProjectManagerOpen(false)}
              />
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearStorage}
              title="로컬스토리지 초기화"
              className="shrink-0"
            >
              Reset
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleExportTTF}
              disabled={exporting}
              title={exporting ? exportProgress : 'TTF 폰트 파일 다운로드'}
              className="shrink-0"
            >
              {exporting ? exportProgress : 'TTF 내보내기'}
            </Button>
            <PreviewPanel horizontal />
            {/* 우측 끝: 인증 버튼 */}
            <div className="relative shrink-0 ml-auto">
              <Button
                variant={user ? 'default' : 'default'}
                size="sm"
                onClick={() => setAuthPanelOpen(!authPanelOpen)}
              >
                {user ? user.email?.split('@')[0] : '로그인'}
              </Button>
              <AuthPanel
                open={authPanelOpen}
                onClose={() => setAuthPanelOpen(false)}
              />
            </div>
          </div>
        </div>

        {/* 메인: 편집기 전체 폭 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <EditorPanel />
        </div>
      </div>
    )
  }

  // 모바일: 3개 탭 (리모콘 / 미리보기 / 편집)
  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans">
      <header className="shrink-0 px-4 py-3 bg-[#0f0f0f] border-b border-border-subtle">
        <h1 className="text-xl font-bold mb-3 bg-gradient-to-br from-primary-light to-accent-pink bg-clip-text text-transparent">
          Font Maker
        </h1>
        <nav className="flex gap-2">
          <TabButton
            active={viewMode === 'presets'}
            onClick={() => setViewMode('presets')}
          >
            리모콘
          </TabButton>
          <TabButton
            active={viewMode === 'preview'}
            onClick={() => setViewMode('preview')}
          >
            미리보기
          </TabButton>
          <TabButton
            active={viewMode === 'editor'}
            onClick={() => setViewMode('editor')}
          >
            편집
          </TabButton>
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {viewMode === 'presets' && <ControlPanel />}
        {viewMode === 'preview' && <PreviewPanel />}
        {viewMode === 'editor' && <EditorPanel />}
      </main>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      className={cn(
        'flex-1 py-2.5 px-4 text-sm font-medium rounded-md border cursor-pointer transition-all duration-150 ease-in-out font-sans',
        active
          ? 'bg-primary border-primary text-white'
          : 'bg-surface-2 border-border text-muted hover:bg-surface-3 hover:text-muted-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
