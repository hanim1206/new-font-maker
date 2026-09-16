import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
// 옛 기본 획(2026-02) 고정. exact path 계약은 그때 획 기준이다.
import baseJamos from '../src/data/fixtures/baseJamosLegacy2026-02.json'
import basePresets from '../src/data/basePresets.json'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { brushInkGroupsToSvgPaths, strokeToBrushInkGroups } from '../src/services/brushGeometry'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { weightToMultiplier } from '../src/stores/globalStyleStore'
import type {
  AnchorPoint,
  BoxConfig,
  DecomposedSyllable,
  JamoData,
  LayoutSchema,
  LayoutType,
  ResolvedCenterlinePrimitive,
  ResolvedStrokeInkSource,
  StrokeDataV2,
} from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'

const VIEW_BOX_SIZE = 100
const BASE_JAMOS = baseJamos as unknown as {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}
const BASE_SCHEMAS = (basePresets as unknown as {
  schemas: Record<LayoutType, LayoutSchema>
}).schemas
const ROUND_STYLE: GlobalStyle = {
  slant: 0,
  weight: 650,
  letterSpacing: 0,
  linecap: 'butt',
  linejoin: 'bevel',
  brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
  strokeStyle: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } },
}
const RECTANGLE_STYLE: GlobalStyle = {
  ...ROUND_STYLE,
  weight: 550,
  brush: { tip: 'rectangle', aspectRatio: 0.45, angle: 28 },
  strokeStyle: {
    mode: 'brush',
    brush: { tip: 'rectangle', aspectRatio: 0.45, angle: 28 },
  },
}
const NONROUND_STYLES: Record<'ellipse' | 'rectangle' | 'angledArea', GlobalStyle> = {
  ellipse: {
    ...ROUND_STYLE,
    weight: 400,
    brush: { tip: 'ellipse', aspectRatio: 0.5, angle: 0 },
    strokeStyle: { mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.5, angle: 0 } },
  },
  rectangle: {
    ...ROUND_STYLE,
    weight: 400,
    brush: { tip: 'rectangle', aspectRatio: 0.5, angle: 0 },
    strokeStyle: { mode: 'brush', brush: { tip: 'rectangle', aspectRatio: 0.5, angle: 0 } },
  },
  angledArea: {
    ...ROUND_STYLE,
    weight: 400,
    strokeStyle: { mode: 'angled-area', cutAngle: 35, cornerRadius: 0.2 },
  },
}
const NONROUND_SVG_BASELINE = {
  ellipse: { pathCount: 8, sha256: '57567e96079dd9c3e8864eed021b3f21ef7fc35c40d52ee760b657d64ea3df9b' },
  rectangle: { pathCount: 8, sha256: 'b5a0676c4d02582c824b10fe06d67d21390885101e8f1bc3d124166058192e3c' },
  angledArea: { pathCount: 6, sha256: '1f983684b25cf00a05ae7ad1a96152ba9058f6acdf799ef49ac2d58c115240cf' },
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

function cloneAnchorPoints(points: readonly AnchorPoint[]): AnchorPoint[] {
  return points.map((point) => ({
    ...point,
    ...(point.handleIn && { handleIn: { ...point.handleIn } }),
    ...(point.handleOut && { handleOut: { ...point.handleOut } }),
  }))
}

function cloneStroke(stroke: ResolvedCenterlinePrimitive['stroke']): StrokeDataV2 {
  return {
    ...stroke,
    points: cloneAnchorPoints(stroke.points),
  }
}

function elementAttributes(markup: string, element: string): Array<Record<string, string>> {
  return (markup.match(new RegExp(`<${element}\\b[^>]*>`, 'g')) ?? []).map((tag) => Object.fromEntries(
    [...tag.matchAll(/\s([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  ))
}

function pathAttributes(markup: string): Array<Record<string, string>> {
  return elementAttributes(markup, 'path')
}

describe('SvgRenderer 공통 잉크 소비 계약', () => {
  it('실제 곽 round SVG가 resolver의 primitive 순서·path·획 속성을 그대로 소비한다', () => {
    const syllable = deepFreeze(structuredClone(decomposeSyllable(
      '곽',
      BASE_JAMOS.choseong,
      BASE_JAMOS.jungseong,
      BASE_JAMOS.jongseong,
    )))
    const schema = deepFreeze(structuredClone(
      BASE_SCHEMAS['choseong-jungseong-mixed-jongseong'],
    ))
    const style = deepFreeze(structuredClone(ROUND_STYLE))
    const before = JSON.stringify({ syllable, schema, style })
    const weightMultiplier = weightToMultiplier(style.weight)
    const resolved = resolveGlyphInkPrimitives({
      syllable,
      placement: { kind: 'schema', schema },
      weightMultiplier,
      globalLinecap: style.linecap,
      globalLinejoin: style.linejoin,
      horizontalInkBounds: { min: 0, max: 1 },
    })
    const expected = resolved.primitives.map((primitive) => {
      if (primitive.kind !== 'centerline') {
        throw new Error(`테스트가 지원하지 않는 잉크 primitive입니다: ${primitive.kind}`)
      }
      return {
        d: pointsToSvgD(
          cloneAnchorPoints(primitive.stroke.points),
          primitive.stroke.closed,
          primitive.box,
          VIEW_BOX_SIZE,
        ),
        fill: 'none',
        stroke: '#123456',
        'stroke-width': String(
          primitive.stroke.thickness * primitive.weightMultiplier * VIEW_BOX_SIZE,
        ),
        'stroke-linecap': primitive.effectiveLinecap,
        'stroke-linejoin': primitive.effectiveLinejoin,
      }
    })

    const markup = renderToStaticMarkup(
      <SvgRenderer
        syllable={syllable}
        schema={schema}
        globalStyle={style}
        fillColor="#123456"
      />,
    )

    expect(pathAttributes(markup)).toEqual(expected)
    expect(JSON.stringify({ syllable, schema, style })).toBe(before)
  })

  it('빈 mixed horizontal 채널도 JU_H debug box를 남기고 path만 생략한다', () => {
    const verticalStroke: StrokeDataV2 = {
      id: 'vertical-only',
      points: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }],
      closed: false,
      thickness: 0.05,
    }
    const syllable = deepFreeze<DecomposedSyllable>({
      char: 'ㅘ',
      choseong: null,
      jungseong: {
        char: 'ㅘ',
        type: 'jungseong',
        strokes: [verticalStroke],
        horizontalStrokes: [],
        verticalStrokes: [verticalStroke],
      },
      jongseong: null,
      layoutType: 'jungseong-mixed-only',
    })
    const boxes = deepFreeze<Partial<Record<'JU_H' | 'JU_V', BoxConfig>>>({
      JU_H: { x: 0.1, y: 0.1, width: 0.8, height: 0.35 },
      JU_V: { x: 0.55, y: 0.25, width: 0.25, height: 0.65 },
    })
    const markup = renderToStaticMarkup(
      <SvgRenderer syllable={syllable} boxes={boxes} showDebugBoxes />,
    )

    expect(markup).toContain('>JU_H</text>')
    expect(markup).toContain('>JU_V</text>')
    expect(elementAttributes(markup, 'rect')).toHaveLength(2)
    expect(pathAttributes(markup)).toHaveLength(1)
    expect(pathAttributes(markup)[0].d).toBe(pointsToSvgD(
      cloneAnchorPoints(verticalStroke.points),
      verticalStroke.closed,
      boxes.JU_V!,
      VIEW_BOX_SIZE,
    ))
  })

  it('schema 우선과 기존 표시 옵션·클립·오버레이 계층을 한 렌더에서 보존한다', () => {
    const syllable = deepFreeze(structuredClone(decomposeSyllable(
      '가',
      BASE_JAMOS.choseong,
      BASE_JAMOS.jungseong,
      BASE_JAMOS.jongseong,
    )))
    const schema = deepFreeze(structuredClone(
      BASE_SCHEMAS['choseong-jungseong-vertical'],
    ))
    const contradictoryBoxes = deepFreeze({
      CH: { x: 0.91, y: 0.91, width: 0.04, height: 0.04 },
      JU: { x: 0.03, y: 0.91, width: 0.04, height: 0.04 },
    })
    const viewportBox = { x: 0.2, y: 0.1, width: 0.6, height: 0.7 }
    const style = deepFreeze<GlobalStyle>({
      ...structuredClone(ROUND_STYLE),
      slant: 12,
      weight: 400,
      linecap: 'square',
      linejoin: 'miter',
    })
    const resolvedSchema = resolveGlyphInkPrimitives({
      syllable,
      placement: { kind: 'schema', schema },
      weightMultiplier: weightToMultiplier(style.weight),
      globalLinecap: style.linecap,
      globalLinejoin: style.linejoin,
      horizontalInkBounds: { min: 0, max: 1 },
    })
    const resolvedContradiction = resolveGlyphInkPrimitives({
      syllable,
      placement: { kind: 'boxes', boxes: contradictoryBoxes },
      weightMultiplier: weightToMultiplier(style.weight),
      globalLinecap: style.linecap,
      globalLinejoin: style.linejoin,
      horizontalInkBounds: { min: 0, max: 1 },
    })
    const expectedVisiblePaths = resolvedSchema.primitives
      .filter((primitive): primitive is ResolvedCenterlinePrimitive<ResolvedStrokeInkSource> => (
        primitive.kind === 'centerline' && primitive.source.part === 'JU'
      ))
      .map((primitive) => ({
        d: pointsToSvgD(
          cloneAnchorPoints(primitive.stroke.points),
          primitive.stroke.closed,
          primitive.box,
          VIEW_BOX_SIZE,
        ),
        fill: 'none',
        stroke: '#d946ef',
        'stroke-width': String(
          primitive.stroke.thickness * primitive.weightMultiplier * VIEW_BOX_SIZE,
        ),
        'stroke-linecap': primitive.effectiveLinecap,
        'stroke-linejoin': primitive.effectiveLinejoin,
        style: 'transition:d 0.15s ease, stroke-width 0.15s ease',
      }))
    const contradictoryVisiblePaths = resolvedContradiction.primitives
      .filter((primitive): primitive is ResolvedCenterlinePrimitive<ResolvedStrokeInkSource> => (
        primitive.kind === 'centerline' && primitive.source.part === 'JU'
      ))
      .map((primitive) => pointsToSvgD(
        cloneAnchorPoints(primitive.stroke.points),
        primitive.stroke.closed,
        primitive.box,
        VIEW_BOX_SIZE,
      ))

    const markup = renderToStaticMarkup(
      <SvgRenderer
        syllable={syllable}
        schema={schema}
        boxes={contradictoryBoxes}
        globalStyle={style}
        partStyles={{
          CH: { hidden: true },
          JU: { fillColor: '#d946ef', opacity: 0.35 },
        }}
        showDebugBoxes
        viewportBox={viewportBox}
        clipGlyphs
        enableTransition
      >
        <circle data-overlay="outside-clip" cx="5" cy="6" r="2" />
      </SvgRenderer>,
    )

    expect(pathAttributes(markup)).toEqual(expectedVisiblePaths)
    expect(pathAttributes(markup).map(({ d }) => d)).not.toEqual(contradictoryVisiblePaths)
    const debugRects = elementAttributes(markup.split('<defs>')[0], 'rect')
    expect(debugRects.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(
      resolvedSchema.renderOrder
        .filter((part) => resolvedSchema.boxes[part] && (
          part === 'CH' ? syllable.choseong : part === 'JO' ? syllable.jongseong : syllable.jungseong
        ))
        .map((part) => {
          const box = resolvedSchema.boxes[part]!
          return {
            x: String(box.x * VIEW_BOX_SIZE),
            y: String(box.y * VIEW_BOX_SIZE),
            width: String(box.width * VIEW_BOX_SIZE),
            height: String(box.height * VIEW_BOX_SIZE),
          }
        }),
    )
    expect(elementAttributes(markup, 'svg')[0].viewBox).toBe('20 10 60 70')
    expect(markup).toContain('<g opacity="0.35">')
    expect(markup).toContain('transform="translate(50, 50) skewX(-12) translate(-50, -50)"')
    expect(markup).toMatch(/<g clip-path="url\(#glyph-clip[^"]+\)" pointer-events="none">/)
    expect(markup).toContain('</g><circle data-overlay="outside-clip"')
    expect(markup).toMatch(/<g transform="[^"]+"><g clip-path=/)
    expect(markup).toMatch(/<circle data-overlay="outside-clip"[^>]*><\/circle><\/g><\/svg>$/)
  })

  it('rectangle custom brush가 resolver primitive 순서대로 filled evenodd path를 만든다', () => {
    const syllable = deepFreeze(structuredClone(decomposeSyllable(
      '곽',
      BASE_JAMOS.choseong,
      BASE_JAMOS.jungseong,
      BASE_JAMOS.jongseong,
    )))
    const schema = deepFreeze(structuredClone(
      BASE_SCHEMAS['choseong-jungseong-mixed-jongseong'],
    ))
    const style = deepFreeze(structuredClone(RECTANGLE_STYLE))
    const resolved = resolveGlyphInkPrimitives({
      syllable,
      placement: { kind: 'schema', schema },
      weightMultiplier: weightToMultiplier(style.weight),
      globalLinecap: style.linecap,
      globalLinejoin: style.linejoin,
      horizontalInkBounds: { min: 0, max: 1 },
    })
    const centerlines = resolved.primitives.map((primitive) => {
      if (primitive.kind !== 'centerline') throw new Error('중심선 resolver 계약이 아닙니다.')
      return primitive
    })
    const expected = centerlines.flatMap((primitive) => brushInkGroupsToSvgPaths(
      strokeToBrushInkGroups(
        cloneStroke(primitive.stroke),
        primitive.box,
        primitive.weightMultiplier,
        style.strokeStyle.mode === 'brush' ? style.strokeStyle.brush : style.brush,
      ),
      VIEW_BOX_SIZE,
    ).map((d) => ({
      d,
      fill: '#0f766e',
      'fill-rule': 'evenodd',
    })))

    const markup = renderToStaticMarkup(
      <SvgRenderer
        syllable={syllable}
        schema={schema}
        globalStyle={style}
        fillColor="#0f766e"
      />,
    )

    expect(centerlines.map(({ source }) => [source.part, source.channel, source.strokeId])).toEqual([
      ['CH', 'strokes', 'ㄱ-1'],
      ['JU_H', 'horizontalStrokes', 'ㅘ-1'],
      ['JU_H', 'horizontalStrokes', 'ㅘ-2'],
      ['JO', 'strokes', 'ㄱ종-1'],
      ['JU_V', 'verticalStrokes', 'ㅘ-3'],
      ['JU_V', 'verticalStrokes', 'ㅘ-4'],
    ])
    expect(pathAttributes(markup)).toEqual(expected)
  })

  it('실제 곽의 납작형·네모형·절단형 SVG path 속성을 exact 기준으로 유지한다', () => {
    const syllable = deepFreeze(structuredClone(decomposeSyllable(
      '곽',
      BASE_JAMOS.choseong,
      BASE_JAMOS.jungseong,
      BASE_JAMOS.jongseong,
    )))
    const schema = deepFreeze(structuredClone(
      BASE_SCHEMAS['choseong-jungseong-mixed-jongseong'],
    ))
    const actual = Object.fromEntries(Object.entries(NONROUND_STYLES).map(([name, sourceStyle]) => {
      const markup = renderToStaticMarkup(
        <SvgRenderer
          syllable={syllable}
          schema={schema}
          globalStyle={deepFreeze(structuredClone(sourceStyle))}
          fillColor="#0f766e"
        />,
      )
      const paths = pathAttributes(markup)
      return [name, {
        pathCount: paths.length,
        sha256: createHash('sha256').update(JSON.stringify(paths)).digest('hex'),
      }]
    }))

    expect(actual).toEqual(NONROUND_SVG_BASELINE)
  })

  it('SvgRenderer가 파트·채널·박스·cap/join을 직접 재해석하지 않는다', () => {
    const source = readFileSync(
      new URL('../src/renderers/SvgRenderer.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(/import\s+\{\s*resolveGlyphInkPrimitives\s*\}/)
    expect(source).not.toMatch(/\bcalculateBoxes\b/)
    expect(source).not.toMatch(/\bgetJamoRenderBox\b/)
    expect(source).not.toMatch(/\bresolveSyllableContextualInkSafety\b/)
    expect(source).not.toMatch(/\bresolveLinecap\b/)
    expect(source).not.toMatch(/\bresolveLinejoin\b/)
    expect(source).not.toMatch(/\bgetRenderOrder\b/)
    expect(source).not.toMatch(/\.(?:horizontalStrokes|verticalStrokes)\b/)
    expect(source).toContain('SvgRenderer가 지원하지 않는 잉크 primitive입니다')
  })
})
