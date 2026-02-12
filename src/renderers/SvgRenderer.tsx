import { useMemo } from 'react'
import type { DecomposedSyllable, BoxConfig, Part, StrokeData, LayoutType, LayoutSchema } from '../types'
import { isPathStroke } from '../types'
import { calculateBoxes } from '../utils/layoutCalculator'
import { pathDataToSvgD } from '../utils/pathUtils'

interface SvgRendererProps {
  syllable: DecomposedSyllable
  // boxes 또는 schema 중 하나 사용 (schema 우선)
  boxes?: Partial<Record<Part, BoxConfig>>
  schema?: LayoutSchema
  size?: number
  fillColor?: string
  backgroundColor?: string
  showDebugBoxes?: boolean
  // 시각적 캔버스 비율 (논리 좌표계는 1:1 유지, 시각적으로만 세로 확장)
  // 1.0 = 1:1, 1.1 = 1:1.1, 1.15 = 1:1.15
  visualHeightRatio?: number
}

// SVG viewBox 기준 크기
const VIEW_BOX_SIZE = 100

// 획 두께 (VIEW_BOX_SIZE 기준, 고정값)
const STROKE_THICKNESS = 5

// 레이아웃 타입에 따라 렌더링 순서 결정
function getRenderOrder(layoutType: LayoutType): Array<'CH' | 'JU' | 'JU_H' | 'JU_V' | 'JO'> {
  // 혼합중성+종성: JU_H(가로획)를 먼저, JO(종성), 그다음 JU_V(세로획)
  if (layoutType === 'choseong-jungseong-mixed-jongseong') {
    return ['CH', 'JU_H', 'JO', 'JU_V']
  }

  // 혼합중성 (종성 없음): JU_H, JU_V 순서
  if (layoutType === 'choseong-jungseong-mixed') {
    return ['CH', 'JU_H', 'JU_V']
  }

  // 혼합중성 단독: JU_H, JU_V 순서
  if (layoutType === 'jungseong-mixed-only') {
    return ['JU_H', 'JU_V']
  }

  // 기본 순서 (JU_H, JU_V가 없으면 무시됨)
  return ['CH', 'JU', 'JO']
}

