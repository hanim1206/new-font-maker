import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { hasMedialBoxEm, JAMO_CHANNELS, masterNameOf, stemReferenceBox, thinBox, type JamoChannel } from './stemMaster'

/**
 * 홀자 줄기는 축 방향으로만 늘고 줄고, 축에 수직인 휨은 em 그대로 둔다.
 * 획은 칸 비율로 저장되고 그 비율은 받침 없는 칸(`stemReferenceBox`)에서 그린 모양이다. 받침 있는 글자에서 칸이 세로로 58%가 되면
 * 곁줄기처럼 누운 줄기의 위아래 휨도 58%로 눌리는데, 그걸 막으려고 실제 칸에 놓을 때 휨만 기준 칸의 em 크기로 되돌린다.
 * 줄기 하나짜리 채널(ㅣ · ㅡ · ㅚ ㅟ ㅢ)은 칸이 휠 방향으로 두께 0이라 칸 비율로는 휨을 못 담는다. 휜 획은 그 변만 기준 칸만큼 넓힌 칸에 놓는다.
 * 끝점은 그대로라 자리는 기준선이 주고, 곧은 획은 획도 칸도 그대로다(마스터 없는 폰트는 같다).
 * 대상은 획 문법 이름이 있는 홀자 줄기(마스터와 같은 범위).
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

type Vec = { x: number; y: number }

const EPSILON = 1e-12
/** 넓혀 놓은 칸 → 원래 받은 칸. 편집기가 놓인 칸에서 끈 이동량을 저장 좌표로 되돌릴 때 쓴다. */
const receivedBoxOf = new WeakMap<BoxConfig, BoxConfig>()

interface BendFrame {
  /** 휜 획을 놓을 칸. 보통은 받은 칸 그대로, 두께 0인 변만 기준 칸만큼 넓힌다. */
  box: BoxConfig
  /** 저장 좌표(받은 칸 비율) → 놓인 칸 비율 */
  place: (point: Vec) => Vec
  /** em 이동량 → 휨을 바꾸는 점 · 핸들의 저장 좌표 이동량 */
  unplaceEm: (em: Vec) => Vec
  /** 휨이 하나도 없는 획(곧은 획) */
  straight: boolean
}

function channelOf(jamo: JamoData, strokeId: string): JamoChannel | null {
  return JAMO_CHANNELS.find((channel) => jamo[channel]?.some((stroke) => stroke.id === strokeId)) ?? null
}

