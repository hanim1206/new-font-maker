import { useState, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import type { StrokeData, BoxConfig, PathStrokeData, RectStrokeData } from '../../types'
import { isPathStroke, isRectStroke } from '../../types'
import { pathDataToSvgD } from '../../utils/pathUtils'

type PathPointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

type StrokeChangeHandler = (strokeId: string, prop: keyof StrokeData, value: number) => void

interface CharacterPreviewProps {
  jamoChar: string
  strokes: StrokeData[]
  boxInfo?: BoxConfig & { juH?: BoxConfig; juV?: BoxConfig }
  jamoType?: 'choseong' | 'jungseong' | 'jongseong'
  onPathPointChange?: PathPointChangeHandler
  onStrokeChange?: StrokeChangeHandler
}

const VIEW_BOX_SIZE = 100

// viewBox 마진 (박스 영역 주변 여백)
const VIEW_MARGIN = 3

// 리사이즈 핸들 크기
const HANDLE_SIZE = 2.5

// 박스 타입별 색상
const BOX_COLORS: Record<string, string> = {
  CH: '#ff6b6b',
  JU: '#4ecdc4',
  JU_H: '#ff9500',
  JU_V: '#ffd700',
  JO: '#4169e1',
}

// 드래그 상태 타입
interface DragState {
  type: 'point' | 'handleIn' | 'handleOut' | 'rectMove' | 'rectResize' | 'pathMove'
  strokeId: string
  pointIndex: number
  strokeX: number
  strokeY: number
  boundsWidth: number
  boundsHeight: number
  // rectMove/pathMove: 마우스 시작 위치에서 스트로크 원점까지의 오프셋 (SVG abs 좌표)
  grabOffsetX?: number
  grabOffsetY?: number
  // rectResize: 리사이즈 방향
  resizeEdge?: 'start' | 'end'
  // 컨테이너 박스 (0~1 좌표 변환용)
  containerBoxAbsX?: number
  containerBoxAbsY?: number
  containerBoxAbsW?: number
  containerBoxAbsH?: number
  // 원본 스트로크 데이터 (리사이즈 시 사용)
  originalStroke?: StrokeData
}

export function CharacterPreview({ jamoChar, strokes, boxInfo = { x: 0, y: 0, width: 1, height: 1 }, jamoType, onPathPointChange, onStrokeChange }: CharacterPreviewProps) {
  const { selectedStrokeId, setSelectedStrokeId, editingJamoType, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const { jungseong } = useJamoStore()
  const { style: globalStyle } = useGlobalStyleStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  // jamoType이 전달되지 않으면 store에서 가져오기
  const currentJamoType = jamoType || editingJamoType

  // 혼합 중성인지 확인하고, 각 획이 어느 박스에 속하는지 확인
  const isMixed = currentJamoType === 'jungseong' && boxInfo.juH && boxInfo.juV
  let horizontalStrokeIds: Set<string> | null = null
  let verticalStrokeIds: Set<string> | null = null

  if (isMixed) {
    const jamo = jungseong[jamoChar]
    if (jamo?.horizontalStrokes && jamo?.verticalStrokes) {
      horizontalStrokeIds = new Set(jamo.horizontalStrokes.map(s => s.id))
      verticalStrokeIds = new Set(jamo.verticalStrokes.map(s => s.id))
    }
  }

  // 글로벌 스타일 적용
  const weightMultiplier = globalStyle.weight ?? 1.0
  const slant = globalStyle.slant ?? 0

  // 박스 영역을 viewBox 좌표로 변환
  const boxX = boxInfo.x * VIEW_BOX_SIZE
  const boxY = boxInfo.y * VIEW_BOX_SIZE
  const boxWidth = boxInfo.width * VIEW_BOX_SIZE
  const boxHeight = boxInfo.height * VIEW_BOX_SIZE

  // viewBox를 박스 영역에 맞춰 줌 (마진 포함)
  // 종횡비를 0.75~1.25 범위로 제한하여 레이아웃 컨텍스트 전환 시 크기 변동 최소화
  const MIN_ASPECT = 0.75  // 높이/너비 최소 (너무 납작 방지)
  const MAX_ASPECT = 1.25  // 높이/너비 최대 (너무 세로로 긴 것 방지)
  let vbX = boxX - VIEW_MARGIN
  let vbY = boxY - VIEW_MARGIN
  let vbW = boxWidth + 2 * VIEW_MARGIN
  let vbH = boxHeight + 2 * VIEW_MARGIN

  const aspect = vbH / vbW
  if (aspect < MIN_ASPECT) {
    // 너무 납작 → 높이 확장
    const newH = vbW * MIN_ASPECT
    vbY -= (newH - vbH) / 2
    vbH = newH
  } else if (aspect > MAX_ASPECT) {
    // 너무 세로로 긴 → 너비 확장
    const newW = vbH / MAX_ASPECT
    vbX -= (newW - vbW) / 2
    vbW = newW
  }

  // slant 변환 중심 (박스 중심 기준)
  const slantCenterX = boxX + boxWidth / 2
  const slantCenterY = boxY + boxHeight / 2

  // 박스 타입에 따른 색상 결정
  const boxColor = currentJamoType === 'choseong' ? BOX_COLORS.CH :
                   currentJamoType === 'jongseong' ? BOX_COLORS.JO :
                   BOX_COLORS.JU

  // SVG 이벤트에서 viewBox 좌표 추출 (마우스 + 터치 통합)
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
  }, [])

  // 절대 SVG 좌표 → PathPoint 상대 좌표 (0~1)
  const absToRelative = useCallback((absX: number, absY: number, sX: number, sY: number, bW: number, bH: number) => {
    return {
      x: bW > 0 ? Math.max(0, Math.min(1, (absX - sX) / bW)) : 0,
      y: bH > 0 ? Math.max(0, Math.min(1, (absY - sY) / bH)) : 0,
    }
  }, [])

  // 스트로크의 컨테이너 박스 절대 좌표 가져오기
  const getContainerBoxAbs = useCallback((stroke: StrokeData) => {
    if (isMixed && boxInfo.juH && boxInfo.juV && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        return {
          x: boxInfo.juH.x * VIEW_BOX_SIZE,
          y: boxInfo.juH.y * VIEW_BOX_SIZE,
          w: boxInfo.juH.width * VIEW_BOX_SIZE,
          h: boxInfo.juH.height * VIEW_BOX_SIZE,
        }
      } else if (verticalStrokeIds.has(stroke.id)) {
        return {
          x: boxInfo.juV.x * VIEW_BOX_SIZE,
          y: boxInfo.juV.y * VIEW_BOX_SIZE,
          w: boxInfo.juV.width * VIEW_BOX_SIZE,
          h: boxInfo.juV.height * VIEW_BOX_SIZE,
        }
      }
    }
    return { x: boxX, y: boxY, w: boxWidth, h: boxHeight }
  }, [isMixed, boxInfo, horizontalStrokeIds, verticalStrokeIds, boxX, boxY, boxWidth, boxHeight])

  // 패스 포인트/핸들 드래그 시작 (마우스 + 터치)
  const startPathDrag = useCallback((type: 'point' | 'handleIn' | 'handleOut', strokeId: string, pointIndex: number, strokeX: number, strokeY: number, boundsWidth: number, boundsHeight: number) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setSelectedPointIndex(pointIndex)
      setDragState({ type, strokeId, pointIndex, strokeX, strokeY, boundsWidth, boundsHeight })
    }
  }, [setSelectedPointIndex])

  // Rect 스트로크 이동 드래그 시작 (마우스 + 터치)
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
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBoxAbs])

  // Rect 스트로크 리사이즈 드래그 시작 (마우스 + 터치)
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
  }, [strokes, getContainerBoxAbs])

  // Path 스트로크 바운딩 박스 이동 드래그 시작 (마우스 + 터치)
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
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBoxAbs])

  // 통합 드래그 이동 핸들러 (마우스 + 터치)
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

      // 마우스 위치 - 그랩 오프셋 = 새 스트로크 절대 좌표
      const newAbsX = svgPt.x - (dragState.grabOffsetX ?? 0)
      const newAbsY = svgPt.y - (dragState.grabOffsetY ?? 0)

      // 절대 좌표 → 0~1 정규화 (컨테이너 박스 기준)
      let newX = cW > 0 ? (newAbsX - cX) / cW : 0
      let newY = cH > 0 ? (newAbsY - cY) / cH : 0

      // 클램핑: rect는 중심좌표, path는 좌상단 좌표
      if (isRectStroke(stroke)) {
        // 중심좌표: width/2 ~ 1-width/2, thickness/2 ~ 1-thickness/2
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

    // Rect 리사이즈 드래그 (angle 기반: 주축 방향으로 리사이즈)
    if (dragState.type === 'rectResize') {
      if (!onStrokeChange || !dragState.originalStroke || dragState.containerBoxAbsW === undefined) return
      if (!isRectStroke(dragState.originalStroke)) return
      const cX = dragState.containerBoxAbsX!
      const cY = dragState.containerBoxAbsY!
      const cW = dragState.containerBoxAbsW
      const cH = dragState.containerBoxAbsH!
      const orig = dragState.originalStroke as RectStrokeData

      // 마우스 이동을 주축 방향에 투영 (dot product)
      const angleRad = (orig.angle ?? 0) * Math.PI / 180
      const cosA = Math.cos(angleRad)
      const sinA = Math.sin(angleRad)

      // 중심에서 마우스까지의 벡터 (0~1 정규화 좌표)
      const mouseRelX = cW > 0 ? (svgPt.x - cX) / cW : 0
      const mouseRelY = cH > 0 ? (svgPt.y - cY) / cH : 0
      const dx = mouseRelX - orig.x
      const dy = mouseRelY - orig.y

      // 주축 방향에 투영
      const projected = dx * cosA + dy * sinA

      // 리사이즈: 중심은 고정, width만 변경
      const halfW = orig.width / 2
      if (dragState.resizeEdge === 'start') {
        // start 핸들: 중심에서 start 방향의 거리 변경
        const newHalfW = Math.max(0.01, halfW - projected)
        const newWidth = newHalfW + halfW
        // 중심도 이동
        const shift = (orig.width - newWidth) / 2
        onStrokeChange(dragState.strokeId, 'x', orig.x + shift * cosA)
        onStrokeChange(dragState.strokeId, 'y', orig.y + shift * sinA)
        onStrokeChange(dragState.strokeId, 'width', newWidth)
      } else {
        // end 핸들: 중심에서 end 방향의 거리 변경
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

  // 드래그 종료 (마우스 + 터치)
  const handlePointerUp = useCallback(() => {
    setDragState(null)
  }, [])

  // 획의 절대 좌표를 계산하는 헬퍼
  // rect: strokeX/strokeY = 중심좌표, boundsHeight = thickness 기반
  // path: strokeX/strokeY = 좌상단, boundsHeight = height 기반
  const getStrokeBounds = (stroke: StrokeData) => {
    const container = getContainerBoxAbs(stroke)
    const strokeX = container.x + stroke.x * container.w
    const strokeY = container.y + stroke.y * container.h
    const boundsWidth = stroke.width * container.w
    const boundsHeight = isRectStroke(stroke)
      ? stroke.thickness * container.h
      : (stroke as PathStrokeData).height * container.h

    return { strokeX, strokeY, boundsWidth, boundsHeight }
  }

  // Rect 스트로크의 리사이즈 핸들 렌더링 (angle 기반: 주축 양 끝)
  const renderRectHandles = (stroke: StrokeData, cx: number, cy: number, boundsWidth: number) => {
    if (!isRectStroke(stroke)) return null
    const angle = stroke.angle ?? 0
    const angleRad = angle * Math.PI / 180
    const halfW = boundsWidth / 2
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    // 주축 양 끝점
    const startX = cx - halfW * cosA
    const startY = cy - halfW * sinA
    const endX = cx + halfW * cosA
    const endY = cy + halfW * sinA

    const cursor = angle === 90 ? 'ns-resize' : angle === 0 ? 'ew-resize' : 'move'

    return (
      <g key={`handles-${stroke.id}`}>
        {/* start 핸들 */}
        <circle
          cx={startX} cy={startY} r={HANDLE_SIZE}
          fill="#7c3aed" stroke="#fff" strokeWidth={0.5}
          style={{ cursor }}
          onMouseDown={startRectResize(stroke, 'start')}
          onTouchStart={startRectResize(stroke, 'start')}
        />
        {/* end 핸들 */}
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

  // path 스트로크의 바운딩 박스 오버레이 (이동 가능)
  const renderPathBoundsOverlay = (stroke: PathStrokeData, strokeX: number, strokeY: number, boundsWidth: number, boundsHeight: number) => {
    return (
      <rect
        key={`pathbounds-${stroke.id}`}
        x={strokeX}
        y={strokeY}
        width={boundsWidth}
        height={boundsHeight}
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

  // path 스트로크의 포인트/핸들 오버레이 렌더링
  const renderPathOverlay = (stroke: PathStrokeData, strokeX: number, strokeY: number, boundsWidth: number, boundsHeight: number) => {
    const { points } = stroke.pathData

    const toAbs = (px: number, py: number): [number, number] => [
      strokeX + px * boundsWidth,
      strokeY + py * boundsHeight,
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
                      onMouseDown={startPathDrag('handleIn', stroke.id, selectedPointIndex, strokeX, strokeY, boundsWidth, boundsHeight)}
                      onTouchStart={startPathDrag('handleIn', stroke.id, selectedPointIndex, strokeX, strokeY, boundsWidth, boundsHeight)} />
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
                      onMouseDown={startPathDrag('handleOut', stroke.id, selectedPointIndex, strokeX, strokeY, boundsWidth, boundsHeight)}
                      onTouchStart={startPathDrag('handleOut', stroke.id, selectedPointIndex, strokeX, strokeY, boundsWidth, boundsHeight)} />
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
              onMouseDown={startPathDrag('point', stroke.id, i, strokeX, strokeY, boundsWidth, boundsHeight)}
              onTouchStart={startPathDrag('point', stroke.id, i, strokeX, strokeY, boundsWidth, boundsHeight)} />
          )
        })}
      </g>
    )
  }

  // 드래그 중 커서 결정
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
    <div className="flex flex-col items-center gap-2 p-4 bg-surface-2 rounded-md w-full">
      <svg
        ref={svgRef}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={dragState ? handlePointerMove : undefined}
        onMouseUp={dragState ? handlePointerUp : undefined}
        onMouseLeave={dragState ? handlePointerUp : undefined}
        onTouchMove={dragState ? handlePointerMove : undefined}
        onTouchEnd={dragState ? handlePointerUp : undefined}
        onTouchCancel={dragState ? handlePointerUp : undefined}
        style={{ touchAction: 'none', ...(dragState ? { cursor: getDragCursor() } : {}) }}
      >
        {/* 전체 영역 배경 */}
        <rect
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          fill="#2a2a2a"
          opacity={0.3}
        />

        {/* 혼합 중성인 경우 JU_H와 JU_V 박스를 각각 표시 */}
        {isMixed && boxInfo.juH && boxInfo.juV ? (
          <>
            {/* JU_H 박스 */}
            <rect
              x={boxInfo.juH.x * VIEW_BOX_SIZE}
              y={boxInfo.juH.y * VIEW_BOX_SIZE}
              width={boxInfo.juH.width * VIEW_BOX_SIZE}
              height={boxInfo.juH.height * VIEW_BOX_SIZE}
              fill={BOX_COLORS.JU_H}
              opacity={0.2}
              stroke={BOX_COLORS.JU_H}
              strokeWidth={2}
              strokeDasharray="4,4"
            />
            {/* JU_V 박스 */}
            <rect
              x={boxInfo.juV.x * VIEW_BOX_SIZE}
              y={boxInfo.juV.y * VIEW_BOX_SIZE}
              width={boxInfo.juV.width * VIEW_BOX_SIZE}
              height={boxInfo.juV.height * VIEW_BOX_SIZE}
              fill={BOX_COLORS.JU_V}
              opacity={0.2}
              stroke={BOX_COLORS.JU_V}
              strokeWidth={2}
              strokeDasharray="4,4"
            />
          </>
        ) : (
          /* 일반 박스 영역 */
          <rect
            x={boxX}
            y={boxY}
            width={boxWidth}
            height={boxHeight}
            fill={boxColor}
            opacity={0.2}
            stroke={boxColor}
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        )}

        {/* 획들 (박스 영역 내 상대 좌표) - slant 적용 (중심 기준) */}
        <g transform={slant !== 0 ? `translate(${slantCenterX}, ${slantCenterY}) skewX(${-slant}) translate(${-slantCenterX}, ${-slantCenterY})` : undefined}>
        {strokes.map((stroke) => {
          const isSelected = stroke.id === selectedStrokeId
          const { strokeX, strokeY, boundsWidth, boundsHeight } = getStrokeBounds(stroke)

          // === PATH 스트로크 (곡선) ===
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
                  stroke={isSelected ? '#ff6b6b' : '#1a1a1a'}
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

          // === RECT 스트로크 (중심좌표 + angle 기반) ===
          // strokeX/strokeY = 중심좌표 (getStrokeBounds에서 계산)
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
                fill={isSelected ? '#ff6b6b' : '#1a1a1a'}
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
      </svg>
      <span className="text-sm text-[#e5e5e5] mt-2 text-center block">{jamoChar}</span>
    </div>
  )
}
