import type { BoxConfig, Part } from '../src/types'
import { engineGapOf } from './moldGap'
export { ENGINE_GAP_RULE, engineGapOf } from './moldGap'

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
  /**
   * 자소 묶음마다 출발 굵기(없으면 `base`). 쌓인 획 법칙(`stackLay`)이 칸을 먼저 놓은 묶음은 그 굵기에서 출발한다 — 그 굵기가 바닥이고,
   * 짝 · 틈 목표도 그 굵기의 잉크로 잰다. 기둥에 안 걸린 묶음(「밤」 받침 ㅁ 세로)은 처음 굵기에서 풍선이 그대로 푼다.
   */
  start?: Partial<Record<BalloonGroup, Thick>>
  /** 글자 잉크 폭이 바깥으로 넓어지는 양(세로줄기가 굵어진 em 1당, 왼끝 · 오른끝). 거북이 넓어짐 공식 1절. 없으면 안 넓어진다. */
  outer?: { left: number; right: number }
}
export interface BalloonResult {
  boxes: Partial<Record<Part, BoxConfig>>
  thick: Record<BalloonGroup, Thick>
}

// 꽉 찬 끝의 흰 틈 바닥(자소 안 · 사이 · 막힌 속)은 하나 — `moldGap.ts` ENGINE_GAP_RULE. 예전 사이 0.05em · 안 0.03em · 막힌 속 처음의 0.27배를 합쳤다.
/** 세로줄기가 1 굵어질 때 흰 틈이 줄어드는 양. 받침 위는 덜 준다(받침이 밀려 내려가서). */
export const BALLOON_SLOPE = { inside: 0.5, between: 0.67, final: 0.33 } as const
/** 한 글자 안에서 자소끼리 굵기가 이보다 갈리지 않는다(10-01 눈 ② "획 두께 차이가 커서 안 예쁨" · 바닥 0.8과 같은 뜻). */
export const BALLOON_BAND = 0.8
/** 자소 뼈대(중심선 너비 · 키)는 처음의 이 비율 아래로 안 줄어든다 — ㄱ이 덩어리가 되지 않게. */
const SKELETON_MIN = 0.4
/** 처음부터 이보다 가까운 획 쌍(두께 대비)은 붙여 그린 것 — 지키지 않는다(엔진 `counterKeep`의 MIN_GAP_RATIO). */
const JOINED_RATIO = 0.25
const PARALLEL_COS = Math.cos(20 / 180 * Math.PI)
const ROUNDS = 24
/** 판 사이 굵기 · 칸 변화가 이보다 작으면 다 푼 것으로 본다. */
const CONVERGED = 1e-4
const EPS = 1e-6

interface Seg { stroke: number; at: number; part: Part; group: BalloonGroup; t: number; ax: number; ay: number; bx: number; by: number; /** 길이(만들 때 한 번 잰다 — 판마다 거듭 재던 것이 시간의 14%, 거북이 2026-11-22). */ len: number }
interface Pt { x: number; y: number }

/** 처음 칸 기준의 정규 좌표(칸이 바뀌면 같은 비율 자리로 간다). 너비 0인 칸은 가운데. */
function normalized(strokes: readonly BalloonStroke[], boxes: Partial<Record<Part, BoxConfig>>): Pt[][] {
  return strokes.map((stroke) => {
    const box = boxes[stroke.part]
    if (!box) return stroke.points.map((p) => ({ ...p }))
    return stroke.points.map((p) => ({ x: box.width > EPS ? (p.x - box.x) / box.width : 0.5, y: box.height > EPS ? (p.y - box.y) / box.height : 0.5 }))
  })
}
/**
 * 열린 끝을 늘일 길이(em). 가로가 세로보다 덜 굵어지면(대비) 가로획의 열린 끝이 세로줄기 바깥선보다 안으로 들어간다 —
 * 「른」의 ㄹ에서 윗 가로줄기 왼끝과 아래 세로줄기 바깥선이 어긋났다(하니무스 2026-11-21). 그 차이만큼 끝을 늘인다(처음 굵기 대비).
 * 세로획은 거꾸로(가로가 더 굵어지면). 사선 · 곡선 끝은 그대로.
 */
export function endReachOf(points: readonly Pt[], thickness: number, thick: Thick, base: Thick): { start: number; end: number } {
  const reachAt = (a: Pt, b: Pt) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l < EPS) return 0
    const u = ((b.y - a.y) / l) ** 2, gainV = thick.v - base.v, gainH = thick.h - base.h
    if (u < 0.15) return Math.max(0, thickness / 2 * (gainV - gainH))
    if (u > 0.85) return Math.max(0, thickness / 2 * (gainH - gainV))
    return 0
  }
  if (points.length < 2) return { start: 0, end: 0 }
  return { start: reachAt(points[0], points[1]), end: reachAt(points[points.length - 2], points[points.length - 1]) }
}
const stretched = (points: Pt[], reach: { start: number; end: number }): Pt[] => {
  if (points.length < 2 || (reach.start < EPS && reach.end < EPS)) return points
  const out = points.map((p) => ({ ...p }))
  const push = (at: number, from: number, by: number) => {
    const l = Math.hypot(out[at].x - out[from].x, out[at].y - out[from].y)
    if (l < EPS || by < EPS) return
    out[at] = { x: out[at].x + (out[at].x - out[from].x) / l * by, y: out[at].y + (out[at].y - out[from].y) / l * by }
  }
  push(0, 1, reach.start); push(out.length - 1, out.length - 2, reach.end)
  return out
}

