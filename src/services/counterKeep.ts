import type { BoxConfig, StrokeDataV2 } from '../types'
import { flattenStrokeCenterline } from './brushGeometry'

/**
 * 속공간 지키기 — 최소 속공간 하한선. 플랜 `docs/plans/2026-10-01_속공간-지키기.md` 2단계.
 *
 * 굵기를 올리면 모든 획이 같은 배율로 굵어져, 획이 빽빽한 자소(ㅃ · ㄹ · ㅌ · ㅎ)부터 속공간이 막힌다.
 * 자소 안 획 사이 틈이 하한선(= max(고정 u, 굵어진 두께 × 비율)) 아래로 안 가게, 넘는 자소만 그 자소 전체의 굵기 배율을 낮춘다.
 * 자소 하나 안에서는 한 배율로 묶는다(한 자소 안 획 굵기가 들쑥날쑥하지 않게).
 * 굵기 400에서 이미 하한선보다 좁던 틈(ㅆ 두 ㅅ 다리 언저리 등)은 놓아 준다 — 그 한 곳 때문에 자소 전체가 얇아지지 않게. 노토 900도 ㅅ 속공간을 3u까지 좁힌다.
 *
 * 틈은 획 중심선 토막 사이 거리 − 두 반 두께로 잰다. 나란한 획(ㅌ 가로줄기들)도, 끝과 면(ㅎ 꼭지 ↔ 보)도 같은 셈이다.
 * 굵기 400 이하에서는 아무것도 안 바꾼다(배율 1). 반환값도 1을 넘지 않는다 — 원래보다 굵게 하지는 않는다.
 */

/**
 * 최소 속공간. 단위는 글자 칸(1 = 1000u). `ratio`는 굵어진 두께(자소 획 두께 가운데값 × 굵기 배율)에 곱한다.
 * 덜 굵어진 뒤의 두께가 아니라 목표 굵기의 두께로 잰다 — 하한선이 배율에 따라 움직이지 않게.
 */
export interface CounterFloor {
  fixed: number
  ratio: number
  /**
   * 쌓인 가로줄기 사이 틈의 비율. 없으면 `ratio`. 를의 ㄹ처럼 가로줄기가 쌓인 틈은 낮은 하한선이 낫다(10-01 사용자 고르기).
   * 둘 다 곧은 가로 토막(수평에서 20° 안)이고 가로로 겹친 길이가 두께의 2배 넘는 틈만 — ㅎ 보 ↔ 동그라미 윗부분은 아니다(한은 낮추면 나빠졌다).
   */
  horizontalRatio?: number
}
/** 기본 하한선(10-01 사용자 결정 B′): 24u, 두께의 0.5(굵기 900 = 68u), 쌓인 가로줄기 틈만 0.25(34u). */
export const DEFAULT_COUNTER_FLOOR: CounterFloor = { fixed: 0.024, ratio: 0.5, horizontalRatio: 0.25 }
/** 기본 가로줄기 몫(10-01 사용자 결정, 이상형 월드컵 우승): 굵기 900에서 가로줄기 ×1.5(세로줄기는 ×1.95 그대로). */
export const DEFAULT_HORIZONTAL_SHARE = 0.526
/** 기본 자소 배율 바닥(10-01 사용자 결정, 눈 ② 둘째 판): 한 글자 안 자소 굵기가 이보다 갈리지 않게. */
export const DEFAULT_COUNTER_MINSCALE = 0.8
/** 기본 자소 사이 틈(10-01 사용자 결정, 눈 ② 셋째 판): 이웃 자소를 마주 본 획은 굵어진 두께 × 이만큼 틈을 남긴다. */
export const DEFAULT_BETWEEN_OPENING = 0.25
/** 기본 합성 바닥(10-02 사용자 결정, 눈 ③ 첫 판): 자소 배율 × 자소 사이 깎임이 이 아래로 못 간다 — 한 획만 400 두께까지 눌리는 튀는 글자를 막는다. */
export const DEFAULT_TOTAL_MINSCALE = 0.8
/** 섞임홀자의 가로부 · 세로부(`JU_H` · `JU_V`)는 속공간 셈에서 한 자소다. */
export const jamoOfPart = (part: string) => part.startsWith('JU') ? 'JU' : part
/** 굵기 400에서 이보다 좁은 틈(두께 대비)은 원래 붙여 그린 것으로 보고 안 지킨다 — 측정의 `닿음` 기준과 같다. */
const MIN_GAP_RATIO = 0.25

