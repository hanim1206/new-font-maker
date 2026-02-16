import { useEffect } from 'react'
import { ControlPanel } from './components/ControlPanel/ControlPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { EditorPanel } from './components/EditorPanel/EditorPanel'
import { useUIStore } from './stores/uiStore'
import { cn } from '@/lib/utils'

export default function App() {
  const { viewMode, setViewMode, isMobile, setIsMobile } = useUIStore()

  // 반응형 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setIsMobile])

  // 데스크톱: 좌측 인풋/프리뷰 | 중앙 편집메뉴 | 우측 편집기
  if (!isMobile) {
    return (
      <div className="grid grid-cols-[300px_280px_1fr] h-screen bg-background text-foreground font-sans">
        {/* 좌측: 인풋 + 프리뷰 */}
        <aside className="overflow-y-auto overflow-x-hidden border-r border-border-subtle">
          <PreviewPanel />
        </aside>

        {/* 중앙: 편집 메뉴 */}
        <section className="overflow-y-auto overflow-x-hidden border-r border-border-subtle">
          <ControlPanel />
        </section>

        {/* 우측: 편집 영역 */}
        <section className="overflow-y-auto overflow-x-hidden">
          <EditorPanel />
        </section>
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
