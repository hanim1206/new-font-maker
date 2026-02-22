import { useRef, useState, useCallback, useEffect } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { PaddingOverlay } from '../CharacterEditor/PaddingOverlay'
import { SplitOverlay } from '../CharacterEditor/SplitOverlay'
import { LayoutContextThumbnails } from '../CharacterEditor/LayoutContextThumbnails'
import { Button } from '@/components/ui/button'
import { BASE_PRESETS_SCHEMAS } from '../../utils/layoutCalculator'
import { useUIStore } from '../../stores/uiStore'
import { useDeviceCapability } from '../../hooks/useDeviceCapability'
import { usePinchZoom } from '../../hooks/usePinchZoom'
import type { DecomposedSyllable, BoxConfig, LayoutSchema, Part, Padding, LayoutType, PartOverride } from '../../types'
import type { GlobalStyle } from '../../stores/globalStyleStore'

type PaddingSide = keyof Padding

// 파트 오프셋 드래그용 스냅 설정 (0.025 그리드에 맞춤)
const SNAP_STEP = 0.025
const MAX_PADDING = 0.3
// 핸들이 캔버스 바깥에 위치하는 오프셋 (px)
const HANDLE_MARGIN = 14
const HANDLE_RADIUS = 5
// 파트 버튼 가장자리 근접 감지 임계값 (px) — 이 범위 내 터치 시 즉시 오프셋 드래그 시작
const EDGE_DRAG_THRESHOLD = 14

// 포인터 위치가 버튼의 어느 가장자리에 가까운지 감지
function detectNearEdge(
  clientX: number,
  clientY: number,
  buttonRect: DOMRect,
  threshold: number
): PaddingSide | null {
  const relX = clientX - buttonRect.left
  const relY = clientY - buttonRect.top
  const w = buttonRect.width
  const h = buttonRect.height

  const distTop = relY
  const distBottom = h - relY
  const distLeft = relX
  const distRight = w - relX

  const minDist = Math.min(distTop, distBottom, distLeft, distRight)
  if (minDist > threshold) return null

  if (minDist === distTop) return 'top'
  if (minDist === distBottom) return 'bottom'
  if (minDist === distLeft) return 'left'
  return 'right'
}

interface LayoutCanvasColumnProps {
  layoutType: LayoutType
  // 음절 데이터
  displaySyllable: DecomposedSyllable
  schemaWithPadding: LayoutSchema
  effectiveStyle: GlobalStyle
  // 박스
  computedBoxes: Partial<Record<Part, BoxConfig>>
  // 스키마
  schema: LayoutSchema
  effectivePadding: Padding
  // 패딩 오버라이드 상태
  hasPaddingOverride: boolean
  // 파트 선택 상태 (단일클릭)
  selectedPartInLayout: Part | null
  // 자모 편집 상태 (더블클릭)
  editingPartInLayout: Part | null
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  previewLayoutType: LayoutType | null
  // 레이아웃 드래프트 상태
  isLayoutDirty: boolean
  onLayoutSave: () => void
  onLayoutReset: () => void
  // undo/redo
  onDragStart: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  // 핸들러
  onPartClick: (part: Part) => void
  onPartDoubleClick: (part: Part) => void
  onPartOverrideChange: (part: Part, side: keyof PartOverride, value: number) => void
  onSplitChange: (index: number, value: number) => void
  onPaddingOverrideChange: (side: keyof Padding, val: number) => void
  onPreviewLayoutTypeChange: (lt: LayoutType) => void
}