/** `start` · `end`: 획 처음부터 잰 길이(토막 시작 · 끝). `total` · `closed`: 그 획 전체 길이와 닫힘. */
/** `half`: 굵기 400 반 두께. `grown`: 목표 굵기에서의 반 두께(가로줄기 몫까지 든다, 자소 배율 전). */
interface Segment { ax: number; ay: number; bx: number; by: number; half: number; grown: number; stroke: number; start: number; end: number; total: number; closed: boolean }
export interface CounterKeepStroke { stroke: StrokeDataV2; box: BoxConfig }

/** 세로에 가까울수록 `stemScale`만큼 얇다(일자 stroker의 방향별 두께와 같은 sin² 섞기). */
function halfWidthOf(thickness: number, dx: number, dy: number, stemScale: number): number {
  const length = Math.hypot(dx, dy)
  const sin2 = length > 0 ? (dy / length) ** 2 : 0
  return thickness / 2 * (1 + (stemScale - 1) * sin2)
}

/** 획이 얼마나 세로로 섰나(0 = 가로줄기, 1 = 세로줄기). 토막 길이로 가중한 sin² 평균. ㅇ 같은 곡선은 0.5 언저리. */
export function strokeVerticalness(stroke: StrokeDataV2, box: BoxConfig): number {
  const points = flattenStrokeCenterline(stroke, box)
  let total = 0
  let vertical = 0
  for (let at = 1; at < points.length; at += 1) {
    const dx = points[at].x - points[at - 1].x
    const dy = points[at].y - points[at - 1].y
    const length = Math.hypot(dx, dy)
    total += length
    if (length > 0) vertical += length * (dy / length) ** 2
  }
  return total > 0 ? vertical / total : 0
}

/**
 * 굵기 k에서 획 하나의 두께 배율(400 대비). 세로로 선 획은 k, 누운 획은 1 + (k − 1) × 가로 몫, 사이는 서 있는 만큼 섞는다.
 * 획 단위라 붓 모양(둥근 붓 · 네모붓)과 상관없이 먹는다.
 */
export function strokeGrowthOf(verticalness: number, k: number, horizontalShare: number): number {
  const horizontal = 1 + (k - 1) * horizontalShare
  return horizontal + (k - horizontal) * verticalness
}

function segmentsOf(strokes: readonly CounterKeepStroke[], stemScale: number, k = 1, horizontalShare = 1): Segment[] {
  const out: Segment[] = []
  strokes.forEach(({ stroke, box }, strokeIndex) => {
    const points = flattenStrokeCenterline(stroke, box)
    const growth = strokeGrowthOf(horizontalShare === 1 ? 1 : strokeVerticalness(stroke, box), k, horizontalShare)
    const own: Segment[] = []
    let walked = 0
    for (let at = 1; at < points.length; at += 1) {
      const a = points[at - 1]
      const b = points[at]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length === 0) continue
      own.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, half: halfWidthOf(stroke.thickness, b.x - a.x, b.y - a.y, stemScale), grown: halfWidthOf(stroke.thickness, b.x - a.x, b.y - a.y, stemScale) * growth, stroke: strokeIndex, start: walked, end: walked + length, total: 0, closed: Boolean(stroke.closed) })
      walked += length
    }
    for (const segment of own) out.push({ ...segment, total: walked })
  })
  return out
}

/** 점에서 토막까지 거리와, 가장 가까운 자리의 토막 안 비율(0~1). */
function pointSegment(px: number, py: number, s: Segment): { distance: number; t: number } {
  const dx = s.bx - s.ax
  const dy = s.by - s.ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / lengthSquared))
  return { distance: Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy)), t }
}

/** 속공간을 이루는 두 토막은 나란하거나 마주 본다(ㅌ 가로줄기들, ㅃ 기둥들, ㅇ 맞은편). 이보다 벌어지면(cos) 쐐기다. */
const PARALLEL_COS = Math.cos(20 / 180 * Math.PI)

/** 나란하거나 마주 보는가 — 방향이 20° 안으로 같거나 반대. */
function parallel(p: Segment, q: Segment): boolean {
  const dot = (p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay)
  return Math.abs(dot) >= PARALLEL_COS * Math.hypot(p.bx - p.ax, p.by - p.ay) * Math.hypot(q.bx - q.ax, q.by - q.ay)
}

