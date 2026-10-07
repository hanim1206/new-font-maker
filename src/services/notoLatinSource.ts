import type { LatinGlyphSource } from './fontGenerator'
import type { Contour } from './strokeToOutline'
import { BASELINE_Y, UPM } from './fontMetrics'
import notoLatinDataUrl from '../data/notoLatin.v1.json?url'

/**
 * 노토 산스 KR의 영문 · 숫자 · 기호(U+0021~U+007E) 윤곽. `scripts/reference-lab/export_noto_latin.py`가 뽑은 `src/data/notoLatin.v1.json`.
 * 프리셋이 노토 파생이라 밑선 · 높이가 한글과 그대로 맞는다. 모양은 고정이고 굵기 · 기울기 · 자간만 따라간다.
 */

/** 점 하나 `[x, y, onCurve(1/0)]`. TrueType 점 그대로라 off-curve가 연달아 올 수 있다. */
type NotoLatinPoint = [number, number, number]

export interface NotoLatinData {
  source: { font: string; sha256: string; license: string; unitsPerEm: number }
  /** 굵기(100 단위 문자열) → 코드포인트(10진 문자열) → 글자 */
  weights: Record<string, Record<string, { advanceWidth: number; contours: NotoLatinPoint[][] }>>
}

export interface NotoLatinStyle {
  weight: number
  /** 도. 한글과 같은 축(EM 세로 가운데)으로 민다. */
  slant: number
  /** EM 비율. 한글처럼 글자 오른쪽에 더한다. */
  letterSpacing: number
}

/**
 * 데이터는 300KB 가까이 된다. 추출할 때만 파일로 받는다.
 * 동적 import를 쓰지 않는다 — 추출 워커(IIFE)가 이 스토어 쪽 코드를 같이 묶어서 코드 분할이 생기면 `vite build`가 깨진다.
 */
export async function loadNotoLatinData(): Promise<NotoLatinData> {
  const response = await fetch(notoLatinDataUrl)
  if (!response.ok) throw new Error(`숫자 · 기호 데이터를 받지 못했습니다(${response.status}).`)
  return await response.json() as NotoLatinData
}

/** 가장 가까운 굵기. 같으면 가는 쪽. */
export function nearestNotoLatinWeight(data: NotoLatinData, weight: number): string {
  const available = Object.keys(data.weights).map(Number).sort((a, b) => a - b)
  if (available.length === 0) throw new Error('노토 영문 데이터에 굵기가 없습니다.')
  return String(available.reduce((best, candidate) => Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best))
}

/**
 * TrueType 2차 윤곽 → 앱 `Contour`. 연달은 off-curve 사이에 숨은 on-curve(가운데 점)를 넣는다.
 * `contoursToPath`는 off-curve 둘을 3차 곡선으로 읽기 때문에, 넣지 않으면 곡선이 틀어진다.
 */
export function quadraticContourOf(points: ReadonlyArray<NotoLatinPoint>, transform: (x: number, y: number) => { x: number; y: number }): Contour {
  const contour: Contour = []
  points.forEach((point, index) => {
    const onCurve = point[2] === 1
    const previous = points[(index - 1 + points.length) % points.length]
    if (!onCurve && previous[2] !== 1 && points.length > 1) {
      contour.push({ ...transform((previous[0] + point[0]) / 2, (previous[1] + point[1]) / 2), onCurve: true })
    }
    contour.push({ ...transform(point[0], point[1]), onCurve })
  })
  return contour
}

export function notoLatinSourceOf(data: NotoLatinData, style: NotoLatinStyle): LatinGlyphSource {
  if (data.source.unitsPerEm !== UPM) throw new Error(`노토 영문 데이터 UPM ${data.source.unitsPerEm}이 폰트 UPM ${UPM}과 다릅니다.`)
  const glyphs = data.weights[nearestNotoLatinWeight(data, style.weight)]
  const tangent = Math.tan(style.slant * Math.PI / 180)
  // 한글(`brushInkGroupsToFontContours`)과 같은 축: EM 세로 가운데.
  const verticalCenter = BASELINE_Y - UPM / 2
  const transform = (x: number, y: number) => ({ x: Math.round(x + (y - verticalCenter) * tangent), y: Math.round(y) })
  const extraAdvance = Math.round(style.letterSpacing * UPM)
  return {
    glyphFor(codePoint) {
      const glyph = glyphs[String(codePoint)]
      if (!glyph) return null
      return {
        advanceWidth: glyph.advanceWidth + extraAdvance,
        contours: glyph.contours.map((points) => quadraticContourOf(points, transform)),
      }
    },
  }
}
