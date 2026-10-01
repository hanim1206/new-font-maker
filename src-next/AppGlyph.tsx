import { useMemo } from 'react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { JamoData, LayoutSchema, Padding, ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { useContextPlacement } from './notoModel'

function withEffectivePadding(
  schema: LayoutSchema,
  globalPadding: Padding,
  override: Partial<Padding> | undefined,
): LayoutSchema {
  const padding = mergePadding(globalPadding, override)
  return { ...schema, padding, designBodyPadding: padding }
}

/**
 * 지금 프로젝트의 획으로 그린 글자 하나. 자모 획 + 칸 해석(모델 상자 + 저장된 배치 Δ) + 전역 스타일.
 * 자소 탭 카드와 검수 격자가 같이 쓴다. 글자별 Noto 윤곽은 받지 않는다.
 * `upright`면 전역 기울기를 빼고 그린다 — 검수 격자 · 범위 고르기처럼 레이아웃(직각 상자)을 보는 화면용. 굵기는 그대로 따른다.
 * `jungseongOverride`는 저장 전 미리보기 — 스토어의 홀자 대신 이 자모로 그린다(반영 고르기 카드).
 */
export function AppGlyph({ char, size, className, upright = false, strokeColorOf, jungseongOverride }: { char: string; size: number; className?: string; upright?: boolean; strokeColorOf?: (source: ResolvedStrokeInkSource) => string | undefined; jungseongOverride?: Readonly<Record<string, JamoData>> }) {
  const choseong = useJamoStore((state) => state.choseong)
  const storedJungseong = useJamoStore((state) => state.jungseong)
  const jungseong = useMemo(() => jungseongOverride ? { ...storedJungseong, ...jungseongOverride } : storedJungseong, [storedJungseong, jungseongOverride])
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(
    () => decomposeSyllable(char, choseong, jungseong, jongseong),
    [char, choseong, jungseong, jongseong],
  )
  const effectiveStyle = useEffectiveGlobalStyle(syllable.layoutType)
  const globalStyle = useMemo(() => upright && effectiveStyle.slant !== 0 ? { ...effectiveStyle, slant: 0 } : effectiveStyle, [effectiveStyle, upright])
  const schema = withEffectivePadding(
    schemas[syllable.layoutType],
    globalPadding,
    paddingOverrides[syllable.layoutType],
  )
  const { placement } = useContextPlacement(syllable, schema, globalStyle)

  return (
    <SvgRenderer
      syllable={syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
      size={size}
      className={className}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={strokeColorOf}
    />
  )
}
