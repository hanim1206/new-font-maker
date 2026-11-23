import type { Part } from '../src/types'

/**
 * 굵기 끝 900 · 박스 없는 쌓임 규칙(하니무스 2026-11-24 "900으로 가기로 해.", "이 방향으로 정할까?" "ㅇㅇ", "넘겨").
 * 정본: 거북이 정리 `study/mold-gap-design/1단계/rules-2026-11-24.md`(규칙 14개, 판 4~23). 계산 원형: 같은 폴더 `tools2/`
 * (warp.py 쌓인 글자 틈, t900.py 대비 · 안쪽 굵힘, nar.py ㅁ · ㅂ · ㅇ 0.92, dbl.py ㅃ 틈)를 그대로 옮겼다.
 *
 * 출발은 칸 셈(풍선 · 쌓인 획 법칙 · 상자)을 거치지 않은 처음 잉크 뼈대다(규칙 1 — 900의 이상한 틈은 상자 단계가 만들었다).
 * 뼈대 위에서 점을 옮기고(세로 접기 · 자소 안쪽 당김 · 좁힘) 굵기 배율만 정한다. 순수 셈이고 엔진을 부르지 않는다.
 *
 * 숫자는 모두 폰트 여러 집안에서 잰 패턴이다(노토는 여러 굵기라도 한 집안 한 표). 출처는 상수마다 적었다.
 */

/** 꼭짓점 하나(곡선 손잡이 포함, em). */
export interface StackAnchor { x: number; y: number; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } }
export interface StackStroke {
  part: Part
  /** 중심선(em). 곡선은 편 점. 재기에 쓴다. */
  points: { x: number; y: number }[]
  /** 저장된 꼭짓점(em). 점 옮기기를 같이 받아 다시 그리는 데 쓴다. */
  anchors: StackAnchor[]
  closed?: boolean
  /** 출발 두께(em, 중심선 굵힘까지 든 값). */
  thickness: number
}
/** 세로 · 가로 굵기 배율(출발 두께 대비). */
export interface StackThick { v: number; h: number }
export interface StackInput {
  /** 글자(초성 · 중성 · 종성 이름을 읽는다). */
  char: string
  strokes: StackStroke[]
  /** 받침 없는 글자의 잉크 키(em, 같은 글줄의 가운데값). 없으면 이 글자 키 그대로(늘리지도 누르지도 않음). */
  height?: number
  /** 굵기 끝으로 간 정도 0~1(대비 · 안쪽 굵힘 · 좁힘이 이만큼 들어간다). */
  reach: number
  /** 안쪽으로 굵히는 세로 배율(1 = 안 굵힘). 굵기 끝에서 `BLACK_STEM_GAIN`. */
  inward: number
}
export interface StackResult {
  strokes: StackStroke[]
  /** 출발 두께 대비 배율. 글자 하나에 한 값(가로획 · ㅇ 위아래가 같이 — 규칙 10). */
  thick: StackThick
  /** 고른 틈(em) · 가로획 배율 · 막대 수(재기 · 검사용). */
  gap: number
  bars: number
}

/** 고른 틈 ÷ 키 = 0.151 − 0.693 × 기둥 ÷ 키. 폰트 19집안 「를」 쌓인 틈(자소 사이 = ㄹ 속), 상관 −0.97(판 18, 규칙 3). */
export const EVEN_GAP = { base: 0.151, slope: 0.693 } as const
/** ㅇ 속 = 고른 틈 × 1.8(폰트 8벌 「을」 1.6~2.2배, 규칙 8). ㅁ · ㅂ · ㅍ 속 = 고른 틈 × 1(하니무스 "더 좁아져도", 규칙 8). */
export const COUNTER_RATIO = { ring: 1.8, box: 1.0 } as const
/** ㅎ 보 ↔ ㅇ 틈 = 고른 틈 × 0.6(14집안 가운데, 집안 버릇 — 손잡이 후보, 규칙 9). */
export const HIEUT_GAP = 0.6
/** 넘칠 때 양보 순서(규칙 7): 막대 없는 머리(ㅅ) → 가로획 → ㅇ · ㅁ 속 → 모든 틈. 머리는 0.9배, 가로획은 0.75배(막대 5줄 이상) · 0.84배까지.
 * 세로홀자 받침 글자는 키가 넘치면 가로획 0.9배. 모두 몇 값 중 겹침이 가장 높은 값(가설). */