/** 120° 넘게 돌아 마주 보는가(ㄹ 위 · 가운데 가로줄기, ㅇ 맞은편). */
function facing(p: Segment, q: Segment): boolean {
  const dot = (p.bx - p.ax) * (q.bx - q.ax) + (p.by - p.ay) * (q.by - q.ay)
  return dot < -0.5 * Math.hypot(p.bx - p.ax, p.by - p.ay) * Math.hypot(q.bx - q.ax, q.by - q.ay)
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

interface Nearest { distance: number; atP: number; atQ: number; pointP: { x: number; y: number }; pointQ: { x: number; y: number } }

/** 두 토막 사이 거리와, 가장 가까운 두 자리(획 처음부터 잰 길이 · 좌표). */
function nearestBetween(p: Segment, q: Segment): Nearest {
  const raw = nearestOnSegments(p, q)
  const pointOf = (s: Segment, along: number) => {
    const t = s.end === s.start ? 0 : (along - s.start) / (s.end - s.start)
    return { x: s.ax + t * (s.bx - s.ax), y: s.ay + t * (s.by - s.ay) }
  }
  return { ...raw, pointP: pointOf(p, raw.atP), pointQ: pointOf(q, raw.atQ) }
}

function nearestOnSegments(p: Segment, q: Segment): { distance: number; atP: number; atQ: number } {
  const at = (s: Segment, t: number) => s.start + t * (s.end - s.start)
  const d1 = cross(p.ax, p.ay, p.bx, p.by, q.ax, q.ay)
  const d2 = cross(p.ax, p.ay, p.bx, p.by, q.bx, q.by)
  const d3 = cross(q.ax, q.ay, q.bx, q.by, p.ax, p.ay)
  const d4 = cross(q.ax, q.ay, q.bx, q.by, p.bx, p.by)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return { distance: 0, atP: at(p, d3 / (d3 - d4)), atQ: at(q, d1 / (d1 - d2)) }
  }
  const candidates = [
    { ...pointSegment(p.ax, p.ay, q), fromP: 0, onQ: true }, { ...pointSegment(p.bx, p.by, q), fromP: 1, onQ: true },
    { ...pointSegment(q.ax, q.ay, p), fromP: 0, onQ: false }, { ...pointSegment(q.bx, q.by, p), fromP: 1, onQ: false },
  ]
  const best = candidates.reduce((a, b) => b.distance < a.distance ? b : a)
  return best.onQ
    ? { distance: best.distance, atP: at(p, best.fromP), atQ: at(q, best.t) }
    : { distance: best.distance, atP: at(p, best.t), atQ: at(q, best.fromP) }
}

/** 한 획 위 두 자리 사이를 획을 따라 잰 길이. 닫힌 획은 짧은 쪽. */
function alongStroke(a: number, b: number, s: Segment): number {
  const forward = Math.abs(a - b)
  return s.closed ? Math.min(forward, s.total - forward) : forward
}

/** 그 굵기에서의 하한선(글자 칸 단위). `horizontal`이면 가로줄기 사이 비율을 쓴다. */
export function counterFloorAt(floor: CounterFloor, thickness: number, weightMultiplier: number, horizontal = false): number {
  const ratio = horizontal ? floor.horizontalRatio ?? floor.ratio : floor.ratio
  return Math.max(floor.fixed, ratio * thickness * weightMultiplier)
}

const HORIZONTAL_SIN = Math.sin(20 / 180 * Math.PI)
/** 토막이 수평에서 20° 안인가. */
const isHorizontal = (s: Segment) => Math.abs(s.by - s.ay) <= HORIZONTAL_SIN * Math.hypot(s.bx - s.ax, s.by - s.ay)
/** 쌓인 가로줄기인가: 둘 다 가로 토막이고 가로로 `minOverlap` 넘게 겹친다. 곡선을 잘게 쪼갠 토막(ㅇ 윗부분)은 짧아서 빠진다. */
function stackedHorizontal(p: Segment, q: Segment, minOverlap: number): boolean {
  if (!isHorizontal(p) || !isHorizontal(q)) return false
  const overlap = Math.min(Math.max(p.ax, p.bx), Math.max(q.ax, q.bx)) - Math.max(Math.min(p.ax, p.bx), Math.min(q.ax, q.bx))
  return overlap > minOverlap
}

