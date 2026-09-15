import { useEffect, useMemo, useState } from 'react'
import polygonClipping from 'polygon-clipping'
import { materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { multiPolygonArea, unionOf } from '../src/services/notoFitReport'
import { notoOutlineGhostPath, notoOutlineToInkRegions } from '../src/services/notoOutlineInk'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { DecomposedSyllable, DeepReadonly, InkRegion, LayoutSchema } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { CORPUS_TOTAL } from './notoCorpus'
import { notoPresetGlyphs } from './notoPresetGlyphs'

/**
 * 자소 편집 화면용 Noto 고스트. 편집 중인 글자 전체의 Noto 윤곽을 깔고,
 * 앱 잉크(현재 획·레이아웃·전역 스타일)가 Noto와 얼마나 다른지 xor 비율로 보여준다.
 * 고스트는 표시·비교 전용이다. 잉크 union에 들어가지 않는다.
 */

const HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const
const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }
export const NOTO_GHOST_STORAGE_KEY = 'noto-ghost-visible-v1'

export interface NotoGhost {
  /** SvgRenderer viewBox(100) 좌표 경로. */
  path: string
  regions: readonly DeepReadonly<InkRegion>[]
}

export function useNotoGhost(char: string, enabled: boolean): { ghost: NotoGhost | null; error: string } {
  const codepoint = char.codePointAt(0) ?? 0
  const valid = enabled && codepoint >= 0xac00 && codepoint < 0xac00 + CORPUS_TOTAL
  const [state, setState] = useState<{ codepoint: number; ghost: NotoGhost | null; error: string }>({ codepoint: 0, ghost: null, error: '' })
  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    notoPresetGlyphs.glyph(codepoint, controller.signal).then((glyph) => {
      const path = notoOutlineGhostPath(glyph.outline, undefined, 100)
      const regions = notoOutlineToInkRegions(glyph.outline)
      if (!path.ok || !regions.ok) throw new Error(path.ok ? regions.ok ? '' : regions.message : path.error)
      setState({ codepoint, ghost: { path: path.path, regions: regions.regions }, error: '' })
    }).catch((failure: Error) => { if (!controller.signal.aborted) setState({ codepoint, ghost: null, error: failure.message }) })
    return () => controller.abort()
  }, [codepoint, valid])
  if (!valid || state.codepoint !== codepoint) return { ghost: null, error: '' }
  return { ghost: state.ghost, error: state.error }
}

/** 앱 잉크(현재 획·레이아웃·전역 스타일)를 화면·OTF와 같은 파이프라인으로 만든다. */
export function appGlyphInkRegions(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: GlobalStyle): { ok: true; regions: readonly DeepReadonly<InkRegion>[] } | { ok: false; message: string } {
  const resolved = resolveGlyphInkPrimitives({
    syllable, placement: { kind: 'schema', schema },
    weightMultiplier: weightToMultiplier(globalStyle.weight),
    globalLinecap: globalStyle.linecap, globalLinejoin: globalStyle.linejoin,
    horizontalInkBounds: HORIZONTAL_INK_BOUNDS,
  })
  if (!resolved.primitives.length) return { ok: false, message: '앱 획이 없습니다.' }
  const ink = materializeFinalGlyphInk(resolved.primitives, globalStyle.strokeStyle, INK_OPTIONS)
  return ink.ok ? { ok: true, regions: ink.ink.regions } : { ok: false, message: ink.message }
}

export function ghostXorRatio(app: readonly DeepReadonly<InkRegion>[], ghost: readonly DeepReadonly<InkRegion>[]): { xorRatio: number; inkRatio: number } | null {
  const mine = unionOf(app)
  const theirs = unionOf(ghost)
  const ghostArea = multiPolygonArea(theirs)
  if (ghostArea <= 0) return null
  return { xorRatio: multiPolygonArea(polygonClipping.xor(mine, theirs)) / ghostArea, inkRatio: multiPolygonArea(mine) / ghostArea }
}

export function useGhostComparison(ghost: NotoGhost | null, syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: GlobalStyle): { xorRatio: number; inkRatio: number } | { message: string } | null {
  return useMemo(() => {
    if (!ghost) return null
    const app = appGlyphInkRegions(syllable, schema, globalStyle)
    if (!app.ok) return { message: app.message }
    return ghostXorRatio(app.regions, ghost.regions) ?? { message: 'Noto 고스트 면적이 0입니다.' }
  }, [ghost, syllable, schema, globalStyle])
}

export function loadGhostVisible(): boolean {
  try { return localStorage.getItem(NOTO_GHOST_STORAGE_KEY) !== 'off' } catch { return true }
}

export function saveGhostVisible(visible: boolean): void {
  try { localStorage.setItem(NOTO_GHOST_STORAGE_KEY, visible ? 'on' : 'off') } catch { /* 저장 못 해도 화면은 동작 */ }
}
