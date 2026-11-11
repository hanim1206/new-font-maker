// 자와 펜 — 가족 캔버스에서 원 자 · 직선 자를 놓고, 그 위에 선을 긋는다.
// 좌표는 캔버스 한 변을 100으로 본 값(S). 5가 캔버스 한 칸이다.
// 놓인 자 위에서 시작한 선은 그 자를 벗어나지 않는다. 자 밖에서 시작하면 자 가까이 지날 때 자석처럼 붙고,
// 자 없는 곳은 칸에 맞는 직선 · 원 자를 새로 만들어 그 위에 놓는다.
import type { AnchorPoint, StrokeDataV2 } from '../types'

export type V = [number, number]
export interface RulerCircle { id: number; x: number; y: number; r: number }
export interface RulerLine { id: number; a: V; b: V }
/** 자 위의 한 마디. 원이면 a · b가 각도(그은 방향 그대로), 직선이면 a에서 b로 가는 비율. */
export interface PathSeg { g: { type: 'c' | 'l'; id: number }; a: number; b: number }
export interface DrawnPath { id: number; segs: PathSeg[] }
export interface DrawnJamo { circles: RulerCircle[]; lines: RulerLine[]; paths: DrawnPath[]; nid: number }

export const emptyDrawn = (): DrawnJamo => ({ circles: [], lines: [], paths: [], nid: 1 })
export const cloneDrawn = (d: DrawnJamo): DrawnJamo => JSON.parse(JSON.stringify(d)) as DrawnJamo

/** 캔버스 칸 하나(S). */
export const CELL = 5
const MAGNET = 2.2
const TAU = Math.PI * 2
const STEP_ANGLE = Math.PI / 12
const snap5 = (v: number) => Math.round(v / CELL) * CELL
const wrap = (d: number) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d }
const norm = (x: number) => { while (x < 0) x += TAU; while (x >= TAU) x -= TAU; return x }
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1])

type Ruler = { type: 'c'; c: RulerCircle; k: string } | { type: 'l'; l: { a: V; b: V; id?: number }; k: string }
const rulerOfCircle = (c: RulerCircle): Ruler => ({ type: 'c', c, k: 'c' + c.id })
const rulerOfLine = (l: RulerLine): Ruler => ({ type: 'l', l, k: 'l' + l.id })

export function rDist(r: Ruler, u: V): number {
  if (r.type === 'c') return Math.abs(Math.hypot(u[0] - r.c.x, u[1] - r.c.y) - r.c.r)
  const { a, b } = r.l, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
  return Math.abs((u[0] - a[0]) * dy - (u[1] - a[1]) * dx) / L
}
export function projOn(r: Ruler, u: V): V {
  if (r.type === 'c') { const c = r.c, d = Math.hypot(u[0] - c.x, u[1] - c.y) || 1e-6; return [c.x + (u[0] - c.x) * c.r / d, c.y + (u[1] - c.y) * c.r / d] }
  const { a, b } = r.l, dx = b[0] - a[0], dy = b[1] - a[1], t = ((u[0] - a[0]) * dx + (u[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)
  return [a[0] + dx * t, a[1] + dy * t]
}
const lineT = (l: { a: V; b: V }, q: V) => { const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1]; return ((q[0] - l.a[0]) * dx + (q[1] - l.a[1]) * dy) / (dx * dx + dy * dy || 1) }
const linePt = (l: { a: V; b: V }, t: number): V => [l.a[0] + (l.b[0] - l.a[0]) * t, l.a[1] + (l.b[1] - l.a[1]) * t]
/** 직선 위 비율을 칸 단위 자리에 붙인다. */
const snapLineT = (l: { a: V; b: V }, t: number) => { const n = Math.max(1, Math.round(dist(l.a, l.b) / CELL)); return Math.round(t * n) / n }

interface Magnet { e: number; r: Ruler; proj: V }
/** 가장 가까운 자(관용 tol). prefer는 지금 붙어 있는 자 — 조금 더 멀어져야 떨어진다. */
export function magnetOf(d: DrawnJamo, u: V, tol = MAGNET, prefer: string | null = null): Magnet | null {
  let best: Magnet | null = null
  const score = (m: Magnet) => m.e - (m.r.k === prefer ? 1 : 0)
  const consider = (m: Magnet) => { if (m.e < tol * (prefer && m.r.k === prefer ? 1.6 : 1) && (!best || score(m) < score(best))) best = m }
  for (const c of d.circles) { const r = rulerOfCircle(c); consider({ e: rDist(r, u), r, proj: projOn(r, u) }) }
  for (const l of d.lines) {
    const L = dist(l.a, l.b); if (L < 0.5) continue
    const t = lineT(l, u); if (t < -2 / L || t > 1 + 2 / L) continue
    const r = rulerOfLine(l); consider({ e: rDist(r, u), r, proj: linePt(l, t) })
  }
  return best
}

/** 두 자가 만나는 점 중 q에 가장 가까운 것(maxd 안쪽). 거의 닿는 접점도 만난다고 본다. */
export function rulerInter(A: Ruler, B: Ruler, q: V, maxd = 5): V | null {
  const cand: V[] = []
  const CL = (c: RulerCircle, l: { a: V; b: V }) => {
    const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], fx = l.a[0] - c.x, fy = l.a[1] - c.y
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), cc = fx * fx + fy * fy - c.r * c.r, D = b * b - 4 * a * cc
    if (a < 1e-9) return
    if (D < 0) { const t = -b / (2 * a), p = linePt(l, t); if (Math.abs(Math.hypot(p[0] - c.x, p[1] - c.y) - c.r) < 0.6) cand.push(p); return }
    for (const t of [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)]) cand.push(linePt(l, t))
  }
  if (A.type === 'c' && B.type === 'c') {
    const c1 = A.c, c2 = B.c, dx = c2.x - c1.x, dy = c2.y - c1.y, d = Math.hypot(dx, dy)
    if (d > 1e-6 && d <= c1.r + c2.r + 0.3 && d >= Math.abs(c1.r - c2.r) - 0.3) {
      const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a)), mx = c1.x + dx * a / d, my = c1.y + dy * a / d
      cand.push([mx + h * dy / d, my - h * dx / d], [mx - h * dy / d, my + h * dx / d])
    }
  } else if (A.type === 'c' && B.type === 'l') CL(A.c, B.l)
  else if (A.type === 'l' && B.type === 'c') CL(B.c, A.l)
  else if (A.type === 'l' && B.type === 'l') {
    const p = A.l.a, r = [A.l.b[0] - p[0], A.l.b[1] - p[1]], q2 = B.l.a, s2 = [B.l.b[0] - q2[0], B.l.b[1] - q2[1]], den = r[0] * s2[1] - r[1] * s2[0]
    if (Math.abs(den) > 1e-6) { const t = ((q2[0] - p[0]) * s2[1] - (q2[1] - p[1]) * s2[0]) / den; cand.push([p[0] + r[0] * t, p[1] + r[1] * t]) }
  }
  let best: { p: V; d: number } | null = null
  for (const c of cand) { const dd = dist(c, q); if (dd < maxd && (!best || dd < best.d)) best = { p: c, d: dd } }
  return best ? best.p : null
}

