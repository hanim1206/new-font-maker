import { useCallback, useEffect, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { weightToMultiplier } from '../../stores/globalStyleStore'
import type { StrokeDataV2, BoxConfig, Padding } from '../../types'
import { applyJamoPaddingToBox, getBoxBoundsInNormalizedCoordinates } from '../../utils/containerBoxUtils'

type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeEditorProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onPointChange?: PointChangeHandler
  boxInfo?: BoxConfig & { juH?: BoxConfig; juV?: BoxConfig }
  jamoPadding?: Padding
  horizontalPadding?: Padding
  verticalPadding?: Padding
  horizontalStrokeIds?: Set<string>
  verticalStrokeIds?: Set<string>
  boundaryBox?: BoxConfig
  horizontalBox?: BoxConfig
  verticalBox?: BoxConfig
  horizontalBoundaryBox?: BoxConfig
  verticalBoundaryBox?: BoxConfig
}

const MOVE_STEP = 0.025
const BASE_THICKNESS = 0.07
const WEIGHT_STEP = 100

export function StrokeEditor({ strokes, onChange, onPointChange, boxInfo = { x: 0, y: 0, width: 1, height: 1 }, jamoPadding, horizontalPadding, verticalPadding, horizontalStrokeIds, verticalStrokeIds, boundaryBox, horizontalBox, verticalBox, horizontalBoundaryBox, verticalBoundaryBox }: StrokeEditorProps) {
  const { selectedStrokeId, selectedPointIndex } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)
  const bounds = useMemo(() => {
    const isHorizontal = !!selectedStroke && horizontalStrokeIds?.has(selectedStroke.id)
    const isVertical = !!selectedStroke && verticalStrokeIds?.has(selectedStroke.id)
    const partBox = isHorizontal ? horizontalBox ?? boxInfo : isVertical ? verticalBox ?? boxInfo : boxInfo
    const padding = isHorizontal ? horizontalPadding ?? jamoPadding : isVertical ? verticalPadding ?? jamoPadding : jamoPadding
    const container = applyJamoPaddingToBox(partBox.x, partBox.y, partBox.width, partBox.height, padding)
    const boundary = isHorizontal
      ? horizontalBoundaryBox ?? container
      : isVertical
        ? verticalBoundaryBox ?? container
        : boundaryBox ?? container
    return getBoxBoundsInNormalizedCoordinates(container, boundary)
  }, [selectedStroke, horizontalStrokeIds, verticalStrokeIds, horizontalBox, verticalBox, boxInfo, horizontalPadding, verticalPadding, jamoPadding, horizontalBoundaryBox, verticalBoundaryBox, boundaryBox])

  const clampStrokeDelta = useCallback((deltaX: number, deltaY: number) => {
    if (!selectedStroke) return { deltaX: 0, deltaY: 0 }
    const xs = selectedStroke.points.map((point) => point.x)
    const ys = selectedStroke.points.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      deltaX: Math.max(bounds.minX - minX, Math.min(bounds.maxX - maxX, deltaX)),
      deltaY: Math.max(bounds.minY - minY, Math.min(bounds.maxY - maxY, deltaY)),
    }
  }, [selectedStroke, bounds])

  // 키보드 컨트롤
  useEffect(() => {
    if (!selectedStroke) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서 입력 중일 때는 무시
      if (e.target instanceof HTMLInputElement) return

      const isShift = e.shiftKey

      // 포인트가 선택된 경우: 해당 포인트 이동, Shift+방향키는 handleOut 이동
      if (selectedPointIndex !== null && onPointChange) {
        const point = selectedStroke.points[selectedPointIndex]
        if (!point) return

        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x - MOVE_STEP,
                y: point.handleOut.y,
              })
            } else {
              onPointChange(selectedStroke.id, selectedPointIndex, 'x', Math.max(bounds.minX, point.x - MOVE_STEP))
            }
            break
          case 'ArrowRight':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x + MOVE_STEP,
                y: point.handleOut.y,
              })
            } else {
              onPointChange(selectedStroke.id, selectedPointIndex, 'x', Math.min(bounds.maxX, point.x + MOVE_STEP))
            }
            break
          case 'ArrowUp':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x,
                y: point.handleOut.y - MOVE_STEP,
              })
            } else {
              onPointChange(selectedStroke.id, selectedPointIndex, 'y', Math.max(bounds.minY, point.y - MOVE_STEP))
            }
            break
          case 'ArrowDown':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x,
                y: point.handleOut.y + MOVE_STEP,
              })
            } else {
              onPointChange(selectedStroke.id, selectedPointIndex, 'y', Math.min(bounds.maxY, point.y + MOVE_STEP))
            }
            break
        }
        return
      }

      // 포인트 미선택 시: 모든 포인트를 동시에 이동 (획 전체 이동)
      // Shift+상하 = 두께 변경
      if (onPointChange) {
        switch (e.key) {
          case 'ArrowLeft': {
            e.preventDefault()
            // 모든 포인트 + 핸들을 왼쪽으로
            const leftDelta = clampStrokeDelta(-MOVE_STEP, 0).deltaX
            selectedStroke.points.forEach((pt, i) => {
              onPointChange(selectedStroke.id, i, 'x', pt.x + leftDelta)
              if (pt.handleIn) onPointChange(selectedStroke.id, i, 'handleIn', { x: pt.handleIn.x + leftDelta, y: pt.handleIn.y })
              if (pt.handleOut) onPointChange(selectedStroke.id, i, 'handleOut', { x: pt.handleOut.x + leftDelta, y: pt.handleOut.y })
            })
            break
          }
          case 'ArrowRight': {
            e.preventDefault()
            const rightDelta = clampStrokeDelta(MOVE_STEP, 0).deltaX
            selectedStroke.points.forEach((pt, i) => {
              onPointChange(selectedStroke.id, i, 'x', pt.x + rightDelta)
              if (pt.handleIn) onPointChange(selectedStroke.id, i, 'handleIn', { x: pt.handleIn.x + rightDelta, y: pt.handleIn.y })
              if (pt.handleOut) onPointChange(selectedStroke.id, i, 'handleOut', { x: pt.handleOut.x + rightDelta, y: pt.handleOut.y })
            })
            break
          }
          case 'ArrowUp':
            e.preventDefault()
            if (isShift) {
              // 두께 감소 (weight 100 단위)
              const currentMultiplier = selectedStroke.thickness / BASE_THICKNESS
              // 현재 multiplier → weight 역변환
              const currentWeight = currentMultiplier <= 1.0
                ? 100 + ((currentMultiplier - 0.4) / 0.6) * 300
                : 400 + ((currentMultiplier - 1.0) / 1.2) * 500
              const newWeight = Math.max(100, Math.round(currentWeight / WEIGHT_STEP) * WEIGHT_STEP - WEIGHT_STEP)
              onChange(selectedStroke.id, 'thickness', weightToMultiplier(newWeight) * BASE_THICKNESS)
            } else {
              const upDelta = clampStrokeDelta(0, -MOVE_STEP).deltaY
              selectedStroke.points.forEach((pt, i) => {
                onPointChange(selectedStroke.id, i, 'y', pt.y + upDelta)
                if (pt.handleIn) onPointChange(selectedStroke.id, i, 'handleIn', { x: pt.handleIn.x, y: pt.handleIn.y + upDelta })
                if (pt.handleOut) onPointChange(selectedStroke.id, i, 'handleOut', { x: pt.handleOut.x, y: pt.handleOut.y + upDelta })
              })
            }
            break
          case 'ArrowDown':
            e.preventDefault()
            if (isShift) {
              // 두께 증가 (weight 100 단위)
              const currentMultiplier = selectedStroke.thickness / BASE_THICKNESS
              const currentWeight = currentMultiplier <= 1.0
                ? 100 + ((currentMultiplier - 0.4) / 0.6) * 300
                : 400 + ((currentMultiplier - 1.0) / 1.2) * 500
              const newWeight = Math.min(900, Math.round(currentWeight / WEIGHT_STEP) * WEIGHT_STEP + WEIGHT_STEP)
              onChange(selectedStroke.id, 'thickness', weightToMultiplier(newWeight) * BASE_THICKNESS)
            } else {
              const downDelta = clampStrokeDelta(0, MOVE_STEP).deltaY
              selectedStroke.points.forEach((pt, i) => {
                onPointChange(selectedStroke.id, i, 'y', pt.y + downDelta)
                if (pt.handleIn) onPointChange(selectedStroke.id, i, 'handleIn', { x: pt.handleIn.x, y: pt.handleIn.y + downDelta })
                if (pt.handleOut) onPointChange(selectedStroke.id, i, 'handleOut', { x: pt.handleOut.x, y: pt.handleOut.y + downDelta })
              })
            }
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStroke, selectedPointIndex, onChange, onPointChange, bounds, clampStrokeDelta])

  // UI 렌더링 없음 - 키보드 컨트롤만 담당
  return null
}
