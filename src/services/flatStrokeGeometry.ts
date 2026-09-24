import type { BoxConfig, StrokeDataV2, StrokeLinecap, StrokeLinejoin } from '../types'
import { flattenStrokeCenterlineWithAnchors } from './brushGeometry'
import type { BrushContour, BrushInkGroup, BrushPoint } from './brushGeometry'

/**
 * 끝이 일자인 획(butt·square 캡, miter·bevel 조인)을 면으로 만든다.
 * 붓 tip을 끌고 가는 방식(brushGeometry)은 끝이 둥글게만 나온다. 여기서는 중심선을
 * 양쪽으로 두께 절반씩 밀어낸 윤곽 하나를 만든다 — 조각을 여럿 겹치면 곡선을 잘게 편
 * 자리마다 가느다란 조각이 생겨 Boolean이 자주 깨진다.
 *
 * 전역 둥글기(`roundness` 0~1)는 이 일자 윤곽의 모서리를 반지름 `둥글기 × 반폭`의 호로 굴린다 —
 * 열린 끝면의 네 모서리와 앵커 꺾임의 안팎. 잉크가 각진 끝의 네모 밖으로 안 나가므로 상자 계산은 그대로다.
 * 1이면 끝의 두 호가 중심선에서 만나 반원이 되고, 직각 꺾임은 원형 결합과 같다.
 */

const EPSILON = 1e-12
/** 모서리를 굴릴 때 이웃 변의 이 비율보다 깊이 물러나지 않는다. 짧은 변이 통째로 호가 되지 않게. */
const FILLET_EDGE_LIMIT = 0.45
/** 안쪽 둥글기의 상한(반폭의 배수). 바깥은 1(끝이 반원)에서 끝나지만 안쪽은 더 크게 파일 수 있다(09-25 사용자). */
export const INNER_ROUNDNESS_MAX = 3

/**
 * 모서리 굴림 지시. `anchors`는 점 열에서 앵커(꺾임 후보) 자리, `radius`는 glyph 좌표의 호 반지름(바깥 · 볼록한 모서리와 열린 끝).
 * `innerRadius`는 안쪽(오목한 꺾임 · 닫힌 획의 구멍 링) 반지름. 없으면 `radius`와 같다.
 */
export interface FlatCornerRounding { radius: number; anchors: ReadonlySet<number>; innerRadius?: number }
/** 토막별 반폭 배율. `curved`는 그 토막이 곡선을 편 것인지. */
export type FlatWidthOf = (direction: BrushPoint, curved: boolean) => number
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
/**
 * 두 오프셋 선(들어오는 토막을 hIn만큼, 나가는 토막을 hOut만큼 민 선)의 교점. 폭이 같으면 옛 식(점 하나까지 같게), 다르면 직선 교점.
 * 거의 반대 방향(교점이 없음)이면 null.
 */
function miterOf(vertex: BrushPoint, incoming: BrushPoint, outgoing: BrushPoint, hIn: number, hOut: number, sign: number): BrushPoint | null {
  const nA = normalOf(incoming), nB = normalOf(outgoing)
  const cosine = nA.x * nB.x + nA.y * nB.y
  if (1 + cosine <= EPSILON) return null
  if (Math.abs(hIn - hOut) <= EPSILON) return add(vertex, { x: nA.x + nB.x, y: nA.y + nB.y }, hIn * sign / (1 + cosine))
  const a = add(vertex, nA, hIn * sign), b = add(vertex, nB, hOut * sign)
  const denominator = incoming.x * outgoing.y - incoming.y * outgoing.x
  if (Math.abs(denominator) <= 1e-12) return a
  const t = ((b.x - a.x) * outgoing.y - (b.y - a.y) * outgoing.x) / denominator
  return add(a, incoming, t)
}

/**
 * `halves`는 토막마다의 반폭(가로·세로 대비가 있으면 다르다). `baseHalf`는 대비 없는 반폭 — 굴림 반지름의 기준.
 */
