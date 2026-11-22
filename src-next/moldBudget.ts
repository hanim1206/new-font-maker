import type { DecomposedSyllable, JamoData, Part, StrokeDataV2 } from '../src/types'
import { balloonGroupOf, THIN_FLOOR } from './moldBalloon'
export { THIN_FLOOR }

/**
 * 좁은 칸 굵기 예산(거북이 2026-11-22 줄 끝 균형 규칙 ①, 하니무스 승인 "1 다음 3까지 한 번에").
 * 자소 칸이 작아지면(닿자 0 · 받침 자리 100 · 대비 100) 한 자소 안 나란한 획 사이 흰 틈이 먼저 사라져 덩어리가 됐다.
 * 그래서 틈이 바닥 아래로 내려가는 쌍은 획이 먼저 가늘어진다: 획 굵기 t ≤ (W − (n − 1) g) / n, g = max(0.025em, 0.2 × 세로줄기).
 * - 바닥 g: 풍선 굵기의 열린 틈 바닥과 같은 식(거북이 넓어짐 공식 2절, `STEM_GAP`).
 * - 처음(엔진 칸, 대비 0)부터 g보다 좁던 쌍은 그 처음 틈까지만 지킨다 — 처음 모습은 안 바꾼다.
 * - 실험실 근거: 겹기둥 홀자(ㅐ · ㅔ · ㅒ) 기둥은 0.083 → 0.079로 가늘다. 굵기 실험실 S7(ㅃ · ㅉ)은 900에서 가로가 1.10배만 굵어진다. 좁으면 획이 양보한다.
 * 하니무스 2026-11-22 "획을 줄이기 전에 먼저 옆으로 늘리는 걸 시도해 보고" · "노토 산스 블랙의 굵은 선 ↔ 가는 선 대비를 기준으로":
 * - 먼저 자소 칸을 넓힌다(위아래로 쌓인 쌍은 높인다). 넓힘 끝 `WIDEN_MAX` 1.10 = 굵기 실험실 ㄱ ㅁ ㅂ ㅇ 900 폭 1.10배 · 노토 900 첫닿자 칸 1.08~1.11배(거북이 넓어짐 공식).
 *   칸이 넓어질 빈 자리(`room`)는 부르는 쪽이 준다.
 * - 그래도 모자라면 가늘게. 바닥 `THIN_FLOOR` 0.69 = 노토 산스 KR 900에서 글자 안 가장 가는 세로 · 가로줄기 ÷ 「이」 기둥 · 「으」 보(600자, p5 세로 0.69 · 가로 0.68).
 * - 같은 결(세로끼리 · 가로끼리) 획은 한 글자 안에서 가장 가는 것의 `EVEN`(0.78)배 넘게 굵지 않다 = 노토 900 글자 안 가장 가는 ÷ 가장 굵은 같은 결 줄기(p5 세로 0.78 · 가로 0.80). 「빼」 ㅃ 0.113 · ㅐ 0.140 → 0.81.
 * - 처음 칸에서 마주 보지 않던 쌍(「숲」 ㅅ 두 삐침이 닿자 100에서 나란해짐)은 틈이 아니다.
 * 획마다 두께 배율(`strokeKey` 열쇠)과 자소 칸 넓힘 배율을 돌려준다. 1이면 안 넣는다.
 */
export interface BudgetStroke { part: Part; id: string; points: { x: number; y: number }[]; closed: boolean; /** em */ thickness: number }
/** 열린 틈 바닥(em): max(least, ratio × 세로줄기). `moldBalloon` STEM_GAP과 같은 값. */
const GAP = { least: 0.025, ratio: 0.2 } as const
/** 획이 이보다 가늘어지지는 않는다(처음 굵기 대비). */
/** 같은 결 획 굵기 고르기(노토 900 p5). */
export const EVEN = 0.78
/** 자소 칸 넓힘 끝(배). */
export const WIDEN_MAX = 1.1
/** 처음부터 이보다 가까운 쌍(두께 대비)은 붙여 그린 것(`moldBalloon` JOINED_RATIO). */
const JOINED = 0.25
const PARALLEL_COS = Math.cos(20 / 180 * Math.PI)

