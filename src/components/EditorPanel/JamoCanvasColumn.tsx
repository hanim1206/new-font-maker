import { useRef, useState, useCallback, useEffect } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { StrokeOverlay } from '../CharacterEditor/StrokeOverlay'
import { PaddingOverlay } from '../CharacterEditor/PaddingOverlay'
import { FloatingStrokeToolbar } from '../CharacterEditor/FloatingStrokeToolbar'
import { StrokeEditor } from '../CharacterEditor/StrokeEditor'
import { useUIStore } from '../../stores/uiStore'
import { useDeviceCapability } from '../../hooks/useDeviceCapability'
import { usePinchZoom } from '../../hooks/usePinchZoom'
import type { DecomposedSyllable, BoxConfig, LayoutSchema, Part, Padding, StrokeDataV2 } from '../../types'
import { PADDING_COLOR, PADDING_DIRTY_COLOR, PADDING_MIXED_ALT_COLOR, PART_COLORS } from '../../constants/editorColors'
import type { GlobalStyle } from '../../stores/globalStyleStore'
import { applyJamoPaddingToBox } from '../../utils/containerBoxUtils'

interface MixedJungseongData {
  isMixed: boolean
  juHBox: BoxConfig | undefined
  juVBox: BoxConfig | undefined
  horizontalStrokeIds: Set<string>
  verticalStrokeIds: Set<string>
  horizontalBoundaryBox?: BoxConfig
  verticalBoundaryBox?: BoxConfig
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
  editingBoundaryBox: BoxConfig | null
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
  // 오버라이드
  onOverrideSwitch?: (overrideId: string | null) => void
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
  editingBoundaryBox,
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
  const [canvasSize, setCanvasSize] = useState(200)
  const HANDLE_MARGIN = 40

  const { canvasZoom, canvasPan, resetCanvasView, isMobile, setSelectedStrokeId, setSelectedPointIndex, editingPartInLayout } = useUIStore()

