import type { DecomposedSyllable, JamoData, LayoutType } from '../types'
import {
  CHOSEONG_LIST,
  JUNGSEONG_LIST,
  JONGSEONG_LIST,
  VERTICAL_JUNGSEONG,
  HORIZONTAL_JUNGSEONG,
} from '../data/Hangul'

// ===== 중성 분류 =====
export function classifyJungseong(char: string): 'vertical' | 'horizontal' | 'mixed' {
  if ((VERTICAL_JUNGSEONG as readonly string[]).includes(char)) return 'vertical'
  if ((HORIZONTAL_JUNGSEONG as readonly string[]).includes(char)) return 'horizontal'
  return 'mixed'
}

// ===== 음절 분해 =====
export function decomposeSyllable(
  char: string,
  choseongMap: Record<string, JamoData>,
  jungseongMap: Record<string, JamoData>,
  jongseongMap: Record<string, JamoData>
): DecomposedSyllable {
  const code = char.charCodeAt(0)

  // 완성형 음절 (가-힣)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const syllableIndex = code - 0xac00
    const choseongIndex = Math.floor(syllableIndex / (21 * 28))
    const jungseongIndex = Math.floor((syllableIndex % (21 * 28)) / 28)
    const jongseongIndex = syllableIndex % 28

    const choseongChar = CHOSEONG_LIST[choseongIndex]
    const jungseongChar = JUNGSEONG_LIST[jungseongIndex]
    const jongseongChar = JONGSEONG_LIST[jongseongIndex]

    const choseong = choseongMap[choseongChar] || null
    const jungseong = jungseongMap[jungseongChar] || null
    const jongseong = jongseongChar ? jongseongMap[jongseongChar] || null : null

    const layoutType = classifyLayout(choseong, jungseong, jongseong)

    return {
      char,
      choseong,
      jungseong,
      jongseong,
      layoutType,
    }
  }

  // 자음 단독 (ㄱ-ㅎ)
  if (code >= 0x3131 && code <= 0x314e) {
    const choseong = Object.values(choseongMap).find((j) => j.char === char) || null
    return {
      char,
      choseong,
      jungseong: null,
      jongseong: null,
      layoutType: 'choseong-only',
    }
  }

  // 모음 단독 (ㅏ-ㅣ)
  if (code >= 0x314f && code <= 0x3163) {
    const jungseong = Object.values(jungseongMap).find((j) => j.char === char) || null
    const jungseongType = jungseong ? classifyJungseong(jungseong.char) : 'mixed'
    const layoutType: LayoutType =
      jungseongType === 'vertical'
        ? 'jungseong-vertical-only'
        : jungseongType === 'horizontal'
          ? 'jungseong-horizontal-only'
          : 'jungseong-mixed-only'

    return {
      char,
      choseong: null,
      jungseong,
      jongseong: null,
      layoutType,
    }
  }

  // 한글이 아닌 경우
  return {
    char,
    choseong: null,
    jungseong: null,
    jongseong: null,
    layoutType: 'choseong-only',
  }
}

// ===== 레이아웃 분류 =====
function classifyLayout(
  choseong: JamoData | null,
  jungseong: JamoData | null,
  jongseong: JamoData | null
): LayoutType {
  const hasChoseong = !!choseong
  const hasJungseong = !!jungseong
  const hasJongseong = !!jongseong

  // 단독 자모
  if (hasChoseong && !hasJungseong && !hasJongseong) {
    return 'choseong-only'
  }

  if (!hasChoseong && hasJungseong && !hasJongseong) {
    const jungseongType = classifyJungseong(jungseong!.char)
    if (jungseongType === 'vertical') return 'jungseong-vertical-only'
    if (jungseongType === 'horizontal') return 'jungseong-horizontal-only'
    return 'jungseong-mixed-only'
  }

  // 초성 + 중성
  if (hasChoseong && hasJungseong && !hasJongseong) {
    const jungseongType = classifyJungseong(jungseong!.char)
    if (jungseongType === 'vertical') return 'choseong-jungseong-vertical'
    if (jungseongType === 'horizontal') return 'choseong-jungseong-horizontal'
    return 'choseong-jungseong-mixed'
  }

  // 초성 + 중성 + 종성
  if (hasChoseong && hasJungseong && hasJongseong) {
    const jungseongType = classifyJungseong(jungseong!.char)
    if (jungseongType === 'vertical') return 'choseong-jungseong-vertical-jongseong'
    if (jungseongType === 'horizontal') return 'choseong-jungseong-horizontal-jongseong'
    return 'choseong-jungseong-mixed-jongseong'
  }

  return 'choseong-only'
}

// ===== 문자열을 음절 단위로 분해 =====
export function decomposeText(
  text: string,
  choseongMap: Record<string, JamoData>,
  jungseongMap: Record<string, JamoData>,
  jongseongMap: Record<string, JamoData>
): DecomposedSyllable[] {
  return text.split('').map(char => decomposeSyllable(char, choseongMap, jungseongMap, jongseongMap))
}

// ===== 한글인지 확인 =====
export function isHangul(char: string): boolean {
  const code = char.charCodeAt(0)
  return (
    (code >= 0xac00 && code <= 0xd7a3) || // 완성형 음절
    (code >= 0x3131 && code <= 0x314e) || // 자음
    (code >= 0x314f && code <= 0x3163) // 모음
  )
}

