import type {
  BoxConfig,
  DecomposedSyllable,
  InkChannel,
  JamoData,
  Part,
  ResolveGlyphInkInput,
  ResolvedCenterlinePrimitive,
  ResolvedGlyphInkResult,
  ResolvedStrokeInkSource,
  StrokeDataV2,
} from '../types'
import { resolveSyllableContextualInkSafety } from '../utils/contextualInkSafety'
import { getJamoRenderBox } from '../utils/jamoGeometry'
import { calculateBoxes } from '../utils/layoutCalculator'

const DEFAULT_HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const

function getRenderOrder(layoutType: DecomposedSyllable['layoutType']): Part[] {
  if (layoutType === 'choseong-jungseong-mixed-jongseong') {
    return ['CH', 'JU_H', 'JO', 'JU_V']
  }
  if (layoutType === 'choseong-jungseong-mixed') {
    return ['CH', 'JU_H', 'JU_V']
  }
  if (layoutType === 'jungseong-mixed-only') {
    return ['JU_H', 'JU_V']
  }
  return ['CH', 'JU', 'JO']
}

function cloneBoxes(
  source: Readonly<Partial<Record<Part, BoxConfig>>>,
): Partial<Record<Part, BoxConfig>> {
  const result: Partial<Record<Part, BoxConfig>> = {}
  for (const part of ['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const) {
    const box = source[part]
    if (box) result[part] = { ...box }
  }
  return result
}

function resolveBoxes(input: ResolveGlyphInkInput): Partial<Record<Part, BoxConfig>> {
  if (input.placement.kind === 'schema') {
    return calculateBoxes(input.placement.schema, {
      cho: input.syllable.choseong?.char ?? '',
      jung: input.syllable.jungseong?.char ?? '',
      jong: input.syllable.jongseong?.char ?? '',
    })
  }
  if (input.placement.kind === 'boxes') return cloneBoxes(input.placement.boxes)
  return cloneBoxes(input.placement.resolvedPartGrid.boxes)
}

interface SelectedStroke {
  stroke: StrokeDataV2
  channel: InkChannel
}

interface SelectedPartStrokes {
  jamo: JamoData
  strokes: StrokeDataV2[]
  sources: SelectedStroke[]
}

function selectMixedChannel(
  jamo: JamoData,
  channel: 'horizontalStrokes' | 'verticalStrokes',
): SelectedPartStrokes | null {
  // 기존 화면·OTF의 `channelStrokes || strokes` 의미를 그대로 보존한다.
  const channelStrokes = jamo[channel]
  const strokes = channelStrokes || jamo.strokes
  if (!strokes || strokes.length === 0) return null
  const resolvedChannel: InkChannel = channelStrokes ? channel : 'strokes'
  return {
    jamo,
    strokes,
    sources: strokes.map((stroke) => ({ stroke, channel: resolvedChannel })),
  }
}

function selectGeneralChannels(jamo: JamoData): SelectedPartStrokes | null {
  if (jamo.strokes && jamo.strokes.length > 0) {
    return {
      jamo,
      strokes: jamo.strokes,
      sources: jamo.strokes.map((stroke) => ({ stroke, channel: 'strokes' })),
    }
  }

  const vertical = jamo.verticalStrokes || []
  const horizontal = jamo.horizontalStrokes || []
  const sources: SelectedStroke[] = [
    ...vertical.map((stroke) => ({ stroke, channel: 'verticalStrokes' as const })),
    ...horizontal.map((stroke) => ({ stroke, channel: 'horizontalStrokes' as const })),
  ]
  if (sources.length === 0) return null
  return { jamo, strokes: sources.map(({ stroke }) => stroke), sources }
}

function selectPartStrokes(
  part: Part,
  syllable: DecomposedSyllable,
): SelectedPartStrokes | null {
  if (part === 'JU_H') {
    return syllable.jungseong
      ? selectMixedChannel(syllable.jungseong, 'horizontalStrokes')
      : null
  }
  if (part === 'JU_V') {
    return syllable.jungseong
      ? selectMixedChannel(syllable.jungseong, 'verticalStrokes')
      : null
  }

  const jamo = part === 'CH'
    ? syllable.choseong
    : part === 'JU'
      ? syllable.jungseong
      : syllable.jongseong
  return jamo ? selectGeneralChannels(jamo) : null
}

function primitiveId(source: ResolvedStrokeInkSource): string {
  return ['centerline', source.glyphId, source.part, source.channel, source.jamoId, source.strokeId]
    .map((segment) => encodeURIComponent(segment))
    .join(':')
}

function resolvePartPrimitives(
  glyphId: string,
  part: Part,
  syllable: DecomposedSyllable,
  boxes: Partial<Record<Part, BoxConfig>>,
  input: ResolveGlyphInkInput,
): ResolvedCenterlinePrimitive<ResolvedStrokeInkSource>[] {
  const rawBox = boxes[part]
  const selected = selectPartStrokes(part, syllable)
  if (!rawBox || !selected) return []

  const box = getJamoRenderBox(
    selected.jamo,
    selected.strokes,
    rawBox,
    input.weightMultiplier,
    input.horizontalInkBounds ?? DEFAULT_HORIZONTAL_INK_BOUNDS,
  )

  return selected.sources.map(({ stroke, channel }) => {
    const source: ResolvedStrokeInkSource = {
      kind: 'stroke',
      glyphId,
      part,
      channel,
      jamoId: selected.jamo.char,
      strokeId: stroke.id,
    }
    return {
      kind: 'centerline',
      coordinateSpace: 'stroke-local-with-glyph-box',
      id: primitiveId(source),
      source,
      stroke,
      box: { ...box },
      weightMultiplier: input.weightMultiplier,
      effectiveLinecap: stroke.linecap ?? input.globalLinecap ?? 'round',
      effectiveLinejoin: stroke.linejoin ?? input.globalLinejoin ?? 'round',
    }
  })
}

/**
 * 화면과 OTF가 공유할 자모 채널·박스·문맥 안전·획 속성을 순수하게 해석한다.
 * 현재 조각은 기존 중심선만 반환하며 저장소나 출력 좌표계를 알지 못한다.
 */
export function resolveGlyphInkPrimitives(
  input: ResolveGlyphInkInput,
): ResolvedGlyphInkResult<ResolvedCenterlinePrimitive<ResolvedStrokeInkSource>> {
  const boxes = resolveBoxes(input)
  const safety = resolveSyllableContextualInkSafety(input.syllable, boxes)
  const renderOrder = getRenderOrder(safety.syllable.layoutType)
  const glyphId = input.syllable.char
  const primitives = renderOrder.flatMap((part) => (
    resolvePartPrimitives(glyphId, part, safety.syllable, boxes, input)
  ))

  return {
    boxes,
    renderOrder,
    limitedParts: [...safety.limitedParts],
    primitives,
  }
}
