/**
 * 폰트 내보내기 유틸리티
 *
 * 3개 Zustand 스토어(jamo, layout, globalStyle)에서 데이터를 수집하여
 * strokeToOutline이 처리할 수 있는 GlyphData 형태로 변환.
 *
 * 공통 잉크 resolver의 해석 결과를 기존 OTF GlyphData로 투영:
 * - 실효 패딩 계산 (globalPadding + override 머지)
 * - 공통 자모 채널·박스·문맥 안전·linecap/linejoin 해석
 * - Design Body 좌측 inset만 OTF 글리프 원점으로 투영
 */
import type {
  BoxConfig, BrushStyle, DecomposedSyllable, GlyphInkPlacement, LayoutSchema, Padding, ResolvedInkPrimitive,
  StrokeDataV2, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle,
} from '../types'
import { useJamoStore } from '../stores/jamoStore'
import { mergeLayoutPadding, useLayoutStore } from '../stores/layoutStore'
import { isCounterKeepOn, resolveEffectiveStyle, useGlobalStyleStore, weightToMultiplier } from '../stores/globalStyleStore'
import { groupBeakResolverOf, useJamoGroupStore, type GroupBeakResolver } from '../stores/jamoGroupStore'
import { stemBeakGroupOf, type StemBeakStyle } from './stemBeak'
import type { GlobalStyle } from '../stores/globalStyleStore'
import { decomposeSyllableWithOverrides } from '../utils/hangulUtils'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import { BASELINE_Y, hangulAdvance, hangulOriginX } from './fontMetrics'
import { stemScaleOf } from './strokeRenderGeometry'

// ===== 상수 =====

export { UPM } from './fontMetrics'
/** 캔버스 위 끝이 놓이는 폰트 y. 글리프 좌표 변환 기준. 값은 `fontMetrics.BASELINE_Y` 한 곳에서 온다. */
export const ASCENDER = BASELINE_Y
export const DESCENDER = -120
export const DEFAULT_ADVANCE_WIDTH = 1000
export const OS2_UNICODE_RANGE_1 = 0x00000001
export const OS2_UNICODE_RANGE_2 = 0x01100000
export const OS2_CODE_PAGE_RANGE_1 = 1 << 19

// ===== 타입 정의 =====

/** 해석된 획 (박스 + linecap 결정 완료) */
export interface ResolvedStroke {
  stroke: StrokeDataV2
  box: BoxConfig
  effectiveLinecap: StrokeLinecap
  effectiveLinejoin: StrokeLinejoin
  /** 부리의 닿음 판정을 같이 볼 묶음(같은 자소의 같은 채널). 없으면 획마다 따로 본다. */
  beakGroup?: string
  /** 사용자 묶음의 부리. 없으면 글자의 `stemBeak`(전역)을 따른다. */
  beakStyle?: StemBeakStyle
}

/** 단일 폰트 글리프에 필요한 모든 데이터 */
export interface GlyphData {
  unicode: number
  char: string
  advanceWidth: number
  strokes: ResolvedStroke[]
  weightMultiplier: number
  slant: number
  brush: BrushStyle
  strokeStyle: StrokeRenderStyle
  /** 세로줄기 부리. 없으면 꺼짐. */
  stemBeak?: StemBeakStyle
  /** 자소 상자를 어디서 가져왔는지. 모델 상자를 기대했는데 스키마로 떨어진 글자를 세는 데 쓴다. */
  placementKind: GlyphInkPlacement['kind']
}

/**
 * 자소 상자를 정하는 함수. 화면의 칸 해석(모델 상자 + 레이아웃 Δ)을 추출기에 그대로 넘기는 자리다.
 * 모델과 Δ 스토어는 `src-next`에 있어 추출기가 직접 읽지 않고 호출자가 넣어 준다.
 * 없으면 split/padding 스키마로 그린다.
 */
export type GlyphPlacementResolver = (
  syllable: DecomposedSyllable,
  schema: LayoutSchema,
  /** `stemScale`: 네모꼴 자동 보정의 세로줄기 배율. 사용자 네모꼴에서 상자를 다듬을 때 쓴다. */
  ends: { linecap: StrokeLinecap; linejoin: StrokeLinejoin; stemScale?: number },
) => GlyphInkPlacement