function segmentsOf(strokes: readonly BalloonStroke[], unit: Pt[][], boxes: Partial<Record<Part, BoxConfig>>, ends?: { thick: Record<BalloonGroup, Thick>; base: Thick }): Seg[] {
  const out: Seg[] = []
  strokes.forEach((stroke, index) => {
    const box = boxes[stroke.part]
    let points = unit[index].map((p) => (box ? { x: box.x + p.x * box.width, y: box.y + p.y * box.height } : p))
    if (ends && !stroke.closed) points = stretched(points, endReachOf(points, stroke.thickness, ends.thick[balloonGroupOf(stroke.part)], ends.base))
    const count = stroke.closed ? points.length : points.length - 1
    for (let at = 0; at < count; at++) {
      const a = points[at], b = points[(at + 1) % points.length]
      out.push({ stroke: index, at, part: stroke.part, group: balloonGroupOf(stroke.part), t: stroke.thickness, ax: a.x, ay: a.y, bx: b.x, by: b.y, len: Math.hypot(b.x - a.x, b.y - a.y) })
    }
  })
  return out
}
const lengthOf = (s: Seg) => s.len
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
/** 두 토막 사이 가장 가까운 두 점. 가로지르면 거리 0. 판마다 수천 번 불려 객체를 덜 만든다(쓰레기 치우기 8.5%, 거북이 2026-11-22). */
function nearest(p: Seg, q: Seg): { d: number; p: Pt; q: Pt } {
  const d1 = cross(p.ax, p.ay, p.bx, p.by, q.ax, q.ay), d2 = cross(p.ax, p.ay, p.bx, p.by, q.bx, q.by)
  const d3 = cross(q.ax, q.ay, q.bx, q.by, p.ax, p.ay), d4 = cross(q.ax, q.ay, q.bx, q.by, p.bx, p.by)
  if (d1 * d2 < 0 && d3 * d4 < 0) { const k = d3 / (d3 - d4); const at = { x: p.ax + k * (p.bx - p.ax), y: p.ay + k * (p.by - p.ay) }; return { d: 0, p: at, q: at } }
  // 네 끝점에서 맞은편 토막까지. 가장 가까운 것 하나만 남긴다(모듈 칸 하나에 적어 객체 · 함수를 안 만든다).
  NEAR.d = Infinity
  endToSeg(p.ax, p.ay, q, true); endToSeg(p.bx, p.by, q, true); endToSeg(q.ax, q.ay, p, false); endToSeg(q.bx, q.by, p, false)
  const { d, fx, fy, tx, ty } = NEAR
  return NEAR.onQ ? { d, p: { x: fx, y: fy }, q: { x: tx, y: ty } } : { d, p: { x: tx, y: ty }, q: { x: fx, y: fy } }
}
const NEAR = { d: Infinity, fx: 0, fy: 0, tx: 0, ty: 0, onQ: true }
function endToSeg(px: number, py: number, s: Seg, toQ: boolean): void {
  const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy
  const k = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2))
  const x = s.ax + k * dx, y = s.ay + k * dy, d = Math.hypot(px - x, py - y)
  if (d < NEAR.d) { NEAR.d = d; NEAR.fx = px; NEAR.fy = py; NEAR.tx = x; NEAR.ty = y; NEAR.onQ = toQ }
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

interface InsidePair { i: number; j: number; target: number; ring?: boolean; closed?: boolean }
/** 꼭지 · 곁줄기처럼 다른 획 옆면에 끝이 붙은 짧은 획. 붙은 획이 굵어져도 보이는 길이가 처음의 반은 남는다. */
interface Stub { on: number; stroke: number; keep: number; free: 0 | 1; /** 처음 보이던 길이(묻힌 몫 뺀). */ visible: number }
/** 붙은 짧은 획이 남길 보이는 길이(처음 대비). */
const STUB_KEEP = 0.5
/** 폰트 128벌 곁줄기ㅏ(기둥 밖으로 나온 길이 ÷ 제 두께) 5번째 백분위(mold-fit/dist.json). `moldLab` 곁줄기 길이 바닥과 같은 값. */
const BRANCH_FLOOR = 0.754
/** 꼭지가 보 위로 보이는 길이의 바닥(제 굵기 배). 노토 산스 KR 700 「하」 「치」 꼭지가 굵기의 0.6~1배쯤 보인다(같은 크기 나란히 그림). */
const TICK_KEEP = 0.5
/**
 * 꺾인 획의 열린 팔(ㄱ · ㄲ 윗 가로, ㄴ 세로): 꺾인 기둥 밖으로 보이는 길이 ≥ 기둥 굵기 × 이 값. 처음부터 더 짧은 팔은 처음 비율을 지킨다.
 * 거북이 2026-11-22 열린-팔.md(고딕 · 제목체 103벌): 쌍닿자는 고딕 900에서 0.85 ~ 0.96, 가장 작은 값 0.83. 홑닿자 끝은 가석원 0.78.
 * 그래서 0.85, 세로줄기 0.15em 너머(굵기 끝)에서 0.19em까지 0.78로 내린다. 폰트도 팔을 지키려 기둥을 가늘게 한다(「깨」 ㄱ 기둥 0.84배).
 */
