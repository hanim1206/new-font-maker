import type { AnchorPoint, StrokeDataV2, StrokeLinecap } from '../types'

/**
 * 그린 획에 역할 붙이기 (플랜 2026-10-05 고스트 따라 긋기).
 *
 * 엔진은 획의 모양이 아니라 id · 순서 · 방향 · 채널로 판단한다. 그래서 그린 획을 프리셋 획에 1:1로 대응시키고,
 * 점수가 문턱 `tau` 이상인 쌍은 프리셋 획의 역할(id · closed · 두께 · 끝모양)을 승계해 좌표만 바꾼다.
 * 짝이 없는 그린 획은 자유 획(`pen-…` id)으로 남고, 짝이 없는 프리셋 획은 빠진 획으로 보고한다.
 *
 * 점수(0–1)는 현 각도 · 중심 위치 · 크기 · 닫힘의 가중합이다. 좌표는 전부 같은 상자의 0–1.
 * 섞임홀자는 채널(가로부 · 세로부)마다 상자가 달라서 채널별로 따로 부른다.
 */

export interface RoleMatchOptions {
  /** 이 점수 미만이면 짝으로 안 본다. */
  tau?: number
  /** 자유 획 id의 자모 표시(`pen-<jamo>-<n>`). */
  jamoKey?: string
  /**
   * 닫힌 역할과 짝이 됐지만 끝이 두께 안으로 안 만나는 그린 획을, 열린 채로 그 역할에 붙여도 되는지(그린 획 인덱스).
   * 되면 id · 두께 · 끝모양만 승계하고 점과 닫힘은 그은 그대로 둔다. 안 주면 자유 획으로 돌린다.
   */
  openAsClosed?: (drawn: number) => boolean
}

export interface RolePair {
  drawn: number
  preset: number
  score: number
}

export type JamoRecognition = 'recognized' | 'partial' | 'free'

export interface RoleMatch {
  pairs: RolePair[]
  /** 짝 없는 그린 획 인덱스. */
  free: number[]
  /** 짝 없는 프리셋 획 인덱스(안 그린 획). */
  missing: number[]
  /** 전부 짝 = 인식됨, 일부 = 일부 자유, 짝 0 = 자유. */
  state: JamoRecognition
}

export const ROLE_MATCH_TAU = 0.65
export const ROLE_MATCH_TAU_CANDIDATES = [0.5, 0.65, 0.8] as const

const WEIGHT = { angle: 0.35, position: 0.35, size: 0.2, closed: 0.1 } as const
/** 중심이 이만큼(상자 비율) 떨어지면 위치 점수 0. */
const POSITION_SPAN = 0.5
/** 짝 짓기를 전수로 도는 최대 획 수. 넘으면 탐욕으로. */
const BRUTE_FORCE_MAX = 7

