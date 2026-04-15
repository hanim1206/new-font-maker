import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { GlyphViewerColumn } from './GlyphViewerColumn'
import { Button } from '@/components/ui/button'

// === 타입 정의 ===

type LayoutCanvasProps = React.ComponentProps<typeof LayoutCanvasColumn>
type JamoCanvasProps = React.ComponentProps<typeof JamoCanvasColumn>

interface ChoseongStyleInfo {
  type: 'single' | 'compound'
  parts?: [string, string]
}

export interface LayoutEditorDesktopProps {
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

/** 데스크톱 2컬럼 레이아웃 렌더러 */
export function LayoutEditorDesktop({
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
}: LayoutEditorDesktopProps) {
  return (
    <div className="h-full overflow-hidden flex" onClick={onPartDeselect}>
      {/* 0열: 음절 뷰어 */}
      <GlyphViewerColumn onOverrideSwitch={jamoCanvasProps.onOverrideSwitch} />

      {/* 1열: 레이아웃 캔버스 */}
      <div className="flex-1 min-w-0 overflow-y-auto border-r border-border-subtle">
        <LayoutCanvasColumn {...layoutCanvasProps} />
      </div>

      {/* 우측: 자모 캔버스 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 자모 편집 시 상단 버튼 바 */}
        {isJamoEditing && editingJamoInfo && (
          <div className="shrink-0 bg-surface-2 px-4 pt-3 pb-2 border-b border-border-subtle flex items-center gap-2">
            <h3 className="text-sm font-medium text-text-dim-3 uppercase tracking-wider">
              자모 편집 — {editingJamoInfo.char}
            </h3>

            {/* 종성 편집 시 초성 스타일 적용 */}
            {choseongStyleInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={onApplyChoseongStyle}
                className="text-xs"
                title={choseongStyleInfo.type === 'compound'
                  ? `초성 ${choseongStyleInfo.parts?.[0]}+${choseongStyleInfo.parts?.[1]}의 획을 종성에 적용`
                  : `초성 ${editingJamoInfo.char}의 획/패딩을 종성에 적용`
                }
              >
                {choseongStyleInfo.type === 'compound'
                  ? `초성 ${choseongStyleInfo.parts?.[0]}+${choseongStyleInfo.parts?.[1]} 적용`
                  : '초성 스타일 적용'
                }
              </Button>
            )}

            <div className="flex-1" />
            <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">
              ↩
            </Button>
            <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Y)">
              ↪
            </Button>
            <Button variant="default" size="sm" onClick={onJamoReset}>
              초기화
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <JamoCanvasColumn {...jamoCanvasProps} />
        </div>
      </div>
    </div>
  )
}
