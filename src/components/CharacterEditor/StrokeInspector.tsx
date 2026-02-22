import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, StrokeLinecap } from '../../types'
import { MERGE_PROXIMITY } from '../../utils/snapUtils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { SliderMark } from '@/components/ui/slider'
import { weightToMultiplier } from '../../stores/globalStyleStore'

const BASE_THICKNESS = 0.07

function thicknessToWeight(thickness: number): number {
  const multiplier = thickness / BASE_THICKNESS
  if (multiplier <= 1.0) {
    return 100 + ((multiplier - 0.4) / 0.6) * 300
  }
  return 400 + ((multiplier - 1.0) / 1.2) * 500
}

function weightToThickness(weight: number): number {
  return weightToMultiplier(weight) * BASE_THICKNESS
}

const WEIGHT_MARKS: SliderMark[] = [
  { value: 100, label: '100' },
  { value: 200 },
  { value: 300, label: '300' },
  { value: 400, label: '400' },
  { value: 500 },
  { value: 600, label: '600' },
  { value: 700, label: '700' },
  { value: 800 },
  { value: 900, label: '900' },
]

function minEndpointDistance(a: StrokeDataV2, b: StrokeDataV2): number {
  const aEnds = [a.points[0], a.points[a.points.length - 1]]
  const bEnds = [b.points[0], b.points[b.points.length - 1]]
  let min = Infinity
  for (const ae of aEnds) {
    for (const be of bEnds) {
      const d = Math.sqrt((ae.x - be.x) ** 2 + (ae.y - be.y) ** 2)
      if (d < min) min = d
    }
  }
  return min
}

const LINECAP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'default', label: '기본' },
  { value: 'round', label: '둥근' },
  { value: 'butt', label: '평평' },
  { value: 'square', label: '사각' },
]

interface StrokeInspectorProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onMergeStrokes?: (strokeIdA: string, strokeIdB: string) => void
  onSplitStroke?: (strokeId: string, pointIndex: number) => void
  onToggleCurve?: (strokeId: string, pointIndex: number) => void
  onOpenAtPoint?: (strokeId: string, pointIndex: number) => void
  onDeletePoint?: (strokeId: string, pointIndex: number) => void
  onDeleteStroke?: (strokeId: string) => void
  onAddStroke?: () => void
}