/** 좌측 레이아웃 캔버스 컬럼 */
export function LayoutCanvasColumn({
  layoutType,
  displaySyllable,
  schemaWithPadding,
  effectiveStyle,
  computedBoxes,
  schema,
  effectivePadding,
  hasPaddingOverride,
  selectedPartInLayout,
  editingPartInLayout,
  editingJamoInfo,
  previewLayoutType,
  isLayoutDirty,
  onLayoutSave,
  onLayoutReset,
  onDragStart: onLayoutDragStart,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onPartClick,
  onPartDoubleClick,
  onPartOverrideChange,
  onSplitChange,
  onPaddingOverrideChange,
  onPreviewLayoutTypeChange,
}: LayoutCanvasColumnProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState(200)

  const { canvasZoom, canvasPan, resetCanvasView, isMobile } = useUIStore()

  // ResizeObserver: 캔버스 래퍼 너비 기준으로 정사각형 캔버스 크기 동적 계산
  useEffect(() => {
    if (!canvasContainerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect
        const base = Math.max(150, Math.floor(width - HANDLE_MARGIN * 2))
        setCanvasSize(isMobile ? Math.floor(base * 0.8) : base)
      }
    })
    observer.observe(canvasContainerRef.current)
    return () => observer.disconnect()
  }, [isMobile])

  // 오버레이 드래그 중 여부 (드래그 중 파트 버튼 pointer-events 차단)
  const [isDragging, setIsDragging] = useState(false)
  const [draggingSide, setDraggingSide] = useState<PaddingSide | null>(null)
  const [hoveredSide, setHoveredSide] = useState<PaddingSide | null>(null)
  const handleDragStart = useCallback(() => { onLayoutDragStart(); setIsDragging(true) }, [onLayoutDragStart])
  const handleDragEnd = useCallback(() => setIsDragging(false), [])
  const { isTouch } = useDeviceCapability()
  usePinchZoom(svgRef, { enabled: false })

  // 레이아웃 타입 변경 시 줌/패닝 초기화
  useEffect(() => {
    resetCanvasView()
  }, [layoutType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ref로 최신 콜백 참조 (드래그 중 클로저 캡처 문제 방지)
  const onPartOverrideChangeRef = useRef(onPartOverrideChange)
  onPartOverrideChangeRef.current = onPartOverrideChange

  // 선택된 파트의 박스 (partOverrides 적용 후 — 축소된 상태)
  const selectedPartBox = selectedPartInLayout ? computedBoxes[selectedPartInLayout] : undefined

  // 파트 오프셋 현재 값
  const selectedPartPadding = selectedPartInLayout && schema.partOverrides?.[selectedPartInLayout]

  // 원본 박스 (partOverrides 적용 전) — 패딩 채우기/경계선 렌더링용
  // 축소된 박스에서 override를 역적용하여 복원
  const originalPartBox = selectedPartBox && (() => {
    const p = selectedPartPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }
    return {
      x: selectedPartBox.x - p.left,
      y: selectedPartBox.y - p.top,
      width: selectedPartBox.width + p.left + p.right,
      height: selectedPartBox.height + p.top + p.bottom,
    }
  })()

  // === HTML 기반 파트 오프셋 드래그 핸들러 (마우스 + 터치 공통) ===
  const startPartEdgeDrag = useCallback(
    (side: PaddingSide, startX: number, startY: number, overridePart?: Part) => {
      const part = overridePart ?? selectedPartInLayout
      if (!part) return
      onLayoutDragStart()

      const currentPadding = schema.partOverrides?.[part] ?? { top: 0, bottom: 0, left: 0, right: 0 }
      const startVal = currentPadding[side]

      if (!computedBoxes[part]) return
      const isHorizontal = side === 'top' || side === 'bottom'
      const size = canvasSize

      setIsDragging(true)
      setDraggingSide(side)

      const applyMove = (clientX: number, clientY: number) => {
        const deltaPixel = isHorizontal
          ? (side === 'top' ? clientY - startY : startY - clientY)
          : (side === 'left' ? clientX - startX : startX - clientX)

        let raw = startVal + deltaPixel / size

        // 원점(0) 강한 흡착
        if (Math.abs(raw) < SNAP_STEP * 0.8) {
          raw = 0
        } else {
          // 0.025 그리드 스냅
          raw = Math.round(raw / SNAP_STEP) * SNAP_STEP
        }

        // 클램프
        raw = Math.max(-MAX_PADDING, Math.min(MAX_PADDING, raw))
        onPartOverrideChangeRef.current(part, side, raw)
      }

      const onMouseMove = (me: MouseEvent) => applyMove(me.clientX, me.clientY)
      const onTouchMove = (te: TouchEvent) => {
        if (te.touches.length > 0) {
          te.preventDefault()
          applyMove(te.touches[0].clientX, te.touches[0].clientY)
        }
      }

      const handleUp = () => {
        setIsDragging(false)
        setDraggingSide(null)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('touchmove', onTouchMove)
        window.removeEventListener('touchend', handleUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('touchmove', onTouchMove, { passive: false })
      window.addEventListener('touchend', handleUp)
    },
    [selectedPartInLayout, schema.partOverrides, computedBoxes, canvasSize, onLayoutDragStart]
  )

  const handlePartEdgeMouseDown = useCallback(
    (side: PaddingSide, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startPartEdgeDrag(side, e.clientX, e.clientY)
    },
    [startPartEdgeDrag]
  )

  const handlePartEdgeTouchStart = useCallback(
    (side: PaddingSide, e: React.TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.touches.length > 0) {
        startPartEdgeDrag(side, e.touches[0].clientX, e.touches[0].clientY)
      }
    },
    [startPartEdgeDrag]
  )

  // 경계선의 캔버스 내 위치 (px) — 원본 박스 기준
  // partOverrides는 0-1 정규화 좌표에 직접 가산되므로 val * canvasSize (캔버스 절대)
  const getEdgePx = (side: PaddingSide, origBox: BoxConfig) => {
    const p = selectedPartPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }
    const val = p[side]
    if (side === 'top') return origBox.y * canvasSize + val * canvasSize
    if (side === 'bottom') return (origBox.y + origBox.height) * canvasSize - val * canvasSize
    if (side === 'left') return origBox.x * canvasSize + val * canvasSize
    /* right */ return (origBox.x + origBox.width) * canvasSize - val * canvasSize
  }

  return (
    <div className={isTouch ? 'h-full overflow-hidden' : 'h-full overflow-y-auto'}>
      {/* undo/redo + 저장/초기화 — 상단 고정 */}
      <div className="sticky top-0 z-10 bg-surface-2 px-4 pt-3 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-dim-3 uppercase tracking-wider">
            레이아웃
          </h3>
          <div className="flex-1" />
          <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">
            ↩
          </Button>
          <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Y)">
            ↪
          </Button>
          <Button variant="default" size="sm" onClick={onLayoutReset} disabled={!isLayoutDirty}>
            초기화
          </Button>
          <Button variant={isLayoutDirty ? 'blue' : 'default'} size="sm" onClick={onLayoutSave} disabled={!isLayoutDirty}>
            저장
          </Button>
        </div>
      </div>

      <div className="p-4 pt-3">

      {/* 캔버스 — 핸들 공간 확보를 위한 외부 여백 */}
      {/* 캔버스 래퍼 내부 클릭은 상위 deselect로 전파되지 않도록 차단 */}
      <div ref={canvasContainerRef} className="flex justify-center p-3 bg-background rounded mb-2" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative"
          style={{
            // 핸들 공간을 항상 확보하여 모드 전환 시 레이아웃 시프트 방지
            width: canvasSize + HANDLE_MARGIN * 2,
            height: canvasSize + HANDLE_MARGIN * 2,
            transform: isTouch ? `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})` : undefined,
            transformOrigin: 'center center',
            willChange: isTouch ? 'transform' : undefined,
          }}
        >
          {/* 캔버스 본체 (핸들 여백 안쪽) */}
          {/* 글리프 클리핑은 SvgRenderer의 overflow="hidden" + SVG clipPath로 처리 */}
          {/* 오버레이(Split/Padding 핸들)는 클리핑되지 않음 */}
          <div
            className="absolute"
            style={{
              left: HANDLE_MARGIN,
              top: HANDLE_MARGIN,
              width: canvasSize,
              height: canvasSize,
              backgroundColor: '#1a1a1a',
            }}
            onClick={(e) => {
              e.stopPropagation()
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
              clipGlyphs
              globalStyle={effectiveStyle}
            >
              {/* Split/Padding 오버레이 — 항상 표시, 파트 선택 시 비활성 */}
              {schema.splits && schema.splits.length > 0 && (
                <SplitOverlay
                  svgRef={svgRef}
                  viewBoxSize={100}
                  splits={schema.splits}
                  onSplitChange={onSplitChange}
                  originValues={BASE_PRESETS_SCHEMAS[layoutType]?.splits?.map(s => s.value)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  disabled={!!selectedPartInLayout}
                />
              )}
              <PaddingOverlay
                svgRef={svgRef}
                viewBoxSize={100}
                padding={effectivePadding}
                containerBox={{ x: 0, y: 0, width: 1, height: 1 }}
                onPaddingChange={onPaddingOverrideChange}
                color={hasPaddingOverride ? '#ff9500' : '#a855f7'}
                snapStep={0.005}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                disabled={!!selectedPartInLayout}
              />
            </SvgRenderer>

            {/* 파트 클릭 오버레이 (HTML 버튼) */}
            {(Object.entries(computedBoxes) as [Part, BoxConfig][]).map(
              ([part, box]) => {
                const isEditing = editingPartInLayout === part
                const isSelected = selectedPartInLayout === part

                return (
                  <button
                    key={`part-overlay-${part}`}
                    className={`absolute z-[3] border-2 transition-colors cursor-pointer rounded-sm ${
                      isEditing
                        ? 'border-accent-blue bg-accent-blue/15'
                        : isSelected
                          ? 'border-accent-cyan bg-accent-cyan/10'
                          : 'border-transparent hover:border-accent-yellow/50 hover:bg-accent-yellow/5'
                    }`}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                      // 드래그 중이면 전부 비활성, 파트 선택 중이면 다른 파트만 비활성 (선택된 파트는 더블클릭 가능)
                      pointerEvents: isDragging ? 'none'
                        : (selectedPartInLayout && selectedPartInLayout !== part) ? 'none'
                        : undefined,
                    }}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const nearSide = detectNearEdge(e.clientX, e.clientY, rect, EDGE_DRAG_THRESHOLD)
                      if (nearSide) {
                        e.preventDefault()
                        e.stopPropagation()
                        onPartClick(part)
                        startPartEdgeDrag(nearSide, e.clientX, e.clientY, part)
                      }
                    }}
                    onTouchStart={(e) => {
                      if (e.touches.length === 0) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const nearSide = detectNearEdge(e.touches[0].clientX, e.touches[0].clientY, rect, EDGE_DRAG_THRESHOLD)
                      if (nearSide) {
                        e.preventDefault()
                        e.stopPropagation()
                        onPartClick(part)
                        startPartEdgeDrag(nearSide, e.touches[0].clientX, e.touches[0].clientY, part)
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      // 이미 선택된 파트를 싱글클릭하면 아무 동작 없음 (더블클릭 대기)
                      // 선택 해제는 캔버스 배경 또는 외부 클릭으로
                      if (selectedPartInLayout === part) return
                      onPartClick(part)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      onPartDoubleClick(part)
                    }}
                    title={`${part} (클릭: 오프셋 조절 / 더블클릭: 자모 편집)`}
                  >
                    <span className="absolute top-0.5 left-1 text-[0.55rem] font-bold text-text-dim-4 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                      {part}
                    </span>
                  </button>
                )
              }
            )}

            {/* 파트 오프셋: 캔버스 내부 경계선 + 패딩 영역 시각화 */}
            {/* 별도 클리핑 wrapper — 캔버스 전체를 덮되 overflow:hidden으로 fill/경계선만 자름 */}
            {/* 핸들은 이 div 바깥(캔버스 div 바깥)에 있으므로 잘리지 않음 */}
            {selectedPartInLayout && originalPartBox && (() => {
              const p = selectedPartPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }
              const ob = originalPartBox // 원본 박스 (override 전)
              const obxPx = ob.x * canvasSize
              const obyPx = ob.y * canvasSize
              const obwPx = ob.width * canvasSize
              const obhPx = ob.height * canvasSize

              const sides: PaddingSide[] = ['top', 'bottom', 'left', 'right']
              const hasAny = p.top !== 0 || p.bottom !== 0 || p.left !== 0 || p.right !== 0

              return (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ overflow: 'hidden', zIndex: 4 }}
                >
                  {/* 패딩 채우기 — 원본 박스 경계 ~ 경계선(edge) 사이 영역 */}
                  {/* 양수: 안쪽 축소 / 음수: 바깥 확장 — 모두 올바르게 처리 */}
                  {hasAny && (() => {
                    // 각 면의 경계선 위치 (px)
                    // partOverrides는 0-1 캔버스 절대 좌표이므로 val * canvasSize
                    const edgeTop = obyPx + p.top * canvasSize
                    const edgeBottom = obyPx + obhPx - p.bottom * canvasSize
                    const edgeLeft = obxPx + p.left * canvasSize
                    const edgeRight = obxPx + obwPx - p.right * canvasSize

                    // fill 영역: 원본 박스 경계 ~ 경계선 사이 (min/max로 방향 무관하게 처리)
                    const topFillY = Math.min(obyPx, edgeTop)
                    const topFillH = Math.abs(edgeTop - obyPx)
                    const bottomFillY = Math.min(edgeBottom, obyPx + obhPx)
                    const bottomFillH = Math.abs(obyPx + obhPx - edgeBottom)
                    const leftFillX = Math.min(obxPx, edgeLeft)
                    const leftFillW = Math.abs(edgeLeft - obxPx)
                    const rightFillX = Math.min(edgeRight, obxPx + obwPx)
                    const rightFillW = Math.abs(obxPx + obwPx - edgeRight)

                    // 좌우 fill의 수직 범위 (top/bottom fill과 겹치지 않게)
                    const midTop = Math.min(edgeTop, obyPx + obhPx - p.bottom * canvasSize)
                    const midBottom = Math.max(edgeBottom, obyPx + p.top * canvasSize)
                    const midY = Math.min(midTop, midBottom)
                    const midH = Math.max(0, Math.max(midTop, midBottom) - midY)

                    return (
                      <>
                        {p.top !== 0 && topFillH > 0 && (
                          <div className="absolute" style={{
                            left: obxPx, top: topFillY,
                            width: obwPx, height: topFillH,
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                          }} />
                        )}
                        {p.bottom !== 0 && bottomFillH > 0 && (
                          <div className="absolute" style={{
                            left: obxPx, top: bottomFillY,
                            width: obwPx, height: bottomFillH,
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                          }} />
                        )}
                        {p.left !== 0 && leftFillW > 0 && midH > 0 && (
                          <div className="absolute" style={{
                            left: leftFillX, top: midY,
                            width: leftFillW, height: midH,
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                          }} />
                        )}
                        {p.right !== 0 && rightFillW > 0 && midH > 0 && (
                          <div className="absolute" style={{
                            left: rightFillX, top: midY,
                            width: rightFillW, height: midH,
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                          }} />
                        )}
                        {/* 내부 경계선 (축소된 영역 테두리) */}
                        <div className="absolute" style={{
                          left: edgeLeft, top: edgeTop,
                          width: Math.max(0, edgeRight - edgeLeft),
                          height: Math.max(0, edgeBottom - edgeTop),
                          border: '1px dashed rgba(56, 189, 248, 0.5)',
                        }} />
                      </>
                    )
                  })()}

                  {/* 4면 경계선 (원본 박스 기준) */}
                  {sides.map(side => {
                    const isH = side === 'top' || side === 'bottom'
                    const edgePx = getEdgePx(side, ob)
                    const isActive = draggingSide === side
                    const isHov = hoveredSide === side
                    const isAtOrigin = (p[side] ?? 0) === 0

                    return (
                      <div
                        key={`edge-line-${side}`}
                        className="absolute"
                        style={isH ? {
                          left: obxPx,
                          top: edgePx,
                          width: obwPx,
                          height: 0,
                          borderTop: `${isActive ? 2 : isHov ? 1.5 : 1}px ${isActive ? 'solid' : 'dashed'} ${isAtOrigin && isActive ? '#fff' : '#38bdf8'}`,
                          opacity: isActive ? 1 : isHov ? 0.9 : 0.5,
                        } : {
                          left: edgePx,
                          top: obyPx,
                          width: 0,
                          height: obhPx,
                          borderLeft: `${isActive ? 2 : isHov ? 1.5 : 1}px ${isActive ? 'solid' : 'dashed'} ${isAtOrigin && isActive ? '#fff' : '#38bdf8'}`,
                          opacity: isActive ? 1 : isHov ? 0.9 : 0.5,
                        }}
                      />
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* 파트 오프셋: 캔버스 외부 핸들 원 */}
          {selectedPartInLayout && originalPartBox && (() => {
            const sides: PaddingSide[] = ['top', 'bottom', 'left', 'right']
            const ob = originalPartBox
            const margin = HANDLE_MARGIN
            const padding = selectedPartPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }

            return sides.map(side => {
              const isH = side === 'top' || side === 'bottom'
              const edgePx = getEdgePx(side, ob)
              const isActive = draggingSide === side
              const isHov = hoveredSide === side
              const isAtOrigin = (padding[side] ?? 0) === 0
              const r = isActive ? HANDLE_RADIUS + 1.5 : isHov ? HANDLE_RADIUS + 0.5 : HANDLE_RADIUS

              // 핸들 위치: 캔버스 외부
              // top/bottom → 캔버스 왼쪽 바깥 (x = margin 중앙)
              // left/right → 캔버스 위쪽 바깥 (y = margin 중앙)
              const cx = isH ? margin / 2 : margin + edgePx
              const cy = isH ? margin + edgePx : margin / 2

              const fillColor = isActive
                ? (isAtOrigin ? '#fff' : '#38bdf8')
                : isHov ? '#38bdf8' : 'rgba(0,0,0,0.6)'
              const strokeColor = isAtOrigin && isActive ? '#fff' : '#38bdf8'

              return (
                <div key={`handle-${side}`}>
                  {/* 가시적 핸들 원 */}
                  <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      left: cx - r,
                      top: cy - r,
                      width: r * 2,
                      height: r * 2,
                      backgroundColor: fillColor,
                      border: `${isActive ? 2 : 1}px solid ${strokeColor}`,
                      opacity: isActive ? 1 : isHov ? 0.95 : 0.7,
                      transition: 'width 0.1s, height 0.1s, left 0.05s, top 0.05s, opacity 0.1s',
                      zIndex: 11,
                    }}
                  />
                  {/* 드래그 중 값 표시 */}
                  {(isActive || isHov) && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: isH ? cx - 20 : cx - 12,
                        top: isH ? cy - 14 : cy - 16,
                        fontSize: 9,
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        color: isAtOrigin ? '#fff' : '#38bdf8',
                        whiteSpace: 'nowrap',
                        zIndex: 12,
                      }}
                    >
                      {((padding[side] ?? 0) * 100).toFixed(1)}%
                    </div>
                  )}
                  {/* 투명 히트 영역 (핸들보다 넓게) */}
                  {!isDragging && (
                    <div
                      className="absolute"
                      style={{
                        left: cx - 8,
                        top: cy - 8,
                        width: 16,
                        height: 16,
                        cursor: isH ? 'ns-resize' : 'ew-resize',
                        touchAction: 'none',
                        zIndex: 13,
                      }}
                      onMouseEnter={() => setHoveredSide(side)}
                      onMouseLeave={() => setHoveredSide(null)}
                      onMouseDown={(e) => handlePartEdgeMouseDown(side, e)}
                      onTouchStart={(e) => handlePartEdgeTouchStart(side, e)}
                    />
                  )}
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* 레이아웃 컨텍스트 썸네일 (항상 7개 고정 노출) */}
      <div>
        <LayoutContextThumbnails
          jamoType={editingJamoInfo?.type}
          jamoChar={editingJamoInfo?.char}
          selectedContext={previewLayoutType}
          onSelectContext={onPreviewLayoutTypeChange}
        />
      </div>
      </div>
    </div>
  )
}
