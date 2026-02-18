import { useState, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore, weightToMultiplier } from '../../stores/globalStyleStore'
import type { StrokeDataV2, BoxConfig, Padding } from '../../types'
import { pointsToSvgD } from '../../utils/pathUtils'

type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

type StrokeChangeHandler = (strokeId: string, prop: string, value: number) => void

interface CharacterPreviewProps {
  jamoChar: string
  strokes: StrokeDataV2[]
  boxInfo?: BoxConfig & { juH?: BoxConfig; juV?: BoxConfig }
  jamoType?: 'choseong' | 'jungseong' | 'jongseong'
  onPointChange?: PointChangeHandler
  onStrokeChange?: StrokeChangeHandler
  jamoPadding?: Padding
  onPaddingChange?: (side: keyof Padding, value: number) => void
}

const VIEW_BOX_SIZE = 100

// viewBox 마진 (박스 영역 주변 여백, PaddingOverlay 핸들 HANDLE_OFFSET=6 + hitR=5 고려)
const VIEW_MARGIN = 12

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

// 자모 패딩 적용: 박스를 패딩만큼 축소
function applyJamoPaddingToBox(box: { x: number; y: number; width: number; height: number }, padding?: Padding) {
  if (!padding) return box
  return {
    x: box.x + padding.left * box.width,
    y: box.y + padding.top * box.height,
    width: box.width * (1 - padding.left - padding.right),
    height: box.height * (1 - padding.top - padding.bottom),
  }
}