export function StrokeInspector({ strokes, onChange, onMergeStrokes, onSplitStroke, onToggleCurve, onOpenAtPoint, onDeletePoint, onDeleteStroke, onAddStroke }: StrokeInspectorProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex, setSelectedStrokeId } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  const mergeTargets = selectedStroke && !selectedStroke.closed
    ? strokes
        .filter(s => s.id !== selectedStrokeId && !s.closed)
        .map(s => ({ stroke: s, dist: minEndpointDistance(selectedStroke, s) }))
        .filter(t => t.dist <= MERGE_PROXIMITY)
        .sort((a, b) => a.dist - b.dist)
    : []

  if (!selectedStroke) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-xs text-muted block mb-3">Stroke Properties</h3>
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">획을 선택해주세요</div>
      </div>
    )
  }

  const selectedPoint = selectedPointIndex !== null && selectedPointIndex < selectedStroke.points.length
    ? selectedStroke.points[selectedPointIndex]
    : null

  const hasCurve = selectedPoint ? !!(selectedPoint.handleIn || selectedPoint.handleOut) : false
  const canSplit = selectedPointIndex !== null && selectedPointIndex > 0 && selectedPointIndex < selectedStroke.points.length - 1 && !selectedStroke.closed
  const currentLinecap = selectedStroke.linecap ?? 'default'

  return (
    <div className="flex flex-col gap-3">
      {/* 두께 */}
      <Card>
        <CardContent className="p-4">
          <label className="text-[0.7rem] text-muted uppercase tracking-wider block mb-2">두께</label>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Slider
                min={100}
                max={900}
                step={100}
                value={[Math.round(thicknessToWeight(selectedStroke.thickness) / 100) * 100]}
                onValueChange={([val]) => onChange(selectedStroke.id, 'thickness', weightToThickness(val))}
                marks={WEIGHT_MARKS}
                originValue={400}
              />
            </div>
            <span className="text-xs text-text-dim-5 font-mono shrink-0 w-12 text-right">
              {selectedStroke.thickness.toFixed(3)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Linecap */}
      <Card>
        <CardContent className="p-4">
          <label className="text-[0.7rem] text-muted uppercase tracking-wider block mb-2">Linecap (끝 모양)</label>
          <ToggleGroup
            type="single"
            value={currentLinecap}
            onValueChange={(val) => {
              if (!val) return
              onChange(selectedStroke.id, 'linecap', val === 'default' ? undefined : val as StrokeLinecap)
            }}
          >
            {LINECAP_OPTIONS.map(({ value, label }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Separator />

      {/* 획 편집 액션 버튼 */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs text-muted block">획 편집</h3>
        <div className="flex flex-wrap gap-2">
          {onMergeStrokes && mergeTargets.length > 0 && (
            mergeTargets.map(({ stroke: target }) => (
              <Button
                key={target.id}
                variant="outline"
                size="sm"
                className="border-green-600 text-green-400 hover:bg-green-900/30"
                onClick={() => {
                  onMergeStrokes(selectedStroke.id, target.id)
                  setSelectedStrokeId(selectedStroke.id)
                }}
              >
                + {target.id} 합치기
              </Button>
            ))
          )}
          {onMergeStrokes && mergeTargets.length === 0 && !selectedStroke.closed && strokes.filter(s => s.id !== selectedStrokeId && !s.closed).length > 0 && (
            <span className="text-xs text-text-dim-5 py-1">끝점을 다른 획 끝점 근처로 이동하면 합치기 가능</span>
          )}
          {onDeleteStroke && strokes.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-600 text-red-400 hover:bg-red-900/30"
              onClick={() => {
                onDeleteStroke(selectedStroke.id)
                const remaining = strokes.filter(s => s.id !== selectedStroke.id)
                if (remaining.length > 0) setSelectedStrokeId(remaining[0].id)
              }}
            >
              획 삭제
            </Button>
          )}
          {onAddStroke && (
            <Button
              variant="outline"
              size="sm"
              className="border-blue-600 text-blue-400 hover:bg-blue-900/30"
              onClick={onAddStroke}
            >
              + 획 추가
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* 포인트 목록 */}
      <h3 className="text-xs text-muted block">Points ({selectedStroke.points.length})</h3>
      <Card>
        <CardContent className="p-2">
          <div className="flex flex-wrap gap-1">
            {selectedStroke.points.map((pt, i) => (
              <button
                key={i}
                className={cn(
                  'py-1.5 px-3 bg-[#0f0f0f] text-[#e5e5e5] border border-border-lighter rounded text-xs cursor-pointer transition-all duration-150 ease-in-out',
                  'hover:bg-surface-3 hover:border-[#444]',
                  i === selectedPointIndex && 'bg-accent-cyan border-accent-cyan text-black font-semibold',
                  (pt.handleIn || pt.handleOut) && i !== selectedPointIndex && 'border-[#4ecdc4] text-[#4ecdc4]'
                )}
                onClick={() => setSelectedPointIndex(i)}
              >
                {(pt.handleIn || pt.handleOut) ? '~' : ''}{i}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 선택된 포인트 액션 */}
      {selectedPoint && (
        <div className="flex gap-2">
          {onToggleCurve && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleCurve(selectedStroke.id, selectedPointIndex!)}
            >
              {hasCurve ? '직선화' : '곡선화'}
            </Button>
          )}
          {onSplitStroke && canSplit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSplitStroke(selectedStroke.id, selectedPointIndex!)}
            >
              여기서 분리
            </Button>
          )}
          {onOpenAtPoint && selectedStroke.closed && (
            <Button
              variant="outline"
              size="sm"
              className="border-orange-600 text-orange-400 hover:bg-orange-900/30"
              onClick={() => onOpenAtPoint(selectedStroke.id, selectedPointIndex!)}
            >
              여기서 끊기
            </Button>
          )}
          {onDeletePoint && selectedStroke.points.length > 2 && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-600 text-red-400 hover:bg-red-900/30"
              onClick={() => {
                onDeletePoint(selectedStroke.id, selectedPointIndex!)
                const newLen = selectedStroke.points.length - 1
                if (selectedPointIndex! >= newLen) setSelectedPointIndex(newLen - 1)
              }}
            >
              점 삭제
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
