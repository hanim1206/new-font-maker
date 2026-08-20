import type { BoxConfig, Padding, Part } from '../types'

/**
 * 자모의 모양이 아니라 조합 안에서의 배치를 설명하는 호환 프로필.
 * 과거 baseJamos.json에 들어 있던 자모 padding을 레이아웃 책임으로 옮긴 값이다.
 */
const JUNGSEONG_PLACEMENT_INSETS: Readonly<Record<string, Padding>> = {
  'ㅏ': { top: 0, bottom: 0, left: 0.225, right: 0 },
  'ㅗ': { top: 0, bottom: 0.2, left: 0, right: 0 },
  'ㅜ': { top: 0.3, bottom: 0, left: 0, right: 0 },
}

function insetBox(box: BoxConfig, inset: Padding): BoxConfig {
  return {
    x: box.x + inset.left * box.width,
    y: box.y + inset.top * box.height,
    width: box.width * (1 - inset.left - inset.right),
    height: box.height * (1 - inset.top - inset.bottom),
  }
}

/** 음절 문맥에 맞는 조합 배치를 최종 슬롯에 적용한다. */
export function applyComponentPlacementProfile(
  boxes: Partial<Record<Part, BoxConfig>>,
  jungseong: string,
): Partial<Record<Part, BoxConfig>> {
  const inset = JUNGSEONG_PLACEMENT_INSETS[jungseong]
  const box = boxes.JU
  if (!inset || !box) return boxes

  return {
    ...boxes,
    JU: insetBox(box, inset),
  }
}

export function getJungseongPlacementInset(jungseong: string): Padding | undefined {
  const inset = JUNGSEONG_PLACEMENT_INSETS[jungseong]
  return inset ? { ...inset } : undefined
}
