import type { DecomposedSyllable, JamoData, PathPoint, StrokeDataV2 } from '../types'
import { withFrameFrom } from '../utils/jamoFrame'

/**
 * 획 꼴 규칙(배치 규칙 실험 2차). 자리를 다 정한 뒤 그릴 때만 획 꼴을 바꾼다 — 저장된 자모(baseJamos)는 그대로 둔다.
 * 바꾸기 전 획을 틀로 굳혀 두므로 상자 맞춤은 바뀌지 않고, 바뀐 획만 틀 안팎으로 움직인다.
 *
 * 첫 규칙 — ㄱ 삐침: 오른홀자 옆 ㄱ ㅋ ㄲ의 세로줄기를 꺾어 내리지 않고 노토처럼 왼쪽 아래로 휘어 쓸어내린다.
 * 휨은 노토 윤곽에서 잰 중심선(ㄱ ㅋ ㄲ × 오른홀자 9 × 받침 다섯 = 135자 중앙값)에 3차 곡선을 맞춘 값이다.
 */

export interface StrokeShapeParams {
  /** ㄱ ㅋ ㄲ 세로줄기를 삐침으로. */
  giyeokSweep: boolean
  /** ㄴ ㄷ ㄸ ㄹ ㅌ ㅍ 맨 아래 가로줄기를 오른쪽으로 빼며 치켜 올린다. */
  bottomKick: boolean
  /** ㅈ ㅊ ㅉ 삐침 · 내림 끝을 바깥으로 더 휘어 뺀다. */
  tailSweep: boolean
  /** 섞임받침을 홑받침 둘로 다시 그린다(받침 상자 안 작은 상자 둘). */
  compoundJong: boolean
}

export const STROKE_SHAPES_OFF: StrokeShapeParams = { giyeokSweep: false, bottomKick: false, tailSweep: false, compoundJong: false }
export const DEFAULT_STROKE_SHAPE_PARAMS: StrokeShapeParams = { giyeokSweep: true, bottomKick: true, tailSweep: true, compoundJong: true }

/** 꼴 규칙을 쓰는 홀자 — 오른홀자 아홉. 아래홀자 옆에서는 노토도 꺾어 내리고 평평하게 맺는다(아직 안 잼). */
export const SWEEP_VOWELS: readonly string[] = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ']

/**
 * 꺾인 획(머리 → 꺾임 → 맺음) 하나의 삐침 꼴. 길이는 모두 원래 획 기준 비율이다.
 * W = 가로줄기 길이(꺾임 x − 머리 x), H = 세로줄기 길이(맺음 y − 꺾임 y).
 */
export interface SweepShape {
  /** 꺾임을 가로로 늘리는 배율(1이면 그대로). */
  cornerScale: number
  /** 맺음: 꺾임에서 왼쪽으로 tailLeft × W, 아래로 tailDown × H. */
  tailLeft: number
  tailDown: number
  /** 꺾임에서 나가는 손잡이: 꺾임 바로 아래 outDown × H. */
  outDown: number
  /** 맺음으로 들어오는 손잡이: 꺾임에서 왼쪽 inLeft × W, 아래 inDown × H. */
  inLeft: number
  inDown: number
}

/** 획 id → 꼴. 값은 `scripts/layout-rules/measure-giyeok-sweep.ts`로 잰 것. */
export const GIYEOK_SWEEP_SHAPES: Readonly<Record<string, SweepShape>> = {
  'ㄱ-1': { cornerScale: 1, tailLeft: 0.98, tailDown: 0.92, outDown: 0.1, inLeft: 0.129, inDown: 0.675 },
  'ㅋ-1': { cornerScale: 1, tailLeft: 0.979, tailDown: 0.92, outDown: 0.2, inLeft: 0.151, inDown: 0.675 },
  // ㄲ 왼 ㄱ은 노토가 가로줄기를 더 길게 뺀다(꺾임 0.362 → 0.42).
  'ㄲ-1': { cornerScale: 1.16, tailLeft: 0.786, tailDown: 0.88, outDown: 0.675, inLeft: 0.821, inDown: 0.625 },
  // ㄲ 오른 ㄱ은 노토가 원래보다 길게(0.728 → 0.95) 내려 쓴다.
  'ㄲ-3': { cornerScale: 1, tailLeft: 0.995, tailDown: 1.305, outDown: 0.343, inLeft: 0.205, inDown: 0.824 },
}

