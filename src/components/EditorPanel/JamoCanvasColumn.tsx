import { useRef, useState, useCallback, useEffect } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { StrokeOverlay } from '../CharacterEditor/StrokeOverlay'
import { PaddingOverlay } from '../CharacterEditor/PaddingOverlay'
import { StrokeToolbar } from '../CharacterEditor/StrokeToolbar'
import { PointActionPopup } from '../CharacterEditor/PointActionPopup'
import { StrokeEditor } from '../CharacterEditor/StrokeEditor'
import { useUIStore } from '../../stores/uiStore'
import { useDeviceCapability } from '../../hooks/useDeviceCapability'
import { usePinchZoom } from '../../hooks/usePinchZoom'
import type { DecomposedSyllable, BoxConfig, LayoutSchema, Part, Padding, StrokeDataV2 } from '../../types'
import type { GlobalStyle } from '../../stores/globalStyleStore'

interface MixedJungseongData {
  isMixed: boolean
  juHBox: BoxConfig | undefined
  juVBox: BoxConfig | undefined
  horizontalStrokeIds: Set<string>
  verticalStrokeIds: Set<string>
}

interface JamoCanvasColumnProps {
  // 음절 데이터
  displaySyllable: DecomposedSyllable
  schemaWithPadding: LayoutSchema
  effectiveStyle: GlobalStyle
  partStyles: Partial<Record<Part, PartStyle>> | undefined
  // 자모 편집 상태
  isJamoEditing: boolean
  draftStrokes: StrokeDataV2[]
  editingBox: BoxConfig | null
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  // 혼합중성
  mixedJungseongData: MixedJungseongData | null
  // 패딩
  editingJamoPadding: Padding | undefined
  editingHorizontalPadding: Padding | undefined
  editingVerticalPadding: Padding | undefined
  isPaddingDirty: boolean
  selectedStrokeId: string | null
  globalStyleRaw: GlobalStyle
  // 핸들러
  onStrokeChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onPointChange: (strokeId: string, pointIndex: number, field: 'x' | 'y' | 'handleIn' | 'handleOut', value: { x: number; y: number } | number) => void
  onDragStart: () => void
  onJamoPaddingChange: (type: 'choseong' | 'jungseong' | 'jongseong', char: string, side: keyof Padding, val: number) => void
  onMixedJamoPaddingChange: (char: string, part: 'horizontal' | 'vertical', side: keyof Padding, val: number) => void
  // 획/포인트 액션 핸들러
  onMergeStrokes?: (a: string, b: string) => void
  onSplitStroke?: (id: string, idx: number) => void
  onToggleCurve?: (id: string, idx: number) => void
  onOpenAtPoint?: (id: string, idx: number) => void
  onDeletePoint?: (id: string, idx: number) => void
  onDeleteStroke?: (id: string) => void
  onAddStroke?: () => void
}