/** 이 점이 올라앉은 자들. */
export function onRulers(d: DrawnJamo, q: V): Ruler[] {
  const out: Ruler[] = []
  for (const c of d.circles) { const r = rulerOfCircle(c); if (rDist(r, q) < 0.08) out.push(r) }
  for (const l of d.lines) { if (dist(l.a, l.b) < 0.5) continue; const r = rulerOfLine(l); if (rDist(r, q) < 0.08) out.push(r) }
  return out
}

/** 점 자리: 자끼리 만나는 점 > 직선 자 끝 > 자 위(원 15° · 직선 칸) > 칸 자리. */
export function snapPoint(d: DrawnJamo, u: V): V {
  const near: Ruler[] = []
  for (const c of d.circles) { const r = rulerOfCircle(c); if (rDist(r, u) < 3) near.push(r) }
  for (const l of d.lines) { if (dist(l.a, l.b) < 0.5) continue; const r = rulerOfLine(l); if (rDist(r, u) < 3) near.push(r) }
  let bi: { X: V; d: number } | null = null
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const X = rulerInter(near[i], near[j], u); if (X) { const dd = dist(X, u); if (dd < 2.5 && (!bi || dd < bi.d)) bi = { X, d: dd } }
  }
  if (bi) return bi.X
  for (const l of d.lines) for (const q of [l.a, l.b]) if (dist(q, u) < 2.5) return [q[0], q[1]]
  const m = magnetOf(d, u)
  if (m) return snapAlong(m.r, u)
  return [snap5(u[0]), snap5(u[1])]
}
const snapAlong = (r: Ruler, u: V): V => {
  if (r.type === 'c') { const c = r.c, t = Math.round(Math.atan2(u[1] - c.y, u[0] - c.x) / STEP_ANGLE) * STEP_ANGLE; return [c.x + c.r * Math.cos(t), c.y + c.r * Math.sin(t)] }
  return linePt(r.l, snapLineT(r.l, lineT(r.l, u)))
}
/** 자 위 점 q를 그 자 위 자리(만나는 점 · 15° · 칸)에 붙인다. */
export function snapOn(d: DrawnJamo, r: Ruler, q: V): V {
  const sn = snapPoint(d, q)
  if (dist(sn, q) < 3 && rDist(r, sn) < 0.08) return sn
  return snapAlong(r, q)
}
export function lockOf(d: DrawnJamo, A: V, u: V): Ruler | null {
  const ra = onRulers(d, A)
  if (!ra.length) return null
  let best = ra[0], bd = Infinity
  for (const r of ra) { const dd = rDist(r, u); if (dd < bd) { bd = dd; best = r } }
  return best
}
const angleOn = (c: RulerCircle, q: V) => Math.atan2(q[1] - c.y, q[0] - c.x)

