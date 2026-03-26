import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2, StrokeLinecap } from '../../types'
import { MERGE_PROXIMITY } from '../../utils/snapUtils'
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

const LINECAP_OPTIONS: Array<{ value: string; svgLinecap: 'round' | 'butt' | 'square'; title: string }> = [
  { value: 'default', svgLinecap: 'round', title: '기본' },
  { value: 'round', svgLinecap: 'round', title: '둥근' },
  { value: 'butt', svgLinecap: 'butt', title: '평평' },
  { value: 'square', svgLinecap: 'square', title: '사각' },
]

interface FloatingStrokeToolbarProps {
  strokes: StrokeDataV2[]
  onChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onMergeStrokes?: (strokeIdA: string, strokeIdB: string) => void
  onDeleteStroke?: (strokeId: string) => void
  onAddStroke?: () => void
  onToggleCurve?: (strokeId: string, pointIndex: number) => void
  onSplitStroke?: (strokeId: string, pointIndex: number) => void
  onOpenAtPoint?: (strokeId: string, pointIndex: number) => void
  onDeletePoint?: (strokeId: string, pointIndex: number) => void
}

/** 플로팅 획 편집 툴바 — 캔버스 하단 중앙에 표시 */
export function FloatingStrokeToolbar({
  strokes,
  onChange,
  onMergeStrokes,
  onDeleteStroke,
  onAddStroke,
  onToggleCurve,
  onSplitStroke,
  onOpenAtPoint,
  onDeletePoint,
}: FloatingStrokeToolbarProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex, setSelectedStrokeId } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  if (!selectedStroke) return null

  const mergeTargets = !selectedStroke.closed
    ? strokes
        .filter(s => s.id !== selectedStrokeId && !s.closed)
        .map(s => ({ stroke: s, dist: minEndpointDistance(selectedStroke, s) }))
        .filter(t => t.dist <= MERGE_PROXIMITY)
        .sort((a, b) => a.dist - b.dist)
    : []

  const currentWeight = Math.round(thicknessToWeight(selectedStroke.thickness) / 100) * 100
  const currentLinecap = selectedStroke.linecap ?? 'default'

  const hasPointSelected = selectedPointIndex !== null && selectedPointIndex < selectedStroke.points.length
  const selectedPoint = hasPointSelected ? selectedStroke.points[selectedPointIndex] : null
  const hasCurve = selectedPoint ? !!(selectedPoint.handleIn || selectedPoint.handleOut) : false
  const canSplit = hasPointSelected && selectedPointIndex > 0 && selectedPointIndex < selectedStroke.points.length - 1 && !selectedStroke.closed
  const canOpen = hasPointSelected && selectedStroke.closed
  const canDeletePoint = hasPointSelected && selectedStroke.points.length > 2

  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-col bg-[#16162a] border border-[#2a2a4a] rounded-xl p-1.5 gap-0.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
      style={{ minWidth: 280 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* 1행: 두께 슬라이더 + 끝처리 토글 */}
      <div className="flex items-center gap-0.5 py-0.5">
        {/* 두께 아이콘 */}
        <button className="flex items-center justify-center h-[30px] w-[30px] rounded-md" style={{ padding: 0 }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#8888aa" strokeWidth="1.5">
            <line x1="2" y1="12" x2="14" y2="4" strokeLinecap="round" />
          </svg>
        </button>
        {/* 슬라이더 */}
        <div className="flex items-center gap-1.5 flex-1 px-0.5">
          <input
            type="range"
            min={100}
            max={900}
            step={100}
            value={currentWeight}
            onChange={(e) => onChange(selectedStroke.id, 'thickness', weightToThickness(Number(e.target.value)))}
            className="flex-1 min-w-[50px] h-[3px] appearance-none bg-[#2a2a4a] rounded-sm outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#a78bfa] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(167,139,250,0.4)]"
          />
          <span className="text-[11px] text-[#a78bfa] min-w-[26px] text-right font-medium tabular-nums">
            {currentWeight}
          </span>
        </div>
        {/* 구분선 */}
        <div className="w-px h-[22px] bg-[#2a2a4a] mx-0.5 shrink-0" />
        {/* 끝처리 토글 */}
        <div className="flex gap-px bg-[#1a1a34] rounded-md p-0.5">
          {LINECAP_OPTIONS.map(({ value, svgLinecap, title }) => (
            <button
              key={value}
              title={title}
              className={`flex items-center justify-center h-[26px] min-w-[30px] px-1.5 rounded border-none text-[10px] cursor-pointer transition-all ${
                currentLinecap === value
                  ? 'bg-[#3d2d7a] text-[#d4c4ff]'
                  : 'bg-transparent text-[#b0b0d0] hover:bg-[#252548] hover:text-white'
              }`}
              onClick={() => onChange(selectedStroke.id, 'linecap', value === 'default' ? undefined : value as StrokeLinecap)}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap={svgLinecap}>
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* 2행: 점 조작 (점 선택 시만) */}
      {hasPointSelected && (
        <>
          <div className="h-px bg-[#2a2a4a] mx-1" />
          <div className="flex items-center gap-0.5 py-0.5">
            {/* 곡선 토글 */}
            {onToggleCurve && (
              <button
                className={`flex items-center justify-center gap-1 h-[30px] px-2 rounded-md border-none text-[11.5px] cursor-pointer transition-all whitespace-nowrap ${
                  hasCurve
                    ? 'bg-[#3b2070] text-[#c084fc]'
                    : 'bg-transparent text-[#b0b0d0] hover:bg-[#252548] hover:text-white'
                }`}
                onClick={() => onToggleCurve(selectedStroke.id, selectedPointIndex!)}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 12 Q 8 2 13 12" />
                </svg>
                곡선
              </button>
            )}
            <div className="w-px h-[22px] bg-[#2a2a4a] mx-0.5 shrink-0" />
            {/* 분리 */}
            {onSplitStroke && (
              <button
                className={`flex items-center justify-center gap-1 h-[30px] px-2 rounded-md border-none text-[11.5px] cursor-pointer transition-all whitespace-nowrap ${
                  canSplit
                    ? 'bg-transparent text-[#b0b0d0] hover:bg-[#252548] hover:text-white'
                    : 'opacity-30 pointer-events-none bg-transparent text-[#b0b0d0]'
                }`}
                onClick={() => canSplit && onSplitStroke(selectedStroke.id, selectedPointIndex!)}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 8h5M9 8h5" /><circle cx="8" cy="8" r="1.5" fill="currentColor" />
                </svg>
                분리
              </button>
            )}
            {/* 끊기 */}
            {onOpenAtPoint && (
              <button
                className={`flex items-center justify-center gap-1 h-[30px] px-2 rounded-md border-none text-[11.5px] cursor-pointer transition-all whitespace-nowrap ${
                  canOpen
                    ? 'bg-transparent text-[#b0b0d0] hover:bg-[#252548] hover:text-white'
                    : 'opacity-30 pointer-events-none bg-transparent text-[#b0b0d0]'
                }`}
                onClick={() => canOpen && onOpenAtPoint(selectedStroke.id, selectedPointIndex!)}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 4v8M13 4v8" /><path d="M6 8h4" strokeDasharray="2 1" />
                </svg>
                끊기
              </button>
            )}
            <div className="flex-1" />
            <div className="w-px h-[22px] bg-[#2a2a4a] mx-0.5 shrink-0" />
            {/* 점 삭제 */}
            {onDeletePoint && (
              <button
                className={`flex items-center justify-center h-[30px] min-w-[30px] px-2 rounded-md border-none cursor-pointer transition-all ${
                  canDeletePoint
                    ? 'text-[#f87171] hover:bg-[#2e1515]'
                    : 'opacity-30 pointer-events-none text-[#f87171]'
                }`}
                onClick={() => {
                  if (!canDeletePoint) return
                  onDeletePoint(selectedStroke.id, selectedPointIndex!)
                  const newLen = selectedStroke.points.length - 1
                  if (selectedPointIndex! >= newLen) setSelectedPointIndex(newLen - 1)
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="4" /><path d="M6 6l4 4M10 6l-4 4" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}

      {/* 3행: 획 추가/삭제 + 병합 */}
      <div className="h-px bg-[#2a2a4a] mx-1" />
      <div className="flex items-center gap-0.5 py-0.5">
        {/* 획 추가 */}
        {onAddStroke && (
          <button
            className="flex items-center justify-center gap-1 h-[30px] px-2 rounded-md border-none text-[11.5px] cursor-pointer transition-all whitespace-nowrap text-[#4ecdc4] hover:bg-[#152e2b]"
            onClick={onAddStroke}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" />
            </svg>
            추가
          </button>
        )}
        {/* 병합 버튼들 */}
        {onMergeStrokes && mergeTargets.length > 0 && mergeTargets.map(({ stroke: target }) => (
          <button
            key={target.id}
            className="flex items-center justify-center gap-1 h-[30px] px-2 rounded-md border-none text-[11.5px] cursor-pointer transition-all whitespace-nowrap text-green-400 hover:bg-green-900/30"
            onClick={() => {
              onMergeStrokes(selectedStroke.id, target.id)
              setSelectedStrokeId(selectedStroke.id)
            }}
          >
            +{target.id.slice(0, 4)}
          </button>
        ))}
        <div className="flex-1" />
        <div className="w-px h-[22px] bg-[#2a2a4a] mx-0.5 shrink-0" />
        {/* 획 삭제 */}
        {onDeleteStroke && strokes.length > 1 && (
          <button
            className="flex items-center justify-center gap-1 h-[30px] px-2 rounded-md border-none text-[11.5px] cursor-pointer transition-all whitespace-nowrap text-[#f87171] hover:bg-[#2e1515]"
            onClick={() => {
              onDeleteStroke(selectedStroke.id)
              const remaining = strokes.filter(s => s.id !== selectedStroke.id)
              if (remaining.length > 0) setSelectedStrokeId(remaining[0].id)
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 5h10M6 5V4a1 1 0 011-1h2a1 1 0 011 1v1M5 5v7a1 1 0 001 1h4a1 1 0 001-1V5" />
            </svg>
            삭제
          </button>
        )}
      </div>
    </div>
  )
}
