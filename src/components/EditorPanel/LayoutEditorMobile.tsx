import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { JamoControlsColumn } from './JamoControlsColumn'
import { OverridePanel } from '../CharacterEditor/OverridePanel'
import { Button } from '@/components/ui/button'

// === 타입 정의 ===

type LayoutCanvasProps = React.ComponentProps<typeof LayoutCanvasColumn>
type JamoCanvasProps = React.ComponentProps<typeof JamoCanvasColumn>
type JamoControlsProps = React.ComponentProps<typeof JamoControlsColumn>

export interface LayoutEditorMobileProps {
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

/** 모바일 단일 컬럼 레이아웃 렌더러 */
export function LayoutEditorMobile({
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
}: LayoutEditorMobileProps) {
  return (
    <div className="h-full overflow-hidden flex flex-col" onClick={onPartDeselect}>
      {/* 자모 편집 상단 영역 */}
      {isJamoEditing && editingJamoInfo && (
        <>
          {/* 툴바 */}
          <div className="shrink-0 bg-surface-2 px-3 py-2 border-b border-border-subtle flex items-center gap-1.5">
            <span className="text-sm font-medium text-text-dim-3 truncate">
              {editingJamoInfo.char} 편집
            </span>

            {/* 종성 편집 시 초성 스타일 적용 */}
            {jamoControlsProps.choseongStyleInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={jamoControlsProps.onApplyChoseongStyle}
                className="text-[0.7rem] h-7 px-2"
              >
                {jamoControlsProps.choseongStyleInfo.type === 'compound'
                  ? `초성 ${jamoControlsProps.choseongStyleInfo.parts?.[0]}+${jamoControlsProps.choseongStyleInfo.parts?.[1]}`
                  : '초성 적용'}
              </Button>
            )}

            <div className="flex-1" />
            <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기">↩</Button>
            <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행">↪</Button>
            <Button variant="default" size="sm" onClick={onJamoReset} disabled={!isJamoDirty}>초기화</Button>
            <Button variant={isJamoDirty ? 'blue' : 'default'} size="sm" onClick={onJamoSave}>저장</Button>
          </div>

          {/* 적용 범위 패널 (compact) */}
          <div className="shrink-0 px-3 py-1.5 border-b border-border-subtle bg-[#0a0a0a]">
            <OverridePanel onOverrideSwitch={jamoControlsProps.onOverrideSwitch} compact />
          </div>
        </>
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
