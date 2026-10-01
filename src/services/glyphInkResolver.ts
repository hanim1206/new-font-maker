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
  MedialFamily,
} from '../types'
import { resolveSyllableContextualInkSafety } from '../utils/contextualInkSafety'
import { getJamoRenderBox } from '../utils/jamoGeometry'
import { calculateBoxes } from '../utils/layoutCalculator'
import { familyOfSyllable, strokesForFamily } from '../utils/jamoContextStrokes'
import { counterKeepStrokeFactors, jamoOfPart } from './counterKeep'
import { placeStemStroke } from './stemBend'

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

function selectGeneralChannels(jamo: JamoData, family: MedialFamily | null): SelectedPartStrokes | null {
  const strokes = strokesForFamily(jamo, family)
  if (strokes && strokes.length > 0) {
    return {
      jamo,
      strokes,
      sources: strokes.map((stroke) => ({ stroke, channel: 'strokes' })),
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
  // 닿자는 홀자 계열별 획 변형이 있을 수 있다. 홀자 자신은 변형이 없다.
  return jamo ? selectGeneralChannels(jamo, part === 'JU' ? null : familyOfSyllable(syllable)) : null
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

  return selected.sources.map(({ stroke: stored, channel }) => {
    // 홀자 줄기는 이 칸에서도 받침 없는 칸의 em 휨을 지킨다. 곧은 획은 획도 칸도 그대로.
    const { stroke, box: placedBox } = part === 'CH' || part === 'JO' ? { stroke: stored, box } : placeStemStroke(selected.jamo, stored, box, channel)
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
      box: { ...placedBox },
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
  let primitives = renderOrder.flatMap((part) => (
    resolvePartPrimitives(glyphId, part, safety.syllable, boxes, input)
  ))

  // 속공간 지키기: 굵기 400 초과에서 자소별로 획 두께를 덜 굵게 해 속공간 · 자소 사이 틈을 남긴다.
  // 상자는 원래 두께로 이미 놓였고 여기서는 두께만 굽는다 — 화면 · 부리 · OTF가 전부 이 두께를 그대로 쓴다.
  if (input.counterKeep && input.weightMultiplier > 1 && primitives.length > 0) {
    const { factors } = counterKeepStrokeFactors(
      primitives.map((primitive) => ({ stroke: primitive.stroke as StrokeDataV2, box: primitive.box as BoxConfig, part: jamoOfPart(primitive.source.part) })),
      input.weightMultiplier,
      input.counterKeep.stemScale,
    )
    primitives = primitives.map((primitive, index) => (
      factors[index] === 1 ? primitive : { ...primitive, stroke: { ...primitive.stroke, thickness: primitive.stroke.thickness * factors[index] } }
    ))
  }

  return {
    boxes,
    renderOrder,
    limitedParts: [...safety.limitedParts],
    primitives,
  }
}
