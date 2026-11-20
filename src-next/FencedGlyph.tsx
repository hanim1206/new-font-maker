import { useEffect, useMemo } from 'react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { DEFAULT_GLOBAL_PADDING, mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { BoxConfig, DecomposedSyllable, GlyphInkPlacement, JamoData, Padding, Part, ResolvedStrokeInkSource } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { clearanceRatio, correctGlyph, GOTHIC_FENCE, measureGlyph, movedBoxes, partClearances, pickJamoScale, scaledBoxes, shakenBoxes, type FenceLine, type FencePull, type ShakeLevel } from './fenceBand'
import { useContextPlacement } from './notoModel'

const HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const

/** 렌더러와 같은 입구로 풀어 상자와 중심선을 얻는다. */
function resolved(syllable: DecomposedSyllable, placement: GlyphInkPlacement, style: GlobalStyle) {
  const result = resolveGlyphInkPrimitives({
    syllable,
    placement,
    weightMultiplier: weightToMultiplier(style.weight),
    globalLinecap: style.linecap,
    globalLinejoin: style.linejoin,
    horizontalInkBounds: HORIZONTAL_INK_BOUNDS,
  })
  const strokes = result.primitives.map((primitive) => ({ part: primitive.source.part, box: primitive.box, points: primitive.stroke.points, closed: primitive.stroke.closed, thickness: primitive.stroke.thickness * primitive.weightMultiplier }))
  return { boxes: result.boxes, strokes, measure: measureGlyph(strokes), clearances: partClearances(strokes) }
}

/** 잉크 몸 높이(em). 기본 네모꼴에서 엔진이 잰 몸 높이를 지금 네모꼴 비율로 옮긴다. */
const bodyOf = (padding: Padding) => GOTHIC_FENCE.engine.body * Math.max(0.5, 1 - padding.top - padding.bottom) / (1 - DEFAULT_GLOBAL_PADDING.top - DEFAULT_GLOBAL_PADDING.bottom)

export interface FenceOptions {
  /** 보정 켬 */
  on: boolean
  line: FenceLine
  /** 일부러 흔들기(보정 전에 배치를 민다) */
  shake: ShakeLevel
  /** 글줄 안 순서 — 흔드는 무늬에 쓴다 */
  index: number
  /** 글줄 전체가 같이 쓰는 자소 줄이는 비율(가장 많이 줄여야 하는 글자의 것). */
  scale?: number
}

/**
 * 울타리 보정을 얹은 글자 하나(실험실 전용). `AppGlyph`와 같은 길로 풀되, 그리기 직전에 재서 울타리 밖이면 당긴다.
 * 보선(자소 상자)과 그은 모양은 사용자 것이라 그대로 두고, 서비스는 획을 칸 안에 넣는 법만 정한다:
 * 1) 휜 획이 옆 자소에 닿으면 자소를 모두 같은 비율로 줄여 사이를 벌린다 — 글자마다 따로가 아니라 글줄에서 가장 많이 줄여야 하는 글자의 비율을 다 같이 쓴다(`onNeed`로 올리고 `fence.scale`로 받는다). 2) 배치 값 넷은 울타리 끝까지 당긴다.
 * 기준은 같은 글자를 기본 획(저장소) + 지금 보선으로 푼 것 — 보선이 움직이면 기준도 따라간다.
 * 당긴 기록은 `onPulls`로 올린다. 저장하지 않고 제품 값도 안 바꾼다.
 */
