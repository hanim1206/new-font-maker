/**
 * 숫자 · 기호 씨앗 획 맞춤. 손으로 잡은 거친 골격(`ROUGH`)을 노토 산스 KR 400 윤곽에 대고 중심선 추출(`extractStrokesJointly`)로 점 자리만 옮기고,
 * 핸들은 추출 값을 버리고 다시 깐다(추출 핸들은 잡음이 있어 우글거리고 직선도 휜다 — 10-08 사용자). `src/data/symbolSeedsFitted.ts`에 쓴다. `0 1 ? ,`는 손으로 맞춘 씨앗(`symbolSeeds.ts`)을 그대로 쓰므로 여기 없다.
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

/**
 * 거친 골격. 점 `[x, y]`(칸 좌표: x = 노토 400 폭, y = EM 높이 · 밑선 0.88). 꺾이는 점은 `[x, y, 1]`,
 * 매끈하되 다음 점까지 곧은 점은 `[x, y, 2]`. 양 끝이 꺾임 · 획 끝인 구간도 곧다.
 */
type Pt = [number, number] | [number, number, 1 | 2]
type Rough =
  /** `raw`: 맞추지 않고 그대로 쓴다(획이 잉크를 나눠 갖는 글자에서 맞춤이 획을 뺏길 때). */
  | { kind: 'path'; points: Pt[]; closed?: boolean; raw?: boolean }
  | { kind: 'ring'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'dot'; cx: number; cy: number; r: number }

const P = (...points: Pt[]): Rough => ({ kind: 'path', points })
const R = (cx: number, cy: number, rx: number, ry: number): Rough => ({ kind: 'ring', cx, cy, rx, ry })
const RAW = (...points: Pt[]): Rough => ({ kind: 'path', points, raw: true })
const D = (cx: number, cy: number, r: number): Rough => ({ kind: 'dot', cx, cy, r })
const mirror = (items: Rough[]): Rough[] => items.map((item) => item.kind === 'path'
  ? { ...item, points: item.points.map((p) => (p.length === 3 ? [1 - p[0], p[1], p[2]] : [1 - p[0], p[1]]) as Pt) }
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
  '{': [P([0.86, 0.11], [0.55, 0.25, 2], [0.55, 0.49], [0.17, 0.57, 1], [0.55, 0.65, 2], [0.55, 0.89], [0.86, 1.025])],
  '}': mirror([P([0.86, 0.11], [0.55, 0.25, 2], [0.55, 0.49], [0.17, 0.57, 1], [0.55, 0.65, 2], [0.55, 0.89], [0.86, 1.025])]),
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

type Flag = 0 | 1 | 2
const flagsOf = (rough: Extract<Rough, { kind: 'path' }>): Flag[] => rough.points.map((p) => (p.length === 3 ? p[2] : 0))

/** 곧은 구간: 앞 점이 `2`이거나, 양 끝이 꺾임 · 획 끝. */
function straightSegments(flags: readonly Flag[]): boolean[] {
  const hard = (i: number) => i === 0 || i === flags.length - 1 || flags[i] === 1
  return flags.slice(0, -1).map((flag, i) => flag === 2 || (hard(i) && hard(i + 1)))
}

/** 곡선 구간에서 핸들 길이 = 구간 길이 × 이 값. 4분원 하나가 한 구간일 때 원에 가깝다. */
const HANDLE_RATIO = 0.36

/**
 * 점 자리에서 핸들을 새로 깐다. 곧은 구간엔 핸들이 없다(그대로 직선). 매끈한 점의 접선은
 * 곧은 구간에 닿아 있으면 그 직선 방향, 아니면 앞뒤 점을 잇는 방향 — 앞뒤 핸들이 한 줄이라 꺾이거나 우글거리지 않는다.
 */
function smoothHandles(anchors: readonly { x: number; y: number }[], flags: readonly Flag[]): AnchorPoint[] {
  const n = anchors.length
  const straight = straightSegments(flags)
  const unit = (dx: number, dy: number) => { const d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d } }
  const dir = (a: number, b: number) => unit(anchors[b].x - anchors[a].x, anchors[b].y - anchors[a].y)
  const length = (a: number, b: number) => Math.hypot(anchors[b].x - anchors[a].x, anchors[b].y - anchors[a].y)
  const tangents = anchors.map((_, i) => {
    if (flags[i] === 1 || i === 0 || i === n - 1) return null
    if (straight[i - 1]) return dir(i - 1, i)
    if (straight[i]) return dir(i, i + 1)
    return dir(i - 1, i + 1)
  })
  const points: AnchorPoint[] = anchors.map((p) => ({ x: p.x, y: p.y }))
  for (let i = 0; i < n - 1; i += 1) {
    if (straight[i]) continue
    const len = length(i, i + 1) * HANDLE_RATIO
    const a = anchors[i], b = anchors[i + 1]
    // 꺾임 · 획 끝 쪽 핸들은 반대편 핸들 끝을 향한다.
    const tb = tangents[i + 1] ?? null, ta = tangents[i] ?? null
    const outDir = ta ?? (tb ? unit(b.x - tb.x * len - a.x, b.y - tb.y * len - a.y) : dir(i, i + 1))
    const inDir = tb ? { x: -tb.x, y: -tb.y } : (ta ? unit(a.x + ta.x * len - b.x, a.y + ta.y * len - b.y) : dir(i + 1, i))
    points[i].handleOut = { x: a.x + outDir.x * len, y: a.y + outDir.y * len }
    points[i + 1].handleIn = { x: b.x + inDir.x * len, y: b.y + inDir.y * len }
  }
  return points
}