export const YIELD = { head: 0.9, barMany: 0.75, barFew: 0.84, finalBar: 0.9 } as const
/** 대비(규칙 12, 판 22): 굵기 끝에서 세로는 안쪽으로 1.15배, 가로 = 세로 × 0.8. 고딕A1 블랙 · 노토 900 기둥 ÷ 키(0.167 · 0.170) ÷ 우리 0.146, 가로 ÷ 세로 0.8. */
export const BLACK_STEM_GAIN = 1.15
export const BLACK_CONTRAST = 0.8
/** ㅁ · ㅂ · ㅇ(가로홀자 위 첫닿자 · 받침) 폭 0.92배(굵은 고딕 6벌보다 7~10% 넓음, 규칙 11, 판 21). */
export const NARROW_ROUND = 0.92
const BAR_BAND = 0.12, SAME_BAR = 0.02, RING_POINTS = 12
/** 이만큼(기울기 dy/dx) 아래로 누운 토막은 가로 막대로 본다. */
const BAR_SLOPE = 0.25

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'
export function jamoOf(char: string): { cho: string; jung: string; jong: string } | null {
  const s = char.charCodeAt(0) - 0xac00
  if (s < 0 || s > 11171) return null
  return { cho: CHO[Math.floor(s / 588)], jung: JUNG[Math.floor((s % 588) / 28)], jong: JONG[s % 28].trim() }
}
const HORIZONTAL_VOWELS = 'ㅗㅛㅜㅠㅡ'
/** 서로 다른 두 닿자가 나란히 선 겹받침. ㄲ · ㅆ은 막대 높이가 같아 낱받침처럼 둔다. */
const COMPOUND_FINALS = 'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'

type Pt = { x: number; y: number }
type Map2 = (p: Pt) => Pt

function mapStroke(s: StackStroke, f: Map2): StackStroke {
  const one = (a: StackAnchor): StackAnchor => ({ ...f(a), ...(a.handleIn ? { handleIn: f(a.handleIn) } : {}), ...(a.handleOut ? { handleOut: f(a.handleOut) } : {}) })
  return { ...s, points: s.points.map(f), anchors: s.anchors.map(one) }
}

// ── 잉크 재기: 토막마다 사각형(엔진 butt 끝, 꺾인 곳은 반 두께만큼 이어짐). 거북이 그림 셈과 같은 꼴. ──
type Quad = Pt[]
function quadsOf(s: StackStroke, thick: StackThick): Quad[] {
  const pts = s.closed ? [...s.points, s.points[0]] : s.points
  const out: Quad[] = []
  const half = (i: number) => {
    const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.y - p.y), uy = l < 1e-9 ? 0 : (q.y - p.y) / l
    return s.thickness / 2 * (thick.v * uy * uy + thick.h * (1 - uy * uy))
  }
  const last = pts.length - 2
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.y - p.y)
    if (l < 1e-9) continue
    const ux = (q.x - p.x) / l, uy = (q.y - p.y) / l
    const w = half(i)
    // 꺾인 곳은 이웃 토막 반 두께만큼 이어진다(빚기 화면이 토막을 그리는 법과 같게). 열린 끝은 butt.
    const a = i > 0 ? half(i - 1) : s.closed ? half(last) : 0, b = i < last ? half(i + 1) : s.closed ? half(0) : 0
    const x0 = p.x - ux * a, y0 = p.y - uy * a, x1 = q.x + ux * b, y1 = q.y + uy * b, nx = -uy * w, ny = ux * w
    out.push([{ x: x0 + nx, y: y0 + ny }, { x: x1 + nx, y: y1 + ny }, { x: x1 - nx, y: y1 - ny }, { x: x0 - nx, y: y0 - ny }])
  }
  return out
}
function inkBox(strokes: readonly StackStroke[], thick: StackThick) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const s of strokes) for (const q of quadsOf(s, thick)) for (const p of q) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
  return { x0, x1, y0, y1 }
}
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
function separated(a: Quad, b: Quad): boolean {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], nx = -(q.y - p.y), ny = q.x - p.x
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity
    for (const v of a) { const d = v.x * nx + v.y * ny; amin = Math.min(amin, d); amax = Math.max(amax, d) }
    for (const v of b) { const d = v.x * nx + v.y * ny; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d) }
    if (amax < bmin - 1e-12 || bmax < amin - 1e-12) return true
  }
  return false
}
/** 두 자소 묶음 잉크 사이 가장 좁은 흰 틈(em). 붙었으면 −0.01, 한쪽이 없으면 null. */
export function inkGap(strokes: readonly StackStroke[], upper: (part: Part) => boolean, lower: (part: Part) => boolean, thick: StackThick): number | null {
  const A = strokes.filter((s) => upper(s.part)).flatMap((s) => quadsOf(s, thick)), B = strokes.filter((s) => lower(s.part)).flatMap((s) => quadsOf(s, thick))
  if (!A.length || !B.length) return null
  let best = Infinity
  for (const a of A) for (const b of B) {
    if (!separated(a, b)) return -0.01
    for (let i = 0; i < 4; i++) for (const v of b) best = Math.min(best, segDist(v, a[i], a[(i + 1) % 4]))
    for (let i = 0; i < 4; i++) for (const v of a) best = Math.min(best, segDist(v, b[i], b[(i + 1) % 4]))
  }
  return best
}