/** 중앙 자모 획 캔버스 컬럼 */
export function JamoCanvasColumn({
  displaySyllable,
  schemaWithPadding,
  effectiveStyle,
  partStyles,
  isJamoEditing,
  draftStrokes,
  editingBox,
  editingJamoInfo,
  mixedJungseongData,
  editingJamoPadding,
  editingHorizontalPadding,
  editingVerticalPadding,
  isPaddingDirty,
  selectedStrokeId,
  globalStyleRaw,
  onStrokeChange,
  onPointChange,
  onDragStart,
  onJamoPaddingChange,
  onMixedJamoPaddingChange,
  onMergeStrokes,
  onSplitStroke,
  onToggleCurve,
  onOpenAtPoint,
  onDeletePoint,
  onDeleteStroke,
  onAddStroke,
}: JamoCanvasColumnProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState(300)
  const [isDragging, setIsDragging] = useState(false)

  const { canvasZoom, canvasPan, resetCanvasView, selectedPointIndex, isMobile } = useUIStore()

  // ResizeObserver: 컨테이너 크기에 맞게 캔버스 크기 동적 계산
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const base = Math.max(150, Math.floor(Math.min(width, height) - 32))
        setCanvasSize(isMobile ? Math.floor(base * 0.8) : base)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isMobile])
  const { isTouch } = useDeviceCapability()
  usePinchZoom(svgRef, { enabled: false })

  // 자모 편집 대상이 변경될 때 줌/패닝 초기화
  useEffect(() => {
    resetCanvasView()
  }, [editingJamoInfo?.char, editingJamoInfo?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  // 롱프레스로 PointActionPopup 활성화 (모바일 전용)
  const [longPressActive, setLongPressActive] = useState(false)
  useEffect(() => {
    setLongPressActive(false)
  }, [selectedPointIndex])

  const handlePointLongPress = useCallback(() => {
    setLongPressActive(true)
  }, [])

  const handleDragStart = useCallback(() => {
    setIsDragging(true)
    onDragStart()
  }, [onDragStart])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 빈 상태
  if (!isJamoEditing) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-dim-5 text-sm text-center leading-relaxed">
          좌측 캔버스에서 파트를 클릭하면
          <br />
          자모 편집이 활성화됩니다
        </p>
      </div>
    )
  }

  const isStrokeSelected = !!selectedStrokeId
  const jamoPad = editingJamoPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }

  // StrokeOverlay에 전달할 effective box (혼합중성 고려)
  const effectiveBox = mixedJungseongData?.juHBox || mixedJungseongData?.juVBox ? {
    x: Math.min(mixedJungseongData.juHBox?.x ?? 1, mixedJungseongData.juVBox?.x ?? 1),
    y: Math.min(mixedJungseongData.juHBox?.y ?? 1, mixedJungseongData.juVBox?.y ?? 1),
    width: Math.max(
      (mixedJungseongData.juHBox?.x ?? 0) + (mixedJungseongData.juHBox?.width ?? 0),
      (mixedJungseongData.juVBox?.x ?? 0) + (mixedJungseongData.juVBox?.width ?? 0)
    ) - Math.min(mixedJungseongData.juHBox?.x ?? 1, mixedJungseongData.juVBox?.x ?? 1),
    height: Math.max(
      (mixedJungseongData.juHBox?.y ?? 0) + (mixedJungseongData.juHBox?.height ?? 0),
      (mixedJungseongData.juVBox?.y ?? 0) + (mixedJungseongData.juVBox?.height ?? 0)
    ) - Math.min(mixedJungseongData.juHBox?.y ?? 1, mixedJungseongData.juVBox?.y ?? 1),
  } : editingBox!

  return (
    <div className="h-full flex flex-col">
      {/* StrokeToolbar — 캔버스 상단 인라인 */}
      {isJamoEditing && selectedStrokeId && (
        <StrokeToolbar
          strokes={draftStrokes}
          onChange={onStrokeChange}
          onMergeStrokes={onMergeStrokes}
          onDeleteStroke={onDeleteStroke}
          onAddStroke={onAddStroke}
        />
      )}

      {/* 캔버스 영역 */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-4">
        <div className="flex justify-center p-3 bg-background rounded mb-2">
          <div
            className="relative"
            style={{
              width: canvasSize,
              height: canvasSize,
              backgroundColor: '#1a1a1a',
              transform: isTouch ? `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})` : undefined,
              transformOrigin: 'center center',
              willChange: isTouch ? 'transform' : undefined,
            }}
          >
            {/* 0.025 스냅 그리드 */}
            <svg
              className="absolute inset-0 pointer-events-none z-0"
              width={canvasSize}
              height={canvasSize}
              viewBox="0 0 100 100"
            >
              {Array.from({ length: 39 }, (_, i) => {
                const v = (i + 1) * 2.5
                return (
                  <g key={`grid-${i}`}>
                    <line x1={v} y1={0} x2={v} y2={100} stroke="#333" strokeWidth={0.2} />
                    <line x1={0} y1={v} x2={100} y2={v} stroke="#333" strokeWidth={0.2} />
                  </g>
                )
              })}
              {Array.from({ length: 9 }, (_, i) => {
                const v = (i + 1) * 10
                return (
                  <g key={`grid-major-${i}`}>
                    <line x1={v} y1={0} x2={v} y2={100} stroke="#444" strokeWidth={0.4} />
                    <line x1={0} y1={v} x2={100} y2={v} stroke="#444" strokeWidth={0.4} />
                  </g>
                )
              })}
            </svg>

            <SvgRenderer
              svgRef={svgRef}
              syllable={displaySyllable}
              schema={schemaWithPadding}
              size={canvasSize}
              fillColor="#e5e5e5"
              backgroundColor="transparent"
              showDebugBoxes
              globalStyle={effectiveStyle}
              partStyles={partStyles}
            >
              {/* StrokeOverlay (자모 획 편집) — 반드시 PaddingOverlay보다 먼저 렌더링 */}
              {editingBox && draftStrokes.length > 0 && (
                <StrokeOverlay
                  strokes={draftStrokes}
                  box={effectiveBox}
                  svgRef={svgRef}
                  viewBoxSize={100}
                  onStrokeChange={onStrokeChange}
                  onPointChange={onPointChange}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onPointLongPress={handlePointLongPress}
                  strokeColor="#e5e5e5"
                  isMixed={!!mixedJungseongData}
                  juHBox={mixedJungseongData?.juHBox}
                  juVBox={mixedJungseongData?.juVBox}
                  horizontalStrokeIds={mixedJungseongData?.horizontalStrokeIds}
                  verticalStrokeIds={mixedJungseongData?.verticalStrokeIds}
                  globalStyle={globalStyleRaw}
                  jamoPadding={editingJamoPadding}
                  horizontalPadding={editingHorizontalPadding}
                  verticalPadding={editingVerticalPadding}
                />
              )}

              {/* PaddingOverlay — 반드시 StrokeOverlay 뒤에 렌더링 (이벤트 레이어링) */}
              {editingJamoInfo && editingBox && (() => {
                if (mixedJungseongData?.juHBox && mixedJungseongData?.juVBox) {
                  const hPad = editingHorizontalPadding ?? jamoPad
                  const vPad = editingVerticalPadding ?? jamoPad
                  return (
                    <>
                      <PaddingOverlay
                        svgRef={svgRef}
                        viewBoxSize={100}
                        padding={hPad}
                        containerBox={mixedJungseongData.juHBox}
                        onPaddingChange={(side, val) =>
                          onMixedJamoPaddingChange(editingJamoInfo.char, 'horizontal', side, val)
                        }
                        color={isPaddingDirty ? '#ff9500' : '#a855f7'}
                        disabled={isStrokeSelected}
                      />
                      <PaddingOverlay
                        svgRef={svgRef}
                        viewBoxSize={100}
                        padding={vPad}
                        containerBox={mixedJungseongData.juVBox}
                        onPaddingChange={(side, val) =>
                          onMixedJamoPaddingChange(editingJamoInfo.char, 'vertical', side, val)
                        }
                        color={isPaddingDirty ? '#ffd700' : '#c084fc'}
                        disabled={isStrokeSelected}
                      />
                    </>
                  )
                }

                return (
                  <PaddingOverlay
                    svgRef={svgRef}
                    viewBoxSize={100}
                    padding={jamoPad}
                    containerBox={editingBox}
                    onPaddingChange={(side, val) =>
                      onJamoPaddingChange(editingJamoInfo.type, editingJamoInfo.char, side, val)
                    }
                    color={isPaddingDirty ? '#ff9500' : '#a855f7'}
                    disabled={isStrokeSelected}
                  />
                )
              })()}
            </SvgRenderer>

            {/* PointActionPopup — 캔버스 위에 absolute 팝업 (터치: 롱프레스 후 표시) */}
            {editingBox && !isDragging && (!isTouch || longPressActive) && (
              <PointActionPopup
                strokes={draftStrokes}
                canvasSize={canvasSize}
                viewBoxSize={100}
                box={effectiveBox}
                isMixed={!!mixedJungseongData}
                juHBox={mixedJungseongData?.juHBox}
                juVBox={mixedJungseongData?.juVBox}
                horizontalStrokeIds={mixedJungseongData?.horizontalStrokeIds}
                verticalStrokeIds={mixedJungseongData?.verticalStrokeIds}
                jamoPadding={editingJamoPadding}
                horizontalPadding={editingHorizontalPadding}
                verticalPadding={editingVerticalPadding}
                onToggleCurve={onToggleCurve}
                onSplitStroke={onSplitStroke}
                onOpenAtPoint={onOpenAtPoint}
                onDeletePoint={onDeletePoint}
              />
            )}
          </div>
        </div>
      </div>

      {/* StrokeEditor — UI 없는 키보드 핸들러 */}
      {editingBox && (
        <StrokeEditor
          strokes={draftStrokes}
          onChange={onStrokeChange}
          onPointChange={onPointChange}
          boxInfo={editingBox}
        />
      )}
    </div>
  )
}
