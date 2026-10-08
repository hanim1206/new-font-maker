/**
 * 숫자 · 기호 씨앗 획 맞춤. 손으로 잡은 거친 골격(`ROUGH`)을 노토 산스 KR 400 윤곽에 대고 중심선 추출(`extractStrokesJointly`)로 다듬어
 * `src/data/symbolSeedsFitted.ts`에 쓴다. `0 1 ? ,`는 손으로 맞춘 씨앗(`symbolSeeds.ts`)을 그대로 쓰므로 여기 없다.
 *
 *   npx tsx scripts/font-check/fitSymbolSeeds.ts
 *
 * 플랜: docs/plans/2026-10-08_숫자-기호-획-편집.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { extractStrokesJointly } from '../../src/services/centerlineExtract'
import type { MultiPolygon } from '../../src/services/polygonBoolean'
import type { AnchorPoint, StrokeDataV2 } from '../../src/types'

type NotoPoint = [number, number, number]
type Data = { weights: Record<string, Record<string, { advanceWidth: number; contours: NotoPoint[][] }>> }

const UPM = 1000
const BASELINE_Y = 880
const T = 0.085

/** 거친 골격. 점 `[x, y]`(칸 좌표: x = 노토 400 폭, y = EM 높이 · 밑선 0.88), 꺾이는 점은 `[x, y, 1]`. */
type Rough =
  /** `raw`: 맞추지 않고 그대로 쓴다(획이 잉크를 나눠 갖는 글자에서 맞춤이 획을 뺏길 때). */
  | { kind: 'path'; points: Array<[number, number] | [number, number, 1]>; closed?: boolean; raw?: boolean }
  | { kind: 'ring'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'dot'; cx: number; cy: number; r: number }

const P = (...points: Array<[number, number] | [number, number, 1]>): Rough => ({ kind: 'path', points })
const R = (cx: number, cy: number, rx: number, ry: number): Rough => ({ kind: 'ring', cx, cy, rx, ry })
const RAW = (...points: Array<[number, number] | [number, number, 1]>): Rough => ({ kind: 'path', points, raw: true })
const D = (cx: number, cy: number, r: number): Rough => ({ kind: 'dot', cx, cy, r })
const mirror = (items: Rough[]): Rough[] => items.map((item) => item.kind === 'path'
  ? { ...item, points: item.points.map((p) => (p.length === 3 ? [1 - p[0], p[1], 1] : [1 - p[0], p[1]]) as [number, number] | [number, number, 1]) }
  : { ...item, cx: 1 - item.cx })

