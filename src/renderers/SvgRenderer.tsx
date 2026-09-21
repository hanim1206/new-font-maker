import { useMemo, useId, type ReactNode } from 'react'
import type { DecomposedSyllable, BoxConfig, Part, ResolvedCenterlinePrimitive, StrokeDataV2, LayoutSchema } from '../types'
import { PART_COLORS } from '../constants/editorColors'
import { pointsToSvgD } from '../utils/pathUtils'
import { weightToMultiplier } from '../utils/globalStyleUtils'
import type { GlobalStyle } from '../stores/globalStyleStore'
import { brushInkGroupsToSvgPaths, strokeToBrushInkGroups } from '../services/brushGeometry'
import { resolveGlyphInkPrimitives } from '../services/glyphInkResolver'
import { strokeToRenderInkGroups } from '../services/strokeRenderGeometry'
import { stemBeakGroupOf, stemBeakInkGroups } from '../services/stemBeak'

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
  // 글리프 잉크 아래에 깔 요소 (부품 상자·고스트 등). slant 그룹 안, 글리프보다 먼저 그린다.
  underlay?: ReactNode
  // 기울지 않는 깔개 (눈금·글자몸·기준선·부품 상자). slant 그룹 밖, 맨 아래에 그린다.
  straightUnderlay?: ReactNode
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
const HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const

