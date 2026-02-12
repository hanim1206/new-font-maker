import type { JamoData } from '../types'
import baseJamos from './baseJamos.json'

// ===== 자모 목록 =====
export const CHOSEONG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

export const JUNGSEONG_LIST = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
] as const

export const JONGSEONG_LIST = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

// ===== 중성 분류 =====
// 세로 중성: 초성 오른쪽에 위치 (세로획만 있는 중성)
export const VERTICAL_JUNGSEONG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ'] as const
// 가로 중성: 초성 아래에 위치 (가로획만 있는 중성)
export const HORIZONTAL_JUNGSEONG = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ'] as const
// 혼합 중성: 가로획 + 세로획이 함께 있는 중성 (ㅗ/ㅜ/ㅡ 계열 + ㅏ/ㅓ/ㅣ 계열)
// ㅘ(ㅗ+ㅏ), ㅙ(ㅗ+ㅐ), ㅚ(ㅗ+ㅣ), ㅝ(ㅜ+ㅓ), ㅞ(ㅜ+ㅔ), ㅟ(ㅜ+ㅣ), ㅢ(ㅡ+ㅣ)
export const MIXED_JUNGSEONG = ['ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ'] as const

// ===== 자모 데이터 (baseJamos.json에서 로드) =====
export const CHOSEONG_MAP: Record<string, JamoData> = baseJamos.choseong as Record<string, JamoData>
export const JUNGSEONG_MAP: Record<string, JamoData> = baseJamos.jungseong as Record<string, JamoData>
export const JONGSEONG_MAP: Record<string, JamoData> = baseJamos.jongseong as Record<string, JamoData>