  // ResizeObserver: 컨테이너 크기에 맞게 캔버스 크기 동적 계산
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect
        const base = Math.max(150, Math.floor(width - HANDLE_MARGIN * 2))
        setCanvasSize(isMobile ? Math.floor(base * 0.8) : base)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isMobile, isJamoEditing])
  const { isTouch } = useDeviceCapability()
  usePinchZoom(svgRef, { enabled: isTouch, doubleTapZoom: false })

  // 자모 편집 대상이 변경될 때 줌/패닝 초기화
  useEffect(() => {
    resetCanvasView()
  }, [editingJamoInfo?.char, editingJamoInfo?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = useCallback(() => {
    onDragStart()
  }, [onDragStart])

  const handleDragEnd = useCallback(() => {
    // drag 종료 (StrokeOverlay에서 호출)
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
  const editingLimitBox = editingBoundaryBox
    ? applyJamoPaddingToBox(editingBoundaryBox.x, editingBoundaryBox.y, editingBoundaryBox.width, editingBoundaryBox.height, editingJamoPadding)
    : undefined
  const horizontalLimitBox = mixedJungseongData?.horizontalBoundaryBox
    ? applyJamoPaddingToBox(
      mixedJungseongData.horizontalBoundaryBox.x,
      mixedJungseongData.horizontalBoundaryBox.y,
      mixedJungseongData.horizontalBoundaryBox.width,
      mixedJungseongData.horizontalBoundaryBox.height,
      editingHorizontalPadding ?? editingJamoPadding,
    )
    : undefined
  const verticalLimitBox = mixedJungseongData?.verticalBoundaryBox
    ? applyJamoPaddingToBox(
      mixedJungseongData.verticalBoundaryBox.x,
      mixedJungseongData.verticalBoundaryBox.y,
      mixedJungseongData.verticalBoundaryBox.width,
      mixedJungseongData.verticalBoundaryBox.height,
      editingVerticalPadding ?? editingJamoPadding,
    )
    : undefined

  const fullBox: BoxConfig = { x: 0, y: 0, width: 1, height: 1 }

  // 선택 레이아웃에서 자모가 실제로 차지하는 영역.
  // 혼합중성은 JU_H/JU_V의 합집합, 나머지는 calculateBoxes에서 받은 editingBox를 사용한다.
  const mixedContextBox = mixedJungseongData?.juHBox || mixedJungseongData?.juVBox ? {
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
  } : null
  const contextBox = mixedContextBox ?? editingBox ?? fullBox
  const hasLayoutArea = mixedContextBox !== null || editingBox !== null

  return (
    <div className="relative">
      {/* 캔버스 영역 */}
      <div className="p-4 pt-3">
        <div ref={containerRef} className="flex justify-center p-4 md:p-10 bg-[#b8bcc2] rounded mb-2" onClick={() => { setSelectedStrokeId(null); setSelectedPointIndex(null) }}>
          <div
            className="relative"
            style={{
              width: canvasSize + HANDLE_MARGIN * 2,
              height: canvasSize + HANDLE_MARGIN * 2,
              transform: isTouch ? `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})` : undefined,
              transformOrigin: 'center center',
              willChange: isTouch ? 'transform' : undefined,
            }}
          >
          {/* 레이아웃 캔버스와 같은 전체 좌표계에서 선택 자소만 포커스 편집한다. */}
          <div
            className="absolute bg-white border border-neutral-500 shadow-sm"
            data-jamo-layout-canvas
            style={{
              left: HANDLE_MARGIN,
              top: HANDLE_MARGIN,
              width: canvasSize,
              height: canvasSize,
            }}
          >
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasSize}
              height={canvasSize}
              viewBox="0 0 100 100"
            >
              {Array.from({ length: 39 }, (_, i) => {
                const v = (i + 1) * 2.5
                return (
                  <g key={`grid-${i}`}>
                    <line x1={v} y1={0} x2={v} y2={100} stroke="#e0e0e0" strokeWidth={0.2} />
                    <line x1={0} y1={v} x2={100} y2={v} stroke="#e0e0e0" strokeWidth={0.2} />
                  </g>
                )
              })}
              {Array.from({ length: 9 }, (_, i) => {
                const v = (i + 1) * 10
                return (
                  <g key={`grid-major-${i}`}>
                    <line x1={v} y1={0} x2={v} y2={100} stroke="#b8b8b8" strokeWidth={0.4} />
                    <line x1={0} y1={v} x2={100} y2={v} stroke="#b8b8b8" strokeWidth={0.4} />
                  </g>
                )
              })}
            </svg>

            {hasLayoutArea && (
              <div
                className="absolute z-[1] pointer-events-none"
                data-jamo-context-box={`${contextBox.x},${contextBox.y},${contextBox.width},${contextBox.height}`}
                style={{
                  left: `${contextBox.x * 100}%`,
                  top: `${contextBox.y * 100}%`,
                  width: `${contextBox.width * 100}%`,
                  height: `${contextBox.height * 100}%`,
                  backgroundColor: `${editingPartInLayout ? PART_COLORS[editingPartInLayout] : '#2563eb'}1f`,
                  outline: `2px solid ${editingPartInLayout ? PART_COLORS[editingPartInLayout] : '#2563eb'}`,
                  outlineOffset: -1,
                }}
              />
            )}

            {hasLayoutArea && (
              <SvgRenderer
                svgRef={svgRef}
                syllable={displaySyllable}
                schema={schemaWithPadding}
                size={canvasSize}
                fillColor="#1a1a1a"
                backgroundColor="transparent"
                clipGlyphs
                globalStyle={effectiveStyle}
                partStyles={partStyles}
                className="relative z-[2]"
              >
                {editingBox && draftStrokes.length > 0 && (
                  <StrokeOverlay
                    strokes={draftStrokes}
                    box={editingBox}
                    svgRef={svgRef}
                    viewBoxSize={100}
                    onStrokeChange={onStrokeChange}
                    onPointChange={onPointChange}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    strokeColor="#1a1a1a"
                    isMixed={!!mixedJungseongData}
                    juHBox={mixedJungseongData?.juHBox}
                    juVBox={mixedJungseongData?.juVBox}
                    horizontalStrokeIds={mixedJungseongData?.horizontalStrokeIds}
                    verticalStrokeIds={mixedJungseongData?.verticalStrokeIds}
                    globalStyle={globalStyleRaw}
                    jamoPadding={editingJamoPadding}
                    horizontalPadding={editingHorizontalPadding}
                    verticalPadding={editingVerticalPadding}
                    boundaryBox={editingLimitBox}
                    horizontalBoundaryBox={horizontalLimitBox}
                    verticalBoundaryBox={verticalLimitBox}
                  />
                )}

                {editingJamoInfo && editingBox && (() => {
                  if (mixedJungseongData?.juHBox && mixedJungseongData.juVBox) {
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
                          color={isPaddingDirty ? PADDING_DIRTY_COLOR : PADDING_COLOR}
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
                          color={isPaddingDirty ? PADDING_DIRTY_COLOR : PADDING_MIXED_ALT_COLOR}
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
                      color={isPaddingDirty ? PADDING_DIRTY_COLOR : PADDING_COLOR}
                      disabled={isStrokeSelected}
                    />
                  )
                })()}
              </SvgRenderer>
            )}
          </div>
          {!hasLayoutArea ? (
            <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-neutral-600">
              선택한 레이아웃에는
              <br />
              이 자소의 편집 영역이 없습니다
            </div>
          ) : null}
          </div>

        </div>
      </div>

{/* 플로팅 획 편집 툴바 — 캔버스 하단 중앙 */}
      {isJamoEditing && selectedStrokeId && (
        <FloatingStrokeToolbar
          strokes={draftStrokes}
          onChange={onStrokeChange}
          onMergeStrokes={onMergeStrokes}
          onDeleteStroke={onDeleteStroke}
          onAddStroke={onAddStroke}
          onToggleCurve={onToggleCurve}
          onSplitStroke={onSplitStroke}
          onOpenAtPoint={onOpenAtPoint}
          onDeletePoint={onDeletePoint}
        />
      )}

      {/* StrokeEditor — UI 없는 키보드 핸들러 */}
      {editingBox && (
        <StrokeEditor
          strokes={draftStrokes}
          onChange={onStrokeChange}
          onPointChange={onPointChange}
          boxInfo={editingBox ?? fullBox}
          jamoPadding={editingJamoPadding}
          horizontalPadding={editingHorizontalPadding}
          verticalPadding={editingVerticalPadding}
          horizontalStrokeIds={mixedJungseongData?.horizontalStrokeIds}
          verticalStrokeIds={mixedJungseongData?.verticalStrokeIds}
          boundaryBox={editingLimitBox}
          horizontalBox={mixedJungseongData?.juHBox}
          verticalBox={mixedJungseongData?.juVBox}
          horizontalBoundaryBox={horizontalLimitBox}
          verticalBoundaryBox={verticalLimitBox}
        />
      )}
    </div>
  )
}
