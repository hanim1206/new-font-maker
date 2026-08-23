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
  BoxConfig, BrushStyle, Padding, ResolvedInkPrimitive, StrokeDataV2, StrokeLinecap, StrokeLinejoin,
  StrokeRenderStyle, LayoutType,
} from '../types'
import { useJamoStore } from '../stores/jamoStore'
import { useLayoutStore } from '../stores/layoutStore'
import { useGlobalStyleStore, weightToMultiplier } from '../stores/globalStyleStore'
import type { GlobalStyle } from '../stores/globalStyleStore'
import { decomposeSyllableWithOverrides } from '../utils/hangulUtils'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'

// ===== 상수 =====

export const UPM = 1000
export const ASCENDER = 880
export const DESCENDER = -120
export const DEFAULT_ADVANCE_WIDTH = 1000
export const DEFAULT_SPACE_ADVANCE = 500
export const DEFAULT_DESIGN_BODY_WIDTH = 0.85
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
}

export function calculateSpaceAdvance(padding: Padding): number {
  const bodyWidth = 1 - padding.left - padding.right
  return Math.round(DEFAULT_SPACE_ADVANCE * bodyWidth / DEFAULT_DESIGN_BODY_WIDTH)
}

export function getCurrentSpaceAdvance(): number {
  return calculateSpaceAdvance(useLayoutStore.getState().globalPadding)
}

// ===== 실효 패딩 계산 (layoutStore L128-131 미러링) =====

function computeEffectivePadding(
  globalPadding: Padding,
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>,
  layoutType: LayoutType
): Padding {
  const override = paddingOverrides[layoutType]
  if (!override) return { ...globalPadding }
  return { ...globalPadding, ...override }
}

/** 읽기 전용 공통 primitive를 기존 OTF facade로 무복사 연결한다. */
function projectCenterlinesToLegacyOtfStrokes(
  primitives: readonly ResolvedInkPrimitive[],
  originX: number,
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

  // 실효 글로벌 스타일 (레이아웃별 제외 적용)
  const effectiveStyle: GlobalStyle = styleState.getEffectiveStyle(layoutType)

  // 실효 패딩을 포함한 스키마를 공통 resolver에 전달한다.
  const schema = layoutState.layoutSchemas[layoutType]
  const effectivePadding = computeEffectivePadding(
    layoutState.globalPadding,
    layoutState.paddingOverrides,
    layoutType
  )
  const schemaWithPadding = { ...schema, padding: effectivePadding, designBodyPadding: effectivePadding }
  const weightMultiplier = weightToMultiplier(effectiveStyle.weight)
  // Design Body/advance와 Ink Bounds를 분리한다. 편집한 돌출 획을 Body에
  // 다시 맞춰 축소하지 않고 화면과 같은 EM 경계 안에서 출력한다.
  const resolvedInk = resolveGlyphInkPrimitives({
    syllable,
    placement: { kind: 'schema', schema: schemaWithPadding },
    weightMultiplier,
    globalLinecap: effectiveStyle.linecap,
    globalLinejoin: effectiveStyle.linejoin,
    horizontalInkBounds: { min: 0, max: 1 },
  })

  // Design Body의 가로폭을 실제 조판 폭으로 사용하고, 좌측 inset을 글리프 원점으로 옮긴다.
  const bodyWidth = 1 - effectivePadding.left - effectivePadding.right
  const originX = effectivePadding.left
  const outputStrokes = projectCenterlinesToLegacyOtfStrokes(resolvedInk.primitives, originX)
  if (outputStrokes.length === 0) return null
  const advanceWidth = Math.round(UPM * (bodyWidth + effectiveStyle.letterSpacing))

  return {
    unicode: code,
    char,
    advanceWidth,
    strokes: outputStrokes,
    weightMultiplier,
    slant: effectiveStyle.slant,
    brush: effectiveStyle.brush,
    strokeStyle: effectiveStyle.strokeStyle,
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
): GlyphData[] {
  const result: GlyphData[] = []

  // 독립 자음 (ㄱ-ㅎ, 30개)
  for (let code = 0x3131; code <= 0x314E; code++) {
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataForChar(char)
    if (glyph) result.push(glyph)
  }

  // 독립 모음 (ㅏ-ㅣ, 21개)
  for (let code = 0x314F; code <= 0x3163; code++) {
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataForChar(char)
    if (glyph) result.push(glyph)
  }

  // 완성형 음절 (가-힣, 11172개)
  const totalSyllables = 11172
  const jamos = result.length
  const total = jamos + totalSyllables

  for (let i = 0; i < totalSyllables; i++) {
    const code = 0xAC00 + i
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataForChar(char)
    if (glyph) result.push(glyph)

    // 진행 보고 (100개마다)
    if (onProgress && (i % 100 === 0 || i === totalSyllables - 1)) {
      onProgress(jamos + i + 1, total)
    }
  }

  return result
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