/**
 * 자소 하나의 굵기 배율 보정. 목표 굵기의 두께(가로줄기 몫까지 얹은 것)에 이 값을 곱하면 지킬 틈마다 하한선이 남는다.
 * 틈은 늘 굵기 400 모양(`strokes` · `stemScale` 그대로)에서 고른다 — 가로줄기를 덜 굵게 한 두께로 고르면 원래 좁던 틈이 넓어 보여 다시 지켜진다(ㅎ이 ×0.58로 얇아졌다).
 * `horizontalShare`: 400 대비 늘어난 두께 가운데 가로줄기가 받는 몫(3단계, 1 = 세로줄기와 같다).
 * `weightMultiplier ≤ 1`이거나 지킬 틈이 없으면 1.
 */
export function counterKeepScale(
  strokes: readonly CounterKeepStroke[],
  weightMultiplier: number,
  floor: CounterFloor = DEFAULT_COUNTER_FLOOR,
  stemScale = 1,
  horizontalShare = 1,
): number {
  if (!(weightMultiplier > 1) || strokes.length === 0) return 1
  const segments = segmentsOf(strokes, stemScale, weightMultiplier, horizontalShare)
  const thickness = strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)]
  const minGap = thickness * MIN_GAP_RATIO
  const requiredOf = (p: Segment, q: Segment) => counterFloorAt(floor, thickness, weightMultiplier, floor.horizontalRatio !== undefined && stackedHorizontal(p, q, thickness * 2))
  let scale = 1
  for (const { p, q, distance } of counterGapPairs(segments, minGap)) {
    const halves = p.half + q.half
    // 굵기 400에서 이미 하한선보다 좁던 틈은 안 지킨다.
    const required = requiredOf(p, q)
    if (distance - halves <= required) continue
    // 자소 배율 c에서 틈 = 거리 − c × 목표 반 두께 합. 이게 하한선 아래로 안 가게. 굵기 400보다 얇게는 안 한다.
    const grown = p.grown + q.grown
    scale = Math.min(scale, Math.max((distance - required) / grown, halves / grown))
  }
  return scale
}

type GapPair = { p: Segment; q: Segment } & Nearest

/**
 * 속공간을 이루는 틈 선별 — 지키기(깎기)와 벌리기가 같은 거름망을 쓴다.
 * 남는 것: 나란하거나 마주 본 두 토막 사이, 굵기 400 틈이 `minGap`을 넘는 것.
 * 빠지는 것: 원래 붙여 그린 틈, 벌어진 쐐기(ㅆ 엇갈린 X · ㅈ 다리), 한 획 굽은 길의 이웃 토막(ㅇ 둘레),
 * 이어진 두 획이 이음 자리에서 벌어지는 쐐기(ㅅ 두 다리 — 틈이 0부터 연속이라 지키면 자소가 400에 묶인다).
 */
function counterGapPairs(segments: Segment[], minGap: number): GapPair[] {
  return counterGapFilter(allSegmentPairs(segments), minGap)
}

/** 모든 토막 쌍과 가장 가까운 자리. 벌리기의 보호 제약도 이 원본을 쓴다. */
function allSegmentPairs(segments: Segment[]): GapPair[] {
  const pairs: GapPair[] = []
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) pairs.push({ p: segments[i], q: segments[j], ...nearestBetween(segments[i], segments[j]) })
  }
  return pairs
}

function counterGapFilter(pairs: GapPair[], minGap: number): GapPair[] {
  // 서로 이어진 두 획의 이음 자리(잉크가 겹치는 가장 가까운 곳). ㅅ 두 다리 꼭대기, ㅁ 모서리.
  const joints = new Map<string, { x: number; y: number; distance: number }>()
  for (const pair of pairs) {
    if (pair.p.stroke === pair.q.stroke || pair.distance > pair.p.half + pair.q.half) continue
    const key = `${pair.p.stroke}:${pair.q.stroke}`
    if ((joints.get(key)?.distance ?? Infinity) <= pair.distance) continue
    joints.set(key, { x: (pair.pointP.x + pair.pointQ.x) / 2, y: (pair.pointP.y + pair.pointQ.y) / 2, distance: pair.distance })
  }
  return pairs.filter(({ p, q, distance, atP, atQ, pointP, pointQ }) => {
    if (distance - (p.half + q.half) <= minGap) return false
    if (!parallel(p, q)) return false
    if (p.stroke === q.stroke && !facing(p, q) && distance >= 0.5 * alongStroke(atP, atQ, p)) return false
    const joint = p.stroke === q.stroke ? undefined : joints.get(`${p.stroke}:${q.stroke}`)
    if (joint && !facing(p, q) && distance >= 0.5 * (Math.hypot(pointP.x - joint.x, pointP.y - joint.y) + Math.hypot(pointQ.x - joint.x, pointQ.y - joint.y))) return false
    return true
  })
}