/** ㅋ 가운데 가로줄기 — 휜 세로줄기에 닿는 자리에서 멈춘다. */
const BAR_ENDS_AT_SWEEP: Readonly<Record<string, string>> = { 'ㅋ-3': 'ㅋ-1' }

const plainPoint = (point: PathPoint | undefined): point is PathPoint => !!point && !point.handleIn && !point.handleOut

/** 머리 · 꺾임 · 맺음 세 점에 손잡이 없이, 가로로 갔다 세로로 내려오는 획만 바꾼다. 사용자가 고친 꼴은 건드리지 않는다. */
export function sweepStroke(stroke: StrokeDataV2, shape: SweepShape): StrokeDataV2 | null {
  const [head, corner, tail] = stroke.points
  if (stroke.points.length !== 3 || stroke.closed || ![head, corner, tail].every(plainPoint)) return null
  const W = corner.x - head.x
  const H = tail.y - corner.y
  if (W <= 0 || H <= 0 || Math.abs(head.y - corner.y) > 1e-6 || Math.abs(tail.x - corner.x) > 1e-6) return null
  const cx = head.x + W * shape.cornerScale
  const w = cx - head.x
  return {
    ...stroke,
    points: [
      { x: head.x, y: head.y },
      { x: cx, y: corner.y, handleOut: { x: cx, y: corner.y + shape.outDown * H } },
      { x: cx - shape.tailLeft * w, y: corner.y + shape.tailDown * H, handleIn: { x: cx - shape.inLeft * w, y: corner.y + shape.inDown * H } },
    ],
  }
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/** 휜 세로줄기(꺾임 → 맺음 곡선)가 높이 y를 지나는 x. 곡선 밖이면 null. */
export function sweepXAt(stroke: StrokeDataV2, y: number): number | null {
  const [, a, b] = stroke.points
  if (!a?.handleOut || !b?.handleIn) return null
  if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) return null
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (cubicAt(a.y, a.handleOut.y, b.handleIn.y, b.y, mid) < y) lo = mid
    else hi = mid
  }
  return cubicAt(a.x, a.handleOut.x, b.handleIn.x, b.x, (lo + hi) / 2)
}

function sweepStrokes(strokes: readonly StrokeDataV2[]): StrokeDataV2[] | null {
  let changed = false
  const next = strokes.map((stroke) => {
    const shape = GIYEOK_SWEEP_SHAPES[stroke.id]
    const swept = shape ? sweepStroke(stroke, shape) : null
    if (swept) changed = true
    return swept ?? stroke
  })
  if (!changed) return null
  return next.map((stroke) => {
    const sweepId = BAR_ENDS_AT_SWEEP[stroke.id]
    const sweep = sweepId ? next.find((other) => other.id === sweepId) : undefined
    if (!sweep || stroke.points.length !== 2) return stroke
    const [from, to] = stroke.points
    const x = sweepXAt(sweep, to.y)
    return x === null || x >= to.x ? stroke : { ...stroke, points: [from, { ...to, x }] }
  })
}

/**
 * 둘째 규칙 — 맨 아래 가로줄기 치킴: 오른홀자 옆 ㄴ ㄷ ㄸ ㄹ ㅌ ㅍ의 맨 아래 가로줄기는 노토에서 상자 밖으로 더 나가며 끝이 살짝 올라간다(받침 ㄵ의 ㄴ도).
 * 마지막 토막(꺾임 → 맺음)만 바꾼다. 맺음을 오른쪽으로 reach배(원래 토막 길이 기준) 빼고 rise만큼 올리고,
 * 원래 줄 위 bend 자리에 손잡이를 두어 처음엔 평평하다가 끝으로 갈수록 올라가게 한다.
 */