interface Seg { stroke: number; at: number; last: number; group: string; ax: number; ay: number; bx: number; by: number; len: number; t: number }
function segsOf(strokes: readonly BudgetStroke[]): Seg[] {
  const out: Seg[] = []
  strokes.forEach((stroke, index) => {
    const ps = stroke.points, count = stroke.closed ? ps.length : ps.length - 1
    for (let at = 0; at < count; at++) {
      const a = ps[at], b = ps[(at + 1) % ps.length], len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > 1e-4) out.push({ stroke: index, at, last: count - 1, group: balloonGroupOf(stroke.part), ax: a.x, ay: a.y, bx: b.x, by: b.y, len, t: stroke.thickness })
    }
  })
  return out
}
/** 세로 정도(가로 0 · 세로 1). */
const upright = (s: Seg) => ((s.by - s.ay) / s.len) ** 2
/** 반 두께(em). 대비는 세로 · 가로 배율(풍선 굵기 base와 같은 식). */
const halfOf = (s: Seg, cv: number, ch: number) => { const u = upright(s); return s.t / 2 * (u * cv + (1 - u) * ch) }
/** 나란한 두 토막이 서로 마주 보는 길이와 중심선 거리. 안 마주 보면 null. */
function facingOf(p: Seg, q: Seg): { d: number } | null {
  const ux = (p.bx - p.ax) / p.len, uy = (p.by - p.ay) / p.len
  const vx = (q.bx - q.ax) / q.len, vy = (q.by - q.ay) / q.len
  if (Math.abs(ux * vx + uy * vy) < PARALLEL_COS) return null
  const t0 = (q.ax - p.ax) * ux + (q.ay - p.ay) * uy, t1 = (q.bx - p.ax) * ux + (q.by - p.ay) * uy
  const overlap = Math.min(p.len, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1))
  if (overlap < 0.3 * Math.min(p.len, q.len)) return null
  const mx = (q.ax + q.bx) / 2 - p.ax, my = (q.ay + q.by) / 2 - p.ay
  return { d: Math.abs(mx * uy - my * ux) }
}

/** 자소마다 칸을 넓힐 수 있는 끝(배): x 옆으로 · y 위아래로. 없으면 1. */
export type BudgetRoom = Partial<Record<Part, { x: number; y: number }>>
export interface BudgetResult { factors: Record<string, number>; widen: Partial<Record<Part, { x: number; y: number }>> }

/**
 * `now`: 지금 칸에 놓인 획(em). `ref`: 같은 획을 엔진 처음 칸에 놓은 것(같은 순서). `contrast`: 대비 값(−0.38 ~ 0.97).
 * `room`: 자소 칸을 넓힐 수 있는 끝(배, `WIDEN_MAX` 안쪽으로 부르는 쪽이 자른다).
 */