function offsetSide(points: readonly BrushPoint[], dirs: readonly (BrushPoint | null)[], closed: boolean, halves: readonly number[], baseHalf: number, sign: number, join: StrokeLinejoin, vertices: number, rounding?: FlatCornerRounding): BrushPoint[] {
  const count = points.length
  const out: BrushPoint[] = []
  const halfIn = (index: number) => halves[(index - 1 + count) % count]
  const halfOut = (index: number) => halves[index % count]
  // 굴림의 물러남 한도는 중심선이 아니라 이 쪽 오프셋 변(교점 → 교점)의 길이로 잰다. 안쪽 변은 중심선보다 짧아서 중심선으로 재면 이웃 굴림과 겹친다.
  const cornerOf = (index: number): BrushPoint | null => {
    const vertex = points[index]
    const incoming = closed || index > 0 ? dirs[(index - 1 + count) % count] : null
    const outgoing = closed || index < count - 1 ? dirs[index % count] : null
    if (!incoming && !outgoing) return null
    if (!incoming || !outgoing) return add(vertex, normalOf(incoming ?? outgoing!), (incoming ? halfIn(index) : halfOut(index)) * sign)
    return miterOf(vertex, incoming, outgoing, halfIn(index), halfOut(index), sign) ?? add(vertex, normalOf(incoming), halfIn(index) * sign)
  }
  const corners = rounding && Math.max(rounding.radius, rounding.innerRadius ?? 0) > EPSILON ? points.map((_, index) => cornerOf(index)) : []
  const edgeLimit = (index: number, miter: BrushPoint): number => {
    const previous = corners[(index - 1 + count) % count], next = corners[(index + 1) % count]
    const toPrevious = previous ? Math.hypot(miter.x - previous.x, miter.y - previous.y) : Infinity
    const toNext = next ? Math.hypot(miter.x - next.x, miter.y - next.y) : Infinity
    return FILLET_EDGE_LIMIT * Math.min(toPrevious, toNext)
  }
  for (let index = 0; index < count; index += 1) {
    const vertex = points[index]
    const incoming = closed || index > 0 ? dirs[(index - 1 + count) % count] : null
    const outgoing = closed || index < count - 1 ? dirs[index % count] : null
    if (!incoming && !outgoing) continue
    if (!incoming || !outgoing) { out.push(add(vertex, normalOf(incoming ?? outgoing!), (incoming ? halfIn(index) : halfOut(index)) * sign)); continue }
    const hIn = halfIn(index), hOut = halfOut(index)
    const nA = normalOf(incoming)
    const nB = normalOf(outgoing)
    const a = add(vertex, nA, hIn * sign)
    const b = add(vertex, nB, hOut * sign)
    const cosine = nA.x * nB.x + nA.y * nB.y
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x
    // 거의 직진: 두 오프셋 점이 사실상 같다.
    if (Math.abs(cross) <= 1e-9 && cosine > 0) { out.push(a); continue }
    // 바깥쪽 = 오프셋 방향이 꺾이는 쪽의 반대.
    const outer = (nA.x + nB.x) * sign * (outgoing.x - incoming.x) + (nA.y + nB.y) * sign * (outgoing.y - incoming.y) < 0
    const miter = miterOf(vertex, incoming, outgoing, hIn, hOut, sign)
    // 앵커 꺾임의 굴림: 안팎 모두 두 오프셋 선의 교점(miter)에서 양쪽으로 d만큼 물러나 반지름 r의 호로 잇는다.
    // d = r·tan(θ/2). 이웃 변이 짧으면 d를 줄이고 r도 그에 맞춘다(호는 늘 두 변에 접한다). 반지름은 그 자리 반폭을 따른다.
    const localScale = baseHalf > EPSILON ? (hIn + hOut) / (2 * baseHalf) : 1
    const cornerRadius = rounding ? (outer ? rounding.radius : rounding.innerRadius ?? rounding.radius) * localScale : 0
    if (rounding && cornerRadius > EPSILON && rounding.anchors.has(index) && miter) {
      const tanHalf = Math.sqrt(Math.max(0, (1 - cosine) / (1 + cosine)))
      if (tanHalf > EPSILON) {
        const d = Math.min(cornerRadius * tanHalf, edgeLimit(index, miter))
        const r = d / tanHalf
        if (d > EPSILON) {
          const t1 = add(miter, incoming, -d)
          const t2 = add(miter, outgoing, d)
          const center = add(t1, nA, cross > 0 ? r : -r)
          out.push(t1, ...arc(center, { x: t1.x - center.x, y: t1.y - center.y }, { x: t2.x - center.x, y: t2.y - center.y }, r, vertices), t2)
          continue
        }
      }
    }
    if (!outer) { if (miter) out.push(miter); else out.push(a, b); continue }
    if (join === 'round') { out.push(a, ...arc(vertex, { x: a.x - vertex.x, y: a.y - vertex.y }, { x: b.x - vertex.x, y: b.y - vertex.y }, (hIn + hOut) / 2, vertices), b); continue }
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
  rounding?: FlatCornerRounding,
  widthOf?: FlatWidthOf,
  curvedSegments?: ReadonlySet<number>,
): BrushInkGroup[] {
  if (points.length < 2 || !(thickness > 0)) return []
  const half = thickness / 2
  // 토막마다 반폭. 가로·세로 대비가 있으면 방향에 따라 다르다(`widthOf`는 배율).
  const halfOf = (direction: BrushPoint | null, index: number): number => direction && widthOf ? half * Math.max(0.05, widthOf(direction, curvedSegments?.has(index) ?? false)) : half
  let path = points.map((p) => ({ x: p.x, y: p.y }))
  const segmentCount = closed ? path.length : path.length - 1
  const dirs = Array.from({ length: segmentCount }, (_, index) => unit(path[index], path[(index + 1) % path.length]))
  if (!closed && cap === 'square') {
    const first = dirs[0]
    const last = dirs[segmentCount - 1]
    if (first) path[0] = add(path[0], first, -halfOf(first, 0))
    if (last) path[path.length - 1] = add(path[path.length - 1], last, halfOf(last, segmentCount - 1))
  }
  const kept: number[] = []
  path = path.filter((point, index) => {
    const keep = index === 0 || Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y) > EPSILON
    if (keep) kept.push(index)
    return keep
  })
  if (path.length < 2) return []
  // 점을 지웠으면 앵커 자리를 새 번호로 옮긴다.
  const rounds = !!rounding && Math.max(rounding.radius, rounding.innerRadius ?? 0) > EPSILON
  const cornerRounding = rounds && kept.length === points.length
    ? rounding
    : rounds
      ? { ...rounding, anchors: new Set(kept.map((source, index) => rounding.anchors.has(source) ? index : -1).filter((index) => index >= 0)) }
      : undefined
  const count = closed ? path.length : path.length - 1
  const directions = Array.from({ length: count }, (_, index) => unit(path[index], path[(index + 1) % path.length]))
  // 점을 지웠으면 곡선 토막 번호도 새 번호로 옮긴다.
  const curvedNow = curvedSegments && kept.length !== points.length
    ? new Set(kept.map((source, index) => curvedSegments.has(source) ? index : -1).filter((index) => index >= 0))
    : curvedSegments
  const halves = directions.map((direction, index) => direction && widthOf ? half * Math.max(0.05, widthOf(direction, curvedNow?.has(index) ?? false)) : half)
  // 급한 굽이 안쪽에서 오프셋 선이 제 몸을 지나 작은 고리가 생기면 잘라낸다.
  const left = removeLoops(offsetSide(path, directions, closed, halves, half, 1, join, roundVertices, cornerRounding), closed)
  const right = removeLoops(offsetSide(path, directions, closed, halves, half, -1, join, roundVertices, cornerRounding), closed)
  if (left.length < 2 || right.length < 2) return []
  if (closed) {
    const rings: BrushContour[] = Math.abs(ringArea(left)) >= Math.abs(ringArea(right)) ? [left, right] : [right, left]
    return [rings]
  }
  const endDir = directions[count - 1]!
  const startDir = directions[0]!
  const endHalf = halves[count - 1], startHalf = halves[0]
  // 반원은 바깥으로 돈다: 끝에서는 +n → dir → −n, 시작에서는 −n → −dir → +n.
  const endArc = cap === 'round' ? roundCap(path[path.length - 1], endDir, endHalf, roundVertices) : []
  const startArc = cap === 'round' ? roundCap(path[0], { x: -startDir.x, y: -startDir.y }, startHalf, roundVertices) : []
  if (cornerRounding && cornerRounding.radius > EPSILON && cap === 'butt') {
    // 끝면 네 모서리 굴림. 반지름은 반폭과 끝 앵커 구간(마지막 앵커 → 끝)의 길이에 걸린다 — 반폭이면 두 호가 중심선에서 만나 반원.
    // 옆면은 곡선일 수 있어 직선 토막이 아니라 호 길이로 되짚어 자르고, 그 자리의 접선과 끝면을 잇는 3차 곡선으로 굴린다.
    const end = path[path.length - 1], start = path[0]
    const anchorList = [...cornerRounding.anchors].filter((index) => index > 0 && index < path.length - 1).sort((a, b) => a - b)
    const arcLength = (from: number, to: number) => { let sum = 0; for (let i = from; i < to; i += 1) sum += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y); return sum }
    const lastAnchor = anchorList.length > 0 ? anchorList[anchorList.length - 1] : 0
    const firstAnchor = anchorList.length > 0 ? anchorList[0] : path.length - 1
    // 반지름은 그 끝 토막의 반폭을 따른다(대비가 있으면 세로 끝이 더 크게 굴려진다).
    const endReach = Math.min(cornerRounding.radius * endHalf / half, endHalf, FILLET_EDGE_LIMIT * arcLength(lastAnchor, path.length - 1))
    const startReach = Math.min(cornerRounding.radius * startHalf / half, startHalf, FILLET_EDGE_LIMIT * arcLength(0, firstAnchor))
    const nEnd = normalOf(endDir), nStart = normalOf(startDir)
    if (endReach > EPSILON) {
      roundSideEnd(left, true, end, nEnd, endHalf, endReach, roundVertices)
      // right는 아직 시작 → 끝 순서다(아래에서 뒤집는다).
      roundSideEnd(right, true, end, { x: -nEnd.x, y: -nEnd.y }, endHalf, endReach, roundVertices)
    }
    if (startReach > EPSILON) {
      roundSideEnd(right, false, start, { x: -nStart.x, y: -nStart.y }, startHalf, startReach, roundVertices)
      roundSideEnd(left, false, start, nStart, startHalf, startReach, roundVertices)
    }
  }
  const joined = [...left, ...endArc, ...right.reverse(), ...startArc]
  // 둥글기 1이면 끝면의 두 호가 같은 점(중심선 끝)에서 만난다. 겹친 점은 하나만 둔다. 둥글기 0이면 전과 점 하나까지 같게 손대지 않는다.
  const ring = cornerRounding
    ? joined.filter((point, index) => index === 0 || Math.hypot(point.x - joined[index - 1].x, point.y - joined[index - 1].y) > EPSILON)
    : joined
  // 급한 굽이 안쪽에서 오프셋 선이 제 몸을 지나면 윤곽 하나로는 Boolean이 못 받는다. 그때만 조각(세그먼트 사각형 + 조인 + 캡)으로 낸다.
  if (ringSelfIntersects(ring)) return piecewiseFlatInkGroups(path, directions, halves, cap, join, roundVertices)
  return [[ring]]
}

