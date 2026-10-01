import { JUNGSEONG_MAP } from '../data/Hangul'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'

/**
 * 곁줄기 · 걸침의 붙은 끝은 기둥을 따른다.
 * 저장 획에서 붙은 끝의 자리는 "기둥 시작점 x + 기본 획의 어긋남 + 틈"이고, 놓을 때는 그 높이에서 기둥의 놓인 중심선(휨 · 기울기 포함) 위에 붙는다.
 * 곁줄기는 한 끝이 붙고 한 끝이 비어 있다(틈 `gap` · 빈 끝 길이 Δ `reach`). 걸침은 양 끝이 다 붙는다(틈 `gap` · `gapEnd`).
 * 틈 · 길이는 글자 폭 em으로 잰 차이라 형제에 같은 만큼 간다(줄기 마스터).
 * 플랜: docs/plans/2026-09-30_곁줄기-붙은-끝은-기둥을-따른다.md
 */

/** 곁줄기 → 붙는 기둥 하나, 걸침 → 붙는 기둥 둘. 에 · 예 · 웨는 안쪽 기둥(D0 대응표). */
export const STEM_PILLARS: Readonly<Record<string, Readonly<Record<string, string | readonly [string, string]>>>> = {
  ㅏ: { 'ㅏ-2': 'ㅏ-1' },
  ㅑ: { 'ㅑ-2': 'ㅑ-1', 'ㅑ-3': 'ㅑ-1' },
  ㅓ: { 'ㅓ-2': 'ㅓ-1' },
  ㅔ: { 'ㅔ-2': 'ㅔ-1' },
  ㅕ: { 'ㅕ-2': 'ㅕ-1', 'ㅕ-3': 'ㅕ-1' },
  ㅖ: { 'ㅖ-2': 'ㅖ-1', 'ㅖ-3': 'ㅖ-1' },
  ㅘ: { 'ㅘ-4': 'ㅘ-3' },
  ㅝ: { 'ㅝ-4': 'ㅝ-3' },
  ㅞ: { 'ㅞ-4': 'ㅞ-3' },
  ㅐ: { 'ㅐ-2': ['ㅐ-1', 'ㅐ-3'] },
  ㅒ: { 'ㅒ-2': ['ㅒ-1', 'ㅒ-4'], 'ㅒ-3': ['ㅒ-1', 'ㅒ-4'] },
  ㅙ: { 'ㅙ-4': ['ㅙ-3', 'ㅙ-5'] },
}

export type StrokeEnd = 'start' | 'end'

export interface EndAttachment {
  /** 획의 어느 끝인가. */
  end: StrokeEnd
  pillarId: string
  /** 기본 획에서 이 끝이 기둥 시작점 x에서 떨어진 만큼(칸 비율, x 그대로). 거의 0이고 ㅘ · ㅙ 세로부만 ±0.04 — 기본 폰트를 그대로 두려고 남긴다. */
  baseOffset: number
  /** 기둥에서 획 안쪽(반대 끝)으로 가는 x 방향. 틈은 이 방향이 +다. */
  away: 1 | -1
}

export interface StemAttachment {
  /** 붙은 끝. 곁줄기는 하나, 걸침은 둘(시작점 쪽 먼저). */
  ends: readonly EndAttachment[]
  /** 빈 끝(곁줄기만). `baseFreeX`는 기본 획의 빈 끝 x, `away`는 기둥에서 빈 끝으로 가는 방향 — 길이 Δ는 이 방향이 +(길어짐). */
  free: { end: StrokeEnd; baseFreeX: number; away: 1 | -1 } | null
}

const EPSILON = 1e-9

export function baseStrokeOf(char: string, strokeId: string): StrokeDataV2 | null {
  const base = JUNGSEONG_MAP[char]
  if (!base) return null
  return [...(base.strokes ?? []), ...(base.horizontalStrokes ?? []), ...(base.verticalStrokes ?? [])].find((stroke) => stroke.id === strokeId) ?? null
}

export const endIndexOf = (stroke: Pick<StrokeDataV2, 'points'>, end: StrokeEnd) => end === 'start' ? 0 : stroke.points.length - 1
const otherEnd = (end: StrokeEnd): StrokeEnd => end === 'start' ? 'end' : 'start'

