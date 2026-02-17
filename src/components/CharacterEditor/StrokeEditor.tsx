import { useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { StrokeData, BoxConfig } from '../../types'
import { isPathStroke, isRectStroke } from '../../types'

type PathPointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeEditorProps {
  strokes: StrokeData[]
  onChange: (strokeId: string, prop: string, value: number) => void
  onPathPointChange?: PathPointChangeHandler
  boxInfo?: BoxConfig & { juH?: BoxConfig; juV?: BoxConfig }
}

const MOVE_STEP = 0.025
const RESIZE_STEP = 0.025
const ANGLE_STEP = 15

export function StrokeEditor({ strokes, onChange, onPathPointChange, boxInfo: _boxInfo = { x: 0, y: 0, width: 1, height: 1 } }: StrokeEditorProps) {
  // TODO: _boxInfo를 사용하여 박스 영역 내에서만 이동 가능하도록 제한
  void _boxInfo
  const { selectedStrokeId, selectedPointIndex } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  // 박스 영역 내에서만 이동 가능하도록 제한하는 헬퍼 함수
  const clampToBox = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value))
  }

  // 키보드 컨트롤
  useEffect(() => {
    if (!selectedStroke) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서 입력 중일 때는 무시
      if (e.target instanceof HTMLInputElement) return

      const isShift = e.shiftKey

      // path 스트로크 + 포인트 선택 시: 포인트 이동
      if (isPathStroke(selectedStroke) && selectedPointIndex !== null && onPathPointChange) {
        const point = selectedStroke.pathData.points[selectedPointIndex]
        if (!point) return

        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x - MOVE_STEP,
                y: point.handleOut.y,
              })
            } else {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'x', point.x - MOVE_STEP)
            }
            break
          case 'ArrowRight':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x + MOVE_STEP,
                y: point.handleOut.y,
              })
            } else {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'x', point.x + MOVE_STEP)
            }
            break
          case 'ArrowUp':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x,
                y: point.handleOut.y - MOVE_STEP,
              })
            } else {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'y', point.y - MOVE_STEP)
            }
            break
          case 'ArrowDown':
            e.preventDefault()
            if (isShift && point.handleOut) {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'handleOut', {
                x: point.handleOut.x,
                y: point.handleOut.y + MOVE_STEP,
              })
            } else {
              onPathPointChange(selectedStroke.id, selectedPointIndex, 'y', point.y + MOVE_STEP)
            }
            break
        }
        return
      }

      // rect 스트로크: 중심좌표 기반 이동, Shift+좌우=width, Shift+상하=thickness
      if (isRectStroke(selectedStroke)) {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault()
            if (isShift) {
              onChange(selectedStroke.id, 'width', clampToBox(selectedStroke.width - RESIZE_STEP, 0.01, 1))
            } else {
              onChange(selectedStroke.id, 'x', clampToBox(selectedStroke.x - MOVE_STEP, 0, 1))
            }
            break
          case 'ArrowRight':
            e.preventDefault()
            if (isShift) {
              onChange(selectedStroke.id, 'width', clampToBox(selectedStroke.width + RESIZE_STEP, 0.01, 1))
            } else {
              onChange(selectedStroke.id, 'x', clampToBox(selectedStroke.x + MOVE_STEP, 0, 1))
            }
            break
          case 'ArrowUp':
            e.preventDefault()
            if (isShift) {
              onChange(selectedStroke.id, 'thickness', clampToBox(selectedStroke.thickness - RESIZE_STEP, 0.01, 0.5))
            } else {
              onChange(selectedStroke.id, 'y', clampToBox(selectedStroke.y - MOVE_STEP, 0, 1))
            }
            break
          case 'ArrowDown':
            e.preventDefault()
            if (isShift) {
              onChange(selectedStroke.id, 'thickness', clampToBox(selectedStroke.thickness + RESIZE_STEP, 0.01, 0.5))
            } else {
              onChange(selectedStroke.id, 'y', clampToBox(selectedStroke.y + MOVE_STEP, 0, 1))
            }
            break
          case 'r':
          case 'R':
            e.preventDefault()
            onChange(selectedStroke.id, 'angle', ((selectedStroke.angle ?? 0) + (isShift ? -ANGLE_STEP : ANGLE_STEP) + 360) % 360)
            break
        }
        return
      }

      // path 스트로크: 바운딩 박스 이동 (좌상단 좌표)
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (isShift) {
            onChange(selectedStroke.id, 'width', clampToBox(selectedStroke.width - RESIZE_STEP, 0.01, 1 - selectedStroke.x))
          } else {
            onChange(selectedStroke.id, 'x', clampToBox(selectedStroke.x - MOVE_STEP, 0, 1 - selectedStroke.width))
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (isShift) {
            onChange(selectedStroke.id, 'width', clampToBox(selectedStroke.width + RESIZE_STEP, 0.01, 1 - selectedStroke.x))
          } else {
            onChange(selectedStroke.id, 'x', clampToBox(selectedStroke.x + MOVE_STEP, 0, 1 - selectedStroke.width))
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (isShift) {
            onChange(selectedStroke.id, 'height', clampToBox(selectedStroke.height - RESIZE_STEP, 0.01, 1 - selectedStroke.y))
          } else {
            onChange(selectedStroke.id, 'y', clampToBox(selectedStroke.y - MOVE_STEP, 0, 1 - selectedStroke.height))
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (isShift) {
            onChange(selectedStroke.id, 'height', clampToBox(selectedStroke.height + RESIZE_STEP, 0.01, 1 - selectedStroke.y))
          } else {
            onChange(selectedStroke.id, 'y', clampToBox(selectedStroke.y + MOVE_STEP, 0, 1 - selectedStroke.height))
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStroke, selectedPointIndex, onChange, onPathPointChange])

  // UI 렌더링 없음 - 키보드 컨트롤만 담당
  return null
}