export function thinBudget(now: readonly BudgetStroke[], ref: readonly BudgetStroke[] | null, contrast: number, room: BudgetRoom = {}): BudgetResult {
  const cv = contrast >= 0 ? 1 + 0.8 * contrast : 1 + 0.5 * contrast, ch = contrast >= 0 ? 1 - 0.45 * contrast : 1 - 0.5 * contrast
  const segs = segsOf(now), refSegs = ref && ref.length === now.length ? segsOf(ref) : null
  const sameShape = !!refSegs && refSegs.length === segs.length
  const stems = segs.filter((s) => upright(s) > 0.5).map((s) => s.t * cv).sort((a, b) => a - b)
  const stem = stems[Math.floor(stems.length / 2)] ?? (segs[0]?.t ?? 0.07)
  const floor = Math.max(GAP.least, GAP.ratio * stem)
  // 1) 좁아진 쌍을 모은다.
  interface Tight { p: Seg; q: Seg; d: number; h: number; target: number; axis: 'x' | 'y' }
  const tight: Tight[] = []
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]
    if (p.group !== q.group) continue
    // 같은 획의 이웃 토막(ㄹ 꺾임)은 틈이 아니다.
    if (p.stroke === q.stroke && (Math.abs(p.at - q.at) < 2 || (p.at === 0 && q.at === q.last) || (q.at === 0 && p.at === p.last))) continue
    const face = facingOf(p, q)
    if (!face) continue
    // 처음 틈: 엔진 칸 · 대비 0. 처음 칸에서 마주 보지 않던 쌍은 틈이 아니다.
    let start = Infinity
    if (sameShape) {
      const rp = refSegs![i], rq = refSegs![j], rf = facingOf(rp, rq)
      if (!rf) continue
      start = rf.d - rp.t / 2 - rq.t / 2
    }
    if (start <= JOINED * Math.min(p.t, q.t)) continue
    const h = halfOf(p, cv, ch) + halfOf(q, cv, ch), target = Math.min(floor, start)
    if (face.d - h >= target - 1e-5) continue
    tight.push({ p, q, d: face.d, h, target, axis: upright(p) > 0.5 ? 'x' : 'y' })
  }
  // 2) 먼저 칸을 넓힌다: 쌍마다 모자란 만큼(중심선 거리는 칸 배율만큼 는다), 빈 자리 · `WIDEN_MAX` 안에서.
  const widen: BudgetResult['widen'] = {}
  const partOf = (s: Seg) => now[s.stroke].part
  for (const t of tight) {
    const part = partOf(t.p), limit = Math.min(WIDEN_MAX, room[part]?.[t.axis] ?? 1)
    if (limit <= 1 + 1e-6) continue
    const need = Math.min(limit, (t.target + t.h) / Math.max(t.d, 1e-6))
    const was = widen[part] ?? { x: 1, y: 1 }
    widen[part] = { ...was, [t.axis]: Math.max(was[t.axis], need) }
  }
  // 3) 그래도 모자라면 가늘게.
  const factor = new Map<number, number>()
  for (const t of tight) {
    const d = t.d * (widen[partOf(t.p)]?.[t.axis] ?? 1)
    if (d - t.h >= t.target - 1e-5) continue
    const f = Math.max(THIN_FLOOR, (d - t.target) / Math.max(t.h, 1e-6))
    for (const s of [t.p.stroke, t.q.stroke]) factor.set(s, Math.min(factor.get(s) ?? 1, f))
  }
  // 4) 같은 결 고르기: 한 글자 안 같은 결 획은 가장 가는 것의 1/EVEN배까지만. 닫힌 획(ㅇ)은 결이 없어 뺀다.
  if (factor.size) {
    const kind = now.map((stroke, index) => { if (stroke.closed) return 'o'; let v = 0, all = 0; for (const s of segs) if (s.stroke === index) { v += upright(s) * s.len; all += s.len } return all > 0 && v / all > 0.5 ? 'v' : 'h' })
    for (const k of ['v', 'h'] as const) {
      let least = 1
      for (const [index, f] of factor) if (kind[index] === k) least = Math.min(least, f)
      if (least >= 1) continue
      now.forEach((_, index) => { if (kind[index] === k) factor.set(index, Math.min(factor.get(index) ?? 1, least / EVEN)) })
    }
  }
  const factors: Record<string, number> = {}
  for (const [index, f] of factor) if (f < 1 - 1e-4) factors[`${now[index].part}:${now[index].id}`] = f
  for (const part of Object.keys(widen) as Part[]) { const w = widen[part]!; if (w.x <= 1 + 1e-4 && w.y <= 1 + 1e-4) delete widen[part] }
  return { factors, widen }
}

/** 획마다 두께 배율을 입힌다. 홀자는 `JU` · `JU_H` · `JU_V` 어느 열쇠든 그 획 id로. */
export function thinSyllable(syllable: DecomposedSyllable, factors: Readonly<Record<string, number>>): DecomposedSyllable {
  if (!Object.keys(factors).length) return syllable
  const apply = (jamo: JamoData | null, parts: readonly Part[]): JamoData | null => {
    if (!jamo) return jamo
    const of = (id: string) => { for (const part of parts) { const f = factors[`${part}:${id}`]; if (f !== undefined) return f } return 1 }
    const thin = (strokes?: StrokeDataV2[]) => strokes?.map((stroke) => { const f = of(stroke.id); return f === 1 ? stroke : { ...stroke, thickness: stroke.thickness * f } })
    return {
      ...jamo, strokes: thin(jamo.strokes), horizontalStrokes: thin(jamo.horizontalStrokes), verticalStrokes: thin(jamo.verticalStrokes),
      contextStrokes: jamo.contextStrokes && Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, strokes]) => [family, thin(strokes)])),
    }
  }
  return { ...syllable, choseong: apply(syllable.choseong, ['CH']), jungseong: apply(syllable.jungseong, ['JU', 'JU_H', 'JU_V']), jongseong: apply(syllable.jongseong, ['JO']) }
}
