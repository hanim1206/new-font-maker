import { useState, useCallback, useEffect } from 'react'
import type { Padding, BoxConfig } from '../../types'

// === 타입 정의 ===

type PaddingSide = keyof Padding

interface PaddingOverlayProps {
  svgRef: React.RefObject<SVGSVGElement | null>
  viewBoxSize: number
  padding: Padding
  containerBox: BoxConfig
  onPaddingChange: (side: PaddingSide, value: number) => void
  color?: string
  /** 음수 색상 (바깥 확장 시, 기본 '#38bdf8') */
  negativeColor?: string
  minPadding?: number
  maxPadding?: number
  snapStep?: number
  disabled?: boolean
  /** 기본값에 스냅됐을 때 표시할 색상 (기본 '#ffffff') */
  originColor?: string
}

interface DragState {
  side: PaddingSide
}

const SIDES: PaddingSide[] = ['top', 'bottom', 'left', 'right']

const OPPOSITE: Record<PaddingSide, PaddingSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

// === 컴포넌트 ===

export function PaddingOverlay({
  svgRef,
  viewBoxSize,
  padding,
  containerBox,
  onPaddingChange,
  color = '#ff9500',
  negativeColor = '#38bdf8',
  minPadding = 0,
  maxPadding = 0.3,
  snapStep = 0.025,
  disabled = false,
  originColor = '#ffffff',
}: PaddingOverlayProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredSide, setHoveredSide] = useState<PaddingSide | null>(null)

  const V = viewBoxSize
  const bx = containerBox.x * V
  const by = containerBox.y * V
  const bw = containerBox.width * V
  const bh = containerBox.height * V

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

  // SVG 좌표 → 패딩값 변환 + 스냅 + 클램프
  const svgToPaddingValue = useCallback(
    (svgPt: { x: number; y: number }, side: PaddingSide): number => {
      let raw: number
      switch (side) {
        case 'top':
          raw = bh > 0 ? (svgPt.y - by) / bh : 0
          break
        case 'bottom':
          raw = bh > 0 ? (by + bh - svgPt.y) / bh : 0
          break
        case 'left':
          raw = bw > 0 ? (svgPt.x - bx) / bw : 0
          break
        case 'right':
          raw = bw > 0 ? (bx + bw - svgPt.x) / bw : 0
          break
      }

      // 원점(0) 강한 흡착: 1스텝 이내면 0으로 스냅
      if (Math.abs(raw) < snapStep * 0.8) {
        raw = 0
      } else {
        // 그리드 스냅
        raw = Math.round(raw / snapStep) * snapStep
      }

      // 대변 충돌 방지 (최소 10% 컨텐츠)
      const oppositeValue = padding[OPPOSITE[side]]
      const maxAllowed = Math.min(maxPadding, 0.9 - Math.max(0, oppositeValue))

      return Math.max(minPadding, Math.min(maxAllowed, raw))
    },
    [bx, by, bw, bh, snapStep, minPadding, maxPadding, padding]
  )

  // 내부 경계선 위치 계산 (SVG 좌표)
  const getEdgePosition = (side: PaddingSide) => {
    const p = padding
    switch (side) {
      case 'top':
        return { x1: bx, y1: by + p.top * bh, x2: bx + bw, y2: by + p.top * bh }
      case 'bottom':
        return { x1: bx, y1: by + bh - p.bottom * bh, x2: bx + bw, y2: by + bh - p.bottom * bh }
      case 'left':
        return { x1: bx + p.left * bw, y1: by, x2: bx + p.left * bw, y2: by + bh }
      case 'right':
        return { x1: bx + bw - p.right * bw, y1: by, x2: bx + bw - p.right * bw, y2: by + bh }
    }
  }

  // 드래그 시작
  const handlePointerDown = (side: PaddingSide) => (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    e.stopPropagation()
    e.preventDefault()
    setDragState({ side })
  }

  // window 레벨 드래그 이벤트 (범위 밖에서도 드래그 유지)
  useEffect(() => {
    if (!dragState) return

    const handleWindowMove = (e: MouseEvent | TouchEvent) => {
      const svgPt = svgPointFromEvent(e)
      const newValue = svgToPaddingValue(svgPt, dragState.side)
      onPaddingChange(dragState.side, newValue)
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
  }, [dragState, svgPointFromEvent, svgToPaddingValue, onPaddingChange])

  // 패딩 영역 채우기 렌더링
  const renderPaddingFills = () => {
    const p = padding
    const pTop = p.top * bh
    const pBottom = p.bottom * bh
    const pLeft = p.left * bw
    const pRight = p.right * bw
    const hasAny = pTop !== 0 || pBottom !== 0 || pLeft !== 0 || pRight !== 0
    if (!hasAny) return null

    return (
      <g pointerEvents="none">
        {/* 양수 패딩 (안쪽 축소) */}
        <g opacity={0.15}>
          {pTop > 0 && <rect x={bx} y={by} width={bw} height={pTop} fill={color} />}
          {pBottom > 0 && (
            <rect x={bx} y={by + bh - pBottom} width={bw} height={pBottom} fill={color} />
          )}
          {pLeft > 0 && (
            <rect
              x={bx}
              y={by + Math.max(0, pTop)}
              width={pLeft}
              height={bh - Math.max(0, pTop) - Math.max(0, pBottom)}
              fill={color}
            />
          )}
          {pRight > 0 && (
            <rect
              x={bx + bw - pRight}
              y={by + Math.max(0, pTop)}
              width={pRight}
              height={bh - Math.max(0, pTop) - Math.max(0, pBottom)}
              fill={color}
            />
          )}
        </g>
        {/* 음수 패딩 (바깥 확장) */}
        <g opacity={0.12}>
          {pTop < 0 && <rect x={bx} y={by + pTop} width={bw} height={-pTop} fill={negativeColor} />}
          {pBottom < 0 && (
            <rect x={bx} y={by + bh} width={bw} height={-pBottom} fill={negativeColor} />
          )}
          {pLeft < 0 && (
            <rect x={bx + pLeft} y={by} width={-pLeft} height={bh} fill={negativeColor} />
          )}
          {pRight < 0 && (
            <rect x={bx + bw} y={by} width={-pRight} height={bh} fill={negativeColor} />
          )}
        </g>
      </g>
    )
  }

  // 핸들 위치 계산 (컨테이너 박스 바깥)
  const HANDLE_OFFSET = 6 // 박스 가장자리에서 바깥으로의 거리
  const getHandlePosition = (side: PaddingSide) => {
    const edge = getEdgePosition(side)
    switch (side) {
      case 'top':
        // 경계선 y좌표, 박스 왼쪽 바깥
        return { cx: bx - HANDLE_OFFSET, cy: edge.y1 }
      case 'bottom':
        // 경계선 y좌표, 박스 왼쪽 바깥
        return { cx: bx - HANDLE_OFFSET, cy: edge.y1 }
      case 'left':
        // 경계선 x좌표, 박스 위쪽 바깥
        return { cx: edge.x1, cy: by - HANDLE_OFFSET }
      case 'right':
        // 경계선 x좌표, 박스 위쪽 바깥
        return { cx: edge.x1, cy: by - HANDLE_OFFSET }
    }
  }

  // 경계선 + 원형 핸들 렌더링
  const renderEdgeHandle = (side: PaddingSide) => {
    const edge = getEdgePosition(side)
    const isHorizontal = side === 'top' || side === 'bottom'
    const cursor = isHorizontal ? 'ns-resize' : 'ew-resize'
    const isActive = dragState?.side === side
    const isHovered = hoveredSide === side
    const isAtOrigin = padding[side] === 0 // 기본값(0)에 스냅된 상태
    const isNegative = padding[side] < 0 // 음수(바깥 확장) 상태

    // 핸들 위치 (박스 바깥)
    const { cx, cy } = getHandlePosition(side)
    const handleR = isActive ? 3.5 : isHovered ? 3 : 2.5
    const hitR = 5 // 투명 히트 영역 반지름

    // 상태별 색상: 원점 → 흰색, 음수 → 시안, 양수 → 기본색
    const sideColor = isNegative ? negativeColor : color
    const activeColor = isActive && isAtOrigin ? originColor : sideColor

    return (
      <g key={side}>
        {/* 가시적 경계선 */}
        <line
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          stroke={isAtOrigin && isActive ? originColor : sideColor}
          strokeWidth={isActive ? 1.5 : isHovered ? 1.2 : 0.8}
          opacity={isActive ? 1 : isHovered ? 0.9 : 0.5}
          strokeDasharray={isActive ? 'none' : '3,2'}
          pointerEvents="none"
        />
        {/* 가시적 원형 핸들 */}
        <circle
          cx={cx}
          cy={cy}
          r={handleR}
          fill={isActive ? activeColor : isHovered ? sideColor : 'rgba(0,0,0,0.6)'}
          stroke={activeColor}
          strokeWidth={isActive ? 1.5 : 1}
          opacity={isActive ? 1 : isHovered ? 0.95 : 0.7}
          pointerEvents="none"
          style={{ transition: 'r 0.1s, opacity 0.1s' }}
        />
        {/* 핸들 내부 방향 표시 (가로/세로 화살표 힌트) */}
        {(isHovered || isActive) && (
          <g pointerEvents="none" opacity={0.9}>
            {isHorizontal ? (
              <>
                <line x1={cx} y1={cy - 1.2} x2={cx} y2={cy + 1.2}
                  stroke="#fff" strokeWidth={0.8} strokeLinecap="round" />
                <line x1={cx - 0.6} y1={cy - 0.6} x2={cx} y2={cy - 1.2}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
                <line x1={cx + 0.6} y1={cy - 0.6} x2={cx} y2={cy - 1.2}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
                <line x1={cx - 0.6} y1={cy + 0.6} x2={cx} y2={cy + 1.2}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
                <line x1={cx + 0.6} y1={cy + 0.6} x2={cx} y2={cy + 1.2}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1={cx - 1.2} y1={cy} x2={cx + 1.2} y2={cy}
                  stroke="#fff" strokeWidth={0.8} strokeLinecap="round" />
                <line x1={cx - 0.6} y1={cy - 0.6} x2={cx - 1.2} y2={cy}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
                <line x1={cx - 0.6} y1={cy + 0.6} x2={cx - 1.2} y2={cy}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
                <line x1={cx + 0.6} y1={cy - 0.6} x2={cx + 1.2} y2={cy}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
                <line x1={cx + 0.6} y1={cy + 0.6} x2={cx + 1.2} y2={cy}
                  stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
              </>
            )}
          </g>
        )}
        {/* 투명 히트 영역 (원형) */}
        {!dragState && (
          <circle
            cx={cx}
            cy={cy}
            r={hitR}
            fill="transparent"
            style={{ cursor: disabled ? 'default' : cursor }}
            onMouseEnter={() => !disabled && setHoveredSide(side)}
            onMouseLeave={() => setHoveredSide(null)}
            onMouseDown={handlePointerDown(side)}
            onTouchStart={handlePointerDown(side)}
          />
        )}
      </g>
    )
  }

  // 드래그 중 값 툴팁 (핸들 옆에 표시)
  const renderDragTooltip = () => {
    if (!dragState) return null
    const { cx, cy } = getHandlePosition(dragState.side)
    const value = padding[dragState.side]
    const isHorizontal = dragState.side === 'top' || dragState.side === 'bottom'
    const isAtOrigin = value === 0
    const isNeg = value < 0
    // 핸들 옆에 툴팁 배치
    const offsetX = isHorizontal ? -8 : 0
    const offsetY = isHorizontal ? 0 : -5

    return (
      <text
        x={cx + offsetX}
        y={cy + offsetY}
        fontSize={4}
        fill={isAtOrigin ? originColor : isNeg ? negativeColor : color}
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
        fontFamily="monospace"
        fontWeight="bold"
      >
        {(value * 100).toFixed(1)}%
      </text>
    )
  }

  return (
    <g style={dragState ? {
      cursor: dragState.side === 'top' || dragState.side === 'bottom' ? 'ns-resize' : 'ew-resize',
    } : undefined}>
      {/* 패딩 영역 채우기 */}
      {renderPaddingFills()}

      {/* 패딩 내부 경계 (대시 테두리) */}
      {(() => {
        const p = padding
        const hasPadding = p.top !== 0 || p.bottom !== 0 || p.left !== 0 || p.right !== 0
        if (!hasPadding) return null
        const px = bx + p.left * bw
        const py = by + p.top * bh
        const pw = bw * (1 - p.left - p.right)
        const ph = bh * (1 - p.top - p.bottom)
        return (
          <rect
            x={px}
            y={py}
            width={pw}
            height={ph}
            fill="none"
            stroke={color}
            strokeWidth={0.8}
            strokeDasharray="2,2"
            opacity={0.5}
            pointerEvents="none"
          />
        )
      })()}

      {/* 4개 내부 경계선 + 히트 영역 */}
      {SIDES.map((side) => renderEdgeHandle(side))}

      {/* 드래그 중 값 툴팁 */}
      {renderDragTooltip()}
    </g>
  )
}
