import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, StrokeLinecap } from '../../types'
import { MERGE_PROXIMITY } from '../../utils/snapUtils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
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

interface StrokeToolbarProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onMergeStrokes?: (strokeIdA: string, strokeIdB: string) => void
  onDeleteStroke?: (strokeId: string) => void
  onAddStroke?: () => void
}

export function StrokeToolbar({ strokes, onChange, onMergeStrokes, onDeleteStroke, onAddStroke }: StrokeToolbarProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex, setSelectedStrokeId } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  if (!selectedStroke) return null

  const mergeTargets = selectedStroke && !selectedStroke.closed
    ? strokes
        .filter(s => s.id !== selectedStrokeId && !s.closed)
        .map(s => ({ stroke: s, dist: minEndpointDistance(selectedStroke, s) }))
        .filter(t => t.dist <= MERGE_PROXIMITY)
        .sort((a, b) => a.dist - b.dist)
    : []

  const currentLinecap = selectedStroke.linecap ?? 'default'

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-2 border-b border-border-subtle">
      {/* 두께 */}
      <div className="flex items-center gap-3">
        <label className="text-[0.65rem] text-muted uppercase tracking-wider shrink-0">두께</label>
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
        <span className="text-[0.65rem] text-text-dim-5 font-mono shrink-0 w-10 text-right">
          {selectedStroke.thickness.toFixed(3)}
        </span>
      </div>

      {/* Linecap */}
      <div className="flex items-center gap-2">
        <label className="text-[0.65rem] text-muted uppercase tracking-wider shrink-0">끝</label>
        <ToggleGroup
          type="single"
          value={currentLinecap}
          onValueChange={(val) => {
            if (!val) return
            onChange(selectedStroke.id, 'linecap', val === 'default' ? undefined : val as StrokeLinecap)
          }}
          className="flex-1"
        >
          {LINECAP_OPTIONS.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              variant="outline"
              size="sm"
              className="flex-1 text-[0.65rem]"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Separator />

      {/* 포인트 목록 + 획 액션 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[0.65rem] text-muted uppercase tracking-wider shrink-0">Pt</span>
        <div className="flex gap-0.5 flex-wrap">
          {selectedStroke.points.map((pt, i) => (
            <button
              key={i}
              className={cn(
                'py-0.5 px-2 bg-[#0f0f0f] text-[#e5e5e5] border border-border-lighter rounded text-[0.65rem] cursor-pointer transition-all',
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

        <div className="flex gap-1 ml-auto">
          {onMergeStrokes && mergeTargets.length > 0 && (
            mergeTargets.map(({ stroke: target }) => (
              <Button
                key={target.id}
                variant="outline"
                size="sm"
                className="h-6 text-[0.65rem] border-green-600 text-green-400 hover:bg-green-900/30"
                onClick={() => {
                  onMergeStrokes(selectedStroke.id, target.id)
                  setSelectedStrokeId(selectedStroke.id)
                }}
              >
                +{target.id}
              </Button>
            ))
          )}
          {onDeleteStroke && strokes.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[0.65rem] border-red-600 text-red-400 hover:bg-red-900/30"
              onClick={() => {
                onDeleteStroke(selectedStroke.id)
                const remaining = strokes.filter(s => s.id !== selectedStroke.id)
                if (remaining.length > 0) setSelectedStrokeId(remaining[0].id)
              }}
            >
              삭제
            </Button>
          )}
          {onAddStroke && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[0.65rem] border-blue-600 text-blue-400 hover:bg-blue-900/30"
              onClick={onAddStroke}
            >
              +획
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
