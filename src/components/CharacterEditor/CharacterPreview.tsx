import { useState, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import type { StrokeData, BoxConfig, PathStrokeData } from '../../types'
import { isPathStroke } from '../../types'
import { pathDataToSvgD } from '../../utils/pathUtils'
import styles from './CharacterEditor.module.css'

type PathPointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface CharacterPreviewProps {
  jamoChar: string
  strokes: StrokeData[]
  boxInfo?: BoxConfig & { juH?: BoxConfig; juV?: BoxConfig }
  jamoType?: 'choseong' | 'jungseong' | 'jongseong'
  onPathPointChange?: PathPointChangeHandler
}

const VIEW_BOX_SIZE = 100
const BASE_SIZE = 400

// 획 두께 (VIEW_BOX_SIZE 기준, 고정값)
const STROKE_THICKNESS = 2

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
  type: 'point' | 'handleIn' | 'handleOut'
  strokeId: string
  pointIndex: number
  strokeX: number
  strokeY: number
  boundsWidth: number
  boundsHeight: number
}

export function CharacterPreview({ jamoChar, strokes, boxInfo = { x: 0, y: 0, width: 1, height: 1 }, jamoType, onPathPointChange }: CharacterPreviewProps) {
  const { selectedStrokeId, setSelectedStrokeId, editingJamoType, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const { jungseong } = useJamoStore()
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

  // 박스 비율에 맞춰 SVG 크기 계산
  const aspectRatio = boxInfo.width / boxInfo.height
  const svgWidth = aspectRatio >= 1 ? BASE_SIZE : BASE_SIZE * aspectRatio
  const svgHeight = aspectRatio >= 1 ? BASE_SIZE / aspectRatio : BASE_SIZE

  // viewBox도 비율에 맞게 조정 (전체 영역을 보여주되, 박스 영역을 강조)
  const viewBoxWidth = VIEW_BOX_SIZE
  const viewBoxHeight = VIEW_BOX_SIZE / aspectRatio

  // 박스 영역을 viewBox 좌표로 변환
  const boxX = boxInfo.x * VIEW_BOX_SIZE
  const boxY = boxInfo.y * VIEW_BOX_SIZE
  const boxWidth = boxInfo.width * VIEW_BOX_SIZE
  const boxHeight = boxInfo.height * VIEW_BOX_SIZE

  // 박스 타입에 따른 색상 결정
  const boxColor = currentJamoType === 'choseong' ? BOX_COLORS.CH :
                   currentJamoType === 'jongseong' ? BOX_COLORS.JO :
                   BOX_COLORS.JU

  // SVG 이벤트에서 viewBox 좌표 추출
  const svgPointFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inv = ctm.inverse()
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
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

  // 드래그 시작
  const startDrag = useCallback((type: DragState['type'], strokeId: string, pointIndex: number, strokeX: number, strokeY: number, boundsWidth: number, boundsHeight: number) => {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setSelectedPointIndex(pointIndex)
      setDragState({ type, strokeId, pointIndex, strokeX, strokeY, boundsWidth, boundsHeight })
    }
  }, [setSelectedPointIndex])

  // 드래그 이동
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState || !onPathPointChange) return

    const svgPt = svgPointFromEvent(e)
    const rel = absToRelative(svgPt.x, svgPt.y, dragState.strokeX, dragState.strokeY, dragState.boundsWidth, dragState.boundsHeight)

    if (dragState.type === 'point') {
      onPathPointChange(dragState.strokeId, dragState.pointIndex, 'x', rel.x)
      onPathPointChange(dragState.strokeId, dragState.pointIndex, 'y', rel.y)
    } else {
      // handleIn 또는 handleOut: 핸들 좌표는 제한 없이 자유롭게 이동
      const unclampedRel = {
        x: dragState.boundsWidth > 0 ? (svgPt.x - dragState.strokeX) / dragState.boundsWidth : 0,
        y: dragState.boundsHeight > 0 ? (svgPt.y - dragState.strokeY) / dragState.boundsHeight : 0,
      }
      onPathPointChange(dragState.strokeId, dragState.pointIndex, dragState.type, unclampedRel)
    }
  }, [dragState, onPathPointChange, svgPointFromEvent, absToRelative])

  // 드래그 종료
  const handleMouseUp = useCallback(() => {
    setDragState(null)
  }, [])

  // 획의 절대 좌표를 계산하는 헬퍼
  const getStrokeBounds = (stroke: StrokeData) => {
    let strokeX: number
    let strokeY: number
    let boundsWidth: number
    let boundsHeight: number

    if (isMixed && boxInfo.juH && boxInfo.juV && horizontalStrokeIds && verticalStrokeIds) {
      if (horizontalStrokeIds.has(stroke.id)) {
        strokeX = boxInfo.juH.x * VIEW_BOX_SIZE + stroke.x * boxInfo.juH.width * VIEW_BOX_SIZE
        strokeY = boxInfo.juH.y * VIEW_BOX_SIZE + stroke.y * boxInfo.juH.height * VIEW_BOX_SIZE
        boundsWidth = stroke.width * boxInfo.juH.width * VIEW_BOX_SIZE
        boundsHeight = stroke.height * boxInfo.juH.height * VIEW_BOX_SIZE
      } else if (verticalStrokeIds.has(stroke.id)) {
        strokeX = boxInfo.juV.x * VIEW_BOX_SIZE + stroke.x * boxInfo.juV.width * VIEW_BOX_SIZE
        strokeY = boxInfo.juV.y * VIEW_BOX_SIZE + stroke.y * boxInfo.juV.height * VIEW_BOX_SIZE
        boundsWidth = stroke.width * boxInfo.juV.width * VIEW_BOX_SIZE
        boundsHeight = stroke.height * boxInfo.juV.height * VIEW_BOX_SIZE
      } else {
        strokeX = boxX + stroke.x * boxWidth
        strokeY = boxY + stroke.y * boxHeight
        boundsWidth = stroke.width * boxWidth
        boundsHeight = stroke.height * boxHeight
      }
    } else {
      strokeX = boxX + stroke.x * boxWidth
      strokeY = boxY + stroke.y * boxHeight
      boundsWidth = stroke.width * boxWidth
      boundsHeight = stroke.height * boxHeight
    }

    return { strokeX, strokeY, boundsWidth, boundsHeight }
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
                      onMouseDown={startDrag('handleIn', stroke.id, selectedPointIndex, strokeX, strokeY, boundsWidth, boundsHeight)} />
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
                      onMouseDown={startDrag('handleOut', stroke.id, selectedPointIndex, strokeX, strokeY, boundsWidth, boundsHeight)} />
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
              onMouseDown={startDrag('point', stroke.id, i, strokeX, strokeY, boundsWidth, boundsHeight)} />
          )
        })}
      </g>
    )
  }

  return (
    <div className={styles.preview}>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        onMouseMove={dragState ? handleMouseMove : undefined}
        onMouseUp={dragState ? handleMouseUp : undefined}
        onMouseLeave={dragState ? handleMouseUp : undefined}
      >
        {/* 전체 영역 배경 */}
        <rect
          x={0}
          y={0}
          width={viewBoxWidth}
          height={viewBoxHeight}
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

        {/* 획들 (박스 영역 내 상대 좌표) */}
        {strokes.map((stroke) => {
          const isSelected = stroke.id === selectedStrokeId
          const { strokeX, strokeY, boundsWidth, boundsHeight } = getStrokeBounds(stroke)

          // === PATH 스트로크 (곡선) ===
          if (isPathStroke(stroke)) {
            const d = pathDataToSvgD(stroke.pathData, strokeX, strokeY, boundsWidth, boundsHeight)
            return (
              <g key={stroke.id}>
                {/* 넓은 히트 영역 (투명) */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={STROKE_THICKNESS * 4}
                  onClick={() => setSelectedStrokeId(stroke.id)}
                  style={{ cursor: 'pointer' }}
                />
                {/* 실제 렌더링 */}
                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? '#ff6b6b' : '#1a1a1a'}
                  strokeWidth={STROKE_THICKNESS}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onClick={() => setSelectedStrokeId(stroke.id)}
                  style={{ cursor: 'pointer' }}
                />
                {/* 선택된 path의 포인트/핸들 오버레이 */}
                {isSelected && onPathPointChange && renderPathOverlay(stroke, strokeX, strokeY, boundsWidth, boundsHeight)}
              </g>
            )
          }

          // === RECT 스트로크 (기존 직선) ===
          let strokeWidth: number
          let strokeHeight: number
          if (stroke.direction === 'horizontal') {
            strokeWidth = boundsWidth
            strokeHeight = STROKE_THICKNESS
          } else {
            strokeWidth = STROKE_THICKNESS
            strokeHeight = boundsHeight
          }

          return (
            <rect
              key={stroke.id}
              x={strokeX}
              y={strokeY}
              width={strokeWidth}
              height={strokeHeight}
              fill={isSelected ? '#ff6b6b' : '#1a1a1a'}
              stroke={isSelected ? '#ff0000' : 'none'}
              strokeWidth={2}
              rx={1}
              ry={1}
              onClick={() => setSelectedStrokeId(stroke.id)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </svg>
      <span className={styles.jamoLabel}>{jamoChar}</span>
    </div>
  )
}