const ROUGH: Record<string, Rough[]> = {
  '2': [P([0.17, 0.27], [0.5, 0.175], [0.8, 0.34], [0.17, 0.84, 1], [0.88, 0.84])],
  '3': [P([0.14, 0.25], [0.48, 0.175], [0.78, 0.32], [0.42, 0.49, 1], [0.82, 0.67], [0.47, 0.845], [0.11, 0.76])],
  '4': [P([0.66, 0.84], [0.66, 0.17, 1], [0.09, 0.66, 1], [0.93, 0.66])],
  '5': [P([0.83, 0.185], [0.24, 0.185, 1], [0.19, 0.5, 1], [0.48, 0.42], [0.82, 0.63], [0.47, 0.845], [0.1, 0.76])],
  '6': [P([0.79, 0.21], [0.48, 0.175], [0.18, 0.52], [0.5, 0.845], [0.83, 0.65], [0.52, 0.43], [0.24, 0.56])],
  '7': [P([0.12, 0.185], [0.87, 0.185, 1], [0.4, 0.84])],
  '8': [R(0.5, 0.33, 0.29, 0.16), R(0.5, 0.665, 0.33, 0.18)],
  // 9는 6을 칸 가운데로 반 바퀴 돌린 꼴(노토도 거의 그렇다). 아래 `ROTATED`에서 만든다.
  '.': [D(0.5, 0.823, 0.069)],
  '!': [P([0.5, 0.165], [0.5, 0.66]), D(0.5, 0.823, 0.066)],
  ':': [D(0.5, 0.42, 0.069), D(0.5, 0.823, 0.069)],
  ';': [D(0.52, 0.42, 0.068), D(0.52, 0.815, 0.068), P([0.62, 0.82], [0.5, 0.97], [0.26, 1.055])],
  "'": [P([0.5, 0.135], [0.5, 0.37])],
  '"': [P([0.32, 0.135], [0.32, 0.37]), P([0.68, 0.135], [0.68, 0.37])],
  '-': [P([0.18, 0.6], [0.82, 0.6])],
  '~': [RAW([0.12, 0.55], [0.32, 0.465], [0.5, 0.51], [0.68, 0.555], [0.885, 0.515])],
  '(': [P([0.79, 0.075], [0.4, 0.57], [0.79, 1.065])],
  ')': mirror([P([0.79, 0.075], [0.4, 0.57], [0.79, 1.065])]),
  '[': [P([0.85, 0.115], [0.4, 0.115, 1], [0.4, 1.02, 1], [0.85, 1.02])],
  ']': mirror([P([0.85, 0.115], [0.4, 0.115, 1], [0.4, 1.02, 1], [0.85, 1.02])]),
  '{': [P([0.86, 0.11], [0.55, 0.25], [0.55, 0.49], [0.17, 0.57, 1], [0.55, 0.65], [0.55, 0.89], [0.86, 1.025])],
  '}': mirror([P([0.86, 0.11], [0.55, 0.25], [0.55, 0.49], [0.17, 0.57, 1], [0.55, 0.65], [0.55, 0.89], [0.86, 1.025])]),
  '<': [P([0.9, 0.31], [0.11, 0.51, 1], [0.9, 0.71])],
  '>': mirror([P([0.9, 0.31], [0.11, 0.51, 1], [0.9, 0.71])]),
  '+': [P([0.1, 0.51], [0.9, 0.51]), P([0.5, 0.29], [0.5, 0.735])],
  '=': [P([0.1, 0.395], [0.9, 0.395]), P([0.1, 0.627], [0.9, 0.627])],
  '*': [P([0.5, 0.095], [0.5, 0.25]), P([0.5, 0.25], [0.16, 0.17]), P([0.5, 0.25], [0.84, 0.17]), P([0.5, 0.25], [0.27, 0.39]), P([0.5, 0.25], [0.73, 0.39])],
  '/': [P([0.86, 0.1], [0.14, 1.045])],
  '%': [R(0.23, 0.33, 0.15, 0.16), R(0.77, 0.69, 0.15, 0.16), P([0.7, 0.15], [0.3, 0.87])],
  '#': [P([0.395, 0.155], [0.235, 0.88]), P([0.775, 0.155], [0.61, 0.88]), P([0.11, 0.39], [0.94, 0.39]), P([0.07, 0.62], [0.9, 0.62])],
  '&': [RAW([0.955, 0.855], [0.62, 0.7], [0.32, 0.43], [0.27, 0.27], [0.44, 0.165], [0.6, 0.27], [0.42, 0.43], [0.13, 0.66], [0.36, 0.855], [0.68, 0.76], [0.9, 0.48])],
  '@': [R(0.455, 0.61, 0.125, 0.18), RAW([0.66, 0.42], [0.63, 0.72], [0.72, 0.79], [0.85, 0.7], [0.905, 0.53], [0.8, 0.3], [0.55, 0.19], [0.25, 0.3], [0.095, 0.65], [0.25, 0.95], [0.5, 1.02], [0.685, 0.97])],
}

/** 매끈한 점은 캣멀-롬 핸들, 꺾이는 점은 핸들 없음. */
function pathStroke(id: string, rough: Extract<Rough, { kind: 'path' }>): StrokeDataV2 {
  const pts = rough.points
  const points: AnchorPoint[] = pts.map((p, i) => {
    const anchor: AnchorPoint = { x: p[0], y: p[1] }
    if (p.length === 3 || i === 0 || i === pts.length - 1) return anchor
    const prev = pts[i - 1], next = pts[i + 1]
    const dx = (next[0] - prev[0]) / 6, dy = (next[1] - prev[1]) / 6
    return { ...anchor, handleIn: { x: p[0] - dx, y: p[1] - dy }, handleOut: { x: p[0] + dx, y: p[1] + dy } }
  })
  return { id, points, closed: false, thickness: T }
}

function ringStroke(id: string, { cx, cy, rx, ry }: Extract<Rough, { kind: 'ring' }>): StrokeDataV2 {
  const k = 0.552, hx = rx * k, hy = ry * k
  return {
    id, closed: true, thickness: T, points: [
      { x: cx, y: cy - ry, handleIn: { x: cx - hx, y: cy - ry }, handleOut: { x: cx + hx, y: cy - ry } },
      { x: cx + rx, y: cy, handleIn: { x: cx + rx, y: cy - hy }, handleOut: { x: cx + rx, y: cy + hy } },
      { x: cx, y: cy + ry, handleIn: { x: cx + hx, y: cy + ry }, handleOut: { x: cx - hx, y: cy + ry } },
      { x: cx - rx, y: cy, handleIn: { x: cx - rx, y: cy + hy }, handleOut: { x: cx - rx, y: cy - hy } },
    ],
  }
}

/** 점은 맞추지 않는다 — 아주 짧은 둥근 끝 획(`symbolSeeds.ts`의 `dot`과 같은 꼴). */
function dotStroke(id: string, { cx, cy, r }: Extract<Rough, { kind: 'dot' }>): StrokeDataV2 {
  const half = r * 0.05
  return { id, points: [{ x: cx, y: cy - half }, { x: cx, y: cy + half }], closed: false, thickness: r * 2, linecap: 'round' }
}

