import { JUNGSEONG_MAP } from '../data/Hangul'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'

/**
 * 곁줄기의 붙은 끝은 기둥을 따른다.
 * 저장 획에서 곁줄기 붙은 끝의 자리는 "기둥 시작점 x + 기본 획의 어긋남 + 틈"이고, 놓을 때는 그 높이에서 기둥의 놓인 중심선(휨 · 기울기 포함) 위에 붙는다.
 * 틈은 글자 폭 em으로 잰 차이라 형제에 같은 만큼 간다(줄기 마스터의 `gap`).
 * 플랜: docs/plans/2026-09-30_곁줄기-붙은-끝은-기둥을-따른다.md
 */

/** 곁줄기 → 붙는 기둥. 에 · 예 · 웨는 안쪽 기둥(D0 대응표). */
export const SIDE_STROKE_PILLARS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ㅏ: { 'ㅏ-2': 'ㅏ-1' },
  ㅑ: { 'ㅑ-2': 'ㅑ-1', 'ㅑ-3': 'ㅑ-1' },
  ㅓ: { 'ㅓ-2': 'ㅓ-1' },
  ㅔ: { 'ㅔ-2': 'ㅔ-1' },
  ㅕ: { 'ㅕ-2': 'ㅕ-1', 'ㅕ-3': 'ㅕ-1' },
  ㅖ: { 'ㅖ-2': 'ㅖ-1', 'ㅖ-3': 'ㅖ-1' },
  ㅘ: { 'ㅘ-4': 'ㅘ-3' },
  ㅝ: { 'ㅝ-4': 'ㅝ-3' },
  ㅞ: { 'ㅞ-4': 'ㅞ-3' },
}

export interface SideAttachment {
  pillarId: string
  /** 곁줄기의 어느 끝이 기둥에 붙나. */
  end: 'start' | 'end'
  /** 기본 획에서 붙은 끝이 기둥 시작점 x에서 떨어진 만큼(칸 비율, x 그대로). 거의 0이고 ㅘ 세로부만 0.04 — 기본 폰트를 그대로 두려고 남긴다. */
  baseOffset: number
  /** 기둥에서 빈 끝으로 가는 x 방향. 오른쪽으로 뻗는 ㅏ 계열 +1, 왼쪽으로 뻗는 ㅓ 계열 −1. 틈은 이 방향이 +다. */
  away: 1 | -1
}

const EPSILON = 1e-9

function baseStrokeOf(char: string, strokeId: string): StrokeDataV2 | null {
  const base = JUNGSEONG_MAP[char]
  if (!base) return null
  return [...(base.strokes ?? []), ...(base.horizontalStrokes ?? []), ...(base.verticalStrokes ?? [])].find((stroke) => stroke.id === strokeId) ?? null
}

/** 이 획이 기둥에 붙는 곁줄기면 붙임 정보, 아니면 null. */
export function attachmentOf(jamo: Pick<JamoData, 'type' | 'char'>, strokeId: string): SideAttachment | null {
  if (jamo.type !== 'jungseong') return null
  const pillarId = SIDE_STROKE_PILLARS[jamo.char]?.[strokeId]
  if (!pillarId) return null
  const side = baseStrokeOf(jamo.char, strokeId)
  const pillar = baseStrokeOf(jamo.char, pillarId)
  if (!side || !pillar || side.points.length < 2 || pillar.points.length < 1) return null
  const pillarX = pillar.points[0].x
  const first = side.points[0]
  const last = side.points[side.points.length - 1]
  const end = Math.abs(first.x - pillarX) <= Math.abs(last.x - pillarX) ? 'start' : 'end'
  const free = end === 'start' ? last : first
  return { pillarId, end, baseOffset: (end === 'start' ? first : last).x - pillarX, away: free.x >= pillarX ? 1 : -1 }
}

export const attachedIndexOf = (stroke: Pick<StrokeDataV2, 'points'>, attachment: SideAttachment) => attachment.end === 'start' ? 0 : stroke.points.length - 1

/**
 * 저장 좌표에서 곁줄기 붙은 끝이 기둥 시작점 x에서 떨어진 틈(칸 비율). 기둥에서 빈 끝 쪽으로 멀어지면 +, 기본 획의 어긋남은 뺀다 — 기본 획은 0.
 * 기둥의 휨 · 기울기는 시작점에서 뻗은 축에 대한 모양이라 여기 안 들어간다. 그래서 기둥을 휘어도 곁줄기는 따르는 채다.
 */
export function attachGapOf(strokes: readonly StrokeDataV2[], stroke: StrokeDataV2, attachment: SideAttachment): number | null {
  const pillar = strokes.find((item) => item.id === attachment.pillarId)
  if (!pillar || pillar.points.length < 1) return null
  return (stroke.points[attachedIndexOf(stroke, attachment)].x - pillar.points[0].x - attachment.baseOffset) * attachment.away
}

/** 틈(칸 비율, 빈 끝 쪽 +)을 받았을 때 붙은 끝이 놓일 x. `pillarX`는 기둥 시작점(저장) 또는 그 높이의 놓인 중심선. */
export const attachedXOf = (pillarX: number, attachment: SideAttachment, gap: number) => pillarX + attachment.baseOffset + gap * attachment.away

/** 붙은 끝의 x를 옮긴 획. 붙은 끝에 달린 손잡이도 같이 간다. 같은 자리면 같은 획. */
export function withAttachedEndX(stroke: StrokeDataV2, attachment: SideAttachment, x: number): StrokeDataV2 {
  const index = attachedIndexOf(stroke, attachment)
  const point = stroke.points[index]
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
