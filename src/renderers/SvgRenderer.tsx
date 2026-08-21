import { useMemo, useId, type ReactNode } from 'react'
import type { DecomposedSyllable, BoxConfig, Part, StrokeDataV2, LayoutType, LayoutSchema } from '../types'
import { PART_COLORS } from '../constants/editorColors'
import { calculateBoxes } from '../utils/layoutCalculator'
import { pointsToSvgD } from '../utils/pathUtils'
import { weightToMultiplier, resolveLinecap, resolveLinejoin } from '../stores/globalStyleStore'
import type { GlobalStyle } from '../stores/globalStyleStore'
import { getJamoRenderBox } from '../utils/jamoGeometry'
import { resolveSyllableContextualInkSafety } from '../utils/contextualInkSafety'
import { brushInkGroupsToSvgPaths, strokeToBrushInkGroups } from '../services/brushGeometry'

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
  // 정규화 좌표계의 일부 박스만 편집 뷰포트로 표시
  viewportBox?: BoxConfig
  // 글로벌 스타일 (기울기, 두께 등)
  globalStyle?: GlobalStyle
  // 파트별 스타일 오버라이드 (fillColor, opacity)
  partStyles?: Partial<Record<Part, PartStyle>>
  // SVG 안에 추가 렌더링할 children (slant transform 그룹 내부에 배치)
  children?: ReactNode
  // SVG overflow 제어 (기본: 'visible')
  overflow?: 'visible' | 'hidden'
  // 글리프를 viewBox 영역 내로 클리핑 (overflow와 독립적으로 설정 가능)
  // 기본: overflow='hidden'이면 true
  clipGlyphs?: boolean
  // path에 CSS transition 적용 여부 (기본: false)
  enableTransition?: boolean
  // SVG ref 전달
  svgRef?: React.RefObject<SVGSVGElement | null>
  // 추가 className (반응형 크기 조절 등)
  className?: string
}