export interface KickShape {
  reach: number
  rise: number
  bend: number
}

/** 획 id → 꼴. 값은 `scripts/layout-rules/measure-bottom-kick.ts`로 노토 xor가 가장 작은 곳을 찾은 것. */
export const BOTTOM_KICK_SHAPES: Record<string, KickShape> = {
  'ㄴ-1': { reach: 1.0, rise: 0.1, bend: 0.3 },
  'ㄷ-1': { reach: 1.25, rise: 0.08, bend: 0.3 },
  'ㄸ-4': { reach: 1.2, rise: 0.06, bend: 0.3 },
  'ㄹ-1': { reach: 1.4, rise: 0.06, bend: 0.7 },
  'ㅌ-1': { reach: 1.2, rise: 0.06, bend: 0.7 },
  'ㅍ-2': { reach: 1.1, rise: 0.06, bend: 0.3 },
}

/**
 * 왼가지 홀자(ㅓ ㅔ ㅕ ㅖ) 옆 첫닿자. 노토도 가지 밑으로 빼고 올리지만 오른가지 옆의 절반쯤만 뺀다(ㄹ 0.042 em, 오른가지 옆 0.090).
 * 오른가지 값을 그대로 쓰면 오히려 멀어졌다. ㄴ은 노토가 거의 안 빼서 넣지 않는다.
 */
export const BOTTOM_KICK_SHAPES_LEFT_BRANCH: Record<string, KickShape> = {
  'ㄷ-1': { reach: 1.15, rise: 0, bend: 0.3 },
  'ㄸ-4': { reach: 1.15, rise: 0.02, bend: 0.7 },
  'ㄹ-1': { reach: 1.3, rise: 0.04, bend: 0.7 },
  'ㅌ-1': { reach: 1.15, rise: 0.04, bend: 0.7 },
  'ㅍ-2': { reach: 1.05, rise: 0.04, bend: 0.5 },
}

/** 받침 ㄵ의 ㄴ — 노토는 가로줄기를 ㅈ 쪽으로 비스듬히 올려 맺는다(길이는 그대로, 끝이 받침 칸 높이의 0.15 올라감). 홀 받침 ㄴ ㄷ ㄹ ㅌ은 노토도 평평하다. */
export const JONG_KICK_SHAPES: Record<string, KickShape> = {
  'ㄵ종-1': { reach: 0.9, rise: 0.15, bend: 0.3 },
}

/** 치킴을 쓰는 홀자. 오른가지 · ㅣ와 왼가지는 값이 다르다. */
export const KICK_VOWELS: readonly string[] = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅣ']
export const LEFT_BRANCH_KICK_VOWELS: readonly string[] = ['ㅓ', 'ㅔ', 'ㅕ', 'ㅖ']

/** 마지막 토막이 오른쪽으로 가는 가로줄기이고 손잡이가 없는 획만 바꾼다. */
export function kickStroke(stroke: StrokeDataV2, shape: KickShape): StrokeDataV2 | null {
  const count = stroke.points.length
  if (count < 2 || stroke.closed) return null
  const from = stroke.points[count - 2]
  const to = stroke.points[count - 1]
  if (!plainPoint(from) || !plainPoint(to) || Math.abs(from.y - to.y) > 1e-6) return null
  const length = to.x - from.x
  if (length <= 0) return null
  const endX = from.x + length * shape.reach
  return {
    ...stroke,
    points: [
      ...stroke.points.slice(0, count - 1),
      { x: endX, y: to.y - shape.rise, handleIn: { x: from.x + (endX - from.x) * shape.bend, y: to.y } },
    ],
  }
}

const kickStrokesWith = (table: Readonly<Record<string, KickShape>>) => (strokes: readonly StrokeDataV2[]): StrokeDataV2[] | null => {
  let changed = false
  const next = strokes.map((stroke) => {
    const shape = table[stroke.id]
    const kicked = shape ? kickStroke(stroke, shape) : null
    if (kicked) changed = true
    return kicked ?? stroke
  })
  return changed ? next : null
}

