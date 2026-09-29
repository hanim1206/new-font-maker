import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { hasMedialBoxEm, JAMO_CHANNELS, masterNameOf, medialBoxEmOf, thinBox, type JamoChannel } from './stemMaster'

/**
 * 홀자 줄기는 축 방향으로만 늘고 줄고, 축에 수직인 휨은 em 그대로 둔다.
 * 획은 칸 비율로 저장되고 그 비율은 받침 없는 칸에서 그린 모양이다. 받침 있는 글자에서 칸이 세로로 58%가 되면
 * 곁줄기처럼 누운 줄기의 위아래 휨도 58%로 눌리는데, 그걸 막으려고 실제 칸에 놓을 때 휨만 받침 없는 칸의 em 크기로 되돌린다.
 * 끝점은 그대로라 자리는 기준선이 주고, 곧은 획은 변하지 않는다(마스터 없는 폰트는 그대로).
 * 대상은 획 문법 이름이 있는 홀자 줄기(마스터와 같은 범위). 얇은 상자(ㅣ · ㅡ · ㅚ ㅟ ㅢ 세로부)는 뺀다.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

type Vec = { x: number; y: number }

interface BendFrame {
  /** 저장 좌표(칸 비율) → 이 칸에 놓인 좌표 */
  place: (point: Vec) => Vec
  /** 놓인 좌표에서의 이동량 → 저장 좌표에서의 이동량 */
  unplaceDelta: (delta: Vec) => Vec
}

function channelOf(jamo: JamoData, strokeId: string): JamoChannel | null {
  return JAMO_CHANNELS.find((channel) => jamo[channel]?.some((stroke) => stroke.id === strokeId)) ?? null
}

/** 이 획을 이 칸에 놓을 때의 변환. 대상이 아니거나 변환이 필요 없으면 null. */
function bendFrameOf(jamo: JamoData, stroke: StrokeDataV2, box: Pick<BoxConfig, 'width' | 'height'>, channelHint?: JamoChannel): BendFrame | null {
  if (jamo.type !== 'jungseong' || stroke.points.length < 2) return null
  const channel = channelHint && jamo[channelHint]?.some((item) => item.id === stroke.id) ? channelHint : channelOf(jamo, stroke.id)
  if (!channel) return null
  const channelStrokes = jamo[channel] ?? []
  if (!hasMedialBoxEm(jamo.char, channel) || !masterNameOf(jamo, channelStrokes, stroke.id)) return null
  const reference = medialBoxEmOf(jamo.char, channel, 'open')
  if (thinBox(stroke, reference) || thinBox(stroke, box)) return null
  if (Math.abs(reference.width - box.width) < 1e-9 && Math.abs(reference.height - box.height) < 1e-9) return null

  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const axis = { x: end.x - start.x, y: end.y - start.y }
  const refAxis = { x: axis.x * reference.width, y: axis.y * reference.height }
  const refLength = Math.hypot(refAxis.x, refAxis.y)
  const boxAxis = { x: axis.x * box.width, y: axis.y * box.height }
  const boxLength = Math.hypot(boxAxis.x, boxAxis.y)
  if (refLength < 1e-9 || boxLength < 1e-9) return null

  // 칸 비율 이동량 → (축 방향 비율 t, 수직 em n) → 이 칸의 이동량. 끝점 기준 선형이다.
  const placeOffset = (offset: Vec): Vec => {
    const em = { x: offset.x * reference.width, y: offset.y * reference.height }
    const t = (em.x * refAxis.x + em.y * refAxis.y) / (refLength * refLength)
    const n = (refAxis.x * em.y - refAxis.y * em.x) / refLength
    return {
      x: t * axis.x + n * (-boxAxis.y / boxLength) / box.width,
      y: t * axis.y + n * (boxAxis.x / boxLength) / box.height,
    }
  }
  const ex = placeOffset({ x: 1, y: 0 })
  const ey = placeOffset({ x: 0, y: 1 })
  const determinant = ex.x * ey.y - ey.x * ex.y
  return {
    place: (point) => {
      const moved = placeOffset({ x: point.x - start.x, y: point.y - start.y })
      return { x: start.x + moved.x, y: start.y + moved.y }
    },
    unplaceDelta: (delta) => Math.abs(determinant) < 1e-12 ? delta : {
      x: (ey.y * delta.x - ey.x * delta.y) / determinant,
      y: (-ex.y * delta.x + ex.x * delta.y) / determinant,
    },
  }
}

/** 저장된 획을 이 칸에 놓는다. 대상이 아니면 같은 획을 그대로 돌려준다. */
export function placeStemStroke(jamo: JamoData, stroke: StrokeDataV2, box: Pick<BoxConfig, 'width' | 'height'>, channel?: JamoChannel): StrokeDataV2 {
  const frame = bendFrameOf(jamo, stroke, box, channel)
  if (!frame) return stroke
  let moved = false
  const place = (point: Vec): Vec => {
    const placed = frame.place(point)
    if (Math.abs(placed.x - point.x) > 1e-12 || Math.abs(placed.y - point.y) > 1e-12) moved = true
    return placed
  }
  const points = stroke.points.map((point) => ({
    ...point,
    ...place(point),
    ...(point.handleIn ? { handleIn: place(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: place(point.handleOut) } : {}),
  }))
  // 곧은 획은 같은 획 그대로(참조까지) 돌려준다.
  return moved ? { ...stroke, points } : stroke
}

/**
 * 이 칸에서 끈 이동량을 저장 좌표의 이동량으로 되돌린다. 끝점과 획 통째 이동은 그대로(변환이 끝점을 지킨다).
 * 끝점이 아닌 점 · 핸들을 끌 때만 휨 변환의 역을 쓴다.
 */
export function storedStemDelta(jamo: JamoData, stroke: StrokeDataV2, box: Pick<BoxConfig, 'width' | 'height'>, delta: Vec): Vec {
  const frame = bendFrameOf(jamo, stroke, box)
  return frame ? frame.unplaceDelta(delta) : delta
}