function bendFrameOf(jamo: JamoData, stroke: StrokeDataV2, box: BoxConfig, channelHint?: JamoChannel): BendFrame | null {
  if (jamo.type !== 'jungseong' || stroke.points.length < 2) return null
  const channel = channelHint && jamo[channelHint]?.some((item) => item.id === stroke.id) ? channelHint : channelOf(jamo, stroke.id)
  if (!channel || !hasMedialBoxEm(jamo.char, channel)) return null
  if (!masterNameOf(jamo, jamo[channel] ?? [], stroke.id)) return null
  const reference = stemReferenceBox(jamo.char, channel, stroke)

  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const axis = { x: end.x - start.x, y: end.y - start.y }
  const refAxis = { x: axis.x * reference.width, y: axis.y * reference.height }
  const refLength = Math.hypot(refAxis.x, refAxis.y)
  const emAxis = { x: axis.x * box.width, y: axis.y * box.height }
  const emLength = Math.hypot(emAxis.x, emAxis.y)
  if (refLength < EPSILON || emLength < EPSILON) return null

  // 두께 0인 변은 기준 칸만큼 넓힌다(가운데 기준).
  const placed: BoxConfig = !thinBox(stroke, box) ? box : Math.abs(emAxis.y) >= Math.abs(emAxis.x)
    ? { ...box, x: box.x + box.width / 2 - reference.width / 2, width: reference.width }
    : { ...box, y: box.y + box.height / 2 - reference.height / 2, height: reference.height }

  // 저장 좌표 이동량 → (축 비율 t, 수직 em n) → em 이동량. 끝점 기준 선형이다.
  const split = (offset: Vec) => {
    const em = { x: offset.x * reference.width, y: offset.y * reference.height }
    return { t: (em.x * refAxis.x + em.y * refAxis.y) / (refLength * refLength), n: (refAxis.x * em.y - refAxis.y * em.x) / refLength }
  }
  const emOffset = (offset: Vec): Vec => {
    const { t, n } = split(offset)
    return { x: t * emAxis.x - n * emAxis.y / emLength, y: t * emAxis.y + n * emAxis.x / emLength }
  }
  const origin = { x: box.x + start.x * box.width, y: box.y + start.y * box.height }
  const ex = emOffset({ x: 1, y: 0 })
  const ey = emOffset({ x: 0, y: 1 })
  const determinant = ex.x * ey.y - ey.x * ex.y
  return {
    box: placed,
    place: (point) => {
      const moved = emOffset({ x: point.x - start.x, y: point.y - start.y })
      return { x: (origin.x + moved.x - placed.x) / placed.width, y: (origin.y + moved.y - placed.y) / placed.height }
    },
    unplaceEm: (em) => Math.abs(determinant) < EPSILON ? em : {
      x: (ey.y * em.x - ey.x * em.y) / determinant,
      y: (-ex.y * em.x + ex.x * em.y) / determinant,
    },
    straight: stroke.points.every((point) => [point, point.handleIn, point.handleOut].every((item) => !item || Math.abs(split({ x: item.x - start.x, y: item.y - start.y }).n) < EPSILON)),
  }
}

/** 저장된 획을 이 칸에 놓는다. 대상이 아니거나 곧은 획이면 같은 획 · 같은 칸을 그대로 돌려준다. */
export function placeStemStroke(jamo: JamoData, stroke: StrokeDataV2, box: BoxConfig, channel?: JamoChannel): { stroke: StrokeDataV2; box: BoxConfig } {
  const frame = bendFrameOf(jamo, stroke, box, channel)
  if (!frame || frame.straight) return { stroke, box }
  const last = stroke.points.length - 1
  const points = stroke.points.map((point, index) => ({
    ...point,
    // 끝점은 제자리다. 칸이 그대로면 계산 오차 없이 원래 값을 둔다.
    ...(frame.box === box && (index === 0 || index === last) ? { x: point.x, y: point.y } : frame.place(point)),
    ...(point.handleIn ? { handleIn: frame.place(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: frame.place(point.handleOut) } : {}),
  }))
  if (frame.box !== box) receivedBoxOf.set(frame.box, box)
  return { stroke: { ...stroke, points }, box: frame.box }
}

/**
 * 놓인 칸(`shownBox`, 편집기가 그린 칸)에서 끈 이동량을 저장 좌표의 이동량으로 되돌린다.
 * `bend`(끝점이 아닌 점 · 핸들)는 휨 변환의 역, `rigid`(끝점 · 획 통째)는 칸 비율만 되돌린다.
 */
export function storedStemDelta(jamo: JamoData, stroke: StrokeDataV2, shownBox: BoxConfig, delta: Vec, kind: 'bend' | 'rigid'): Vec {
  const box = receivedBoxOf.get(shownBox) ?? shownBox
  const frame = bendFrameOf(jamo, stroke, box)
  if (!frame) return delta
  const em = { x: delta.x * shownBox.width, y: delta.y * shownBox.height }
  if (kind === 'bend') return frame.unplaceEm(em)
  // 두께 0인 변은 받은 칸 비율로 못 나눈다. 그 방향은 놓인 칸 비율 그대로 둔다.
  return { x: box.width > 1e-6 ? em.x / box.width : delta.x, y: box.height > 1e-6 ? em.y / box.height : delta.y }
}
