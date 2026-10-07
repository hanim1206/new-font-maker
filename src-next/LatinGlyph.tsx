import { useMemo } from 'react'
import { BASELINE_Y, UPM } from '../src/services/fontMetrics'
import { isNotoLatinChar, latinPathOf, notoLatinSourceOf } from '../src/services/notoLatinSource'
import { symbolContoursOf } from '../src/services/symbolGlyph'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { SymbolGlyph } from '../src/types'
import { useSymbolStore } from '../src/stores/symbolStore'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { EDIT_COLOR } from './editColors'
import { useNotoLatinData } from './useNotoLatinData'

/**
 * 숫자 · 영문 · 기호 한 글자. 받는 폰트(`compatibility` 모드)에 들어가는 그림 그대로 — 획으로 만든 글자는 획(`symbolContoursOf`),
 * 나머지는 노토 윤곽을 같은 굵기 · 기울기 · 자간으로 그린다.
 * 한글 글자 칸(`AppGlyph`)처럼 높이 1em 네모 안, 폭은 그 글자 폭. 데이터가 오기 전 · 못 받으면 글자를 그대로 쓴다.
 */

/** `symbol`: 저장소 대신 이 획으로 그린다 — 편집기가 고치는 중인 기호(끄는 중 미리보기 · 아직 저장 전 씨앗). */
export function LatinGlyph({ char, className, style: styleOverride, symbol: symbolOverride }: { char: string; className?: string; style?: GlobalStyle; symbol?: SymbolGlyph }) {
  const data = useNotoLatinData()
  const storedStyle = useGlobalStyleStore((state) => state.style)
  const style = styleOverride ?? storedStyle
  const storedSymbol = useSymbolStore((state) => state.symbols[char])
  const symbol = symbolOverride ?? storedSymbol
  const glyph = useMemo(() => {
    if (!data || !isNotoLatinChar(char)) return null
    try {
      const made = symbol ? symbolContoursOf(symbol, data, style) : notoLatinSourceOf(data, style).glyphFor(char.codePointAt(0) ?? 0)
      return made ? { advanceWidth: made.advanceWidth, d: latinPathOf(made.contours), source: symbol ? 'strokes' : 'noto' } : null
    } catch (failure) {
      console.warn(`'${char}' 그리기 실패:`, failure)
      return null
    }
  }, [data, char, style, symbol])
  if (!glyph) return <span className={className} data-latin-glyph="text">{char}</span>
  return <span className={className} data-latin-glyph={glyph.source} aria-label={char} style={{ display: 'inline-flex', lineHeight: 0, flex: 'none' }}>
    <svg viewBox={`0 ${-BASELINE_Y} ${glyph.advanceWidth} ${UPM}`} style={{ inlineSize: `${glyph.advanceWidth / UPM}em`, blockSize: '1em', overflow: 'visible' }} aria-hidden="true">
      <path d={glyph.d} fill={EDIT_COLOR.foreground} fillRule="nonzero" />
    </svg>
  </span>
}
