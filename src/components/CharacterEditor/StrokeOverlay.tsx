import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useDeviceCapability } from '../../hooks/useDeviceCapability'
import type { StrokeDataV2, BoxConfig, Padding } from '../../types'
import { pointsToSvgD } from '../../utils/pathUtils'
import { collectSnapTargets, snapPoint, detectMergeHint } from '../../utils/snapUtils'
import type { SnapResult, MergeHint } from '../../utils/snapUtils'
import { weightToMultiplier, resolveLinecap } from '../../stores/globalStyleStore'
import type { GlobalStyle } from '../../stores/globalStyleStore'
import { SnapFeedback } from './SnapFeedback'
import type { MergeHintPositions } from './SnapFeedback'
import { PointOverlay } from './PointOverlay'

// === 타입 정의 ===

export type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

export type StrokeChangeHandler = (strokeId: string, prop: string, value: number | string | boolean | undefined) => void

interface OriginalPointSnapshot {
  x: number; y: number
  handleIn?: { x: number; y: number }
  handleOut?: { x: number; y: number }
}

interface DragState {
  type: 'point' | 'handleIn' | 'handleOut' | 'strokeMove'
  strokeId: string
  pointIndex: number
  // strokeMove 시: 원래 points 스냅샷 (핸들 포함) + 그랩 오프셋
  originalPoints?: OriginalPointSnapshot[]
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
  onDragEnd?: () => void   // 드래그 종료 시 호출 (팝업 재표시용)
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
  // 롱프레스 시 포인트 액션 팝업 트리거 (모바일)
  onPointLongPress?: (strokeId: string, pointIndex: number) => void
}

