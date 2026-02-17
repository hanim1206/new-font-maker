import { useUIStore } from '../../stores/uiStore'
import type { StrokeData } from '../../types'
import { isPathStroke, isRectStroke } from '../../types'
import { cn } from '@/lib/utils'

type PathPointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeInspectorProps {
  strokes: StrokeData[]
  onChange: (strokeId: string, prop: string, value: number) => void
  onPathPointChange?: PathPointChangeHandler
}

export function StrokeInspector({ strokes, onChange, onPathPointChange }: StrokeInspectorProps) {
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

  const isPath = isPathStroke(selectedStroke)
  const selectedPoint = isPath && selectedPointIndex !== null
    ? selectedStroke.pathData.points[selectedPointIndex]
    : null

  const inputClass = 'p-2 bg-[#0f0f0f] border border-border-lighter rounded text-sm text-[#e5e5e5] font-mono transition-all duration-150 ease-in-out hover:border-[#444] focus:outline-none focus:border-primary focus:bg-surface-2'

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs text-muted block mb-3">Stroke: {selectedStroke.id}</h3>

      {/* 속성 입력 — rect와 path 분리 */}
      {isRectStroke(selectedStroke) ? (
        <div className="flex flex-col gap-3 p-4 bg-surface-2 rounded-md border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">X (중심)</label>
            <input
              type="number" min="0" max="1" step="0.01"
              value={selectedStroke.x.toFixed(3)}
              onChange={(e) => onChange(selectedStroke.id, 'x', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Y (중심)</label>
            <input
              type="number" min="0" max="1" step="0.01"
              value={selectedStroke.y.toFixed(3)}
              onChange={(e) => onChange(selectedStroke.id, 'y', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Width (길이)</label>
            <input
              type="number" min="0.01" max="1" step="0.01"
              value={selectedStroke.width.toFixed(3)}
              onChange={(e) => onChange(selectedStroke.id, 'width', parseFloat(e.target.value) || 0.01)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Thickness (두께)</label>
            <input
              type="number" min="0.01" max="0.5" step="0.005"
              value={selectedStroke.thickness.toFixed(3)}
              onChange={(e) => onChange(selectedStroke.id, 'thickness', parseFloat(e.target.value) || 0.01)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Angle (각도)</label>
            <input
              type="number" min="0" max="360" step="1"
              value={selectedStroke.angle}
              onChange={(e) => onChange(selectedStroke.id, 'angle', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div className="p-2 bg-[#0f0f0f] rounded border border-border-lighter">
            <span className="text-[0.65rem] text-muted uppercase">Direction: </span>
            <span className="text-xs text-[#e5e5e5] font-mono">
              {selectedStroke.direction === 'horizontal' ? '가로' : '세로'}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4 bg-surface-2 rounded-md border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">X</label>
            <input
              type="number" min="0" max="1" step="0.01"
              value={selectedStroke.x.toFixed(2)}
              onChange={(e) => onChange(selectedStroke.id, 'x', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Y</label>
            <input
              type="number" min="0" max="1" step="0.01"
              value={selectedStroke.y.toFixed(2)}
              onChange={(e) => onChange(selectedStroke.id, 'y', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Width</label>
            <input
              type="number" min="0.01" max="1" step="0.01"
              value={selectedStroke.width.toFixed(2)}
              onChange={(e) => onChange(selectedStroke.id, 'width', parseFloat(e.target.value) || 0.01)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Height</label>
            <input
              type="number" min="0.01" max="1" step="0.01"
              value={selectedStroke.height.toFixed(2)}
              onChange={(e) => onChange(selectedStroke.id, 'height', parseFloat(e.target.value) || 0.01)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.7rem] text-muted uppercase tracking-wider">Thickness (두께)</label>
            <input
              type="number" min="0.01" max="0.5" step="0.005"
              value={selectedStroke.thickness.toFixed(3)}
              onChange={(e) => onChange(selectedStroke.id, 'thickness', parseFloat(e.target.value) || 0.01)}
              className={inputClass}
            />
          </div>
          <div className="p-2 bg-[#0f0f0f] rounded border border-border-lighter">
            <span className="text-[0.65rem] text-muted uppercase">Type: </span>
            <span className="text-xs text-[#e5e5e5] font-mono">패스 (Path)</span>
          </div>
        </div>
      )}

      {/* 패스 포인트 편집 UI */}
      {isPath && (
        <>
          {/* 포인트 목록 */}
          <h3 className="text-xs text-muted block mb-3">Path Points</h3>
          <div className="flex flex-wrap gap-1 p-2 bg-surface-2 rounded-md border border-border">
            {selectedStroke.pathData.points.map((_, i) => (
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
          {selectedPoint && onPathPointChange && (
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
                    onChange={(e) => onPathPointChange(selectedStroke.id, selectedPointIndex!, 'x', parseFloat(e.target.value) || 0)}
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
                    onChange={(e) => onPathPointChange(selectedStroke.id, selectedPointIndex!, 'y', parseFloat(e.target.value) || 0)}
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
                        onChange={(e) => onPathPointChange(
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
                        onChange={(e) => onPathPointChange(
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
                        onChange={(e) => onPathPointChange(
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
                        onChange={(e) => onPathPointChange(
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
        </>
      )}
    </div>
  )
}
