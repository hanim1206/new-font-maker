import { describe, expect, expectTypeOf, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import basePresets from '../data/basePresets.json'
import type {
  AnchorPoint,
  BoxConfig,
  DeepReadonly,
  DecomposedSyllable,
  JamoData,
  LayoutSchema,
  LayoutType,
  Part,
  ResolveGlyphInkInput,
  ResolvedCenterlinePrimitive,
  ResolvedInkSource,
  ResolvedStrokeInkSource,
  ResolvedRegionPrimitive,
  ReadonlyStrokeDataV2,
  StrokeDataV2,
} from '../types'
import { withContextualInkSafety } from '../utils/contextualInkSafety'
import { decomposeSyllable } from '../utils/hangulUtils'
import { getJamoRenderBox } from '../utils/jamoGeometry'
import { calculateBoxes } from '../utils/layoutCalculator'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'

const BOX: BoxConfig = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
const ALL_BOXES: Partial<Record<Part, BoxConfig>> = {
  CH: BOX,
  JU: BOX,
  JU_H: BOX,
  JU_V: BOX,
  JO: BOX,
}
const BASE_JAMOS = baseJamos as unknown as {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}
const BASE_SCHEMAS = (basePresets as unknown as {
  schemas: Record<LayoutType, LayoutSchema>
}).schemas

function stroke(id: string, overrides: Partial<StrokeDataV2> = {}): StrokeDataV2 {
  return {
    id,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    closed: false,
    thickness: 0.05,
    ...overrides,
  }
}

function jamo(
  char: string,
  type: JamoData['type'],
  overrides: Partial<JamoData> = {},
): JamoData {
  return { char, type, strokes: [stroke(`${char}-stroke`)], ...overrides }
}

function syllable(
  layoutType: LayoutType,
  overrides: Partial<DecomposedSyllable> = {},
): DecomposedSyllable {
  return {
    char: '가',
    choseong: jamo('ㄱ', 'choseong'),
    jungseong: jamo('ㅏ', 'jungseong'),
    jongseong: jamo('ㄱ', 'jongseong'),
    layoutType,
    ...overrides,
  }
}

function centerlines(
  result: ReturnType<typeof resolveGlyphInkPrimitives>,
): ResolvedCenterlinePrimitive[] {
  return result.primitives.filter((primitive): primitive is ResolvedCenterlinePrimitive<ResolvedStrokeInkSource> => (
    primitive.kind === 'centerline'
  ))
}

function resolveWithBoxes(
  value: DecomposedSyllable,
  overrides: Partial<ResolveGlyphInkInput> = {},
) {
  return resolveGlyphInkPrimitives({
    syllable: value,
    placement: { kind: 'boxes', boxes: ALL_BOXES },
    weightMultiplier: 1,
    ...overrides,
  })
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

describe('resolveGlyphInkPrimitives', () => {
  it('중심선은 깊은 읽기 전용이고 면은 glyph-normalized인 타입 계약을 제공한다', () => {
    expectTypeOf<ResolvedCenterlinePrimitive['stroke']>().toEqualTypeOf<ReadonlyStrokeDataV2>()
    expectTypeOf<ResolvedCenterlinePrimitive['stroke']['points']>()
      .toEqualTypeOf<readonly DeepReadonly<AnchorPoint>[]>()
    expectTypeOf<ResolvedCenterlinePrimitive['coordinateSpace']>()
      .toEqualTypeOf<'stroke-local-with-glyph-box'>()
    expectTypeOf<ResolvedRegionPrimitive['coordinateSpace']>()
      .toEqualTypeOf<'glyph-normalized'>()
    expectTypeOf<Extract<ResolvedInkSource, { kind: 'stroke' }>['strokeId']>()
      .toEqualTypeOf<string>()
    expectTypeOf<Extract<ResolvedInkSource, { kind: 'part-grid' }>['elementId']>()
      .toEqualTypeOf<string>()
  })

  it.each<[LayoutType, Part[]]>([
    ['choseong-only', ['CH', 'JU', 'JO']],
    ['jungseong-vertical-only', ['CH', 'JU', 'JO']],
    ['jungseong-horizontal-only', ['CH', 'JU', 'JO']],
    ['jungseong-mixed-only', ['JU_H', 'JU_V']],
    ['choseong-jungseong-vertical', ['CH', 'JU', 'JO']],
    ['choseong-jungseong-horizontal', ['CH', 'JU', 'JO']],
    ['choseong-jungseong-mixed', ['CH', 'JU_H', 'JU_V']],
    ['choseong-jungseong-vertical-jongseong', ['CH', 'JU', 'JO']],
    ['choseong-jungseong-horizontal-jongseong', ['CH', 'JU', 'JO']],
    ['choseong-jungseong-mixed-jongseong', ['CH', 'JU_H', 'JO', 'JU_V']],
  ])('%s의 기존 렌더 순서를 보존한다', (layoutType, expected) => {
    expect(resolveWithBoxes(syllable(layoutType)).renderOrder).toEqual(expected)
  })

  it('혼합중성의 명시적 빈 채널을 strokes로 대체하지 않는다', () => {
    const baseStroke = stroke('base')
    const value = syllable('jungseong-mixed-only', {
      choseong: null,
      jongseong: null,
      jungseong: jamo('ㅘ', 'jungseong', {
        strokes: [baseStroke],
        horizontalStrokes: [],
        verticalStrokes: undefined,
      }),
    })

    const primitives = centerlines(resolveWithBoxes(value))
    expect(primitives.map(({ source }) => [source.part, source.channel, source.strokeId])).toEqual([
      ['JU_V', 'strokes', 'base'],
    ])
  })

  it('일반 채널의 빈 strokes는 vertical 다음 horizontal 순서로 보완한다', () => {
    const value = syllable('choseong-only', {
      jungseong: null,
      jongseong: null,
      choseong: jamo('ㄱ', 'choseong', {
        strokes: [],
        verticalStrokes: [stroke('vertical')],
        horizontalStrokes: [stroke('horizontal')],
      }),
    })

    const primitives = centerlines(resolveWithBoxes(value))
    expect(primitives.map(({ source }) => [source.channel, source.strokeId])).toEqual([
      ['verticalStrokes', 'vertical'],
      ['horizontalStrokes', 'horizontal'],
    ])
    expect(primitives[0].box).toEqual(primitives[1].box)
  })

  it('schema, boxes, resolved-part-grid 배치가 같은 해석 결과를 낸다', () => {
    const value = syllable('choseong-only', { jungseong: null, jongseong: null })
    const schema: LayoutSchema = {
      id: 'choseong-only',
      slots: ['CH'],
      padding: { top: 0.2, bottom: 0.1, left: 0.15, right: 0.05 },
    }
    const boxes = calculateBoxes(schema, { cho: 'ㄱ', jung: '', jong: '' })
    const common = { syllable: value, weightMultiplier: 1 } as const

    const fromSchema = resolveGlyphInkPrimitives({
      ...common,
      placement: { kind: 'schema', schema },
    })
    const fromBoxes = resolveGlyphInkPrimitives({
      ...common,
      placement: { kind: 'boxes', boxes },
    })
    const fromResolvedGrid = resolveGlyphInkPrimitives({
      ...common,
      placement: { kind: 'resolved-part-grid', resolvedPartGrid: { boxes } },
    })

    expect(fromBoxes).toEqual(fromSchema)
    expect(fromResolvedGrid).toEqual(fromSchema)
  })

  it('실제 곽의 파트·혼합 채널·획 순서와 서로 다른 중성 박스를 보존한다', () => {
    const value = decomposeSyllable(
      '곽',
      BASE_JAMOS.choseong,
      BASE_JAMOS.jungseong,
      BASE_JAMOS.jongseong,
    )
    const result = resolveGlyphInkPrimitives({
      syllable: value,
      placement: {
        kind: 'schema',
        schema: BASE_SCHEMAS['choseong-jungseong-mixed-jongseong'],
      },
      weightMultiplier: 1,
    })
    const primitives = centerlines(result)

    expect(primitives.map(({ source }) => [source.part, source.channel, source.strokeId])).toEqual([
      ['CH', 'strokes', 'ㄱ-1'],
      ['JU_H', 'horizontalStrokes', 'ㅘ-1'],
      ['JU_H', 'horizontalStrokes', 'ㅘ-2'],
      ['JO', 'strokes', 'ㄱ종-1'],
      ['JU_V', 'verticalStrokes', 'ㅘ-3'],
      ['JU_V', 'verticalStrokes', 'ㅘ-4'],
    ])
    expect(primitives.find(({ source }) => source.part === 'JU_H')?.box)
      .not.toEqual(primitives.find(({ source }) => source.part === 'JU_V')?.box)
  })

  it('혼합+종성 schema의 Design Body·사용자·문맥 오버라이드를 세 배치에서 같게 해석한다', () => {
    const value = decomposeSyllable(
      '곽',
      BASE_JAMOS.choseong,
      BASE_JAMOS.jungseong,
      BASE_JAMOS.jongseong,
    )
    const schema: LayoutSchema = {
      ...structuredClone(BASE_SCHEMAS['choseong-jungseong-mixed-jongseong']),
      designBodyPadding: { top: 0.09, bottom: 0.08, left: 0.11, right: 0.07 },
      userPartOverrides: {
        CH: { top: 0.01, bottom: -0.01, left: 0.02, right: 0 },
        JU_V: { top: 0, bottom: 0.01, left: -0.02, right: 0.01 },
      },
      partOverridesByJungseong: {
        'ㅘ': {
          JU_H: { top: -0.01, bottom: 0.02, left: 0.01, right: 0.02 },
        },
      },
      overrides: [{
        id: 'gwak-context',
        conditionGroups: [[
          { type: 'choseongIs', jamo: 'ㄱ' },
          { type: 'jungseongIs', jamo: 'ㅘ' },
          { type: 'jongseongIs', jamo: 'ㄱ' },
        ]],
        partOverrides: {
          JO: { top: -0.02, bottom: 0.01, left: 0.03, right: -0.01 },
        },
        priority: 10,
        enabled: true,
      }],
    }
    const boxes = calculateBoxes(schema, { cho: 'ㄱ', jung: 'ㅘ', jong: 'ㄱ' })
    const common = { syllable: value, weightMultiplier: 1.15 } as const
    const fromSchema = resolveGlyphInkPrimitives({
      ...common,
      placement: { kind: 'schema', schema },
    })
    const fromBoxes = resolveGlyphInkPrimitives({
      ...common,
      placement: { kind: 'boxes', boxes },
    })
    const fromResolvedGrid = resolveGlyphInkPrimitives({
      ...common,
      placement: { kind: 'resolved-part-grid', resolvedPartGrid: { boxes } },
    })

    expect(fromSchema.boxes).toEqual(boxes)
    expect(fromBoxes).toEqual(fromSchema)
    expect(fromResolvedGrid).toEqual(fromSchema)
  })

  it('선택한 자모의 문맥 안전 보정을 primitive에 반영한다', () => {
    const choseong = jamo('ㄱ', 'choseong', {
      strokes: [stroke('ch', {
        points: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
      })],
    })
    const medial = (x: number) => jamo('ㅏ', 'jungseong', {
      strokes: [stroke('ju', {
        points: [{ x, y: 0 }, { x, y: 1 }],
      })],
    })
    const origin = medial(0)
    const target = withContextualInkSafety(origin, origin, medial(-0.5), 0.1)
    const value = syllable('choseong-jungseong-vertical', {
      choseong,
      jungseong: target,
      jongseong: null,
    })
    const tightBoxes = {
      CH: { x: 0, y: 0, width: 0.4, height: 1 },
      JU: { x: 0.6, y: 0, width: 0.4, height: 1 },
    }

    const result = resolveGlyphInkPrimitives({
      syllable: value,
      placement: { kind: 'boxes', boxes: tightBoxes },
      weightMultiplier: 1,
    })
    const ju = centerlines(result).find(({ source }) => source.part === 'JU')
    expect(result.limitedParts).toEqual(['JU'])
    expect(ju?.stroke.points[0].x).toBeGreaterThan(-0.5)
    expect(target.strokes?.[0].points[0].x).toBe(-0.5)
  })

  it('혼합중성의 두 채널을 유지한 채 문맥 안전 보정을 적용한다', () => {
    const choseong = jamo('ㄱ', 'choseong', {
      strokes: [stroke('ch', {
        points: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
      })],
    })
    const mixed = (verticalX: number) => jamo('ㅘ', 'jungseong', {
      strokes: undefined,
      horizontalStrokes: [stroke('horizontal', {
        points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
      })],
      verticalStrokes: [stroke('vertical', {
        points: [{ x: verticalX, y: 0 }, { x: verticalX, y: 1 }],
      })],
    })
    const origin = mixed(0)
    const target = withContextualInkSafety(origin, origin, mixed(-0.5), 0.1)
    const value = syllable('choseong-jungseong-mixed', {
      choseong,
      jungseong: target,
      jongseong: null,
    })
    const result = resolveGlyphInkPrimitives({
      syllable: value,
      placement: {
        kind: 'boxes',
        boxes: {
          CH: { x: 0, y: 0, width: 0.4, height: 1 },
          JU_H: { x: 0.6, y: 0.7, width: 0.4, height: 0.3 },
          JU_V: { x: 0.6, y: 0, width: 0.4, height: 0.7 },
        },
      },
      weightMultiplier: 1,
    })
    const primitives = centerlines(result)
    const vertical = primitives.find(({ source }) => source.channel === 'verticalStrokes')

    expect(result.limitedParts).toEqual(['JU'])
    expect(primitives.map(({ source }) => source.channel)).toEqual([
      'strokes',
      'horizontalStrokes',
      'verticalStrokes',
    ])
    expect(vertical?.stroke.points[0].x).toBeGreaterThan(-0.5)
    expect(target.verticalStrokes?.[0].points[0].x).toBe(-0.5)
  })

  it('획 오버라이드, 글로벌 설정, round 폴백 순서로 cap/join을 결정한다', () => {
    const value = syllable('choseong-only', {
      jungseong: null,
      jongseong: null,
      choseong: jamo('ㄱ', 'choseong', {
        strokes: [
          stroke('override', { linecap: 'square', linejoin: 'miter' }),
          stroke('global'),
        ],
      }),
    })
    const styled = centerlines(resolveWithBoxes(value, {
      globalLinecap: 'butt',
      globalLinejoin: 'bevel',
    }))
    const fallback = centerlines(resolveWithBoxes(value))

    expect(styled.map(({ effectiveLinecap, effectiveLinejoin }) => [effectiveLinecap, effectiveLinejoin])).toEqual([
      ['square', 'miter'],
      ['butt', 'bevel'],
    ])
    expect(fallback[1]).toMatchObject({ effectiveLinecap: 'round', effectiveLinejoin: 'round' })
  })

  it('선택한 획 전체로 기존 getJamoRenderBox를 한 번만 적용한다', () => {
    const source = jamo('ㄱ', 'choseong', {
      geometryMode: 'ink-normalized',
      strokes: [stroke('wide', {
        points: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }],
        thickness: 0.08,
      })],
    })
    const value = syllable('choseong-only', {
      choseong: source,
      jungseong: null,
      jongseong: null,
    })
    const expected = getJamoRenderBox(source, source.strokes!, BOX, 1.4, { min: 0, max: 1 })
    const primitive = centerlines(resolveWithBoxes(value, { weightMultiplier: 1.4 }))[0]
    expect(primitive.box).toEqual(expected)
    expect(primitive.weightMultiplier).toBe(1.4)
    expect(primitive).toMatchObject({
      coordinateSpace: 'stroke-local-with-glyph-box',
      source: { kind: 'stroke' },
    })
  })

  it('명시적 horizontal ink bounds를 render box 해석에 적용한다', () => {
    const source = jamo('ㄱ', 'choseong', {
      geometryMode: 'ink-normalized',
      strokes: [stroke('protruding', {
        points: [{ x: -0.25, y: 0 }, { x: 1.25, y: 0.6 }],
        thickness: 0.06,
      })],
    })
    const value = syllable('choseong-only', {
      choseong: source,
      jungseong: null,
      jongseong: null,
    })
    const bounds = { min: 0.2, max: 0.8 }
    const expected = getJamoRenderBox(source, source.strokes!, BOX, 1.2, bounds)
    const primitive = centerlines(resolveWithBoxes(value, {
      weightMultiplier: 1.2,
      horizontalInkBounds: bounds,
    }))[0]

    expect(primitive.box).toEqual(expected)
    expect(primitive.box).not.toEqual(getJamoRenderBox(
      source,
      source.strokes!,
      BOX,
      1.2,
      { min: 0, max: 1 },
    ))
  })

  it('입력을 변경하지 않고 동결된 입력도 해석한다', () => {
    const input = deepFreeze<ResolveGlyphInkInput>({
      syllable: syllable('choseong-only', { jungseong: null, jongseong: null }),
      placement: { kind: 'boxes', boxes: { CH: BOX } },
      weightMultiplier: 1,
      globalLinecap: 'butt',
      globalLinejoin: 'bevel',
    })
    const before = JSON.stringify(input)
    expect(() => resolveGlyphInkPrimitives(input)).not.toThrow()
    expect(JSON.stringify(input)).toBe(before)
  })

  it('배열 인덱스 없이 glyph/part/channel/jamo/stroke 주소로 결정적 ID를 만든다', () => {
    const value = syllable('choseong-only', {
      char: '각',
      jungseong: null,
      jongseong: null,
      choseong: jamo('ㄱ', 'choseong', {
        strokes: [stroke('stroke/a'), stroke('stroke/b')],
      }),
    })
    const first = centerlines(resolveWithBoxes(value))
    const second = centerlines(resolveWithBoxes(value))

    expect(first.map(({ id }) => id)).toEqual(second.map(({ id }) => id))
    expect(first[0].id).toBe([
      'centerline', '각', 'CH', 'strokes', 'ㄱ', 'stroke/a',
    ].map((segment) => encodeURIComponent(segment)).join(':'))
    expect(new Set(first.map(({ id }) => id)).size).toBe(first.length)
  })
})