/** 기존 기하 함수는 획을 읽기만 한다. readonly 경계는 이 어댑터 한 곳에서만 좁힌다. */
function asLegacyReadonlyStroke(stroke: ResolvedCenterlinePrimitive['stroke']): StrokeDataV2 {
  return stroke as StrokeDataV2
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
  underlay,
  straightUnderlay,
  svgRef,
  className,
}: SvgRendererProps) {
  // 글리프 클리핑 여부 (명시적 prop 우선, 없으면 overflow='hidden'과 동일)
  const shouldClipGlyphs = clipGlyphs ?? (overflow === 'hidden')
  const clipRawId = useId()
  const clipId = `glyph-clip${clipRawId.replace(/:/g, '')}`

  // 글로벌 스타일 값 (기본값 적용)
  const slant = globalStyle?.slant ?? 0
  const weightMultiplier = globalStyle ? weightToMultiplier(globalStyle.weight) : 1.0
  const resolvedInk = useMemo(() => resolveGlyphInkPrimitives({
    syllable,
    placement: schema
      ? { kind: 'schema', schema }
      : { kind: 'boxes', boxes: boxesProp ?? {} },
    weightMultiplier,
    globalLinecap: globalStyle?.linecap,
    globalLinejoin: globalStyle?.linejoin,
    // viewportBox는 조판 창의 크기일 뿐 잉크를 다시 맞추는 경계가 아니다.
    // Design Body보다 돌출된 획도 편집기와 같은 형태로 보여야 한다.
    horizontalInkBounds: HORIZONTAL_INK_BOUNDS,
  }), [boxesProp, globalStyle?.linecap, globalStyle?.linejoin, schema, syllable, weightMultiplier])
  const centerlines = useMemo(() => resolvedInk.primitives.map((primitive) => {
    if (primitive.kind !== 'centerline') {
      throw new Error(`SvgRenderer가 지원하지 않는 잉크 primitive입니다: ${primitive.kind}`)
    }
    return primitive
  }), [resolvedInk.primitives])
  const boxes = resolvedInk.boxes
  const renderOrder = resolvedInk.renderOrder
  // 세로줄기 부리: 획 데이터가 아니라 전역 스타일이 얹는 면이다. 추출기와 같은 함수로 만든다.
  const stemBeak = globalStyle?.stemBeak
  const beakRenderStyle = globalStyle?.strokeStyle
  const beakPathsById = useMemo(() => {
    const groups = stemBeakInkGroups(centerlines.map((primitive) => ({
      stroke: asLegacyReadonlyStroke(primitive.stroke),
      box: primitive.box,
      weightMultiplier: primitive.weightMultiplier,
      group: stemBeakGroupOf(primitive.source),
    })), stemBeak, beakRenderStyle)
    return new Map(centerlines.map((primitive, index) => [primitive.id, brushInkGroupsToSvgPaths(groups[index], VIEW_BOX_SIZE)]))
  }, [centerlines, stemBeak, beakRenderStyle])

  const renderPrimitive = (
    primitive: ResolvedCenterlinePrimitive,
    color: string
  ) => {
    const stroke = asLegacyReadonlyStroke(primitive.stroke)
    // V2 통합 렌더링: 모든 획을 path로 렌더링
    const d = pointsToSvgD(stroke.points, stroke.closed, primitive.box, VIEW_BOX_SIZE)
    if (!d) return null
    const strokeWidth = stroke.thickness * primitive.weightMultiplier * VIEW_BOX_SIZE
    const beaks = beakPathsById.get(primitive.id) ?? []

    const renderStyle = globalStyle?.strokeStyle ?? (globalStyle?.brush ? { mode: 'brush' as const, brush: globalStyle.brush } : undefined)
    if (renderStyle && (renderStyle.mode !== 'brush' || renderStyle.brush.tip !== 'round')) {
      const paths = brushInkGroupsToSvgPaths(
        renderStyle.mode === 'brush'
          ? strokeToBrushInkGroups(stroke, primitive.box, primitive.weightMultiplier, renderStyle.brush)
          : strokeToRenderInkGroups(stroke, primitive.box, primitive.weightMultiplier, renderStyle),
        VIEW_BOX_SIZE,
      )
      return (
        <g key={primitive.id}>
          {paths.map((path, index) => <path key={`${primitive.id}-brush-${index}`} d={path} fill={color} fillRule="evenodd" />)}
          {beaks.map((path, index) => <path key={`${primitive.id}-beak-${index}`} d={path} fill={color} data-stem-beak="true" />)}
        </g>
      )
    }

    if (beaks.length > 0) {
      return (
        <g key={primitive.id}>
          <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap={primitive.effectiveLinecap} strokeLinejoin={primitive.effectiveLinejoin} />
          {beaks.map((path, index) => <path key={`${primitive.id}-beak-${index}`} d={path} fill={color} data-stem-beak="true" />)}
        </g>
      )
    }

    return (
      <path
        key={primitive.id}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={primitive.effectiveLinecap}
        strokeLinejoin={primitive.effectiveLinejoin}
        style={enableTransition ? { transition: 'd 0.15s ease, stroke-width 0.15s ease' } : undefined}
      />
    )
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
  const renderPart = (part: Part) => {
    const ps = partStyles?.[part]
    // hidden이면 렌더링 스킵 (StrokeOverlay가 대신 렌더링)
    if (ps?.hidden) return null
    const partColor = ps?.fillColor ?? fillColor
    const partOpacity = ps?.opacity ?? 1
    const partPrimitives = centerlines.filter((primitive) => primitive.source.part === part)
    if (partPrimitives.length === 0) return null

    return (
      <g key={part} opacity={partOpacity}>
        {partPrimitives.map((primitive) => renderPrimitive(primitive, partColor))}
      </g>
    )
  }

  const debugBoxColors = PART_COLORS

  // 실제 사용되는 박스만 디버그 박스로 표시
  const getDebugBoxes = () => {
    if (!showDebugBoxes) return []
    return renderOrder
      .filter((part) => {
        if (!boxes[part]) return false
        if (part === 'CH') return syllable.choseong !== null
        if (part === 'JU' || part === 'JU_H' || part === 'JU_V') {
          return syllable.jungseong !== null
        }
        return syllable.jongseong !== null
      })
      .map((part) => {
        const box = boxes[part]
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

      {/* 곧은 깔개 — 글자가 기울어도 자리의 기준은 곧게 남는다. 이벤트 없음. */}
      {straightUnderlay && <g pointerEvents="none">{straightUnderlay}</g>}

      {/* 글자 전체에 slant 적용 */}
      <g transform={slantTransform}>
        {/* 잉크 아래 깔개 (부품 상자·고스트). 이벤트 없음. */}
        {underlay && <g pointerEvents="none">{underlay}</g>}
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