/** 노토 2차 윤곽 → 다각형(EM, 위 0). */
function ghostOf(contours: NotoPoint[][]): MultiPolygon {
  const toEm = (x: number, y: number): [number, number] => [x / UPM, (BASELINE_Y - y) / UPM]
  return contours.map((contour) => {
    const ring: [number, number][] = []
    const on: Array<[number, number, boolean]> = []
    contour.forEach((p, i) => {
      const prev = contour[(i - 1 + contour.length) % contour.length]
      if (p[2] !== 1 && prev[2] !== 1) on.push([(p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, true])
      on.push([p[0], p[1], p[2] === 1])
    })
    const start = on.findIndex((p) => p[2])
    const seq = [...on.slice(start), ...on.slice(0, start)]
    for (let i = 0; i < seq.length; i += 1) {
      const a = seq[i]
      if (!a[2]) continue
      const b = seq[(i + 1) % seq.length]
      if (b[2]) { ring.push(toEm(a[0], a[1])); continue }
      const c = seq[(i + 2) % seq.length]
      for (let k = 0; k < 8; k += 1) {
        const t = k / 8, u = 1 - t
        ring.push(toEm(u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]))
      }
    }
    return [ring]
  })
}

const round = (value: number) => Math.round(value * 10000) / 10000

const data = JSON.parse(readFileSync('src/data/notoLatin.v1.json', 'utf8')) as Data
const out: Record<string, StrokeDataV2[]> = {}
for (const [char, roughs] of Object.entries(ROUGH)) {
  const glyph = data.weights['400'][String(char.codePointAt(0))]
  const cellWidth = glyph.advanceWidth / UPM
  const box = { x: 0, y: 0, width: cellWidth, height: 1 }
  const seeds = roughs.map((rough, index) => {
    const id = `${char}-${index}`
    return rough.kind === 'path' ? pathStroke(id, rough) : rough.kind === 'ring' ? ringStroke(id, rough) : dotStroke(id, rough)
  })
  // 점 · raw 획은 맞추지 않는다. 한 글자에 raw 획이 있으면 고리도 그대로 둔다(맞춤이 고리에 잉크를 몰아준다).
  const anyRaw = roughs.some((rough) => rough.kind === 'path' && rough.raw)
  const fitIndexes = seeds.map((_, index) => index).filter((index) => {
    const rough = roughs[index]
    return rough.kind === 'path' ? !rough.raw : rough.kind === 'ring' ? !anyRaw : false
  })
  const fitted = extractStrokesJointly(fitIndexes.map((index) => seeds[index]), box, ghostOf(glyph.contours), T)
  const back = (p: { x: number; y: number }) => ({ x: round(p.x / cellWidth), y: round(p.y) })
  fitIndexes.forEach((index, at) => {
    const { stroke, coverage } = fitted[at]
    if (coverage < 0.6) console.warn(`${char} 획 ${index}: 잉크를 ${Math.round(coverage * 100)}%만 찾음 — 거친 골격을 고칠 것`)
    seeds[index] = {
      ...seeds[index],
      points: stroke.points.map((p) => ({ ...back(p), ...(p.handleIn ? { handleIn: back(p.handleIn) } : {}), ...(p.handleOut ? { handleOut: back(p.handleOut) } : {}) })),
    }
  })
  out[char] = seeds.map((seed) => ({ ...seed, thickness: round(seed.thickness) }))
}

// 반 바퀴 돌린 글자. 노토 6과 9의 잉크 상자 위아래 합(0.134 + 0.893).
const ROTATED: Record<string, { from: string; ySum: number }> = { '9': { from: '6', ySum: 1.027 } }
for (const [char, { from, ySum }] of Object.entries(ROTATED)) {
  const turn = (p: { x: number; y: number }) => ({ x: round(1 - p.x), y: round(ySum - p.y) })
  out[char] = out[from].map((stroke, index) => ({
    ...stroke,
    id: `${char}-${index}`,
    points: stroke.points.map((p) => ({ ...turn(p), ...(p.handleIn ? { handleIn: turn(p.handleIn) } : {}), ...(p.handleOut ? { handleOut: turn(p.handleOut) } : {}) })),
  }))
}

writeFileSync('src/data/symbolSeedsFitted.ts', `import type { StrokeDataV2 } from '../types'

/**
 * 숫자 · 기호 씨앗 획(자동 맞춤). \`scripts/font-check/fitSymbolSeeds.ts\`가 만든다 — 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.
 * 칸 좌표: x = 노토 400 그 글자 폭, y = EM 높이(밑선 0.88).
 */
export const FITTED_SYMBOL_SEEDS: Record<string, StrokeDataV2[]> = ${JSON.stringify(out, null, 2)}
`)
console.log(`씨앗 ${Object.keys(out).length}자`)
