import type { BoxConfig, SymbolGlyph } from '../types'
import type { GlobalStyle } from '../stores/globalStyleStore'
import type { LatinGlyphSource } from './fontGenerator'
import { glyphDataToFontContours } from './fontGenerator'
import type { GlyphData } from './fontExportUtils'
import { UPM } from './fontMetrics'
import { nearestNotoLatinWeight, notoLatinSourceOf } from './notoLatinSource'
import type { NotoLatinData } from './notoLatinSource'
import type { Contour } from './strokeToOutline'
import { weightToMultiplier } from '../utils/globalStyleUtils'

/**
 * 획으로 만든 숫자 · 기호 → 윤곽. 화면(`LatinGlyph`)과 추출이 이 함수 하나를 지나서 같은 그림이 된다.
 * 획은 한글과 같은 함수(`glyphDataToFontContours`)로 굵기 · 기울기 · 붓 · 둥글기 · 꺾임을 탄다. 부리는 걸지 않는다(플랜 1차).
 *
 * 칸: 획 좌표 0–1의 기준은 노토 400 굵기의 그 글자 폭(`cellWidth`) × EM 높이. 굵기가 바뀌어 노토 폭이 달라져도
 * 칸은 그대로 두고 가운데로 옮긴다 — 획이 굵기 따라 옆으로 늘지 않게.
 * 플랜: docs/plans/2026-10-08_숫자-기호-획-편집.md
 */

export const SYMBOL_BASE_WEIGHT = 400

export interface SymbolCell {
  /** 획 좌표 x 0–1이 차지하는 폭(EM 비율). */
  cellWidth: number
  /** 칸 왼쪽이 글자 원점에서 떨어진 거리(EM 비율). */
  offsetX: number
  /** 글자 폭(폰트 단위). 그 굵기의 노토 폭 + 자간. 노토로 그릴 때와 같다. */
  advanceWidth: number
}

function notoAdvance(data: NotoLatinData, weight: number, char: string): number {
  const glyph = data.weights[nearestNotoLatinWeight(data, weight)][String(char.codePointAt(0) ?? 0)]
  if (!glyph) throw new Error(`노토 영문 데이터에 '${char}'가 없습니다.`)
  return glyph.advanceWidth
}

export function symbolCellOf(data: NotoLatinData, char: string, style: Pick<GlobalStyle, 'weight' | 'letterSpacing'>): SymbolCell {
  const base = notoAdvance(data, SYMBOL_BASE_WEIGHT, char)
  const current = notoAdvance(data, style.weight, char)
  return {
    cellWidth: base / UPM,
    offsetX: (current - base) / 2 / UPM,
    advanceWidth: current + Math.round(style.letterSpacing * UPM),
  }
}

/** 획 좌표가 놓이는 상자(EM 비율, 위 0 = 올림선). 편집기 캔버스도 이 상자를 쓴다. */
export function symbolBoxOf(cell: SymbolCell): BoxConfig {
  return { x: cell.offsetX, y: 0, width: cell.cellWidth, height: 1 }
}

export function symbolContoursOf(symbol: SymbolGlyph, data: NotoLatinData, style: GlobalStyle): { advanceWidth: number; contours: Contour[] } {
  const cell = symbolCellOf(data, symbol.char, style)
  const box = symbolBoxOf(cell)
  const glyphData: GlyphData = {
    unicode: symbol.char.codePointAt(0) ?? 0,
    char: symbol.char,
    advanceWidth: cell.advanceWidth,
    strokes: symbol.strokes.map((stroke) => ({
      stroke,
      box,
      effectiveLinecap: stroke.linecap ?? style.linecap,
      effectiveLinejoin: stroke.linejoin ?? style.linejoin,
    })),
    weightMultiplier: weightToMultiplier(style.weight),
    slant: style.slant,
    brush: style.brush,
    strokeStyle: style.strokeStyle,
    placementKind: 'schema',
  }
  return { advanceWidth: cell.advanceWidth, contours: symbol.strokes.length ? glyphDataToFontContours(glyphData) : [] }
}

/** 추출용 출처. 획으로 만든 글자는 획에서, 나머지는 노토 윤곽에서. */
export function symbolLatinSourceOf(data: NotoLatinData, style: GlobalStyle, symbols: Readonly<Record<string, SymbolGlyph>>): LatinGlyphSource {
  const noto = notoLatinSourceOf(data, style)
  return {
    glyphFor(codePoint) {
      const symbol = symbols[String.fromCodePoint(codePoint)]
      return symbol ? symbolContoursOf(symbol, data, style) : noto.glyphFor(codePoint)
    },
  }
}
