import { useUIStore } from '../../stores/uiStore'
import { EditorPanel } from '../EditorPanel/EditorPanel'
import { PreviewPanel } from '../PreviewPanel/PreviewPanel'
import { MobileToolbar } from './MobileToolbar'
import { MobileControlDrawer } from './MobileControlDrawer'
import { MobileInspectorDrawer } from './MobileInspectorDrawer'
import { MobilePreviewDrawer } from './MobilePreviewDrawer'
import { NavMenu } from '../NavMenu'

export function MobileLayout() {
  const { controlMode } = useUIStore()

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground font-sans">
      {/* 상단 바 */}
      <header className="shrink-0 bg-[#0f0f0f] border-b border-border-subtle flex items-center  min-h-[50px]">
        <NavMenu />
      </header>

      {/* 메인 영역: 편집 중이면 에디터, 아니면 미리보기 */}
      <main className="flex-1 min-h-0 overflow-hidden touch-none">
        {controlMode ? (
          <EditorPanel />
        ) : (
          <div className="h-full overflow-y-auto">
            <PreviewPanel />
          </div>
        )}
      </main>

      {/* 하단 툴바 */}
      <MobileToolbar />

      {/* 드로어들 */}
      <MobileControlDrawer />
      <MobileInspectorDrawer />
      <MobilePreviewDrawer />
    </div>
  )
}
