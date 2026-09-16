import type { BoxConfig, StrokeDataV2, StrokeLinecap, StrokeLinejoin } from '../types'
import { flattenStrokeCenterline } from './brushGeometry'
import type { BrushContour, BrushInkGroup, BrushPoint } from './brushGeometry'

/**
 * 끝이 일자인 획(butt·square 캡, miter·bevel 조인)을 면으로 만든다.
 * 붓 tip을 끌고 가는 방식(brushGeometry)은 끝이 둥글게만 나온다. 여기서는 중심선을
 * 양쪽으로 두께 절반씩 밀어낸 윤곽 하나를 만든다 — 조각을 여럿 겹치면 곡선을 잘게 편
 * 자리마다 가느다란 조각이 생겨 Boolean이 자주 깨진다.
 */

const EPSILON = 1e-12
/** SVG stroke-miterlimit 기본값. 이보다 뾰족하면 bevel로 떨어진다. */
const MITER_LIMIT = 4
const ROUND_VERTICES = 24

function unit(from: BrushPoint, to: BrushPoint): BrushPoint | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  return length <= EPSILON ? null : { x: dx / length, y: dy / length }
}

const normalOf = (dir: BrushPoint): BrushPoint => ({ x: -dir.y, y: dir.x })
const add = (p: BrushPoint, v: BrushPoint, scale: number): BrushPoint => ({ x: p.x + v.x * scale, y: p.y + v.y * scale })

/** 중심 둘레로 from 방향에서 to 방향까지 짧은 쪽으로 도는 호. 양 끝은 뺀다. */
function arc(center: BrushPoint, from: BrushPoint, to: BrushPoint, radius: number, vertices: number): BrushPoint[] {
  const start = Math.atan2(from.y, from.x)
  let sweep = Math.atan2(to.y, to.x) - start
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep < -Math.PI) sweep += Math.PI * 2
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI * 2 / vertices)))
  return Array.from({ length: steps - 1 }, (_, index) => {
    const theta = start + sweep * (index + 1) / steps
    return { x: center.x + Math.cos(theta) * radius, y: center.y + Math.sin(theta) * radius }
  })
}

/**
 * 한쪽(sign) 오프셋 점 열. 꺾임마다 바깥이면 조인 규칙, 안쪽이면 두 오프셋 선의 교점.
 * 열린 선의 양 끝은 캡이 따로 처리하므로 끝점의 수직 오프셋만 둔다.
 */
function offsetSide(points: readonly BrushPoint[], dirs: readonly (BrushPoint | null)[], closed: boolean, half: number, sign: number, join: StrokeLinejoin, vertices: number): BrushPoint[] {
  const count = points.length
  const out: BrushPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const vertex = points[index]
    const incoming = closed || index > 0 ? dirs[(index - 1 + count) % count] : null
    const outgoing = closed || index < count - 1 ? dirs[index % count] : null
    if (!incoming && !outgoing) continue
    if (!incoming || !outgoing) { out.push(add(vertex, normalOf(incoming ?? outgoing!), half * sign)); continue }
    const nA = normalOf(incoming)
    const nB = normalOf(outgoing)
    const a = add(vertex, nA, half * sign)
    const b = add(vertex, nB, half * sign)
    const cosine = nA.x * nB.x + nA.y * nB.y
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x
    // 거의 직진: 두 오프셋 점이 사실상 같다.
    if (Math.abs(cross) <= 1e-9 && cosine > 0) { out.push(a); continue }
    // 바깥쪽 = 오프셋 방향이 꺾이는 쪽의 반대.
    const outer = (nA.x + nB.x) * sign * (outgoing.x - incoming.x) + (nA.y + nB.y) * sign * (outgoing.y - incoming.y) < 0
    const miterable = 1 + cosine > EPSILON
    const miter = miterable ? add(vertex, { x: nA.x + nB.x, y: nA.y + nB.y }, half * sign / (1 + cosine)) : null
    if (!outer) { if (miter) out.push(miter); else out.push(a, b); continue }
    if (join === 'round') { out.push(a, ...arc(vertex, { x: a.x - vertex.x, y: a.y - vertex.y }, { x: b.x - vertex.x, y: b.y - vertex.y }, half, vertices), b); continue }
    // miter 길이 비율 = sqrt(2/(1+cos φ)). 한계를 넘으면 bevel.
    if (join === 'miter' && miter && Math.sqrt(2 / (1 + cosine)) <= MITER_LIMIT) out.push(miter)
    else out.push(a, b)
  }
  return out
}

