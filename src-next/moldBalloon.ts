import type { BoxConfig, Part } from '../src/types'

/**
 * 풍선 굵기(하니무스 2026-11-21 "꽉 채운 네모 안에 하얀 획을 얼마나 남길지로 거꾸로"). 플랜 `docs/plans/2026-11-21_풍선-굵기.md`.
 *
 * 굵기 줄은 바라는 굵기 하나만 준다. 글자 하나를 자소마다 푼다:
 * 1. 칸 — 자소의 잉크 칸을 이웃 쪽으로 키운다(마주 본 두 자소가 반씩). 자소 사이 흰 틈이 그 굵기의 목표에 닿으면 멈춘다(넘었으면 물러난다).
 * 2. 예산 — 한 자소 안에 나란한 획이 쌓였으면 사이 흰 틈이 바닥을 지키는 데까지만 굵어진다. 가로로 쌓인 것은 가로줄기를, 세로로 쌓인 것은 세로줄기를 따로 누른다.
 * 3. 안으로 — 굵어진 반만큼 중심선 칸을 안으로 당겨 잉크 바깥 끝이 칸 끝에 그대로 있게 한다.
 *
 * 틈 목표의 기울기는 폰트 156벌에서 뽑은 패턴(거북이 `mold-fit/heavy`)이고, 출발점은 늘 그 글자의 지금 틈이다.
 * 순수 셈이다 — 엔진을 부르지 않는다. 중심선(em)과 칸만 받는다.
 */