function intersectionOf(a1: BrushPoint, a2: BrushPoint, b1: BrushPoint, b2: BrushPoint): BrushPoint | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x)
  if (Math.abs(d) <= EPSILON) return null
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d
  return { x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t }
}

/**
 * 오프셋 점 열의 국소 고리 제거. 변 i와 그 뒤 변 j가 교차하면 사이 점을 교점 하나로 바꾼다.
 * 두께보다 작은 굽이에서 생기는 안쪽 고리가 대상이다. 열린 선만 본다(닫힌 선의 고리는 드물고 잘못 자르면 형태가 깨진다).
 */
export function removeLoops(points: BrushPoint[], closed: boolean): BrushPoint[] {
  if (closed || points.length < 4) return points
  const out = [...points]
  let i = 0
  while (i < out.length - 3) {
    let cut = false
    for (let j = i + 2; j < out.length - 1; j += 1) {
      if (!segmentsCross(out[i], out[i + 1], out[j], out[j + 1])) continue
      const p = intersectionOf(out[i], out[i + 1], out[j], out[j + 1])
      if (!p) continue
      out.splice(i + 1, j - i, p)
      cut = true
      break
    }
    if (!cut) i += 1
  }
  return out
}

function cross(o: BrushPoint, a: BrushPoint, b: BrushPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function segmentsCross(a1: BrushPoint, a2: BrushPoint, b1: BrushPoint, b2: BrushPoint): boolean {
  const d1 = cross(a1, a2, b1), d2 = cross(a1, a2, b2), d3 = cross(b1, b2, a1), d4 = cross(b1, b2, a2)
  return ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) && ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
}