function ringArea(ring: readonly BrushPoint[]): number {
  let sum = 0
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/**
 * 중심선 폴리라인 → 면. thickness는 중심선과 같은 좌표계.
 * 열린 선: 윤곽 하나(왼쪽 오프셋 → 끝 캡 → 오른쪽 오프셋 역순 → 시작 캡).
 * 닫힌 선: 바깥 링 + 안쪽 링(구멍).
 * 캡: butt = 끝점에서 자름, square = 두께 절반만큼 연장, round = 반원.
 */
export function polylineToFlatInkGroups(
  points: readonly BrushPoint[],
  closed: boolean,
  thickness: number,
  cap: StrokeLinecap,
  join: StrokeLinejoin,
  roundVertices = ROUND_VERTICES,
): BrushInkGroup[] {
  if (points.length < 2 || !(thickness > 0)) return []
  const half = thickness / 2
  let path = points.map((p) => ({ x: p.x, y: p.y }))
  const segmentCount = closed ? path.length : path.length - 1
  const dirs = Array.from({ length: segmentCount }, (_, index) => unit(path[index], path[(index + 1) % path.length]))
  if (!closed && cap === 'square') {
    const first = dirs[0]
    const last = dirs[segmentCount - 1]
    if (first) path[0] = add(path[0], first, -half)
    if (last) path[path.length - 1] = add(path[path.length - 1], last, half)
  }
  path = path.filter((point, index) => index === 0 || Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y) > EPSILON)
  if (path.length < 2) return []
  const count = closed ? path.length : path.length - 1
  const directions = Array.from({ length: count }, (_, index) => unit(path[index], path[(index + 1) % path.length]))
  const left = offsetSide(path, directions, closed, half, 1, join, roundVertices)
  const right = offsetSide(path, directions, closed, half, -1, join, roundVertices)
  if (left.length < 2 || right.length < 2) return []
  if (closed) {
    const rings: BrushContour[] = Math.abs(ringArea(left)) >= Math.abs(ringArea(right)) ? [left, right] : [right, left]
    return [rings]
  }
  const endDir = directions[count - 1]!
  const startDir = directions[0]!
  // 반원은 바깥으로 돈다: 끝에서는 +n → dir → −n, 시작에서는 −n → −dir → +n.
  const endArc = cap === 'round' ? roundCap(path[path.length - 1], endDir, half, roundVertices) : []
  const startArc = cap === 'round' ? roundCap(path[0], { x: -startDir.x, y: -startDir.y }, half, roundVertices) : []
  const ring = [...left, ...endArc, ...right.reverse(), ...startArc]
  return [[ring]]
}

/** 끝점에서 +n → dir → −n 순으로 도는 반원의 안쪽 점들(양 끝 제외). */
function roundCap(end: BrushPoint, dir: BrushPoint, half: number, vertices: number): BrushPoint[] {
  const n = normalOf(dir)
  const start = Math.atan2(n.y, n.x)
  const target = Math.atan2(-n.y, -n.x)
  // dir 쪽으로 도는 방향을 고른다.
  const mid = Math.atan2(dir.y, dir.x)
  let sweep = target - start
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep < -Math.PI) sweep += Math.PI * 2
  const viaMid = start + sweep / 2
  const diff = Math.atan2(Math.sin(viaMid - mid), Math.cos(viaMid - mid))
  if (Math.abs(diff) > Math.PI / 2) sweep = sweep > 0 ? sweep - Math.PI * 2 : sweep + Math.PI * 2
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI * 2 / vertices)))
  return Array.from({ length: steps - 1 }, (_, index) => {
    const theta = start + sweep * (index + 1) / steps
    return { x: end.x + Math.cos(theta) * half, y: end.y + Math.sin(theta) * half }
  })
}

/** 획 데이터 → 일자 끝 면. brushGeometry의 tip 방식과 같은 좌표계(glyph-normalized). */
export function strokeToFlatInkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
  cap: StrokeLinecap,
  join: StrokeLinejoin,
  roundVertices?: number,
): BrushInkGroup[] {
  const centerline = flattenStrokeCenterline(stroke, box)
  return polylineToFlatInkGroups(centerline, stroke.closed, Math.max(stroke.thickness * weightMultiplier, 0.001), cap, join, roundVertices)
}