export type BalloonGroup = 'CH' | 'JU' | 'JO'
export const balloonGroupOf = (part: Part): BalloonGroup => (part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU')

export interface BalloonStroke {
  part: Part
  /** 처음 칸에서의 중심선(em). 곡선은 편 점. */
  points: readonly { x: number; y: number }[]
  closed?: boolean
  /** 굵기 배율 1에서의 두께(em). */
  thickness: number
}
/** 세로줄기 · 가로줄기 두께 배율(저장 두께 대비). 사선 · 곡선은 선 방향만큼 섞인다(엔진 대비와 같은 sin²). */
export interface Thick { v: number; h: number }
export interface BalloonInput {
  strokes: readonly BalloonStroke[]
  boxes: Partial<Record<Part, BoxConfig>>
  /** 출발 굵기(대비 줄 값까지 든 것)와 바라는 굵기. */
  base: Thick
  want: Thick
}
export interface BalloonResult {
  boxes: Partial<Record<Part, BoxConfig>>
  thick: Record<BalloonGroup, Thick>
}

/** 꽉 찬 끝의 흰 틈(em). 자소 사이는 가석원 0.027, 자소 안 획 사이 바닥은 0.02(그 뒤는 붙여 그리는 폰트 — 이번엔 안 함). */
export const BALLOON_END = { between: 0.03, inside: 0.02 } as const
/** 세로줄기가 1 굵어질 때 흰 틈이 줄어드는 양. 받침 위는 덜 준다(받침이 밀려 내려가서). */
export const BALLOON_SLOPE = { inside: 0.5, between: 0.67, final: 0.33 } as const
/** 한 글자 안에서 자소끼리 굵기가 이보다 갈리지 않는다(10-01 눈 ② "획 두께 차이가 커서 안 예쁨" · 바닥 0.8과 같은 뜻). */
export const BALLOON_BAND = 0.75
/** 자소 뼈대(중심선 너비 · 키)는 처음의 이 비율 아래로 안 줄어든다 — ㄱ이 덩어리가 되지 않게. */
const SKELETON_MIN = 0.4
/** 처음부터 이보다 가까운 획 쌍(두께 대비)은 붙여 그린 것 — 지키지 않는다(엔진 `counterKeep`의 MIN_GAP_RATIO). */
const JOINED_RATIO = 0.25
const PARALLEL_COS = Math.cos(20 / 180 * Math.PI)
const ROUNDS = 24
const EPS = 1e-6

interface Seg { stroke: number; at: number; part: Part; group: BalloonGroup; t: number; ax: number; ay: number; bx: number; by: number }
interface Pt { x: number; y: number }

/** 처음 칸 기준의 정규 좌표(칸이 바뀌면 같은 비율 자리로 간다). 너비 0인 칸은 가운데. */
function normalized(strokes: readonly BalloonStroke[], boxes: Partial<Record<Part, BoxConfig>>): Pt[][] {
  return strokes.map((stroke) => {
    const box = boxes[stroke.part]
    if (!box) return stroke.points.map((p) => ({ ...p }))
    return stroke.points.map((p) => ({ x: box.width > EPS ? (p.x - box.x) / box.width : 0.5, y: box.height > EPS ? (p.y - box.y) / box.height : 0.5 }))
  })
}
function segmentsOf(strokes: readonly BalloonStroke[], unit: Pt[][], boxes: Partial<Record<Part, BoxConfig>>): Seg[] {
  const out: Seg[] = []
  strokes.forEach((stroke, index) => {
    const box = boxes[stroke.part]
    const points = unit[index].map((p) => (box ? { x: box.x + p.x * box.width, y: box.y + p.y * box.height } : p))
    const count = stroke.closed ? points.length : points.length - 1
    for (let at = 0; at < count; at++) {
      const a = points[at], b = points[(at + 1) % points.length]
      out.push({ stroke: index, at, part: stroke.part, group: balloonGroupOf(stroke.part), t: stroke.thickness, ax: a.x, ay: a.y, bx: b.x, by: b.y })
    }
  })
  return out
}
const lengthOf = (s: Seg) => Math.hypot(s.bx - s.ax, s.by - s.ay)
/** 선이 얼마나 섰나(가로 0 · 세로 1). */
const uprightOf = (s: Seg) => { const l = lengthOf(s); return l > EPS ? ((s.by - s.ay) / l) ** 2 : 0 }
/** 토막의 반 두께의 가로줄기 몫(A) · 세로줄기 몫(B): 반 두께 = A × h + B × v. */
const sharesOf = (s: Seg) => { const u = uprightOf(s); return { a: s.t / 2 * (1 - u), b: s.t / 2 * u } }
const halfOf = (s: Seg, thick: Thick) => { const { a, b } = sharesOf(s); return a * thick.h + b * thick.v }

function pointToSeg(px: number, py: number, s: Seg): { d: number; x: number; y: number } {
  const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy
  const k = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2))
  const x = s.ax + k * dx, y = s.ay + k * dy
  return { d: Math.hypot(px - x, py - y), x, y }
}
const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
/** 두 토막 사이 가장 가까운 두 점. 가로지르면 거리 0. */
function nearest(p: Seg, q: Seg): { d: number; p: Pt; q: Pt } {
  const d1 = cross(p.ax, p.ay, p.bx, p.by, q.ax, q.ay), d2 = cross(p.ax, p.ay, p.bx, p.by, q.bx, q.by)
  const d3 = cross(q.ax, q.ay, q.bx, q.by, p.ax, p.ay), d4 = cross(q.ax, q.ay, q.bx, q.by, p.bx, p.by)
  if (d1 * d2 < 0 && d3 * d4 < 0) { const k = d3 / (d3 - d4); const at = { x: p.ax + k * (p.bx - p.ax), y: p.ay + k * (p.by - p.ay) }; return { d: 0, p: at, q: at } }
  const c = [
    { ...pointToSeg(p.ax, p.ay, q), from: { x: p.ax, y: p.ay }, onQ: true }, { ...pointToSeg(p.bx, p.by, q), from: { x: p.bx, y: p.by }, onQ: true },
    { ...pointToSeg(q.ax, q.ay, p), from: { x: q.ax, y: q.ay }, onQ: false }, { ...pointToSeg(q.bx, q.by, p), from: { x: q.bx, y: q.by }, onQ: false },
  ].reduce((a, b) => (b.d < a.d ? b : a))
  return c.onQ ? { d: c.d, p: c.from, q: { x: c.x, y: c.y } } : { d: c.d, p: { x: c.x, y: c.y }, q: c.from }
}
/** 잇는 방향으로 토막이 내미는 두께 — 옆면은 반 두께 그대로, 각진 끝은 0(끝은 굵어져도 안 나온다). */
function reachOf(s: Seg, nx: number, ny: number, thick: Thick): number {
  const l = lengthOf(s)
  if (l < EPS) return 0
  return halfOf(s, thick) * Math.abs(nx * (s.by - s.ay) / l - ny * (s.bx - s.ax) / l)
}
function gapBetween(p: Seg, q: Seg, thickP: Thick, thickQ: Thick) {
  const near = nearest(p, q)
  if (near.d < EPS) return { gap: -(halfOf(p, thickP) + halfOf(q, thickQ)), nx: 0, ny: 0, reachP: halfOf(p, thickP), reachQ: halfOf(q, thickQ), d: 0 }
  const nx = (near.q.x - near.p.x) / near.d, ny = (near.q.y - near.p.y) / near.d
  const reachP = reachOf(p, nx, ny, thickP), reachQ = reachOf(q, nx, ny, thickQ)
  return { gap: near.d - reachP - reachQ, nx, ny, reachP, reachQ, d: near.d }
}
const parallel = (p: Seg, q: Seg) => Math.abs((p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay)) >= PARALLEL_COS * lengthOf(p) * lengthOf(q)
const facing = (p: Seg, q: Seg) => (p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay) < -0.5 * lengthOf(p) * lengthOf(q)

