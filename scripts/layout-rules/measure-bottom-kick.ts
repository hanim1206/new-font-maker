/**
 * 배치 규칙 2차(획) — 맨 아래 가로줄기 치킴(ㄴ ㄷ ㄸ ㄹ ㅌ ㅍ)의 꼴 값을 찾는다. 결과는 `src/services/strokeShapeRules.ts`의 `BOTTOM_KICK_SHAPES`에 손으로 옮긴다.
 * 첫닿자마다 치킴 홀자(ㅏ ㅐ ㅑ ㅒ ㅣ) 5 × 받침 다섯(없음 ㄹ ㅁ ㅇ ㅎ 자리) = 25자. 규칙 자리는 한 번만 구하고, 꼴 값(reach · rise · bend)을 격자로 바꿔 가며
 * 노토 xor 평균이 가장 작은 값을 고른다. 노토 윤곽에서 잰 중심선(끝이 홀자 기둥 바로 앞까지 나가고 0.04~0.08 올라감)이 격자의 범위를 정했다.
 *
 *   npx esbuild scripts/layout-rules/measure-bottom-kick.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/kick.mjs && node /tmp/kick.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST } from '../../src/data/Hangul'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { appGlyphInkRegions, ghostXorRatio } from '../../src/services/notoGlyphXor'
import { applyStrokeShapeRules, BOTTOM_KICK_SHAPES } from '../../src/services/strokeShapeRules'
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
const JUNG_CODE: Record<string, number> = { 'ㅏ': 0, 'ㅐ': 1, 'ㅑ': 2, 'ㅒ': 3, 'ㅣ': 20 }
const TARGETS: Record<string, string> = { 'ㄴ': 'ㄴ-1', 'ㄷ': 'ㄷ-1', 'ㄸ': 'ㄸ-4', 'ㄹ': 'ㄹ-1', 'ㅌ': 'ㅌ-1', 'ㅍ': 'ㅍ-2' }
const SHAPES = { giyeokSweep: false, bottomKick: true }

for (const [cho, strokeId] of Object.entries(TARGETS)) {
  const glyphs = Object.values(JUNG_CODE).flatMap((jung) => [0, 4, 8, 16, 21].flatMap((jong) => {
    const char = String.fromCodePoint(0xac00 + ((CHOSEONG_LIST as readonly string[]).indexOf(cho) * 21 + jung) * 28 + jong)
    const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline: outlineOf(char.codePointAt(0)!), params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
    return score.ok && score.drawn ? [{ char, syllable: score.drawn, boxes: score.boxes.rule as Partial<Record<Part, BoxConfig>>, ghost: score.ink.ghost, before: score.xor.rule }] : []
  }))
  const meanXor = () => glyphs.reduce((sum, glyph) => {
    const app = appGlyphInkRegions(applyStrokeShapeRules(glyph.syllable, SHAPES), { kind: 'boxes', boxes: glyph.boxes }, DEFAULT_STYLE)
    const value = app.ok ? ghostXorRatio(app.regions, glyph.ghost, 'boxes') : null
    return sum + (value?.xorRatio ?? 1)
  }, 0) / glyphs.length
  const before = glyphs.reduce((sum, glyph) => sum + glyph.before, 0) / glyphs.length
  let best = { error: Infinity, reach: 1, rise: 0, bend: 0.5 }
  for (let reach = 0.95; reach <= 1.5; reach += 0.05) for (let rise = 0; rise <= 0.141; rise += 0.02) for (const bend of [0.3, 0.5, 0.7]) {
    BOTTOM_KICK_SHAPES[strokeId] = { reach, rise, bend }
    const error = meanXor()
    if (error < best.error) best = { error, reach, rise, bend }
  }
  console.log(cho, strokeId, `xor 평균 ${before.toFixed(4)} → ${best.error.toFixed(4)}`, { reach: +best.reach.toFixed(2), rise: +best.rise.toFixed(2), bend: best.bend })
}
