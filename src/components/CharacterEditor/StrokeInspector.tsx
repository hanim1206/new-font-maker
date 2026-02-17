import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2 } from '../../types'
import { cn } from '@/lib/utils'

type PointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeInspectorProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number) => void
  onPointChange?: PointChangeHandler
}

export function StrokeInspector({ strokes, onChange, onPointChange }: StrokeInspectorProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

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

  const inputClass = 'p-2 bg-[#0f0f0f] border border-border-lighter rounded text-sm text-[#e5e5e5] font-mono transition-all duration-150 ease-in-out hover:border-[#444] focus:outline-none focus:border-primary focus:bg-surface-2'

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs text-muted block mb-3">Stroke: {selectedStroke.id}</h3>

      {/* 공통 속성: 두께 + 라벨 */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-surface-2 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label className="text-[0.7rem] text-muted uppercase tracking-wider">Thickness (두께)</label>
          <input
            type="number" min="0.01" max="0.5" step="0.005"
            value={selectedStroke.thickness.toFixed(3)}
            onChange={(e) => onChange(selectedStroke.id, 'thickness', parseFloat(e.target.value) || 0.01)}
            className={inputClass}
          />
        </div>
        <div className="p-2 bg-[#0f0f0f] rounded border border-border-lighter flex flex-col justify-center">
          <span className="text-[0.65rem] text-muted uppercase">Type: </span>
          <span className="text-xs text-[#e5e5e5] font-mono">
            {selectedStroke.label || (selectedStroke.closed ? '닫힌 도형' : `직선 (${selectedStroke.points.length}pt)`)}
          </span>
        </div>
      </div>

      {/* 포인트 목록 */}
      <h3 className="text-xs text-muted block mb-3">Points ({selectedStroke.points.length})</h3>
      <div className="flex flex-wrap gap-1 p-2 bg-surface-2 rounded-md border border-border">
        {selectedStroke.points.map((_, i) => (
          <button
            key={i}
            className={cn(
              'py-1.5 px-3 bg-[#0f0f0f] text-[#e5e5e5] border border-border-lighter rounded text-xs cursor-pointer transition-all duration-150 ease-in-out',
              'hover:bg-surface-3 hover:border-[#444]',
              i === selectedPointIndex && 'bg-accent-cyan border-accent-cyan text-black font-semibold'
            )}
            onClick={() => setSelectedPointIndex(i)}
          >
            Point {i}
          </button>
        ))}
      </div>

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