/** 이 획이 기둥에 붙는 곁줄기 · 걸침이면 붙임 정보, 아니면 null. */
export function attachmentOf(jamo: Pick<JamoData, 'type' | 'char'>, strokeId: string): StemAttachment | null {
  if (jamo.type !== 'jungseong') return null
  const pillars = STEM_PILLARS[jamo.char]?.[strokeId]
  if (!pillars) return null
  const stroke = baseStrokeOf(jamo.char, strokeId)
  if (!stroke || stroke.points.length < 2) return null
  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  const ends: EndAttachment[] = []
  for (const pillarId of typeof pillars === 'string' ? [pillars] : pillars) {
    const pillar = baseStrokeOf(jamo.char, pillarId)
    if (!pillar || pillar.points.length < 1) return null
    const pillarX = pillar.points[0].x
    const end: StrokeEnd = Math.abs(first.x - pillarX) <= Math.abs(last.x - pillarX) ? 'start' : 'end'
    if (ends.some((item) => item.end === end)) return null
    const own = end === 'start' ? first : last
    const other = end === 'start' ? last : first
    ends.push({ end, pillarId, baseOffset: own.x - pillarX, away: other.x >= pillarX ? 1 : -1 })
  }
  ends.sort((a, b) => (a.end === 'start' ? 0 : 1) - (b.end === 'start' ? 0 : 1))
  const freeEnd = ends.length === 1 ? otherEnd(ends[0].end) : null
  const free = freeEnd ? { end: freeEnd, baseFreeX: (freeEnd === 'start' ? first : last).x, away: ends[0].away } : null
  return { ends, free }
}

/**
 * 저장 좌표에서 붙은 끝 하나가 기둥 시작점 x에서 떨어진 틈(칸 비율). 기둥에서 획 안쪽으로 멀어지면 +, 기본 획의 어긋남은 뺀다 — 기본 획은 0.
 * 기둥의 휨 · 기울기는 시작점에서 뻗은 축에 대한 모양이라 여기 안 들어간다. 그래서 기둥을 휘어도 곁줄기는 따르는 채다.
 */
export function endGapOf(strokes: readonly StrokeDataV2[], stroke: StrokeDataV2, attachment: EndAttachment): number | null {
  const pillar = strokes.find((item) => item.id === attachment.pillarId)
  if (!pillar || pillar.points.length < 1) return null
  return (stroke.points[endIndexOf(stroke, attachment.end)].x - pillar.points[0].x - attachment.baseOffset) * attachment.away
}

/** 틈(칸 비율, 안쪽 +)을 받았을 때 붙은 끝이 놓일 x. `pillarX`는 기둥 시작점(저장) 또는 그 높이의 놓인 중심선. */
export const attachedXOf = (pillarX: number, attachment: EndAttachment, gap: number) => pillarX + attachment.baseOffset + gap * attachment.away

/** 저장 좌표에서 빈 끝이 기본 획의 빈 끝에서 옮겨진 길이 Δ(칸 비율). 기둥에서 멀어지면(길어지면) +. 빈 끝이 없으면 0. */
export const reachOf = (stroke: StrokeDataV2, attachment: StemAttachment) =>
  attachment.free ? (stroke.points[endIndexOf(stroke, attachment.free.end)].x - attachment.free.baseFreeX) * attachment.free.away : 0

/** 길이 Δ(칸 비율, 길어짐 +)를 받았을 때 빈 끝이 놓일 x. 빈 끝이 없으면 null. */
export const freeXOf = (attachment: StemAttachment, reach: number) => attachment.free ? attachment.free.baseFreeX + reach * attachment.free.away : null

/** 점 하나의 x를 옮긴 획. 그 점의 손잡이도 같이 간다. 같은 자리면 같은 획. */
export function withPointX(stroke: StrokeDataV2, index: number, x: number): StrokeDataV2 {
  const point = stroke.points[index]
  if (!point) return stroke
  const dx = x - point.x
  if (Math.abs(dx) < EPSILON) return stroke
  const moved: AnchorPoint = {
    ...point,
    x,
    ...(point.handleIn ? { handleIn: { x: point.handleIn.x + dx, y: point.handleIn.y } } : {}),
    ...(point.handleOut ? { handleOut: { x: point.handleOut.x + dx, y: point.handleOut.y } } : {}),
  }
  const points = [...stroke.points]
  points[index] = moved
  return { ...stroke, points }
}

/**
 * 짧은기둥은 한 끝이 보에 붙고 한 끝이 비어 있다. 붙은 끝이 보에서 줄기 몸 쪽으로 떨어진 틈과 빈 끝의 길이 Δ는
 * 기본 획과의 세로 차이로 잰다 — 놓을 때 보 가운데 · 보선 위에 그 차이만큼 얹힌다(`medialStemRails.stemEndsFor`).
 */
export interface BeamAttachment {
  joined: StrokeEnd
  free: StrokeEnd
  /** 기본 획의 붙은 끝 · 빈 끝 y(칸 비율). */
  baseJoinedY: number
  baseFreeY: number
  /** 보에서 빈 끝으로 가는 세로 방향. 틈(보에서 떨어짐)도 길이 Δ(길어짐)도 이 방향이 +다. */
  away: 1 | -1
}