/** 인접하지 않은 변끼리 교차하는지. n이 수백이라 O(n²)로 충분하다. */
export function ringSelfIntersects(ring: readonly BrushPoint[]): boolean {
  const n = ring.length
  for (let i = 0; i < n; i += 1) {
    const a1 = ring[i], a2 = ring[(i + 1) % n]
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(a1, a2, ring[j], ring[(j + 1) % n])) return true
    }
  }
  return false
}

function circle(center: BrushPoint, radius: number, vertices: number): BrushContour {
  return Array.from({ length: vertices }, (_, index) => {
    const theta = index / vertices * Math.PI * 2
    return { x: center.x + Math.cos(theta) * radius, y: center.y + Math.sin(theta) * radius }
  })
}

/**
 * 조각 방식: 세그먼트마다 사각형, 꺾임마다 조인 패치(양쪽 다 얹는다 — 안쪽은 사각형에 덮인다), 열린 끝에 캡.
 * 조각은 전부 볼록해서 Boolean이 안전하지만 곡선을 잘게 편 자리마다 조각이 생겨 느리다. 윤곽 하나가 안 될 때만 쓴다.
 */
function piecewiseFlatInkGroups(path: readonly BrushPoint[], directions: readonly (BrushPoint | null)[], halves: readonly number[], cap: StrokeLinecap, join: StrokeLinejoin, vertices: number): BrushInkGroup[] {
  const groups: BrushInkGroup[] = []
  const count = directions.length
  for (let index = 0; index < count; index += 1) {
    const dir = directions[index]
    if (!dir) continue
    const n = normalOf(dir)
    const half = halves[index]
    const from = path[index], to = path[(index + 1) % path.length]
    groups.push([[add(from, n, half), add(to, n, half), add(to, n, -half), add(from, n, -half)]])
  }
  for (let index = 1; index < path.length - 1; index += 1) {
    const incoming = directions[index - 1], outgoing = directions[index]
    if (!incoming || !outgoing) continue
    const vertex = path[index]
    const hIn = halves[index - 1], hOut = halves[index]
    if (join === 'round') { groups.push([circle(vertex, (hIn + hOut) / 2, vertices)]); continue }
    const nA = normalOf(incoming), nB = normalOf(outgoing)
    const cosine = nA.x * nB.x + nA.y * nB.y
    for (const sign of [1, -1]) {
      const a = add(vertex, nA, hIn * sign), b = add(vertex, nB, hOut * sign)
      const miter = join === 'miter' && 1 + cosine > EPSILON && Math.sqrt(2 / (1 + cosine)) <= MITER_LIMIT ? miterOf(vertex, incoming, outgoing, hIn, hOut, sign) : null
      groups.push([miter ? [vertex, a, miter, b] : [vertex, a, b]])
    }
  }
  if (cap === 'round') groups.push([circle(path[0], halves[0], vertices)], [circle(path[path.length - 1], halves[count - 1], vertices)])
  return groups
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

/** 원을 3차 베지어로 흉내 낼 때의 손잡이 비율. */
const KAPPA = 0.5522847498

/**
 * 열린 끝면의 한 모서리 굴림 — 옆면 점 열을 제자리에서 고친다. `side`가 시작 → 끝 순서일 때 `atEnd`는 끝 쪽, 아니면 시작 쪽.
 * 옆면을 끝에서부터 호 길이 `reach`만큼 되짚어 자르고, 자른 자리의 접선과 끝면(tip + sideDir·(half − reach))을
 * 3차 곡선으로 잇는다. 옆면이 곧으면 사분원과 같고(오차 0.03%), 곡선이면 접선이 이어져 꺾이지 않는다.
 */
function roundSideEnd(side: BrushPoint[], atEnd: boolean, tip: BrushPoint, sideDir: BrushPoint, half: number, reach: number, vertices: number): void {
  if (side.length < 2) return
  // 배열 끝(atEnd) 또는 처음에서 안쪽으로 걸어 들어간다.
  const step = atEnd ? -1 : 1
  let index = atEnd ? side.length - 1 : 0
  let remaining = reach
  let cut: BrushPoint | null = null
  let tangent: BrushPoint | null = null
  while (index + step >= 0 && index + step < side.length) {
    const from = side[index], to = side[index + step]
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length >= remaining) {
      const t = length <= EPSILON ? 0 : remaining / length
      cut = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
      // 접선은 끝(모서리) 쪽을 향한다.
      tangent = length <= EPSILON ? null : { x: (from.x - to.x) / length, y: (from.y - to.y) / length }
      break
    }
    remaining -= length
    index += step
  }
  if (!cut || !tangent) return
  const face = add(tip, sideDir, half - reach)
  // 접선과 끝면이 만나는 점이 곡선의 모서리(손잡이 방향). 거의 나란하면 옛 모서리로 대신한다.
  const faceDir = sideDir
  const denominator = tangent.x * faceDir.y - tangent.y * faceDir.x
  const corner = Math.abs(denominator) <= 1e-9
    ? add(tip, sideDir, half)
    : (() => { const s = ((face.x - cut.x) * faceDir.y - (face.y - cut.y) * faceDir.x) / denominator; return add(cut, tangent, s) })()
  const p1 = add(cut, { x: corner.x - cut.x, y: corner.y - cut.y }, KAPPA)
  const p2 = add(face, { x: corner.x - face.x, y: corner.y - face.y }, KAPPA)
  const steps = Math.max(3, Math.ceil(vertices / 4))
  const curve = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t
    return {
      x: u * u * u * cut.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * face.x,
      y: u * u * u * cut.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * face.y,
    }
  })
  // 되짚은 구간의 점을 지우고 곡선을 넣는다. 끝 쪽은 [.., 자른 점 → 끝면], 시작 쪽은 [끝면 → 자른 점, ..].
  // 자른 자리는 side[index]와 side[index + step] 사이다. side[index]부터 바깥은 전부 곡선으로 바뀐다.
  if (atEnd) side.splice(index, side.length - index, ...curve)
  else side.splice(0, index + 1, ...curve.reverse())
}

