import { useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, BoxConfig, Padding } from '../../types'
import { pointsToSvgD } from '../../utils/pathUtils'
import type { GlobalStyle } from '../../stores/globalStyleStore'

// === 타입 정의 ===

export type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

export type StrokeChangeHandler = (strokeId: string, prop: string, value: number) => void

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
  isMixed = false,
  juHBox,
  juVBox,
  horizontalStrokeIds,
  verticalStrokeIds,
  globalStyle,
  strokeColor = '#1a1a1a',
  jamoPadding,
}: StrokeOverlayProps) {
  const { selectedStrokeId, setSelectedStrokeId, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const [dragState, setDragState] = useState<DragState | null>(null)

  const weightMultiplier = globalStyle?.weight ?? 1.0

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
          jamoPadding
        )
      } else if (verticalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(
          juVBox.x * viewBoxSize, juVBox.y * viewBoxSize,
          juVBox.width * viewBoxSize, juVBox.height * viewBoxSize,
          jamoPadding
        )
      }
    }
    return applyJamoPaddingToBox(boxX, boxY, boxWidth, boxHeight, jamoPadding)
  }, [isMixed, juHBox, juVBox, horizontalStrokeIds, verticalStrokeIds, boxX, boxY, boxWidth, boxHeight, viewBoxSize, jamoPadding])

  // 스트로크의 컨테이너 박스 (패딩 적용됨, 0~1 좌표, pointsToSvgD용)
  const getContainerBoxNormalized = useCallback((stroke: StrokeDataV2): BoxConfig => {
    if (isMixed && juHBox && juVBox && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        const padded = applyJamoPaddingToBox(juHBox.x, juHBox.y, juHBox.width, juHBox.height, jamoPadding)
        return padded
      } else if (verticalStrokeIds.has(stroke.id)) {
        const padded = applyJamoPaddingToBox(juVBox.x, juVBox.y, juVBox.width, juVBox.height, jamoPadding)
        return padded
      }
    }
    const padded = applyJamoPaddingToBox(box.x, box.y, box.width, box.height, jamoPadding)
    return padded
  }, [isMixed, juHBox, juVBox, horizontalStrokeIds, verticalStrokeIds, box, jamoPadding])

  // 포인트/핸들 드래그 시작
  const startPointDrag = useCallback((type: 'point' | 'handleIn' | 'handleOut', strokeId: string, pointIndex: number, container: BoxConfig) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
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
  }, [setSelectedPointIndex])

  // 획 전체 이동 드래그 시작
  const startStrokeMove = useCallback((stroke: StrokeDataV2) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
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
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBoxAbs])

  // 통합 드래그 이동 핸들러
  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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
        onPointChange(dragState.strokeId, dragState.pointIndex, 'x', Math.max(0, Math.min(1, relX)))
        onPointChange(dragState.strokeId, dragState.pointIndex, 'y', Math.max(0, Math.min(1, relY)))
      } else {
        onPointChange(dragState.strokeId, dragState.pointIndex, dragState.type, { x: relX, y: relY })
      }
      return
    }

    // 획 전체 이동
    if (dragState.type === 'strokeMove') {
      if (!onPointChange || !dragState.originalPoints) return
      const mouseRelX = cW > 0 ? (svgPt.x - cX) / cW : 0
      const mouseRelY = cH > 0 ? (svgPt.y - cY) / cH : 0
      const deltaX = mouseRelX - (dragState.grabRelX ?? 0)
      const deltaY = mouseRelY - (dragState.grabRelY ?? 0)

      dragState.originalPoints.forEach((origPt, i) => {
        onPointChange(dragState.strokeId, i, 'x', origPt.x + deltaX)
        onPointChange(dragState.strokeId, i, 'y', origPt.y + deltaY)
      })
      return
    }
  }, [dragState, onPointChange, svgPointFromEvent])

  // 드래그 종료
  const handlePointerUp = useCallback(() => {
    setDragState(null)
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

  return (
    <g
      style={dragState ? { cursor: getDragCursor() } : undefined}
      onMouseMove={dragState ? handlePointerMove : undefined}
      onMouseUp={dragState ? handlePointerUp : undefined}
      onMouseLeave={dragState ? handlePointerUp : undefined}
      onTouchMove={dragState ? handlePointerMove : undefined}
      onTouchEnd={dragState ? handlePointerUp : undefined}
      onTouchCancel={dragState ? handlePointerUp : undefined}
    >
      {/* 드래그 중 전체 영역 캡처용 투명 rect */}
      {dragState && (
        <rect x={-50} y={-50} width={viewBoxSize + 100} height={viewBoxSize + 100} fill="transparent" />
      )}

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
              fill={stroke.closed ? 'transparent' : 'none'}
              stroke="transparent"
              strokeWidth={pathThickness * 4}
              onClick={() => setSelectedStrokeId(stroke.id)}
              onMouseDown={onStrokeChange ? startStrokeMove(stroke) : undefined}
              onTouchStart={onStrokeChange ? startStrokeMove(stroke) : undefined}
              style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
            />
            {/* 실제 렌더링 */}
            <path
              d={d}
              fill={stroke.closed ? (isSelected ? '#ff6b6b' : strokeColor) : 'none'}
              stroke={isSelected ? '#ff6b6b' : strokeColor}
              strokeWidth={stroke.closed ? 0 : pathThickness}
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={() => setSelectedStrokeId(stroke.id)}
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
                      onMouseDown={startPointDrag('point', stroke.id, i, containerAbs)}
                      onTouchStart={startPointDrag('point', stroke.id, i, containerAbs)} />
                  )
                })}
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