/**
 * 셋째 규칙 — ㅈ ㅊ ㅉ 꼬리 휨: 가운데 벌어짐은 노토와 같지만, 노토는 아래로 갈수록 왼 삐침 끝을 더 왼쪽으로, 오른 내림 끝을 더 오른쪽으로 휘어 뺀다.
 * 손잡이 하나짜리 곡선(머리 → 맺음)의 맺음을 (dx, dy)만큼 옮기고 머리 쪽 손잡이를 가로로 hx만큼 옮겨 휨을 바꾼다. 값은 자모 틀 기준 비율이다.
 */
export interface TailShape {
  dx: number
  dy: number
  hx: number
}

/** 홀자 무리 → 획 id → 꼴. 값은 `scripts/layout-rules/measure-tail-sweep.ts`로 노토 xor가 가장 작은 곳을 찾은 것. */
export const TAIL_SHAPES: Record<'right' | 'left' | 'i', Record<string, TailShape>> = {
  right: {
    'ㅈ-left': { dx: -0.02, dy: 0, hx: 0.05 }, 'ㅈ-right': { dx: 0.04, dy: 0, hx: -0.05 },
    'ㅊ-left': { dx: -0.04, dy: 0, hx: 0.05 }, 'ㅊ-right': { dx: 0.04, dy: 0, hx: 0 },
    // ㅉ 둘째 ㅈ의 내림은 노토가 훨씬 길게 끌어내린다.
    'ㅉ-1l': { dx: -0.06, dy: 0, hx: 0.05 }, 'ㅉ-2r': { dx: 0.06, dy: 0.16, hx: -0.1 },
  },
  left: {
    'ㅈ-left': { dx: -0.02, dy: 0, hx: 0.05 }, 'ㅈ-right': { dx: 0.06, dy: 0, hx: -0.05 },
    'ㅊ-left': { dx: -0.04, dy: 0, hx: 0.1 }, 'ㅊ-right': { dx: 0.02, dy: 0, hx: 0 },
    'ㅉ-1l': { dx: -0.04, dy: 0, hx: 0.05 }, 'ㅉ-2r': { dx: 0.06, dy: 0.16, hx: -0.1 },
  },
  // ㅣ 옆은 왼 삐침 끝은 그대로 두고 손잡이만 밀어 더 둥글게, 오른 내림은 가장 많이 뺀다.
  i: {
    'ㅈ-left': { dx: 0, dy: 0, hx: 0.1 }, 'ㅈ-right': { dx: 0.08, dy: 0, hx: 0 },
    'ㅊ-left': { dx: -0.02, dy: 0, hx: 0.15 }, 'ㅊ-right': { dx: 0.06, dy: 0, hx: 0.05 },
    'ㅉ-1l': { dx: -0.04, dy: 0.04, hx: 0.05 }, 'ㅉ-2r': { dx: 0.06, dy: 0.16, hx: -0.05 },
  },
}

export const tailGroupOf = (jung: string): keyof typeof TAIL_SHAPES | null =>
  ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ'].includes(jung) ? 'right' : LEFT_BRANCH_KICK_VOWELS.includes(jung) ? 'left' : jung === 'ㅣ' ? 'i' : null

/** 두 점 곡선(머리에만 손잡이, 맺음은 맨 점)만 바꾼다. */
export function tailStroke(stroke: StrokeDataV2, shape: TailShape): StrokeDataV2 | null {
  const [head, tail] = stroke.points
  if (stroke.points.length !== 2 || stroke.closed || !head.handleOut || head.handleIn || !plainPoint(tail)) return null
  return {
    ...stroke,
    points: [
      { ...head, handleOut: { x: head.handleOut.x + shape.hx, y: head.handleOut.y } },
      { x: tail.x + shape.dx, y: tail.y + shape.dy },
    ],
  }
}

