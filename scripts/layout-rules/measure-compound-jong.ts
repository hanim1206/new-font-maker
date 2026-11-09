/**
 * 배치 규칙 2차(획) — 섞임받침 작은 상자 둘을 찾는다. 결과는 `src/services/strokeShapeRules.ts`의 COMPOUND_JONG_BOXES에 손으로 옮긴다.
 * 섞임받침마다 첫닿자 일곱(ㄱ ㄹ ㅇ ㅊ ㄲ ㅂ ㅍ) × 홀자 넷(ㅏ ㅐ ㅓ ㅣ) = 28자로 고르고, 다른 첫닿자 여섯 × 홀자 셋(ㅑ ㅔ ㅕ) = 18자로 따로 본다(홀드아웃).
 * 상자 여덟 값(왼 x0 y0 x1 y1 · 오른 x0 y0 x1 y1)을 한 칸씩 ± 움직여 노토 xor 평균이 줄면 받는다(0.04 → 0.02 → 0.01).
 * 처음 값은 baseJamos 섞임받침에서 두 자모가 차지한 자리.
 *
 *   npx esbuild scripts/layout-rules/measure-compound-jong.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/cj.mjs && node /tmp/cj.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST, JONGSEONG_LIST } from '../../src/data/Hangul'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { appGlyphInkRegions, ghostXorRatio } from '../../src/services/notoGlyphXor'
import { applyStrokeShapeRules, COMPOUND_JONG_BOXES, COMPOUND_JONG_PARTS } from '../../src/services/strokeShapeRules'
import type { SubBox } from '../../src/services/strokeShapeRules'
import { DEFAULT_STYLE } from '../../src/stores/globalStyleStore'
import type { BoxConfig, Part } from '../../src/types'
import { scoreGlyph } from '../../src-next/layoutRulesScore'
import { notoPresetChunkFile, notoPresetChunkIndex } from '../../src-next/notoPresetGlyphs'

type Input = Parameters<typeof scoreGlyph>[0]
const maps = baseJamos as unknown as Input['maps']
const jongJamos = (baseJamos as unknown as { jongseong: Record<string, { strokes: { points: { x: number; y: number }[] }[] }> }).jongseong
const model = JSON.parse(fs.readFileSync('public/noto-preset/model.json', 'utf8'))
const chunks = new Map<number, Record<string, { outline: Input['outline'] }>>()
const outlineOf = (cp: number) => {
  const index = notoPresetChunkIndex(cp)
  if (index == null) return null
  if (!chunks.has(index)) chunks.set(index, JSON.parse(fs.readFileSync('public/noto-preset/' + notoPresetChunkFile(index), 'utf8')))
  return chunks.get(index)![String(cp)]?.outline ?? null
}
const JUNG_CODE: Record<string, number> = { 'ㅏ': 0, 'ㅐ': 1, 'ㅑ': 2, 'ㅓ': 4, 'ㅔ': 5, 'ㅕ': 6, 'ㅣ': 20 }
const compose = (cho: string, jung: string, jong: string) => String.fromCodePoint(0xac00 + ((CHOSEONG_LIST as readonly string[]).indexOf(cho) * 21 + JUNG_CODE[jung]) * 28 + (JONGSEONG_LIST as readonly string[]).indexOf(jong))
const SHAPES = { giyeokSweep: false, bottomKick: false, tailSweep: false, compoundJong: true }
const FIT_CHO = ['ㄱ', 'ㄹ', 'ㅇ', 'ㅊ', 'ㄲ', 'ㅂ', 'ㅍ'], HOLD_CHO = ['ㄴ', 'ㅁ', 'ㅅ', 'ㅈ', 'ㅌ', 'ㅎ']

const glyphsOf = (chars: string[]) => chars.flatMap((char) => {
  const outline = outlineOf(char.codePointAt(0)!)
  if (!outline) return []
  const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
  return score.ok && score.drawn ? [{ syllable: score.drawn, boxes: score.boxes.rule as Partial<Record<Part, BoxConfig>>, ghost: score.ink.ghost, before: score.xor.rule }] : []
})
type Glyph = ReturnType<typeof glyphsOf>[number]
const meanXor = (glyphs: Glyph[]) => glyphs.reduce((sum, glyph) => {
  const app = appGlyphInkRegions(applyStrokeShapeRules(glyph.syllable, SHAPES, jongJamos), { kind: 'boxes', boxes: glyph.boxes }, DEFAULT_STYLE)
  const value = app.ok ? ghostXorRatio(app.regions, glyph.ghost, 'boxes') : null
  return sum + (value?.xorRatio ?? 1)
}, 0) / glyphs.length

/** baseJamos 섞임받침에서 왼 · 오른 자모가 차지한 자리 — 획을 가운데 x로 둘로 나눈다. */
const startBoxes = (compound: string): [SubBox, SubBox] => {
  const strokes = jongJamos[compound].strokes as { points: { x: number; y: number }[] }[]
  const boxOf = (list: typeof strokes): SubBox => {
    const xs = list.flatMap((s) => s.points.map((p) => p.x)), ys = list.flatMap((s) => s.points.map((p) => p.y))
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  }
  const mid = (s: typeof strokes[number]) => s.points.reduce((sum, p) => sum + p.x, 0) / s.points.length
  return [boxOf(strokes.filter((s) => mid(s) < 0.5)), boxOf(strokes.filter((s) => mid(s) >= 0.5))]
}

const KEYS = ['x0', 'y0', 'x1', 'y1'] as const
for (const compound of Object.keys(COMPOUND_JONG_PARTS).filter((c) => !process.env.ONLY || process.env.ONLY.includes(c))) {
  const fit = glyphsOf(FIT_CHO.flatMap((cho) => ['ㅏ', 'ㅐ', 'ㅓ', 'ㅣ'].map((jung) => compose(cho, jung, compound))))
  const hold = glyphsOf(HOLD_CHO.flatMap((cho) => ['ㅑ', 'ㅔ', 'ㅕ'].map((jung) => compose(cho, jung, compound))))
  const before = fit.reduce((sum, g) => sum + g.before, 0) / fit.length
  const holdBefore = hold.reduce((sum, g) => sum + g.before, 0) / hold.length
  let boxes = startBoxes(compound)
  COMPOUND_JONG_BOXES[compound] = boxes
  let error = meanXor(fit)
  const start = error
  for (const step of [0.04, 0.02, 0.01]) {
    let improved = true
    while (improved) {
      improved = false
      for (const side of [0, 1] as const) for (const key of KEYS) for (const sign of [-1, 1]) {
        const trial: [SubBox, SubBox] = [{ ...boxes[0] }, { ...boxes[1] }]
        trial[side][key] = +(trial[side][key] + sign * step).toFixed(3)
        COMPOUND_JONG_BOXES[compound] = trial
        const value = meanXor(fit)
        if (value < error - 1e-5) { error = value; boxes = trial; improved = true }
      }
    }
  }
  COMPOUND_JONG_BOXES[compound] = boxes
  const holdAfter = meanXor(hold)
  console.log(compound, `맞춤 ${fit.length}자 지금 ${before.toFixed(4)} · 홑받침 둘(처음 자리) ${start.toFixed(4)} → ${error.toFixed(4)} · 홀드아웃 ${hold.length}자 ${holdBefore.toFixed(4)} → ${holdAfter.toFixed(4)}`, JSON.stringify(boxes))
}
