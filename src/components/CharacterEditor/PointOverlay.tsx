import type { StrokeDataV2 } from '../../types'

// === 타입 정의 ===

interface ContainerRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PointOverlayProps {
  stroke: StrokeDataV2
  selectedPointIndex: number | null
  containerAbs: ContainerRect
  pointRadius: number
  /** 줌 보정 스케일 (1/canvasZoom) — 화면상 일정한 크기 유지 */
  zoomScale?: number
  onHandleInDown: (e: React.MouseEvent | React.TouchEvent) => void
  onHandleOutDown: (e: React.MouseEvent | React.TouchEvent) => void
  onAnchorDown: (i: number) => (e: React.MouseEvent | React.TouchEvent) => void
  onAnchorTouchStart: (i: number) => (e: React.MouseEvent | React.TouchEvent) => void
  onAnchorTouchEnd: () => void
}

// === 컴포넌트 ===

/**
 * PointOverlay: 선택된 획의 앵커 포인트 + 베지어 핸들 렌더링
 *
 * StrokeOverlay의 <g> 내에 렌더링되는 SVG 프래그먼트
 * 장치별 인터랙션 (롱프레스 등)은 콜백으로 위임
 */
export function PointOverlay({
  stroke,
  selectedPointIndex,
  containerAbs,
  pointRadius,
  zoomScale = 1,
  onHandleInDown,
  onHandleOutDown,
  onAnchorDown,
  onAnchorTouchStart,
  onAnchorTouchEnd,
}: PointOverlayProps) {
  const toAbs = (px: number, py: number): [number, number] => [
    containerAbs.x + px * containerAbs.width,
    containerAbs.y + py * containerAbs.height,
  ]

  return (
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
                    stroke="#ff6b6b" strokeWidth={0.5 * zoomScale} opacity={0.6} aria-hidden="true" />
                  {/* 넓은 히트 영역 (투명) */}
                  <circle cx={hx} cy={hy} r={pointRadius}
                    fill="transparent"
                    role="button" aria-label="인 핸들"
                    style={{ cursor: 'grab' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={onHandleInDown}
                    onTouchStart={onHandleInDown}
                  />
                  {/* 가시적 핸들 */}
                  <circle cx={hx} cy={hy} r={pointRadius}
                    fill="#ff6b6b" stroke="#fff" strokeWidth={0.3 * zoomScale}
                    aria-hidden="true" style={{ pointerEvents: 'none' }}
                  />
                </>
              )
            })()}
            {point.handleOut && (() => {
              const [hx, hy] = toAbs(point.handleOut.x, point.handleOut.y)
              return (
                <>
                  <line x1={ptX} y1={ptY} x2={hx} y2={hy}
                    stroke="#4ecdc4" strokeWidth={0.5 * zoomScale} opacity={0.6} aria-hidden="true" />
                  {/* 넓은 히트 영역 (투명) */}
                  <circle cx={hx} cy={hy} r={pointRadius}
                    fill="transparent"
                    role="button" aria-label="아웃 핸들"
                    style={{ cursor: 'grab' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={onHandleOutDown}
                    onTouchStart={onHandleOutDown}
                  />
                  {/* 가시적 핸들 */}
                  <circle cx={hx} cy={hy} r={pointRadius}
                    fill="#4ecdc4" stroke="#fff" strokeWidth={0.3 * zoomScale}
                    aria-hidden="true" style={{ pointerEvents: 'none' }}
                  />
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
        const isCurve = !!(pt.handleIn || pt.handleOut)

        return (
          <circle key={i} cx={ptX} cy={ptY} r={pointRadius}
            fill={isActive ? '#ff6b6b' : isCurve ? '#c084fc' : '#4ecdc4'}
            stroke="#fff" strokeWidth={0.5 * zoomScale}
            role="button" aria-label={`기준점 ${i + 1}`}
            style={{ cursor: 'grab' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={onAnchorDown(i)}
            onTouchStart={onAnchorTouchStart(i)}
            onTouchEnd={onAnchorTouchEnd}
            onTouchCancel={onAnchorTouchEnd}
          />
        )
      })}
    </g>
  )
}