/** 자 r 위에서 A부터 B까지의 마디. 원이면 tot(마우스가 실제로 돈 각)에 가장 가까운 쪽으로 돈다. */
export function segOnRuler(r: Ruler, A: V, B: V, tot?: number): PathSeg | null {
  if (r.type === 'c') {
    const c = r.c, a0 = angleOn(c, A)
    let d = wrap(angleOn(c, B) - a0)
    if (tot !== undefined) { while (d - tot > Math.PI) d -= TAU; while (tot - d > Math.PI) d += TAU; if (Math.abs(d) > TAU - 1e-3) d = Math.sign(d) * TAU }
    if (Math.abs(d) < 1e-3) return null
    return { g: { type: 'c', id: c.id }, a: a0, b: a0 + d }
  }
  const t0 = lineT(r.l, A), t1 = lineT(r.l, B)
  if (Math.abs(t1 - t0) * dist(r.l.a, r.l.b) < 0.5) return null
  return { g: { type: 'l', id: r.l.id! }, a: t0, b: t1 }
}

export function segEnd(d: DrawnJamo, s: PathSeg, which: 'a' | 'b'): V | null {
  const t = s[which]
  if (s.g.type === 'c') { const c = d.circles.find((x) => x.id === s.g.id); return c ? [c.x + c.r * Math.cos(t), c.y + c.r * Math.sin(t)] : null }
  const l = d.lines.find((x) => x.id === s.g.id); return l ? linePt(l, t) : null
}
const rulerOfSeg = (d: DrawnJamo, s: PathSeg): Ruler | null => {
  if (s.g.type === 'c') { const c = d.circles.find((x) => x.id === s.g.id); return c ? rulerOfCircle(c) : null }
  const l = d.lines.find((x) => x.id === s.g.id); return l ? rulerOfLine(l) : null
}

// ---- 손 긋기 ----
function resample(pts: V[], step: number): V[] {
  const out: V[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    let a = out[out.length - 1]; const b = pts[i]; let dd = dist(a, b)
    while (dd >= step) { const t = step / dd; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(a); dd = dist(a, b) }
  }
  const L = pts[pts.length - 1]
  if (dist(L, out[out.length - 1]) > step * 0.3) out.push(L)
  return out
}
const smooth = (p: V[]): V[] => p.map((q, i) => { if (i === 0 || i === p.length - 1) return q; const a = p[i - 1], c = p[i + 1]; return [(a[0] + 2 * q[0] + c[0]) / 4, (a[1] + 2 * q[1] + c[1]) / 4] as V })
interface Fit { cx: number; cy: number; r: number; err: number }
function fitCircle(p: V[]): Fit | null {
  let sx = 0, sy = 0
  for (const q of p) { sx += q[0]; sy += q[1] }
  const mx = sx / p.length, my = sy / p.length
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (const q of p) { const u = q[0] - mx, v = q[1] - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-9) return null
  const b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2, uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det
  const cx = uc + mx, cy = vc + my, r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / p.length)
  let err = 0
  for (const q of p) err = Math.max(err, Math.abs(Math.hypot(q[0] - cx, q[1] - cy) - r))
  return { cx, cy, r, err }
}
const turn = (a: V, b: V, c: V) => { const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1])) || 1)))) }
function splitCorners(p: V[]): V[][] {
  const k = 3, cuts = [0]
  for (let i = k; i < p.length - k; i++) {
    const ang = turn(p[i - k], p[i], p[i + k])
    if (ang > 0.7 && i - cuts[cuts.length - 1] >= 3) {
      let best = i, bv = ang
      for (let j = i; j < Math.min(p.length - k, i + k); j++) { const g = turn(p[j - k], p[j], p[j + k]); if (g > bv) { bv = g; best = j } }
      cuts.push(best); i = best + k
    }
  }
  cuts.push(p.length - 1)
  const out: V[][] = []
  for (let i = 0; i < cuts.length - 1; i++) out.push(p.slice(cuts[i], cuts[i + 1] + 1))
  return out.filter((q) => q.length >= 2)
}
const plen = (pp: V[]) => { let L = 0; for (let i = 1; i < pp.length; i++) L += dist(pp[i], pp[i - 1]); return L }

interface FitSeg {
  type: 'line' | 'arc'; p: V[]; c?: Fit; gi: number
  ax?: 'h' | 'v' | null; A0?: V; B0?: V; Bo?: V; A?: V; B?: V
  arc?: { cx: number; cy: number; r: number; t0: number; t1: number }
}
interface FitOpt { A?: V; T?: V; B?: V }