// ── 쌓인 막대(warp.py `bars` · `gaptype` · `plan`) ──
type Bar = { y: number; i: number; kind: 'ring-top' | 'ring-bot' | 'box-top' | 'box-bot' | 'bar' | 'block-top' | 'block-bot' }
function barsOf(st: readonly StackStroke[], block?: Part): Bar[] {
  const xs = st.flatMap((s) => s.points.map((p) => p.x)), xc = (Math.min(...xs) + Math.max(...xs)) / 2
  const out: Bar[] = []
  st.forEach((s, i) => {
    const P = s.points
    if (s.part === block) return
    if (s.closed) {
      const ys = P.map((p) => p.y), xr = P.map((p) => p.x)
      if (Math.min(...xr) < xc + BAR_BAND && Math.max(...xr) > xc - BAR_BAND) {
        const kind = P.length > RING_POINTS ? 'ring' : 'box'
        out.push({ y: Math.min(...ys), i, kind: `${kind}-top` }, { y: Math.max(...ys), i, kind: `${kind}-bot` })
      }
      return
    }
    // 가로로 누운 토막이 이어진 한 줄을 막대 하나로 본다. 손으로 그은 획은 조금 기울고 굽어 있어 딱 수평인 토막만 보면 막대를 놓친다.
    const flat = (a: Pt, b: Pt) => Math.abs(b.y - a.y) <= BAR_SLOPE * Math.abs(b.x - a.x)
    for (let k = 0; k < P.length - 1;) {
      if (!flat(P[k], P[k + 1])) { k++; continue }
      let end = k + 1
      const dir = Math.sign(P[k + 1].x - P[k].x)
      while (end < P.length - 1 && flat(P[end], P[end + 1]) && Math.sign(P[end + 1].x - P[end].x) === dir) end++
      const run = P.slice(k, end + 1), x0 = Math.min(...run.map((p) => p.x)), x1 = Math.max(...run.map((p) => p.x))
      let len = 0, sum = 0
      for (let j = k; j < end; j++) { const l = Math.hypot(P[j + 1].x - P[j].x, P[j + 1].y - P[j].y); len += l; sum += l * (P[j].y + P[j + 1].y) / 2 }
      if (x1 - x0 > 0.05 && x0 < xc + BAR_BAND && x1 > xc - BAR_BAND) out.push({ y: len > 0 ? sum / len : run[0].y, i, kind: 'bar' })
      k = end
    }
  })
  // 겹받침(ㄺ · ㅀ …)은 두 자소가 나란히 서 막대 높이가 엇갈린다. 한 덩이로 보고 맨 위 · 맨 아래만 잡아 통째로 옮긴다.
  const held = block ? st.map((s, i) => [s, i] as const).filter(([s]) => s.part === block) : []
  if (held.length) {
    const ys = held.flatMap(([s]) => s.points.map((p) => p.y)), top = Math.min(...ys), bot = Math.max(...ys)
    const at = (y: number) => held.find(([s]) => s.points.some((p) => Math.abs(p.y - y) < 1e-9))![1]
    out.push({ y: top, i: at(top), kind: 'block-top' }, { y: bot, i: at(bot), kind: 'block-bot' })
  }
  out.sort((a, b) => a.y - b.y)
  const ded: Bar[] = []
  for (const o of out) { if (ded.length && Math.abs(o.y - ded[ded.length - 1].y) < SAME_BAR) continue; ded.push(o) }
  return ded
}
type GapKind = 'counter' | 'box' | 'inner' | 'hring' | 'between'
function gapKind(a: Bar, b: Bar, st: readonly StackStroke[]): GapKind {
  if (a.kind === 'block-top' && b.kind === 'block-bot') return 'inner'
  if (a.i === b.i && a.kind === 'ring-top') return 'counter'
  if (a.i === b.i && a.kind.endsWith('-top')) return 'box'
  if (a.i === b.i) return 'inner'
  const same = st[a.i].part === st[b.i].part
  if (same && a.kind === 'bar' && b.kind === 'ring-top') return 'hring'
  if (same && a.kind === 'bar' && b.kind === 'bar') return 'box'
  return 'between'
}
/** 세로 접기: 옛 자리 → 새 자리(사이는 곧게, 밖은 끝 차이만큼 옮김). */
function warpY(old: number[], next: number[]): Map2 {
  return (p) => {
    const y = p.y, n = old.length
    if (y <= old[0]) return { x: p.x, y: y + next[0] - old[0] }
    if (y >= old[n - 1]) return { x: p.x, y: y + next[n - 1] - old[n - 1] }
    let k = 0
    while (k < n - 2 && y > old[k + 1]) k++
    const t = old[k + 1] - old[k] < 1e-12 ? 0 : (y - old[k]) / (old[k + 1] - old[k])
    return { x: p.x, y: next[k] + t * (next[k + 1] - next[k]) }
  }
}

