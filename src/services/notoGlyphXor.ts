import * as polygonBoolean from './polygonBoolean'
import type { GlobalStyle } from '../stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, DeepReadonly, InkRegion, JamoData, LayoutSchema, LayoutType, Part } from '../types'
import { weightToMultiplier } from '../utils/globalStyleUtils'
import { decomposeSyllable } from '../utils/hangulUtils'
import { identityOfSyllable, resolveContextBoxes } from './contextBoxResolver'
import type { ContextBoxDelta, ContextModel } from './contextBoxResolver'
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

export interface GlyphXor { xorRatio: number; inkRatio: number; placement: GlyphInkPlacement['kind'] }

/** 글자를 어디에 놓을지. 모델 상자(칸 해석 함수)거나 split/padding 스키마. */
export type GlyphInkPlacement = { kind: 'schema'; schema: LayoutSchema } | { kind: 'boxes'; boxes: Partial<Record<Part, BoxConfig>> }

/** 모델이 있고 칸이 완전히 풀리면 모델 상자, 아니면 스키마. 렌더러·편집 화면·리포트가 같은 규칙. */
export function glyphPlacementOf(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: Pick<GlobalStyle, 'linecap' | 'linejoin'>, model?: ContextModel | null, delta?: ContextBoxDelta): GlyphInkPlacement {
  const identity = model ? identityOfSyllable(syllable) : null
  if (!identity || !model) return { kind: 'schema', schema }
  const resolved = resolveContextBoxes({ identity, model, syllable, ends: { linecap: globalStyle.linecap, linejoin: globalStyle.linejoin }, delta })
  return resolved.complete ? { kind: 'boxes', boxes: resolved.boxes } : { kind: 'schema', schema }
}

/** 앱 잉크(현재 획·배치·전역 스타일)를 화면·OTF와 같은 파이프라인으로 만든다. */
export function appGlyphInkRegions(syllable: DecomposedSyllable, placement: GlyphInkPlacement, globalStyle: GlobalStyle): { ok: true; regions: readonly DeepReadonly<InkRegion>[] } | { ok: false; message: string } {
  const resolved = resolveGlyphInkPrimitives({
    syllable, placement,
    weightMultiplier: weightToMultiplier(globalStyle.weight),
    globalLinecap: globalStyle.linecap, globalLinejoin: globalStyle.linejoin,
    horizontalInkBounds: HORIZONTAL_INK_BOUNDS,
  })
  if (!resolved.primitives.length) return { ok: false, message: '앱 획이 없습니다.' }
  const ink = materializeFinalGlyphInk(resolved.primitives, globalStyle.strokeStyle, INK_OPTIONS)
  return ink.ok ? { ok: true, regions: ink.ink.regions } : { ok: false, message: ink.message }
}

export function ghostXorRatio(app: readonly DeepReadonly<InkRegion>[], ghost: readonly DeepReadonly<InkRegion>[], placement: GlyphInkPlacement['kind'] = 'schema'): GlyphXor | null {
  const mine = unionOf(app)
  const theirs = unionOf(ghost)
  const ghostArea = multiPolygonArea(theirs)
  if (ghostArea <= 0) return null
  return { xorRatio: multiPolygonArea(polygonBoolean.xor(mine, theirs)) / ghostArea, inkRatio: multiPolygonArea(mine) / ghostArea, placement }
}

export interface GlyphXorInput {
  char: string
  outline: DeepReadonly<NotoOutline>
  jamoMaps: { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }
  schemas: Readonly<Record<LayoutType, LayoutSchema>>
  globalStyle: GlobalStyle
  /** 있으면 칸 해석 함수의 모델 상자로 놓는다(못 풀면 스키마). */
  model?: ContextModel | null
}

/** 한 글자를 앱 규칙으로 그려 Noto와 비교한다. 격자 전수 리포트와 편집 화면이 같이 쓴다. */
export function glyphXorAgainstNoto(input: GlyphXorInput): { ok: true; value: GlyphXor } | { ok: false; message: string } {
  let syllable: DecomposedSyllable
  try { syllable = decomposeSyllable(input.char, input.jamoMaps.choseong, input.jamoMaps.jungseong, input.jamoMaps.jongseong) }
  catch (failure) { return { ok: false, message: failure instanceof Error ? failure.message : '분해 실패' } }
  const schema = input.schemas[syllable.layoutType]
  if (!schema) return { ok: false, message: `${syllable.layoutType} 레이아웃 스키마가 없습니다.` }
  const placement = glyphPlacementOf(syllable, schema, input.globalStyle, input.model)
  const app = appGlyphInkRegions(syllable, placement, input.globalStyle)
  if (!app.ok) return app
  const ghost = notoOutlineToInkRegions(input.outline)
  if (!ghost.ok) return { ok: false, message: ghost.message }
  const value = ghostXorRatio(app.regions, ghost.regions, placement.kind)
  return value ? { ok: true, value } : { ok: false, message: 'Noto 고스트 면적이 0입니다.' }
}