interface InsidePair { i: number; j: number; target: number }
/** 꼭지 · 곁줄기처럼 다른 획 옆면에 끝이 붙은 짧은 획. 붙은 획이 굵어져도 보이는 길이가 처음의 반은 남는다. */
interface Stub { on: number; room: number }
/** 붙은 짧은 획이 남길 보이는 길이(처음 대비). */
const STUB_KEEP = 0.5
interface BetweenPair { i: number; j: number }
interface PartPair { a: Part; b: Part; target: number; pairs: BetweenPair[] }

/**
 * 지킬 틈을 처음 모양에서 고른다(엔진 `counterGapFilter`와 같은 거름망).
 * 자소 안: 나란한 두 토막, 처음부터 붙지 않은 것, 한 획 굽은 길의 이웃 · 이음 자리 쐐기는 뺀다.
 * 자소 사이: 모든 토막 쌍(끝이 옆면을 보는 것도) 가운데 가까운 것들.
 */
function pickPairs(segs: Seg[], strokes: readonly BalloonStroke[], base: Thick, delta: number): { inside: InsidePair[]; between: PartPair[]; stubs: Stub[] } {
  const inside: InsidePair[] = []
  const stubs: Stub[] = []
  const byParts = new Map<string, { a: Part; b: Part; list: { i: number; j: number; gap: number }[] }>()
  // 획 처음부터 잰 길이(토막 시작)와 획 전체 길이.
  const startAt: number[] = [], total = new Map<number, number>()
  for (const s of segs) { const walked = total.get(s.stroke) ?? 0; startAt.push(walked); total.set(s.stroke, walked + lengthOf(s)) }
  // 이어진 두 획의 이음 자리(잉크가 겹치는 가장 가까운 곳).
  const joints = new Map<string, Pt & { d: number }>()
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]
    if (p.group !== q.group || p.stroke === q.stroke) continue
    const near = nearest(p, q)
    if (near.d > halfOf(p, base) + halfOf(q, base)) continue
    const key = `${p.stroke}:${q.stroke}`
    if ((joints.get(key)?.d ?? Infinity) <= near.d) continue
    joints.set(key, { x: (near.p.x + near.q.x) / 2, y: (near.p.y + near.q.y) / 2, d: near.d })
  }
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]
    if (lengthOf(p) < EPS || lengthOf(q) < EPS) continue
    if (p.group === q.group) {
      if (!parallel(p, q)) continue
      const near = nearest(p, q)
      const gap = near.d - halfOf(p, base) - halfOf(q, base)
      if (gap <= JOINED_RATIO * Math.min(p.t, q.t)) continue
      if (p.stroke === q.stroke && !facing(p, q)) {
        const closed = strokes[p.stroke].closed
        const kp = Math.hypot(near.p.x - p.ax, near.p.y - p.ay), kq = Math.hypot(near.q.x - q.ax, near.q.y - q.ay)
        const forward = Math.abs(startAt[i] + kp - startAt[j] - kq)
        const along = closed ? Math.min(forward, (total.get(p.stroke) ?? 0) - forward) : forward
        if (near.d >= 0.5 * along) continue
      }
      const joint = p.stroke === q.stroke ? undefined : joints.get(`${p.stroke}:${q.stroke}`)
      if (joint && !facing(p, q) && near.d >= 0.5 * (Math.hypot(near.p.x - joint.x, near.p.y - joint.y) + Math.hypot(near.q.x - joint.x, near.q.y - joint.y))) continue
      inside.push({ i, j, target: gap })
    } else {
      const { gap } = gapBetween(p, q, base, base)
      const key = p.part < q.part ? `${p.part}|${q.part}` : `${q.part}|${p.part}`
      const entry = byParts.get(key) ?? { a: p.part, b: q.part, list: [] }
      entry.list.push({ i, j, gap })
      byParts.set(key, entry)
    }
  }
  // 붙은 짧은 획: 한 획의 끝점이 같은 자소 다른 획의 옆면에 닿고, 두 획이 나란하지 않다.
  for (let index = 0; index < strokes.length; index++) {
    const own = segs.filter((seg) => seg.stroke === index)
    if (!own.length || strokes[index].closed) continue
    const length = own.reduce((sum, seg) => sum + lengthOf(seg), 0)
    for (const [end, seg] of [[{ x: own[0].ax, y: own[0].ay }, own[0]], [{ x: own[own.length - 1].bx, y: own[own.length - 1].by }, own[own.length - 1]]] as const) {
      let best: { on: number; d: number } | null = null
      segs.forEach((other, at) => {
        if (other.stroke === index || other.group !== seg.group || lengthOf(other) < EPS) return
        const d = pointToSeg(end.x, end.y, other).d
        if (d <= halfOf(other, base) + 1e-3 && (!best || d < best.d)) best = { on: at, d }
      })
      if (!best) continue
      const other = segs[(best as { on: number }).on]
      if (parallel(seg, other)) continue
      const dx = (seg.bx - seg.ax) / lengthOf(seg), dy = (seg.by - seg.ay) / lengthOf(seg)
      const visible0 = length - reachOf(other, dx, dy, base)
      if (visible0 <= 0) continue
      stubs.push({ on: (best as { on: number }).on, room: length - STUB_KEEP * visible0 })
    }
  }
  // 자소 안 목표는 그 자소의 가장 좁은 틈에서 잰다. 사이에 획이 낀 먼 쌍(ㅌ 첫 · 셋째 가로줄기)이 제 넓은 틈을 지키려 들면 가까운 쌍보다 먼저 막는다.
  const narrow = new Map<BalloonGroup, number>()
  for (const pair of inside) { const g = segs[pair.i].group; narrow.set(g, Math.min(narrow.get(g) ?? Infinity, pair.target)) }
  for (const pair of inside) { const least = narrow.get(segs[pair.i].group)!; pair.target = Math.min(pair.target, Math.max(BALLOON_END.inside, least - BALLOON_SLOPE.inside * delta)) }
  const between: PartPair[] = []
  for (const { a, b, list } of byParts.values()) {
    const least = Math.min(...list.map((item) => item.gap))
    // 처음부터 닿은 자소 쌍은 그렇게 그린 것 — 손대지 않는다.
    if (least <= 0.005) continue
    const slope = balloonGroupOf(a) === 'JO' || balloonGroupOf(b) === 'JO' ? BALLOON_SLOPE.final : BALLOON_SLOPE.between
    const target = Math.min(least, Math.max(BALLOON_END.between, least - slope * delta))
    // 가까운 쌍만 본다(칸이 움직이며 순서가 바뀔 수 있어 넉넉히).
    between.push({ a, b, target, pairs: list.filter((item) => item.gap <= least + 0.15).sort((x, y) => x.gap - y.gap).slice(0, 16).map(({ i, j }) => ({ i, j })) })
  }
  return { inside, between, stubs }
}

