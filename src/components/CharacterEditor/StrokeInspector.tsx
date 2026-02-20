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

/** thickness → weight(100~900) 변환 (weightToMultiplier의 역함수, BASE_THICKNESS 기준) */
function thicknessToWeight(thickness: number): number {
  const multiplier = thickness / BASE_THICKNESS
  // weightToMultiplier 역변환: 0.4→100, 1.0→400, 2.2→900
  if (multiplier <= 1.0) {
    return 100 + ((multiplier - 0.4) / 0.6) * 300
  }
  return 400 + ((multiplier - 1.0) / 1.2) * 500
}

/** weight(100~900) → thickness 변환 (weightToMultiplier × BASE_THICKNESS) */
function weightToThickness(weight: number): number {
  return weightToMultiplier(weight) * BASE_THICKNESS
}

/** 두께 슬라이더 마크 */
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

type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeInspectorProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | undefined) => void
  onPointChange?: PointChangeHandler
  onMergeStrokes?: (strokeIdA: string, strokeIdB: string) => void
  onSplitStroke?: (strokeId: string, pointIndex: number) => void
  onToggleCurve?: (strokeId: string, pointIndex: number) => void
}

export function StrokeInspector({ strokes, onChange, onPointChange, onMergeStrokes, onSplitStroke, onToggleCurve }: StrokeInspectorProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex, setSelectedStrokeId } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  // 합치기 대상 후보: 끝점이 가까운 열린 획만
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

  const inputClass = 'p-2 bg-[#0f0f0f] border border-border-lighter rounded text-sm text-[#e5e5e5] font-mono transition-all duration-150 ease-in-out hover:border-[#444] focus:outline-none focus:border-primary focus:bg-surface-2'

  return (
    <div className="flex flex-col gap-3">
      {/* <h3 className="text-xs text-muted block mb-3">Stroke: {selectedStroke.id}</h3> */}

      {/* 공통 속성: 두께 */}
      <div className="p-4 bg-surface-2 rounded-md border border-border">
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
      </div>

      {/* 끝 모양 (Linecap) 오버라이드 */}
      <div className="p-4 bg-surface-2 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label className="text-[0.7rem] text-muted uppercase tracking-wider">Linecap (끝 모양)</label>
          <div className="flex gap-1">
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
                    'flex-1 py-1.5 px-2 rounded border text-xs transition-colors',
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
      </div>

      {/* 획 편집 액션 버튼 */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs text-muted block">획 편집</h3>
        <div className="flex flex-wrap gap-2">
          {/* 합치기: 끝점이 가까운 획과 합침 */}
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
        </div>
      </div>

      {/* 포인트 목록 */}
      <h3 className="text-xs text-muted block mb-3">Points ({selectedStroke.points.length})</h3>
      <div className="flex flex-wrap gap-1 p-2 bg-surface-2 rounded-md border border-border">
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
        </div>
      )}

      {/* 선택된 포인트 속성 */}
      {selectedPoint && onPointChange && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs text-muted block mb-3">Point {selectedPointIndex}</h3>
          <div className="flex flex-col gap-3 p-4 bg-surface-2 rounded-md border border-border">
            <div className="flex flex-col gap-1">
              <label className="text-[0.7rem] text-muted uppercase tracking-wider">Point X</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={selectedPoint.x.toFixed(4)}
                onChange={(e) => onPointChange(selectedStroke.id, selectedPointIndex!, 'x', parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.7rem] text-muted uppercase tracking-wider">Point Y</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={selectedPoint.y.toFixed(4)}
                onChange={(e) => onPointChange(selectedStroke.id, selectedPointIndex!, 'y', parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Handle In */}
          {selectedPoint.handleIn && (
            <div className="flex flex-col gap-1 p-2 bg-[#151515] rounded border border-border">
              <span className="text-[0.7rem] text-muted uppercase">Handle In</span>
              <div className="flex flex-col gap-3 p-4 bg-surface-2 rounded-md border border-border">
                <div className="flex flex-col gap-1">
                  <label className="text-[0.7rem] text-muted uppercase tracking-wider">X</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedPoint.handleIn.x.toFixed(4)}
                    onChange={(e) => onPointChange(
                      selectedStroke.id, selectedPointIndex!, 'handleIn',
                      { x: parseFloat(e.target.value) || 0, y: selectedPoint.handleIn!.y }
                    )}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[0.7rem] text-muted uppercase tracking-wider">Y</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedPoint.handleIn.y.toFixed(4)}
                    onChange={(e) => onPointChange(
                      selectedStroke.id, selectedPointIndex!, 'handleIn',
                      { x: selectedPoint.handleIn!.x, y: parseFloat(e.target.value) || 0 }
                    )}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Handle Out */}
          {selectedPoint.handleOut && (
            <div className="flex flex-col gap-1 p-2 bg-[#151515] rounded border border-border">
              <span className="text-[0.7rem] text-muted uppercase">Handle Out</span>
              <div className="flex flex-col gap-3 p-4 bg-surface-2 rounded-md border border-border">
                <div className="flex flex-col gap-1">
                  <label className="text-[0.7rem] text-muted uppercase tracking-wider">X</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedPoint.handleOut.x.toFixed(4)}
                    onChange={(e) => onPointChange(
                      selectedStroke.id, selectedPointIndex!, 'handleOut',
                      { x: parseFloat(e.target.value) || 0, y: selectedPoint.handleOut!.y }
                    )}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[0.7rem] text-muted uppercase tracking-wider">Y</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedPoint.handleOut.y.toFixed(4)}
                    onChange={(e) => onPointChange(
                      selectedStroke.id, selectedPointIndex!, 'handleOut',
                      { x: selectedPoint.handleOut!.x, y: parseFloat(e.target.value) || 0 }
                    )}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