export function FencedGlyph({ char, size, className, strokeColorOf, jungseongOverride, choseongOverride, jongseongOverride, fence, onPulls, onNeed }: {
  char: string
  size: number
  className?: string
  strokeColorOf?: (source: ResolvedStrokeInkSource) => string | undefined
  jungseongOverride?: Readonly<Record<string, JamoData>>
  choseongOverride?: Readonly<Record<string, JamoData>>
  jongseongOverride?: Readonly<Record<string, JamoData>>
  fence: FenceOptions
  onPulls?: (index: number, pulls: readonly FencePull[]) => void
  onNeed?: (index: number, scale: number) => void
}) {
  const storedChoseong = useJamoStore((state) => state.choseong)
  const storedJungseong = useJamoStore((state) => state.jungseong)
  const storedJongseong = useJamoStore((state) => state.jongseong)
  const choseong = useMemo(() => choseongOverride ? { ...storedChoseong, ...choseongOverride } : storedChoseong, [storedChoseong, choseongOverride])
  const jungseong = useMemo(() => jungseongOverride ? { ...storedJungseong, ...jungseongOverride } : storedJungseong, [storedJungseong, jungseongOverride])
  const jongseong = useMemo(() => jongseongOverride ? { ...storedJongseong, ...jongseongOverride } : storedJongseong, [storedJongseong, jongseongOverride])
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const baseSyllable = useMemo(() => decomposeSyllable(char, storedChoseong, storedJungseong, storedJongseong), [char, storedChoseong, storedJungseong, storedJongseong])
  const layout = syllable.layoutType
  const globalStyle = useEffectiveGlobalStyle(layout)
  const padding = useMemo(() => mergePadding(globalPadding, paddingOverrides[layout]), [globalPadding, paddingOverrides, layout])
  const schema = useMemo(() => ({ ...schemas[layout], padding, designBodyPadding: padding }), [schemas, layout, padding])
  const { placement } = useContextPlacement(syllable, schema, globalStyle)
  const { placement: basePlacement } = useContextPlacement(baseSyllable, schema, globalStyle)

  const reference = useMemo(() => resolved(baseSyllable, basePlacement, globalStyle), [baseSyllable, basePlacement, globalStyle])
  const { on, line, shake, index, scale = 1 } = fence
  const floor = GOTHIC_FENCE.lines[line].clearanceFloor
  // 이 글자가 바라는 줄이는 비율. 글줄 전체에서 모으려고 올린다 — 받은 비율과는 무관해 돌고 돌지 않는다.
  const fit = useMemo(() => {
    if (floor === undefined || syllable === baseSyllable) return null
    const placed = resolved(syllable, placement, globalStyle)
    const at = (ratio: number) => (ratio === 1 ? placed : resolved(syllable, { kind: 'boxes', boxes: scaledBoxes(placed.boxes, ratio) }, globalStyle))
    const need = pickJamoScale((ratio) => clearanceRatio(at(ratio).clearances, reference.clearances), floor)
    return { placed, at, need }
  }, [floor, syllable, baseSyllable, placement, globalStyle, reference])
  const need = fit?.need ?? 1
  useEffect(() => { onNeed?.(index, need) }, [onNeed, index, need])

  const result = useMemo<{ boxes: Partial<Record<Part, BoxConfig>>; pulls: readonly FencePull[] }>(() => {
    let placed = fit?.placed ?? resolved(syllable, placement, globalStyle)
    const pulls: FencePull[] = []
    // 1) 자소를 모두 같은 비율로 줄인다. 끈 채로도 재서 "켜면 얼마나"를 알려 준다.
    if (fit && floor !== undefined) {
      const fitted = fit.at(scale)
      const before = clearanceRatio(placed.clearances, reference.clearances), after = clearanceRatio(fitted.clearances, reference.clearances)
      pulls.push({ value: 'clearance', before, after, band: { lo: floor, hi: Infinity }, pulled: scale - 1, left: after >= floor - 1e-3 ? 0 : floor - after })
      if (on) placed = fitted
    }
    // 2) 배치 값 넷: 상자를 옮긴다.
    const shaken = shakenBoxes(placed.boxes, layout, index, shake)
    const now = shake === 0 ? placed.measure : resolved(syllable, { kind: 'boxes', boxes: shaken }, globalStyle).measure
    if (!now || !reference.measure) return { boxes: shaken, pulls }
    // 몸 높이는 지금 네모꼴(위아래 여백)에서 — 네모꼴을 옮기면 울타리 단위도 따라간다. 잉크 몸은 네모꼴보다 획 굵기만큼 크다(엔진 측정 0.905).
    // 자소를 줄였으면 기준 글자도 같은 비율로 줄여서 견준다 — 안 그러면 배치 보정이 줄인 것을 도로 당긴다.
    const scaledReference = on && fit && scale < 1 ? resolved(baseSyllable, { kind: 'boxes', boxes: scaledBoxes(reference.boxes, scale) }, globalStyle).measure : reference.measure
    if (!scaledReference) return { boxes: shaken, pulls }
    const correction = correctGlyph({ layout, now, reference: scaledReference, line, body: bodyOf(padding) })
    return { boxes: on ? movedBoxes(shaken, correction.moves) : shaken, pulls: [...pulls, ...correction.pulls] }
  }, [syllable, placement, globalStyle, layout, reference, on, line, shake, index, padding, fit, floor, scale, baseSyllable])

  useEffect(() => { onPulls?.(index, result.pulls) }, [onPulls, index, result.pulls])

  return (
    <SvgRenderer
      syllable={syllable}
      boxes={result.boxes}
      size={size}
      className={className}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={strokeColorOf}
    />
  )
}