interface Cell { x0: number; y0: number; x1: number; y1: number }
/** 자소 하나의 잉크 칸과 중심선 칸. */
function extents(segs: Seg[], part: Part, thick: Thick): { ink: Cell; center: Cell } | null {
  const ink = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, center = { ...ink }
  for (const s of segs) {
    if (s.part !== part) continue
    const l = lengthOf(s), half = halfOf(s, thick)
    const nx = l > EPS ? -(s.by - s.ay) / l * half : 0, ny = l > EPS ? (s.bx - s.ax) / l * half : 0
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]] as const) {
      center.x0 = Math.min(center.x0, x); center.x1 = Math.max(center.x1, x); center.y0 = Math.min(center.y0, y); center.y1 = Math.max(center.y1, y)
      ink.x0 = Math.min(ink.x0, x - Math.abs(nx)); ink.x1 = Math.max(ink.x1, x + Math.abs(nx)); ink.y0 = Math.min(ink.y0, y - Math.abs(ny)); ink.y1 = Math.max(ink.y1, y + Math.abs(ny))
    }
  }
  return Number.isFinite(center.x0) ? { ink, center } : null
}

/** 굵기 배율 한 쌍 → 엔진에 줄 값: 획 두께 배율과 대비(+ 세로 굵게 · 가로 얇게). `contrastWidthOf`의 거꾸로. */
export function inkOfThick(thick: Thick): { multiplier: number; contrast: number } {
  const r = thick.v > EPS ? thick.h / thick.v : 1
  if (Math.abs(r - 1) < 1e-4) return { multiplier: thick.v, contrast: 0 }
  if (r < 1) { const c = Math.min(1, (1 - r) / (0.8 * r + 0.45)); return { multiplier: thick.v / (1 + 0.8 * c), contrast: c } }
  const c = Math.max(-1, -2 * (r - 1) / (r + 1))
  return { multiplier: thick.v / (1 + 0.5 * c), contrast: c }
}

