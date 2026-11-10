/**
 * 배치 규칙 2차(획) — ㅎ 머리 · 동그라미 상자를 찾는다. 결과는 `src/services/strokeShapeRules.ts`의 HIEUT_BOXES에 손으로 옮긴다.
 * - 받침 ㅎ: 첫닿자 짝수 번째 10 × 오른홀자 9 = 90자로 고르고, 홀수 번째 9 × 9 = 81자로 따로 본다(홀드아웃).
 * - 첫닿자 ㅎ: 오른홀자 9 × 받침 다섯(없음 ㄴ ㄹ ㅇ ㅎ)으로 고르고, 다른 받침 다섯(ㄱ ㅁ ㅂ ㅅ ㅆ)으로 따로 본다.
 * 상자 여덟 값을 한 칸씩 ± 움직여 노토 xor 평균이 줄면 받는다(0.06 → 0.03 → 0.015 → 0.0075). 처음 값은 지금 표 값.
 *
 *   npx esbuild scripts/layout-rules/measure-hieut.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/hieut.mjs && node /tmp/hieut.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST } from '../../src/data/Hangul'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { appGlyphInkRegions, ghostXorRatio } from '../../src/services/notoGlyphXor'
import { applyStrokeShapeRules, HIEUT_BOXES } from '../../src/services/strokeShapeRules'
import type { SubBox } from '../../src/services/strokeShapeRules'
import { DEFAULT_STYLE } from '../../src/stores/globalStyleStore'
import type { BoxConfig, Part } from '../../src/types'
import { scoreGlyph } from '../../src-next/layoutRulesScore'
import { notoPresetChunkFile, notoPresetChunkIndex } from '../../src-next/notoPresetGlyphs'

type Input = Parameters<typeof scoreGlyph>[0]
const maps = baseJamos as unknown as Input['maps']
const model = JSON.parse(fs.readFileSync('public/noto-preset/model.json', 'utf8'))
const chunks = new Map<number, Record<string, { outline: Input['outline'] }>>()
const outlineOf = (cp: number) => {
  const index = notoPresetChunkIndex(cp)
  if (index == null) return null
  if (!chunks.has(index)) chunks.set(index, JSON.parse(fs.readFileSync('public/noto-preset/' + notoPresetChunkFile(index), 'utf8')))
  return chunks.get(index)![String(cp)]?.outline ?? null
}
const JUNG_CODE: Record<string, number> = { 'ㅏ': 0, 'ㅐ': 1, 'ㅑ': 2, 'ㅒ': 3, 'ㅓ': 4, 'ㅔ': 5, 'ㅕ': 6, 'ㅖ': 7, 'ㅣ': 20 }
const VOWELS = Object.keys(JUNG_CODE)
const compose = (cho: string, jung: string, jong: number) => String.fromCodePoint(0xac00 + ((CHOSEONG_LIST as readonly string[]).indexOf(cho) * 21 + JUNG_CODE[jung]) * 28 + jong)
const SHAPES = { giyeokSweep: false, bottomKick: false, tailSweep: false, compoundJong: false, hieutParts: true }

const glyphsOf = (chars: string[]) => chars.flatMap((char) => {
  const outline = outlineOf(char.codePointAt(0)!)
  if (!outline) return []
  const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
  return score.ok && score.drawn ? [{ syllable: score.drawn, boxes: score.boxes.rule as Partial<Record<Part, BoxConfig>>, ghost: score.ink.ghost, before: score.xor.rule }] : []
})
type Glyph = ReturnType<typeof glyphsOf>[number]
const meanXor = (glyphs: Glyph[]) => glyphs.reduce((sum, glyph) => {
  const app = appGlyphInkRegions(applyStrokeShapeRules(glyph.syllable, SHAPES), { kind: 'boxes', boxes: glyph.boxes }, DEFAULT_STYLE)
  const value = app.ok ? ghostXorRatio(app.regions, glyph.ghost, 'boxes') : null
  return sum + (value?.xorRatio ?? 1)
}, 0) / glyphs.length

const JONG_H = 27
const GROUPS = {
  jong: {
    fit: CHOSEONG_LIST.filter((_, i) => i % 2 === 0).flatMap((cho) => VOWELS.map((jung) => compose(cho, jung, JONG_H))),
    hold: CHOSEONG_LIST.filter((_, i) => i % 2 === 1).flatMap((cho) => VOWELS.map((jung) => compose(cho, jung, JONG_H))),
  },
  cho: {
    fit: VOWELS.flatMap((jung) => [0, 4, 8, 21, 27].map((jong) => compose('ㅎ', jung, jong))),
    hold: VOWELS.flatMap((jung) => [1, 16, 17, 19, 20].map((jong) => compose('ㅎ', jung, jong))),
  },
} as const
const KEYS = ['x0', 'y0', 'x1', 'y1'] as const
const IDENTITY: SubBox = { x0: 0, y0: 0, x1: 1, y1: 1 }

for (const [name, group] of Object.entries(GROUPS) as [keyof typeof HIEUT_BOXES, { fit: string[]; hold: string[] }][]) {
  const fit = glyphsOf(group.fit), hold = glyphsOf(group.hold)
  const current = HIEUT_BOXES[name]
  HIEUT_BOXES[name] = { head: IDENTITY, ring: IDENTITY }
  const before = meanXor(fit), holdBefore = meanXor(hold)
  let boxes = { head: { ...current.head }, ring: { ...current.ring } }
  HIEUT_BOXES[name] = boxes
  let error = meanXor(fit)
  for (const step of [0.06, 0.03, 0.015, 0.0075]) {
    let improved = true
    while (improved) {
      improved = false
      for (const side of ['head', 'ring'] as const) for (const key of KEYS) for (const sign of [-1, 1]) {
        const trial = { head: { ...boxes.head }, ring: { ...boxes.ring } }
        trial[side][key] = +(trial[side][key] + sign * step).toFixed(4)
        HIEUT_BOXES[name] = trial
        const value = meanXor(fit)
        if (value < error - 1e-5) { error = value; boxes = trial; improved = true }
      }
    }
  }
  HIEUT_BOXES[name] = boxes
  const round = (box: SubBox) => Object.fromEntries(Object.entries(box).map(([k, v]) => [k, +v.toFixed(3)]))
  console.log(name, `맞춤 ${fit.length}자 ${before.toFixed(4)} → ${error.toFixed(4)} · 홀드아웃 ${hold.length}자 ${holdBefore.toFixed(4)} → ${meanXor(hold).toFixed(4)}`, JSON.stringify({ head: round(boxes.head), ring: round(boxes.ring) }))
}
