import type { Padding } from '../types'

/**
 * 자간 · 행간 기본 메트릭. 노토 산스 KR(`.reference-fonts/NotoSansKR.ttf`)에서 잰 값이다.
 * - 한글 11,172자 폭 920. 여섯 레이아웃 잉크 합집합 43~893 → 기준 몸통(50~890, 폭 840) 기준으로 왼 50 · 오른 30.
 * - 공백 220. hhea 1160 / −288 / 0 → 줄 높이 1.448em. OS/2 win 1160 / 288.
 * 글자 폭과 여백은 몸통 폭에 비례한다(A안): 글자를 좁히면 자간도 같이 좁아진다. 줄 높이와 공백은 몸통을 따르지 않는다.
 * 추출기만 쓴다. 문장 줄(`CalibrationSentenceEditor`)이 같은 함수를 부르는 건 후속.
 */
export const UPM = 1000

export const NOTO_HANGUL_ADVANCE = 920
export const NOTO_BODY_WIDTH = 840
export const NOTO_LEFT_BEARING = 50
export const NOTO_RIGHT_BEARING = NOTO_HANGUL_ADVANCE - NOTO_LEFT_BEARING - NOTO_BODY_WIDTH

export const SPACE_ADVANCE = 220

/** hhea. 맥 · 브라우저(`line-height: normal`)가 줄 높이로 쓴다. */
export const LINE_METRICS = { ascender: 1160, descender: -288, lineGap: 0 } as const
/** OS/2 usWinAscent · usWinDescent 바닥. 잉크가 넘치면 `windowsClipMetrics`가 잉크 끝까지 넓힌다. */
export const WIN_METRICS = { ascent: 1160, descent: 288 } as const

/** 몸통 폭(0–1). */
export function hangulBodyWidth(padding: Padding): number {
  return 1 - padding.left - padding.right
}

/** 몸통 왼쪽 여백(0–1). 몸통 폭에 비례. */
export function hangulLeftBearing(padding: Padding): number {
  return hangulBodyWidth(padding) * NOTO_LEFT_BEARING / NOTO_BODY_WIDTH
}

/** 글자 폭(폰트 단위). 몸통 폭 × 920/840 + 전역 자간. */
export function hangulAdvance(padding: Padding, letterSpacing = 0): number {
  return Math.round(UPM * (hangulBodyWidth(padding) * NOTO_HANGUL_ADVANCE / NOTO_BODY_WIDTH + letterSpacing))
}

/** 캔버스(0–1)에서 글리프 원점이 되는 x. 몸통 왼쪽에서 왼 여백만큼 앞. */
export function hangulOriginX(padding: Padding): number {
  return padding.left - hangulLeftBearing(padding)
}