/** 가로홀자 글자: 키를 막대 n개 · 고른 틈 n−1개 · 속으로 나눈다(규칙 2~9). 막대가 셋 아래면 손대지 않는다. */
function stackPlan(st0: StackStroke[], G: number, height: number | undefined, block?: Part): { strokes: StackStroke[]; f: number; bars: number } | null {
  const B = barsOf(st0, block)
  if (B.length < 3) return null
  const t = st0[0].thickness, n = B.length, one = { v: 1, h: 1 }
  const kinds = B.slice(1).map((b, i) => gapKind(B[i], b, st0))
  const orig = B.slice(1).map((b, i) => b.y - B[i].y - t)
  const want = orig.map((o, i) => kinds[i] === 'hring' ? G * HIEUT_GAP : kinds[i] === 'box' ? Math.max(o, G * COUNTER_RATIO.box) : Math.max(o, G * (kinds[i] === 'counter' ? COUNTER_RATIO.ring : 1)))
  const ink = inkBox(st0, one), a0 = ink.y0, b0 = ink.y1, cy = (a0 + b0) / 2
  const bh = height ?? b0 - a0
  let above = Math.max(0, B[0].y - t / 2 - a0)
  const below = Math.max(0, b0 - (B[n - 1].y + t / 2))
  const sum = (w: number[]) => w.reduce((s, x) => s + x, 0)
  const total = (f: number) => n * t * f + sum(want)
  const need0 = total(1) + above + below - bh
  const barParts = new Set(B.map((b) => st0[b.i].part))
  const topStroke = st0.reduce((m, s) => Math.min(...s.points.map((p) => p.y)) < Math.min(...m.points.map((p) => p.y)) ? s : m)
  let zo = 1
  if (need0 > 0 && above > 0 && !barParts.has(topStroke.part)) zo = Math.max(YIELD.head, Math.min(1, 1 - need0 / above))
  above *= zo
  const budget = bh - above - below
  const f = Math.max(n >= 5 ? YIELD.barMany : YIELD.barFew, Math.min(1, (budget - sum(want)) / (n * t)))
  if (total(f) > budget) {
    const over = total(f) - budget, soft = kinds.map((k, i) => (k === 'counter' || k === 'box') ? i : -1).filter((i) => i >= 0)
    const room = soft.reduce((s, i) => s + Math.max(0, want[i] - G), 0)
    if (room > 0) { const k = Math.min(1, over / room); for (const i of soft) if (want[i] > G) want[i] -= (want[i] - G) * k }
    if (total(f) > budget) { const s = (budget - n * t * f) / sum(want); for (let i = 0; i < want.length; i++) want[i] *= s }
  }
  const top = cy - (above + total(f) + below) / 2 + above
  const ys: number[] = []
  let y = top + t * f / 2
  for (let i = 0; i < n; i++) { ys.push(y); y += t * f + (i < n - 1 ? want[i] : 0) }
  let old = B.map((b) => b.y), next = ys
  if (zo < 1) { old = [a0, ...old]; next = [ys[0] - (B[0].y - a0) * zo, ...ys] }
  const warp = warpY(old, next)
  return { strokes: st0.map((s) => mapStroke(s, warp)), f, bars: n }
}