const ARM_KEEP = { least: 0.85, end: 0.78, from: 0.15, to: 0.19 } as const
const armKeepAt = (stem: number) => ARM_KEEP.least - (ARM_KEEP.least - ARM_KEEP.end) * Math.max(0, Math.min(1, (stem - ARM_KEEP.from) / (ARM_KEEP.to - ARM_KEEP.from)))
interface Arm { leg: number; perp: number; keep: number }
/** 붙은 짧은 획을 살리려고 이웃 자소 칸을 비켜 세울 때, 처음 칸의 이만큼은 남긴다. */
const NEIGHBOR_KEEP = 0.82
/** ㅇ 속 흰 틈은 처음의 이만큼 아래로 안 줄인다. */
/** 자소 안 열린 틈의 바닥(거북이 넓어짐 공식 2절): max(least em, ratio × 세로줄기). */
/** 틈이 출발 굵기 바닥을 이길 때도 처음 굵기의 이 배 아래로는 안 간다(획이 사라지지 않게). */
const GAP_WINS_FLOOR = 0.6
/** 자소 사이 경계를 한 판에 옮기는 양(굵기 모자람 차이 1당 em). */
const SHARE_STEP = 0.006
/** 한 자소 안 가로÷세로가 바라는 비의 이만큼 아래로 안 간다. */
const CONTRAST_KEEP = 0.72
/** 가장 가는 획 ÷ 바라는 굵기의 바닥: 노토 산스 KR 900 600자, 가장 가는 세로 · 가로줄기 ÷ 「이」 기둥 · 「으」 보 p5(세로 0.69 · 가로 0.68). 좁은 칸 예산(`moldBudget`) · 글줄 굵기 멈춤(`MoldLabPage`)이 쓴다. */
export const THIN_FLOOR = 0.69
/** 한 글자 안 가장 가는 가로 ÷ 세로 기둥의 바닥. 노토 산스 KR 900 600자에서 글자 안 가는 ÷ 굵은 p5 0.78(좁은 칸 같은 결 고르기 EVEN과 같은 값). */
const GLYPH_EVEN = 0.78
interface BetweenPair { i: number; j: number }
interface PartPair { a: Part; b: Part; target: number; pairs: BetweenPair[] }

/** 한 점이 다른 자소 잉크에 묻힌 깊이(가장 깊은 것)와 그 토막. */
function coveredAt(at: Pt, segs: readonly Seg[], own: BalloonGroup, thickOf: (g: BalloonGroup) => Thick): { depth: number; seg: number } {
  let best = { depth: 0, seg: -1 }
  segs.forEach((seg, index) => {
    if (seg.group === own || lengthOf(seg) < EPS) return
    const depth = halfOf(seg, thickOf(seg.group)) - pointToSeg(at.x, at.y, seg).d
    if (depth > best.depth) best = { depth, seg: index }
  })
  return best
}

/**
 * 지킬 틈을 처음 모양에서 고른다(엔진 `counterGapFilter`와 같은 거름망).
 * 자소 안: 나란한 두 토막, 처음부터 붙지 않은 것, 한 획 굽은 길의 이웃 · 이음 자리 쐐기는 뺀다.
 * 자소 사이: 모든 토막 쌍(끝이 옆면을 보는 것도) 가운데 가까운 것들.
 */
