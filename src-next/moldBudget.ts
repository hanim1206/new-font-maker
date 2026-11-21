import type { DecomposedSyllable, JamoData, Part, StrokeDataV2 } from '../src/types'
import { balloonGroupOf } from './moldBalloon'

/**
 * 좁은 칸 굵기 예산(거북이 2026-11-22 줄 끝 균형 규칙 ①, 하니무스 승인 "1 다음 3까지 한 번에").
 * 자소 칸이 작아지면(닿자 0 · 받침 자리 100 · 대비 100) 한 자소 안 나란한 획 사이 흰 틈이 먼저 사라져 덩어리가 됐다.
 * 그래서 틈이 바닥 아래로 내려가는 쌍은 획이 먼저 가늘어진다: 획 굵기 t ≤ (W − (n − 1) g) / n, g = max(0.025em, 0.2 × 세로줄기).
 * - 바닥 g: 풍선 굵기의 열린 틈 바닥과 같은 식(거북이 넓어짐 공식 2절, `STEM_GAP`).
 * - 처음(엔진 칸, 대비 0)부터 g보다 좁던 쌍은 그 처음 틈까지만 지킨다 — 처음 모습은 안 바꾼다.
 * - 실험실 근거: 겹기둥 홀자(ㅐ · ㅔ · ㅒ) 기둥은 0.083 → 0.079로 가늘다. 굵기 실험실 S7(ㅃ · ㅉ)은 900에서 가로가 1.10배만 굵어진다. 좁으면 획이 양보한다.
 * 획마다 두께 배율(`strokeKey` 열쇠)을 돌려준다. 1이면 안 넣는다.
 */
export interface BudgetStroke { part: Part; id: string; points: { x: number; y: number }[]; closed: boolean; /** em */ thickness: number }
/** 열린 틈 바닥(em): max(least, ratio × 세로줄기). `moldBalloon` STEM_GAP과 같은 값. */
const GAP = { least: 0.025, ratio: 0.2 } as const
/** 획이 이보다 가늘어지지는 않는다(처음 굵기 대비). 닿자 작은 폰트 굵기 0.87배 · 가로 0.7배(거북이 규칙 ②)보다 넉넉히. */
export const THIN_FLOOR = 0.5
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

/**
 * `now`: 지금 칸에 놓인 획(em). `ref`: 같은 획을 엔진 처음 칸에 놓은 것(같은 순서). `contrast`: 대비 값(−0.38 ~ 0.97).
 */
export function thinBudget(now: readonly BudgetStroke[], ref: readonly BudgetStroke[] | null, contrast: number): Record<string, number> {
  const cv = contrast >= 0 ? 1 + 0.8 * contrast : 1 + 0.5 * contrast, ch = contrast >= 0 ? 1 - 0.45 * contrast : 1 - 0.5 * contrast
  const segs = segsOf(now), refSegs = ref && ref.length === now.length ? segsOf(ref) : null
  const sameShape = !!refSegs && refSegs.length === segs.length
  const stems = segs.filter((s) => upright(s) > 0.5).map((s) => s.t * cv).sort((a, b) => a - b)
  const stem = stems[Math.floor(stems.length / 2)] ?? (segs[0]?.t ?? 0.07)
  const floor = Math.max(GAP.least, GAP.ratio * stem)
  const factor = new Map<number, number>()
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]
    if (p.group !== q.group) continue
    // 같은 획의 이웃 토막(ㄹ 꺾임)은 틈이 아니다.
    if (p.stroke === q.stroke && (Math.abs(p.at - q.at) < 2 || (p.at === 0 && q.at === q.last) || (q.at === 0 && p.at === p.last))) continue
    const face = facingOf(p, q)
    if (!face) continue
    const hp = halfOf(p, cv, ch), hq = halfOf(q, cv, ch)
    // 처음 틈: 엔진 칸 · 대비 0.
    let start = Infinity
    if (sameShape) {
      const rp = refSegs![i], rq = refSegs![j], rf = facingOf(rp, rq)
      if (rf) start = rf.d - rp.t / 2 - rq.t / 2
    }
    if (start <= JOINED * Math.min(p.t, q.t)) continue
    const target = Math.min(floor, start)
    if (face.d - hp - hq >= target - 1e-5) continue
    const f = Math.max(THIN_FLOOR, (face.d - target) / Math.max(hp + hq, 1e-6))
    for (const s of [p.stroke, q.stroke]) factor.set(s, Math.min(factor.get(s) ?? 1, f))
  }
  const out: Record<string, number> = {}
  for (const [index, f] of factor) if (f < 1 - 1e-4) out[`${now[index].part}:${now[index].id}`] = f
  return out
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