/** 자 없는 곳에 그은 길을 곧은 마디 · 둥근 마디로 끊어 칸에 맞춘다(아직 자를 만들지 않는다). */
function fitFree(raw: V[], opt: FitOpt = {}): FitSeg[] {
  const p = smooth(smooth(resample(raw, 1)))
  if (p.length < 3) return []
  let segs: FitSeg[] = []
  splitCorners(p).forEach((q, gi) => {
    const k = 5
    const lab: (number | null)[] = q.map((_, i) => {
      if (i < k || i >= q.length - k) return null
      const a = q[i - k], b = q[i], c = q[i + k]
      const d = wrap(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]))
      return Math.abs(d) < 0.13 ? 0 : (d > 0 ? 1 : -1)
    })
    for (let i = 0; i < lab.length; i++) if (lab[i] === null) {
      let j = i; while (j < lab.length && lab[j] === null) j++
      const v = j < lab.length ? lab[j] : (i > 0 ? lab[i - 1] : 0)
      for (let m = i; m < j; m++) lab[m] = i > 0 && lab[i - 1] !== null && j >= lab.length ? lab[i - 1] : v
      i = j
    }
    const runs: { a: number; b: number; v: number | null }[] = []
    let s0 = 0
    for (let i = 1; i <= lab.length; i++) if (i === lab.length || lab[i] !== lab[s0]) { runs.push({ a: s0, b: i - 1, v: lab[s0] }); s0 = i }
    let changed = true
    while (changed && runs.length > 1) {
      changed = false
      for (let i = 0; i < runs.length; i++) { const r = runs[i]; if (r.b - r.a < 4) { if (i > 0) runs[i - 1].b = r.b; else runs[i + 1].a = r.a; runs.splice(i, 1); changed = true; break } }
      for (let i = 1; i < runs.length; i++) if (runs[i].v === runs[i - 1].v) { runs[i - 1].b = runs[i].b; runs.splice(i, 1); changed = true; break }
    }
    for (const r of runs) {
      const pp = q.slice(r.a, Math.min(q.length, r.b + 2))
      if (pp.length < 2) continue
      if (r.v === 0 || pp.length < 4) segs.push({ type: 'line', p: pp, gi })
      else { const c = fitCircle(pp); segs.push(c && c.r < 80 ? { type: 'arc', p: pp, c, gi } : { type: 'line', p: pp, gi }) }
    }
  })
  const dirOf = (sg: FitSeg) => {
    const c = sg.c!, ang = (q: V) => Math.atan2(q[1] - c.cy, q[0] - c.cx)
    const a0 = ang(sg.p[0]), am = ang(sg.p[Math.floor(sg.p.length / 2)]), a1 = ang(sg.p[sg.p.length - 1])
    const ccw = norm(am - a0) < norm(a1 - a0)
    return { ccw, sweep: ccw ? norm(a1 - a0) : norm(a0 - a1), a0, a1 }
  }
  // 같은 쪽으로 굽은 이웃 둥근 마디는 한 원에 잘 맞으면 하나로
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < segs.length - 1 && !merged; i++) {
      const A = segs[i]; if (A.type !== 'arc') continue
      let j = i + 1, mid: V[] = []
      if (segs[j].type === 'line' && plen(segs[j].p) < 9 && segs[j + 1] && segs[j + 1].type === 'arc') { mid = segs[j].p.slice(1); j++ }
      const B = segs[j]
      if (!B || B.type !== 'arc' || B.gi !== A.gi || dirOf(A).ccw !== dirOf(B).ccw) continue
      const pp = A.p.concat(mid, B.p.slice(1)), c = fitCircle(pp)
      if (c && c.err < 2.2) { segs.splice(i, j - i + 1, { type: 'arc', p: pp, c, gi: A.gi }); merged = true }
    }
  }
  // 덜 굽은 둥근 마디는 곧게, 이웃한 곧은 마디는 하나로
  for (const sg of segs) if (sg.type === 'arc' && (dirOf(sg).sweep < 0.45 || plen(sg.p) < 8)) sg.type = 'line'
  for (let i = 1; i < segs.length; i++) if (segs[i].type === 'line' && segs[i - 1].type === 'line' && segs[i].gi === segs[i - 1].gi) { segs[i - 1].p = segs[i - 1].p.concat(segs[i].p.slice(1)); segs.splice(i, 1); i-- }
  segs = segs.filter((s) => s.p.length >= 2)
  // 곧은 마디: 끝점을 칸에, 가로 · 세로에 가까우면 반듯하게
  for (const sg of segs) {
    if (sg.type !== 'line') continue
    const q0 = sg.p[0], q1 = sg.p[sg.p.length - 1]
    const A: V = [snap5(q0[0]), snap5(q0[1])], B: V = [snap5(q1[0]), snap5(q1[1])]
    sg.ax = null
    const an = Math.abs(Math.atan2(q1[1] - q0[1], q1[0] - q0[0]))
    if (an < 0.15 || an > Math.PI - 0.15) { const y = snap5((q0[1] + q1[1]) / 2); A[1] = B[1] = y; sg.ax = 'h' }
    else if (Math.abs(an - Math.PI / 2) < 0.15) { const x = snap5((q0[0] + q1[0]) / 2); A[0] = B[0] = x; sg.ax = 'v' }
    sg.A0 = A; sg.B0 = B
  }
  // 앞에서부터 잇는다. 꺾이지 않은 이음매는 앞 마디 진행 방향에 접하게 굽힌다
  let Pc: V | null = opt.A ?? null, T: V | null = opt.T ?? null
  if (opt.B && segs.length && segs[segs.length - 1].type === 'line') segs[segs.length - 1].Bo = opt.B
  const tanAt = (t: number, ccw: boolean): V => ccw ? [-Math.sin(t), Math.cos(t)] : [Math.sin(t), -Math.cos(t)]
  segs.forEach((sg, i) => {
    const pv = segs[i - 1], same = (pv && pv.gi === sg.gi) || (i === 0 && !!opt.T), nx = segs[i + 1], nxSame = !!nx && nx.gi === sg.gi
    if (sg.type === 'line') {
      const A = Pc ?? sg.A0!, B = sg.Bo ?? sg.B0!
      sg.A = A; sg.B = B; Pc = B
      const L = dist(A, B) || 1; T = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]; return
    }
    const d = dirOf(sg), ccw = d.ccw, rf = Math.max(CELL, snap5(sg.c!.r)), qe = sg.p[sg.p.length - 1]
    let cx: number, cy: number, r: number, t0: number, t1: number | null = null
    if (Pc && T && same) {
      const n: V = ccw ? [-T[1], T[0]] : [T[1], -T[0]]
      r = rf
      if (nx && nx.type === 'line' && nxSame && nx.ax) {
        const k = nx.ax === 'h' ? 1 : 0, lv = nx.B0![k]
        let best: { rr: number; tt: number } | null = null
        for (const sgn of [1, -1]) {
          const den = n[k] + sgn; if (Math.abs(den) < 1e-6) continue
          const rr = (lv - Pc[k]) / den; if (rr < 3) continue
          const c: V = [Pc[0] + n[0] * rr, Pc[1] + n[1] * rr], tp: V = k === 1 ? [c[0], lv] : [lv, c[1]]
          const tt = Math.atan2(tp[1] - c[1], tp[0] - c[0]), td = tanAt(tt, ccw)
          if (td[0] * (nx.B0![0] - tp[0]) + td[1] * (nx.B0![1] - tp[1]) <= 0) continue
          if (!best || Math.abs(rr - rf) < Math.abs(best.rr - rf)) best = { rr, tt }
        }
        if (best && best.rr < rf * 3 + 10) { r = best.rr; t1 = best.tt; nx.Bo = k === 1 ? [nx.B0![0], lv] : [lv, nx.B0![1]] }
      }
      cx = Pc[0] + n[0] * r; cy = Pc[1] + n[1] * r; t0 = Math.atan2(Pc[1] - cy, Pc[0] - cx)
    } else if (Pc) {
      cx = snap5(sg.c!.cx); cy = snap5(sg.c!.cy); r = Math.max(3, Math.hypot(Pc[0] - cx, Pc[1] - cy)); t0 = Math.atan2(Pc[1] - cy, Pc[0] - cx)
    } else {
      cx = snap5(sg.c!.cx); cy = snap5(sg.c!.cy); r = rf; t0 = Math.round(d.a0 / STEP_ANGLE) * STEP_ANGLE
    }
    if (t1 === null) {
      if (nx && nxSame && nx.type === 'line') {
        const B = nx.B0!, dx = B[0] - cx, dy = B[1] - cy, dd = Math.hypot(dx, dy)
        if (dd > r + 0.5) {
          const be = Math.atan2(dy, dx), al = Math.acos(r / dd)
          for (const tt of [be + al, be - al]) { const tp: V = [cx + r * Math.cos(tt), cy + r * Math.sin(tt)], td = tanAt(tt, ccw); if (td[0] * (B[0] - tp[0]) + td[1] * (B[1] - tp[1]) > 0) { t1 = tt; break } }
        }
        if (t1 === null) t1 = Math.atan2(qe[1] - cy, qe[0] - cx)
      } else if (nx && nxSame) t1 = Math.atan2(qe[1] - cy, qe[0] - cx)
      else t1 = Math.round(Math.atan2(qe[1] - cy, qe[0] - cx) / STEP_ANGLE) * STEP_ANGLE
    }
    let sw = ccw ? norm(t1 - t0) : -norm(t0 - t1)
    if (Math.abs(sw) < 1e-3) sw = ccw ? TAU : -TAU
    sg.arc = { cx, cy, r, t0, t1: t0 + sw }
    sg.A = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)]; sg.B = [cx + r * Math.cos(t0 + sw), cy + r * Math.sin(t0 + sw)]
    Pc = sg.B; T = tanAt(t0 + sw, ccw)
  })
  return segs
}