export interface GapOpeningOptions {
  /** 벌릴 바닥 — 굵어진 두께(틈 양쪽 평균)의 비율. 참고 폰트 역추론 값 0.25(`weight-gap-rule.v1`, 900 재현 오차 6u). */
  opening?: number
  /** 자소 사이 틈도 벌린다(플랜 단계 3). 기본은 자소 안만(단계 2). */
  betweenParts?: boolean
  /** 획 하나가 움직일 수 있는 최대 거리(글자 칸 단위). 참고 폰트 실측 20~35u — 기본 0.04. */
  maxShift?: number
  /**
   * 축별 이동 상한 = 자소 상자 크기 × 이 비율. 작은 받침 · 겹닿자 칸에서 절대 상한(40u)이 상자의 20%에 달해
   * 글자꼴이 망가졌다(뷁의 ㅂ 가로줄기가 227u 상자에서 40u 올라가 ㅁ처럼 — 10-02 눈 ② 첫 판 기각 사유). 기본 0.06.
   */
  maxShiftFraction?: number
}

/**
 * 속공간 벌리기 층 — 좁은 틈만 획 중심을 옮겨 벌린다. 플랜 `docs/plans/2026-10-02_속공간-벌리기-층.md` 2단계.
 *
 * 참고 폰트 역추론(G0): 두께는 안 깎고, 그냥 두면 바닥(= 0.25 × 굵어진 두께) 아래로 갈 틈만
 * 양쪽 획이 반반으로 틈에서 멀어진다. 넉넉한 틈은 손 안 대고, 쐐기 · 원래 붙여 그린 틈은 예외.
 * 틈 선별은 깎기와 같은 거름망(`counterGapPairs`), 틈은 늘 굵기 400 모양에서 고른다.
 *
 * 획은 통째로 움직인다(중심선 이동 — 두께 고정 모델과 충돌 없음). 한 획 안의 틈(ㅇ · ㅁ 속)은 이동으로 못 벌려 안 다룬다.
 * 중심선은 자소 상자(그 자소 획 상자들의 합) 밖으로 못 나간다 — 바깥 여유가 없으면 그 틈은 남는다(`unresolved`, 깎기의 몫).
 * 여러 틈이 한 획을 서로 반대로 밀면 반복 풀기로 남는 여유만큼 나눈다. 굵기 400 이하는 아무것도 안 바꾼다.
 *
 * 반환 `shifts`: 획마다 (x, y) 이동(글자 칸 단위, 0 = 그대로). `unresolved`: 바닥까지 못 벌린 틈 수.
 */
