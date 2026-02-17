import { useMemo, type ReactNode } from 'react'
import type { DecomposedSyllable, BoxConfig, Part, StrokeData, LayoutType, LayoutSchema, Padding } from '../types'
import { isPathStroke } from '../types'
import { calculateBoxes } from '../utils/layoutCalculator'
import { pathDataToSvgD } from '../utils/pathUtils'
import type { GlobalStyle } from '../stores/globalStyleStore'

// 파트별 스타일 (자모 편집 시 비편집 파트 흐리게 표시 등)
export interface PartStyle {
  fillColor?: string
  opacity?: number
  hidden?: boolean  // true이면 해당 파트 렌더링 스킵 (StrokeOverlay가 대신 렌더링)
}

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
  // 글로벌 스타일 (기울기, 두께 등)
  globalStyle?: GlobalStyle
  // 파트별 스타일 오버라이드 (fillColor, opacity)
  partStyles?: Partial<Record<Part, PartStyle>>
  // SVG 안에 추가 렌더링할 children (slant transform 그룹 내부에 배치)
  children?: ReactNode
  // SVG ref 전달
  svgRef?: React.RefObject<SVGSVGElement | null>
}

// SVG viewBox 기준 크기
const VIEW_BOX_SIZE = 100

// 자모 패딩 적용: 박스를 패딩만큼 축소
function applyJamoPadding(box: BoxConfig, padding?: Padding): BoxConfig {
  if (!padding) return box
  return {
    x: box.x + padding.left * box.width,
    y: box.y + padding.top * box.height,
    width: box.width * (1 - padding.left - padding.right),
    height: box.height * (1 - padding.top - padding.bottom),
  }
}

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
  visualHeightRatio = 1.0, // 기본값: 1:1 정사각 비율
  globalStyle,
  partStyles,
  children,
  svgRef,
}: SvgRendererProps) {
  // schema가 있으면 calculateBoxes 사용, 없으면 boxes prop 사용
  const boxes = useMemo(() => {
    if (schema) {
      return calculateBoxes(schema) as Record<Part, BoxConfig>
    }
    return (boxesProp || {}) as Record<Part, BoxConfig>
  }, [schema, boxesProp])

  // 글로벌 스타일 값 (기본값 적용)
  const slant = globalStyle?.slant ?? 0
  const weightMultiplier = globalStyle?.weight ?? 1.0

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
        // 두께는 박스 비율에 영향받지 않는 절대값
        const pathThickness = stroke.thickness * weightMultiplier * VIEW_BOX_SIZE
        const d = pathDataToSvgD(stroke.pathData, baseX, baseY, pathWidth, pathHeight)

        // 닫힌/열린 패스 모두 stroke로 렌더링 (fill 없음)
        return (
          <path
            key={stroke.id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={pathThickness}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      }

      // === RECT 스트로크 (중심좌표 + angle 기반) ===
      // x,y = 중심좌표, width = 길이, thickness = 두께, angle = 회전각
      const cx = (box.x + stroke.x * box.width) * VIEW_BOX_SIZE
      const cy = (box.y + stroke.y * box.height) * VIEW_BOX_SIZE
      const angle = stroke.angle ?? 0
      // 세로획(90°)은 회전 후 rectWidth가 시각적 높이가 되므로 box.height 기준으로 스케일
      const isVertical = angle === 90
      const rectWidth = stroke.width * (isVertical ? box.height : box.width) * VIEW_BOX_SIZE
      // 두께는 박스 비율에 영향받지 않는 절대값
      const rectHeight = stroke.thickness * weightMultiplier * VIEW_BOX_SIZE

      return (
        <rect
          key={stroke.id}
          x={cx - rectWidth / 2}
          y={cy - rectHeight / 2}
          width={rectWidth}
          height={rectHeight}
          transform={angle !== 0 ? `rotate(${angle}, ${cx}, ${cy})` : undefined}
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
    const ps = partStyles?.[part]
    // hidden이면 렌더링 스킵 (StrokeOverlay가 대신 렌더링)
    if (ps?.hidden) return null
    const partColor = ps?.fillColor ?? fillColor
    const partOpacity = ps?.opacity ?? 1

    // 파트별 자모 패딩 참조
    const jamoPadding =
      part === 'CH' ? syllable.choseong?.padding :
      part === 'JO' ? syllable.jongseong?.padding :
      syllable.jungseong?.padding

    // 혼합중성의 경우 JU_H와 JU_V로 분리 렌더링
    if (part === 'JU_H' && syllable.jungseong) {
      const rawBox = boxes.JU_H
      if (!rawBox) return null
      const box = applyJamoPadding(rawBox, jamoPadding)
      // horizontalStrokes가 있으면 사용, 없으면 전체 strokes 사용
      const strokes = syllable.jungseong.horizontalStrokes || syllable.jungseong.strokes
      if (!strokes || strokes.length === 0) return null
      return (
        <g key={part} opacity={partOpacity}>
          {renderStrokes(strokes, box, partColor)}
        </g>
      )
    }

    if (part === 'JU_V' && syllable.jungseong) {
      const rawBox = boxes.JU_V
      if (!rawBox) return null
      const box = applyJamoPadding(rawBox, jamoPadding)
      // verticalStrokes가 있으면 사용, 없으면 전체 strokes 사용
      const strokes = syllable.jungseong.verticalStrokes || syllable.jungseong.strokes
      if (!strokes || strokes.length === 0) return null
      return (
        <g key={part} opacity={partOpacity}>
          {renderStrokes(strokes, box, partColor)}
        </g>
      )
    }

    const partMap = {
      CH: { jamo: syllable.choseong, box: boxes.CH },
      JU: { jamo: syllable.jungseong, box: boxes.JU },
      JO: { jamo: syllable.jongseong, box: boxes.JO },
    }

    const { jamo, box: rawBox } = partMap[part as 'CH' | 'JU' | 'JO']
    if (!jamo || !rawBox) return null
    const box = applyJamoPadding(rawBox, jamoPadding)

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
      <g key={part} opacity={partOpacity}>
        {renderStrokes(strokes, box, partColor)}
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

  // slant(기울기) 변환: 캔버스 중심 기준 skewX
  const centerX = VIEW_BOX_SIZE / 2
  const centerY = visualHeight / 2
  const slantTransform = slant !== 0
    ? `translate(${centerX}, ${centerY}) skewX(${-slant}) translate(${-centerX}, ${-centerY})`
    : undefined

  return (
    <svg
      ref={svgRef}
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

      {/* 글자 전체에 slant 적용 */}
      <g transform={slantTransform}>
        {/* 동적 순서로 렌더링 */}
        {renderOrder.map((part) => renderPart(part))}
        {/* 추가 오버레이 (StrokeOverlay 등) */}
        {children}
      </g>
    </svg>
  )
}
