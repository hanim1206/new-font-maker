import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { Button } from '@/components/ui/button'

// === 타입 정의 ===

type LayoutCanvasProps = React.ComponentProps<typeof LayoutCanvasColumn>
type JamoCanvasProps = React.ComponentProps<typeof JamoCanvasColumn>

interface ChoseongStyleInfo {
  type: 'single' | 'compound'
  parts?: [string, string]
}

export interface LayoutEditorMobileProps {
  layoutCanvasProps: LayoutCanvasProps
  jamoCanvasProps: JamoCanvasProps
  isJamoEditing: boolean
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  choseongStyleInfo: ChoseongStyleInfo | null
  onApplyChoseongStyle: () => void
  canUndo: boolean
  canRedo: boolean
  onPartDeselect: () => void
  onJamoReset: () => void
  onUndo: () => void
  onRedo: () => void
}

// === 컴포넌트 ===

export function LayoutEditorMobile({
  layoutCanvasProps,
  jamoCanvasProps,
  isJamoEditing,
  editingJamoInfo,
  choseongStyleInfo,
  onApplyChoseongStyle,
  canUndo,
  canRedo,
  onPartDeselect,
  onJamoReset,
  onUndo,
  onRedo,
}: LayoutEditorMobileProps) {
  return (
    <div className="h-full overflow-hidden flex flex-col" onClick={onPartDeselect}>
      {/* 자모 편집 상단 영역 */}
      {isJamoEditing && editingJamoInfo && (
        <div className="shrink-0 bg-surface-2 px-3 py-2 border-b border-border-subtle flex items-center gap-1.5">
          <span className="text-sm font-medium text-text-dim-3 truncate">
            {editingJamoInfo.char} 편집
          </span>

          {/* 종성 편집 시 초성 스타일 적용 */}
          {choseongStyleInfo && (
            <Button
              variant="outline"
              size="sm"
              onClick={onApplyChoseongStyle}
              className="text-[0.7rem] h-7 px-2"
            >
              {choseongStyleInfo.type === 'compound'
                ? `초성 ${choseongStyleInfo.parts?.[0]}+${choseongStyleInfo.parts?.[1]}`
                : '초성 적용'}
            </Button>
          )}

          <div className="flex-1" />
          <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기">↩</Button>
          <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행">↪</Button>
          <Button variant="default" size="sm" onClick={onJamoReset}>초기화</Button>
        </div>
      )}

      {/* 메인 캔버스 */}
      <div className="flex-1 min-h-0">
        {isJamoEditing ? (
          <JamoCanvasColumn {...jamoCanvasProps} />
        ) : (
          <LayoutCanvasColumn {...layoutCanvasProps} />
        )}
      </div>
    </div>
  )
}