export function SvgRenderer({
  syllable,
  boxes: boxesProp,
  schema,
  size = 100,
  fillColor = '#1a1a1a',
  backgroundColor = 'transparent',
  showDebugBoxes = false,
  visualHeightRatio = 1.1, // 기본값: 1:1.1 비율
}: SvgRendererProps) {
  // schema가 있으면 calculateBoxes 사용, 없으면 boxes prop 사용
  const boxes = useMemo(() => {
    if (schema) {
      return calculateBoxes(schema) as Record<Part, BoxConfig>
    }
    return (boxesProp || {}) as Record<Part, BoxConfig>
  }, [schema, boxesProp])

  const renderStrokes = (
    strokes: StrokeData[] | undefined,
    box: BoxConfig,
    color: string
  ) => {
    if (!strokes || strokes.length === 0) return null
    return strokes.map((stroke) => {
      // 박스 내 상대 좌표를 절대 좌표로 변환
      const baseX = (box.x + stroke.x * box.width) * VIEW_BOX_SIZE
      const baseY = (box.y + stroke.y * box.height) * VIEW_BOX_SIZE

      // === PATH 스트로크 (곡선) ===
      if (isPathStroke(stroke)) {
        const pathWidth = stroke.width * box.width * VIEW_BOX_SIZE
        const pathHeight = stroke.height * box.height * VIEW_BOX_SIZE
        const d = pathDataToSvgD(stroke.pathData, baseX, baseY, pathWidth, pathHeight)
        return (
          <path
            key={stroke.id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_THICKNESS}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      }

      // === RECT 스트로크 (기존 직선) ===
      // 방향에 따라 두께 고정: 가로획은 height 고정, 세로획은 width 고정
      let width: number
      let height: number

      if (stroke.direction === 'horizontal') {
        // 가로획: height를 고정값으로, width는 박스 크기에 비례
        width = stroke.width * box.width * VIEW_BOX_SIZE
        height = STROKE_THICKNESS
      } else {
        // 세로획: width를 고정값으로, height는 박스 크기에 비례
        width = STROKE_THICKNESS
        height = stroke.height * box.height * VIEW_BOX_SIZE
      }

      return (
        <rect
          key={stroke.id}
          x={baseX}
          y={baseY}
          width={width}
          height={height}
          fill={color}
          rx={1}
          ry={1}
        />
      )
    })
  }

  const renderDebugBox = (box: BoxConfig, color: string, label: string) => {
    if (!showDebugBoxes) return null
    return (
      <g key={`debug-${label}`}>
        <rect
          x={box.x * VIEW_BOX_SIZE}
          y={box.y * VIEW_BOX_SIZE}
          width={box.width * VIEW_BOX_SIZE}
          height={box.height * VIEW_BOX_SIZE}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          strokeDasharray="2,2"
        />
        <text
          x={(box.x + 0.02) * VIEW_BOX_SIZE}
          y={(box.y + 0.08) * VIEW_BOX_SIZE}
          fontSize={6}
          fill={color}
        >
          {label}
        </text>
      </g>
    )
  }

  // 부분별 렌더링 헬퍼
  const renderPart = (part: 'CH' | 'JU' | 'JU_H' | 'JU_V' | 'JO') => {
    // 혼합중성의 경우 JU_H와 JU_V로 분리 렌더링
    if (part === 'JU_H' && syllable.jungseong) {
      const box = boxes.JU_H
      if (!box) return null
      // horizontalStrokes가 있으면 사용, 없으면 전체 strokes 사용
      const strokes = syllable.jungseong.horizontalStrokes || syllable.jungseong.strokes
      if (!strokes || strokes.length === 0) return null
      return (
        <g key={part}>
          {renderStrokes(strokes, box, fillColor)}
        </g>
      )
    }

    if (part === 'JU_V' && syllable.jungseong) {
      const box = boxes.JU_V
      if (!box) return null
      // verticalStrokes가 있으면 사용, 없으면 전체 strokes 사용
      const strokes = syllable.jungseong.verticalStrokes || syllable.jungseong.strokes
      if (!strokes || strokes.length === 0) return null
      return (
        <g key={part}>
          {renderStrokes(strokes, box, fillColor)}
        </g>
      )
    }

    const partMap = {
      CH: { jamo: syllable.choseong, box: boxes.CH },
      JU: { jamo: syllable.jungseong, box: boxes.JU },
      JO: { jamo: syllable.jongseong, box: boxes.JO },
    }

    const { jamo, box } = partMap[part as 'CH' | 'JU' | 'JO']
    if (!jamo || !box) return null

    // strokes가 없으면 verticalStrokes나 horizontalStrokes 확인
    let strokes = jamo.strokes
    if (!strokes || strokes.length === 0) {
      // verticalStrokes와 horizontalStrokes를 합쳐서 사용
      const verticalStrokes = jamo.verticalStrokes || []
      const horizontalStrokes = jamo.horizontalStrokes || []
      strokes = [...verticalStrokes, ...horizontalStrokes]
    }
    if (!strokes || strokes.length === 0) return null

    return (
      <g key={part}>
        {renderStrokes(strokes, box, fillColor)}
      </g>
    )
  }

  // 렌더링 순서 결정
  const renderOrder = getRenderOrder(syllable.layoutType)

  // 디버그 박스 색상 매핑
  const debugBoxColors: Record<string, string> = {
    CH: '#ff6b6b',
    JU: '#4ecdc4',
    JU_H: '#ff9500',
    JU_V: '#ffd700',
    JO: '#4169e1',
  }

  // 실제 사용되는 박스만 디버그 박스로 표시
  const getDebugBoxes = () => {
    if (!showDebugBoxes) return []
    return renderOrder
      .filter((part) => {
        // 각 part에 대해 실제로 박스가 있고 사용 가능한지 확인
        if (part === 'CH') return boxes.CH && syllable.choseong
        if (part === 'JU') return boxes.JU && syllable.jungseong
        if (part === 'JU_H') return boxes.JU_H && syllable.jungseong
        if (part === 'JU_V') return boxes.JU_V && syllable.jungseong
        if (part === 'JO') return boxes.JO && syllable.jongseong
        return false
      })
      .map((part) => {
        const box = boxes[part as keyof typeof boxes]
        const color = debugBoxColors[part]
        return { part, box, color }
      })
  }

  // 시각적 캔버스 크기 계산 (논리 좌표계는 VIEW_BOX_SIZE x VIEW_BOX_SIZE 유지)
  const visualHeight = VIEW_BOX_SIZE * visualHeightRatio
  const svgHeight = size * visualHeightRatio

  return (
    <svg
      width={size}
      height={svgHeight}
      viewBox={`0 0 ${VIEW_BOX_SIZE} ${visualHeight}`}
      style={{ backgroundColor }}
    >
      {/* 디버그 박스 - 실제 사용되는 박스만 표시 */}
      {showDebugBoxes &&
        getDebugBoxes().map(({ part, box, color }) =>
          box ? renderDebugBox(box, color, part) : null
        )}

      {/* 동적 순서로 렌더링 */}
      {renderOrder.map((part) => renderPart(part))}
    </svg>
  )
}

