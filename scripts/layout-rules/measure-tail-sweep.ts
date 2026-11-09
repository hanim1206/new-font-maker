/**
 * 배치 규칙 2차(획) — ㅈ ㅊ ㅉ 꼬리 휨 꼴 값을 찾는다. 결과는 `src/services/strokeShapeRules.ts`의 TAIL_SHAPES에 손으로 옮긴다.
 * 홀자 무리(오른가지 ㅏ ㅐ ㅑ ㅒ · 왼가지 ㅓ ㅔ ㅕ ㅖ · ㅣ)와 첫닿자마다, 받침 다섯(없음 ㄴ ㄹ ㅇ ㅎ)으로 값을 고르고
 * 나머지 받침 다섯(ㄱ ㅁ ㅂ ㅅ ㅆ)으로 나아졌는지 따로 본다(홀드아웃).
 * 왼 삐침과 오른 내림을 번갈아 두 번씩 격자로 고른다(dx 바깥쪽 · dy 아래 · hx 손잡이 가로).
 *
 *   npx esbuild scripts/layout-rules/measure-tail-sweep.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/tail.mjs && node /tmp/tail.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST } from '../../src/data/Hangul'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { appGlyphInkRegions, ghostXorRatio } from '../../src/services/notoGlyphXor'
import { applyStrokeShapeRules, TAIL_SHAPES } from '../../src/services/strokeShapeRules'
import { DEFAULT_STYLE } from '../../src/stores/globalStyleStore'
import type { BoxConfig, Part } from '../../src/types'
import { scoreGlyph } from '../../src-next/layoutRulesScore'
import { notoPresetChunkFile, notoPresetChunkIndex } from '../../src-next/notoPresetGlyphs'

type Input = Parameters<typeof scoreGlyph>[0]
const maps = baseJamos as unknown as Input['maps']
const model = JSON.parse(fs.readFileSync('public/noto-preset/model.json', 'utf8'))
const chunks = new Map<number, Record<string, { outline: Input['outline'] }>>()
const outlineOf = (cp: number) => {
  const index = notoPresetChunkIndex(cp)!
  if (!chunks.has(index)) chunks.set(index, JSON.parse(fs.readFileSync('public/noto-preset/' + notoPresetChunkFile(index), 'utf8')))
  return chunks.get(index)![String(cp)].outline
}
const JUNG_CODE: Record<string, number> = { 'ㅏ': 0, 'ㅐ': 1, 'ㅑ': 2, 'ㅒ': 3, 'ㅓ': 4, 'ㅔ': 5, 'ㅕ': 6, 'ㅖ': 7, 'ㅣ': 20 }
const GROUP_VOWELS = { right: ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ'], left: ['ㅓ', 'ㅔ', 'ㅕ', 'ㅖ'], i: ['ㅣ'] } as const
const FIT_JONGS = [0, 4, 8, 21, 27], HOLD_JONGS = [1, 16, 17, 19, 20]
const STROKES: Record<string, [string, string]> = { 'ㅈ': ['ㅈ-left', 'ㅈ-right'], 'ㅊ': ['ㅊ-left', 'ㅊ-right'], 'ㅉ': ['ㅉ-1l', 'ㅉ-2r'] }
const compose = (cho: string, jung: string, jong: number) => String.fromCodePoint(0xac00 + ((CHOSEONG_LIST as readonly string[]).indexOf(cho) * 21 + JUNG_CODE[jung]) * 28 + jong)
const SHAPES = { giyeokSweep: false, bottomKick: false, tailSweep: true, compoundJong: false, hieutParts: false }
const range = (from: number, to: number, step: number) => { const out: number[] = []; for (let v = from; v <= to + 1e-9; v += step) out.push(+v.toFixed(3)); return out }

const glyphsOf = (chars: string[]) => chars.flatMap((char) => {
  const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline: outlineOf(char.codePointAt(0)!), params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
  return score.ok && score.drawn ? [{ syllable: score.drawn, boxes: score.boxes.rule as Partial<Record<Part, BoxConfig>>, ghost: score.ink.ghost, before: score.xor.rule }] : []
})
type Glyph = ReturnType<typeof glyphsOf>[number]
const meanXor = (glyphs: Glyph[]) => glyphs.reduce((sum, glyph) => {
  const app = appGlyphInkRegions(applyStrokeShapeRules(glyph.syllable, SHAPES), { kind: 'boxes', boxes: glyph.boxes }, DEFAULT_STYLE)
  const value = app.ok ? ghostXorRatio(app.regions, glyph.ghost, 'boxes') : null
  return sum + (value?.xorRatio ?? 1)
}, 0) / glyphs.length

for (const [group, vowels] of Object.entries(GROUP_VOWELS) as [keyof typeof TAIL_SHAPES, readonly string[]][]) {
  for (const [cho, [leftId, rightId]] of Object.entries(STROKES)) {
    const chars = (jongs: number[]) => vowels.flatMap((jung) => jongs.map((jong) => compose(cho, jung, jong)))
    const fit = glyphsOf(chars(FIT_JONGS)), hold = glyphsOf(chars(HOLD_JONGS))
    const table = TAIL_SHAPES[group]
    const before = meanXor(fit), holdBefore = meanXor(hold)
    let error = before
    for (let pass = 0; pass < 2; pass += 1) for (const [id, sign] of [[leftId, -1], [rightId, 1]] as const) {
      let best = { error: Infinity, dx: 0, dy: 0, hx: 0 }
      for (const out of range(0, 0.14, 0.02)) for (const dy of range(-0.04, 0.16, 0.04)) for (const hx of range(-0.2, 0.2, 0.05)) {
        table[id] = { dx: sign * out, dy, hx }
        const value = meanXor(fit)
        if (value < best.error) best = { error: value, dx: sign * out, dy, hx }
      }
      table[id] = { dx: best.dx, dy: best.dy, hx: best.hx }
      error = best.error
    }
    const holdAfter = meanXor(hold)
    console.log(group, cho, `맞춤 ${fit.length}자 ${before.toFixed(4)} → ${error.toFixed(4)} · 홀드아웃 ${hold.length}자 ${holdBefore.toFixed(4)} → ${holdAfter.toFixed(4)}`, JSON.stringify({ [leftId]: table[leftId], [rightId]: table[rightId] }))
  }
}