/** 세로 · 섞임홀자 받침 글자: 받침을 고른 틈까지 내리고, 키가 넘치면 가로획 0.9배 + 세로로 맞춤(규칙 6). */
function finalPlan(st0: StackStroke[], G: number, height: number | undefined): { strokes: StackStroke[]; f: number } {
  const upper = (p: Part) => p !== 'JO', lower = (p: Part) => p === 'JO'
  let st = st0, f = 1
  const g = inkGap(st, upper, lower, { v: 1, h: 1 })
  if (g !== null && g < G) { const d = G - g + 0.002; st = st.map((s) => s.part === 'JO' ? mapStroke(s, (p) => ({ x: p.x, y: p.y + d })) : s) }
  const ink0 = inkBox(st0, { v: 1, h: 1 }), cy = (ink0.y0 + ink0.y1) / 2
  const bh = height ?? ink0.y1 - ink0.y0
  let ink = inkBox(st, { v: 1, h: f })
  if (ink.y1 - ink.y0 > bh + 1e-4) {
    f = YIELD.finalBar // hcap.py 「키 1.00 가로 0.9」
    ink = inkBox(st, { v: 1, h: f })
    const ys = st.flatMap((s) => s.points.map((p) => p.y)), c0 = Math.min(...ys), c1 = Math.max(...ys)
    const k = c1 - c0 > 1e-6 ? Math.max(0.5, (c1 - c0 - (ink.y1 - ink.y0 - bh)) / (c1 - c0)) : 1
    const fit: Map2 = (p) => ({ x: p.x, y: c0 + (p.y - c0) * k })
    st = st.map((s) => mapStroke(s, fit))
  }
  ink = inkBox(st, { v: 1, h: f })
  const shift = cy - (ink.y0 + ink.y1) / 2
  return { strokes: st.map((s) => mapStroke(s, (p) => ({ x: p.x, y: p.y + shift }))), f }
}