function pathStroke(id: string, rough: Extract<Rough, { kind: 'path' }>): StrokeDataV2 {
  const anchors = rough.points.map((p) => ({ x: p[0], y: p[1] }))
  return { id, points: smoothHandles(anchors, flagsOf(rough)), closed: false, thickness: T }
}

function ringStroke(id: string, { cx, cy, rx, ry }: Pick<Extract<Rough, { kind: 'ring' }>, 'cx' | 'cy' | 'rx' | 'ry'>): StrokeDataV2 {
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

/** 추출이 점을 이보다 멀리 옮기면 버린다(칸 좌표). */
const MAX_SHIFT = 0.1

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
    // 추출에서는 점 자리만 받는다. 고리는 위 · 오른 · 아래 · 왼 네 점에서 다시 타원으로, 열린 획은 핸들을 새로 깐다.
    const rough = roughs[index]
    // 추출이 점을 엉뚱한 데로 끌고 가면(획 끝이 다른 줄기로 붙는 일) 그 점은 거친 골격 자리를 그대로 쓴다.
    const before = seeds[index].points
    const anchors = stroke.points.length === before.length && rough.kind === 'path'
      ? stroke.points.map(back).map((p, i) => (Math.hypot(p.x - before[i].x, p.y - before[i].y) > MAX_SHIFT ? { x: before[i].x, y: before[i].y } : p))
      : rough.kind === 'ring' ? stroke.points.map(back) : before.map((p) => ({ x: p.x, y: p.y }))
    if (rough.kind === 'path' && stroke.points.length !== before.length) console.warn(`${char} 획 ${index}: 점 수가 달라 거친 골격을 그대로 씀`)
    if (rough.kind === 'ring') {
      const [top, right, bottom, left] = anchors
      seeds[index] = ringStroke(seeds[index].id, { cx: (left.x + right.x) / 2, cy: (top.y + bottom.y) / 2, rx: (right.x - left.x) / 2, ry: (bottom.y - top.y) / 2 })
    } else if (rough.kind === 'path') {
      seeds[index] = { ...seeds[index], points: smoothHandles(anchors, flagsOf(rough)) }
    }
  })
  const r = (p: { x: number; y: number }) => ({ x: round(p.x), y: round(p.y) })
  out[char] = seeds.map((seed) => ({
    ...seed,
    thickness: round(seed.thickness),
    points: seed.points.map((p) => ({ ...r(p), ...(p.handleIn ? { handleIn: r(p.handleIn) } : {}), ...(p.handleOut ? { handleOut: r(p.handleOut) } : {}) })),
  }))
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
