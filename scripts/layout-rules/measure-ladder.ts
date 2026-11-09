/* eslint-disable */
// 가설 사다리 데이터. 실행: npx esbuild scripts/layout-rules/measure-ladder.ts --bundle --platform=node --format=esm --loader:.json=json --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL="\"/\"" --outfile=/tmp/ladder.mjs && OUT=/tmp/ladder.json node /tmp/ladder.mjs
/** 가설 사다리 데이터 — 패턴만에서 가설을 한 칸씩 쌓을 때 거리와 "아직 표가 하는 일". */
import fs from 'node:fs'
import baseJamos from '/home/user/new-font-maker/src/data/baseJamos.json'
import { DEFAULT_STYLE } from '/home/user/new-font-maker/src/stores/globalStyleStore'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '/home/user/new-font-maker/src/services/layoutRules'
import { DEFAULT_STROKE_SHAPE_PARAMS, STROKE_SHAPES_OFF } from '/home/user/new-font-maker/src/services/strokeShapeRules'
import { scoreGlyph, sampleChars, noFinalChars, regionsToPath } from '/home/user/new-font-maker/src-next/layoutRulesScore'
import { notoPresetChunkFile, notoPresetChunkIndex } from '/home/user/new-font-maker/src-next/notoPresetGlyphs'
const maps = baseJamos as any
const model = JSON.parse(fs.readFileSync('/home/user/new-font-maker/public/noto-preset/model.json', 'utf8'))
const chunks = new Map<number, any>()
const outlineOf = (cp: number) => { const i = notoPresetChunkIndex(cp)!; if (!chunks.has(i)) chunks.set(i, JSON.parse(fs.readFileSync('/home/user/new-font-maker/public/noto-preset/' + notoPresetChunkFile(i), 'utf8'))); return chunks.get(i)[String(cp)]?.outline }
const V = 120
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG_ALL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const JUNGS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ']
const PAT = { ...DEFAULT_LAYOUT_RULE_PARAMS, tables: false, rules: { ...DEFAULT_LAYOUT_RULE_PARAMS.rules, gap: true } }
const RAW = { ...DEFAULT_LAYOUT_RULE_PARAMS, rules: { faces: false, choTable: false, jungTable: false, jongTable: false, choBottom: false, pillar: false, gap: false } }
// 사다리 칸. 가설이 통과하면 여기에 한 줄 보탠다.
const STEPS = [
  { id: 'base', name: '패턴만', who: '관계 규칙 · 획 꼴 다섯 · 받침 없을 때 첫닿자 공식', params: PAT },
  { id: 'jungKinds', name: '+ 홀자 가지 갈래', who: '하니무스 관찰 11/9: 가로줄기가 뻗은 쪽으로 홀자가 간다 → 기둥이 하나면 가지 반대쪽으로 비켜서고, 기둥이 둘이면 기둥 틀은 그대로 두고 가지만 밖으로 나간다(ㅔㅖ 오른 기둥 = ㅐㅒ 0.813 · 0.814)', params: { ...PAT, jungKinds: true } },
]
const med = (a: number[]) => { const x = a.filter(Number.isFinite).sort((p, q) => p - q); return x.length ? x[x.length >> 1] : NaN }
const keys = ['CH.left', 'CH.right', 'CH.top', 'CH.bottom', 'JU.left', 'JU.right', 'JU.top', 'JU.bottom', 'JO.left', 'JO.right', 'JO.top', 'JO.bottom']
const rows: any[] = []
const res = new Map<string, any>()
for (const [pool, chars] of [['588', sampleChars()], ['171', noFinalChars()]] as const) for (const char of chars) {
  const outline = outlineOf(char.codePointAt(0)!); if (!outline) continue
  const table: any = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true, shapes: DEFAULT_STROKE_SHAPE_PARAMS })
  const raw: any = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: RAW, snapStems: false, shapes: STROKE_SHAPES_OFF })
  const steps = STEPS.map((st) => scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: st.params as any, snapStems: false, shapes: DEFAULT_STROKE_SHAPE_PARAMS }) as any)
  if (!table.ok || !table.box || steps.some((s) => !s.ok || !s.box)) continue
  const code = char.codePointAt(0)! - 0xac00
  const moves = steps.map((st) => { const m: Record<string, number> = {}; for (const part of ['CH', 'JU', 'JO']) { const a = table.box.parts[part]?.rule, b = st.box.parts[part]?.rule; if (!a || !b) continue; for (const e of ['left', 'right', 'top', 'bottom']) m[part + '.' + e] = +(a[e] - b[e]).toFixed(4) } return m })
  rows.push({ char, pool, cho: CHO[Math.floor(code / 588)], jung: JUNG_ALL[Math.floor((code % 588) / 28)], jong: JONG[code % 28], moves, x: { raw: raw.xor.rule, steps: steps.map((s) => s.xor.rule), table: table.xor.rule } })
  res.set(char, { table, steps })
}
const summary: any = {}
for (const pool of ['588', '171']) { const pr = rows.filter((r) => r.pool === pool); summary[pool] = { n: pr.length, raw: med(pr.map((r) => r.x.raw)), steps: STEPS.map((_, i) => med(pr.map((r) => r.x.steps[i]))), table: med(pr.map((r) => r.x.table)) } }
// 대표 글자(마지막 칸 기준으로 고른다 — 아직 표가 하는 일)
const last = STEPS.length - 1
const reps: any = {}
const need = new Set<string>()
for (const pool of ['588', '171']) for (const k of keys) {
  const pr = rows.filter((r) => r.pool === pool && r.moves[last][k] !== undefined); if (!pr.length) continue
  const mv = (r: any) => r.moves[last][k]
  const cellMed = (f: (r: any) => boolean) => med(pr.filter(f).map(mv))
  const closest = (list: any[], t: number) => list.sort((a, b) => Math.abs(mv(a) - t) - Math.abs(mv(b) - t))[0]
  const jStar = JUNGS.map((j) => ({ j, v: Math.abs(cellMed((r) => r.jung === j)) })).sort((a, b) => b.v - a.v)[0].j
  const jm: Record<string, number> = Object.fromEntries(JUNGS.map((j) => [j, cellMed((r) => r.jung === j)]))
  const cStar = [...CHO].map((c) => { const xs = pr.filter((r) => r.cho === c).map((r) => Math.abs(mv(r) - jm[r.jung])); return { c, v: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) } }).sort((a, b) => a.v - b.v)[0].c
  const pick = (cand: any[]) => (cand.length ? closest(cand, med(cand.map(mv))) : null)
  const byCho = [...CHO].map((c) => pick(pr.filter((r) => r.cho === c && r.jung === jStar))).filter(Boolean)
  const byJung = JUNGS.map((j) => pick(pr.filter((r) => r.cho === cStar && r.jung === j))).filter(Boolean)
  const byJong = pool === '588' ? JONG.slice(1).map((g) => pick(pr.filter((r) => r.jong === g))).filter(Boolean) : []
  const top = [...pr].sort((a, b) => Math.abs(mv(b)) - Math.abs(mv(a))).slice(0, 10)
  for (const r of [...byCho, ...byJung, ...byJong, ...top]) need.add(r.char)
  reps[pool + ' ' + k] = { jStar, cStar, byCho: byCho.map((r: any) => r.char), byJung: byJung.map((r: any) => r.char), byJong: byJong.map((r: any) => r.char), top: top.map((r: any) => r.char) }
}
// 칸마다 바로 아래 칸보다 가장 많이 나아진 글자(노토까지 거리 기준)
// 칸마다 홀자 가지 갈래별로 가장 많이 나아진 글자(같은 갈래끼리만 줄 세운다).
const KINDS = [['오른가지 ㅏㅑ', 'ㅏㅑ'], ['가지 없음 ㅣ', 'ㅣ'], ['왼가지 ㅓㅕ', 'ㅓㅕ'], ['두 기둥 ㅐㅒㅔㅖ', 'ㅐㅒㅔㅖ']] as const
const gain = (r: any, i: number) => r.x.steps[i - 1] - r.x.steps[i]
const stepTop = STEPS.map((_, i) => i === 0 ? [] : KINDS.map(([label, js]) => {
  const pr = rows.filter((r) => js.includes(r.jung))
  const top = [...pr].sort((a, b) => gain(b, i) - gain(a, i)).slice(0, 4)
  for (const r of top) need.add(r.char)
  return { label, med: +med(pr.map((r) => gain(r, i))).toFixed(3), items: top.map((r) => ({ char: r.char, before: +r.x.steps[i - 1].toFixed(3), after: +r.x.steps[i].toFixed(3) })) }
}))
const svgs: Record<string, { table: string; steps: string[] }> = {}
for (const c of need) { const r = res.get(c); if (r) svgs[c] = { table: regionsToPath(r.table.ink.rule, V), steps: r.steps.map((s: any) => regionsToPath(s.ink.rule, V)) } }
fs.writeFileSync(process.env.OUT!, JSON.stringify({ V, steps: STEPS.map(({ id, name, who }) => ({ id, name, who })), summary, rows: rows.map(({ x, ...r }) => r), reps, svgs, stepTop }))
console.log(JSON.stringify(summary))