// SVG viewBox 기준 크기
const VIEW_BOX_SIZE = 100

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
  viewportBox,
  globalStyle,
  partStyles,
  overflow = 'visible',
  clipGlyphs,
  enableTransition = false,
  children,
  svgRef,
  className,
}: SvgRendererProps) {
  // 글리프 클리핑 여부 (명시적 prop 우선, 없으면 overflow='hidden'과 동일)
  const shouldClipGlyphs = clipGlyphs ?? (overflow === 'hidden')
  const clipRawId = useId()
  const clipId = `glyph-clip${clipRawId.replace(/:/g, '')}`

  // schema가 있으면 calculateBoxes 사용 (syllable에서 컨텍스트 자동 추출 → 레이아웃 오버라이드 해석)
  const boxes = useMemo(() => {
    if (schema) {
      const context = {
        cho: syllable.choseong?.char ?? '',
        jung: syllable.jungseong?.char ?? '',
        jong: syllable.jongseong?.char ?? '',
      }
      return calculateBoxes(schema, context) as Record<Part, BoxConfig>
    }
    return (boxesProp || {}) as Record<Part, BoxConfig>
  }, [schema, boxesProp, syllable])
  const renderSyllable = useMemo(
    () => resolveSyllableContextualInkSafety(syllable, boxes).syllable,
    [boxes, syllable],
  )

  // 글로벌 스타일 값 (기본값 적용)
  const slant = globalStyle?.slant ?? 0
  const weightMultiplier = globalStyle ? weightToMultiplier(globalStyle.weight) : 1.0
  // viewportBox는 조판 창의 크기일 뿐 잉크를 다시 맞추는 경계가 아니다.
  // Design Body보다 돌출된 획도 편집기와 같은 형태로 보여야 한다.
  const horizontalInkBounds = { min: 0, max: 1 }

  const renderStrokes = (
    strokes: StrokeDataV2[] | undefined,
    box: BoxConfig,
    color: string
  ) => {
    if (!strokes || strokes.length === 0) return null
    return strokes.map((stroke) => {
      // V2 통합 렌더링: 모든 획을 path로 렌더링
      const d = pointsToSvgD(stroke.points, stroke.closed, box, VIEW_BOX_SIZE)
      if (!d) return null
      const strokeWidth = stroke.thickness * weightMultiplier * VIEW_BOX_SIZE

      if (globalStyle?.brush?.tip && globalStyle.brush.tip !== 'round') {
        const paths = brushInkGroupsToSvgPaths(
          strokeToBrushInkGroups(stroke, box, weightMultiplier, globalStyle.brush),
          VIEW_BOX_SIZE,
        )
        return (
          <g key={stroke.id}>
            {paths.map((path, index) => <path key={`${stroke.id}-brush-${index}`} d={path} fill={color} />)}
          </g>
        )
      }

      return (
        <path
          key={stroke.id}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={resolveLinecap(stroke.linecap, globalStyle?.linecap)}
          strokeLinejoin={resolveLinejoin(stroke.linejoin, globalStyle?.linejoin)}
          style={enableTransition ? { transition: 'd 0.15s ease, stroke-width 0.15s ease' } : undefined}
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
          fill={color}
          fillOpacity={1}
        />
        <text
          x={(box.x + 0.02) * VIEW_BOX_SIZE}
          y={(box.y + 0.08) * VIEW_BOX_SIZE}
          fontSize={6}
          fill={color}
          fillOpacity={0.5}
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

    // 혼합중성의 경우 JU_H와 JU_V로 분리 렌더링
    if (part === 'JU_H' && renderSyllable.jungseong) {
      const rawBox = boxes.JU_H
      if (!rawBox) return null
      // horizontalStrokes가 있으면 사용, 없으면 전체 strokes 사용
      const strokes = renderSyllable.jungseong.horizontalStrokes || renderSyllable.jungseong.strokes
      if (!strokes || strokes.length === 0) return null
      const box = getJamoRenderBox(renderSyllable.jungseong, strokes, rawBox, weightMultiplier, horizontalInkBounds)
      return (
        <g key={part} opacity={partOpacity}>
          {renderStrokes(strokes, box, partColor)}
        </g>
      )
    }

    if (part === 'JU_V' && renderSyllable.jungseong) {
      const rawBox = boxes.JU_V
      if (!rawBox) return null
      // verticalStrokes가 있으면 사용, 없으면 전체 strokes 사용
      const strokes = renderSyllable.jungseong.verticalStrokes || renderSyllable.jungseong.strokes
      if (!strokes || strokes.length === 0) return null
      const box = getJamoRenderBox(renderSyllable.jungseong, strokes, rawBox, weightMultiplier, horizontalInkBounds)
      return (
        <g key={part} opacity={partOpacity}>
          {renderStrokes(strokes, box, partColor)}
        </g>
      )
    }

    const partMap = {
      CH: { jamo: renderSyllable.choseong, box: boxes.CH },
      JU: { jamo: renderSyllable.jungseong, box: boxes.JU },
      JO: { jamo: renderSyllable.jongseong, box: boxes.JO },
    }

    const { jamo, box: rawBox } = partMap[part as 'CH' | 'JU' | 'JO']
    if (!jamo || !rawBox) return null

    // strokes가 없으면 verticalStrokes나 horizontalStrokes 확인
    let strokes = jamo.strokes
    if (!strokes || strokes.length === 0) {
      // verticalStrokes와 horizontalStrokes를 합쳐서 사용
      const verticalStrokes = jamo.verticalStrokes || []
      const horizontalStrokes = jamo.horizontalStrokes || []
      strokes = [...verticalStrokes, ...horizontalStrokes]
    }
    if (!strokes || strokes.length === 0) return null
    const box = getJamoRenderBox(jamo, strokes, rawBox, weightMultiplier, horizontalInkBounds)

    return (
      <g key={part} opacity={partOpacity}>
        {renderStrokes(strokes, box, partColor)}
      </g>
    )
  }

  // 렌더링 순서 결정
  const renderOrder = getRenderOrder(renderSyllable.layoutType)

  const debugBoxColors = PART_COLORS

  // 실제 사용되는 박스만 디버그 박스로 표시
  const getDebugBoxes = () => {
    if (!showDebugBoxes) return []
    return renderOrder
      .filter((part) => {
        // 각 part에 대해 실제로 박스가 있고 사용 가능한지 확인
        if (part === 'CH') return boxes.CH && renderSyllable.choseong
        if (part === 'JU') return boxes.JU && renderSyllable.jungseong
        if (part === 'JU_H') return boxes.JU_H && renderSyllable.jungseong
        if (part === 'JU_V') return boxes.JU_V && renderSyllable.jungseong
        if (part === 'JO') return boxes.JO && renderSyllable.jongseong
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
  const viewport = viewportBox
    ? { x: viewportBox.x * VIEW_BOX_SIZE, y: viewportBox.y * VIEW_BOX_SIZE, width: viewportBox.width * VIEW_BOX_SIZE, height: viewportBox.height * VIEW_BOX_SIZE }
    : { x: 0, y: 0, width: VIEW_BOX_SIZE, height: visualHeight }

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
      viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
      className={className}
      style={{ backgroundColor, overflow, touchAction: 'none' }}
    >
      {/* 디버그 박스 - 실제 사용되는 박스만 표시 */}
      {showDebugBoxes &&
        getDebugBoxes().map(({ part, box, color }) =>
          box ? renderDebugBox(box, color, part) : null
        )}

      {/* 글리프 클리핑용 (clipGlyphs 또는 overflow='hidden' 시 viewBox 영역 내로 제한) */}
      {shouldClipGlyphs && (
        <defs>
          <clipPath id={clipId}>
            <rect x={viewport.x} y={viewport.y} width={viewport.width} height={viewport.height} />
          </clipPath>
        </defs>
      )}

      {/* 글자 전체에 slant 적용 */}
      <g transform={slantTransform}>
        {/* 글리프 렌더링 — clipGlyphs이면 clipPath로 제한 */}
        <g clipPath={shouldClipGlyphs ? `url(#${clipId})` : undefined} pointerEvents="none">
          {renderOrder.map((part) => renderPart(part))}
        </g>
        {/* 추가 오버레이 (StrokeOverlay 등) — 클리핑 밖에서 렌더 */}
        {children}
      </g>
    </svg>
  )
}
