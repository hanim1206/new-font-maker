import { useCallback, useRef, useState } from 'react'
import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { GlyphViewerColumn } from './GlyphViewerColumn'
import { Button } from '@/components/ui/button'
import type { JamoData, LayoutType } from '../../types'

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
  isJamoDirty: boolean
  onJamoSave: () => void
  onJamoDiscard: () => void
  onUndo: () => void
  onRedo: () => void
  // 레이아웃 컨텍스트 컬럼용
  selectedLayoutType: LayoutType | null
  previewLayoutType: LayoutType | null
  onSelectLayout: (lt: LayoutType) => void
  onSelectPreviewLayout: (lt: LayoutType) => void
  // 레이아웃 저장/폐기
  isLayoutDirty: boolean
  onLayoutSave: () => void
  onLayoutDiscard: () => void
  savedJamoData: JamoData | null
}

// === 컴포넌트 ===

/** 데스크톱 2컬럼 레이아웃 렌더러
 *  1열: 레이아웃 캔버스 ↔ 자모 캔버스 (isJamoEditing에 따라 전환)
 *  2열: 레이아웃 필터 + 유니코드 글리프 뷰어 / 적용범위 설정
 */
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
  isJamoDirty,
  onJamoSave,
  onJamoDiscard,
  onUndo,
  onRedo,
  selectedLayoutType,
  previewLayoutType,
  onSelectLayout,
  onSelectPreviewLayout,
  isLayoutDirty,
  onLayoutSave,
  onLayoutDiscard,
  savedJamoData,
}: LayoutEditorDesktopProps) {
  const scopeActionRef = useRef<((mode: 'save' | 'discard') => boolean) | null>(null)
  const [isScopeDirty, setIsScopeDirty] = useState(false)
  const handleScopeStateChange = useCallback((dirty: boolean, action: ((mode: 'save' | 'discard') => boolean) | null) => {
    scopeActionRef.current = action
    setIsScopeDirty(dirty)
  }, [])
  const handleJamoSave = useCallback(() => {
    if (scopeActionRef.current && !scopeActionRef.current('save')) return
    onJamoSave()
  }, [onJamoSave])
  const handleJamoDiscard = useCallback(() => {
    scopeActionRef.current?.('discard')
    onJamoDiscard()
  }, [onJamoDiscard])

  return (
    <div className="h-full overflow-hidden flex" onClick={onPartDeselect}>

      {/* 1열: 편집 캔버스 (레이아웃 ↔ 자모 전환) */}
      <div className="flex-[2] min-w-0 flex flex-col border-r border-border-subtle overflow-hidden">
        {isJamoEditing && editingJamoInfo ? (
          /* ─── 자모 편집 모드 ─── */
          <>
            {/* 상단 툴바 */}
            <div className="shrink-0 bg-surface-2 px-4 pt-3 pb-2 border-b border-border-subtle flex items-center gap-2">
              <h3 className="text-sm font-medium text-text-dim-3 uppercase tracking-wider">
                자모 편집 — {editingJamoInfo.char}
                {(isJamoDirty || isScopeDirty) && <span className="ml-1.5 text-amber-400">●</span>}
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
              <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">↩</Button>
              <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Y)">↪</Button>
              <Button variant="default" size="sm" onClick={onJamoReset}>초기화</Button>
              {(isJamoDirty || isScopeDirty) && (
                <>
                  <Button variant="outline" size="sm" onClick={handleJamoDiscard}>폐기</Button>
                  <Button size="sm" onClick={handleJamoSave}>저장</Button>
                </>
              )}
            </div>

            {/* 자모 캔버스 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <JamoCanvasColumn {...jamoCanvasProps} />
            </div>
          </>
        ) : (
          /* ─── 레이아웃 편집 모드 ─── */
          <>
            {/* 레이아웃 편집 툴바 */}
            <div className="shrink-0 bg-surface-2 px-4 pt-3 pb-2 border-b border-border-subtle flex items-center gap-2">
              <h3 className="text-sm font-medium text-text-dim-3 uppercase tracking-wider">
                레이아웃 편집
                {isLayoutDirty && <span className="ml-1.5 text-amber-400">●</span>}
              </h3>
              <div className="flex-1" />
              {isLayoutDirty && (
                <>
                  <Button variant="outline" size="sm" onClick={onLayoutDiscard}>
                    폐기
                  </Button>
                  <Button size="sm" onClick={onLayoutSave}>
                    저장
                  </Button>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <LayoutCanvasColumn {...layoutCanvasProps} />
            </div>
          </>
        )}
      </div>

      {/* 2열: 유니코드 글리프 뷰어 / 적용범위 */}
      <div className="flex-[3] min-w-0 overflow-hidden flex flex-col">
        <GlyphViewerColumn
          onOverrideSwitch={jamoCanvasProps.onOverrideSwitch}
          activeLayoutType={isJamoEditing ? previewLayoutType ?? selectedLayoutType : selectedLayoutType}
          onSelectLayout={isJamoEditing ? onSelectPreviewLayout : onSelectLayout}
          onJamoScopeStateChange={handleScopeStateChange}
          savedJamoData={savedJamoData}
        />
      </div>
    </div>
  )
}
