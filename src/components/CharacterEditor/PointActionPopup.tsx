import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, BoxConfig, Padding } from '../../types'
import { Button } from '@/components/ui/button'
import { getContainerBoxAbsForStroke } from '../../utils/containerBoxUtils'

interface PointActionPopupProps {
  strokes: StrokeDataV2[]
  canvasSize: number
  viewBoxSize: number
  box: BoxConfig
  // 혼합중성 옵션
  isMixed?: boolean
  juHBox?: BoxConfig
  juVBox?: BoxConfig
  horizontalStrokeIds?: Set<string>
  verticalStrokeIds?: Set<string>
  jamoPadding?: Padding
  horizontalPadding?: Padding
  verticalPadding?: Padding
  // 핸들러
  onToggleCurve?: (strokeId: string, pointIndex: number) => void
  onSplitStroke?: (strokeId: string, pointIndex: number) => void
  onOpenAtPoint?: (strokeId: string, pointIndex: number) => void
  onDeletePoint?: (strokeId: string, pointIndex: number) => void
}

/** 선택된 포인트 위에 뜨는 플로팅 액션 팝업 */
export function PointActionPopup({
  strokes,
  canvasSize,
  viewBoxSize,
  box,
  isMixed,
  juHBox,
  juVBox,
  horizontalStrokeIds,
  verticalStrokeIds,
  jamoPadding,
  horizontalPadding,
  verticalPadding,
  onToggleCurve,
  onSplitStroke,
  onOpenAtPoint,
  onDeletePoint,
}: PointActionPopupProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const selectedStroke = strokes.find(s => s.id === selectedStrokeId)

  if (!selectedStroke || selectedPointIndex === null || selectedPointIndex >= selectedStroke.points.length) {
    return null
  }

  const selectedPoint = selectedStroke.points[selectedPointIndex]
  const hasCurve = !!(selectedPoint.handleIn || selectedPoint.handleOut)
  const canSplit = selectedPointIndex > 0 && selectedPointIndex < selectedStroke.points.length - 1 && !selectedStroke.closed

  // 포인트의 캔버스 픽셀 좌표 계산
  const containerAbs = getContainerBoxAbsForStroke(selectedStroke, box, viewBoxSize, {
    isMixed,
    juHBox,
    juVBox,
    horizontalStrokeIds,
    verticalStrokeIds,
    jamoPadding,
    horizontalPadding,
    verticalPadding,
  })

  const absX = containerAbs.x + selectedPoint.x * containerAbs.width
  const absY = containerAbs.y + selectedPoint.y * containerAbs.height
  const pixelX = (absX / viewBoxSize) * canvasSize
  const pixelY = (absY / viewBoxSize) * canvasSize

  // 팝업 크기 추정
  const popupHeight = 32
  const popupWidth = 180

  // 위치: 점 위에 표시, 너무 위면 아래로 flip
  let top = pixelY - popupHeight - 12
  if (top < 4) top = pixelY + 16
  const left = Math.max(4, Math.min(canvasSize - popupWidth - 4, pixelX - popupWidth / 2))

  // 표시할 버튼이 하나도 없으면 렌더링하지 않음
  const hasAnyAction = onToggleCurve || (onSplitStroke && canSplit) || (onOpenAtPoint && selectedStroke.closed) || (onDeletePoint && selectedStroke.points.length > 2)
  if (!hasAnyAction) return null

  return (
    <div
      className="absolute z-10 flex gap-1 bg-surface-2 border border-border rounded-lg shadow-lg px-1.5 py-1"
      style={{ top, left, pointerEvents: 'auto' }}
    >
      {onToggleCurve && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[0.65rem] px-2"
          onClick={() => onToggleCurve(selectedStroke.id, selectedPointIndex)}
        >
          {hasCurve ? '직선화' : '곡선화'}
        </Button>
      )}
      {onSplitStroke && canSplit && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[0.65rem] px-2"
          onClick={() => onSplitStroke(selectedStroke.id, selectedPointIndex)}
        >
          분리
        </Button>
      )}
      {onOpenAtPoint && selectedStroke.closed && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[0.65rem] px-2 border-orange-600 text-orange-400 hover:bg-orange-900/30"
          onClick={() => onOpenAtPoint(selectedStroke.id, selectedPointIndex)}
        >
          끊기
        </Button>
      )}
      {onDeletePoint && selectedStroke.points.length > 2 && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[0.65rem] px-2 border-red-600 text-red-400 hover:bg-red-900/30"
          onClick={() => {
            onDeletePoint(selectedStroke.id, selectedPointIndex)
            const newLen = selectedStroke.points.length - 1
            if (selectedPointIndex >= newLen) setSelectedPointIndex(newLen - 1)
          }}
        >
          삭제
        </Button>
      )}
    </div>
  )
}
