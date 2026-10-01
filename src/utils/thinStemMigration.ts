import { JAMO_CHANNELS, hasMedialBoxEm, masterNameOf, medialBoxEmOf, stemAxisOf } from '../services/stemMaster'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'

/**
 * 높이 0인 칸(ㅡ · ㅢ 가로부)의 보를 획 편집으로 기울이거나 위아래로 옮기면, 예전에는 그 칸(높이 1e-6em)의 비율로 저장돼 값이 백만 배였다.
 * 화면에서는 그 칸에 놓여 멀쩡해 보였지만 전파가 그 값을 em으로 읽어 형제 보가 세로로 터졌다.
 * 지금 그 방향의 저장 좌표는 넓힌 칸(ㅗ 칸 높이) 비율이다(`stemBend.ts`). 예전 값을 **예전에 화면에 보이던 모양 그대로** 옮겨 적는다 —
 * 끝점은 얇은 칸에 놓였고, 핸들은 그 끝점을 잇는 축을 기준으로 (축 비율, 수직 em)으로 놓였다. 둘을 따로 줄이면 끝의 휨이 사라진다.
 * 끝점이 손으로는 만들 수 없는 큰 값인 획만 건드리므로 여러 번 돌려도 같다.
 */

/** 예전에 높이 0인 칸이 받던 높이(em). `componentBoxFromFaces`의 바닥값. */
const LEGACY_THIN_HEIGHT = 1e-6
/** 가운데에서 이 비율보다 멀면 예전 값이다 — 넓힌 칸 비율로 50이면 12em이라 글자 밖이다. */
const ABSURD_OFFSET = 50
const THIN_BASE = 0.5
/** 칸의 높이가 이보다 얇으면 줄기 하나짜리 채널이다(`stemMaster.ts`의 얇은 칸 기준과 같다). */
const THIN_BOX_EM = 0.05

type Vec = { x: number; y: number }

/**
 * 예전 값으로 저장된 보 하나를 옮겨 적는다. `width`는 그 칸의 폭(em), `height`는 넓힌 칸의 높이(em).
 * 예전 화면: 시작점은 얇은 칸 자리, 끝점은 거기서 (가로 × 칸 폭, 세로 × 1e-6)만큼. 그 사이 점 · 핸들은 저장 좌표를 기준 칸 em으로 읽어
 * 끝점 축에 대한 (축 비율 t, 수직 em n)으로 나눈 뒤 그 놓인 축 위에 다시 놓았다.
 */
function rewritten(stroke: StrokeDataV2, width: number, height: number): StrokeDataV2 {
  const last = stroke.points.length - 1
  if (last < 1 || !stroke.points.some((point) => Math.abs(point.y - THIN_BASE) > ABSURD_OFFSET)) return stroke
  const start = stroke.points[0]
  const end = stroke.points[last]
  const axis = { x: end.x - start.x, y: end.y - start.y }
  const refAxis = { x: axis.x * width, y: axis.y * height }
  const refLength = Math.hypot(refAxis.x, refAxis.y)
  const emAxis = { x: axis.x * width, y: axis.y * LEGACY_THIN_HEIGHT }
  const emLength = Math.hypot(emAxis.x, emAxis.y)
  const newStart = { x: start.x, y: THIN_BASE + (start.y - THIN_BASE) * LEGACY_THIN_HEIGHT / height }
  // 시작점에서 본 예전 화면 자리(em).
  const shownEm = (item: Vec): Vec => {
    const offset = { x: (item.x - start.x) * width, y: (item.y - start.y) * height }
    if (refLength < 1e-12 || emLength < 1e-12) return { x: offset.x, y: (item.y - start.y) * LEGACY_THIN_HEIGHT }
    const t = (offset.x * refAxis.x + offset.y * refAxis.y) / (refLength * refLength)
    const n = (refAxis.x * offset.y - refAxis.y * offset.x) / refLength
    return { x: t * emAxis.x - n * emAxis.y / emLength, y: t * emAxis.y + n * emAxis.x / emLength }
  }
  const place = (item: Vec): Vec => { const em = shownEm(item); return { x: newStart.x + em.x / width, y: newStart.y + em.y / height } }
  return {
    ...stroke,
    points: stroke.points.map((point, index): AnchorPoint => ({
      ...point,
      ...(index === 0 ? newStart : place(point)),
      ...(point.handleIn ? { handleIn: place(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: place(point.handleOut) } : {}),
    })),
  }
}

/** 홀자 하나의 예전 값을 옮겨 적는다. 고칠 것이 없으면 같은 자모를 돌려준다. */
export function withThinStemInEm(jamo: JamoData): JamoData {
  if (jamo.type !== 'jungseong') return jamo
  let next = jamo
  for (const channel of JAMO_CHANNELS) {
    const strokes = jamo[channel]
    if (!strokes || !hasMedialBoxEm(jamo.char, channel)) continue
    const box = medialBoxEmOf(jamo.char, channel, 'open')
    if (box.height >= THIN_BOX_EM) continue
    const height = medialBoxEmOf('ㅗ', 'strokes', 'open').height
    const changed = strokes.map((stroke) => {
      const name = masterNameOf(jamo, strokes, stroke.id)
      return name && stemAxisOf(name) === 'x' ? rewritten(stroke, box.width, height) : stroke
    })
    if (changed.some((stroke, index) => stroke !== strokes[index])) next = { ...next, [channel]: changed }
  }
  return next
}

/** 홀자 맵 전체. 고칠 것이 없으면 같은 맵을 돌려준다. */
export function withThinStemsInEm<T extends Record<string, JamoData>>(jungseong: T): T {
  let next: Record<string, JamoData> | null = null
  for (const [char, jamo] of Object.entries(jungseong)) {
    const fixed = withThinStemInEm(jamo)
    if (fixed !== jamo) (next ??= { ...jungseong })[char] = fixed
  }
  return (next ?? jungseong) as T
}
