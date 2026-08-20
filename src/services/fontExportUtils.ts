/**
 * 폰트 내보내기 유틸리티
 *
 * 3개 Zustand 스토어(jamo, layout, globalStyle)에서 데이터를 수집하여
 * strokeToOutline이 처리할 수 있는 GlyphData 형태로 변환.
 *
 * SvgRenderer.tsx의 렌더링 로직을 정확히 복제:
 * - 실효 패딩 계산 (globalPadding + override 머지)
 * - calculateBoxes() 박스 계산
 * - 실제 잉크 경계 기준 균일 스케일 적용
 * - 혼합중성 horizontalStrokes/verticalStrokes 분리
 * - 조건부 오버라이드 적용
 * - linecap/linejoin 해석
 */
import type {
  BoxConfig, Part, Padding, StrokeDataV2, StrokeLinecap, StrokeLinejoin,
  LayoutType, LayoutSchema, DecomposedSyllable,
} from '../types'
import { useJamoStore } from '../stores/jamoStore'
import { useLayoutStore } from '../stores/layoutStore'
import { useGlobalStyleStore, weightToMultiplier, resolveLinecap, resolveLinejoin } from '../stores/globalStyleStore'
import type { GlobalStyle } from '../stores/globalStyleStore'
import { calculateBoxes } from '../utils/layoutCalculator'
import { decomposeSyllableWithOverrides } from '../utils/hangulUtils'
import { getJamoRenderBox } from '../utils/jamoGeometry'
import { resolveSyllableContextualInkSafety } from '../utils/contextualInkSafety'

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
}

export type FontLayoutProfile = Partial<Record<LayoutType, LayoutSchema['userPartOverrides']>>

export interface FontExportOverrides {
  /** 신규 보정 화면에서 확정한 레이아웃별 사용자 배치값 */
  layoutProfile?: FontLayoutProfile
}

export function calculateSpaceAdvance(padding: Padding): number {
  const bodyWidth = 1 - padding.left - padding.right
  return Math.round(DEFAULT_SPACE_ADVANCE * bodyWidth / DEFAULT_DESIGN_BODY_WIDTH)
}

export function getCurrentSpaceAdvance(): number {
  return calculateSpaceAdvance(useLayoutStore.getState().globalPadding)
}

// ===== 렌더 순서 (SvgRenderer L56-74 동일) =====