/** 맞춘 마디로 자를 만들고, 그 위 마디를 돌려준다. */
function commitFree(d: DrawnJamo, segs: FitSeg[]): PathSeg[] {
  const out: PathSeg[] = []
  for (const sg of segs) {
    if (sg.type === 'arc' && sg.arc) {
      const c: RulerCircle = { id: d.nid++, x: sg.arc.cx, y: sg.arc.cy, r: sg.arc.r }
      d.circles.push(c); out.push({ g: { type: 'c', id: c.id }, a: sg.arc.t0, b: sg.arc.t1 })
    } else if (sg.A && sg.B && dist(sg.A, sg.B) >= 1) {
      const l: RulerLine = { id: d.nid++, a: [...sg.A] as V, b: [...sg.B] as V }
      d.lines.push(l); out.push({ g: { type: 'l', id: l.id }, a: 0, b: 1 })
    }
  }
  return out
}

/** 손으로 그은 길 하나를 선 하나로. 자 위에서 시작했으면 그 자에 묶고, 아니면 자석 + 새 자. */
export function drawFreehand(d0: DrawnJamo, raw: V[]): DrawnJamo {
  if (raw.length < 2) return d0
  const d = cloneDrawn(d0)
  let segs: PathSeg[] = []
  const lock = magnetOf(d, raw[0])
  if (lock) {
    const r = lock.r
    let tot = 0
    if (r.type === 'c') for (let i = 1; i < raw.length; i++) tot += wrap(angleOn(r.c, raw[i]) - angleOn(r.c, raw[i - 1]))
    const A = snapOn(d, r, projOn(r, raw[0])), B = snapOn(d, r, projOn(r, raw[raw.length - 1]))
    const s = segOnRuler(r, A, B, r.type === 'c' ? tot : undefined)
    if (s) segs = [s]
  } else segs = magnetSegs(d, raw)
  if (!segs.length) return d0
  d.paths.push({ id: d.nid++, segs })
  return d
}