interface Signature {
  /** 현(첫 점→끝 점)의 방향, 0–180도. 닫힌 획은 의미 없음. */
  angle: number
  center: { x: number; y: number }
  /** 상자 대각선 길이(0–√2). */
  size: number
  closed: boolean
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

function signatureOf(stroke: Pick<StrokeDataV2, 'points' | 'closed'>): Signature {
  const points = stroke.points
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const first = points[0]
  const last = points[points.length - 1]
  const angle = ((Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI + 360) % 180
  return {
    angle,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    size: Math.hypot(maxX - minX, maxY - minY),
    closed: stroke.closed,
  }
}

/** 두 방향(0–180)의 차, 0–90. */
const angleGap = (a: number, b: number) => {
  const gap = Math.abs(a - b) % 180
  return Math.min(gap, 180 - gap)
}

/** 그린 획 ↔ 프리셋 획 한 쌍의 점수(0–1). */
export function strokeRoleScore(drawn: Pick<StrokeDataV2, 'points' | 'closed'>, preset: Pick<StrokeDataV2, 'points' | 'closed'>): number {
  if (drawn.points.length === 0 || preset.points.length === 0) return 0
  const a = signatureOf(drawn)
  const b = signatureOf(preset)
  // 닫힌 획은 현 방향이 뜻이 없다. 둘 다 닫혔으면 각도는 만점.
  const angle = a.closed && b.closed ? 1 : 1 - angleGap(a.angle, b.angle) / 90
  const position = 1 - Math.min(distance(a.center, b.center) / POSITION_SPAN, 1)
  const size = a.size === 0 && b.size === 0 ? 1 : Math.min(a.size, b.size) / Math.max(a.size, b.size)
  const closed = a.closed === b.closed ? 1 : 0
  return WEIGHT.angle * angle + WEIGHT.position * position + WEIGHT.size * size + WEIGHT.closed * closed
}

/** 점수 행렬에서 합이 가장 큰 1:1 짝. 작은 쪽을 기준으로 전수 또는 탐욕. */
function assign(scores: number[][]): [number, number][] {
  const rows = scores.length
  const cols = scores[0]?.length ?? 0
  if (rows === 0 || cols === 0) return []
  if (Math.min(rows, cols) <= BRUTE_FORCE_MAX && Math.max(rows, cols) <= BRUTE_FORCE_MAX + 2) {
    let best: [number, number][] = []
    let bestSum = -1
    const used = new Array<boolean>(cols).fill(false)
    const walk = (row: number, picked: [number, number][], sum: number) => {
      if (row === rows) {
        if (sum > bestSum) { bestSum = sum; best = [...picked] }
        return
      }
      // 이 줄을 비워 두는 경우(열이 모자랄 때)
      walk(row + 1, picked, sum)
      for (let col = 0; col < cols; col++) {
        if (used[col]) continue
        used[col] = true
        picked.push([row, col])
        walk(row + 1, picked, sum + scores[row][col])
        picked.pop()
        used[col] = false
      }
    }
    walk(0, [], 0)
    return best
  }
  const picked: [number, number][] = []
  const usedRow = new Set<number>()
  const usedCol = new Set<number>()
  const all: [number, number, number][] = []
  scores.forEach((line, row) => line.forEach((score, col) => all.push([score, row, col])))
  all.sort((p, q) => q[0] - p[0])
  for (const [, row, col] of all) {
    if (usedRow.has(row) || usedCol.has(col)) continue
    usedRow.add(row); usedCol.add(col)
    picked.push([row, col])
  }
  return picked
}

/** 그린 획들을 프리셋 획들에 1:1로 대응시킨다. `tau` 미만인 쌍은 푼다. */
export function matchStrokeRoles(drawn: readonly StrokeDataV2[], presets: readonly StrokeDataV2[], options: RoleMatchOptions = {}): RoleMatch {
  const tau = options.tau ?? ROLE_MATCH_TAU
  const scores = drawn.map((stroke) => presets.map((preset) => strokeRoleScore(stroke, preset)))
  const pairs = assign(scores)
    .map(([d, p]) => ({ drawn: d, preset: p, score: scores[d][p] }))
    .filter((pair) => pair.score >= tau)
    .sort((a, b) => a.preset - b.preset)
  const pairedDrawn = new Set(pairs.map((pair) => pair.drawn))
  const pairedPreset = new Set(pairs.map((pair) => pair.preset))
  const free = drawn.map((_, index) => index).filter((index) => !pairedDrawn.has(index))
  const missing = presets.map((_, index) => index).filter((index) => !pairedPreset.has(index))
  const state: JamoRecognition = pairs.length === 0 ? 'free' : free.length === 0 && missing.length === 0 ? 'recognized' : 'partial'
  return { pairs, free, missing, state }
}

interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** 중심선을 점으로 편다 — 곡선이 앵커 밖으로 불룩한 만큼까지 범위에 넣기 위해. */
export function flattenCenterline(stroke: Pick<StrokeDataV2, 'points' | 'closed'>, steps = 16): { x: number; y: number }[] {
  const points = stroke.points
  const out: { x: number; y: number }[] = []
  const count = stroke.closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    out.push({ x: a.x, y: a.y })
    if (!a.handleOut || !b.handleIn) continue
    for (let s = 1; s < steps; s++) {
      const t = s / steps, u = 1 - t
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
      out.push({ x: w0 * a.x + w1 * a.handleOut.x + w2 * b.handleIn.x + w3 * b.x, y: w0 * a.y + w1 * a.handleOut.y + w2 * b.handleIn.y + w3 * b.y })
    }
  }
  const last = points[points.length - 1]
  if (last) out.push({ x: last.x, y: last.y })
  return out
}

/** 중심선 범위(두께는 안 더한다 — 엔진이 칸을 잴 때 중심선 범위에 두께/2를 바깥으로 더하므로 프리셋과 같은 잣대다). */
function boundsOf(strokes: readonly Pick<StrokeDataV2, 'points' | 'closed'>[]): Bounds | null {
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const stroke of strokes) for (const point of flattenCenterline(stroke)) {
    bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x)
    bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y)
  }
  return Number.isFinite(bounds.minX) ? bounds : null
}

