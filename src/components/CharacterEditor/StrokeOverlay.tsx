import { useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { StrokeData, BoxConfig, PathStrokeData, RectStrokeData } from '../../types'
import { isPathStroke, isRectStroke } from '../../types'
import { pathDataToSvgD } from '../../utils/pathUtils'
import type { GlobalStyle } from '../../stores/globalStyleStore'

// === 타입 정의 ===

export type PathPointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

export type StrokeChangeHandler = (strokeId: string, prop: keyof StrokeData, value: number) => void

interface DragState {
  type: 'point' | 'handleIn' | 'handleOut' | 'rectMove' | 'rectResize' | 'pathMove'
  strokeId: string
  pointIndex: number
  strokeX: number
  strokeY: number
  boundsWidth: number
  boundsHeight: number
  grabOffsetX?: number
  grabOffsetY?: number
  resizeEdge?: 'start' | 'end'
  containerBoxAbsX?: number
  containerBoxAbsY?: number
  containerBoxAbsW?: number
  containerBoxAbsH?: number
  originalStroke?: StrokeData
}

// === Props ===

export interface StrokeOverlayProps {
  strokes: StrokeData[]
  box: BoxConfig
  svgRef: React.RefObject<SVGSVGElement | null>
  viewBoxSize: number
  onStrokeChange?: StrokeChangeHandler
  onPathPointChange?: PathPointChangeHandler
  // 혼합중성 지원
  isMixed?: boolean
  juHBox?: BoxConfig
  juVBox?: BoxConfig
  horizontalStrokeIds?: Set<string>
  verticalStrokeIds?: Set<string>
  globalStyle?: GlobalStyle
  // 획 색상 (기본: #1a1a1a)
  strokeColor?: string
}

// 리사이즈 핸들 크기
const HANDLE_SIZE = 2.5

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
  onPathPointChange,
  isMixed = false,
  juHBox,
  juVBox,
  horizontalStrokeIds,
  verticalStrokeIds,
  globalStyle,
  strokeColor = '#1a1a1a',
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

  // 절대 SVG 좌표 → 상대 좌표 (0~1)
  const absToRelative = useCallback((absX: number, absY: number, sX: number, sY: number, bW: number, bH: number) => {
    return {
      x: bW > 0 ? Math.max(0, Math.min(1, (absX - sX) / bW)) : 0,
      y: bH > 0 ? Math.max(0, Math.min(1, (absY - sY) / bH)) : 0,
    }
  }, [])

  // 스트로크의 컨테이너 박스 절대 좌표 가져오기
  const getContainerBoxAbs = useCallback((stroke: StrokeData) => {
    if (isMixed && juHBox && juVBox && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        return {
          x: juHBox.x * viewBoxSize,
          y: juHBox.y * viewBoxSize,
          w: juHBox.width * viewBoxSize,
          h: juHBox.height * viewBoxSize,
        }
      } else if (verticalStrokeIds.has(stroke.id)) {
        return {
          x: juVBox.x * viewBoxSize,
          y: juVBox.y * viewBoxSize,
          w: juVBox.width * viewBoxSize,
          h: juVBox.height * viewBoxSize,
        }
      }
    }
    return { x: boxX, y: boxY, w: boxWidth, h: boxHeight }
  }, [isMixed, juHBox, juVBox, horizontalStrokeIds, verticalStrokeIds, boxX, boxY, boxWidth, boxHeight, viewBoxSize])

  // 획의 절대 좌표 계산
  const getStrokeBounds = useCallback((stroke: StrokeData) => {
    const container = getContainerBoxAbs(stroke)
    const strokeX = container.x + stroke.x * container.w
    const strokeY = container.y + stroke.y * container.h
    const boundsWidth = stroke.width * container.w
    const boundsHeight = isRectStroke(stroke)
      ? stroke.thickness * container.h
      : (stroke as PathStrokeData).height * container.h

    return { strokeX, strokeY, boundsWidth, boundsHeight }
  }, [getContainerBoxAbs])

  // 패스 포인트/핸들 드래그 시작
  const startPathDrag = useCallback((type: 'point' | 'handleIn' | 'handleOut', strokeId: string, pointIndex: number, strokeX: number, strokeY: number, boundsWidth: number, boundsHeight: number) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setSelectedPointIndex(pointIndex)
      setDragState({ type, strokeId, pointIndex, strokeX, strokeY, boundsWidth, boundsHeight })
    }
  }, [setSelectedPointIndex])

  // Rect 이동 드래그 시작
  const startRectMove = useCallback((stroke: StrokeData) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setSelectedStrokeId(stroke.id)
      const svgPt = svgPointFromEvent(e)
      const { strokeX, strokeY, boundsWidth, boundsHeight } = getStrokeBounds(stroke)
      const container = getContainerBoxAbs(stroke)
      setDragState({
        type: 'rectMove',
        strokeId: stroke.id,
        pointIndex: 0,
        strokeX, strokeY, boundsWidth, boundsHeight,
        grabOffsetX: svgPt.x - strokeX,
        grabOffsetY: svgPt.y - strokeY,
        containerBoxAbsX: container.x,
        containerBoxAbsY: container.y,
        containerBoxAbsW: container.w,
        containerBoxAbsH: container.h,
        originalStroke: { ...stroke },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBoxAbs, getStrokeBounds])

  // Rect 리사이즈 드래그 시작
  const startRectResize = useCallback((stroke: StrokeData, edge: 'start' | 'end') => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const { strokeX, strokeY, boundsWidth, boundsHeight } = getStrokeBounds(stroke)
      const container = getContainerBoxAbs(stroke)
      setDragState({
        type: 'rectResize',
        strokeId: stroke.id,
        pointIndex: 0,
        strokeX, strokeY, boundsWidth, boundsHeight,
        resizeEdge: edge,
        containerBoxAbsX: container.x,
        containerBoxAbsY: container.y,
        containerBoxAbsW: container.w,
        containerBoxAbsH: container.h,
        originalStroke: { ...stroke },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, getContainerBoxAbs, getStrokeBounds])

  // Path 이동 드래그 시작
  const startPathMove = useCallback((stroke: StrokeData) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setSelectedStrokeId(stroke.id)
      const svgPt = svgPointFromEvent(e)
      const { strokeX, strokeY, boundsWidth, boundsHeight } = getStrokeBounds(stroke)
      const container = getContainerBoxAbs(stroke)
      setDragState({
        type: 'pathMove',
        strokeId: stroke.id,
        pointIndex: 0,
        strokeX, strokeY, boundsWidth, boundsHeight,
        grabOffsetX: svgPt.x - strokeX,
        grabOffsetY: svgPt.y - strokeY,
        containerBoxAbsX: container.x,
        containerBoxAbsY: container.y,
        containerBoxAbsW: container.w,
        containerBoxAbsH: container.h,
        originalStroke: { ...stroke },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBoxAbs, getStrokeBounds])

  // 통합 드래그 이동 핸들러
  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragState) return
    const svgPt = svgPointFromEvent(e)

    // 패스 포인트/핸들 드래그
    if (dragState.type === 'point' || dragState.type === 'handleIn' || dragState.type === 'handleOut') {
      if (!onPathPointChange) return
      const rel = absToRelative(svgPt.x, svgPt.y, dragState.strokeX, dragState.strokeY, dragState.boundsWidth, dragState.boundsHeight)

      if (dragState.type === 'point') {
        onPathPointChange(dragState.strokeId, dragState.pointIndex, 'x', rel.x)
        onPathPointChange(dragState.strokeId, dragState.pointIndex, 'y', rel.y)
      } else {
        const unclampedRel = {
          x: dragState.boundsWidth > 0 ? (svgPt.x - dragState.strokeX) / dragState.boundsWidth : 0,
          y: dragState.boundsHeight > 0 ? (svgPt.y - dragState.strokeY) / dragState.boundsHeight : 0,
        }
        onPathPointChange(dragState.strokeId, dragState.pointIndex, dragState.type, unclampedRel)
      }
      return
    }

    // Rect/Path 이동 드래그
    if (dragState.type === 'rectMove' || dragState.type === 'pathMove') {
      if (!onStrokeChange || dragState.containerBoxAbsW === undefined) return
      const cX = dragState.containerBoxAbsX!
      const cY = dragState.containerBoxAbsY!
      const cW = dragState.containerBoxAbsW
      const cH = dragState.containerBoxAbsH!
      const stroke = dragState.originalStroke!

      const newAbsX = svgPt.x - (dragState.grabOffsetX ?? 0)
      const newAbsY = svgPt.y - (dragState.grabOffsetY ?? 0)

      let newX = cW > 0 ? (newAbsX - cX) / cW : 0
      let newY = cH > 0 ? (newAbsY - cY) / cH : 0

      if (isRectStroke(stroke)) {
        newX = Math.max(stroke.width / 2, Math.min(1 - stroke.width / 2, newX))
        newY = Math.max(stroke.thickness / 2, Math.min(1 - stroke.thickness / 2, newY))
      } else if (isPathStroke(stroke)) {
        newX = Math.max(0, Math.min(1 - stroke.width, newX))
        newY = Math.max(0, Math.min(1 - stroke.height, newY))
      }

      onStrokeChange(dragState.strokeId, 'x', newX)
      onStrokeChange(dragState.strokeId, 'y', newY)
      return
    }

    // Rect 리사이즈 드래그
    if (dragState.type === 'rectResize') {
      if (!onStrokeChange || !dragState.originalStroke || dragState.containerBoxAbsW === undefined) return
      if (!isRectStroke(dragState.originalStroke)) return
      const cX = dragState.containerBoxAbsX!
      const cY = dragState.containerBoxAbsY!
      const cW = dragState.containerBoxAbsW
      const cH = dragState.containerBoxAbsH!
      const orig = dragState.originalStroke as RectStrokeData

      const angleRad = (orig.angle ?? 0) * Math.PI / 180
      const cosA = Math.cos(angleRad)
      const sinA = Math.sin(angleRad)

      const mouseRelX = cW > 0 ? (svgPt.x - cX) / cW : 0
      const mouseRelY = cH > 0 ? (svgPt.y - cY) / cH : 0
      const dx = mouseRelX - orig.x
      const dy = mouseRelY - orig.y

      const projected = dx * cosA + dy * sinA

      const halfW = orig.width / 2
      if (dragState.resizeEdge === 'start') {
        const newHalfW = Math.max(0.01, halfW - projected)
        const newWidth = newHalfW + halfW
        const shift = (orig.width - newWidth) / 2
        onStrokeChange(dragState.strokeId, 'x', orig.x + shift * cosA)
        onStrokeChange(dragState.strokeId, 'y', orig.y + shift * sinA)
        onStrokeChange(dragState.strokeId, 'width', newWidth)
      } else {
        const newHalfW = Math.max(0.01, projected)
        const newWidth = halfW + newHalfW
        const shift = (newWidth - orig.width) / 2
        onStrokeChange(dragState.strokeId, 'x', orig.x + shift * cosA)
        onStrokeChange(dragState.strokeId, 'y', orig.y + shift * sinA)
        onStrokeChange(dragState.strokeId, 'width', newWidth)
      }
      return
    }
  }, [dragState, onPathPointChange, onStrokeChange, svgPointFromEvent, absToRelative])

  // 드래그 종료
  const handlePointerUp = useCallback(() => {
    setDragState(null)
  }, [])

  // Rect 리사이즈 핸들 렌더링
  const renderRectHandles = (stroke: StrokeData, cx: number, cy: number, bWidth: number) => {
    if (!isRectStroke(stroke)) return null
    const angle = stroke.angle ?? 0
    const angleRad = angle * Math.PI / 180
    const halfW = bWidth / 2
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    const startX = cx - halfW * cosA
    const startY = cy - halfW * sinA
    const endX = cx + halfW * cosA
    const endY = cy + halfW * sinA

    const cursor = angle === 90 ? 'ns-resize' : angle === 0 ? 'ew-resize' : 'move'

    return (
      <g key={`handles-${stroke.id}`}>
        <circle
          cx={startX} cy={startY} r={HANDLE_SIZE}
          fill="#7c3aed" stroke="#fff" strokeWidth={0.5}
          style={{ cursor }}
          onMouseDown={startRectResize(stroke, 'start')}
          onTouchStart={startRectResize(stroke, 'start')}
        />
        <circle
          cx={endX} cy={endY} r={HANDLE_SIZE}
          fill="#7c3aed" stroke="#fff" strokeWidth={0.5}
          style={{ cursor }}
          onMouseDown={startRectResize(stroke, 'end')}
          onTouchStart={startRectResize(stroke, 'end')}
        />
      </g>
    )
  }

  // Path 바운딩 박스 오버레이 (이동 가능)
  const renderPathBoundsOverlay = (stroke: PathStrokeData, sX: number, sY: number, bW: number, bH: number) => {
    return (
      <rect
        key={`pathbounds-${stroke.id}`}
        x={sX}
        y={sY}
        width={bW}
        height={bH}
        fill="transparent"
        stroke="#7c3aed"
        strokeWidth={0.8}
        strokeDasharray="2,2"
        opacity={0.6}
        style={{ cursor: 'move' }}
        onMouseDown={startPathMove(stroke)}
        onTouchStart={startPathMove(stroke)}
      />
    )
  }

  // Path 포인트/핸들 오버레이 렌더링
  const renderPathOverlay = (stroke: PathStrokeData, sX: number, sY: number, bW: number, bH: number) => {
    const { points } = stroke.pathData

    const toAbs = (px: number, py: number): [number, number] => [
      sX + px * bW,
      sY + py * bH,
    ]

    return (
      <g key={`overlay-${stroke.id}`}>
        {/* 선택된 포인트의 핸들 표시 */}
        {selectedPointIndex !== null && selectedPointIndex < points.length && (() => {
          const point = points[selectedPointIndex]
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
                      onMouseDown={startPathDrag('handleIn', stroke.id, selectedPointIndex, sX, sY, bW, bH)}
                      onTouchStart={startPathDrag('handleIn', stroke.id, selectedPointIndex, sX, sY, bW, bH)} />
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
                      onMouseDown={startPathDrag('handleOut', stroke.id, selectedPointIndex, sX, sY, bW, bH)}
                      onTouchStart={startPathDrag('handleOut', stroke.id, selectedPointIndex, sX, sY, bW, bH)} />
                  </>
                )
              })()}
            </>
          )
        })()}

        {/* 모든 앵커 포인트 */}
        {points.map((pt, i) => {
          const [ptX, ptY] = toAbs(pt.x, pt.y)
          const isActive = i === selectedPointIndex
          return (
            <circle key={i} cx={ptX} cy={ptY} r={2.5}
              fill={isActive ? '#ff6b6b' : '#4ecdc4'}
              stroke="#fff" strokeWidth={0.5}
              style={{ cursor: 'grab' }}
              onMouseDown={startPathDrag('point', stroke.id, i, sX, sY, bW, bH)}
              onTouchStart={startPathDrag('point', stroke.id, i, sX, sY, bW, bH)} />
          )
        })}
      </g>
    )
  }

  // 드래그 중 커서
  const getDragCursor = () => {
    if (!dragState) return undefined
    switch (dragState.type) {
      case 'rectMove':
      case 'pathMove':
        return 'move'
      case 'rectResize': {
        const orig = dragState.originalStroke
        if (orig && isRectStroke(orig)) {
          const a = orig.angle ?? 0
          if (a === 0) return 'ew-resize'
          if (a === 90) return 'ns-resize'
        }
        return 'move'
      }
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
      {/* 드래그 중 전체 영역 캡처용 투명 rect (slant 변환 내부이므로 넉넉하게) */}
      {dragState && (
        <rect x={-50} y={-50} width={viewBoxSize + 100} height={viewBoxSize + 100} fill="transparent" />
      )}

      {strokes.map((stroke) => {
        const isSelected = stroke.id === selectedStrokeId
        const { strokeX, strokeY, boundsWidth, boundsHeight } = getStrokeBounds(stroke)

        // === PATH 스트로크 ===
        if (isPathStroke(stroke)) {
          const d = pathDataToSvgD(stroke.pathData, strokeX, strokeY, boundsWidth, boundsHeight)
          const container = getContainerBoxAbs(stroke)
          const pathThickness = stroke.thickness * weightMultiplier * container.h
          return (
            <g key={stroke.id}>
              {/* 넓은 히트 영역 (투명) - 이동용 */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={pathThickness * 4}
                onClick={() => setSelectedStrokeId(stroke.id)}
                onMouseDown={onStrokeChange ? startPathMove(stroke) : undefined}
                onTouchStart={onStrokeChange ? startPathMove(stroke) : undefined}
                style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
              />
              {/* 실제 렌더링 */}
              <path
                d={d}
                fill="none"
                stroke={isSelected ? '#ff6b6b' : strokeColor}
                strokeWidth={pathThickness}
                strokeLinecap="round"
                strokeLinejoin="round"
                onClick={() => setSelectedStrokeId(stroke.id)}
                onMouseDown={onStrokeChange ? startPathMove(stroke) : undefined}
                onTouchStart={onStrokeChange ? startPathMove(stroke) : undefined}
                style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
              />
              {/* 선택된 path의 바운딩 박스 + 포인트/핸들 오버레이 */}
              {isSelected && (
                <>
                  {onStrokeChange && renderPathBoundsOverlay(stroke, strokeX, strokeY, boundsWidth, boundsHeight)}
                  {onPathPointChange && renderPathOverlay(stroke, strokeX, strokeY, boundsWidth, boundsHeight)}
                </>
              )}
            </g>
          )
        }

        // === RECT 스트로크 ===
        const container = getContainerBoxAbs(stroke)
        const rectW = stroke.width * container.w
        const rectH = (stroke as RectStrokeData).thickness * weightMultiplier * container.h
        const angle = (stroke as RectStrokeData).angle ?? 0

        return (
          <g key={stroke.id}>
            <rect
              x={strokeX - rectW / 2}
              y={strokeY - rectH / 2}
              width={rectW}
              height={rectH}
              transform={angle !== 0 ? `rotate(${angle}, ${strokeX}, ${strokeY})` : undefined}
              fill={isSelected ? '#ff6b6b' : strokeColor}
              stroke={isSelected ? '#ff0000' : 'none'}
              strokeWidth={isSelected ? 1 : 0}
              rx={1}
              ry={1}
              onClick={() => setSelectedStrokeId(stroke.id)}
              onMouseDown={onStrokeChange ? startRectMove(stroke) : undefined}
              onTouchStart={onStrokeChange ? startRectMove(stroke) : undefined}
              style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
            />
            {/* 선택된 rect의 리사이즈 핸들 */}
            {isSelected && onStrokeChange && renderRectHandles(stroke, strokeX, strokeY, boundsWidth)}
          </g>
        )
      })}
    </g>
  )
}