function pickPairs(segs: Seg[], strokes: readonly BalloonStroke[], startOf: Record<BalloonGroup, Thick>, delta: number, stemNow: number): { inside: InsidePair[]; between: PartPair[]; stubs: Stub[]; arms: Arm[] } {
  const inside: InsidePair[] = []
  const stubs: Stub[] = []
  const arms: Arm[] = []
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
    if (near.d > halfOf(p, startOf[p.group]) + halfOf(q, startOf[q.group])) continue
    const key = `${p.stroke}:${q.stroke}`
    if ((joints.get(key)?.d ?? Infinity) <= near.d) continue
    joints.set(key, { x: (near.p.x + near.q.x) / 2, y: (near.p.y + near.q.y) / 2, d: near.d })
  }
  // 닫힌 속(ㅍ · ㅂ 두 기둥과 두 보가 두른 칸): 두 획에 함께 닿은 획이 둘 이상이면 그 사이는 막힌 속이다(ㅐ 두 기둥은 다리 하나라 열린 속).
  const touch = new Set<string>()
  for (const key of joints.keys()) { const [a, b] = key.split(':'); touch.add(`${a}:${b}`); touch.add(`${b}:${a}`) }
  const enclosed = (a: number, b: number) => !touch.has(`${a}:${b}`) && strokes.reduce((count, _, r) => (r !== a && r !== b && touch.has(`${r}:${a}`) && touch.has(`${r}:${b}`) ? count + 1 : count), 0) >= 2
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]
    if (lengthOf(p) < EPS || lengthOf(q) < EPS) continue
    if (p.group === q.group) {
      const near = nearest(p, q)
      // 틈은 잇는 방향으로 내미는 두께로 잰다 — 나란한 옆면끼리(ㅐ 두 기둥)도, 끝이 옆면을 보는 것(ㄲ 둘째 ㄱ 가로 끝 ↔ 첫 ㄱ 세로)도.
      // 끝끼리 마주 본 것(한 줄 위 두 가로 끝)은 굵기로 안 좁아지니 빠진다.
      const g0 = gapBetween(p, q, startOf[p.group], startOf[q.group])
      if (near.d < EPS || g0.reachP + g0.reachQ < EPS) continue
      const gap = g0.gap
      if (gap <= JOINED_RATIO * Math.min(p.t, q.t)) continue
      if (!parallel(p, q) && p.stroke === q.stroke && !strokes[p.stroke].closed) continue
      if (p.stroke === q.stroke && !facing(p, q)) {
        const closed = strokes[p.stroke].closed
        const kp = Math.hypot(near.p.x - p.ax, near.p.y - p.ay), kq = Math.hypot(near.q.x - q.ax, near.q.y - q.ay)
        const forward = Math.abs(startAt[i] + kp - startAt[j] - kq)
        const along = closed ? Math.min(forward, (total.get(p.stroke) ?? 0) - forward) : forward
        if (near.d >= 0.5 * along) continue
      }
      const joint = p.stroke === q.stroke ? undefined : joints.get(`${p.stroke}:${q.stroke}`)
      // 두 획이 같은 획에 매달려 그 옆에서 가장 가까우면(ㅊ의 ㅅ 두 다리가 보 밑에서 갈라짐) 그 쐐기는 틈이 아니다 — 굵어지면 메워진다.
      if (p.stroke !== q.stroke && !parallel(p, q)) {
        const mid = { x: (near.p.x + near.q.x) / 2, y: (near.p.y + near.q.y) / 2 }
        const hung = strokes.some((_, r) => r !== p.stroke && r !== q.stroke && touch.has(`${r}:${p.stroke}`) && touch.has(`${r}:${q.stroke}`)
          && segs.some((seg) => seg.stroke === r && pointToSeg(mid.x, mid.y, seg).d <= halfOf(seg, startOf[seg.group]) + Math.max(p.t, q.t)))
        if (hung) continue
      }
      // 서로 이어진 두 획(ㅊ의 ㅅ 두 다리가 한 점에서 갈라짐)은 마주 보지 않는 한 그 사이가 쐐기다 — 굵어지면 메워진다.
      if (joint && !facing(p, q)) continue
      // 이어진 두 획이 나란하지 않으면(ㅅ 두 다리) 이음에서 멀어질수록 벌어진다 — 이음 옆 쐐기는 틈이 아니다.
      if (joint && !parallel(p, q)) continue
      if (joint && !facing(p, q) && near.d >= 0.5 * (Math.hypot(near.p.x - joint.x, near.p.y - joint.y) + Math.hypot(near.q.x - joint.x, near.q.y - joint.y))) continue
      inside.push({ i, j, target: gap, ring: p.stroke === q.stroke ? !!strokes[p.stroke].closed : enclosed(p.stroke, q.stroke), closed: p.stroke === q.stroke && !!strokes[p.stroke].closed })
    } else {
      const { gap } = gapBetween(p, q, startOf[p.group], startOf[q.group])
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
    const found: Stub[] = []
    for (const [end, seg, which] of [[{ x: own[0].ax, y: own[0].ay }, own[0], 0], [{ x: own[own.length - 1].bx, y: own[own.length - 1].by }, own[own.length - 1], 1]] as const) {
      let best: { on: number; d: number } | null = null
      segs.forEach((other, at) => {
        if (other.stroke === index || other.group !== seg.group || lengthOf(other) < EPS) return
        const d = pointToSeg(end.x, end.y, other).d
        if (d > halfOf(other, startOf[other.group]) + 1e-3 || (best && d >= best.d)) return
        // 옆면에 붙어야 한다 — 다른 획의 끝과 만나는 것(ㅈ · ㅅ 두 다리, ㄱ 꺾임)은 이음이지 꼭지가 아니다.
        const strokeOf = segs.filter((seg2) => seg2.stroke === other.stroke)
        const head = strokeOf[0], tail = strokeOf[strokeOf.length - 1]
        const nearEnd = Math.min(Math.hypot(end.x - head.ax, end.y - head.ay), Math.hypot(end.x - tail.bx, end.y - tail.by))
        if (!strokes[other.stroke].closed && nearEnd <= halfOf(other, startOf[other.group]) + halfOf(seg, startOf[seg.group]) + 1e-3) return
        best = { on: at, d }
      })
      if (!best) continue
      const other = segs[(best as { on: number }).on]
      if (parallel(seg, other)) continue
      const dx = (seg.bx - seg.ax) / lengthOf(seg), dy = (seg.by - seg.ay) / lengthOf(seg)
      const visible0 = length - reachOf(other, dx, dy, startOf[other.group])
      if (visible0 <= 0) continue
      // 반대 끝이 다른 자소 잉크에 묻힌 몫(「풍」 짧은기둥 끝이 ㅇ에 닿음)은 처음부터 안 보이던 길이다.
      const freeEnd = which === 0 ? { x: own[own.length - 1].bx, y: own[own.length - 1].by } : { x: own[0].ax, y: own[0].ay }
      const covered0 = coveredAt(freeEnd, segs, seg.group, (group) => startOf[group])
      found.push({ on: (best as { on: number }).on, stroke: index, keep: STUB_KEEP * Math.max(0, visible0 - covered0.depth), visible: Math.max(0, visible0 - covered0.depth), free: which === 0 ? 1 : 0 })
    }
    // 두 끝이 다 붙은 획(ㅐ 두 기둥 사이 가로획)은 꼭지가 아니라 다리다 — 두 기둥 사이 틈은 자소 안 틈이 맡는다.
    // 꼭지로 보면 보이는 길이 반을 지키려 기둥 굵기를 눌러 「깨」 기둥이 유난히 가늘었다.
    if (found.length === 1) stubs.push(found[0])
  }
  // 자소 안 목표는 그 자소의 가장 좁은 틈에서 잰다. 사이에 획이 낀 먼 쌍(ㅌ 첫 · 셋째 가로줄기)이 제 넓은 틈을 지키려 들면 가까운 쌍보다 먼저 막는다.
  // 자소 안 틈은 바닥까지 내준다 — 획 굵기를 먼저 지키고 흰 틈으로 버틴다(하니무스 2026-11-21 「깨」: "패딩을 최소한까지 밀어붙이더라도 획 두께는 유지").
  // 틈은 굵기가 실제로 그만큼 필요할 때만 준다(예산이 남으면 처음 틈 그대로). 처음부터 바닥보다 좁은 틈은 그대로 지킨다.
  // 막힌 속은 굵어진 만큼 줄어든다: ㅇ 고리 처음 − 1.0 × Δt, ㅁ · ㅍ처럼 네 획이 두른 칸 처음 − 1.24 × Δt, 바닥 0.03em(거북이 넓어짐 공식 4절).
  // 열린 틈은 여기서 처음 틈만 적어 두고, 바닥은 굵기에 따라 푼다(세로줄기 예산 g = max(0.025, 0.2 × 줄기), 2절).
  // 굵기 줄 끝(검은고딕)에서 막힌 속은 처음의 0.27배가 남는다(거북이 넓어짐 공식 표: 노토 900 0.63 · 주아 0.59 · 검은고딕 0.27). 그 아래로는 안 줄인다 —
  // 바닥 0.03em만 두면 「풍」 ㅍ 속이 굵기 100에서 실금이 됐다(다람쥐 재검수 3번).
  for (const pair of inside) if (pair.ring) pair.target = Math.min(pair.target, Math.max(engineGapOf(stemNow), pair.target - (pair.closed ? 1.0 : 1.24) * delta))
  const between: PartPair[] = []
  for (const { a, b, list } of byParts.values()) {
    const least = Math.min(...list.map((item) => item.gap))
    // 처음부터 닿은 자소 쌍은 그렇게 그린 것 — 손대지 않는다.
    if (least <= 0.005) continue
    const slope = balloonGroupOf(a) === 'JO' || balloonGroupOf(b) === 'JO' ? BALLOON_SLOPE.final : BALLOON_SLOPE.between
    const target = Math.min(least, Math.max(engineGapOf(stemNow), least - slope * delta))
    // 가까운 쌍만 본다(칸이 움직이며 순서가 바뀔 수 있어 넉넉히).
    between.push({ a, b, target, pairs: list.filter((item) => item.gap <= least + 0.15).sort((x, y) => x.gap - y.gap).slice(0, 16).map(({ i, j }) => ({ i, j })) })
  }
  // 열린 팔: 획 첫 · 끝 토막이 다음 토막과 꺾여 있고(거의 수직), 그 끝이 다른 획에 안 붙은 것.
  strokes.forEach((stroke, index) => {
    if (stroke.closed) return
    const own = segs.map((seg, at) => ({ seg, at })).filter(({ seg }) => seg.stroke === index)
    if (own.length < 2) return
    for (const [leg, perp, end] of [[own[0], own[1], { x: own[0].seg.ax, y: own[0].seg.ay }], [own[own.length - 1], own[own.length - 2], { x: own[own.length - 1].seg.bx, y: own[own.length - 1].seg.by }]] as const) {
      const ll = lengthOf(leg.seg), lp = lengthOf(perp.seg)
      if (ll < EPS || lp < EPS) continue
      const cos = Math.abs(((leg.seg.bx - leg.seg.ax) * (perp.seg.bx - perp.seg.ax) + (leg.seg.by - leg.seg.ay) * (perp.seg.by - perp.seg.ay)) / ll / lp)
      if (cos > 0.3) continue
      if (segs.some((other) => other.stroke !== index && other.group === leg.seg.group && pointToSeg(end.x, end.y, other).d <= halfOf(other, startOf[other.group]) + 1e-3)) continue
      const half0 = halfOf(perp.seg, startOf[perp.seg.group])
      if (half0 < EPS) continue
      arms.push({ leg: leg.at, perp: perp.at, keep: Math.max(0, (ll - half0) / (2 * half0)) })
    }
  })
  return { inside, between, stubs, arms }
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

