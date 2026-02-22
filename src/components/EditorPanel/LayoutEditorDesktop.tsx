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
    <div className="h-full overflow-hidden flex gap-[10px]" onClick={onPartDeselect}>
      {/* 좌측: 레이아웃 캔버스 */}
      <div className="flex-[1] min-w-0 overflow-y-auto border-r border-border-subtle">
        <LayoutCanvasColumn {...layoutCanvasProps} />
      </div>

      {/* 중앙+우측: 자모 영역 (버튼 바가 2·3열 전체를 덮도록 묶음) */}
      <div className="flex-[2] min-w-0 flex flex-col">
        {/* 자모 편집 시 2·3열 공통 상단 버튼 바 */}
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

        <div className="flex-1 min-h-0 flex">
          {/* 중앙: 자모 획 캔버스 */}
          <div className="flex-1 min-w-0 overflow-y-auto border-r border-border-subtle">
            <JamoCanvasColumn {...jamoCanvasProps} />
          </div>

          {/* 우측: 컨트롤러 (슬림) */}
          <div className="w-[220px] shrink-0 overflow-y-auto">
            <JamoControlsColumn {...jamoControlsProps} />
          </div>
        </div>
      </div>
    </div>
  )
}