const tailStrokesWith = (table: Readonly<Record<string, TailShape>>) => (strokes: readonly StrokeDataV2[]): StrokeDataV2[] | null => {
  let changed = false
  const next = strokes.map((stroke) => {
    const shape = table[stroke.id]
    const moved = shape ? tailStroke(stroke, shape) : null
    if (moved) changed = true
    return moved ?? stroke
  })
  return changed ? next : null
}

/**
 * 넷째 규칙 — 섞임받침을 홑받침 둘로: baseJamos의 섞임받침은 한 벌씩 따로 그려 있어 홑받침과 꼴이 따로 논다(ㅀ의 ㅎ 동그라미가 넓어 ㄹ을 파고든다).
 * 받침 상자 안을 작은 상자 둘로 가르고, 그 안에 홑받침 획을 그대로 줄여 넣는다. 작은 상자는 섞임받침 틀(0~1) 기준이다.
 * 획 굵기는 문맥별로 고정이라 줄여도 그대로다. 원래 획을 틀로 굳히므로 받침 상자 맞춤은 바뀌지 않는다.
 */
export interface SubBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const COMPOUND_JONG_PARTS: Readonly<Record<string, readonly [string, string]>> = {
  'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'], 'ㄺ': ['ㄹ', 'ㄱ'], 'ㄻ': ['ㄹ', 'ㅁ'], 'ㄼ': ['ㄹ', 'ㅂ'],
  'ㄽ': ['ㄹ', 'ㅅ'], 'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'], 'ㅀ': ['ㄹ', 'ㅎ'], 'ㅄ': ['ㅂ', 'ㅅ'],
}

/**
 * 섞임받침 → [왼 자모 상자, 오른 자모 상자, (있으면) 오른 자모 동그라미 상자]. 값은 `scripts/layout-rules/measure-compound-jong.ts`로 노토 xor가 가장 작은 곳을 찾은 것. 표에 없는 섞임받침은 그대로 그린다.
 * ㅎ은 노토가 섞임받침 안에서 머리(꼭지 · 가로줄기)를 높고 넓게, 동그라미는 작게 쓴다 — 한 상자로 함께 줄이면 안 맞아 동그라미 상자를 따로 둔다.
 */
export const COMPOUND_JONG_BOXES: Record<string, readonly SubBox[]> = {
  'ㄶ': [{ x0: 0.025, y0: 0.15, x1: 0.373, y1: 0.903 }, { x0: 0.341, y0: 0.037, x1: 1, y1: 1.224 }, { x0: 0.386, y0: 0.255, x1: 0.963, y1: 1 }],
  'ㅀ': [{ x0: -0.02, y0: 0.1, x1: 0.4, y1: 0.96 }, { x0: 0.458, y0: -0.005, x1: 1.06, y1: 1.03 }, { x0: 0.472, y0: 0.138, x1: 1.038, y1: 1.008 }],
  'ㅄ': [{ x0: 0.034, y0: 0, x1: 0.428, y1: 0.958 }, { x0: 0.497, y0: -0.01, x1: 1.005, y1: 0.97 }],
  // ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ는 홑받침 둘로 그려도 홀드아웃에서 나아지지 않아(손그림이 이미 노토와 가깝다) 그대로 둔다.
  // ㄳ ㄵ도 홀드아웃은 나아졌지만 588에서 섞였다(ㄵ은 치킴 붙은 손그림이 더 가깝다). 그대로 둔다.
}

const placePoint = (point: PathPoint, box: SubBox): PathPoint => {
  const at = (p: { x: number; y: number }) => ({ x: box.x0 + p.x * (box.x1 - box.x0), y: box.y0 + p.y * (box.y1 - box.y0) })
  return { ...point, ...at(point), ...(point.handleIn ? { handleIn: at(point.handleIn) } : {}), ...(point.handleOut ? { handleOut: at(point.handleOut) } : {}) }
}

