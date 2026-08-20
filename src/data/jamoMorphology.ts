import type { BoxConfig, Part } from '../types'

const DEFAULT_STROKE_THICKNESS = 0.07

/** 아랫변이 획으로 닫혀 있어 위쪽 가로중성이 좌우로 돌출하면 안 되는 초성. */
const CHOSEONG_WITH_CLOSED_BOTTOM_EDGE = new Set([
  'ㄷ', 'ㄸ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅌ', 'ㅍ',
])

export function hasClosedBottomEdge(choseong: string): boolean {
  return CHOSEONG_WITH_CLOSED_BOTTOM_EDGE.has(choseong)
}

/**
 * ㅗ·ㅛ는 닫힌 초성의 아랫면 아래에 놓인다.
 * 중성의 기존 가로폭은 유지하고 세로획만 초성 하단을 관통하지 않게 한다.
 */
export function constrainUpwardHorizontalJungseong(
  boxes: Partial<Record<Part, BoxConfig>>,
  choseong: string,
  jungseong: string,
): Partial<Record<Part, BoxConfig>> {
  if (!hasClosedBottomEdge(choseong) || (jungseong !== 'ㅗ' && jungseong !== 'ㅛ')) return boxes

  const choseongBox = boxes.CH
  const jungseongBox = boxes.JU
  if (!choseongBox || !jungseongBox) return boxes

  // 두 획의 중심선이 최소 한 획 두께만큼 떨어져야 실제 잉크가 겹치지 않는다.
  const top = Math.max(
    jungseongBox.y,
    choseongBox.y + choseongBox.height + DEFAULT_STROKE_THICKNESS,
  )
  const bottom = jungseongBox.y + jungseongBox.height

  return {
    ...boxes,
    JU: {
      ...jungseongBox,
      y: top,
      height: Math.max(0.01, bottom - top),
    },
  }
}