export function gapOpeningShifts(
  strokes: readonly PartedCounterKeepStroke[],
  weightMultiplier: number,
  stemScale = 1,
  options: GapOpeningOptions = {},
): { shifts: { x: number; y: number }[]; unresolved: number } {
  const shifts = strokes.map(() => ({ x: 0, y: 0 }))
  if (!(weightMultiplier > 1) || strokes.length < 2) return { shifts, unresolved: 0 }
  const segments = segmentsOf(strokes, stemScale, weightMultiplier, 1)
  const thickness = strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)]
  const opening = options.opening ?? DEFAULT_BETWEEN_OPENING
  const parts = strokes.map((item) => jamoOfPart(item.part))
  const rawPairs = allSegmentPairs(segments).filter((gap) => gap.p.stroke !== gap.q.stroke && gap.distance > 0)
  // 벌릴 틈: 깎기와 같은 거름망(나란함 · 쐐기 제외)을 지나고, 범위(자소 안 / 사이) 안인 것.
  const gaps = counterGapFilter(rawPairs, thickness * MIN_GAP_RATIO).filter((gap) =>
    options.betweenParts || parts[gap.p.stroke] === parts[gap.q.stroke])
  if (gaps.length === 0) return { shifts, unresolved: 0 }
  // 보호할 틈: 겹치지 않은 모든 획 쌍 — 나란하지 않아도(ㅎ 보 ↔ 동그라미), 다른 자소여도, 원래 붙다시피인 쌍(ㅎ 꼭지 ↔ 보)도.
  // 한 틈을 벌리려는 이동이 이런 쌍을 시작 관계보다 가깝게 만들면 안 된다 — 글자꼴은 획 사이 관계가 정한다.
  const guards = rawPairs
  // 중심선이 자소 상자 밖으로 못 나가게 — 획마다 네 방향 여유를 잰다.
  const partBox = new Map<string, { left: number; right: number; top: number; bottom: number }>()
  strokes.forEach((item, index) => {
    const box = partBox.get(parts[index]) ?? { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
    partBox.set(parts[index], {
      left: Math.min(box.left, item.box.x), right: Math.max(box.right, item.box.x + item.box.width),
      top: Math.min(box.top, item.box.y), bottom: Math.max(box.bottom, item.box.y + item.box.height),
    })
  })
  const centerBounds = strokes.map(() => ({ left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }))
  for (const segment of segments) {
    const bounds = centerBounds[segment.stroke]
    bounds.left = Math.min(bounds.left, segment.ax, segment.bx)
    bounds.right = Math.max(bounds.right, segment.ax, segment.bx)
    bounds.top = Math.min(bounds.top, segment.ay, segment.by)
    bounds.bottom = Math.max(bounds.bottom, segment.ay, segment.by)
  }
  // 이동 상한: 절대값(40u)과 자소 상자 비율 중 작은 쪽 — 작은 받침 칸에서 획이 상자의 20%씩 밀려 글자꼴이 망가지지 않게.
  const maxShift = options.maxShift ?? 0.04
  const fraction = options.maxShiftFraction ?? 0.06
  const room = strokes.map((_, index) => {
    const box = partBox.get(parts[index])!
    const bounds = centerBounds[index]
    const capX = Math.min(maxShift, fraction * (box.right - box.left))
    const capY = Math.min(maxShift, fraction * (box.bottom - box.top))
    return {
      left: Math.min(capX, Math.max(0, bounds.left - box.left)), right: Math.min(capX, Math.max(0, box.right - bounds.right)),
      up: Math.min(capY, Math.max(0, bounds.top - box.top)), down: Math.min(capY, Math.max(0, box.bottom - bounds.bottom)),
    }
  })
  // 제약 = 보호 쌍 전부. `floor`(하드) = 그냥 둔 값: **어떤 획 쌍도 그냥 둔 것보다 가까워지지 않는다** — 벌리기는 공짜 자리만 쓴다.
  // 조금이라도 양보를 허용하면(바닥 × 1.5, 기존의 30% 따위) "좁음" 문턱(같은 0.25 × 두께)에 걸친 ㅎ류가 계속 경계선을 넘었다.
  // 참고 폰트도 한 속공간을 눌러 다른 속공간을 벌지 않는다(이동은 바깥쪽 · 상자 성장). 글자꼴은 획 사이 관계가 정한다.
  // `target`(소프트, 벌릴 틈만): 바닥까지 벌린다.
  const openable = new Set(gaps)
  const constraints = guards.map((gap) => {
    const base = gap.distance - gap.p.grown - gap.q.grown
    const required = opening * (gap.p.grown + gap.q.grown)
    return {
      i: gap.p.stroke, j: gap.q.stroke,
      nx: (gap.pointQ.x - gap.pointP.x) / gap.distance, ny: (gap.pointQ.y - gap.pointP.y) / gap.distance,
      base, required, floor: base, target: openable.has(gap) ? required : undefined,
    }
  })
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
  const gapNowOf = (c: (typeof constraints)[number]) =>
    c.base + (shifts[c.j].x - shifts[c.i].x) * c.nx + (shifts[c.j].y - shifts[c.i].y) * c.ny
  const apply = (push: { x: number; y: number }[]) => strokes.forEach((_, index) => {
    // `|| 0`: 여유가 0일 때 clamp가 `-0`을 돌려주는 것을 0으로.
    shifts[index].x = clamp(shifts[index].x + push[index].x, -room[index].left, room[index].right) || 0
    shifts[index].y = clamp(shifts[index].y + push[index].y, -room[index].up, room[index].down) || 0
  })
  // 소프트 한 걸음 → 하드 복원 수렴(사영). 힘 비율로 섞으면 소프트 결핍이 큰 곳에서 평형이 보호선을 뚫는다
  // (갛 600: 보가 동그라미 틈을 벌리려고 꼭지 틈 33u를 11u까지 눌렀다) — 복원을 끝까지 돌려 하드가 늘 이기게 한다.
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const push = strokes.map(() => ({ x: 0, y: 0 }))
    let moved = false
    for (const c of constraints) {
      if (c.target === undefined) continue
      const soft = c.target - gapNowOf(c)
      if (soft <= 1e-6) continue
      // 반반 · 조금씩 — 한 획에 여러 틈이 겹쳐도 안 튀게.
      const step = soft / 16
      push[c.i].x -= c.nx * step
      push[c.i].y -= c.ny * step
      push[c.j].x += c.nx * step
      push[c.j].y += c.ny * step
      moved = true
    }
    if (moved) apply(push)
    for (let repair = 0; repair < 8; repair += 1) {
      const fix = strokes.map(() => ({ x: 0, y: 0 }))
      let violated = false
      for (const c of constraints) {
        const hard = c.floor - gapNowOf(c)
        if (hard <= 1e-6) continue
        const step = hard / 4
        fix[c.i].x -= c.nx * step
        fix[c.i].y -= c.ny * step
        fix[c.j].x += c.nx * step
        fix[c.j].y += c.ny * step
        violated = true
      }
      if (!violated) break
      apply(fix)
      moved = true
    }
    if (!moved) break
  }
  const unresolved = constraints.filter((c) => c.target !== undefined && c.target - gapNowOf(c) > 0.25 * c.target).length
  return { shifts, unresolved }
}