/** 홑받침 둘을 작은 상자에 넣어 섞임받침 획을 만든다. 획 id는 `ㅀ종:ㄹ종-1`처럼 섞임받침 이름을 앞에 붙인다. */
export function compoundJongStrokes(compound: string, parts: readonly [DeepReadonlyJamo, DeepReadonlyJamo], boxes: readonly SubBox[]): StrokeDataV2[] {
  return parts.flatMap((part, index) => (part.strokes ?? []).map((stroke) => {
    const box = index === 1 && stroke.closed && boxes[2] ? boxes[2] : boxes[index]
    return {
      ...(structuredClone(stroke) as StrokeDataV2),
      id: `${compound}종:${stroke.id}`,
      points: stroke.points.map((point) => placePoint(structuredClone(point) as PathPoint, box)),
    }
  }))
}

type DeepReadonlyJamo = Pick<JamoData, 'strokes'>

function mapJamoStrokes(jamo: JamoData, change: (strokes: readonly StrokeDataV2[]) => StrokeDataV2[] | null): JamoData {
  const strokes = jamo.strokes ? change(jamo.strokes) : null
  let contextStrokes = jamo.contextStrokes
  if (contextStrokes) {
    const entries = Object.entries(contextStrokes).map(([family, list]) => [family, (list && change(list)) ?? list] as const)
    contextStrokes = Object.fromEntries(entries) as JamoData['contextStrokes']
  }
  if (!strokes && contextStrokes === jamo.contextStrokes) return jamo
  return withFrameFrom({ ...jamo, ...(strokes ? { strokes } : {}), ...(contextStrokes ? { contextStrokes } : {}) }, jamo)
}

/** 그릴 음절에 획 꼴 규칙을 입힌다. 바뀐 것이 없으면 받은 음절을 그대로 돌려준다. */
export function applyStrokeShapeRules(syllable: DecomposedSyllable, params: StrokeShapeParams, jongJamos?: Readonly<Record<string, Pick<JamoData, 'strokes'>>>): DecomposedSyllable {
  if (params.compoundJong && jongJamos && syllable.jongseong) {
    const jong = syllable.jongseong
    const parts = COMPOUND_JONG_PARTS[jong.char]
    const boxes = COMPOUND_JONG_BOXES[jong.char]
    const left = parts && jongJamos[parts[0]], right = parts && jongJamos[parts[1]]
    if (parts && boxes && left?.strokes && right?.strokes) {
      const rebuilt = withFrameFrom({ ...jong, strokes: compoundJongStrokes(jong.char, [left, right], boxes) }, jong)
      delete rebuilt.contextStrokes
      syllable = { ...syllable, jongseong: rebuilt }
    }
  }
  if (!syllable.choseong || !syllable.jungseong || !SWEEP_VOWELS.includes(syllable.jungseong.char)) return syllable
  let choseong = syllable.choseong
  if (params.giyeokSweep) choseong = mapJamoStrokes(choseong, sweepStrokes)
  // 틀은 처음 바꾸기 전 획으로 굳힌다(withFrameFrom은 이미 틀이 있으면 그대로 둔다).
  const jung = syllable.jungseong.char
  if (params.bottomKick && KICK_VOWELS.includes(jung)) choseong = mapJamoStrokes(choseong, kickStrokesWith(BOTTOM_KICK_SHAPES))
  if (params.bottomKick && LEFT_BRANCH_KICK_VOWELS.includes(jung)) choseong = mapJamoStrokes(choseong, kickStrokesWith(BOTTOM_KICK_SHAPES_LEFT_BRANCH))
  const tailGroup = tailGroupOf(jung)
  if (params.tailSweep && tailGroup) choseong = mapJamoStrokes(choseong, tailStrokesWith(TAIL_SHAPES[tailGroup]))
  const jongseong = params.bottomKick && syllable.jongseong ? mapJamoStrokes(syllable.jongseong, kickStrokesWith(JONG_KICK_SHAPES)) : syllable.jongseong
  return choseong === syllable.choseong && jongseong === syllable.jongseong ? syllable : { ...syllable, choseong, jongseong }
}