function getRenderOrder(layoutType: LayoutType): Array<'CH' | 'JU' | 'JU_H' | 'JU_V' | 'JO'> {
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

// ===== 파트별 획 + 박스 수집 (SvgRenderer renderPart L158-227 미러링) =====

/**
 * 단일 파트의 ResolvedStroke 배열 생성
 */
function resolvePartStrokes(
  part: Part,
  syllable: DecomposedSyllable,
  boxes: Partial<Record<Part, BoxConfig>>,
  globalLinecap: StrokeLinecap,
  globalLinejoin: StrokeLinejoin,
  weightMultiplier: number,
  horizontalBounds: { min: number; max: number },
): ResolvedStroke[] {
  const result: ResolvedStroke[] = []

  // 혼합중성 JU_H/JU_V 처리 (SvgRenderer L174-199)
  if (part === 'JU_H' && syllable.jungseong) {
    const rawBox = boxes.JU_H
    if (!rawBox) return result
    const strokes = syllable.jungseong.horizontalStrokes || syllable.jungseong.strokes
    if (!strokes || strokes.length === 0) return result
    const box = getJamoRenderBox(syllable.jungseong, strokes, rawBox, weightMultiplier, horizontalBounds)

    for (const stroke of strokes) {
      result.push({
        stroke,
        box,
        effectiveLinecap: resolveLinecap(stroke.linecap, globalLinecap),
        effectiveLinejoin: resolveLinejoin(stroke.linejoin, globalLinejoin),
      })
    }
    return result
  }

  if (part === 'JU_V' && syllable.jungseong) {
    const rawBox = boxes.JU_V
    if (!rawBox) return result
    const strokes = syllable.jungseong.verticalStrokes || syllable.jungseong.strokes
    if (!strokes || strokes.length === 0) return result
    const box = getJamoRenderBox(syllable.jungseong, strokes, rawBox, weightMultiplier, horizontalBounds)

    for (const stroke of strokes) {
      result.push({
        stroke,
        box,
        effectiveLinecap: resolveLinecap(stroke.linecap, globalLinecap),
        effectiveLinejoin: resolveLinejoin(stroke.linejoin, globalLinejoin),
      })
    }
    return result
  }

  // 일반 파트 (CH, JU, JO) (SvgRenderer L202-220)
  const partMap = {
    CH: { jamo: syllable.choseong, box: boxes.CH },
    JU: { jamo: syllable.jungseong, box: boxes.JU },
    JO: { jamo: syllable.jongseong, box: boxes.JO },
  }

  const entry = partMap[part as 'CH' | 'JU' | 'JO']
  if (!entry) return result

  const { jamo, box: rawBox } = entry
  if (!jamo || !rawBox) return result

  // strokes가 없으면 verticalStrokes + horizontalStrokes 합산 (SvgRenderer L213-218)
  let strokes = jamo.strokes
  if (!strokes || strokes.length === 0) {
    const verticalStrokes = jamo.verticalStrokes || []
    const horizontalStrokes = jamo.horizontalStrokes || []
    strokes = [...verticalStrokes, ...horizontalStrokes]
  }
  if (!strokes || strokes.length === 0) return result
  const box = getJamoRenderBox(jamo, strokes, rawBox, weightMultiplier, horizontalBounds)

  for (const stroke of strokes) {
    result.push({
      stroke,
      box,
      effectiveLinecap: resolveLinecap(stroke.linecap, globalLinecap),
      effectiveLinejoin: resolveLinejoin(stroke.linejoin, globalLinejoin),
    })
  }
  return result
}

// ===== 글리프 데이터 수집 =====

/**
 * 단일 문자에 대한 글리프 데이터 수집
 *
 * @param char 한글 문자 (음절 또는 독립 자모)
 * @returns GlyphData 또는 null (비한글)
 */
export function collectGlyphDataForChar(
  char: string,
  overrides: FontExportOverrides = {},
): GlyphData | null {
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

  // 실효 패딩 + 스키마 + 박스 계산 (layoutStore syncConfigFromSchema L134-148 미러링)
  const storedSchema = layoutState.layoutSchemas[layoutType]
  const profile = overrides.layoutProfile?.[layoutType]
  const schema: LayoutSchema = profile === undefined
    ? storedSchema
    : { ...storedSchema, userPartOverrides: profile }
  const effectivePadding = computeEffectivePadding(
    layoutState.globalPadding,
    layoutState.paddingOverrides,
    layoutType
  )
  const schemaWithPadding = { ...schema, padding: effectivePadding, designBodyPadding: effectivePadding }
  const boxes = calculateBoxes(schemaWithPadding, {
    cho: syllable.choseong?.char ?? '',
    jung: syllable.jungseong?.char ?? '',
    jong: syllable.jongseong?.char ?? '',
  }) as Record<Part, BoxConfig>
  const renderSyllable = resolveSyllableContextualInkSafety(syllable, boxes).syllable

  // 렌더 순서에 따라 모든 파트의 획 수집
  const renderOrder = getRenderOrder(layoutType)
  const allStrokes: ResolvedStroke[] = []
  const weightMultiplier = weightToMultiplier(effectiveStyle.weight)
  // Design Body/advance와 Ink Bounds를 분리한다. 편집한 돌출 획을 Body에
  // 다시 맞춰 축소하지 않고 화면과 같은 EM 경계 안에서 출력한다.
  const horizontalBounds = { min: 0, max: 1 }

  for (const part of renderOrder) {
    const partStrokes = resolvePartStrokes(
      part,
      renderSyllable,
      boxes,
      effectiveStyle.linecap,
      effectiveStyle.linejoin,
      weightMultiplier,
      horizontalBounds,
    )
    allStrokes.push(...partStrokes)
  }

  if (allStrokes.length === 0) return null

  // Design Body의 가로폭을 실제 조판 폭으로 사용하고, 좌측 inset을 글리프 원점으로 옮긴다.
  const bodyWidth = 1 - effectivePadding.left - effectivePadding.right
  const originX = effectivePadding.left
  const outputStrokes = allStrokes.map((resolved) => ({
    ...resolved,
    box: { ...resolved.box, x: resolved.box.x - originX },
  }))
  const advanceWidth = Math.round(UPM * (bodyWidth + effectiveStyle.letterSpacing))

  return {
    unicode: code,
    char,
    advanceWidth,
    strokes: outputStrokes,
    weightMultiplier,
    slant: effectiveStyle.slant,
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
  overrides: FontExportOverrides = {},
): GlyphData[] {
  const result: GlyphData[] = []

  // 독립 자음 (ㄱ-ㅎ, 30개)
  for (let code = 0x3131; code <= 0x314E; code++) {
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataForChar(char, overrides)
    if (glyph) result.push(glyph)
  }

  // 독립 모음 (ㅏ-ㅣ, 21개)
  for (let code = 0x314F; code <= 0x3163; code++) {
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataForChar(char, overrides)
    if (glyph) result.push(glyph)
  }

  // 완성형 음절 (가-힣, 11172개)
  const totalSyllables = 11172
  const jamos = result.length
  const total = jamos + totalSyllables

  for (let i = 0; i < totalSyllables; i++) {
    const code = 0xAC00 + i
    const char = String.fromCharCode(code)
    const glyph = collectGlyphDataForChar(char, overrides)
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
