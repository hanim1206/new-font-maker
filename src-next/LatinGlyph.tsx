import { useEffect, useMemo, useState } from 'react'
import { BASELINE_Y, UPM } from '../src/services/fontMetrics'
import { isNotoLatinChar, latinPathOf, loadNotoLatinData, notoLatinSourceOf } from '../src/services/notoLatinSource'
import type { NotoLatinData } from '../src/services/notoLatinSource'
import { symbolContoursOf } from '../src/services/symbolGlyph'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { useSymbolStore } from '../src/stores/symbolStore'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { EDIT_COLOR } from './editColors'

/**
 * 숫자 · 영문 · 기호 한 글자. 받는 폰트(`compatibility` 모드)에 들어가는 그림 그대로 — 획으로 만든 글자는 획(`symbolContoursOf`),
 * 나머지는 노토 윤곽을 같은 굵기 · 기울기 · 자간으로 그린다.
 * 한글 글자 칸(`AppGlyph`)처럼 높이 1em 네모 안, 폭은 그 글자 폭. 데이터가 오기 전 · 못 받으면 글자를 그대로 쓴다.
 */

let dataPromise: Promise<NotoLatinData> | null = null
let loadedData: NotoLatinData | null = null

function useNotoLatinData(): NotoLatinData | null {
  const [data, setData] = useState<NotoLatinData | null>(loadedData)
  useEffect(() => {
    if (loadedData) return
    let alive = true
    dataPromise ??= loadNotoLatinData()
    dataPromise
      .then((loaded) => { loadedData = loaded; if (alive) setData(loaded) })
      .catch((failure) => { dataPromise = null; console.warn('숫자 · 기호 데이터를 읽지 못했습니다:', failure) })
    return () => { alive = false }
  }, [])
  return data
}

export function LatinGlyph({ char, className, style: styleOverride }: { char: string; className?: string; style?: GlobalStyle }) {
  const data = useNotoLatinData()
  const storedStyle = useGlobalStyleStore((state) => state.style)
  const style = styleOverride ?? storedStyle
  const symbol = useSymbolStore((state) => state.symbols[char])
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