/**
 * 획 데이터 → 일자 끝 면. brushGeometry의 tip 방식과 같은 좌표계(glyph-normalized).
 * `roundness`(0~1)는 바깥 모서리와 끝을, `innerRoundness`는 안쪽 모서리를 `둥글기 × 반폭`으로 굴린다. 안쪽이 없으면 바깥을 따른다.
 */
export function strokeToFlatInkGroups(
  stroke: StrokeDataV2,
  box: BoxConfig,
  weightMultiplier: number,
  cap: StrokeLinecap,
  join: StrokeLinejoin,
  roundVertices?: number,
  roundness = 0,
  innerRoundness?: number,
  contrast = 0,
): BrushInkGroup[] {
  const { points, anchorIndices, curvedSegments } = flattenStrokeCenterlineWithAnchors(stroke, box)
  const thickness = Math.max(stroke.thickness * weightMultiplier, 0.001)
  const inner = innerRoundness ?? roundness
  const rounding = Math.max(roundness, inner) > 0
    // 안쪽은 반폭을 넘어서도 굴린다(최대 3배). 이웃 변 길이 한도(45%)에 걸려 자연히 멈춘다.
    ? { radius: Math.min(1, Math.max(0, roundness)) * thickness / 2, innerRadius: Math.min(INNER_ROUNDNESS_MAX, Math.max(0, inner)) * thickness / 2, anchors: anchorIndices }
    : undefined
  return polylineToFlatInkGroups(points, stroke.closed, thickness, cap, join, roundVertices, rounding, contrast !== 0 ? contrastWidthOf(contrast) : undefined, curvedSegments)
}