/** 모서리만 겹친 쌍(이 축으로 마주 봤지만 다른 축으로는 끝만 조금 겹침)이면 다른 축과 방향. */
const CORNER_OVERLAP = 0.25
function cornerSide(p: Seg, q: Seg, axis: 'x' | 'y'): { axis: 'x' | 'y'; dir: number } | null {
  const other = axis === 'x' ? 'y' : 'x'
  const lo = (s: Seg) => Math.min(s[`a${other}`], s[`b${other}`]), hi = (s: Seg) => Math.max(s[`a${other}`], s[`b${other}`])
  const sp = hi(p) - lo(p), sq = hi(q) - lo(q)
  if (sp < 0.01 || sq < 0.01) return null
  const overlap = Math.min(hi(p), hi(q)) - Math.max(lo(p), lo(q))
  if (overlap >= CORNER_OVERLAP * Math.min(sp, sq)) return null
  const dir = Math.sign((lo(q) + hi(q)) - (lo(p) + hi(p)))
  return dir ? { axis: other, dir } : null
}

export function solveBalloon(input: BalloonInput): BalloonResult {
  const { strokes, base, want } = input
  const groups: BalloonGroup[] = ['CH', 'JU', 'JO']
  const start = Object.fromEntries(groups.map((g) => [g, { ...(input.start?.[g] ?? base) }])) as Record<BalloonGroup, Thick>
  if (groups.every((g) => !(want.v > start[g].v + EPS) && !(want.h > start[g].h + EPS))) return { boxes: input.boxes, thick: Object.fromEntries(groups.map((g) => [g, { ...want }])) as Record<BalloonGroup, Thick> }
  const unit = normalized(strokes, input.boxes)
  const first = segmentsOf(strokes, unit, input.boxes)
  const median = [...strokes].map((s) => s.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)] ?? 0.07
  const delta = median * Math.max(0, want.v - base.v)
  const { inside, between, stubs, arms } = pickPairs(first, strokes, start, delta, median * want.v)
  const parts = [...new Set(strokes.map((s) => s.part))]
  // 칸 = 처음 굵기의 잉크 칸. 자소 사이 틈에 따라 변이 움직인다.
  const cells = new Map<Part, Cell>(), firstCenter = new Map<Part, Cell>()
  const firstCell = new Map<Part, Cell>()
  for (const part of parts) { const e = extents(first, part, start[balloonGroupOf(part)]); if (e) { cells.set(part, { ...e.ink }); firstCell.set(part, { ...e.ink }); firstCenter.set(part, e.center) } }
  // 글자 폭이 넓어진다(밖 1/4 · 속 3/4, 거북이 넓어짐 공식 1절): 가장 왼쪽 · 오른쪽 자소의 바깥 변만 Δt × 계수만큼. 글자 칸(0~1) 밖으로는 안 나간다.
  if (input.outer && cells.size) {
    const all = [...cells.values()]
    const minX = Math.min(...all.map((c) => c.x0)), maxX = Math.max(...all.map((c) => c.x1))
    for (const cell of all) {
      if (cell.x0 <= minX + 0.02) cell.x0 = Math.max(0, cell.x0 - input.outer.left * delta)
      if (cell.x1 >= maxX - 0.02) cell.x1 = Math.min(1, cell.x1 + input.outer.right * delta)
    }
  }
  const thick = Object.fromEntries(groups.map((g) => [g, { ...want }])) as Record<BalloonGroup, Thick>
  // 쌓인 획 법칙이 걸린 결(출발 굵기가 처음보다 굵음)은 그 굵기에서 더 안 굵어진다 — 칸이 그 굵기로 나뉘었다(틈을 다시 먹으면 「뿐」 ㅃ 틈이 실금).
  const cap = Object.fromEntries(groups.map((g) => [g, { v: input.start?.[g] && input.start[g].v > base.v + EPS ? input.start[g].v : Infinity, h: input.start?.[g] && input.start[g].h > base.h + EPS ? input.start[g].h : Infinity }])) as Record<BalloonGroup, Thick>
  let boxes: Partial<Record<Part, BoxConfig>> = { ...input.boxes }

  /** 3. 안으로: 지금 굵기의 잉크가 칸에 꼭 맞게 중심선 칸을 놓는다. 뼈대가 너무 줄면 그 축 굵기를 누른다. */
  const fit = () => {
    for (let pass = 0; pass < 2; pass++) {
      const segs = segmentsOf(strokes, unit, boxes, { thick, base })
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

  // 굵기 · 칸이 더 안 움직이면 멈춘다(24판을 다 돌던 것, 거북이 2026-11-22 느려진 곳 3번). 판마다 굵기는 반씩 다가가니 1e-4 아래면 화면에서 안 보인다.
  const snapshot = () => [...groups.flatMap((g) => [thick[g].v, thick[g].h]), ...[...cells.values()].flatMap((c) => [c.x0, c.x1, c.y0, c.y1])]
  for (let round = 0; round < ROUNDS; round++) {
    const before = snapshot()
    fit()
    const segs = segmentsOf(strokes, unit, boxes, { thick, base })
    // 2. 예산: 자소 안 나란한 획 사이 틈이 목표를 지키는 가장 굵은 값. 칸이 바뀌면 다시 푼다(바라는 값에서 출발).
    const sol = Object.fromEntries(groups.map((g) => [g, { v: Math.min(want.v, cap[g].v), h: Math.min(want.h, cap[g].h) }])) as Record<BalloonGroup, Thick>
    for (const pair of inside) {
      const p = segs[pair.i], q = segs[pair.j], g = p.group, now = thick[g]
      const gp = gapBetween(p, q, now, now)
      if (gp.d < EPS) continue
      // 잇는 방향으로 내미는 몫(옆면이면 반 두께, 끝이면 0)의 가로 · 세로 계수.
      const k = (s: Seg) => { const l = lengthOf(s); return l > EPS ? Math.abs(gp.nx * (s.by - s.ay) / l - gp.ny * (s.bx - s.ax) / l) : 0 }
      const sp = sharesOf(p), sq = sharesOf(q), kp = k(p), kq = k(q)
      const d = gp.d, a = sp.a * kp + sq.a * kq, b = sp.b * kp + sq.b * kq
      if (a + b < EPS) continue
      // 열린 틈의 바닥은 줄기 굵기를 따른다: max(0.025em, 0.2 × 줄기). 처음 틈이 그보다 좁으면 처음 틈.
      const floor = pair.ring ? pair.target : Math.min(pair.target, engineGapOf(median * now.v))
      const room = d - floor
      const lean = b / (a + b)
      if (lean < 0.3) sol[g].h = Math.min(sol[g].h, (room - b * now.v) / Math.max(a, EPS))
      else if (lean > 0.7) sol[g].v = Math.min(sol[g].v, (room - a * now.h) / Math.max(b, EPS))
      else { const f = room / Math.max(a * now.h + b * now.v, EPS); sol[g].h = Math.min(sol[g].h, now.h * f); sol[g].v = Math.min(sol[g].v, now.v * f) }
    }
    // 틈이 허락하는 굵기(자소 안 틈만 본 값). 아래 출발 굵기 바닥보다 앞선다 — 획 사이 틈은 엔진 어디서든 `ENGINE_GAP` 아래로 안 간다(하니무스 2026-11-22 "획과 획 사이가 붙는 것은 막아야").
    const gapLimit = Object.fromEntries(groups.map((g) => [g, { ...sol[g] }])) as Record<BalloonGroup, Thick>
    // 붙은 짧은 획: 붙은 획의 반 두께가 그 획 길이를 다 먹지 않게(곁줄기 · 꼭지가 사라지지 않게).
    // 열린 팔: 기둥 반 두께 ≤ 팔 길이 ÷ (1 + 2 × 지킬 비).
    for (const arm of arms) {
      const leg = segs[arm.leg], perp = segs[arm.perp], g = perp.group
      const keep = Math.min(arm.keep, armKeepAt(median * want.v))
      const most = lengthOf(leg) / (1 + 2 * keep)
      const { a, b } = sharesOf(perp), lean = b / Math.max(a + b, EPS)
      if (lean > 0.7) sol[g].v = Math.min(sol[g].v, (most - a * thick[g].h) / Math.max(b, EPS))
      else if (lean < 0.3) sol[g].h = Math.min(sol[g].h, (most - b * thick[g].v) / Math.max(a, EPS))
    }
    for (const stub of stubs) {
      const o = segs[stub.on], g = o.group
      // 지금 길이로 잰다 — 뼈대가 줄면(굵어진 보에 밀려) 짧은기둥도 같이 줄어, 처음 길이로 재면 「풍」「숲」 짧은기둥이 묻혔다.
      const own = segs.filter((seg) => seg.stroke === stub.stroke)
      const now = own.reduce((sum, seg) => sum + lengthOf(seg), 0)
      // 반대 끝이 이웃 자소 잉크에 묻히면 그 몫도 뺀다. 모자라면 이웃 칸을 먼저 비켜 세운다(받침 ㅇ이 조금 작아진다) — 보 굵기는 그다음.
      const freeEnd = stub.free === 1 ? { x: own[own.length - 1].bx, y: own[own.length - 1].by } : { x: own[0].ax, y: own[0].ay }
      const cover = coveredAt(freeEnd, segs, g, (group) => thick[group])
      // 바닥: 기둥 잉크 밖으로 나온 길이가 제 두께의 0.754배(폰트 128벌 곁줄기ㅏ 5번째 백분위 — 곁줄기 길이 줄과 같은 값).
      // 처음 보이던 길이의 반만 지키면 굵기 끝에서 「향」 ㅑ 곁줄기가 기둥에 묻혀 점이 됐다(다람쥐 재검수 3번).
      const stubWidth = 2 * halfOf(own[stub.free === 1 ? own.length - 1 : 0], thick[g])
      // 꼭지(보 위로 선 세로 토막, ㅎ · ㅊ): 보 굵기를 먼저 지키고 꼭지는 제 굵기의 TICK_KEEP배만 보이면 된다 — 곁줄기 바닥(0.754배)을 쓰면
      // 「하」 ㅎ 보가 기둥의 0.78배까지 눌리고, 글자 안 고르기로 기둥까지 가늘어졌다(하니무스 2026-11-22 노토 700 나란히: 하 · 는 가로 가늘음).
      const tick = uprightOf(own[0]) > 0.7 && freeEnd.y < Math.min(o.ay, o.by)
      const keep = tick ? Math.min(stub.keep, TICK_KEEP * stubWidth) : Math.max(stub.keep, Math.min(stub.visible, BRANCH_FLOOR * stubWidth))
      const short = keep - (now - halfOf(o, thick[g]) - cover.depth)
      let depth = cover.depth
      if (short > 5e-4 && cover.seg >= 0) {
        const nbr = segs[cover.seg], cell = cells.get(nbr.part), first0 = firstCell.get(nbr.part)
        const tail = stub.free === 1 ? own[own.length - 1] : own[0]
        const dx = stub.free === 1 ? tail.bx - tail.ax : tail.ax - tail.bx, dy = stub.free === 1 ? tail.by - tail.ay : tail.ay - tail.by
        if (cell && first0) {
          const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y', lo = axis === 'x' ? 'x0' : 'y0', hi = axis === 'x' ? 'x1' : 'y1'
          const least = NEIGHBOR_KEEP * (first0[hi] - first0[lo])
          const step = Math.min(0.5 * short, Math.max(0, cell[hi] - cell[lo] - least))
          if ((axis === 'x' ? dx : dy) > 0) cell[lo] += step; else cell[hi] -= step
          depth = Math.max(0, depth - step)
        }
      }
      const { a, b } = sharesOf(o), room = now - keep - depth, lean = b / Math.max(a + b, EPS)
      if (lean > 0.7) sol[g].v = Math.min(sol[g].v, (room - a * thick[g].h) / Math.max(b, EPS))
      else if (lean < 0.3) sol[g].h = Math.min(sol[g].h, (room - b * thick[g].v) / Math.max(a, EPS))
      else { const f = room / Math.max(a * thick[g].h + b * thick[g].v, EPS); sol[g].h = Math.min(sol[g].h, thick[g].h * f); sol[g].v = Math.min(sol[g].v, thick[g].v * f) }
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
    // 출발 굵기가 바닥이되, 틈이 바닥 아래로 가야만 지킬 수 있으면 틈이 이긴다(처음 굵기의 GAP_WINS_FLOOR배까지).
    for (const g of present) for (const axis of ['v', 'h'] as const) sol[g][axis] = Math.max(Math.min(start[g][axis], Math.max(GAP_WINS_FLOOR * base[axis], gapLimit[g][axis])), sol[g][axis])
    // 한 자소 안 가로 · 세로 고르기: 가로가 예산에 막혀 얇아지면 세로도 같이 덜 굵어진다(「향」 ㅎ 가로만 가늘어 고르지 않음).
    // 폰트도 획 많은 글자는 가로÷세로가 조금 준다(「를」 0.71 → 0.65) — 바라는 비의 CONTRAST_KEEP까지만 벌어진다.
    for (const g of present) {
      const ratio = want.h / Math.max(want.v, EPS)
      sol[g].v = Math.min(sol[g].v, Math.max(start[g].v, sol[g].h / (CONTRAST_KEEP * ratio)))
      sol[g].h = Math.min(sol[g].h, Math.max(start[g].h, sol[g].v * ratio / CONTRAST_KEEP))
    }
    // 한 글자 안 굵기 띠.
    const leastV = Math.min(...present.map((g) => sol[g].v)), leastH = Math.min(...present.map((g) => sol[g].h))
    for (const g of present) {
      sol[g].v = Math.min(sol[g].v, leastV / BALLOON_BAND); sol[g].h = Math.min(sol[g].h, leastH / BALLOON_BAND)
      // 글자 안 가로 · 세로 고르기(글자 전체): 가장 가는 가로가 막히면 모든 세로가 그 1 ÷ GLYPH_EVEN배까지만 — 쌓인 획 법칙의 바닥보다 앞선다.
      // 하니무스 2026-11-22 굵기 100 캡처 「절」 「늘」 「습」 「득」: ㄹ · ㅂ · ㅡ 가로가 ㅓ · ㅣ 기둥의 반쯤으로 눈에 띄게 가늘었다.
      // 대비 줄로 일부러 낸 차이(처음 굵기의 가로 ÷ 세로)는 빼고 잰다 — 빼지 않으면 대비를 올려 가늘게 만든 가로가 기둥까지 끌어내려
      // 대비 끝에서 글자 전체가 가는 글씨가 됐다(하니무스 2026-11-22 "ㅇㅇ", 대비는 세로 그대로 가로만).
      sol[g].v = Math.min(sol[g].v, Math.max(base.v, leastH / (GLYPH_EVEN * Math.min(1, base.h / Math.max(base.v, EPS)))))
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
      let axis: 'x' | 'y' = Math.abs(worst.nx) >= Math.abs(worst.ny) ? 'x' : 'y'
      let dir = axis === 'x' ? Math.sign(worst.nx) : Math.sign(worst.ny)
      // 모서리만 겹친 쌍(「저」 ㅈ 머리 가로 끝 위 · ㅓ 곁줄기 끝 아래): 위아래로 떼면 두 자소 키가 다 눌린다(하니무스 2026-11-22 "저 왤케 납작해").
      // 겹친 몫이 짧은 쪽 길이의 CORNER_OVERLAP보다 작으면 옆으로 뗀다 — 겹침만 풀면 되니 조금만 움직인다.
      const side = cornerSide(worst.p, worst.q, axis)
      if (side) { axis = side.axis; dir = side.dir }
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
      if (Math.abs(err) >= 5e-4) {
        if (mp) move(worst.p, dir, step * (mq ? 0.5 : 1))
        if (mq) move(worst.q, -dir, step * (mp ? 0.5 : 1))
      }
      // 나누기: 굵기가 더 모자란 자소 쪽으로 경계를 민다(틈은 그대로). 획이 많은 자소(「향」 ㅎ, 「깨」 ㄲ)가 여유 있는 이웃(받침 ㅇ)한테서 칸을 얻는다.
      // 이웃은 처음 칸의 NEIGHBOR_KEEP 아래로 안 줄어든다.
      if (mp && mq) {
        const need = (s: Seg) => { const t = thick[s.group]; return axis === 'x' ? want.v / Math.max(t.v, EPS) : want.h / Math.max(t.h, EPS) }
        const room = (s: Seg) => { const c = cells.get(s.part), f = firstCell.get(s.part); return c && f ? c[hi] - c[lo] - NEIGHBOR_KEEP * (f[hi] - f[lo]) : 0 }
        const diff = need(worst.p) - need(worst.q)
        if (Math.abs(diff) > 0.02) {
          const giver = diff > 0 ? worst.q : worst.p
          const shift = Math.min(SHARE_STEP * Math.abs(diff), Math.max(0, room(giver)))
          if (shift > 1e-5) {
            // p가 모자라면 p 변을 이웃 쪽으로(dir), q 변도 같은 쪽으로 물린다. 거꾸로면 반대로.
            const sign = diff > 0 ? 1 : -1
            move(worst.p, dir, sign * shift)
            move(worst.q, -dir, -sign * shift)
          }
        }
      }
    }
    const after = snapshot()
    if (round >= 3 && after.every((value, at) => Math.abs(value - before[at]) < CONVERGED)) break
  }
  fit()
  return { boxes, thick }
}