function magnetSegs(d: DrawnJamo, raw: V[]): PathSeg[] {
  const pts = resample(raw, 1)
  if (pts.length < 2) return []
  let cur: string | null = null
  const lab = pts.map((u) => { const m = magnetOf(d, u, MAGNET, cur); cur = m ? m.r.k : null; return m })
  type Run = { k: string | null; a: number; b: number; m: Magnet | null }
  let runs: Run[] = []
  lab.forEach((m, i) => { const k = m ? m.r.k : null, L = runs[runs.length - 1]; if (L && L.k === k) L.b = i; else runs.push({ k, a: i, b: i, m }) })
  for (const r of runs) if (r.k && r.b - r.a < 4) r.k = null
  const rr: Run[] = []
  for (const r of runs) { const L = rr[rr.length - 1]; if (L && L.k === r.k) L.b = r.b; else rr.push({ ...r }) }
  runs = rr
  if (!runs.some((r) => r.k)) return commitFree(d, fitFree(raw))

  const subOf = (i: number) => {
    const r = runs[i], pv = runs[i - 1], nx = runs[i + 1]
    let a = r.a, b = r.b
    if (pv?.k && pv.m) while (a < b - 3 && rDist(pv.m.r, pts[a]) < 5) a++
    if (nx?.k && nx.m) while (b > a + 3 && rDist(nx.m.r, pts[b]) < 5) b--
    const q = pts.slice(a, b + 1)
    if (!pv?.k && r.a > 0) q.unshift(pts[r.a - 1])
    if (!nx?.k && r.b < pts.length - 1) q.push(pts[r.b + 1])
    return q
  }
  const dry = runs.map((r, i) => { if (r.k) return null; const sub = subOf(i); if (plen(sub) < 3) return null; const sg = fitFree(sub); return sg.length ? sg : null })
  const jx: (V | null)[] = [], smoothJ: boolean[] = []
  for (let i = 0; i < runs.length - 1; i++) {
    const r = runs[i], o = runs[i + 1], q = pts[r.b]
    if (r.k && o.k) { jx[i] = rulerInter(r.m!.r, o.m!.r, q, 15); continue }
    const R = r.k ? r : o, F = r.k ? dry[i + 1] : dry[i]
    if (!F) { jx[i] = null; continue }
    const sg = r.k ? F[0] : F[F.length - 1]
    if (sg.type === 'line' && sg.A && sg.B && dist(sg.A, sg.B) > 1) {
      let X = rulerInter(R.m!.r, { type: 'l', l: { a: sg.A, b: sg.B }, k: '' }, q)
      if (!X) X = projOn(R.m!.r, r.k ? sg.A : sg.B)
      jx[i] = X; smoothJ[i] = false; continue
    }
    jx[i] = null; smoothJ[i] = true
  }
  interface End { seg: PathSeg; P: V; Q: V; T: V }
  const ends: (End | null)[] = runs.map((r, i) => {
    if (!r.k || !r.m) return null
    const ru = r.m.r, pa = pts[r.a], pb = pts[r.b], A = i > 0 ? jx[i - 1] : null, B = jx[i] ?? null
    if (ru.type === 'c') {
      const c = ru.c
      let tot = 0
      for (let j = r.a + 1; j <= r.b; j++) tot += wrap(angleOn(c, pts[j]) - angleOn(c, pts[j - 1]))
      const t0 = A ? angleOn(c, A) : Math.round(angleOn(c, pa) / STEP_ANGLE) * STEP_ANGLE
      const t1raw = angleOn(c, pa) + tot
      let t1 = B ? t1raw + wrap(angleOn(c, B) - t1raw) : Math.round(t1raw / STEP_ANGLE) * STEP_ANGLE
      if (Math.abs(t1 - t0) < 1e-3) return null
      if (Math.abs(t1 - t0) > TAU) t1 = t0 + Math.sign(t1 - t0) * TAU
      return { seg: { g: { type: 'c', id: c.id }, a: t0, b: t1 }, P: [c.x + c.r * Math.cos(t0), c.y + c.r * Math.sin(t0)], Q: [c.x + c.r * Math.cos(t1), c.y + c.r * Math.sin(t1)], T: t1 > t0 ? [-Math.sin(t1), Math.cos(t1)] : [Math.sin(t1), -Math.cos(t1)] }
    }
    const l = ru.l, t0 = A ? lineT(l, A) : snapLineT(l, lineT(l, pa)), t1 = B ? lineT(l, B) : snapLineT(l, lineT(l, pb))
    if (Math.abs(t1 - t0) * dist(l.a, l.b) < 0.5) return null
    const L = dist(l.a, l.b), sg = t1 > t0 ? 1 : -1
    return { seg: { g: { type: 'l', id: l.id! }, a: t0, b: t1 }, P: linePt(l, t0), Q: linePt(l, t1), T: [sg * (l.b[0] - l.a[0]) / L, sg * (l.b[1] - l.a[1]) / L] }
  })
  const out: PathSeg[] = []
  runs.forEach((r, i) => {
    if (r.k) { const e = ends[i]; if (e) out.push(e.seg); return }
    if (!dry[i]) return
    const pe = ends[i - 1], ne = ends[i + 1], opt: FitOpt = {}
    if (pe) { opt.A = pe.Q; if (smoothJ[i - 1]) opt.T = pe.T }
    if (ne) opt.B = ne.P
    out.push(...commitFree(d, fitFree(subOf(i), opt)))
  })
  return out
}

