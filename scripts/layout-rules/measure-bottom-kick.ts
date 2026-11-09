/**
 * 배치 규칙 2차(획) — 맨 아래 가로줄기 치킴의 꼴 값을 찾는다. 결과는 `src/services/strokeShapeRules.ts`의 세 표에 손으로 옮긴다.
 * 무리마다 글자를 모아 규칙 자리는 한 번만 구하고, 꼴 값(reach · rise · bend)을 격자로 바꿔 가며 노토 xor 평균이 가장 작은 값을 고른다.
 * - 첫닿자 · 오른가지(ㅏ ㅐ ㅑ ㅒ ㅣ): ㄴ ㄷ ㄸ ㄹ ㅌ ㅍ × 홀자 5 × 받침 다섯 = 25자씩
 * - 첫닿자 · 왼가지(ㅓ ㅔ ㅕ ㅖ): ㄷ ㄸ ㄹ ㅌ ㅍ × 홀자 4 × 받침 다섯 = 20자씩
 * - 받침 ㄵ의 ㄴ: 첫닿자 짝수 번째 10 × 오른홀자 9 = 90자
 * 노토 윤곽에서 잰 길이(우리 잉크 오른끝 너머로 노토 가로줄기가 이어지는 길이)가 격자 범위를 정했다.
 *
 *   npx esbuild scripts/layout-rules/measure-bottom-kick.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/kick.mjs && node /tmp/kick.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST, JONGSEONG_LIST } from '../../src/data/Hangul'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { appGlyphInkRegions, ghostXorRatio } from '../../src/services/notoGlyphXor'
import { applyStrokeShapeRules, BOTTOM_KICK_SHAPES, BOTTOM_KICK_SHAPES_LEFT_BRANCH, JONG_KICK_SHAPES } from '../../src/services/strokeShapeRules'
import type { KickShape } from '../../src/services/strokeShapeRules'
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
const RIGHT = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅣ'], LEFT = ['ㅓ', 'ㅔ', 'ㅕ', 'ㅖ']
const compose = (cho: string, jung: string, jong: number) => String.fromCodePoint(0xac00 + ((CHOSEONG_LIST as readonly string[]).indexOf(cho) * 21 + JUNG_CODE[jung]) * 28 + jong)
const SHAPES = { giyeokSweep: false, bottomKick: true, tailSweep: false }

interface Group { name: string; table: Record<string, KickShape>; strokeId: string; chars: string[]; reaches: number[]; rises: number[] }
const choChars = (cho: string, vowels: string[]) => vowels.flatMap((jung) => [0, 4, 8, 16, 21].map((jong) => compose(cho, jung, jong)))
const GROUPS: Group[] = [
  ...[['ㄴ', 'ㄴ-1'], ['ㄷ', 'ㄷ-1'], ['ㄸ', 'ㄸ-4'], ['ㄹ', 'ㄹ-1'], ['ㅌ', 'ㅌ-1'], ['ㅍ', 'ㅍ-2']].map(([cho, strokeId]) => ({ name: `${cho} 오른가지`, table: BOTTOM_KICK_SHAPES, strokeId, chars: choChars(cho, RIGHT), reaches: range(0.95, 1.5, 0.05), rises: range(0, 0.14, 0.02) })),
  ...[['ㄷ', 'ㄷ-1'], ['ㄸ', 'ㄸ-4'], ['ㄹ', 'ㄹ-1'], ['ㅌ', 'ㅌ-1'], ['ㅍ', 'ㅍ-2']].map(([cho, strokeId]) => ({ name: `${cho} 왼가지`, table: BOTTOM_KICK_SHAPES_LEFT_BRANCH, strokeId, chars: choChars(cho, LEFT), reaches: range(0.95, 1.4, 0.05), rises: range(0, 0.1, 0.02) })),
  { name: '받침 ㄵ', table: JONG_KICK_SHAPES, strokeId: 'ㄵ종-1', chars: CHOSEONG_LIST.filter((_, i) => i % 2 === 0).flatMap((cho) => Object.keys(JUNG_CODE).map((jung) => compose(cho, jung, JONGSEONG_LIST.indexOf('ㄵ')))), reaches: range(0.9, 1.6, 0.1), rises: range(0, 0.3, 0.03) },
]
function range(from: number, to: number, step: number) { const out: number[] = []; for (let v = from; v <= to + 1e-9; v += step) out.push(+v.toFixed(3)); return out }

for (const group of GROUPS.filter((g) => !process.env.ONLY || g.name.includes(process.env.ONLY))) {
  const glyphs = group.chars.flatMap((char) => {
    const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline: outlineOf(char.codePointAt(0)!), params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
    return score.ok && score.drawn ? [{ syllable: score.drawn, boxes: score.boxes.rule as Partial<Record<Part, BoxConfig>>, ghost: score.ink.ghost, before: score.xor.rule }] : []
  })
  const meanXor = () => glyphs.reduce((sum, glyph) => {
    const app = appGlyphInkRegions(applyStrokeShapeRules(glyph.syllable, SHAPES), { kind: 'boxes', boxes: glyph.boxes }, DEFAULT_STYLE)
    const value = app.ok ? ghostXorRatio(app.regions, glyph.ghost, 'boxes') : null
    return sum + (value?.xorRatio ?? 1)
  }, 0) / glyphs.length
  const before = glyphs.reduce((sum, glyph) => sum + glyph.before, 0) / glyphs.length
  let best = { error: Infinity, reach: 1, rise: 0, bend: 0.5 }
  for (const reach of group.reaches) for (const rise of group.rises) for (const bend of [0.3, 0.5, 0.7]) {
    group.table[group.strokeId] = { reach, rise, bend }
    const error = meanXor()
    if (error < best.error) best = { error, reach, rise, bend }
  }
  group.table[group.strokeId] = { reach: best.reach, rise: best.rise, bend: best.bend }
  console.log(group.name, group.strokeId, `${glyphs.length}자 xor 평균 ${before.toFixed(4)} → ${best.error.toFixed(4)}`, JSON.stringify({ reach: best.reach, rise: best.rise, bend: best.bend }))
}