/** 축의 범위가 이보다 좁으면(ㅣ의 가로, ㅡ의 세로) 늘리지 않고 가운데만 맞춘다. */
const FLAT_AXIS = 0.05
/** 또는 다른 축 범위의 이 비율보다 좁아도 납작한 축이다 — 거의 세로인 획(폭 0.06)을 가로로 20배 늘려 대각선으로 만들지 않는다(10-06 사용자 제보). */
const FLAT_RATIO = 0.25

/**
 * 그린 획 묶음을 프리셋 획 묶음의 범위에 꽉 채운다 — 작게 그려도, 한쪽에 치우쳐 그려도 칸을 채운 모양이 된다(10-05 사용자 결정).
 * 자모 전체 범위를 한 번에 옮기므로 획 사이 비율은 그대로다. 핸들도 같이 옮긴다.
 * 어느 쪽이든 한 축이 납작하면(`FLAT_AXIS` 미만) 그 축은 다른 축의 배율로 늘리고 가운데를 맞춘다.
 */
export function fitStrokesToPresetBounds(drawn: readonly StrokeDataV2[], presets: readonly StrokeDataV2[]): StrokeDataV2[] {
  const to = boundsOf(presets)
  return to ? fitStrokesToBounds(drawn, to) : [...drawn]
}

/** 그린 획 묶음의 중심선 범위를 `to`에 맞춘다(`fitStrokesToPresetBounds`의 몸통 — 납작한 축 규칙이 같다). */
function fitStrokesToBounds(drawn: readonly StrokeDataV2[], to: Bounds): StrokeDataV2[] {
  const from = boundsOf(drawn)
  if (!from) return [...drawn]
  const fromW = from.maxX - from.minX, fromH = from.maxY - from.minY
  const toW = to.maxX - to.minX, toH = to.maxY - to.minY
  const flatX = fromW < FLAT_AXIS || toW < FLAT_AXIS || fromW < fromH * FLAT_RATIO
  const flatY = fromH < FLAT_AXIS || toH < FLAT_AXIS || fromH < fromW * FLAT_RATIO
  let scaleX = flatX ? NaN : toW / fromW
  let scaleY = flatY ? NaN : toH / fromH
  if (Number.isNaN(scaleX) && Number.isNaN(scaleY)) { scaleX = 1; scaleY = 1 }
  else if (Number.isNaN(scaleX)) scaleX = scaleY
  else if (Number.isNaN(scaleY)) scaleY = scaleX
  const fromCX = (from.minX + from.maxX) / 2, fromCY = (from.minY + from.maxY) / 2
  const toCX = (to.minX + to.maxX) / 2, toCY = (to.minY + to.maxY) / 2
  const map = (p: { x: number; y: number }) => ({ x: toCX + (p.x - fromCX) * scaleX, y: toCY + (p.y - fromCY) * scaleY })
  return drawn.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => {
      const next: AnchorPoint = { ...point, ...map(point) }
      if (point.handleIn) next.handleIn = map(point.handleIn)
      if (point.handleOut) next.handleOut = map(point.handleOut)
      return next
    }),
  }))
}

/**
 * 연달아 그은 두 획의 끝점이 `gap` 안이면 한 획으로 잇는다(10-05 사용자 결정) — ㄱ · ㄹ처럼 프리셋이 한 획인 자모를 나눠 그었을 때.
 * 끝점과 끝점만 잇는다. 방향이 반대면 뒤집어 잇고, 이음매는 꺾임(핸들 없음)으로 둔다. 기둥 중간에 닿는 곁줄기는 잇지 않는다.
 * 순서가 떨어진 획끼리는 보지 않는다 — 그린 순서대로 앞 획에 붙일 수 있는지만 본다. 닫힌 획은 건너뛴다.
 */
