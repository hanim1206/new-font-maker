import { useState, useCallback, useEffect, useRef } from 'react'
import type { Split } from '../../types'

// === 타입 정의 ===

interface SplitOverlayProps {
  svgRef: React.RefObject<SVGSVGElement | null>
  viewBoxSize: number
  splits: Split[]
  onSplitChange: (index: number, value: number) => void
  minValue?: number
  maxValue?: number
  snapStep?: number
  disabled?: boolean
  /** 기본값 배열 (각 split의 원래 값, 스냅 피드백용) */
  originValues?: number[]
  /** 기본값에 스냅됐을 때 표시할 색상 (기본 '#ffffff') */
  originColor?: string
  /** 드래그 시작/종료 콜백 */
  onDragStart?: () => void
  onDragEnd?: () => void
}

interface DragState {
  index: number
  axis: 'x' | 'y'
}

// 축별 색상
const AXIS_COLOR: Record<'x' | 'y', string> = {
  x: '#2dd4bf', // 민트 (세로선)
  y: '#2dd4bf', // 민트 (가로선)
}

// === 컴포넌트 ===

export function SplitOverlay({
  svgRef,
  viewBoxSize,
  splits,
  onSplitChange,
  minValue = 0.1,
  maxValue = 0.9,
  snapStep = 0.025,
  disabled = false,
  originValues,
  originColor = '#ffffff',
  onDragStart,
  onDragEnd,
}: SplitOverlayProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // 외부에 드래그 상태 전파
  const prevDragRef = useRef(false)
  useEffect(() => {
    const isDragging = dragState !== null
    if (isDragging !== prevDragRef.current) {
      prevDragRef.current = isDragging
      if (isDragging) onDragStart?.()
      else onDragEnd?.()
    }
  }, [dragState, onDragStart, onDragEnd])

  const V = viewBoxSize

  // SVG 이벤트에서 viewBox 좌표 추출
  const svgPointFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
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
        pt.x = (e as MouseEvent).clientX
        pt.y = (e as MouseEvent).clientY
      }
      const svgPt = pt.matrixTransform(inv)
      return { x: svgPt.x, y: svgPt.y }
    },
    [svgRef]
  )

  // SVG 좌표 → split 값 변환 + 스냅 + 클램프
  const svgToSplitValue = useCallback(
    (svgPt: { x: number; y: number }, axis: 'x' | 'y', index: number): number => {
      let raw = axis === 'x'
        ? svgPt.x / V
        : svgPt.y / V

      // 원점(기본값) 강한 흡착: 1스텝 이내면 기본값으로 스냅
      const origin = originValues?.[index]
      if (origin !== undefined && Math.abs(raw - origin) < snapStep * 0.8) {
        raw = origin
      } else {
        // 그리드 스냅
        raw = Math.round(raw / snapStep) * snapStep
      }

      return Math.max(minValue, Math.min(maxValue, raw))
    },
    [V, snapStep, minValue, maxValue, originValues]
  )

  // 드래그 시작
  const handlePointerDown = (index: number, axis: 'x' | 'y') => (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    e.stopPropagation()
    e.preventDefault()
    setDragState({ index, axis })
  }

  // window 레벨 드래그 이벤트
  useEffect(() => {
    if (!dragState) return

    const handleWindowMove = (e: MouseEvent | TouchEvent) => {
      const svgPt = svgPointFromEvent(e)
      const newValue = svgToSplitValue(svgPt, dragState.axis, dragState.index)
      onSplitChange(dragState.index, newValue)
    }

    const handleWindowUp = () => {
      setDragState(null)
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
  }, [dragState, svgPointFromEvent, svgToSplitValue, onSplitChange])

  // 기준선 + 마름모 핸들 렌더링
  const HANDLE_OFFSET = 6 // 기준선 끝단 바깥으로의 거리
  const HANDLE_SIZE = 4   // 마름모 한 변의 절반

  const renderSplitHandle = (split: Split, index: number) => {
    const color = AXIS_COLOR[split.axis]
    const isActive = dragState?.index === index
    const isHovered = hoveredIndex === index
    const pos = split.value * V
    const isAtOrigin = originValues !== undefined && originValues[index] !== undefined
      && Math.abs(split.value - originValues[index]) < 0.001
    const activeColor = isActive && isAtOrigin ? originColor : color

    // 기준선 좌표
    const lineProps = split.axis === 'x'
      ? { x1: pos, y1: 0, x2: pos, y2: V }   // 세로선
      : { x1: 0, y1: pos, x2: V, y2: pos }   // 가로선

    // 마름모 핸들 위치 (기준선 우측/하단 바깥)
    const handleX = split.axis === 'x' ? pos : V + HANDLE_OFFSET
    const handleY = split.axis === 'x' ? V + HANDLE_OFFSET : pos

    const cursor = split.axis === 'x' ? 'ew-resize' : 'ns-resize'
    const handleS = isActive ? HANDLE_SIZE + 1 : isHovered ? HANDLE_SIZE + 0.5 : HANDLE_SIZE
    const hitR = 6 // 히트 영역

    return (
      <g key={index}>
        {/* 가시적 기준선 (실선) */}
        <line
          {...lineProps}
          stroke={isAtOrigin && isActive ? originColor : color}
          strokeWidth={isActive ? 1.5 : isHovered ? 1.2 : 0.8}
          opacity={isActive ? 1 : isHovered ? 0.9 : 0.6}
          pointerEvents="none"
        />

        {/* 마름모 핸들 (45도 회전 사각형) */}
        <rect
          x={handleX - handleS / 2}
          y={handleY - handleS / 2}
          width={handleS}
          height={handleS}
          rx={0.5}
          transform={`rotate(45, ${handleX}, ${handleY})`}
          fill={isActive ? activeColor : isHovered ? color : 'rgba(0,0,0,0.6)'}
          stroke={activeColor}
          strokeWidth={isActive ? 1.2 : 0.8}
          opacity={isActive ? 1 : isHovered ? 0.95 : 0.7}
          pointerEvents="none"
          style={{ transition: 'opacity 0.1s' }}
        />

        {/* 값 툴팁 (호버/드래그 시) */}
        {(isHovered || isActive) && (
          <text
            x={split.axis === 'x' ? handleX : handleX + 6}
            y={split.axis === 'x' ? handleY + 5 : handleY}
            fontSize={3.5}
            fill={isActive && isAtOrigin ? originColor : color}
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {(split.value * 100).toFixed(1)}%
          </text>
        )}

        {/* 투명 히트 영역 (원형) */}
        {!dragState && (
          <circle
            cx={handleX}
            cy={handleY}
            r={hitR}
            fill="transparent"
            style={{ cursor: disabled ? 'default' : cursor }}
            onMouseEnter={() => !disabled && setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onMouseDown={handlePointerDown(index, split.axis)}
            onTouchStart={handlePointerDown(index, split.axis)}
          />
        )}
      </g>
    )
  }

  return (
    <g style={dragState ? {
      cursor: dragState.axis === 'x' ? 'ew-resize' : 'ns-resize',
    } : undefined}>
      {splits.map((split, index) => renderSplitHandle(split, index))}
    </g>
  )
}