/** 자소마다 세로를 안쪽으로 굵힌다: 바깥 테두리 그대로, 늘어난 반 두께만큼 중심선을 자소 가운데로(t900.py `inward(…, 'x')`). */
function inwardX(st: StackStroke[], gain: number): StackStroke[] {
  if (gain <= 1 + 1e-6) return st
  const out = [...st]
  for (const part of new Set(st.map((s) => s.part))) {
    const idx = st.map((s, i) => s.part === part ? i : -1).filter((i) => i >= 0)
    const xs = idx.flatMap((i) => st[i].points.map((p) => p.x)), x0 = Math.min(...xs), x1 = Math.max(...xs), cx = (x0 + x1) / 2, hw = (x1 - x0) / 2
    const t = st[idx[0]].thickness
    const fx = hw > 1e-3 ? Math.max(0.3, (hw - (t * gain - t) / 2) / hw) : 1
    for (const i of idx) out[i] = mapStroke(st[i], (p) => ({ x: cx + (p.x - cx) * fx, y: p.y }))
  }
  return out
}
/** ㅁ · ㅂ · ㅇ 폭(가로홀자 위 첫닿자 · 받침)을 가운데 두고 좁힌다. */
function narrowRound(st: StackStroke[], jamo: { cho: string; jung: string; jong: string }, f: number): StackStroke[] {
  if (f >= 1 - 1e-6) return st
  const parts = new Set<Part>()
  if ('ㅁㅂㅇ'.includes(jamo.cho) && HORIZONTAL_VOWELS.includes(jamo.jung)) parts.add('CH')
  if (jamo.jong && 'ㅁㅂㅇ'.includes(jamo.jong)) parts.add('JO')
  let out = st
  for (const part of parts) {
    const xs = st.filter((s) => s.part === part).flatMap((s) => s.points.map((p) => p.x))
    if (!xs.length) continue
    const c = (Math.min(...xs) + Math.max(...xs)) / 2
    out = out.map((s) => s.part === part ? mapStroke(s, (p) => ({ x: c + (p.x - c) * f, y: p.y })) : s)
  }
  return out
}
/** ㅃ 두 ㅂ 사이 = 고른 틈. 바깥 끝은 두고 안쪽 끝만 물린다(규칙 13, 판 23 셋째 칸). */
function splitDouble(st: StackStroke[], cho: string, want: number, thick: StackThick): StackStroke[] {
  if (cho !== 'ㅃ') return st
  const ch = st.map((s, i) => s.part === 'CH' ? i : -1).filter((i) => i >= 0)
  const xs = ch.flatMap((i) => st[i].points.map((p) => p.x)), mid = (Math.min(...xs) + Math.max(...xs)) / 2
  const L = ch.filter((i) => st[i].points.reduce((s, p) => s + p.x, 0) / st[i].points.length < mid), R = ch.filter((i) => !L.includes(i))
  if (!L.length || !R.length) return st
  const a = inkBox(L.map((i) => st[i]), thick), b = inkBox(R.map((i) => st[i]), thick), g = b.x0 - a.x1
  if (g >= want) return st
  const d = (want - g) / 2, out = [...st]
  for (const [idx, e0, e1, anchor] of [[L, a.x0, a.x1, a.x0], [R, b.x0, b.x1, b.x1]] as const) {
    const w = e1 - e0, f = w > 1e-6 ? (w - d) / w : 1
    for (const i of idx) out[i] = mapStroke(st[i], (p) => ({ x: anchor + (p.x - anchor) * f, y: p.y }))
  }
  return out
}

/** 고른 틈(em): 키 × (0.151 − 0.693 × 기둥 ÷ 키). */
export const evenGapOf = (height: number, stem: number) => Math.max(0, height * (EVEN_GAP.base - EVEN_GAP.slope * stem / height))

export function solveStack900(input: StackInput): StackResult {
  const jamo = jamoOf(input.char)
  const st0 = input.strokes
  const thickList = st0.map((s) => s.thickness).sort((a, b) => a - b)
  const stem = thickList[Math.floor(thickList.length / 2)] ?? 0.07
  const ink0 = inkBox(st0, { v: 1, h: 1 })
  const height = input.height ?? ink0.y1 - ink0.y0
  const G = evenGapOf(height, stem)
  let st = st0, f = 1, bars = 0
  if (jamo && HORIZONTAL_VOWELS.includes(jamo.jung)) {
    const plan = stackPlan(st0, G, input.height, COMPOUND_FINALS.includes(jamo.jong) ? 'JO' : undefined)
    if (plan) { st = plan.strokes; f = plan.f; bars = plan.bars }
  } else if (jamo && jamo.jong) {
    const plan = finalPlan(st0, G, input.height)
    st = plan.strokes; f = plan.f
  }
  const reach = Math.max(0, Math.min(1, input.reach))
  const V = input.inward
  st = inwardX(st, V)
  // 가로 = min(쌓임이 준 배율, 세로 × 대비). 대비는 굵기 끝으로 갈수록(가설: 굵기에 곧게).
  const contrast = 1 - (1 - BLACK_CONTRAST) * reach
  const thick = { v: V, h: Math.min(f, contrast * V) }
  if (jamo) {
    st = narrowRound(st, jamo, 1 - (1 - NARROW_ROUND) * reach)
    st = splitDouble(st, jamo.cho, G, { v: V, h: thick.h })
  }
  return { strokes: st, thick, gap: G, bars }
}

/** 받침 없는 글자인가(글줄 키 기준을 모을 때). */
export const isOpenSyllable = (char: string) => { const j = jamoOf(char); return !!j && !j.jong }
/** 출발 잉크 키(em). */
export const inkHeightOf = (strokes: readonly StackStroke[], thick: StackThick = { v: 1, h: 1 }) => { const b = inkBox(strokes, thick); return b.y1 - b.y0 }