export function joinStrokesAtEnds(strokes: readonly StrokeDataV2[], gap: number): StrokeDataV2[] {
  const out: StrokeDataV2[] = []
  for (const stroke of strokes) {
    const prev = out[out.length - 1]
    if (!prev || prev.closed || stroke.closed || prev.points.length < 2 || stroke.points.length < 2) { out.push(stroke); continue }
    const a0 = prev.points[0], a1 = prev.points[prev.points.length - 1]
    const b0 = stroke.points[0], b1 = stroke.points[stroke.points.length - 1]
    // 앞 획의 끝에 붙이는 두 경우를 먼저, 앞 획의 시작에 붙이는 두 경우를 다음에.
    const candidates: { d: number; head: AnchorPoint[]; tail: AnchorPoint[] }[] = [
      { d: distance(a1, b0), head: prev.points, tail: stroke.points },
      { d: distance(a1, b1), head: prev.points, tail: reversed(stroke.points) },
      { d: distance(a0, b1), head: stroke.points, tail: prev.points },
      { d: distance(a0, b0), head: reversed(stroke.points), tail: prev.points },
    ]
    const best = candidates.reduce((pick, item) => (item.d < pick.d ? item : pick))
    if (best.d > gap) { out.push(stroke); continue }
    const seamA = best.head[best.head.length - 1]
    const seamB = best.tail[0]
    const seam: AnchorPoint = { x: (seamA.x + seamB.x) / 2, y: (seamA.y + seamB.y) / 2 }
    if (seamA.handleIn) seam.handleIn = { ...seamA.handleIn }
    if (seamB.handleOut) seam.handleOut = { ...seamB.handleOut }
    out[out.length - 1] = { ...prev, points: [...best.head.slice(0, -1), seam, ...best.tail.slice(1)] }
  }
  return out
}

function reversed(points: readonly AnchorPoint[]): AnchorPoint[] {
  return [...points].reverse().map((point) => {
    const { handleIn, handleOut, ...rest } = point
    const next: AnchorPoint = { ...rest }
    if (handleOut) next.handleIn = handleOut
    if (handleIn) next.handleOut = handleIn
    return next
  })
}

/** 열린 획의 시작 · 끝이 `gap` 안이면 닫는다 — 마지막 앵커를 떼고 closed(앵커가 셋뿐이면 떼지 않는다). 아니면 null. */
export function closeIfNear(stroke: StrokeDataV2, gap: number): StrokeDataV2 | null {
  const points = stroke.points
  if (stroke.closed || points.length < 3) return null
  if (distance(points[0], points[points.length - 1]) > gap) return null
  // 앵커 셋으로 맞춰진 둥근 획은 끝 앵커를 떼면 둘만 남아 납작해진다 — 그대로 두고 닫기만 한다(끝과 시작 사이는 두께 안의 짧은 마디).
  if (points.length === 3) return { ...stroke, closed: true }
  const kept = points.slice(0, -1).map((point) => ({ ...point }))
  const last = points[points.length - 1]
  // 끝 앵커의 들어오는 핸들을 첫 앵커로 옮겨 마지막 마디가 매끈히 닫히게.
  if (last.handleIn) kept[0] = { ...kept[0], handleIn: { ...last.handleIn } }
  return { ...stroke, points: kept, closed: true }
}

/**
 * 짝에 따라 역할을 승계한 획 배열. 순서는 프리셋 순서(엔진이 인덱스로 짝 짓는 곳이 있다), 자유 획은 뒤에 붙는다.
 * 프리셋이 닫힌 획이면 그린 획의 끝이 두께 안일 때 닫는다. 아니면 `openAsClosed`가 허락할 때 열린 채로 승계하고, 그것도 아니면 자유 획으로 돌린다.
 * 방향은 프리셋과 맞춘다 — 그린 시작점이 프리셋 끝점에 더 가까우면 뒤집는다.
 */