/** 획 묶음의 두께를 배율대로 바꾼 사본. 배율이 1이면 받은 획 그대로. */
export function scaleStrokeThickness<T extends { stroke: StrokeDataV2 }>(item: T, scale: number): T {
  return scale === 1 ? item : { ...item, stroke: { ...item.stroke, thickness: item.stroke.thickness * scale } }
}

/**
 * 자소 사이 지키기(4단계 임시판) — 이웃 자소를 마주 본 획만 덜 굵게. 획 단위 배율(1 이하)을 돌려준다.
 * 틈은 늘 굵기 400 모양에서 고르고, 원래 붙여 그린 쌍(틈 ≤ 두께 × `MIN_GAP_RATIO`)은 놓아 준다 — 자소 안 셈과 같은 원칙.
 * 지킬 틈 = 굵어진 두께 × `opening`(측정의 `닿음` 기준과 같은 1/4). 마주 봄 = 20° 안 나란함 — 빗금 ↔ 기둥은 임시판 밖.
 * 자소 안과 달리 자소 전체가 아니라 닿는 그 획만 얇아진다(ㅣ 기둥이 받침 때문에 통째로 얇아지는 것은 감수 — 임시판).
 */
export function betweenKeepScales(
  strokes: readonly CounterKeepStroke[],
  partOf: readonly number[],
  weightMultiplier: number,
  stemScale = 1,
  horizontalShare = 1,
  opening = MIN_GAP_RATIO,
  minScale = 0,
): number[] {
  const scales = strokes.map(() => 1)
  if (!(weightMultiplier > 1) || strokes.length === 0) return scales
  const segments = segmentsOf(strokes, stemScale, weightMultiplier, horizontalShare)
  const thickness = strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)]
  const minGap = thickness * MIN_GAP_RATIO
  const required = opening * thickness * weightMultiplier
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const p = segments[i]
      const q = segments[j]
      if (partOf[p.stroke] === partOf[q.stroke] || !parallel(p, q)) continue
      const { distance } = nearestBetween(p, q)
      const halves = p.half + q.half
      const gap = distance - halves
      if (gap <= minGap) continue
      // 배율 c에서 틈 = 거리 − c × 목표 반 두께 합 ≥ 지킬 틈. 굵기 400보다 얇게는 안 한다(400에서 이미 좁던 쌍은 여기서 멈춘다).
      // `minScale`: 깎임 바닥 — 한 점이 마주 봤다고 획 전체가 끝까지 눌리지 않게(그 아래로 못 깎은 틈은 좁은 채 남는다).
      const grown = p.grown + q.grown
      const c = Math.max(minScale, Math.min(1, Math.max((distance - required) / grown, halves / grown)))
      if (c < scales[p.stroke]) scales[p.stroke] = c
      if (c < scales[q.stroke]) scales[q.stroke] = c
    }
  }
  return scales
}

/** 자소까지 아는 획: 속공간 지키기 세 층(가로 몫 · 자소 안 · 자소 사이)을 한 번에 셈하는 입력. */
export interface PartedCounterKeepStroke extends CounterKeepStroke { part: string }

