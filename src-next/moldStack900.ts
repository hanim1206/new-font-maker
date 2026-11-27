import type { Part } from '../src/types'
import { THIN_FLOOR, WIDEN_MAX } from './moldBudget'

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
  /** 가로 ÷ 세로 [굵기 1 위 첫 걸음, 굵기 끝]. 없으면 [1, `BLACK_CONTRAST`](바탕 대비 위에 곱함). 대비 기본값(폰트 패턴, `contrastPatternOf`)이면 그 식의 두 끝. */
  contrastRange?: readonly [number, number]
  /**
   * 만진 대비가 가로에 곱하는 배율(바탕 대비의 가로 ÷ 세로, 1 = 안 만짐). 돌려주는 `thick.h`에 들어 있다.
   * 1보다 크면(가로 굵게 쪽 대비) 쌓임이 준 배율(`f`)을 넘지 않게 자른다 — 예전엔 쌓임을 다 푼 뒤 밖에서 곱해
   * 굵기 끝 + 대비 0에서 을 · 른 · 숲의 ㄹ · ㅡ가 뭉쳤다(다람쥐 검수 2026-11-27).
   */
  hScale?: number
}
export interface StackResult {
  strokes: StackStroke[]
  /** 출발 두께 대비 배율. 글자 하나에 한 값(가로획 · ㅇ 위아래가 같이 — 규칙 10). */
  thick: StackThick
  /** 고른 틈(em) · 가로획 배율 · 막대 수(재기 · 검사용). */
  gap: number
  bars: number
  /** 속을 지키려 세로를 더 가늘게 한 자소 묶음(초성 · 중성 · 종성)의 배율(`thick` 위에 곱함). 없으면 1. */
  yieldV?: Partial<Record<StackGroup, number>>
  /** 같은 셈을 가로 막대 사이(위아래 속)에 한 것. 키는 안 늘리고 가로만 가늘게. */
  yieldH?: Partial<Record<StackGroup, number>>
  /** 속을 지키려 가로로 넓힌 잉크 폭(em, 양쪽 합). 글자 자리를 이만큼 넓혀야 이웃 글자와 안 닿는다. */
  widenEm?: number
}
export type StackGroup = 'CH' | 'JU' | 'JO'
const groupOf = (part: Part): StackGroup => (part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU')

/** 고른 틈 ÷ 키 = 0.151 − 0.693 × 기둥 ÷ 키. 폰트 19집안 「를」 쌓인 틈(자소 사이 = ㄹ 속), 상관 −0.97(판 18, 규칙 3). */
export const EVEN_GAP = { base: 0.151, slope: 0.693 } as const
/** ㅇ 속 = 고른 틈 × 1.8(폰트 8벌 「을」 1.6~2.2배, 규칙 8). ㅁ · ㅂ · ㅍ 속 = 고른 틈 × 1(하니무스 "더 좁아져도", 규칙 8). */
export const COUNTER_RATIO = { ring: 1.8, box: 1.0 } as const
/** ㅎ 보 ↔ ㅇ 틈 = 고른 틈 × 0.6(14집안 가운데, 집안 버릇 — 손잡이 후보, 규칙 9). */
export const HIEUT_GAP = 0.6
/** 넘칠 때 양보 순서(규칙 7): 막대 없는 머리(ㅅ) → 가로획 → ㅇ · ㅁ 속 → 모든 틈. 머리는 0.9배, 가로획은 0.75배(막대 5줄 이상) · 0.84배까지.
 * 세로홀자 받침 글자는 키가 넘치면 가로획 0.9배. 모두 몇 값 중 겹침이 가장 높은 값(가설). */
export const YIELD = { head: 0.9, barMany: 0.75, barFew: 0.84, finalBar: 0.9 } as const
/**
 * 굵기 끝(900)은 노토 한 집안 숫자가 아니라 900이 있는 고딕 다섯 집안(고딕 A1 · 노토 산스 · 프리텐다드 · SUIT · 원티드 산스, 노토는 한 표)의 패턴으로 정한다
 * (거북이 폰트 156벌 자 `research-hangul-form/mold-fit/heavy/heavy-out.json`, 다람쥐 검수 2026-11-24).
 * - 기둥 ÷ 키: 900 가운데값 0.173(0.167~0.177).
 * - 900 ÷ 700 기둥: 같은 집안 안에서 나눈 비(고딕 A1 1.23 · 노토 1.21 · 프리텐다드 1.21 · SUIT 1.39 · 원티드 1.24)의 가운데 1.23
 *   → 그만큼은 세로만 안쪽으로 굵힌다(규칙 12). 집안을 섞어 900 가운데값 ÷ 700 가운데값(15집안)으로 나누면 1.26이 나오지만, 굵어지는 버릇은 집안 안에서 잰다.
 * - 가로 ÷ 세로(900): 0.80~0.85, 가운데 0.81 → 0.8.
 */
export const BLACK_FAMILY = { stemToHeight: 0.173, growth: 1.23, contrast: 0.81 } as const
/** 엔진 처음 굵기(400)의 「이」 기둥 ÷ 키(0.07 ÷ 0.9033, `heavy-engine.json` 「처음」). */
export const ENGINE_STEM_TO_HEIGHT = 0.07 / 0.9033
/** 굵기 끝 두께 배율 = 다섯 집안 900 기둥 ÷ 키를 엔진 처음 기둥 ÷ 키로 나눈 것(≈ 2.23). */
export const BLACK_TOTAL = BLACK_FAMILY.stemToHeight / ENGINE_STEM_TO_HEIGHT
export const BLACK_STEM_GAIN = BLACK_FAMILY.growth
export const BLACK_CONTRAST = 0.8
/** ㅁ · ㅂ · ㅇ(가로홀자 위 첫닿자 · 받침) 폭 0.92배(굵은 고딕 6벌보다 7~10% 넓음, 규칙 11, 판 21). */
export const NARROW_ROUND = 0.92
const BAR_BAND = 0.12, SAME_BAR = 0.02, RING_POINTS = 12
/** 이만큼(기울기 dy/dx) 아래로 누운 토막은 가로 막대로 본다. */
const BAR_SLOPE = 0.25
/** 이만큼(em) 넘게 곧게 선 토막 줄을 기둥으로 본다. */
const STEM_MIN = 0.2

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
function barsOf(st: readonly StackStroke[], block?: Part, skip?: Part): Bar[] {
  const xs = st.flatMap((s) => s.points.map((p) => p.x)), xc = (Math.min(...xs) + Math.max(...xs)) / 2
  const out: Bar[] = []
  st.forEach((s, i) => {
    const P = s.points
    if (s.part === block || s.part === skip) return
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
function stackPlan(st0: StackStroke[], G: number, height: number | undefined, block?: Part, skip?: Part): { strokes: StackStroke[]; f: number; bars: number } | null {
  const B = barsOf(st0, block, skip)
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
/** 홀자 안 기둥 사이(ㅐ · ㅔ · ㅒ · ㅖ의 두 기둥)도 고른 틈을 지킨다. 안쪽으로 굵히면 두 기둥이 서로 다가가 틈이 실처럼 된다(다람쥐 검수 2026-11-24).
 * 모자라면 왼 기둥(첫닿자 쪽)은 두고 홀자를 오른쪽으로 넓힌다(세로획 많은 글자는 굵기 끝에서 넓혀도 됨, 하니무스 2026-11-21). */
function spreadStems(st: StackStroke[], G: number, V: number): StackStroke[] {
  let out = st
  for (const part of ['JU', 'JU_V'] as const) {
    const idx = st.map((s, i) => s.part === part ? i : -1).filter((i) => i >= 0)
    const stems: { x: number; t: number }[] = []
    for (const i of idx) {
      const P = st[i].points
      for (let k = 0; k < P.length - 1;) {
        const up = (a: Pt, b: Pt) => Math.abs(b.x - a.x) <= BAR_SLOPE * Math.abs(b.y - a.y)
        if (!up(P[k], P[k + 1])) { k++; continue }
        let end = k + 1
        while (end < P.length - 1 && up(P[end], P[end + 1])) end++
        const run = P.slice(k, end + 1), ys = run.map((p) => p.y)
        if (Math.max(...ys) - Math.min(...ys) > STEM_MIN) stems.push({ x: run.reduce((a, p) => a + p.x, 0) / run.length, t: st[i].thickness * V })
        k = end
      }
    }
    if (stems.length < 2) continue
    stems.sort((a, b) => a.x - b.x)
    let need = 1
    for (let k = 0; k < stems.length - 1; k++) {
      const dx = stems[k + 1].x - stems[k].x, gap = dx - (stems[k].t + stems[k + 1].t) / 2
      if (dx > 1e-6 && gap < G) need = Math.max(need, (dx + G - gap) / dx)
    }
    if (need <= 1 + 1e-6) continue
    const x0 = stems[0].x
    out = out.map((s) => s.part === part ? mapStroke(s, (p) => ({ x: x0 + (p.x - x0) * need, y: p.y })) : s)
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
  // ㅝ · ㅞ도 위아래로 쌓인 글자다(ㅇ · ㅜ 보 · 받침). 오른쪽 ㅓ · ㅔ(`JU_V`)는 막대로 안 센다 — 곁줄기는 보 옆에 선다(`cutBarBeforeSide`).
  const stacked = jamo && (HORIZONTAL_VOWELS.includes(jamo.jung) || 'ㅝㅞ'.includes(jamo.jung))
  if (jamo && stacked) {
    const plan = stackPlan(st0, G, input.height, COMPOUND_FINALS.includes(jamo.jong) ? 'JO' : undefined, 'ㅝㅞ'.includes(jamo.jung) ? 'JU_V' : undefined)
    if (plan) { st = plan.strokes; f = plan.f; bars = plan.bars }
  } else if (jamo && jamo.jong) {
    const plan = finalPlan(st0, G, input.height)
    st = plan.strokes; f = plan.f
  }
  const reach = Math.max(0, Math.min(1, input.reach))
  const V = input.inward
  st = inwardX(st, V)
  st = spreadStems(st, G, V)
  // 가로 = min(쌓임이 준 배율, 세로 × 대비). 대비는 굵기 끝으로 갈수록(가설: 굵기에 곧게).
  const [c0, c1] = input.contrastRange ?? [1, BLACK_CONTRAST]
  const contrast = c0 + (c1 - c0) * reach
  const hs = input.hScale ?? 1
  const thick = { v: V, h: hs > 1 ? Math.min(f, contrast * V * hs) : Math.min(f, contrast * V) * hs }
  if (jamo) st = narrowRound(st, jamo, 1 - (1 - NARROW_ROUND) * reach)
  if (jamo && 'ㅝㅞ'.includes(jamo.jung)) st = cutBarBeforeSide(st, thick, G)
  // 마지막에 속(마주 선 세로 줄기 사이 흰 틈)을 고른 틈까지 지킨다. 지키는 순서 틈 → 굵기 → 칸(하니무스 2026-11-22):
  // 칸(글자 폭)이 먼저 `WIDEN_MAX`까지 넓어지고, 그래도 모자라면 그 자소 세로만 `THIN_FLOOR`까지 가늘어지고, 그래도 모자라면 칸을 더 넓힌다.
  // 예전에는 ㅃ만 두 ㅂ 사이를 벌리려고 ㅂ 폭을 줄여(`splitDouble`) 굵기 끝에서 ㅂ 속이 막혔다(다람쥐 극단 검수 2026-11-27).
  // 가로로 마주 선 막대(ㄹ · ㅂ 속)는 키가 정해져 있어 칸을 못 넓힌다 — 그 자소 가로만 가늘게 한다(축을 바꿔 같은 셈).
  const apart = new Set<Part>(jamo && CLUSTER_FINALS.includes(jamo.jong) ? ['JO'] : [])
  const kept = keepCounters(st, st0, G, thick, true, INNER_COUNTER, apart)
  const swap = (s: StackStroke) => mapStroke(s, (p) => ({ x: p.y, y: p.x }))
  const keptH = keepCounters(kept.strokes.map(swap), st0.map(swap), G, { v: thick.h, h: thick.v }, false, INNER_COUNTER_H, apart)
  return { strokes: kept.strokes, thick, gap: G, bars, ...(Object.keys(kept.yieldV).length ? { yieldV: kept.yieldV } : {}), ...(Object.keys(keptH.yieldV).length ? { yieldH: keptH.yieldV } : {}), ...(kept.widen > 1e-6 ? { widenEm: kept.widen } : {}) }
}

/**
 * ㅝ · ㅞ: ㅜ 보 오른쪽이 ㅓ 곁줄기 위에 겹쳐 서면 굵을 때 둘 사이 위아래 틈이 모자라, 틈을 지키려 가로획을 바닥까지 깎았다
 * (하니무스 2026-11-27 원 · 웠 · 훨, 고른 안 「ㅜ 보 오른쪽 끊기」). 위아래 틈이 고른 틈보다 모자라면 보 오른끝을 곁줄기 왼끝에서
 * 고른 틈만큼 앞에서 끊는다. ㅜ 기둥 오른쪽 바깥선을 넘어서까지는 안 끊는다. 위아래 틈이 넉넉하면(얇을 때) 그대로.
 */
function cutBarBeforeSide(st: StackStroke[], thick: StackThick, G: number): StackStroke[] {
  const flat = (s: StackStroke) => s.points.length === 2 && Math.abs(s.points[1].y - s.points[0].y) < 1e-6 && Math.abs(s.points[1].x - s.points[0].x) > 1e-6
  const bars = st.map((s, i) => ({ s, i })).filter(({ s }) => s.part === 'JU_H' && flat(s))
  if (!bars.length) return st
  const bar = bars.reduce((m, b) => (Math.abs(b.s.points[1].x - b.s.points[0].x) > Math.abs(m.s.points[1].x - m.s.points[0].x) ? b : m))
  const by = bar.s.points[0].y, bRight = Math.max(bar.s.points[0].x, bar.s.points[1].x)
  const stems = st.filter((s) => s.part === 'JU_H' && !flat(s) && s.points.length === 2 && Math.abs(s.points[1].x - s.points[0].x) < 1e-6)
  const floor = stems.length ? Math.max(...stems.map((s) => s.points[0].x + s.thickness * thick.v / 2)) + G : -Infinity
  let cut = bRight
  for (const s of st) {
    if (s.part !== 'JU_V' || !flat(s)) continue
    const left = Math.min(s.points[0].x, s.points[1].x), dy = Math.abs(s.points[0].y - by)
    if (left >= bRight) continue
    if (dy - (bar.s.thickness + s.thickness) * thick.h / 2 >= G - 1e-9) continue
    // 그릴 때 가로획 열린 끝은 세로 · 가로 굵기 차만큼 늘어난다(`endReachOf`) — 보 · 곁줄기 두 끝 몫을 미리 뺀다.
    const reach = (t: number) => t / 2 * Math.max(0, thick.v - thick.h)
    cut = Math.min(cut, Math.max(floor, left - G - reach(bar.s.thickness) - reach(s.thickness)))
  }
  if (cut >= bRight - 1e-9) return st
  const out = [...st]
  out[bar.i] = { ...bar.s, points: bar.s.points.map((p) => (p.x === bRight ? { ...p, x: cut } : p)), anchors: bar.s.anchors.map((p) => (Math.abs(p.x - bRight) < 1e-9 ? { ...p, x: cut } : p)) }
  return out
}

// ── 속 지키기: 마주 선 세로 줄기 사이 흰 틈 ──
/** 겹받침: 받침 안 다른 획은 다른 자소(ㄹ · ㅂ)다. */
const CLUSTER_FINALS = 'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'
/** 이만큼(dx/dy) 안쪽으로 선 토막을 세로 줄기로 본다(ㅅ · ㅈ 다리처럼 기운 것까지). */
const UPRIGHT = 0.6
/** 마주 보는 세로 겹침이 이만큼(em) 아래면 마주 선 것으로 안 본다. */
const FACE_MIN = 0.04
type Run = { s: number; pts: Pt[]; y0: number; y1: number; group: StackGroup }
function runsOf(st: readonly StackStroke[]): Run[] {
  const out: Run[] = []
  st.forEach((s, si) => {
    const P = s.closed ? [...s.points, s.points[0]] : s.points
    const up = (a: Pt, b: Pt) => Math.abs(b.x - a.x) <= UPRIGHT * Math.abs(b.y - a.y) && Math.abs(b.y - a.y) > 1e-9
    for (let k = 0; k < P.length - 1;) {
      if (!up(P[k], P[k + 1])) { k++; continue }
      let end = k + 1
      const dir = Math.sign(P[k + 1].y - P[k].y)
      while (end < P.length - 1 && up(P[end], P[end + 1]) && Math.sign(P[end + 1].y - P[end].y) === dir) end++
      const pts = P.slice(k, end + 1).slice().sort((a, b) => a.y - b.y)
      if (pts[pts.length - 1].y - pts[0].y > FACE_MIN) out.push({ s: si, pts, y0: pts[0].y, y1: pts[pts.length - 1].y, group: groupOf(s.part) })
      k = end
    }
  })
  return out
}
/** 줄 위 y에서의 중심선 x와 그 자리 기울기(가로로 잰 반 두께에 쓴다). */
function runAt(r: Run, y: number): { x: number; slope: number } {
  const P = r.pts
  let k = 0
  while (k < P.length - 2 && y > P[k + 1].y) k++
  const a = P[k], b = P[k + 1], dy = b.y - a.y, t = dy < 1e-12 ? 0 : Math.max(0, Math.min(1, (y - a.y) / dy))
  return { x: a.x + t * (b.x - a.x), slope: dy < 1e-12 ? 0 : (b.x - a.x) / dy }
}
/** 두 중심선 토막 묶음 사이 가장 가까운 거리. */
function runDist(a: Run, b: Run): number {
  let best = Infinity
  for (let i = 0; i < a.pts.length - 1; i++) for (let j = 0; j < b.pts.length - 1; j++) {
    const p = a.pts[i], q = a.pts[i + 1], u = b.pts[j], v = b.pts[j + 1]
    best = Math.min(best, segDist(p, u, v), segDist(q, u, v), segDist(u, p, q), segDist(v, p, q))
    // 엇갈림(가로지름)
    const d1 = (q.x - p.x) * (u.y - p.y) - (q.y - p.y) * (u.x - p.x), d2 = (q.x - p.x) * (v.y - p.y) - (q.y - p.y) * (v.x - p.x)
    const d3 = (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x), d4 = (v.x - u.x) * (q.y - u.y) - (v.y - u.y) * (q.x - u.x)
    if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  }
  return best
}
type Face = { a: number; b: number; white: number; cut: number; half: number; want: number; inner: boolean }
/**
 * 한 닿자 안의 속(ㅂ · ㅁ · ㄹ처럼 같은 획의 두 줄기 사이, ㅃ · ㅆ처럼 같은 닿자 두 획 사이)은 고른 틈의 이만큼까지 좁아져도 된다
 * (하니무스 2026-11-27 「뻐에서 ㅃ 속공간 더 작게 해도 될 듯」, 「ㅂ랑 ㅂ 사이 너무 두꺼워. 그것도 최소값대로」). 다른 자소 사이 · 홀자 안(ㅐ)은 고른 틈 그대로. 0.7은 눈으로 고른 값(가설, 하니무스 「속공간 조오오금만 늘면?」으로 0.6에서) — 재서 정한 것 아님.
 */
export const INNER_COUNTER = 0.7
/** 가로로 쌓인 속(ㄹ · ㅌ · ㅌ 가로획 사이)의 최소값. 글자 키를 못 늘리니(쌓인 글자 키 = 받침 없는 글자 키) 세로 속보다 더 좁아져도 된다(가설 — 하니무스 「절의 받침 ㄹ은 왤케 가로획 얇지」). */
export const INNER_COUNTER_H = 0.5
/** 마주 선 줄기 쌍마다 가장 좁은 가로 흰 틈. `joined`(처음 그림에서 이어진 쌍 — ㅅ 꼭짓점 · ㅂ 모서리)은 뺀다. */
function facesOf(st: readonly StackStroke[], runs: Run[], thick: StackThick, yieldV: Partial<Record<StackGroup, number>>, joined: Set<string>, G: number, inner0: number, apart: ReadonlySet<Part>): Face[] {
  const out: Face[] = []
  const halfOf = (r: Run, slope: number) => {
    const t = st[r.s].thickness * (yieldV[r.group] ?? 1), uy2 = 1 / (1 + slope * slope)
    return t / 2 * (thick.v * uy2 + thick.h * (1 - uy2)) / Math.sqrt(uy2)
  }
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    if (joined.has(`${i}|${j}`)) continue
    const A = runs[i], B = runs[j], lo = Math.max(A.y0, B.y0), hi = Math.min(A.y1, B.y1)
    if (hi - lo < FACE_MIN) continue
    let white = Infinity, cut = 0, half = 0, left = -1, crossed = false
    for (let k = 0; k <= 8; k++) {
      const y = lo + (hi - lo) * k / 8, a = runAt(A, y), b = runAt(B, y)
      const [l, r, li] = a.x <= b.x ? [a, b, i] : [b, a, j]
      if (left >= 0 && li !== left) { crossed = true; break } // 서로 가로지름 — 이어진 쌍으로 본다
      left = li
      const ha = halfOf(li === i ? A : B, l.slope), hb = halfOf(li === i ? B : A, r.slope), w = r.x - l.x - ha - hb
      if (w < white) { white = w; cut = (l.x + ha + r.x - hb) / 2; half = (ha + hb) / 2 }
    }
    if (crossed) continue
    // 한 닿자 안 속: 같은 획이거나, 같은 부위의 다른 획(ㅃ 두 ㅂ 사이). 겹받침(`apart`)은 다른 획이 다른 자소다 — 「짧」 ㄹ 아래 열린 속과
    // ㅂ 사이를 한 자소 속으로 보고 0.7배까지 좁혀 ㄹ이 찌그러졌다(하니무스 2026-11-27).
    const pa = st[A.s].part, inner = A.s === B.s || (pa === st[B.s].part && (pa === 'CH' || pa === 'JO') && !apart.has(pa))
    out.push({ a: left === i ? i : j, b: left === i ? j : i, white, cut, half, want: inner ? G * inner0 : G, inner })
  }
  return out
}
/** x를 자르는 자리마다 오른쪽을 민다. */
const widenAt = (cuts: { x: number; d: number }[]): Map2 => (p) => ({ x: p.x + cuts.reduce((s, c) => s + (p.x > c.x ? c.d : 0), 0), y: p.y })
type Yield = Partial<Record<StackGroup, number>>
function keepCounters(st: StackStroke[], st0: readonly StackStroke[], G: number, thick: StackThick, widen: boolean, inner0: number, apart: ReadonlySet<Part> = new Set()): { strokes: StackStroke[]; yieldV: Yield; widen: number } {
  const runs0 = runsOf(st0)
  // 처음(점 옮기기 전) 그림에서 줄기 반 두께 안으로 붙어 있던 쌍은 원래 이어진 것(ㅅ 꼭짓점, ㅆ 안 다리)이다.
  if (runs0.length !== runsOf(st).length) return { strokes: st, yieldV: {}, widen: 0 }
  const joined = new Set<string>()
  for (let i = 0; i < runs0.length; i++) for (let j = i + 1; j < runs0.length; j++) {
    if (runDist(runs0[i], runs0[j]) < 0.5 * Math.min(st0[runs0[i].s].thickness, st0[runs0[j].s].thickness)) joined.add(`${i}|${j}`)
  }
  const box0 = inkBox(st, thick), width0 = box0.x1 - box0.x0, cx = (box0.x0 + box0.x1) / 2
  const shortOf = (s: StackStroke[], y: Yield) => facesOf(s, runsOf(s), thick, y, joined, G, inner0, apart).filter((f) => f.white < f.want - 1e-6)
  const center = (s: StackStroke[]) => { const b = inkBox(s, thick), d = cx - (b.x0 + b.x1) / 2; return s.map((x) => mapStroke(x, (p) => ({ x: p.x + d, y: p.y }))) }
  const straight = (r: Run) => r.pts.every((p, k) => k === 0 || Math.abs(p.x - r.pts[k - 1].x) <= 0.02 * Math.abs(p.y - r.pts[k - 1].y))
  /**
   * 0) 모자란 틈이 있으면 먼저 그 자소 안 속을 최소값(`INNER_COUNTER`)까지 좁힌다(칸 · 굵기보다 먼저).
   *    곧은 세로 줄기끼리, 바로 옆 쌍만(ㅂ · ㅁ · ㄹ 속, ㅃ 두 ㅂ 사이). 그 자소 획만 옮겨 다른 자소(쌈의 ㅆ)는 안 밀린다.
   */
  const reclaim = (s: StackStroke[], y: Yield): StackStroke[] => {
    const runs = runsOf(s), faces = facesOf(s, runs, thick, y, joined, G, inner0, apart)
    const groups = new Set(faces.filter((f) => f.white < f.want - 1e-6).flatMap((f) => [runs[f.a].group, runs[f.b].group]))
    const next = (f: Face) => {
      const A = runs[f.a], B = runs[f.b], m = (Math.max(A.y0, B.y0) + Math.min(A.y1, B.y1)) / 2, xa = runAt(A, m).x, xb = runAt(B, m).x
      return !runs.some((r, k) => k !== f.a && k !== f.b && r.y0 <= m && r.y1 >= m && runAt(r, m).x > xa + 1e-9 && runAt(r, m).x < xb - 1e-9)
    }
    let out = s
    for (const g of groups) {
      // 겹받침은 한 자소 속(ㅂ)을 좁혀 옆 자소(ㄹ) 자리를 내지 않는다 — ㅂ만 홀쭉해졌다(「짧」). 칸 · 굵기로 받는다.
      const spare = faces.filter((f) => f.inner && !apart.has(st[runs[f.a].s].part) && runs[f.a].group === g && f.white > f.want + 1e-6 && straight(runs[f.a]) && straight(runs[f.b]) && next(f))
      if (!spare.length) continue
      const warp = widenAt(spare.map((f) => ({ x: f.cut, d: f.want - f.white })))
      out = out.map((x) => (groupOf(x.part) === g ? mapStroke(x, warp) : x))
    }
    return out
  }
  /** 1) 칸을 넓힌다(모자란 쌍 사이를 자른 자리에서 오른쪽을 민다). 처음 폭의 `WIDEN_MAX`배까지(`limit` false면 끝없이 — 틈은 양보하지 않는다). */
  const widenTo = (s: StackStroke[], y: Yield, limit: boolean): StackStroke[] => {
    let out = s
    for (let pass = 0; pass < 4; pass++) {
      const b = inkBox(out, thick), room = limit ? WIDEN_MAX * width0 - (b.x1 - b.x0) : Infinity
      if (room <= 1e-6) break
      const short = shortOf(out, y)
      if (!short.length) break
      const cuts: { x: number; d: number }[] = []
      for (const f of short.sort((p, q) => p.cut - q.cut)) {
        const d = f.want - f.white, near = cuts.find((c) => Math.abs(c.x - f.cut) < 0.01)
        if (near) near.d = Math.max(near.d, d); else cuts.push({ x: f.cut, d })
      }
      const total = cuts.reduce((t, c) => t + c.d, 0), k = Math.min(1, room / total)
      out = out.map((x) => mapStroke(x, widenAt(cuts.map((c) => ({ x: c.x, d: c.d * k })))))
    }
    return center(out)
  }
  const fit = (y: Yield) => widenTo(reclaim(st, y), y, true)
  let yieldV: Yield = {}
  let out = widen ? fit(yieldV) : reclaim(st, yieldV)
  // 2) 그래도 모자라면 모자란 쌍의 자소 세로를 가늘게(바닥 `THIN_FLOOR`). 가늘어진 만큼 속은 다시 최소값까지 좁혀 다시 잰다 —
  //    그래서 세로는 꼭 필요한 만큼만 가늘어진다(ㅃ 속이 커지지 않는다).
  for (let pass = 0; pass < 4; pass++) {
    const short = shortOf(out, yieldV)
    if (!short.length) break
    const runs = runsOf(out), groups = new Set(short.flatMap((f) => [runs[f.a].group, runs[f.b].group]))
    for (const g of groups) {
      const ok = (q: number) => { const y = { ...yieldV, [g]: q }; return !shortOf(widen ? fit(y) : reclaim(st, y), y).length }
      let lo = THIN_FLOOR, hi = yieldV[g] ?? 1
      if (ok(hi)) continue
      if (!ok(lo)) { yieldV = { ...yieldV, [g]: lo }; continue }
      for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m }
      yieldV = { ...yieldV, [g]: lo }
    }
    out = widen ? fit(yieldV) : reclaim(st, yieldV)
  }
  // 3) 굵기도 바닥이면 틈이 이긴다: 칸을 `WIDEN_MAX` 너머로 더 넓힌다.
  if (widen) out = widenTo(out, yieldV, false)
  for (const g of Object.keys(yieldV) as StackGroup[]) if ((yieldV[g] ?? 1) >= 1 - 1e-9) delete yieldV[g]
  const box3 = inkBox(out, thick)
  return { strokes: out, yieldV, widen: (box3.x1 - box3.x0) - width0 }
}

/** 받침 없는 글자인가(글줄 키 기준을 모을 때). */
export const isOpenSyllable = (char: string) => { const j = jamoOf(char); return !!j && !j.jong }
/** 출발 잉크 키(em). */
export const inkHeightOf = (strokes: readonly StackStroke[], thick: StackThick = { v: 1, h: 1 }) => { const b = inkBox(strokes, thick); return b.y1 - b.y0 }