export function adoptStrokeRoles(drawn: readonly StrokeDataV2[], presets: readonly StrokeDataV2[], match: RoleMatch, options: RoleMatchOptions = {}): { strokes: StrokeDataV2[]; state: JamoRecognition; freeIds: string[]; ids: string[] } {
  const jamoKey = options.jamoKey ?? 'jamo'
  const thickness = presets[0]?.thickness ?? drawn[0]?.thickness ?? 0.07
  const adopted: StrokeDataV2[] = []
  // 그린 획 인덱스 → 붙은 id. 호출자가 방금 그은 획이 무엇이 됐는지 찾는 데 쓴다.
  const ids: string[] = []
  const free = [...match.free]
  for (const pair of match.pairs) {
    const preset = presets[pair.preset]
    let stroke = drawn[pair.drawn]
    let closed = preset.closed
    if (preset.closed) {
      const joined = closeIfNear(stroke, preset.thickness)
      if (joined) stroke = joined
      else if (options.openAsClosed?.(pair.drawn)) closed = false
      else { free.push(pair.drawn); continue }
    } else {
      const first = stroke.points[0]
      const last = stroke.points[stroke.points.length - 1]
      const presetFirst = preset.points[0]
      const presetLast = preset.points[preset.points.length - 1]
      if (distance(first, presetLast) + distance(last, presetFirst) < distance(first, presetFirst) + distance(last, presetLast)) {
        stroke = { ...stroke, points: reversed(stroke.points) }
      }
    }
    const next: StrokeDataV2 = { ...stroke, id: preset.id, closed, thickness: preset.thickness }
    if (preset.label !== undefined) next.label = preset.label
    if (preset.linecap !== undefined) next.linecap = preset.linecap
    if (preset.linejoin !== undefined) next.linejoin = preset.linejoin
    adopted.push(next)
    ids[pair.drawn] = next.id
  }
  free.sort((a, b) => a - b)
  const freeIds: string[] = []
  free.forEach((index, n) => {
    const id = `pen-${jamoKey}-${n + 1}`
    freeIds.push(id)
    ids[index] = id
    adopted.push({ ...drawn[index], id, thickness })
  })
  const state: JamoRecognition = adopted.length === freeIds.length ? 'free' : freeIds.length === 0 && match.missing.length === 0 ? 'recognized' : 'partial'
  return { strokes: adopted, state, freeIds, ids }
}

/** 잉크(중심선 + 굵기 반 + 끝 모양)가 중심선 범위 밖으로 나가는 폭. 마디마다 양옆으로 굵기 반을 벌리고, 끝이 둥글거나 네모면 끝을 앞으로 내민다. */
function inkPadsOf(strokes: readonly StrokeDataV2[], half: { x: number; y: number }, linecap: StrokeLinecap): Bounds | null {
  const center = boundsOf(strokes)
  if (!center) return null
  const ink: Bounds = { ...center }
  const add = (x: number, y: number) => {
    ink.minX = Math.min(ink.minX, x); ink.maxX = Math.max(ink.maxX, x)
    ink.minY = Math.min(ink.minY, y); ink.maxY = Math.max(ink.maxY, y)
  }
  for (const stroke of strokes) {
    const points = flattenCenterline(stroke)
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1]
      // 굵기는 em으로 같아도 상자 좌표에선 축마다 다르다 — em 공간에서 법선을 구해 축별로 되돌린다.
      const dx = (b.x - a.x) / half.x, dy = (b.y - a.y) / half.y
      const length = Math.hypot(dx, dy)
      if (length === 0) continue
      const nx = -dy / length * half.x, ny = dx / length * half.y
      for (const p of [a, b]) { add(p.x + nx, p.y + ny); add(p.x - nx, p.y - ny) }
    }
    if (!stroke.closed && (stroke.linecap ?? linecap) !== 'butt' && points.length > 0) {
      for (const end of [points[0], points[points.length - 1]]) { add(end.x - half.x, end.y - half.y); add(end.x + half.x, end.y + half.y) }
    }
  }
  return { minX: center.minX - ink.minX, maxX: ink.maxX - center.maxX, minY: center.minY - ink.minY, maxY: ink.maxY - center.maxY }
}

/**
 * 잉크가 자모 상자(0–1) 안에 들도록 획 묶음을 맞춘다(10-05 사용자 결정 — 윤곽까지 상자 안).
 * 잉크가 상자 밖으로 내미는 쪽만 그만큼 중심선 범위를 안으로 당긴다(획 사이 비율은 지킨다). `half`는 굵기 반을 상자 좌표로 옮긴 축별 값.
 * 법선이 배율에 따라 조금 바뀌므로 두 번 맞춘다.
 */
export function fitStrokesInkToUnitBox(strokes: readonly StrokeDataV2[], half: { x: number; y: number }, linecap: StrokeLinecap = 'round'): StrokeDataV2[] {
  let out = [...strokes]
  for (let pass = 0; pass < 2; pass++) {
    const pads = inkPadsOf(out, half, linecap)
    const center = boundsOf(out)
    if (!pads || !center) return out
    // 상자 밖으로 나가는 쪽만 줄인다. 프리셋이 상자를 다 안 쓰는 자모(가운데 놓인 획)는 그대로다.
    out = fitStrokesToBounds(out, {
      minX: Math.max(center.minX, pads.minX), maxX: Math.min(center.maxX, 1 - pads.maxX),
      minY: Math.max(center.minY, pads.minY), maxY: Math.min(center.maxY, 1 - pads.maxY),
    })
  }
  return out
}
