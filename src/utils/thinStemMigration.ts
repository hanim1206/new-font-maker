import { JAMO_CHANNELS, hasMedialBoxEm, masterNameOf, medialBoxEmOf, stemAxisOf } from '../services/stemMaster'
import type { JamoData, StrokeDataV2 } from '../types'

/**
 * 높이 0인 칸(ㅡ · ㅢ 가로부)의 보를 획 편집으로 기울이거나 위아래로 옮기면, 예전에는 그 칸(높이 1e-6em)의 비율로 저장돼 값이 백만 배였다.
 * 화면에서는 그 칸에 놓여 멀쩡해 보였지만 전파가 그 값을 em으로 읽어 형제 보가 세로로 터졌다.
 * 지금 그 방향의 저장 좌표는 넓힌 칸(ㅗ 칸 높이) 비율이다(`stemBend.ts`). 예전 값을 같은 em이 되게 옮겨 적는다.
 * 손으로는 만들 수 없는 큰 값만 건드리므로 여러 번 돌려도 같다.
 */

/** 예전에 높이 0인 칸이 받던 높이(em). `componentBoxFromFaces`의 바닥값. */
const LEGACY_THIN_HEIGHT = 1e-6
/** 가운데에서 이 비율보다 멀면 예전 값이다 — 넓힌 칸 비율로 50이면 12em이라 글자 밖이다. */
const ABSURD_OFFSET = 50
const THIN_BASE = 0.5
/** 칸의 높이가 이보다 얇으면 줄기 하나짜리 채널이다(`stemMaster.ts`의 얇은 칸 기준과 같다). */
const THIN_BOX_EM = 0.05

type Vec = { x: number; y: number }

function rescaled(stroke: StrokeDataV2, scale: number): StrokeDataV2 {
  const absurd = (item?: Vec) => !!item && Math.abs(item.y - THIN_BASE) > ABSURD_OFFSET
  if (!stroke.points.some((point) => absurd(point) || absurd(point.handleIn) || absurd(point.handleOut))) return stroke
  const fix = <T extends Vec>(item: T): T => absurd(item) ? { ...item, y: THIN_BASE + (item.y - THIN_BASE) * scale } : item
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...fix(point),
      ...(point.handleIn ? { handleIn: fix(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: fix(point.handleOut) } : {}),
    })),
  }
}

/** 홀자 하나의 예전 값을 옮겨 적는다. 고칠 것이 없으면 같은 자모를 돌려준다. */
export function withThinStemInEm(jamo: JamoData): JamoData {
  if (jamo.type !== 'jungseong') return jamo
  let next = jamo
  for (const channel of JAMO_CHANNELS) {
    const strokes = jamo[channel]
    if (!strokes || !hasMedialBoxEm(jamo.char, channel) || medialBoxEmOf(jamo.char, channel, 'open').height >= THIN_BOX_EM) continue
    const scale = LEGACY_THIN_HEIGHT / medialBoxEmOf('ㅗ', 'strokes', 'open').height
    const rewritten = strokes.map((stroke) => {
      const name = masterNameOf(jamo, strokes, stroke.id)
      return name && stemAxisOf(name) === 'x' ? rescaled(stroke, scale) : stroke
    })
    if (rewritten.some((stroke, index) => stroke !== strokes[index])) next = { ...next, [channel]: rewritten }
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