/** 읽기 전용 공통 primitive를 기존 OTF facade로 무복사 연결한다. */
function projectCenterlinesToLegacyOtfStrokes(
  primitives: readonly ResolvedInkPrimitive[],
  originX: number,
  groupBeakOf: GroupBeakResolver,
): ResolvedStroke[] {
  return primitives.map((primitive) => {
    if (primitive.kind !== 'centerline') {
      throw new Error('OTF legacy facade does not support region primitives yet')
    }
    return {
      // 기존 윤곽 함수는 mutable 타입을 받지만 해당 경로는 stroke를 읽기만 한다.
      stroke: primitive.stroke as StrokeDataV2,
      box: { ...primitive.box, x: primitive.box.x - originX },
      effectiveLinecap: primitive.effectiveLinecap,
      effectiveLinejoin: primitive.effectiveLinejoin,
      beakGroup: stemBeakGroupOf(primitive.source),
      beakStyle: groupBeakOf(primitive.source),
    }
  })
}

// ===== 글리프 데이터 수집 =====

/**
 * 단일 문자에 대한 글리프 데이터 수집
 *
 * @param char 한글 문자 (음절 또는 독립 자모)
 * @returns GlyphData 또는 null (비한글)
 */
export function collectGlyphDataForChar(char: string): GlyphData | null {
  return collectGlyphDataWithPlacement(char)
}

/**
 * 저장된 값 대신 잠깐 그려 볼 조건. 스토어는 안 건드린다 — 실험실이 가로 × 굵기 여러 칸을 한 화면에 그릴 때 쓴다.
 * `padding`은 폰트 전체 패딩(레이아웃별 덮어쓰기는 그대로 얹힌다).
 * `counterKeep`: 속공간 지키기 강제(끄기/켜기). 없으면 실효 스타일을 따른다 — 손으로 층을 얹는 실험실은 `false`로 꺼야 이중 적용이 안 된다.
 */
export interface GlyphDataCondition { padding?: Padding; weight?: number; counterKeep?: boolean }

/** `collectGlyphDataForChar`에 상자 출처만 바꿔 끼운 것. 나머지 해석(패딩·스타일·원점·폭)은 같다. */
export function collectGlyphDataWithPlacement(char: string, placementOf?: GlyphPlacementResolver, condition?: GlyphDataCondition): GlyphData | null {
  const code = char.charCodeAt(0)

  // 범위 체크
  const isSyllable = code >= 0xAC00 && code <= 0xD7A3
  const isConsonant = code >= 0x3131 && code <= 0x314E
  const isVowel = code >= 0x314F && code <= 0x3163
  if (!isSyllable && !isConsonant && !isVowel) return null

  // 스토어에서 상태 읽기 (fontDataBridge.ts 패턴)
  const jamoState = useJamoStore.getState()
  const layoutState = useLayoutStore.getState()
  const styleState = useGlobalStyleStore.getState()

  // 음절 분해 (오버라이드 자동 적용)
  const syllable = decomposeSyllableWithOverrides(
    char,
    jamoState.choseong,
    jamoState.jungseong,
    jamoState.jongseong
  )

  const layoutType = syllable.layoutType

  // 실효 패딩을 포함한 스키마를 공통 resolver에 전달한다.
  const schema = layoutState.layoutSchemas[layoutType]
  const effectivePadding = mergeLayoutPadding(
    condition?.padding ?? layoutState.globalPadding,
    layoutState.paddingOverrides,
    layoutType
  )
  // 실효 글로벌 스타일. 화면과 같은 입구(`resolveEffectiveStyle`)를 지나고, 조건이 있으면 그 굵기로 같은 해석을 한다.
  const effectiveStyle: GlobalStyle = resolveEffectiveStyle(
    condition?.weight === undefined ? styleState.style : { ...styleState.style, weight: condition.weight },
    styleState.exclusions,
    layoutType,
    effectivePadding,
  )
  const schemaWithPadding = { ...schema, padding: effectivePadding, designBodyPadding: effectivePadding }
  const weightMultiplier = weightToMultiplier(effectiveStyle.weight)
  // Design Body/advance와 Ink Bounds를 분리한다. 편집한 돌출 획을 Body에
  // 다시 맞춰 축소하지 않고 화면과 같은 EM 경계 안에서 출력한다.
  const placement: GlyphInkPlacement = placementOf
    ? placementOf(syllable, schemaWithPadding, { linecap: effectiveStyle.linecap, linejoin: effectiveStyle.linejoin, stemScale: stemScaleOf(effectiveStyle.strokeStyle) })
    : { kind: 'schema', schema: schemaWithPadding }
  const resolvedInk = resolveGlyphInkPrimitives({
    syllable,
    placement,
    weightMultiplier,
    globalLinecap: effectiveStyle.linecap,
    globalLinejoin: effectiveStyle.linejoin,
    horizontalInkBounds: { min: 0, max: 1 },
    // 속공간 지키기 — 화면(SvgRenderer)과 같은 조건으로 켠다. 실험실은 조건으로 끈다.
    counterKeep: (condition?.counterKeep ?? isCounterKeepOn(effectiveStyle))
      ? { stemScale: stemScaleOf(effectiveStyle.strokeStyle) }
      : undefined,
  })

  // 글자 폭과 원점은 노토 비율(왼 50 : 몸통 840 : 오른 30, `fontMetrics`). 몸통 왼쪽에서 왼 여백만큼 앞이 원점이다.
  const originX = hangulOriginX(effectivePadding)
  const outputStrokes = projectCenterlinesToLegacyOtfStrokes(resolvedInk.primitives, originX, groupBeakResolverOf(useJamoGroupStore.getState().groups))
  if (outputStrokes.length === 0) return null
  const advanceWidth = hangulAdvance(effectivePadding, effectiveStyle.letterSpacing)

  return {
    unicode: code,
    char,
    advanceWidth,
    strokes: outputStrokes,
    weightMultiplier,
    slant: effectiveStyle.slant,
    brush: effectiveStyle.brush,
    strokeStyle: effectiveStyle.strokeStyle,
    stemBeak: effectiveStyle.stemBeak,
    placementKind: placement.kind,
  }
}