// ---- 펜촉: 클릭마다 마디가 놓인다 ----
export interface NibTrail { k: string; last: number; tot: number }
export interface NibCandidate { B: V; seg: PathSeg | null; newLine: { a: V; b: V } | null; locked: boolean }

/** 마우스가 원 자를 따라 돈 각도를 기억한다(호를 어느 쪽으로 그릴지 정한다). */
export function nibTrail(d: DrawnJamo, A: V, u: V, prev: NibTrail | null): NibTrail | null {
  const lk = lockOf(d, A, u)
  if (!lk || lk.type !== 'c') return null
  const a = angleOn(lk.c, u)
  const t = prev && prev.k === lk.k ? prev : { k: lk.k, last: angleOn(lk.c, A), tot: 0 }
  return { k: lk.k, last: a, tot: t.tot + wrap(a - t.last) }
}

/**
 * 펜촉 후보. 처음 놓는 마디(after 없음)는 시작점이 올라앉은 자에 묶인다.
 * 이어 놓는 마디(after = 앞 마디의 자)는 앞 자를 떠나도 되고, 시작점을 지나는 다른 자 가까이 가면 그 자를 따른다.
 */
export function nibCandidate(d: DrawnJamo, A: V, u: V, trail: NibTrail | null, after: string | null = null): NibCandidate | null {
  const lk = after === null ? lockOf(d, A, u) : (onRulers(d, A).filter((r) => r.k !== after && rDist(r, u) < MAGNET * 1.6).sort((a, b) => rDist(a, u) - rDist(b, u))[0] ?? null)
  if (lk) {
    const B = snapOn(d, lk, projOn(lk, u))
    const seg = segOnRuler(lk, A, B, trail && trail.k === lk.k ? trail.tot : undefined)
    return seg ? { B, seg, newLine: null, locked: true } : null
  }
  const B = snapPoint(d, u)
  if (dist(A, B) < 0.5) return null
  return { B, seg: null, newLine: { a: A, b: B }, locked: false }
}

/** 후보를 놓는다. pathId가 있으면 그 선에 이어 붙인다. 새로 만든(또는 이은) 선의 id를 돌려준다. */
export function nibCommit(d0: DrawnJamo, cand: NibCandidate, pathId: number | null): { d: DrawnJamo; pathId: number; k: string } {
  const d = cloneDrawn(d0)
  let seg = cand.seg
  if (!seg && cand.newLine) {
    const l: RulerLine = { id: d.nid++, a: [...cand.newLine.a] as V, b: [...cand.newLine.b] as V }
    d.lines.push(l); seg = { g: { type: 'l', id: l.id }, a: 0, b: 1 }
  }
  const path = pathId !== null ? d.paths.find((p) => p.id === pathId) : undefined
  const k = seg!.g.type + seg!.g.id
  if (path) { path.segs.push(seg!); return { d, pathId: path.id, k } }
  const id = d.nid++
  d.paths.push({ id, segs: [seg!] })
  return { d, pathId: id, k }
}