/** 대비 +1(세로 굵게)에서 세로 반폭이 느는 비율과 가로 반폭이 주는 비율. 1.8 : 0.55 ≈ 3.3 : 1. 세로 굵게 쪽이 훨씬 깊다(09-25 사용자). */
const CONTRAST_VERTICAL_GAIN = 0.8
const CONTRAST_HORIZONTAL_LOSS = 0.45
/** 대비 −1(가로 굵게) 쪽은 완만하다. 막대는 −0.3까지만 연다. */
const CONTRAST_REVERSE = 0.5
/** 곡선(ㅇ · ㅎ의 ㅇ · ㅅ의 삐침)은 대비를 이만큼만 받는다. 직선처럼 다 받으면 ㅇ이 붓글씨처럼 뒤틀린다(09-25 사용자). */
const CONTRAST_ON_CURVES = 0.5

/**
 * 가로·세로 두께 대비의 토막별 배율. `contrast` −1 ~ 1, + 는 세로 굵게 · 가로 얇게.
 * u = sin²θ(θ는 가로에서 잰 각, 가로 0 · 세로 1)로 세로 배율과 가로 배율 사이를 잇는다 — 45°와 곡선의 중간은 그 사이, 각진 곳 없이 매끈하다.
 * + 쪽: 세로 1 + 0.8c · 가로 1 − 0.45c. − 쪽: 세로 1 + 0.5c · 가로 1 − 0.5c.
 */
export function contrastWidthOf(contrast: number): FlatWidthOf {
  const c = Math.max(-1, Math.min(1, contrast))
  const vertical = c >= 0 ? c * CONTRAST_VERTICAL_GAIN : c * CONTRAST_REVERSE
  const horizontal = c >= 0 ? -c * CONTRAST_HORIZONTAL_LOSS : -c * CONTRAST_REVERSE
  return (direction, curved = false) => {
    const length = Math.hypot(direction.x, direction.y)
    if (length <= EPSILON) return 1
    const u = (direction.y / length) ** 2
    const damping = curved ? CONTRAST_ON_CURVES : 1
    return 1 + (u * vertical + (1 - u) * horizontal) * damping
  }
}
