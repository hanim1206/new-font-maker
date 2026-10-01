import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { stemEndsFor } from './medialStemRails'
import { attachedXOf, attachmentOf, centerlineXAtY, endGapOf, endIndexOf, withPointX } from './stemAttach'
import { hasMedialBoxEm, JAMO_CHANNELS, masterNameOf, stemReferenceBox, thinBox, type JamoChannel } from './stemMaster'

/**
 * 홀자 줄기는 축 방향으로만 늘고 줄고, 축에 수직인 휨은 em 그대로 둔다.
 * 획은 칸 비율로 저장되고 그 비율은 받침 없는 칸(`stemReferenceBox`)에서 그린 모양이다. 받침 있는 글자에서 칸이 세로로 58%가 되면
 * 곁줄기처럼 누운 줄기의 위아래 휨도 58%로 눌리는데, 그걸 막으려고 실제 칸에 놓을 때 휨만 기준 칸의 em 크기로 되돌린다.
 * 줄기 하나짜리 채널(ㅣ · ㅡ · ㅚ ㅟ ㅢ)은 칸이 휠 방향으로 두께 0이라 칸 비율로는 휨도 기울기도 못 담는다. 그 방향의 저장 좌표는
 * 그 변만 기준 칸만큼 넓힌 칸(가운데 기준)의 비율이다 — 핸들 · 끝점 · 획 통째 이동 모두. 줄기 마스터가 읽고 쓰는 em(`stemReferenceBox`)과 같은 자다.
 * 끝점은 그대로라 자리는 기준선이 주고, 곧은 획은 획도 칸도 그대로다(마스터 없는 폰트는 같다).
 * 대상은 획 문법 이름이 있는 홀자 줄기(마스터와 같은 범위).
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

type Vec = { x: number; y: number }

const EPSILON = 1e-12
/** 넓혀 놓은 칸 → 원래 받은 칸. 편집기가 놓인 칸에서 끈 이동량을 저장 좌표로 되돌릴 때 쓴다. */
const receivedBoxOf = new WeakMap<BoxConfig, BoxConfig>()

/** 얇은 채널의 기본 획이 놓인 자리(그 변의 가운데). 넓힌 칸도 가운데 기준이라 기본 획은 받은 칸에서와 같은 em에 놓인다. */
const THIN_BASE = 0.5
/** 얇은 변 좌표가 기본 자리에서 이만큼 안 벗어나면 제자리로 본다. */
const ON_BASE = 1e-9

interface BendFrame {
  /** 획을 놓을 칸. 보통은 받은 칸 그대로, 두께 0인 변만 기준 칸만큼 넓힌다. */
  box: BoxConfig
  /** 저장 좌표(받은 칸 비율) → 놓인 칸 비율 */
  place: (point: Vec) => Vec
  /** em 이동량 → 휨을 바꾸는 점 · 핸들의 저장 좌표 이동량 */
  unplaceEm: (em: Vec) => Vec
  /** 휨이 하나도 없고(곧은 획) 얇은 변에서도 기본 자리 그대로라, 받은 칸에 저장 좌표 그대로 놓이는 획 */
  straight: boolean
  /** 보선에서 받은 끝점(받은 칸 비율). 없으면 저장 끝점 제자리. */
  ends: { start: Vec; end: Vec } | null
}

function channelOf(jamo: JamoData, strokeId: string): JamoChannel | null {
  return JAMO_CHANNELS.find((channel) => jamo[channel]?.some((stroke) => stroke.id === strokeId)) ?? null
}

