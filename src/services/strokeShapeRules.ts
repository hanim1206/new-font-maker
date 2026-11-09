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
}

export const STROKE_SHAPES_OFF: StrokeShapeParams = { giyeokSweep: false }
export const DEFAULT_STROKE_SHAPE_PARAMS: StrokeShapeParams = { giyeokSweep: true }

/** 삐침을 쓰는 홀자 — 오른홀자 아홉. 아래홀자는 ㄱ이 위에 눕고 내림이 짧아 노토도 거의 꺾어 내린다. */
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

function sweepJamo(jamo: JamoData): JamoData {
  const strokes = jamo.strokes ? sweepStrokes(jamo.strokes) : null
  let contextStrokes = jamo.contextStrokes
  if (contextStrokes) {
    const entries = Object.entries(contextStrokes).map(([family, list]) => [family, (list && sweepStrokes(list)) ?? list] as const)
    contextStrokes = Object.fromEntries(entries) as JamoData['contextStrokes']
  }
  if (!strokes && contextStrokes === jamo.contextStrokes) return jamo
  return withFrameFrom({ ...jamo, ...(strokes ? { strokes } : {}), ...(contextStrokes ? { contextStrokes } : {}) }, jamo)
}

/** 그릴 음절에 획 꼴 규칙을 입힌다. 바뀐 것이 없으면 받은 음절을 그대로 돌려준다. */
export function applyStrokeShapeRules(syllable: DecomposedSyllable, params: StrokeShapeParams): DecomposedSyllable {
  if (!params.giyeokSweep || !syllable.choseong || !syllable.jungseong) return syllable
  if (!SWEEP_VOWELS.includes(syllable.jungseong.char)) return syllable
  const choseong = sweepJamo(syllable.choseong)
  return choseong === syllable.choseong ? syllable : { ...syllable, choseong }
}
