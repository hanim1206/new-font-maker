/**
 * 배치 규칙 남은 보정(`src/services/layoutRuleResiduals.ts`)을 잰다. 4788자(첫닿자 19 × 오른홀자 9 × 받침 28)에서
 * 규칙 − 모델 박스 차이(첫닿자 오른면 · 홀자 왼면)의 짝별 가운데값을 보고, 0.015 넘는 짝만 뒤집어 예외값으로 낸다.
 * 왼가지 짝의 파고듦 예외 = 홀자 왼면 차이 − (첫닿자 오른면 예외로 이미 옮긴 몫). 표를 비우고 돌린 뒤 결과를 손으로 옮긴다.
 *
 *   npx esbuild scripts/layout-rules/measure-residuals.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/resid.mjs && node /tmp/resid.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST } from '../../src/data/Hangul'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { DEFAULT_STYLE } from '../../src/stores/globalStyleStore'
import { RIGHT_VOWELS, scoreGlyph } from '../../src-next/layoutRulesScore'
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
const LEFT_BRANCH = new Set(['ㅓ', 'ㅔ', 'ㅕ', 'ㅖ'])
const THRESHOLD = 0.015
const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]

const choRight: Record<string, number> = {}
const inset: Record<string, number> = {}
let over = 0, total = 0
for (const cho of CHOSEONG_LIST) for (const jung of RIGHT_VOWELS) {
  const ch: number[] = [], ju: number[] = []
  for (let jong = 0; jong < 28; jong += 1) {
    const char = String.fromCodePoint(0xac00 + ((CHOSEONG_LIST as readonly string[]).indexOf(cho) * 21 + JUNG_CODE[jung]) * 28 + jong)
    const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline: outlineOf(char.codePointAt(0)!), params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
    if (!score.ok || !score.box?.parts.CH || !score.box.parts.JU) continue
    total += 1
    if (score.box.maxAbs > 0.02) over += 1
    ch.push(score.box.parts.CH.diff.right)
    ju.push(score.box.parts.JU.diff.left)
  }
  const mc = median(ch), mj = median(ju)
  if (Math.abs(mc) > THRESHOLD) choRight[cho + jung] = +(-mc).toFixed(3)
  const branch = mj - (Math.abs(mc) > THRESHOLD ? mc : 0)
  if (LEFT_BRANCH.has(jung) && Math.abs(branch) > THRESHOLD) inset[cho + jung] = +(-branch).toFixed(3)
}
console.log(`±0.02 밖 ${over}/${total}`)
console.log('CHO_RIGHT_BY_PAIR 에 더할 값', JSON.stringify(choRight))
console.log('BRANCH_INSET_BY_PAIR 에 더할 값', JSON.stringify(inset))