function bendFrameOf(jamo: JamoData, stroke: StrokeDataV2, received: BoxConfig, channelHint?: JamoChannel): BendFrame | null {
  if (jamo.type !== 'jungseong' || stroke.points.length < 2) return null
  const channel = channelHint && jamo[channelHint]?.some((item) => item.id === stroke.id) ? channelHint : channelOf(jamo, stroke.id)
  const named = Boolean(channel && hasMedialBoxEm(jamo.char, channel) && masterNameOf(jamo, jamo[channel!] ?? [], stroke.id))
  // 휨을 재는 기준 칸. 마스터 대상이 아니면(표에 칸이 없는 채널) 받은 칸 그대로 — 모양이 칸 비율 그대로 따라간다.
  const reference = named ? stemReferenceBox(jamo.char, channel!, stroke) : { width: received.width, height: received.height }

  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  // 두께 0인 변은 기준 칸만큼 넓힌다(가운데 기준). 그 변의 저장 좌표는 넓힌 칸의 비율이라, 읽기도 놓기도 넓힌 칸에서 한다.
  const thin = named && thinBox(stroke, received)
  const thinSide = !thin ? null : Math.abs((end.y - start.y) * received.height) >= Math.abs((end.x - start.x) * received.width) ? 'x' : 'y'
  const box: BoxConfig = thinSide === null ? received : thinSide === 'x'
    ? { ...received, x: received.x + received.width / 2 - reference.width / 2, width: reference.width }
    : { ...received, y: received.y + received.height / 2 - reference.height / 2, height: reference.height }
  // 끝점이 보선에서 오면(`medialStemRails`) 새 끝점 사이에 놓는다. 저장 끝점은 모양을 읽는 축으로만 쓴다.
  // 보선은 세로 자리만 준다. 높이가 0인 칸(ㅡ · ㅢ 가로부)에서는 칸 자리가 곧 보 자리라 얹을 것이 없다.
  const ends = thinSide === 'y' ? null : stemEndsFor(jamo, stroke, received)
  if (!named && !ends) return null
  const placedStart = ends?.start ?? start
  const placedEnd = ends?.end ?? end
  const axis = { x: end.x - start.x, y: end.y - start.y }
  const refAxis = { x: axis.x * reference.width, y: axis.y * reference.height }
  const refLength = Math.hypot(refAxis.x, refAxis.y)
  const emAxis = { x: (placedEnd.x - placedStart.x) * box.width, y: (placedEnd.y - placedStart.y) * box.height }
  const emLength = Math.hypot(emAxis.x, emAxis.y)
  if (refLength < EPSILON || emLength < EPSILON) return null

  // 저장 좌표 이동량 → (축 비율 t, 수직 em n) → em 이동량. 끝점 기준 선형이다.
  const split = (offset: Vec) => {
    const em = { x: offset.x * reference.width, y: offset.y * reference.height }
    return { t: (em.x * refAxis.x + em.y * refAxis.y) / (refLength * refLength), n: (refAxis.x * em.y - refAxis.y * em.x) / refLength }
  }
  const emOffset = (offset: Vec): Vec => {
    const { t, n } = split(offset)
    return { x: t * emAxis.x - n * emAxis.y / emLength, y: t * emAxis.y + n * emAxis.x / emLength }
  }
  const origin = { x: box.x + placedStart.x * box.width, y: box.y + placedStart.y * box.height }
  const ex = emOffset({ x: 1, y: 0 })
  const ey = emOffset({ x: 0, y: 1 })
  const determinant = ex.x * ey.y - ey.x * ex.y
  const everyPart = (test: (item: Vec) => boolean) => stroke.points.every((point) => [point, point.handleIn, point.handleOut].every((item) => !item || test(item)))
  // 얇은 변에서 기본 자리를 벗어난 점(기울인 끝점 · 통째로 옮긴 획)이 있으면 곧아도 넓힌 칸에 놓아야 그만큼 보인다.
  const onBase = thinSide === null || everyPart((item) => Math.abs(item[thinSide] - THIN_BASE) < ON_BASE)
  return {
    box,
    place: (point) => {
      const moved = emOffset({ x: point.x - start.x, y: point.y - start.y })
      return { x: (origin.x + moved.x - box.x) / box.width, y: (origin.y + moved.y - box.y) / box.height }
    },
    unplaceEm: (em) => Math.abs(determinant) < EPSILON ? em : {
      x: (ey.y * em.x - ey.x * em.y) / determinant,
      y: (-ex.y * em.x + ex.x * em.y) / determinant,
    },
    straight: onBase && everyPart((item) => Math.abs(split({ x: item.x - start.x, y: item.y - start.y }).n) < EPSILON),
    ends: ends ?? null,
  }
}

/**
 * 저장된 획을 이 칸에 놓는다. 대상이 아니거나, 곧고 끝점도 제자리인 획이면 같은 획 · 같은 칸을 그대로 돌려준다.
 * 곁줄기는 마지막에 붙은 끝을 기둥의 놓인 중심선에 붙인다(`attachToPillar`).
 */
