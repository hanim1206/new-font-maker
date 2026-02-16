import { useEffect } from 'react'
import { ControlPanel } from './components/ControlPanel/ControlPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { EditorPanel } from './components/EditorPanel/EditorPanel'
import { useUIStore } from './stores/uiStore'
import './App.css'

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
      <div className="app-layout">
        {/* 좌측: 인풋 + 프리뷰 */}
        <aside className="preview-sidebar">
          <PreviewPanel />
        </aside>

        {/* 중앙: 편집 메뉴 */}
        <section className="control-section">
          <ControlPanel />
        </section>

        {/* 우측: 편집 영역 */}
        <section className="editor-section">
          <EditorPanel />
        </section>
      </div>
    )
  }

  // 모바일: 3개 탭 (리모콘 / 미리보기 / 편집)
  return (
    <div className="app-container mobile">
      <header className="mobile-header">
        <h1 className="app-title">Font Maker</h1>
        <nav className="tab-nav">
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

      <main className="mobile-content">
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
      className={`tab-button ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
