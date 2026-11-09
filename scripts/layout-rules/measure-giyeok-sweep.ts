/**
 * 배치 규칙 2차(획) — 노토 ㄱ ㅋ ㄲ 세로줄기 삐침 꼴을 잰다. 결과는 `src/services/strokeShapeRules.ts`의 `GIYEOK_SWEEP_SHAPES`에 손으로 옮긴다.
 * ㄱ ㅋ ㄲ × 오른홀자 9 × 받침 다섯(없음 ㄹ ㅁ ㅇ ㅎ 자리) = 135자. 규칙 자리의 첫닿자 칸에서 노토 잉크를 가로로 잘라
 * 세로줄기(폭 0.14 em 아래 토막 중 가장 오른쪽 — ㄲ 왼 ㄱ은 칸 왼쪽 55% 안에서)의 중심을 칸 비율로 읽고, 높이별 가운데값에
 * 꺾임 → 맺음 3차 곡선을 격자 탐색으로 맞춘다(꺾임 x는 고정, 손잡이 하나는 꺾임 바로 아래).
 *
 *   npx esbuild scripts/layout-rules/measure-giyeok-sweep.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/giyeok.mjs && node /tmp/giyeok.mjs
 */
import fs from 'node:fs'
import baseJamos from '../../src/data/baseJamos.json'
import { DEFAULT_LAYOUT_RULE_PARAMS } from '../../src/services/layoutRules'
import { unionOf } from '../../src/services/notoFitReport'
import { notoOutlineToInkRegions } from '../../src/services/notoOutlineInk'
import type { MultiPolygon } from '../../src/services/polygonBoolean'
import { DEFAULT_STYLE } from '../../src/stores/globalStyleStore'
import { RIGHT_VOWELS, scoreGlyph } from '../../src-next/layoutRulesScore'
import { notoPresetChunkFile, notoPresetChunkIndex } from '../../src-next/notoPresetGlyphs'

const maps = baseJamos as unknown as Parameters<typeof scoreGlyph>[0]['maps']
const model = JSON.parse(fs.readFileSync('public/noto-preset/model.json', 'utf8'))
const chunks = new Map<number, Record<string, { outline: Parameters<typeof scoreGlyph>[0]['outline'] }>>()
const outlineOf = (cp: number) => {
  const index = notoPresetChunkIndex(cp)!
  if (!chunks.has(index)) chunks.set(index, JSON.parse(fs.readFileSync('public/noto-preset/' + notoPresetChunkFile(index), 'utf8')))
  return chunks.get(index)![String(cp)].outline
}
const CHO_INDEX: Record<string, number> = { 'ㄱ': 0, 'ㄲ': 1, 'ㅋ': 15 }
const JUNG_CODE: Record<string, number> = { 'ㅏ': 0, 'ㅐ': 1, 'ㅑ': 2, 'ㅒ': 3, 'ㅓ': 4, 'ㅔ': 5, 'ㅕ': 6, 'ㅖ': 7, 'ㅣ': 20 }
const JONGS = [0, 4, 8, 16, 21]
const ROWS = Array.from({ length: 16 }, (_, i) => (i + 1) * 0.05)

const runsAt = (shape: MultiPolygon, y: number): [number, number][] => {
  const xs: number[] = []
  for (const polygon of shape) for (const ring of polygon) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y)) xs.push((xj - xi) * (y - yi) / (yj - yi) + xi)
  }
  xs.sort((a, b) => a - b)
  const runs: [number, number][] = []
  for (let k = 0; k + 1 < xs.length; k += 2) runs.push([xs[k], xs[k + 1]])
  return runs
}

function profileOf(cho: string, leftOfDouble: boolean): [number, number][] {
  const perRow: number[][] = ROWS.map(() => [])
  for (const jung of RIGHT_VOWELS) for (const jong of JONGS) {
    const char = String.fromCodePoint(0xac00 + (CHO_INDEX[cho] * 21 + JUNG_CODE[jung]) * 28 + jong)
    const outline = outlineOf(char.codePointAt(0)!)
    const score = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true })
    if (!score.ok || !score.boxes.rule.CH || !score.boxes.rule.JU) continue
    const CH = score.boxes.rule.CH, JU = score.boxes.rule.JU
    const ghost = notoOutlineToInkRegions(outline)
    if (!ghost.ok) continue
    const noto = unionOf(ghost.regions)
    ROWS.forEach((f, row) => {
      let runs = runsAt(noto, CH.y + f * CH.height).filter(([a, b]) => b > CH.x - 0.12 && a < Math.min(JU.x, CH.x + CH.width * 1.12) && b - a < 0.14)
      if (leftOfDouble) runs = runs.filter(([a, b]) => (a + b) / 2 < CH.x + CH.width * 0.55)
      const run = runs[runs.length - 1]
      if (run) perRow[row].push(((run[0] + run[1]) / 2 - CH.x) / CH.width)
    })
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]
  return ROWS.flatMap((f, row) => row >= 2 && perRow[row].length ? [[median(perRow[row]), f] as [number, number]] : [])
}

const bezier = (P: number[][], t: number) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]) }
function fit(points: [number, number][], cornerX: number, tailXs: number[], tailYs: number[]) {
  let best: { error: number; P: number[][] } | null = null
  for (let out = 0.05; out <= 0.7; out += 0.025) for (let px = -0.2; px <= cornerX; px += 0.025) for (let py = 0.3; py <= 1.1; py += 0.025) for (const tx of tailXs) for (const ty of tailYs) {
    const P = [[cornerX, 0], [cornerX, out], [px, py], [tx, ty]]
    const samples = Array.from({ length: 101 }, (_, i) => bezier(P, i / 100))
    let error = 0
    for (const [c, f] of points) error += Math.min(...samples.map(([x, y]) => (x - c) ** 2 + (y - f) ** 2))
    if (!best || error < best.error) best = { error, P }
  }
  return { P: best!.P.map((p) => p.map((v) => +v.toFixed(3))), rms: Math.sqrt(best!.error / points.length) }
}

const near = [0.02, 0.05, 0.08, 0.11]
console.log('ㄱ', fit(profileOf('ㄱ', false), 0.976, near, [0.92, 0.95, 0.98, 1]))
console.log('ㅋ', fit(profileOf('ㅋ', false), 0.972, near, [0.92, 0.95, 0.98, 1]))
console.log('ㄲ 오른', fit(profileOf('ㄲ', false), 0.978, [0.6, 0.62, 0.64, 0.66], [0.95, 0.98, 1]))
console.log('ㄲ 왼', fit(profileOf('ㄲ', true), 0.42, [0, 0.03, 0.06, 0.09], [0.85, 0.88, 0.91, 0.95]))
