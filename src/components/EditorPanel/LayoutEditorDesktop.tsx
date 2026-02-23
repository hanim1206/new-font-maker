import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { JamoControlsColumn } from './JamoControlsColumn'
import { Button } from '@/components/ui/button'

// === 타입 정의 ===

type LayoutCanvasProps = React.ComponentProps<typeof LayoutCanvasColumn>
type JamoCanvasProps = React.ComponentProps<typeof JamoCanvasColumn>
type JamoControlsProps = React.ComponentProps<typeof JamoControlsColumn>

export interface LayoutEditorDesktopProps {
  layoutCanvasProps: LayoutCanvasProps
  jamoCanvasProps: JamoCanvasProps
  jamoControlsProps: JamoControlsProps
  isJamoEditing: boolean
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  canUndo: boolean
  canRedo: boolean
  isJamoDirty: boolean
  onPartDeselect: () => void
  onJamoSave: () => void
  onJamoReset: () => void
  onUndo: () => void
  onRedo: () => void
}

// === 컴포넌트 ===

/** 데스크톱 3컬럼 레이아웃 렌더러 */
export function LayoutEditorDesktop({
  layoutCanvasProps,
  jamoCanvasProps,
  jamoControlsProps,
  isJamoEditing,
  editingJamoInfo,
  canUndo,
  canRedo,
  isJamoDirty,
  onPartDeselect,
  onJamoSave,
  onJamoReset,
  onUndo,
  onRedo,
}: LayoutEditorDesktopProps) {
  return (
    <div className="h-full overflow-hidden flex" onClick={onPartDeselect}>
      {/* 좌측: 레이아웃 캔버스 */}
      <div className="flex-1 min-w-0 overflow-y-auto border-r border-border-subtle">
        <LayoutCanvasColumn {...layoutCanvasProps} />
      </div>

      {/* 중앙: 자모 캔버스 */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border-subtle">
        {/* 자모 편집 시 상단 버튼 바 */}
        {isJamoEditing && editingJamoInfo && (
          <div className="shrink-0 bg-surface-2 px-4 pt-3 pb-2 border-b border-border-subtle flex items-center gap-2">
            <h3 className="text-sm font-medium text-text-dim-3 uppercase tracking-wider">
              자모 편집 — {editingJamoInfo.char}
            </h3>
            <div className="flex-1" />
            <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">
              ↩
            </Button>
            <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Y)">
              ↪
            </Button>
            <Button variant="default" size="sm" onClick={onJamoReset} disabled={!isJamoDirty}>
              초기화
            </Button>
            <Button variant={isJamoDirty ? 'blue' : 'default'} size="sm" onClick={onJamoSave}>
              저장
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <JamoCanvasColumn {...jamoCanvasProps} />
        </div>
      </div>

      {/* 우측: 컨트롤러 */}
      <div className="w-[400px] shrink-0 overflow-y-auto">
        <JamoControlsColumn {...jamoControlsProps} />
      </div>
    </div>
  )
}