export function placeStemStroke(jamo: JamoData, stroke: StrokeDataV2, box: BoxConfig, channel?: JamoChannel): { stroke: StrokeDataV2; box: BoxConfig } {
  const frame = bendFrameOf(jamo, stroke, box, channel)
  if (!frame || (frame.straight && !frame.ends)) return attachToPillar(jamo, stroke, { stroke, box }, box, channel)
  const last = stroke.points.length - 1
  const endpoint = (index: number) => index === 0 ? frame.ends!.start : frame.ends!.end
  const points = stroke.points.map((point, index) => ({
    ...point,
    // 끝점: 보선 목표가 있으면 거기, 없으면 제자리. 칸이 그대로면 계산 오차 없이 그 값을 둔다.
    ...(frame.box === box && (index === 0 || index === last) ? (frame.ends ? endpoint(index) : { x: point.x, y: point.y }) : frame.place(point)),
    ...(point.handleIn ? { handleIn: frame.place(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: frame.place(point.handleOut) } : {}),
  }))
  if (frame.box !== box) receivedBoxOf.set(frame.box, box)
  return attachToPillar(jamo, stroke, { stroke: { ...stroke, points }, box: frame.box }, box, channel)
}

const THIN = 1e-6

/**
 * 곁줄기 · 걸침의 붙은 끝을 그 높이에서 기둥의 놓인 중심선(휨 · 기울기 포함) 위에 붙인다. 걸침은 양 끝 다.
 * 저장 획의 틈(기둥 시작점 x 기준, 기본 획과의 차이)은 기준 칸 em으로 읽어 이 칸에서도 같은 em만큼 띄운다.
 * 기둥이 곧고 틈이 0이면 자리가 그대로라 같은 획을 돌려준다 — 기본 폰트는 픽셀까지 같다.
 */
function attachToPillar(jamo: JamoData, stored: StrokeDataV2, placed: { stroke: StrokeDataV2; box: BoxConfig }, received: BoxConfig, channelHint?: JamoChannel): { stroke: StrokeDataV2; box: BoxConfig } {
  const attachment = attachmentOf(jamo, stored.id)
  if (!attachment) return placed
  const channel = channelHint && jamo[channelHint]?.some((item) => item.id === stored.id) ? channelHint : channelOf(jamo, stored.id)
  const strokes = channel ? jamo[channel] : undefined
  if (!channel || !strokes || placed.box.width < THIN || placed.box.height < THIN) return placed
  const referenceWidth = stemReferenceBox(jamo.char, channel, stored).width
  let stroke = placed.stroke
  for (const end of attachment.ends) {
    const pillar = strokes.find((item) => item.id === end.pillarId)
    if (!pillar || pillar.points.length < 2) continue
    const gap = endGapOf(strokes, stored, end)
    if (gap === null) continue
    const placedPillar = placeStemStroke(jamo, pillar, received, channel)
    if (placedPillar.box.width < THIN || placedPillar.box.height < THIN) continue
    const index = endIndexOf(stroke, end.end)
    const yEm = placed.box.y + stroke.points[index].y * placed.box.height
    const pillarX = centerlineXAtY(placedPillar.stroke, (yEm - placedPillar.box.y) / placedPillar.box.height)
    if (pillarX === null) continue
    const pillarXEm = placedPillar.box.x + pillarX * placedPillar.box.width
    const gapEm = gap * referenceWidth
    stroke = withPointX(stroke, index, attachedXOf((pillarXEm - placed.box.x) / placed.box.width, end, gapEm / placed.box.width))
  }
  return stroke === placed.stroke ? placed : { stroke, box: placed.box }
}

/**
 * 이 획을 고칠 때 눈금을 셀 칸. 얇은 칸의 줄기면 넓힌 칸, 아니면 받은 칸 그대로.
 * 방향키 · 조절판처럼 손가락 거리가 아니라 칸 눈금으로 세는 이동이 쓴다 — 두께 0인 칸의 눈금은 한 칸이 0em이라 안 움직인다.
 */
export function stemEditBox(jamo: JamoData, stroke: StrokeDataV2, shownBox: BoxConfig): BoxConfig {
  return bendFrameOf(jamo, stroke, receivedBoxOf.get(shownBox) ?? shownBox)?.box ?? shownBox
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
  // 두께 0인 변은 받은 칸 비율로 못 나눈다(백만 배가 된다). 그 방향은 넓힌 칸 비율로 되돌린다 — 저장 좌표가 그 자다.
  return { x: em.x / frame.box.width, y: em.y / frame.box.height }
}
