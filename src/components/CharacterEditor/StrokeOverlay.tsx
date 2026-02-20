import { useState, useCallback, useMemo, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, BoxConfig, Padding } from '../../types'
import { pointsToSvgD } from '../../utils/pathUtils'
import { collectSnapTargets, snapPoint, detectMergeHint } from '../../utils/snapUtils'
import type { SnapResult, MergeHint } from '../../utils/snapUtils'
import { weightToMultiplier, resolveLinecap } from '../../stores/globalStyleStore'
import type { GlobalStyle } from '../../stores/globalStyleStore'

// === 타입 정의 ===

export type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

export type StrokeChangeHandler = (strokeId: string, prop: string, value: number | string | undefined) => void

interface DragState {
  type: 'point' | 'handleIn' | 'handleOut' | 'strokeMove'
  strokeId: string
  pointIndex: number
  // strokeMove 시: 원래 points 스냅샷 + 그랩 오프셋
  originalPoints?: { x: number; y: number }[]
  grabRelX?: number
  grabRelY?: number
  // 컨테이너 박스 절대 좌표
  containerX: number
  containerY: number
  containerW: number
  containerH: number
}

// === Props ===

export interface StrokeOverlayProps {
  strokes: StrokeDataV2[]
  box: BoxConfig
  svgRef: React.RefObject<SVGSVGElement | null>
  viewBoxSize: number
  onStrokeChange?: StrokeChangeHandler
  onPointChange?: PointChangeHandler
  onDragStart?: () => void // 드래그 시작 시 호출 (undo 스냅샷 저장용)
  // 혼합중성 지원
  isMixed?: boolean
  juHBox?: BoxConfig
  juVBox?: BoxConfig
  horizontalStrokeIds?: Set<string>
  verticalStrokeIds?: Set<string>
  globalStyle?: GlobalStyle
  // 획 색상 (기본: #1a1a1a)
  strokeColor?: string
  // 자모 패딩 (박스를 패딩만큼 축소)
  jamoPadding?: Padding
  // 혼합중성 파트별 개별 패딩
  horizontalPadding?: Padding
  verticalPadding?: Padding
}

// 자모 패딩 적용
function applyJamoPaddingToBox(bx: number, by: number, bw: number, bh: number, padding?: Padding): BoxConfig {
  if (!padding) return { x: bx, y: by, width: bw, height: bh }
  return {
    x: bx + padding.left * bw,
    y: by + padding.top * bh,
    width: bw * (1 - padding.left - padding.right),
    height: bh * (1 - padding.top - padding.bottom),
  }
}

/**
 * StrokeOverlay: 획 드래그/리사이즈 상호작용을 SVG `<g>` 프래그먼트로 제공
 *
 * 사용처:
 * - CharacterPreview (기존): 자모 확대 미리보기에서 직접 렌더링
 * - LayoutEditor (신규): SvgRenderer children으로 전달하여 전체 레이아웃 뷰에서 렌더링
 *
 * 반환: SVG <g> 프래그먼트 (부모 SVG/g 안에 삽입)
 */