// ---- 놓기 · 빼기 · 끝점 ----
export function addCircle(d0: DrawnJamo, at: V, r: number): DrawnJamo {
  const d = cloneDrawn(d0)
  d.circles.push({ id: d.nid++, x: snap5(at[0]), y: snap5(at[1]), r })
  return d
}
export function addLine(d0: DrawnJamo, a: V, b: V): DrawnJamo {
  if (dist(a, b) < 1) return d0
  const d = cloneDrawn(d0)
  d.lines.push({ id: d.nid++, a, b })
  return d
}
/** 누른 자리의 자(원 테두리 · 가운데, 직선). */
export function rulerHit(d: DrawnJamo, u: V): { type: 'c' | 'l'; id: number } | null {
  for (let i = d.lines.length - 1; i >= 0; i--) { const l = d.lines[i], t = Math.max(0, Math.min(1, lineT(l, u))); if (dist(linePt(l, t), u) < 1.3) return { type: 'l', id: l.id } }
  for (let i = d.circles.length - 1; i >= 0; i--) { const c = d.circles[i], dd = Math.hypot(u[0] - c.x, u[1] - c.y); if (dd < 2 || Math.abs(dd - c.r) < 1.2) return { type: 'c', id: c.id } }
  return null
}
/** 자를 뺀다. 그 자에 그은 선도 같이 빠진다. */
export function removeRuler(d0: DrawnJamo, hit: { type: 'c' | 'l'; id: number }): DrawnJamo {
  const d = cloneDrawn(d0)
  if (hit.type === 'c') d.circles = d.circles.filter((c) => c.id !== hit.id)
  else d.lines = d.lines.filter((l) => l.id !== hit.id)
  d.paths = d.paths.filter((p) => !p.segs.some((s) => s.g.type === hit.type && s.g.id === hit.id))
  return d
}
export function removePath(d0: DrawnJamo, id: number): DrawnJamo {
  const d = cloneDrawn(d0)
  d.paths = d.paths.filter((p) => p.id !== id)
  return d
}
export function pathEnds(d: DrawnJamo, p: DrawnPath): { start: V | null; end: V | null } {
  const first = p.segs[0], last = p.segs[p.segs.length - 1]
  const full = p.segs.length === 1 && first.g.type === 'c' && Math.abs(first.b - first.a) >= TAU - 1e-3
  if (full) return { start: null, end: null }
  return { start: segEnd(d, first, 'a'), end: segEnd(d, last, 'b') }
}
/** 선의 첫 끝 · 끝 끝을 그 자를 따라 옮긴다. */
export function dragPathEnd(d0: DrawnJamo, pathId: number, which: 'start' | 'end', u: V): DrawnJamo {
  const d = cloneDrawn(d0)
  const p = d.paths.find((x) => x.id === pathId)
  if (!p) return d0
  const s = which === 'start' ? p.segs[0] : p.segs[p.segs.length - 1], key = which === 'start' ? 'a' : 'b'
  const r = rulerOfSeg(d, s)
  if (!r) return d0
  const q = snapOn(d, r, projOn(r, u))
  if (r.type === 'c') {
    let a = angleOn(r.c, q)
    const cur = s[key]
    while (a - cur > Math.PI) a -= TAU
    while (cur - a > Math.PI) a += TAU
    const other = key === 'a' ? s.b : s.a
    if (Math.abs(a - other) < 1e-3 || Math.abs(a - other) > TAU) return d0
    s[key] = a
  } else {
    const t = lineT(r.l, q), other = key === 'a' ? s.b : s.a
    if (Math.abs(t - other) * dist(r.l.a, r.l.b) < 0.5) return d0
    s[key] = t
  }
  return d
}

// ---- 획으로 바꾸기 ----
/** 캔버스 여백(캔버스 비율). 상자 0~1이 캔버스의 이 여백 안쪽에 놓인다. */
export const CANVAS_PAD = 0.16
export const sToBox = (q: V): { x: number; y: number } => ({ x: (q[0] / 100 - CANVAS_PAD) / (1 - 2 * CANVAS_PAD), y: (q[1] / 100 - CANVAS_PAD) / (1 - 2 * CANVAS_PAD) })
export const boxToS = (p: { x: number; y: number }): V => [(CANVAS_PAD + p.x * (1 - 2 * CANVAS_PAD)) * 100, (CANVAS_PAD + p.y * (1 - 2 * CANVAS_PAD)) * 100]

/** 그은 선 하나를 중심선 획 하나로. 원 마디는 90° 이하 베지어로 나눈다. */
export function pathToStroke(d: DrawnJamo, p: DrawnPath, thickness: number): StrokeDataV2 | null {
  const pts: AnchorPoint[] = []
  const box = (q: V) => sToBox(q)
  const push = (q: V) => {
    const last = pts[pts.length - 1]
    if (last) { const lq = boxToS(last); if (dist(lq, q) < 0.3) return }
    pts.push(box(q))
  }
  let closed = false
  for (const s of p.segs) {
    const A = segEnd(d, s, 'a'), B = segEnd(d, s, 'b')
    if (!A || !B) continue
    push(A)
    if (s.g.type === 'l') { push(B); continue }
    const c = d.circles.find((x) => x.id === s.g.id)!
    const sweep = s.b - s.a, n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-6)), h = sweep / n
    const k = 4 / 3 * Math.tan(h / 4)
    for (let i = 0; i < n; i++) {
      const t0 = s.a + h * i, t1 = t0 + h
      const p0: V = [c.x + c.r * Math.cos(t0), c.y + c.r * Math.sin(t0)], p1: V = [c.x + c.r * Math.cos(t1), c.y + c.r * Math.sin(t1)]
      const c0: V = [p0[0] - k * c.r * Math.sin(t0), p0[1] + k * c.r * Math.cos(t0)], c1: V = [p1[0] + k * c.r * Math.sin(t1), p1[1] - k * c.r * Math.cos(t1)]
      const last = pts[pts.length - 1]
      last.handleOut = box(c0)
      const full = p.segs.length === 1 && Math.abs(sweep) >= TAU - 1e-3 && i === n - 1
      if (full) { pts[0].handleIn = box(c1); closed = true; break }
      pts.push({ ...box(p1), handleIn: box(c1) })
    }
  }
  if (pts.length < 2 && !closed) return null
  return { id: `d${p.id}`, points: pts, closed, thickness }
}

/** 그은 선 전부를 획으로. */
export function drawnStrokes(d: DrawnJamo | undefined, thickness: number): StrokeDataV2[] {
  if (!d) return []
  return d.paths.map((p) => pathToStroke(d, p, thickness)).filter((s): s is StrokeDataV2 => !!s)
}