/**
 * 전체 폰트에 필요한 모든 글리프 데이터 수집
 *
 * 11,172 완성형 음절 (0xAC00-0xD7A3) +
 * 30 독립 자음 (0x3131-0x314E) +
 * 21 독립 모음 (0x314F-0x3163)
 * = 최대 11,223 글리프
 *
 * @param onProgress 진행 콜백 (completed, total)
 * @returns GlyphData 배열 (비어있는 글리프 제외)
 */
export function collectAllGlyphData(
  onProgress?: (completed: number, total: number) => void,
  placementOf?: GlyphPlacementResolver,
): GlyphData[] {
  const result: GlyphData[] = []

  // 독립 자음 (ㄱ-ㅎ, 30개)
  for (let code = 0x3131; code <= 0x314E; code++) {
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataWithPlacement(char, placementOf)
    if (glyph) result.push(glyph)
  }

  // 독립 모음 (ㅏ-ㅣ, 21개)
  for (let code = 0x314F; code <= 0x3163; code++) {
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataWithPlacement(char, placementOf)
    if (glyph) result.push(glyph)
  }

  // 완성형 음절 (가-힣, 11172개)
  const totalSyllables = 11172
  const jamos = result.length
  const total = jamos + totalSyllables

  for (let i = 0; i < totalSyllables; i++) {
    const code = 0xAC00 + i
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataWithPlacement(char, placementOf)
    if (glyph) result.push(glyph)

    // 진행 보고 (100개마다)
    if (onProgress && (i % 100 === 0 || i === totalSyllables - 1)) {
      onProgress(jamos + i + 1, total)
    }
  }

  return result
}

/** 폰트에 넣는 글자 전부, 글리프 순서대로(독립 자음 → 독립 모음 → 완성형 음절). */
export function allExportChars(): string[] {
  const chars: string[] = []
  for (let code = 0x3131; code <= 0x3163; code++) chars.push(String.fromCharCode(code))
  for (let code = 0xAC00; code <= 0xD7A3; code++) chars.push(String.fromCharCode(code))
  return chars
}

/**
 * 자모 문자 → 유니코드 코드 포인트
 * (자모 호환 영역 0x3131-0x3163)
 */
export function jamoToUnicode(char: string): number | undefined {
  const code = char.charCodeAt(0)
  if (code >= 0x3131 && code <= 0x3163) return code
  return undefined
}