/** 이 짧은기둥이 보에 붙는 꼴. `joinedSide`는 붙은 끝이 위인가 아래인가(솟는 짧은기둥은 아래 끝이 보에 붙는다). */
export function beamAttachmentOf(jamo: Pick<JamoData, 'type' | 'char'>, strokeId: string, joinedSide: 'top' | 'bottom'): BeamAttachment | null {
  if (jamo.type !== 'jungseong') return null
  const stroke = baseStrokeOf(jamo.char, strokeId)
  if (!stroke || stroke.points.length < 2) return null
  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  if (Math.abs(first.y - last.y) < EPSILON) return null
  const firstIsTop = first.y < last.y
  const joined: StrokeEnd = (joinedSide === 'top') === firstIsTop ? 'start' : 'end'
  const joinedPoint = joined === 'start' ? first : last
  const freePoint = joined === 'start' ? last : first
  return { joined, free: otherEnd(joined), baseJoinedY: joinedPoint.y, baseFreeY: freePoint.y, away: freePoint.y > joinedPoint.y ? 1 : -1 }
}

/** 저장 좌표에서 붙은 끝이 보에서 떨어진 틈(칸 비율, 줄기 몸 쪽 +). 기본 획은 0. 음수면 보를 뚫고 나간 것이다. */
export const beamGapOf = (stroke: StrokeDataV2, attachment: BeamAttachment) => (stroke.points[endIndexOf(stroke, attachment.joined)].y - attachment.baseJoinedY) * attachment.away

/** 저장 좌표에서 빈 끝이 기본 획의 빈 끝에서 옮겨진 길이 Δ(칸 비율, 길어짐 +). */
export const beamReachOf = (stroke: StrokeDataV2, attachment: BeamAttachment) => (stroke.points[endIndexOf(stroke, attachment.free)].y - attachment.baseFreeY) * attachment.away

/** 점 하나의 y를 옮긴 획. 그 점의 손잡이도 같이 간다. 같은 자리면 같은 획. */
export function withPointY(stroke: StrokeDataV2, index: number, y: number): StrokeDataV2 {
  const point = stroke.points[index]
  if (!point) return stroke
  const dy = y - point.y
  if (Math.abs(dy) < EPSILON) return stroke
  const moved: AnchorPoint = {
    ...point,
    y,
    ...(point.handleIn ? { handleIn: { x: point.handleIn.x, y: point.handleIn.y + dy } } : {}),
    ...(point.handleOut ? { handleOut: { x: point.handleOut.x, y: point.handleOut.y + dy } } : {}),
  }
  const points = [...stroke.points]
  points[index] = moved
  return { ...stroke, points }
}

const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

/**
 * 획 중심선이 높이 `y`를 지나는 x. 세로로 뻗는 기둥에 쓴다(마디마다 한 번만 지난다고 본다).
 * 손잡이가 없는 마디는 직선, 있으면 3차 베지어를 이분법으로 푼다. 끝 밖의 높이면 가까운 끝의 x.
 */
export function centerlineXAtY(stroke: Pick<StrokeDataV2, 'points'>, y: number): number | null {
  const points = stroke.points
  if (points.length < 1) return null
  if (points.length === 1) return points[0].x
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const lo = Math.min(from.y, to.y)
    const hi = Math.max(from.y, to.y)
    const c1 = from.handleOut
    const c2 = to.handleIn
    if (!c1 && !c2) {
      if (y < lo - EPSILON || y > hi + EPSILON) continue
      if (from.x === to.x) return from.x
      if (Math.abs(to.y - from.y) < EPSILON) return (from.x + to.x) / 2
      return from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x)
    }
    const ys = [from.y, c1?.y ?? from.y, c2?.y ?? to.y, to.y]
    if (y < Math.min(...ys) - EPSILON || y > Math.max(...ys) + EPSILON) continue
    const yAt = (t: number) => cubic(from.y, c1?.y ?? from.y, c2?.y ?? to.y, to.y, t)
    const xAt = (t: number) => cubic(from.x, c1?.x ?? from.x, c2?.x ?? to.x, to.x, t)
    const steps = 32
    let previousT = 0
    let previousD = yAt(0) - y
    if (Math.abs(previousD) < EPSILON) return xAt(0)
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const d = yAt(t) - y
      if (Math.abs(d) < EPSILON) return xAt(t)
      if ((previousD < 0) !== (d < 0)) {
        let a = previousT
        let b = t
        let da = previousD
        for (let iteration = 0; iteration < 40; iteration += 1) {
          const m = (a + b) / 2
          const dm = yAt(m) - y
          if ((da < 0) === (dm < 0)) { a = m; da = dm } else b = m
        }
        return xAt((a + b) / 2)
      }
      previousT = t
      previousD = d
    }
  }
  const first = points[0]
  const last = points[points.length - 1]
  return Math.abs(y - first.y) <= Math.abs(y - last.y) ? first.x : last.x
}