import { applyJamoPaddingToBox } from '../../utils/containerBoxUtils'

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
  onDragEnd,
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
  onPointLongPress,
}: StrokeOverlayProps) {
  const { selectedStrokeId, setSelectedStrokeId, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const { isTouch } = useDeviceCapability()
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [snapFeedback, setSnapFeedback] = useState<SnapResult | null>(null)
  const [mergeHintState, setMergeHintState] = useState<MergeHint | null>(null)

  // 터치 하이라이트 (터치 시작 시 획 일시 강조)
  const [touchHighlightId, setTouchHighlightId] = useState<string | null>(null)
  const touchHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 롱프레스 타이머 (앵커 포인트 롱프레스 → 팝업 트리거)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pointRadius = isTouch ? 5 : 2.5
  const weightMultiplier = globalStyle ? weightToMultiplier(globalStyle.weight) : 1.0

  // 박스 절대 좌표
  const boxX = box.x * viewBoxSize
  const boxY = box.y * viewBoxSize
  const boxWidth = box.width * viewBoxSize
  const boxHeight = box.height * viewBoxSize

  // 롱프레스 타이머 취소
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // 터치 하이라이트 설정 (300ms 후 자동 해제)
  const setTouchHighlight = useCallback((id: string) => {
    if (touchHighlightTimerRef.current) clearTimeout(touchHighlightTimerRef.current)
    setTouchHighlightId(id)
    touchHighlightTimerRef.current = setTimeout(() => setTouchHighlightId(null), 300)
  }, [])

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      clearLongPress()
      if (touchHighlightTimerRef.current) clearTimeout(touchHighlightTimerRef.current)
    }
  }, [clearLongPress])

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
        originalPoints: stroke.points.map(p => ({
          x: p.x, y: p.y,
          handleIn: p.handleIn ? { x: p.handleIn.x, y: p.handleIn.y } : undefined,
          handleOut: p.handleOut ? { x: p.handleOut.x, y: p.handleOut.y } : undefined,
        })),
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
        if (origPt.handleIn) {
          onPointChange(dragState.strokeId, i, 'handleIn', {
            x: origPt.handleIn.x + snappedDeltaX,
            y: origPt.handleIn.y + snappedDeltaY,
          })
        }
        if (origPt.handleOut) {
          onPointChange(dragState.strokeId, i, 'handleOut', {
            x: origPt.handleOut.x + snappedDeltaX,
            y: origPt.handleOut.y + snappedDeltaY,
          })
        }
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
    onDragEnd?.()
  }, [onDragEnd])

  // 드래그 중 커서
  const getDragCursor = () => {
    if (!dragState) return undefined
    switch (dragState.type) {
      case 'strokeMove': return 'move'
      case 'point':
      case 'handleIn':
      case 'handleOut': return 'grabbing'
    }
  }

  // 가이드라인 렌더링용: 현재 드래그 획의 컨테이너 절대 좌표
  const dragContainerAbs = useMemo(() => {
    if (!dragState) return null
    const stroke = strokes.find(s => s.id === dragState.strokeId)
    if (!stroke) return null
    return getContainerBoxAbs(stroke)
  }, [dragState, strokes, getContainerBoxAbs])

  // 병합 힌트 위치 (사전 계산하여 SnapFeedback에 전달)
  const mergeHintPositions = useMemo((): MergeHintPositions | null => {
    if (!mergeHintState || !dragContainerAbs) return null
    const targetStroke = strokes.find(s => s.id === mergeHintState.targetStrokeId)
    if (!targetStroke) return null
    const targetContainer = getContainerBoxAbs(targetStroke)
    const tX = targetContainer.x + mergeHintState.targetPoint.x * targetContainer.width
    const tY = targetContainer.y + mergeHintState.targetPoint.y * targetContainer.height
    const sourceStroke = strokes.find(s => s.id === mergeHintState.sourceStrokeId)
    if (!sourceStroke) return null
    const sourceContainer = getContainerBoxAbs(sourceStroke)
    const srcPt = sourceStroke.points[mergeHintState.sourcePointIndex]
    if (!srcPt) return null
    const sX = sourceContainer.x + srcPt.x * sourceContainer.width
    const sY = sourceContainer.y + srcPt.y * sourceContainer.height
    return { source: { x: sX, y: sY }, target: { x: tX, y: tY } }
  }, [mergeHintState, dragContainerAbs, strokes, getContainerBoxAbs])

  // window 레벨 드래그 이벤트 (범위 밖에서도 드래그 유지)
  useEffect(() => {
    if (!dragState) return

    const handleWindowMove = (e: MouseEvent | TouchEvent) => {
      clearLongPress() // 이동 시작 시 롱프레스 취소
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
  }, [dragState, handlePointerMove, handlePointerUp, clearLongPress])

  // 빈 영역 클릭 시 선택 해제
  const handleBackgroundClick = useCallback(() => {
    if (!dragState) {
      setSelectedPointIndex(null)
      setSelectedStrokeId(null)
    }
  }, [dragState, setSelectedPointIndex, setSelectedStrokeId])

  // 포인트 근접 감지 — 터치 시 획 선택+포인트 드래그를 한번에 시작하기 위해
  const POINT_GRAB_THRESHOLD = isTouch ? 8 : 4 // viewBox 단위
  const findNearestPointIndex = useCallback((
    stroke: StrokeDataV2,
    svgPt: { x: number; y: number },
    cAbs: BoxConfig
  ): number | null => {
    let nearIdx: number | null = null
    let nearDist = POINT_GRAB_THRESHOLD
    for (let i = 0; i < stroke.points.length; i++) {
      const pt = stroke.points[i]
      const absX = cAbs.x + pt.x * cAbs.width
      const absY = cAbs.y + pt.y * cAbs.height
      const dist = Math.hypot(svgPt.x - absX, svgPt.y - absY)
      if (dist < nearDist) {
        nearDist = dist
        nearIdx = i
      }
    }
    return nearIdx
  }, [POINT_GRAB_THRESHOLD])

  return (
    <g
      style={dragState ? { cursor: getDragCursor() } : undefined}
    >
      {/* 배경: 빈 영역 클릭 시 선택 해제 (viewBox 범위 내로 제한) */}
      <rect
        x={0} y={0}
        width={viewBoxSize} height={viewBoxSize}
        fill="transparent"
        role="presentation"
        onClick={handleBackgroundClick}
      />

      {/* 선택된 획을 마지막에 렌더링하여 SVG z-order 최상위로 배치 */}
      {(() => {
        const sorted = selectedStrokeId
          ? [...strokes.filter(s => s.id !== selectedStrokeId), ...strokes.filter(s => s.id === selectedStrokeId)]
          : strokes
        const isPointEditingActive = selectedStrokeId !== null && selectedPointIndex !== null

        return sorted.map((stroke) => {
          const isSelected = stroke.id === selectedStrokeId
          const containerNorm = getContainerBoxNormalized(stroke)
          const containerAbs = getContainerBoxAbs(stroke)
          const d = pointsToSvgD(stroke.points, stroke.closed, containerNorm, viewBoxSize)
          if (!d) return null
          const pathThickness = stroke.thickness * weightMultiplier * viewBoxSize

          // 포인트를 절대 좌표로 변환 (오버레이용)
          const disableHitArea = !isSelected && isPointEditingActive
          const isHighlighted = isTouch && touchHighlightId === stroke.id

          return (
            <g key={stroke.id}>
              {/* 넓은 히트 영역 (투명) - 이동용 */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={pathThickness * 4}
                role={disableHitArea ? undefined : 'button'}
                aria-label={disableHitArea ? undefined : '획 선택'}
                onClick={disableHitArea ? undefined : (e) => { e.stopPropagation(); setSelectedStrokeId(stroke.id) }}
                onMouseDown={disableHitArea ? undefined : (e: React.MouseEvent) => {
                  // 포인트 근처 클릭 시 즉시 포인트 드래그 시작 (획 선택 불필요)
                  if (onPointChange) {
                    const svgPt = svgPointFromEvent(e)
                    const nearIdx = findNearestPointIndex(stroke, svgPt, containerAbs)
                    if (nearIdx !== null) {
                      e.stopPropagation(); e.preventDefault()
                      setSelectedStrokeId(stroke.id); onDragStart?.(); setSelectedPointIndex(nearIdx)
                      setDragState({ type: 'point', strokeId: stroke.id, pointIndex: nearIdx,
                        containerX: containerAbs.x, containerY: containerAbs.y, containerW: containerAbs.width, containerH: containerAbs.height })
                      return
                    }
                  }
                  if (onStrokeChange) startStrokeMove(stroke)(e)
                }}
                onTouchStart={disableHitArea ? undefined : (e: React.TouchEvent) => {
                  setTouchHighlight(stroke.id)
                  // 포인트 근처 터치 시 즉시 포인트 드래그 시작 (획 선택 불필요)
                  if (onPointChange) {
                    const svgPt = svgPointFromEvent(e)
                    const nearIdx = findNearestPointIndex(stroke, svgPt, containerAbs)
                    if (nearIdx !== null) {
                      e.stopPropagation(); e.preventDefault()
                      setSelectedStrokeId(stroke.id); onDragStart?.(); setSelectedPointIndex(nearIdx)
                      setDragState({ type: 'point', strokeId: stroke.id, pointIndex: nearIdx,
                        containerX: containerAbs.x, containerY: containerAbs.y, containerW: containerAbs.width, containerH: containerAbs.height })
                      clearLongPress()
                      if (onPointLongPress) {
                        longPressTimerRef.current = setTimeout(() => onPointLongPress(stroke.id, nearIdx), 500)
                      }
                      return
                    }
                  }
                  if (onStrokeChange) startStrokeMove(stroke)(e)
                }}
                style={{ cursor: disableHitArea ? 'default' : (onStrokeChange ? 'move' : 'pointer'), pointerEvents: disableHitArea ? 'none' : undefined }}
              />
              {/* 실제 렌더링 */}
              <path
                d={d}
                fill="none"
                stroke={isSelected ? '#ff6b6b' : (isHighlighted ? '#c0c0c0' : strokeColor)}
                strokeWidth={pathThickness * (isHighlighted ? 1.5 : 1)}
                strokeLinecap={resolveLinecap(stroke.linecap, globalStyle?.linecap)}
                strokeLinejoin="round"
                aria-hidden="true"
                onClick={disableHitArea ? undefined : (e) => { e.stopPropagation(); setSelectedStrokeId(stroke.id) }}
                onMouseDown={disableHitArea ? undefined : (e: React.MouseEvent) => {
                  if (onPointChange) {
                    const svgPt = svgPointFromEvent(e)
                    const nearIdx = findNearestPointIndex(stroke, svgPt, containerAbs)
                    if (nearIdx !== null) {
                      e.stopPropagation(); e.preventDefault()
                      setSelectedStrokeId(stroke.id); onDragStart?.(); setSelectedPointIndex(nearIdx)
                      setDragState({ type: 'point', strokeId: stroke.id, pointIndex: nearIdx,
                        containerX: containerAbs.x, containerY: containerAbs.y, containerW: containerAbs.width, containerH: containerAbs.height })
                      return
                    }
                  }
                  if (onStrokeChange) startStrokeMove(stroke)(e)
                }}
                onTouchStart={disableHitArea ? undefined : (e: React.TouchEvent) => {
                  if (onPointChange) {
                    const svgPt = svgPointFromEvent(e)
                    const nearIdx = findNearestPointIndex(stroke, svgPt, containerAbs)
                    if (nearIdx !== null) {
                      e.stopPropagation(); e.preventDefault()
                      setSelectedStrokeId(stroke.id); onDragStart?.(); setSelectedPointIndex(nearIdx)
                      setDragState({ type: 'point', strokeId: stroke.id, pointIndex: nearIdx,
                        containerX: containerAbs.x, containerY: containerAbs.y, containerW: containerAbs.width, containerH: containerAbs.height })
                      return
                    }
                  }
                  if (onStrokeChange) startStrokeMove(stroke)(e)
                }}
                style={{ cursor: disableHitArea ? 'default' : (onStrokeChange ? 'move' : 'pointer'), pointerEvents: disableHitArea ? 'none' : undefined }}
              />

              {/* 선택된 획의 포인트/핸들 오버레이 */}
              {isSelected && onPointChange && (
                <PointOverlay
                  stroke={stroke}
                  selectedPointIndex={selectedPointIndex}
                  containerAbs={containerAbs}
                  pointRadius={pointRadius}
                  onHandleInDown={startPointDrag('handleIn', stroke.id, selectedPointIndex ?? 0, containerAbs)}
                  onHandleOutDown={startPointDrag('handleOut', stroke.id, selectedPointIndex ?? 0, containerAbs)}
                  onAnchorDown={(i) => startPointDrag('point', stroke.id, i, containerAbs)}
                  onAnchorTouchStart={(i) => (e) => {
                    startPointDrag('point', stroke.id, i, containerAbs)(e)
                    // 롱프레스 타이머 시작 (이동 시 window touchmove handler에서 clearLongPress 호출됨)
                    clearLongPress()
                    if (onPointLongPress) {
                      longPressTimerRef.current = setTimeout(() => {
                        onPointLongPress(stroke.id, i)
                      }, 500)
                    }
                  }}
                  onAnchorTouchEnd={clearLongPress}
                />
              )}
            </g>
          )
        })
      })()}

      {/* 스냅 피드백 + 병합 힌트 */}
      <SnapFeedback
        snapFeedback={snapFeedback}
        dragContainerAbs={dragContainerAbs}
        mergeHintPositions={mergeHintPositions}
      />
    </g>
  )
}
