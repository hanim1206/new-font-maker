import { useMemo } from 'react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { BoxConfig, DecomposedSyllable, JamoData, LayoutSchema, Padding, Part, ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { haloPlacementOf } from './haloPlacement'
import { useContextPlacement } from './notoModel'

function withEffectivePadding(
  schema: LayoutSchema,
  globalPadding: Padding,
  override: Partial<Padding> | undefined,
): LayoutSchema {
  const padding = mergePadding(globalPadding, override)
  return { ...schema, padding, designBodyPadding: padding }
}

/** 부위 상자를 옮길 양(em 비율). 실험지가 배치 값을 일부러 흔들 때만 쓴다. */
export type PartShift = Partial<Record<Part, { dx?: number; dy?: number }>>

function shiftedBoxes(boxes: Partial<Record<Part, BoxConfig>>, shift: PartShift | undefined): Partial<Record<Part, BoxConfig>> {
  if (!shift) return boxes
  const out = { ...boxes }
  for (const [part, move] of Object.entries(shift) as [Part, { dx?: number; dy?: number }][]) {
    const box = out[part]
    if (box && move) out[part] = { ...box, x: box.x + (move.dx ?? 0), y: box.y + (move.dy ?? 0) }
  }
  return out
}

/**
 * 지금 프로젝트의 획으로 그린 글자 하나. 자모 획 + 칸 해석(모델 상자 + 저장된 배치 Δ) + 전역 스타일.
 * 자소 탭 카드와 검수 격자가 같이 쓴다. 글자별 Noto 윤곽은 받지 않는다.
 * 글자 잉크는 어디서나 전역 기울기를 따른다(10-07). 곧게 두는 것은 상자 · 보선뿐이다.
 * `jungseongOverride`는 저장 전 미리보기 — 스토어의 홀자 대신 이 자모로 그린다(반영 고르기 카드). `choseongOverride`도 같다(변형 트리의 숨쉬는 획). `jongseongOverride`도 같다(획 긋기 시험판).
 * `placementShift`는 풀린 상자를 부위별로 옮긴다(울타리 실험지). 상자로 풀리지 않은 글자(스키마)에는 안 듣는다.
 */
export function AppGlyph({ char, size, className, strokeColorOf, jungseongOverride, choseongOverride, jongseongOverride, placementShift }: { char: string; placementShift?: (syllable: DecomposedSyllable) => PartShift | undefined; size: number; className?: string; strokeColorOf?: (source: ResolvedStrokeInkSource) => string | undefined; jungseongOverride?: Readonly<Record<string, JamoData>>; choseongOverride?: Readonly<Record<string, JamoData>>; jongseongOverride?: Readonly<Record<string, JamoData>> }) {
  const storedChoseong = useJamoStore((state) => state.choseong)
  const choseong = useMemo(() => choseongOverride ? { ...storedChoseong, ...choseongOverride } : storedChoseong, [storedChoseong, choseongOverride])
  const storedJungseong = useJamoStore((state) => state.jungseong)
  const jungseong = useMemo(() => jungseongOverride ? { ...storedJungseong, ...jungseongOverride } : storedJungseong, [storedJungseong, jungseongOverride])
  const storedJongseong = useJamoStore((state) => state.jongseong)
  const jongseong = useMemo(() => jongseongOverride ? { ...storedJongseong, ...jongseongOverride } : storedJongseong, [storedJongseong, jongseongOverride])
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(
    () => decomposeSyllable(char, choseong, jungseong, jongseong),
    [char, choseong, jungseong, jongseong],
  )
  const globalStyle = useEffectiveGlobalStyle(syllable.layoutType)
  const schema = withEffectivePadding(
    schemas[syllable.layoutType],
    globalPadding,
    paddingOverrides[syllable.layoutType],
  )
  const { placement: modelPlacement } = useContextPlacement(syllable, schema, globalStyle)
  // 흐림 선: OTF 추출(`placementResolverOf`)과 같은 함수로 글자마다 다시 센다 — 폰트 탭 · 검수 격자와 파일이 같다.
  const { weight, linecap, linejoin, strokeStyle, halo } = globalStyle
  const bodyRight = 1 - (schema.padding?.right ?? 0)
  const placement = useMemo(() => haloPlacementOf(syllable, modelPlacement, { weight, linecap, linejoin, strokeStyle, halo }, bodyRight), [syllable, modelPlacement, weight, linecap, linejoin, strokeStyle, halo, bodyRight])
  const shift = placementShift?.(syllable)
  const boxes = useMemo(() => placement.kind === 'boxes' ? shiftedBoxes(placement.boxes, shift) : undefined, [placement, shift])

  return (
    <SvgRenderer
      syllable={syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={boxes}
      size={size}
      className={className}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={strokeColorOf}
    />
  )
}
