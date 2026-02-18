import { useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, BoxConfig } from '../../types'

type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeEditorProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | undefined) => void
  onPointChange?: PointChangeHandler
  boxInfo?: BoxConfig & { juH?: BoxConfig; juV?: BoxConfig }
}

const MOVE_STEP = 0.025
const THICKNESS_STEP = 0.005

export function StrokeEditor({ strokes, onChange, onPointChange, boxInfo: _boxInfo = { x: 0, y: 0, width: 1, height: 1 } }: StrokeEditorProps) {
  void _boxInfo
  const { selectedStrokeId, selectedPointIndex } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

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
              onPointChange(selectedStroke.id, selectedPointIndex, 'x', point.x - MOVE_STEP)
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
              onPointChange(selectedStroke.id, selectedPointIndex, 'x', point.x + MOVE_STEP)
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
              onPointChange(selectedStroke.id, selectedPointIndex, 'y', point.y - MOVE_STEP)
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
              onPointChange(selectedStroke.id, selectedPointIndex, 'y', point.y + MOVE_STEP)
            }
            break
        }
        return
      }

      // 포인트 미선택 시: 모든 포인트를 동시에 이동 (획 전체 이동)
      // Shift+상하 = 두께 변경
      if (onPointChange) {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault()
            // 모든 포인트를 왼쪽으로
            selectedStroke.points.forEach((pt, i) => {
              onPointChange(selectedStroke.id, i, 'x', pt.x - MOVE_STEP)
            })
            break
          case 'ArrowRight':
            e.preventDefault()
            selectedStroke.points.forEach((pt, i) => {
              onPointChange(selectedStroke.id, i, 'x', pt.x + MOVE_STEP)
            })
            break
          case 'ArrowUp':
            e.preventDefault()
            if (isShift) {
              // 두께 감소
              onChange(selectedStroke.id, 'thickness', Math.max(0.01, selectedStroke.thickness - THICKNESS_STEP))
            } else {
              selectedStroke.points.forEach((pt, i) => {
                onPointChange(selectedStroke.id, i, 'y', pt.y - MOVE_STEP)
              })
            }
            break
          case 'ArrowDown':
            e.preventDefault()
            if (isShift) {
              // 두께 증가
              onChange(selectedStroke.id, 'thickness', Math.min(0.5, selectedStroke.thickness + THICKNESS_STEP))
            } else {
              selectedStroke.points.forEach((pt, i) => {
                onPointChange(selectedStroke.id, i, 'y', pt.y + MOVE_STEP)
              })
            }
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStroke, selectedPointIndex, onChange, onPointChange])

  // UI 렌더링 없음 - 키보드 컨트롤만 담당
  return null
}
