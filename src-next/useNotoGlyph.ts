import { useEffect, useState } from 'react'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetGlyph } from './notoPresetGlyphs'

/** 글자 하나의 Noto 윤곽·기준선. codepoint가 바뀌면 이전 요청은 끊는다. */
export function useNotoGlyph(codepoint: number): { glyph: NotoPresetGlyph | null; error: string } {
  const [state, setState] = useState<{ codepoint: number; glyph: NotoPresetGlyph | null; error: string }>({ codepoint, glyph: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ codepoint, glyph: null, error: '' })
    notoPresetGlyphs.glyph(codepoint, controller.signal)
      .then((glyph) => setState({ codepoint, glyph, error: '' }))
      .catch((failure: Error) => { if (!controller.signal.aborted) setState({ codepoint, glyph: null, error: failure.message }) })
    return () => controller.abort()
  }, [codepoint])
  return state.codepoint === codepoint ? state : { glyph: null, error: '' }
}
