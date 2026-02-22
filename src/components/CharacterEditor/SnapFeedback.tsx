import type { SnapResult } from '../../utils/snapUtils'

// === 타입 정의 ===

export interface MergeHintPositions {
  source: { x: number; y: number }
  target: { x: number; y: number }
}

export interface SnapFeedbackProps {
  snapFeedback: SnapResult | null
  dragContainerAbs: { x: number; y: number; width: number; height: number } | null
  mergeHintPositions: MergeHintPositions | null
}

// === 컴포넌트 ===

/**
 * SnapFeedback: 스냅 가이드라인 + 병합 힌트 시각적 피드백
 *
 * StrokeOverlay의 <g> 내에 렌더링되는 SVG 프래그먼트
 */
export function SnapFeedback({ snapFeedback, dragContainerAbs, mergeHintPositions }: SnapFeedbackProps) {
  if (!snapFeedback && !mergeHintPositions) return null

  return (
    <>
      {/* === 스냅 시각적 피드백 === */}
      {snapFeedback && dragContainerAbs && (
        <g pointerEvents="none">
          {snapFeedback.guideLines.map((guide, i) => {
            const isGrid = guide.type === 'grid'
            const color = isGrid ? '#4ecdc4' : '#ff9500'
            const dashArray = isGrid ? '2,2' : 'none'
            const opacity = isGrid ? 0.6 : 0.8

            if (guide.axis === 'x') {
              const absX = dragContainerAbs.x + guide.value * dragContainerAbs.width
              return (
                <line key={`guide-${i}`}
                  x1={absX} y1={dragContainerAbs.y - 5}
                  x2={absX} y2={dragContainerAbs.y + dragContainerAbs.height + 5}
                  stroke={color} strokeWidth={0.4} strokeDasharray={dashArray} opacity={opacity}
                />
              )
            } else {
              const absY = dragContainerAbs.y + guide.value * dragContainerAbs.height
              return (
                <line key={`guide-${i}`}
                  x1={dragContainerAbs.x - 5} y1={absY}
                  x2={dragContainerAbs.x + dragContainerAbs.width + 5} y2={absY}
                  stroke={color} strokeWidth={0.4} strokeDasharray={dashArray} opacity={opacity}
                />
              )
            }
          })}
        </g>
      )}

      {/* === 병합 힌트 === */}
      {mergeHintPositions && (
        <g pointerEvents="none">
          {/* 연결 점선 */}
          <line
            x1={mergeHintPositions.source.x} y1={mergeHintPositions.source.y}
            x2={mergeHintPositions.target.x} y2={mergeHintPositions.target.y}
            stroke="#22c55e" strokeWidth={0.5} strokeDasharray="1.5,1.5" opacity={0.8}
          />
          {/* 타겟 끝점 펄스 원 */}
          <circle cx={mergeHintPositions.target.x} cy={mergeHintPositions.target.y} r={3}
            fill="none" stroke="#22c55e" strokeWidth={0.8} opacity={0.9}>
            <animate attributeName="r" values="3;5;3" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" />
          </circle>
          {/* 타겟 끝점 내부 원 */}
          <circle cx={mergeHintPositions.target.x} cy={mergeHintPositions.target.y} r={2}
            fill="#22c55e" opacity={0.6}
          />
        </g>
      )}
    </>
  )
}