export function solveBalloon(input: BalloonInput): BalloonResult {
  const { strokes, base, want } = input
  const groups: BalloonGroup[] = ['CH', 'JU', 'JO']
  const start = Object.fromEntries(groups.map((g) => [g, { ...base }])) as Record<BalloonGroup, Thick>
  if (!(want.v > base.v + EPS) && !(want.h > base.h + EPS)) return { boxes: input.boxes, thick: Object.fromEntries(groups.map((g) => [g, { ...want }])) as Record<BalloonGroup, Thick> }
  const unit = normalized(strokes, input.boxes)
  const first = segmentsOf(strokes, unit, input.boxes)
  const median = [...strokes].map((s) => s.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)] ?? 0.07
  const delta = median * Math.max(0, want.v - base.v)
  const { inside, between, stubs } = pickPairs(first, strokes, base, delta)
  const parts = [...new Set(strokes.map((s) => s.part))]
  // 칸 = 처음 굵기의 잉크 칸. 자소 사이 틈에 따라 변이 움직인다.
  const cells = new Map<Part, Cell>(), firstCenter = new Map<Part, Cell>()
  for (const part of parts) { const e = extents(first, part, start[balloonGroupOf(part)]); if (e) { cells.set(part, { ...e.ink }); firstCenter.set(part, e.center) } }
  const thick = Object.fromEntries(groups.map((g) => [g, { ...want }])) as Record<BalloonGroup, Thick>
  const cap = Object.fromEntries(groups.map((g) => [g, { v: Infinity, h: Infinity }])) as Record<BalloonGroup, Thick>
  let boxes: Partial<Record<Part, BoxConfig>> = { ...input.boxes }

  /** 3. 안으로: 지금 굵기의 잉크가 칸에 꼭 맞게 중심선 칸을 놓는다. 뼈대가 너무 줄면 그 축 굵기를 누른다. */
  const fit = () => {
    for (let pass = 0; pass < 2; pass++) {
      const segs = segmentsOf(strokes, unit, boxes)
      for (const part of parts) {
        const cell = cells.get(part), box = boxes[part], e = extents(segs, part, thick[balloonGroupOf(part)]), base0 = firstCenter.get(part)
        if (!cell || !box || !e || !base0) continue
        const next = { ...box }
        for (const axis of ['x', 'y'] as const) {
          const lo = axis === 'x' ? 'x0' : 'y0', hi = axis === 'x' ? 'x1' : 'y1', size = axis === 'x' ? 'width' : 'height'
          const extent = e.center[hi] - e.center[lo], extent0 = base0[hi] - base0[lo]
          const over = (e.center[lo] - e.ink[lo]) + (e.ink[hi] - e.center[hi])
          if (extent0 < 0.01 || extent < EPS || box[size] < EPS) {
            // 한 줄짜리(ㅡ의 키, ㅣ의 너비): 당길 뼈대가 없다. 칸이 굵기를 따라간다(가운데는 그대로).
            const mid = (cell[lo] + cell[hi]) / 2
            cell[lo] = mid - over / 2; cell[hi] = mid + over / 2
            continue
          }
          const room = cell[hi] - cell[lo] - over
          const wantExtent = Math.max(SKELETON_MIN * extent0, room)
          const k = wantExtent / extent
          const centerLo = cell[lo] + (e.center[lo] - e.ink[lo]) + (room - wantExtent) / 2
          // 칸 안에서 중심선이 차지하던 비율 자리를 지키며 줄인다.
          const unitLo = (e.center[lo] - box[axis]) / box[size]
          next[size] = box[size] * k
          next[axis] = centerLo - unitLo * next[size]
        }
        boxes = { ...boxes, [part]: next }
      }
    }
  }

  for (let round = 0; round < ROUNDS; round++) {
    fit()
    const segs = segmentsOf(strokes, unit, boxes)
    // 2. 예산: 자소 안 나란한 획 사이 틈이 목표를 지키는 가장 굵은 값. 칸이 바뀌면 다시 푼다(바라는 값에서 출발).
    const sol = Object.fromEntries(groups.map((g) => [g, { v: Math.min(want.v, cap[g].v), h: Math.min(want.h, cap[g].h) }])) as Record<BalloonGroup, Thick>
    for (const pair of inside) {
      const p = segs[pair.i], q = segs[pair.j], g = p.group, now = thick[g]
      const d = nearest(p, q).d, sp = sharesOf(p), sq = sharesOf(q), a = sp.a + sq.a, b = sp.b + sq.b
      const room = d - pair.target
      const lean = b / (a + b)
      if (lean < 0.3) sol[g].h = Math.min(sol[g].h, (room - b * now.v) / Math.max(a, EPS))
      else if (lean > 0.7) sol[g].v = Math.min(sol[g].v, (room - a * now.h) / Math.max(b, EPS))
      else { const f = room / Math.max(a * now.h + b * now.v, EPS); sol[g].h = Math.min(sol[g].h, now.h * f); sol[g].v = Math.min(sol[g].v, now.v * f) }
    }
    // 붙은 짧은 획: 붙은 획의 반 두께가 그 획 길이를 다 먹지 않게(곁줄기 · 꼭지가 사라지지 않게).
    for (const stub of stubs) {
      const o = segs[stub.on], g = o.group
      const { a, b } = sharesOf(o), room = stub.room
      if (b >= a) sol[g].v = Math.min(sol[g].v, (room - a * thick[g].h) / Math.max(b, EPS))
      else sol[g].h = Math.min(sol[g].h, (room - b * thick[g].v) / Math.max(a, EPS))
    }
    // 뼈대 바닥: 굵기가 칸을 다 먹으면(ㄱ처럼 마주 보는 획이 없는 자소) 그 축 굵기를 누른다.
    for (const part of parts) {
      const cell = cells.get(part), e = extents(segs, part, thick[balloonGroupOf(part)]), base0 = firstCenter.get(part), g = balloonGroupOf(part)
      if (!cell || !e || !base0) continue
      for (const axis of ['x', 'y'] as const) {
        const lo = axis === 'x' ? 'x0' : 'y0', hi = axis === 'x' ? 'x1' : 'y1'
        const extent0 = base0[hi] - base0[lo]
        if (extent0 < 0.01) continue
        const over = (e.center[lo] - e.ink[lo]) + (e.ink[hi] - e.center[hi]), most = cell[hi] - cell[lo] - SKELETON_MIN * extent0
        if (over > most + EPS && over > EPS) { const f = Math.max(0, most) / over; if (axis === 'x') sol[g].v = Math.min(sol[g].v, thick[g].v * f); else sol[g].h = Math.min(sol[g].h, thick[g].h * f) }
      }
    }
    const present = groups.filter((g) => strokes.some((s) => balloonGroupOf(s.part) === g))
    for (const g of present) { sol[g].v = Math.max(base.v, sol[g].v); sol[g].h = Math.max(base.h, sol[g].h) }
    // 한 글자 안 굵기 띠.
    const leastV = Math.min(...present.map((g) => sol[g].v)), leastH = Math.min(...present.map((g) => sol[g].h))
    for (const g of present) {
      sol[g].v = Math.min(sol[g].v, leastV / BALLOON_BAND); sol[g].h = Math.min(sol[g].h, leastH / BALLOON_BAND)
      // 반씩 다가간다 — 굵기와 칸이 서로 물려 출렁이지 않게.
      thick[g] = { v: thick[g].v + 0.5 * (sol[g].v - thick[g].v), h: thick[g].h + 0.5 * (sol[g].h - thick[g].h) }
    }
    // 1. 칸: 자소 사이 가장 좁은 틈이 목표가 되게 마주 본 변을 옮긴다. 한 줄짜리는 안 움직인다 — 둘 다 못 움직이면 굵기를 누른다.
    for (const pp of between) {
      let worst: (ReturnType<typeof gapBetween> & { p: Seg; q: Seg }) | null = null
      for (const pair of pp.pairs) {
        const p = segs[pair.i], q = segs[pair.j]
        const g = gapBetween(p, q, thick[p.group], thick[q.group])
        if (!worst || g.gap < worst.gap) worst = { ...g, p, q }
      }
      if (!worst) continue
      const err = worst.gap - pp.target
      if (Math.abs(err) < 5e-4) continue
      const axis = Math.abs(worst.nx) >= Math.abs(worst.ny) ? 'x' : 'y'
      const dir = axis === 'x' ? Math.sign(worst.nx) : Math.sign(worst.ny)
      if (dir === 0) continue
      const lo = axis === 'x' ? 'x0' : 'y0', hi = axis === 'x' ? 'x1' : 'y1'
      // 마주 본 변만 움직인다(글자 바깥 변은 안 움직인다 — 그 변은 이웃이 없어 여기 안 온다). 한 줄짜리(ㅡ의 키)는 못 움직인다.
      const movable = (s: Seg) => { const c = firstCenter.get(s.part); return !!c && c[hi] - c[lo] >= 0.01 }
      const mp = movable(worst.p), mq = movable(worst.q)
      if (!mp && !mq) {
        if (err < 0) {
          const reach = worst.reachP + worst.reachQ
          const f = reach > EPS ? Math.max(0, (reach + err) / reach) : 1
          for (const s of [worst.p, worst.q]) { if (axis === 'x') cap[s.group].v = Math.min(cap[s.group].v, thick[s.group].v * f); else cap[s.group].h = Math.min(cap[s.group].h, thick[s.group].h * f) }
        }
        continue
      }
      const step = err * 0.5
      const move = (s: Seg, toward: number, amount: number) => {
        const cell = cells.get(s.part)
        if (!cell) return
        // toward > 0이면 이 자소의 큰 쪽 변이 이웃을 본다.
        if (toward > 0) cell[hi] = Math.max(cell[lo] + 0.02, cell[hi] + amount)
        else cell[lo] = Math.min(cell[hi] - 0.02, cell[lo] - amount)
      }
      if (mp) move(worst.p, dir, step * (mq ? 0.5 : 1))
      if (mq) move(worst.q, -dir, step * (mp ? 0.5 : 1))
    }
  }
  fit()
  return { boxes, thick }
}
