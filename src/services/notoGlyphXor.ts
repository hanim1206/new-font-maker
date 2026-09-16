import polygonClipping from 'polygon-clipping'
import type { GlobalStyle } from '../stores/globalStyleStore'
import type { DecomposedSyllable, DeepReadonly, InkRegion, JamoData, LayoutSchema, LayoutType } from '../types'
import { weightToMultiplier } from '../utils/globalStyleUtils'
import { decomposeSyllable } from '../utils/hangulUtils'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import { multiPolygonArea, unionOf } from './notoFitReport'
import { notoOutlineToInkRegions } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'

/**
 * 글자 단위 Noto 대비 편차. 앱 잉크(획·레이아웃·전역 스타일, 화면·OTF와 같은 파이프라인)와
 * Noto 글자 윤곽의 xor 면적 비율. 편집 화면의 숫자와 격자 색칠이 같은 함수를 쓴다.
 */

const HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const
const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }

export interface GlyphXor { xorRatio: number; inkRatio: number }

/** 앱 잉크(현재 획·레이아웃·전역 스타일)를 화면·OTF와 같은 파이프라인으로 만든다. */
export function appGlyphInkRegions(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: GlobalStyle): { ok: true; regions: readonly DeepReadonly<InkRegion>[] } | { ok: false; message: string } {
  const resolved = resolveGlyphInkPrimitives({
    syllable, placement: { kind: 'schema', schema },
    weightMultiplier: weightToMultiplier(globalStyle.weight),
    globalLinecap: globalStyle.linecap, globalLinejoin: globalStyle.linejoin,
    horizontalInkBounds: HORIZONTAL_INK_BOUNDS,
  })
  if (!resolved.primitives.length) return { ok: false, message: '앱 획이 없습니다.' }
  const ink = materializeFinalGlyphInk(resolved.primitives, globalStyle.strokeStyle, INK_OPTIONS)
  return ink.ok ? { ok: true, regions: ink.ink.regions } : { ok: false, message: ink.message }
}

export function ghostXorRatio(app: readonly DeepReadonly<InkRegion>[], ghost: readonly DeepReadonly<InkRegion>[]): GlyphXor | null {
  const mine = unionOf(app)
  const theirs = unionOf(ghost)
  const ghostArea = multiPolygonArea(theirs)
  if (ghostArea <= 0) return null
  return { xorRatio: multiPolygonArea(polygonClipping.xor(mine, theirs)) / ghostArea, inkRatio: multiPolygonArea(mine) / ghostArea }
}

export interface GlyphXorInput {
  char: string
  outline: DeepReadonly<NotoOutline>
  jamoMaps: { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }
  schemas: Readonly<Record<LayoutType, LayoutSchema>>
  globalStyle: GlobalStyle
}

/** 한 글자를 앱 규칙으로 그려 Noto와 비교한다. 격자 전수 리포트와 편집 화면이 같이 쓴다. */
export function glyphXorAgainstNoto(input: GlyphXorInput): { ok: true; value: GlyphXor } | { ok: false; message: string } {
  let syllable: DecomposedSyllable
  try { syllable = decomposeSyllable(input.char, input.jamoMaps.choseong, input.jamoMaps.jungseong, input.jamoMaps.jongseong) }
  catch (failure) { return { ok: false, message: failure instanceof Error ? failure.message : '분해 실패' } }
  const schema = input.schemas[syllable.layoutType]
  if (!schema) return { ok: false, message: `${syllable.layoutType} 레이아웃 스키마가 없습니다.` }
  const app = appGlyphInkRegions(syllable, schema, input.globalStyle)
  if (!app.ok) return app
  const ghost = notoOutlineToInkRegions(input.outline)
  if (!ghost.ok) return { ok: false, message: ghost.message }
  const value = ghostXorRatio(app.regions, ghost.regions)
  return value ? { ok: true, value } : { ok: false, message: 'Noto 고스트 면적이 0입니다.' }
}