export function CharacterPreview({ jamoChar, strokes, boxInfo = { x: 0, y: 0, width: 1, height: 1 }, jamoType, onPointChange, onStrokeChange, jamoPadding, onPaddingChange }: CharacterPreviewProps) {
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
  const weightMultiplier = weightToMultiplier(globalStyle.weight ?? 400)
  const slant = globalStyle.slant ?? 0

  // 박스 영역을 viewBox 좌표로 변환
  const boxX = boxInfo.x * VIEW_BOX_SIZE
  const boxY = boxInfo.y * VIEW_BOX_SIZE
  const boxWidth = boxInfo.width * VIEW_BOX_SIZE
  const boxHeight = boxInfo.height * VIEW_BOX_SIZE

  // viewBox를 박스 영역에 맞춰 줌 (마진 포함)
  const MIN_ASPECT = 0.75
  const MAX_ASPECT = 1.25
  let vbX = boxX - VIEW_MARGIN
  let vbY = boxY - VIEW_MARGIN
  let vbW = boxWidth + 2 * VIEW_MARGIN
  let vbH = boxHeight + 2 * VIEW_MARGIN

  const aspect = vbH / vbW
  if (aspect < MIN_ASPECT) {
    const newH = vbW * MIN_ASPECT
    vbY -= (newH - vbH) / 2
    vbH = newH
  } else if (aspect > MAX_ASPECT) {
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

  // 스트로크의 컨테이너 박스 정보 가져오기 (자모 패딩 적용됨, BoxConfig 형식)
  const getContainerBox = useCallback((stroke: StrokeDataV2): BoxConfig => {
    if (isMixed && boxInfo.juH && boxInfo.juV && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(boxInfo.juH, jamoPadding)
      } else if (verticalStrokeIds.has(stroke.id)) {
        return applyJamoPaddingToBox(boxInfo.juV, jamoPadding)
      }
    }
    return applyJamoPaddingToBox(boxInfo, jamoPadding)
  }, [isMixed, boxInfo, horizontalStrokeIds, verticalStrokeIds, jamoPadding])

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
        containerX: container.x * VIEW_BOX_SIZE,
        containerY: container.y * VIEW_BOX_SIZE,
        containerW: container.width * VIEW_BOX_SIZE,
        containerH: container.height * VIEW_BOX_SIZE,
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
      const container = getContainerBox(stroke)
      const cX = container.x * VIEW_BOX_SIZE
      const cY = container.y * VIEW_BOX_SIZE
      const cW = container.width * VIEW_BOX_SIZE
      const cH = container.height * VIEW_BOX_SIZE
      // 마우스의 박스 내 상대 좌표
      const grabRelX = cW > 0 ? (svgPt.x - cX) / cW : 0
      const grabRelY = cH > 0 ? (svgPt.y - cY) / cH : 0
      setDragState({
        type: 'strokeMove',
        strokeId: stroke.id,
        pointIndex: 0,
        originalPoints: stroke.points.map(p => ({ x: p.x, y: p.y })),
        grabRelX,
        grabRelY,
        containerX: cX,
        containerY: cY,
        containerW: cW,
        containerH: cH,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, setSelectedStrokeId, svgPointFromEvent, getContainerBox])

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
        // 핸들은 0~1 범위를 벗어날 수 있음
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

  return (
    <div className="flex flex-col items-center gap-2 p-4 bg-surface-2 rounded-md w-full">
      {/* 획 SVG + 패딩 오버레이 SVG를 겹쳐 배치 */}
      <div className="relative w-full" style={{ aspectRatio: `${vbW} / ${vbH}` }}>
        {/* 메인 SVG: 획 렌더링 + 드래그 */}
        <svg
          ref={svgRef}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          onMouseMove={dragState ? handlePointerMove : undefined}
          onMouseUp={dragState ? handlePointerUp : undefined}
          onMouseLeave={dragState ? handlePointerUp : undefined}
          onTouchMove={dragState ? handlePointerMove : undefined}
          onTouchEnd={dragState ? handlePointerUp : undefined}
          onTouchCancel={dragState ? handlePointerUp : undefined}
          style={{ touchAction: 'none', ...(dragState ? { cursor: dragState.type === 'strokeMove' ? 'move' : 'grabbing' } : {}) }}
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

          {/* 획들 - slant 적용 */}
          <g transform={slant !== 0 ? `translate(${slantCenterX}, ${slantCenterY}) skewX(${-slant}) translate(${-slantCenterX}, ${-slantCenterY})` : undefined}>
          {strokes.map((stroke) => {
            const isSelected = stroke.id === selectedStrokeId
            const container = getContainerBox(stroke)
            const d = pointsToSvgD(stroke.points, stroke.closed, container, VIEW_BOX_SIZE)
            if (!d) return null
            const strokeWidth = stroke.thickness * weightMultiplier * VIEW_BOX_SIZE

            // 컨테이너의 절대 좌표 (포인트 오버레이용)
            const cAbsX = container.x * VIEW_BOX_SIZE
            const cAbsY = container.y * VIEW_BOX_SIZE
            const cAbsW = container.width * VIEW_BOX_SIZE
            const cAbsH = container.height * VIEW_BOX_SIZE

            // 포인트를 절대 좌표로 변환
            const toAbs = (px: number, py: number): [number, number] => [
              cAbsX + px * cAbsW,
              cAbsY + py * cAbsH,
            ]

            return (
              <g key={stroke.id}>
                {/* 넓은 히트 영역 (투명) - 이동용 */}
                <path
                  d={d}
                  fill={stroke.closed ? 'transparent' : 'none'}
                  stroke="transparent"
                  strokeWidth={strokeWidth * 4}
                  onClick={() => setSelectedStrokeId(stroke.id)}
                  onMouseDown={onStrokeChange ? startStrokeMove(stroke) : undefined}
                  onTouchStart={onStrokeChange ? startStrokeMove(stroke) : undefined}
                  style={{ cursor: onStrokeChange ? 'move' : 'pointer' }}
                />
                {/* 실제 렌더링 */}
                <path
                  d={d}
                  fill={stroke.closed ? (isSelected ? '#ff6b6b' : '#1a1a1a') : 'none'}
                  stroke={isSelected ? '#ff6b6b' : '#1a1a1a'}
                  strokeWidth={stroke.closed ? 0 : strokeWidth}
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
                                  onMouseDown={startPointDrag('handleIn', stroke.id, selectedPointIndex, container)}
                                  onTouchStart={startPointDrag('handleIn', stroke.id, selectedPointIndex, container)} />
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
                                  onMouseDown={startPointDrag('handleOut', stroke.id, selectedPointIndex, container)}
                                  onTouchStart={startPointDrag('handleOut', stroke.id, selectedPointIndex, container)} />
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
                          onMouseDown={startPointDrag('point', stroke.id, i, container)}
                          onTouchStart={startPointDrag('point', stroke.id, i, container)} />
                      )
                    })}
                  </g>
                )}
              </g>
            )
          })}
          </g>
        </svg>

        {/* 패딩 조절: 4면 HTML 버튼 오버레이 (SVG 이벤트 충돌 없음) */}
        {onPaddingChange && (() => {
          const effectivePadding = jamoPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }
          const EDGE_THICKNESS = 14 // px
          const sides: Array<{ side: keyof typeof effectivePadding; style: React.CSSProperties; cursor: string }> = [
            { side: 'top', cursor: 'ns-resize', style: { top: 0, left: EDGE_THICKNESS, right: EDGE_THICKNESS, height: EDGE_THICKNESS } },
            { side: 'bottom', cursor: 'ns-resize', style: { bottom: 0, left: EDGE_THICKNESS, right: EDGE_THICKNESS, height: EDGE_THICKNESS } },
            { side: 'left', cursor: 'ew-resize', style: { top: 0, left: 0, bottom: 0, width: EDGE_THICKNESS } },
            { side: 'right', cursor: 'ew-resize', style: { top: 0, right: 0, bottom: 0, width: EDGE_THICKNESS } },
          ]
          return sides.map(({ side, cursor, style }) => (
            <div
              key={side}
              className="absolute"
              style={{
                ...style,
                cursor,
                zIndex: 10,
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const startY = e.clientY
                const startX = e.clientX
                const startVal = effectivePadding[side]
                const rect = e.currentTarget.parentElement!.getBoundingClientRect()
                const isH = side === 'top' || side === 'bottom'
                const size = isH ? rect.height : rect.width

                const handleMove = (me: MouseEvent) => {
                  const delta = isH
                    ? (side === 'top' ? me.clientY - startY : startY - me.clientY)
                    : (side === 'left' ? me.clientX - startX : startX - me.clientX)
                  const raw = startVal + delta / size
                  // 스냅 + 클램프
                  const step = 0.025
                  let snapped = Math.round(raw / step) * step
                  if (Math.abs(snapped) < step * 0.8) snapped = 0
                  snapped = Math.max(0, Math.min(0.3, snapped))
                  onPaddingChange(side, snapped)
                }
                const handleUp = () => {
                  window.removeEventListener('mousemove', handleMove)
                  window.removeEventListener('mouseup', handleUp)
                }
                window.addEventListener('mousemove', handleMove)
                window.addEventListener('mouseup', handleUp)
              }}
            />
          ))
        })()}
      </div>
      <span className="text-sm text-[#e5e5e5] mt-2 text-center block">{jamoChar}</span>
    </div>
  )
}