export interface CounterKeepOptions {
  floor?: CounterFloor
  horizontalShare?: number
  minScale?: number
  betweenOpening?: number
  /** 자소 사이 깎임의 바닥(0 = 지금처럼 400 두께까지). 눈 ③ 후보 — 제품 기본은 아직 0. */
  betweenMinScale?: number
  /** 합성 바닥: 자소 배율 × 자소 사이 깎임이 이 아래로 못 가게(0 = 없음). 눈 ③ 후보 — 층이 겹쳐도 획이 제 목표의 이 비율은 지킨다. */
  totalMinScale?: number
}

/**
 * 속공간 지키기 전 층을 합친 획별 두께 배율(저장 두께 대비, 기하는 여기에 다시 굵기 배율 k를 곱한다).
 * 획 i의 배율 = (가로 몫 성장 ÷ k) × 자소 배율(하한선, 바닥 이상) × 자소 사이 배율.
 * 층을 겹쳐도 획이 굵기 400보다 얇아지지 않게 배율 × 그 획의 성장 ≥ 1로 조인다.
 * 굵기 400 이하(k ≤ 1)는 전부 1. 기본 손잡이 = 10-01 눈 ② 확정값(`DEFAULT_*`).
 * 모든 화면 · OTF · 실험실이 이 셈 하나를 쓴다 — 실험실 쪽 입구는 `withCounterKeep`(inkCounterMeasure.ts).
 */
export function counterKeepStrokeFactors(
  strokes: readonly PartedCounterKeepStroke[],
  weightMultiplier: number,
  stemScale = 1,
  options: CounterKeepOptions = {},
): { factors: number[]; partScales: Map<string, number> } {
  const partScales = new Map<string, number>()
  const factors = strokes.map(() => 1)
  const parts = [...new Set(strokes.map((item) => item.part))]
  if (!(weightMultiplier > 1) || strokes.length === 0) {
    for (const part of parts) partScales.set(part, 1)
    return { factors, partScales }
  }
  // 제품 기본(10-02 눈 ③ 뒤집힘): 자소 안 층(하한선 · 가로 몫 · 자소 바닥)은 끈다 — 무보정이 참고 폰트와 더 비슷했고
  // 하한선이 벌린 획 사이 갭이 너무 컸다. 남는 것은 자소끼리 만나는 곳만 떼는 자소 사이 층 + 합성 바닥.
  // 옛 결정값(B′ · 0.526 · 0.8)은 `DEFAULT_*` 상수로 남아 실험실 손잡이로만 쓴다.
  const floor = options.floor ?? DEFAULT_COUNTER_FLOOR
  const horizontalShare = options.horizontalShare ?? 1
  const minScale = options.minScale ?? 1
  const betweenOpening = options.betweenOpening ?? DEFAULT_BETWEEN_OPENING
  for (const part of parts) {
    // 지킬 틈은 늘 굵기 400 모양에서 고른다. `minScale`: 자소 배율 바닥 — 한 글자 안 자소 굵기가 너무 갈리지 않게.
    partScales.set(part, Math.max(minScale, counterKeepScale(strokes.filter((item) => item.part === part), weightMultiplier, floor, stemScale, horizontalShare)))
  }
  const between = betweenOpening > 0
    ? betweenKeepScales(strokes, strokes.map((item) => parts.indexOf(item.part)), weightMultiplier, stemScale, horizontalShare, betweenOpening, options.betweenMinScale ?? 0)
    : undefined
  strokes.forEach((item, index) => {
    const growth = strokeGrowthOf(horizontalShare === 1 ? 1 : strokeVerticalness(item.stroke, item.box), weightMultiplier, horizontalShare)
    const jamoScale = partScales.get(item.part) ?? 1
    // 몫 1이면 성장 = k라 나눗셈 없이 1 — 부동소수점까지 기존 경로와 같게.
    const shared = horizontalShare === 1 ? 1 : growth / weightMultiplier
    // 층을 겹쳐도(자소 배율 × 자소 사이) 획이 굵기 400보다 얇아지지는 않게 — 배율 × 그 획의 성장은 1을 안 깬다.
    const clamped = between ? Math.max(between[index], growth > 0 ? 1 / (growth * jamoScale) : between[index]) : 1
    // 합성 바닥: 두 층을 합친 깎임이 `totalMinScale` 아래로 못 가게 — 한 획만 끝까지 눌리는 것을 막는다.
    // 바닥이 없으면 곱 순서를 기존 그대로 둬 부동소수점까지 같게 유지한다.
    const total = options.totalMinScale ?? DEFAULT_TOTAL_MINSCALE
    factors[index] = total > 0 && jamoScale * clamped < total ? shared * total : shared * jamoScale * clamped
  })
  return { factors, partScales }
}
