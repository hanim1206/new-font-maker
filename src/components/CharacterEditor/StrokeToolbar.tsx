import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, StrokeLinecap } from '../../types'
import { MERGE_PROXIMITY } from '../../utils/snapUtils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { SliderMark } from '@/components/ui/slider'
import { weightToMultiplier } from '../../stores/globalStyleStore'

/** 기본 획 두께 (baseJamos.json 기본값) */
const BASE_THICKNESS = 0.07

/** thickness → weight(100~900) 변환 */
function thicknessToWeight(thickness: number): number {
  const multiplier = thickness / BASE_THICKNESS
  if (multiplier <= 1.0) {
    return 100 + ((multiplier - 0.4) / 0.6) * 300
  }
  return 400 + ((multiplier - 1.0) / 1.2) * 500
}

/** weight(100~900) → thickness 변환 */
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

/** 두 획의 가장 가까운 끝점 간 거리 */
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

interface StrokeToolbarProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onMergeStrokes?: (strokeIdA: string, strokeIdB: string) => void
  onDeleteStroke?: (strokeId: string) => void
  onAddStroke?: () => void
}

/** 캔버스 하단 인라인 툴바: 두께, Linecap, 포인트 목록, 획 액션 */
export function StrokeToolbar({ strokes, onChange, onMergeStrokes, onDeleteStroke, onAddStroke }: StrokeToolbarProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex, setSelectedStrokeId } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  if (!selectedStroke) return null

  // 합치기 대상 후보
  const mergeTargets = selectedStroke && !selectedStroke.closed
    ? strokes
        .filter(s => s.id !== selectedStrokeId && !s.closed)
        .map(s => ({ stroke: s, dist: minEndpointDistance(selectedStroke, s) }))
        .filter(t => t.dist <= MERGE_PROXIMITY)
        .sort((a, b) => a.dist - b.dist)
    : []

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-2 border-b border-border-subtle">
      {/* 두께 + Linecap 한 줄 */}
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
        <div className="flex gap-1 flex-1">
          {([
            { value: undefined as StrokeLinecap | undefined, label: '기본' },
            { value: 'round' as StrokeLinecap, label: '둥근' },
            { value: 'butt' as StrokeLinecap, label: '평평' },
            { value: 'square' as StrokeLinecap, label: '사각' },
          ]).map(({ value, label }) => {
            const isActive = selectedStroke.linecap === value
            return (
              <button
                key={label}
                className={cn(
                  'flex-1 py-1 px-1.5 rounded border text-[0.65rem] transition-colors',
                  isActive
                    ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan font-semibold'
                    : 'border-border-lighter text-text-dim-4 hover:border-[#444]'
                )}
                onClick={() => onChange(selectedStroke.id, 'linecap', value)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

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
          {/* 합치기 */}
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