export function StrokeOverlay({
  strokes,
  box,
  svgRef,
  viewBoxSize,
  onStrokeChange,
  onPointChange,
  onDragStart,
  isMixed = false,
  juHBox,
  juVBox,
  horizontalStrokeIds,
  verticalStrokeIds,
  globalStyle,
  strokeColor = '#1a1a1a',
  jamoPadding,
  horizontalPadding,
  verticalPadding,
}: StrokeOverlayProps) {
  const { selectedStrokeId, setSelectedStrokeId, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [snapFeedback, setSnapFeedback] = useState<SnapResult | null>(null)
  const [mergeHintState, setMergeHintState] = useState<MergeHint | null>(null)

  const weightMultiplier = globalStyle ? weightToMultiplier(globalStyle.weight) : 1.0

  // 박스 절대 좌표
  const boxX = box.x * viewBoxSize
  const boxY = box.y * viewBoxSize
  const boxWidth = box.width * viewBoxSize
  const boxHeight = box.height * viewBoxSize

  // SVG 이벤트에서 viewBox 좌표 추출
  const svgPointFromEvent = useCallback((e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inv = ctm.inverse()
    const pt = svg.createSVGPoint()
    if ('touches' in e) {
      const touch = e.touches[0] || (e as TouchEvent).changedTouches?.[0]
      if (!touch) return { x: 0, y: 0 }
      pt.x = touch.clientX
      pt.y = touch.clientY
    } else {
      pt.x = e.clientX
      pt.y = e.clientY
    }
    const svgPt = pt.matrixTransform(inv)
    return { x: svgPt.x, y: svgPt.y }
  }, [svgRef])

  // 스트로크의 컨테이너 박스 (패딩 적용됨, 절대 좌표)
  const getContainerBoxAbs = useCallback((stroke: StrokeDataV2) => {
    if (isMixed && juHBox && juVBox && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(
          juHBox.x * viewBoxSize, juHBox.y * viewBoxSize,
          juHBox.width * viewBoxSize, juHBox.height * viewBoxSize,
          horizontalPadding ?? jamoPadding
        )
      } else if (verticalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(
          juVBox.x * viewBoxSize, juVBox.y * viewBoxSize,
          juVBox.width * viewBoxSize, juVBox.height * viewBoxSize,
          verticalPadding ?? jamoPadding
        )
      }
    }
    return applyJamoPaddingToBox(boxX, boxY, boxWidth, boxHeight, jamoPadding)
  }, [isMixed, juHBox, juVBox, horizontalStrokeIds, verticalStrokeIds, boxX, boxY, boxWidth, boxHeight, viewBoxSize, jamoPadding, horizontalPadding, verticalPadding])

  // 스트로크의 컨테이너 박스 (패딩 적용됨, 0~1 좌표, pointsToSvgD용)
  const getContainerBoxNormalized = useCallback((stroke: StrokeDataV2): BoxConfig => {
    if (isMixed && juHBox && juVBox && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(juHBox.x, juHBox.y, juHBox.width, juHBox.height, horizontalPadding ?? jamoPadding)
      } else if (verticalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(juVBox.x, juVBox.y, juVBox.width, juVBox.height, verticalPadding ?? jamoPadding)
      }
    }
    return applyJamoPaddingToBox(box.x, box.y, box.width, box.height, jamoPadding)
  }, [isMixed, juHBox, juVBox, horizontalStrokeIds, verticalStrokeIds, box, jamoPadding, horizontalPadding, verticalPadding])

  // 스냅 타겟 캐시 (드래그 중인 획 제외)
  const snapTargets = useMemo(() => {
    if (!dragState) return []
    return collectSnapTargets(strokes, dragState.strokeId)
  }, [strokes, dragState?.strokeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 포인트/핸들 드래그 시작
  const startPointDrag = useCallback((type: 'point' | 'handleIn' | 'handleOut', strokeId: string, pointIndex: number, container: BoxConfig) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onDragStart?.()
      setSelectedPointIndex(pointIndex)
      setDragState({
        type,
        strokeId,
        pointIndex,
        containerX: container.x,
        containerY: container.y,
        containerW: container.width,
        containerH: container.height,
      })
    }
  }, [setSelectedPointIndex, onDragStart])

  // 획 전체 이동 드래그 시작
  const startStrokeMove = useCallback((stroke: StrokeDataV2) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onDragStart?.()
      setSelectedStrokeId(stroke.id)
      const svgPt = svgPointFromEvent(e)
      const container = getContainerBoxAbs(stroke)
      const grabRelX = container.width > 0 ? (svgPt.x - container.x) / container.width : 0
      const grabRelY = container.height > 0 ? (svgPt.y - container.y) / container.height : 0
      setDragState({
        type: 'strokeMove',
        strokeId: stroke.id,
        pointIndex: 0,
        originalPoints: stroke.points.map(p => ({ x: p.x, y: p.y })),
        grabRelX,
        grabRelY,
        containerX: container.x,
        containerY: container.y,
        containerW: container.width,
        containerH: container.height,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBoxAbs, onDragStart])

  // 통합 드래그 이동 핸들러
  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!dragState) return
    const svgPt = svgPointFromEvent(e)
    const cX = dragState.containerX
    const cY = dragState.containerY
    const cW = dragState.containerW
    const cH = dragState.containerH

    // 포인트/핸들 드래그
    if (dragState.type === 'point' || dragState.type === 'handleIn' || dragState.type === 'handleOut') {
      if (!onPointChange) return
      const relX = cW > 0 ? (svgPt.x - cX) / cW : 0
      const relY = cH > 0 ? (svgPt.y - cY) / cH : 0

      if (dragState.type === 'point') {
        const clampedX = Math.max(0, Math.min(1, relX))
        const clampedY = Math.max(0, Math.min(1, relY))

        // 스냅 적용
        const snap = snapPoint(clampedX, clampedY, snapTargets)
        onPointChange(dragState.strokeId, dragState.pointIndex, 'x', snap.x)
        onPointChange(dragState.strokeId, dragState.pointIndex, 'y', snap.y)
        setSnapFeedback(snap.snappedX || snap.snappedY ? snap : null)

        // 병합 힌트 감지
        // strokes에서 현재 드래그 포인트가 snap 적용된 좌표를 기준으로 감지
        const currentStrokes = strokes.map(s => {
          if (s.id !== dragState.strokeId) return s
          const newPoints = s.points.map((p, i) =>
            i === dragState.pointIndex ? { ...p, x: snap.x, y: snap.y } : p
          )
          return { ...s, points: newPoints }
        })
        const hint = detectMergeHint(currentStrokes, dragState.strokeId, dragState.pointIndex)
        setMergeHintState(hint)
      } else {
        // 핸들은 스냅 없이 자유 이동
        onPointChange(dragState.strokeId, dragState.pointIndex, dragState.type, { x: relX, y: relY })
        setSnapFeedback(null)
        setMergeHintState(null)
      }
      return
    }

    // 획 전체 이동
    if (dragState.type === 'strokeMove') {
      if (!onPointChange || !dragState.originalPoints) return
      const mouseRelX = cW > 0 ? (svgPt.x - cX) / cW : 0
      const mouseRelY = cH > 0 ? (svgPt.y - cY) / cH : 0
      const rawDeltaX = mouseRelX - (dragState.grabRelX ?? 0)
      const rawDeltaY = mouseRelY - (dragState.grabRelY ?? 0)

      // 첫 번째 포인트 기준으로 스냅 → 동일 delta를 모든 포인트에 적용
      const firstOrig = dragState.originalPoints[0]
      const firstNewX = firstOrig.x + rawDeltaX
      const firstNewY = firstOrig.y + rawDeltaY
      const snap = snapPoint(firstNewX, firstNewY, snapTargets)
      const snappedDeltaX = snap.x - firstOrig.x
      const snappedDeltaY = snap.y - firstOrig.y

      dragState.originalPoints.forEach((origPt, i) => {
        onPointChange(dragState.strokeId, i, 'x', origPt.x + snappedDeltaX)
        onPointChange(dragState.strokeId, i, 'y', origPt.y + snappedDeltaY)
      })
      setSnapFeedback(snap.snappedX || snap.snappedY ? snap : null)
      setMergeHintState(null)
      return
    }
  }, [dragState, onPointChange, svgPointFromEvent, snapTargets, strokes])

  // 드래그 종료
  const handlePointerUp = useCallback(() => {
    setDragState(null)
    setSnapFeedback(null)
    setMergeHintState(null)
  }, [])

  // 드래그 중 커서
  const getDragCursor = () => {
    if (!dragState) return undefined
    switch (dragState.type) {
      case 'strokeMove':
        return 'move'
      case 'point':
      case 'handleIn':
      case 'handleOut':
        return 'grabbing'
    }
  }

  // 가이드라인 렌더링용: 현재 드래그 획의 컨테이너 절대 좌표
  const dragContainerAbs = useMemo(() => {
    if (!dragState) return null
    const stroke = strokes.find(s => s.id === dragState.strokeId)
    if (!stroke) return null
    return getContainerBoxAbs(stroke)
  }, [dragState, strokes, getContainerBoxAbs])

  // window 레벨 드래그 이벤트 (범위 밖에서도 드래그 유지)
  useEffect(() => {
    if (!dragState) return

    const handleWindowMove = (e: MouseEvent | TouchEvent) => {
      handlePointerMove(e)
    }

    const handleWindowUp = () => {
      handlePointerUp()
    }

    window.addEventListener('mousemove', handleWindowMove)
    window.addEventListener('mouseup', handleWindowUp)
    window.addEventListener('touchmove', handleWindowMove)
    window.addEventListener('touchend', handleWindowUp)
    window.addEventListener('touchcancel', handleWindowUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMove)
      window.removeEventListener('mouseup', handleWindowUp)
      window.removeEventListener('touchmove', handleWindowMove)
      window.removeEventListener('touchend', handleWindowUp)
      window.removeEventListener('touchcancel', handleWindowUp)
    }
  }, [dragState, handlePointerMove, handlePointerUp])

  // 빈 영역 클릭 시 선택 해제
  const handleBackgroundClick = useCallback(() => {
    if (!dragState) {
      setSelectedPointIndex(null)
      setSelectedStrokeId(null)
    }
  }, [dragState, setSelectedPointIndex, setSelectedStrokeId])

  return (
    <g
      style={dragState ? { cursor: getDragCursor() } : undefined}
    >
      {/* 배경: 빈 영역 클릭 시 선택 해제 (viewBox 범위 내로 제한) */}
      <rect
        x={0} y={0}
        width={viewBoxSize} height={viewBoxSize}
        fill="transparent"
        onClick={handleBackgroundClick}
      />

      {strokes.map((stroke) => {
        const isSelected = stroke.id === selectedStrokeId
        const containerNorm = getContainerBoxNormalized(stroke)
        const containerAbs = getContainerBoxAbs(stroke)
        const d = pointsToSvgD(stroke.points, stroke.closed, containerNorm, viewBoxSize)
        if (!d) return null
        const pathThickness = stroke.thickness * weightMultiplier * viewBoxSize

        // 포인트를 절대 좌표로 변환 (오버레이용)
        const toAbs = (px: number, py: number): [number, number] => [
          containerAbs.x + px * containerAbs.width,
          containerAbs.y + py * containerAbs.height,
        ]

        return (
          <g key={stroke.id}>
            {/* 넓은 히트 영역 (투명) - 이동용 */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={pathThickness * 4}
              onClick={(e) => { e.stopPropagation(); setSelectedStrokeId(stroke.id) }}
              onMouseDown={onStrokeChange ? startStrokeMove(stroke) : undefined}
              onTouchStart={onStrokeChange ? startStrokeMove(stroke) : undefined}
              style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
            />
            {/* 실제 렌더링 */}
            <path
              d={d}
              fill="none"
              stroke={isSelected ? '#ff6b6b' : strokeColor}
              strokeWidth={pathThickness}
              strokeLinecap={resolveLinecap(stroke.linecap, globalStyle?.linecap)}
              strokeLinejoin="round"
              onClick={(e) => { e.stopPropagation(); setSelectedStrokeId(stroke.id) }}
              onMouseDown={onStrokeChange ? startStrokeMove(stroke) : undefined}
              onTouchStart={onStrokeChange ? startStrokeMove(stroke) : undefined}
              style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
            />

            {/* 선택된 획의 포인트/핸들 오버레이 */}
            {isSelected && onPointChange && (
              <g>
                {/* 선택된 포인트의 핸들 표시 */}
                {selectedPointIndex !== null && selectedPointIndex < stroke.points.length && (() => {
                  const point = stroke.points[selectedPointIndex]
                  const [ptX, ptY] = toAbs(point.x, point.y)

                  return (
                    <>
                      {point.handleIn && (() => {
                        const [hx, hy] = toAbs(point.handleIn.x, point.handleIn.y)
                        return (
                          <>
                            <line x1={ptX} y1={ptY} x2={hx} y2={hy}
                              stroke="#ff6b6b" strokeWidth={0.5} opacity={0.6} />
                            <circle cx={hx} cy={hy} r={1.8}
                              fill="#ff6b6b" stroke="#fff" strokeWidth={0.3}
                              style={{ cursor: 'grab' }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={startPointDrag('handleIn', stroke.id, selectedPointIndex, containerAbs)}
                              onTouchStart={startPointDrag('handleIn', stroke.id, selectedPointIndex, containerAbs)} />
                          </>
                        )
                      })()}
                      {point.handleOut && (() => {
                        const [hx, hy] = toAbs(point.handleOut.x, point.handleOut.y)
                        return (
                          <>
                            <line x1={ptX} y1={ptY} x2={hx} y2={hy}
                              stroke="#4ecdc4" strokeWidth={0.5} opacity={0.6} />
                            <circle cx={hx} cy={hy} r={1.8}
                              fill="#4ecdc4" stroke="#fff" strokeWidth={0.3}
                              style={{ cursor: 'grab' }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={startPointDrag('handleOut', stroke.id, selectedPointIndex, containerAbs)}
                              onTouchStart={startPointDrag('handleOut', stroke.id, selectedPointIndex, containerAbs)} />
                          </>
                        )
                      })()}
                    </>
                  )
                })()}

                {/* 모든 앵커 포인트 */}
                {stroke.points.map((pt, i) => {
                  const [ptX, ptY] = toAbs(pt.x, pt.y)
                  const isActive = i === selectedPointIndex
                  return (
                    <circle key={i} cx={ptX} cy={ptY} r={2.5}
                      fill={isActive ? '#ff6b6b' : '#4ecdc4'}
                      stroke="#fff" strokeWidth={0.5}
                      style={{ cursor: 'grab' }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={startPointDrag('point', stroke.id, i, containerAbs)}
                      onTouchStart={startPointDrag('point', stroke.id, i, containerAbs)} />
                  )
                })}
              </g>
            )}
          </g>
        )
      })}

      {/* === 스냅 시각적 피드백 === */}
      {snapFeedback && dragContainerAbs && (
        <g pointerEvents="none">
          {snapFeedback.guideLines.map((guide, i) => {
            const isGrid = guide.type === 'grid'
            const color = isGrid ? '#4ecdc4' : '#ff9500'
            const dashArray = isGrid ? '2,2' : 'none'
            const opacity = isGrid ? 0.6 : 0.8

            if (guide.axis === 'x') {
              const absX = dragContainerAbs.x + guide.value * dragContainerAbs.width
              return (
                <line key={`guide-${i}`}
                  x1={absX} y1={dragContainerAbs.y - 5}
                  x2={absX} y2={dragContainerAbs.y + dragContainerAbs.height + 5}
                  stroke={color} strokeWidth={0.4} strokeDasharray={dashArray} opacity={opacity}
                />
              )
            } else {
              const absY = dragContainerAbs.y + guide.value * dragContainerAbs.height
              return (
                <line key={`guide-${i}`}
                  x1={dragContainerAbs.x - 5} y1={absY}
                  x2={dragContainerAbs.x + dragContainerAbs.width + 5} y2={absY}
                  stroke={color} strokeWidth={0.4} strokeDasharray={dashArray} opacity={opacity}
                />
              )
            }
          })}
        </g>
      )}

      {/* === 병합 힌트 === */}
      {mergeHintState && dragContainerAbs && (() => {
        // 타겟 포인트의 절대 좌표
        const targetStroke = strokes.find(s => s.id === mergeHintState.targetStrokeId)
        if (!targetStroke) return null
        const targetContainer = getContainerBoxAbs(targetStroke)
        const tX = targetContainer.x + mergeHintState.targetPoint.x * targetContainer.width
        const tY = targetContainer.y + mergeHintState.targetPoint.y * targetContainer.height

        // 소스 포인트의 절대 좌표
        const sourceStroke = strokes.find(s => s.id === mergeHintState.sourceStrokeId)
        if (!sourceStroke) return null
        const sourceContainer = getContainerBoxAbs(sourceStroke)
        const srcPt = sourceStroke.points[mergeHintState.sourcePointIndex]
        if (!srcPt) return null
        const sX = sourceContainer.x + srcPt.x * sourceContainer.width
        const sY = sourceContainer.y + srcPt.y * sourceContainer.height

        return (
          <g pointerEvents="none">
            {/* 연결 점선 */}
            <line x1={sX} y1={sY} x2={tX} y2={tY}
              stroke="#22c55e" strokeWidth={0.5} strokeDasharray="1.5,1.5" opacity={0.8} />
            {/* 타겟 끝점 펄스 원 */}
            <circle cx={tX} cy={tY} r={3} fill="none" stroke="#22c55e" strokeWidth={0.8} opacity={0.9}>
              <animate attributeName="r" values="3;5;3" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" />
            </circle>
            {/* 타겟 끝점 내부 원 */}
            <circle cx={tX} cy={tY} r={2} fill="#22c55e" opacity={0.6} />
          </g>
        )
      })()}
    </g>
  )
}
