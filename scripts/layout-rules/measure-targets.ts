/**
 * 배치 규칙 1차(박스 일치)의 자모별 목표값을 지금 모델(노토 변화량 모델)이 그린 잉크에서 잰다.
 * 오른홀자 + 받침 전수(19 × 9 × 27)와 받침 없는 오른홀자(19 × 9)에서 부품별 잉크 바깥 네모의 가운데값.
 * 결과는 `src/services/layoutRuleTargets.ts`에 쓴다.
 *
 *   npx esbuild scripts/layout-rules/measure-targets.ts --bundle --platform=node --format=esm --loader:.json=json --outfile=/tmp/measure-targets.mjs && node /tmp/measure-targets.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { CHOSEONG_LIST, JONGSEONG_LIST } from '../../src/data/Hangul'
import { glyphPlacementOf } from '../../src/services/notoGlyphXor'
import { DEFAULT_STYLE } from '../../src/stores/globalStyleStore'
import type { LayoutSchema } from '../../src/types'
import { decomposeSyllable } from '../../src/utils/hangulUtils'
import { DEFAULT_LAYOUT_SCHEMAS } from '../../src/utils/layoutCalculator'
import { REFERENCE_BODY_PADDING } from '../../src/services/designBodyPlacement'
import { partInkMeasure, RIGHT_VOWELS } from '../../src-next/layoutRulesScore'

const maps = baseJamos as any
const model = JSON.parse(fs.readFileSync('public/noto-preset/model.json', 'utf8'))
const JUNG_CODE: Record<string, number> = { ㅏ: 0, ㅐ: 1, ㅑ: 2, ㅒ: 3, ㅓ: 4, ㅔ: 5, ㅕ: 6, ㅖ: 7, ㅣ: 20 }
const FINALS = JONGSEONG_LIST.filter((j) => j !== '') as string[]
const DOUBLE_CHO = new Set(['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'])
const TWO_STEM = new Set(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ'])

type B = { left: number; right: number; top: number; bottom: number }
interface Row { cho: string; jung: string; jong: string; CH: B; JU: B; JO: B | null; t: number }
const rows: Row[] = []
for (const cho of CHOSEONG_LIST) for (const jung of RIGHT_VOWELS) for (const jong of ['', ...FINALS]) {
  const ch = String.fromCodePoint(0xac00 + (CHOSEONG_LIST.indexOf(cho) * 21 + JUNG_CODE[jung]) * 28 + (jong ? JONGSEONG_LIST.indexOf(jong as never) : 0))
  const syl = decomposeSyllable(ch, maps.choseong, maps.jungseong, maps.jongseong)
  const schema: LayoutSchema = { ...DEFAULT_LAYOUT_SCHEMAS[syl.layoutType], padding: REFERENCE_BODY_PADDING, designBodyPadding: REFERENCE_BODY_PADDING }
  const placement = glyphPlacementOf(syl, schema, DEFAULT_STYLE, model)
  if (placement.kind !== 'boxes') continue
  const ink = partInkMeasure(syl, DEFAULT_STYLE)(placement.boxes as any)
  if (!ink.CH || !ink.JU || (jong && !ink.JO)) continue
  rows.push({ cho, jung, jong, CH: ink.CH.bounds, JU: ink.JU.bounds, JO: ink.JO?.bounds ?? null, t: ink.CH.thickness })
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r3 = (v: number) => Math.round(v * 1000) / 1000
const by = <K extends string>(list: Row[], key: (r: Row) => K, f: (r: Row) => number) => {
  const g: Record<string, number[]> = {}
  for (const r of list) (g[key(r)] ||= []).push(f(r))
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, r3(median(v))]))
}
const withJong = rows.filter((r) => r.jong)
const noJong = rows.filter((r) => !r.jong)
const single = withJong.filter((r) => !TWO_STEM.has(r.jung))

// 첫닿자: 왼 · 오른 · 위(홀자 기둥 하나 옆), 두 기둥 옆 폭 비율, 받침 없을 때 아래
const cho = Object.fromEntries(CHOSEONG_LIST.map((c) => {
  const mine = single.filter((r) => r.cho === c)
  const two = withJong.filter((r) => r.cho === c && TWO_STEM.has(r.jung))
  const width = median(mine.map((r) => r.CH.right - r.CH.left))
  return [c, {
    left: r3(median(mine.map((r) => r.CH.left))), right: r3(median(mine.map((r) => r.CH.right))), top: r3(median(mine.map((r) => r.CH.top))),
    twoStemScale: r3(median(two.map((r) => (r.CH.right - r.CH.left))) / width),
    bottomNoFinal: r3(median(noJong.filter((r) => r.cho === c).map((r) => r.CH.bottom))),
  }]
}))
// 첫닿자 아래 = 받침 윗면 − 틈. 틈은 첫닿자별(두께 배수) + 받침별 잔차. (받침별로만 재면 첫닿자 꼴 차이가 0.03~0.06 남는다 — 11-08 측정)
const choGap = by(withJong, (r) => r.cho, (r) => (r.JO!.top - r.CH.bottom) / r.t)
const jongGapOffset = by(withJong, (r) => r.jong, (r) => (r.JO!.top - r.CH.bottom) / r.t - choGap[r.cho])
// 왼가지 홀자(ㅓ ㅕ ㅔ ㅖ)의 왼면 = 첫닿자 오른면 + 파고듦. 첫닿자별(오른쪽이 열린 ㄴ ㄱ ㄷ은 깊이 들어온다) + 홀자별 잔차.
const LEFT_BRANCH = new Set(['ㅓ', 'ㅕ', 'ㅔ', 'ㅖ'])
const branchRows = rows.filter((r) => LEFT_BRANCH.has(r.jung))
const branchInsetByCho = by(branchRows, (r) => r.cho, (r) => r.JU.left - r.CH.right)
const branchInsetByJung = by(branchRows, (r) => r.jung, (r) => r.JU.left - r.CH.right - branchInsetByCho[r.cho])
// 홀자: 왼 · 오른(첫닿자 쌍자음 아닌 것), 쌍자음 옆 왼면 이동
const jung = Object.fromEntries(RIGHT_VOWELS.map((j) => {
  const mine = rows.filter((r) => r.jung === j && !DOUBLE_CHO.has(r.cho))
  const dbl = rows.filter((r) => r.jung === j && DOUBLE_CHO.has(r.cho))
  return [j, { left: r3(median(mine.map((r) => r.JU.left))), right: r3(median(mine.map((r) => r.JU.right))), leftNextToDouble: r3(median(dbl.map((r) => r.JU.left))) }]
}))
// 받침: 왼 · 오른 · 위 · 아래, 기둥 끝 − 받침 윗면
const jong = Object.fromEntries(FINALS.map((j) => {
  const mine = withJong.filter((r) => r.jong === j)
  return [j, {
    left: r3(median(mine.map((r) => r.JO!.left))), right: r3(median(mine.map((r) => r.JO!.right))), top: r3(median(mine.map((r) => r.JO!.top))), bottom: r3(median(mine.map((r) => r.JO!.bottom))),
    pillarReach: r3(median(mine.map((r) => r.JU.bottom - r.JO!.top))),
  }]
}))
// 받침 오른면의 홀자별 치우침(받침 가운데값 대비)
const jongRightByJung = by(withJong, (r) => r.jung, (r) => r.JO!.right - jong[r.jong].right)
const jongLeftByJung = by(withJong, (r) => r.jung, (r) => r.JO!.left - jong[r.jong].left)
// 받침 없는 홀자 기둥 아래
const pillarBottomNoFinal = r3(median(noJong.map((r) => r.JU.bottom)))

const out = `/* eslint-disable */
/**
 * 배치 규칙 1차(박스 일치)의 자모별 목표값. 노토 몸통(왼 .05 · 오른 .89 · 위 .05 · 아래 .96)에서 잰 잉크 바깥 네모(em).
 * 지금 모델(노토 변화량 모델, 노토 xor 0.19)이 기본 획으로 그린 잉크의 가운데값이다 — 노토 윤곽을 직접 잰 것이 아니다.
 * 표본: 첫닿자 19 × 오른홀자 9 × 받침 27 + 받침 없는 171자 = ${rows.length}자.
 * 만든 날: ${new Date().toISOString().slice(0, 10)}. 다시 만들기: scripts/layout-rules/measure-targets.ts (파일 머리 참고).
 */

