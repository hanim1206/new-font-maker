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
import { identityOfSyllable } from '../src/services/contextBoxResolver'
import { clearanceRatio, correctGlyph, GOTHIC_FENCE, measureGlyph, movedBoxes, partClearances, pickBend, shakenBoxes, type FenceLine, type FencePull, type ShakeLevel } from './fenceBand'
import { useLayoutDelta } from './layoutDeltaStore'
import { contextPlacementOf, useNotoModel } from './notoModel'

const HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const
const NO_PULLS: readonly FencePull[] = []

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
  return { boxes: result.boxes, measure: measureGlyph(strokes), clearances: partClearances(strokes) }
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
}

/** 휨 단계 하나의 자모 덮어쓰기. `FencedGlyph`의 `levels[i]`는 `BEND_LEVELS[i]`만큼 휨을 남긴 것이다. */
export interface GlyphOverride {
  jungseong?: Readonly<Record<string, JamoData>>
  choseong?: Readonly<Record<string, JamoData>>
  jongseong?: Readonly<Record<string, JamoData>>
}

/**
 * 울타리 보정을 얹은 글자 하나(실험실 전용). `AppGlyph`와 같은 길로 풀되, 그리기 직전에 재서 울타리 밖이면 당긴다.
 * 먼저 자소 사이 틈: 그은 휨 때문에 획끼리 닿으면 휨을 한 단계씩 줄인 자모(`levels`)로 바꾼다. 그다음 배치 값 넷: 상자를 옮긴다.
 * 기준은 같은 글자를 기본 획(저장소) + 지금 보선으로 푼 것 — 보선이 움직이면 기준도 따라간다.
 * 당긴 기록은 `onPulls`로 올린다. 저장하지 않고 제품 값도 안 바꾼다.
 */
export function FencedGlyph({ char, size, className, strokeColorOf, levels, fence, onPulls }: {
  char: string
  size: number
  className?: string
  strokeColorOf?: (source: ResolvedStrokeInkSource) => string | undefined
  /** 휨 단계별 자모 덮어쓰기(앞이 그은 그대로). 없으면 저장소 자모 그대로. */
  levels?: readonly GlyphOverride[]
  fence: FenceOptions
  onPulls?: (index: number, pulls: readonly FencePull[]) => void
}) {
  const storedChoseong = useJamoStore((state) => state.choseong)
  const storedJungseong = useJamoStore((state) => state.jungseong)
  const storedJongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const baseSyllable = useMemo(() => decomposeSyllable(char, storedChoseong, storedJungseong, storedJongseong), [char, storedChoseong, storedJungseong, storedJongseong])
  const layout = baseSyllable.layoutType
  const globalStyle = useEffectiveGlobalStyle(layout)
  const padding = useMemo(() => mergePadding(globalPadding, paddingOverrides[layout]), [globalPadding, paddingOverrides, layout])
  const schema = useMemo(() => ({ ...schemas[layout], padding, designBodyPadding: padding }), [schemas, layout, padding])
  // 배치는 훅 밖 함수로 푼다 — 휨을 줄인 자모는 틈이 모자랄 때만 풀어 본다(글자마다 다섯 벌을 다 풀면 폰에서 느리다).
  const { bundle } = useNotoModel()
  const identity = useMemo(() => bundle ? identityOfSyllable(baseSyllable) : null, [bundle, baseSyllable])
  const delta = useLayoutDelta(identity)
  const { on, line, shake, index } = fence

  const result = useMemo<{ syllable: DecomposedSyllable; boxes: Partial<Record<Part, BoxConfig>>; pulls: readonly FencePull[] }>(() => {
    const place = (syllable: DecomposedSyllable) => resolved(syllable, contextPlacementOf({ bundle, identity, syllable, schema, ends: globalStyle, delta }).placement, globalStyle)
    const syllableAt = (level: number) => {
      const override = levels?.[level]
      return override ? decomposeSyllable(char, { ...storedChoseong, ...override.choseong }, { ...storedJungseong, ...override.jungseong }, { ...storedJongseong, ...override.jongseong }) : baseSyllable
    }
    const reference = place(baseSyllable)
    const drawn = new Map<number, { syllable: DecomposedSyllable; placed: ReturnType<typeof resolved> }>()
    const at = (level: number) => {
      let made = drawn.get(level)
      if (!made) { const syllable = syllableAt(level); made = { syllable, placed: place(syllable) }; drawn.set(level, made) }
      return made
    }
    // 1) 자소 사이 틈: 휨을 줄여 맞춘다. 끈 채로도 재서 "켜면 얼마나"를 알려 준다.
    const bend = levels && levels.length > 1
      ? pickBend((level) => (level < levels.length ? clearanceRatio(at(level).placed.clearances, reference.clearances) : -Infinity), GOTHIC_FENCE.lines[line].clearanceFloor)
      : { level: 0, pull: null }
    const { syllable, placed } = at(on ? bend.level : 0)
    // 2) 배치 값 넷: 상자를 옮긴다.
    const shaken = shakenBoxes(placed.boxes, layout, index, shake)
    const now = shake === 0 ? placed.measure : resolved(syllable, { kind: 'boxes', boxes: shaken }, globalStyle).measure
    const bendPulls = bend.pull ? [bend.pull] : NO_PULLS
    if (!now || !reference.measure) return { syllable, boxes: shaken, pulls: bendPulls }
    // 몸 높이는 지금 네모꼴(위아래 여백)에서 — 네모꼴을 옮기면 울타리 단위도 따라간다. 잉크 몸은 네모꼴보다 획 굵기만큼 크다(엔진 측정 0.905).
    const correction = correctGlyph({ layout, now, reference: reference.measure, line, body: bodyOf(padding) })
    return { syllable, boxes: on ? movedBoxes(shaken, correction.moves) : shaken, pulls: [...bendPulls, ...correction.pulls] }
  }, [char, levels, baseSyllable, storedChoseong, storedJungseong, storedJongseong, bundle, identity, delta, schema, globalStyle, layout, on, line, shake, index, padding])

  useEffect(() => { onPulls?.(index, result.pulls) }, [onPulls, index, result.pulls])

  return (
    <SvgRenderer
      syllable={result.syllable}
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