export interface ChoTarget { left: number; right: number; top: number; twoStemScale: number; bottomNoFinal: number }
export interface JungTarget { left: number; right: number; leftNextToDouble: number }
export interface JongTarget { left: number; right: number; top: number; bottom: number; pillarReach: number }

/** 첫닿자: 기둥 하나짜리 홀자 옆의 왼 · 오른 · 위, 두 기둥 홀자 옆 폭 비율, 받침 없을 때 아래. */
export const CHO_TARGET: Record<string, ChoTarget> = ${JSON.stringify(cho, null, 2)}

/** 첫닿자 아래 = 받침 윗면 − 두께 × (첫닿자 틈 + 받침 잔차). */
export const CHO_GAP: Record<string, number> = ${JSON.stringify(choGap, null, 2)}
export const JONG_GAP_OFFSET: Record<string, number> = ${JSON.stringify(jongGapOffset, null, 2)}

/** 왼가지 홀자(ㅓ ㅕ ㅔ ㅖ)의 왼면 = 첫닿자 오른면 + (첫닿자별 파고듦 + 홀자별 잔차). 음수면 첫닿자 안쪽으로 들어온다. */
export const BRANCH_INSET_BY_CHO: Record<string, number> = ${JSON.stringify(branchInsetByCho, null, 2)}
export const BRANCH_INSET_BY_JUNG: Record<string, number> = ${JSON.stringify(branchInsetByJung, null, 2)}

/** 홀자: 왼 · 오른, 쌍자음 옆의 왼면. */
export const JUNG_TARGET: Record<string, JungTarget> = ${JSON.stringify(jung, null, 2)}

/** 받침: 네 변과 기둥 끝(받침 윗면 대비, + = 아래). */
export const JONG_TARGET: Record<string, JongTarget> = ${JSON.stringify(jong, null, 2)}

/** 받침 왼 · 오른면의 홀자별 치우침. */
export const JONG_LEFT_BY_JUNG: Record<string, number> = ${JSON.stringify(jongLeftByJung, null, 2)}
export const JONG_RIGHT_BY_JUNG: Record<string, number> = ${JSON.stringify(jongRightByJung, null, 2)}

/** 받침 없을 때 홀자 기둥 아래. */
export const PILLAR_BOTTOM_NO_FINAL = ${pillarBottomNoFinal}
`
fs.writeFileSync('src/services/layoutRuleTargets.ts', out)
console.log('rows', rows.length, 'written src/services/layoutRuleTargets.ts')
console.log('choGap', JSON.stringify(choGap), 'jongGapOffset', JSON.stringify(jongGapOffset))
console.log('branchInsetByCho', JSON.stringify(branchInsetByCho), 'byJung', JSON.stringify(branchInsetByJung))
console.log('jongRightByJung', JSON.stringify(jongRightByJung), 'jongLeftByJung', JSON.stringify(jongLeftByJung))
console.log('jung', JSON.stringify(jung))
