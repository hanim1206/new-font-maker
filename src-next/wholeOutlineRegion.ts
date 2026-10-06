import type { BoxConfig } from '../src/types'

/**
 * 통째 선택 테두리(SVG 필터)의 범위.
 * 사파리(WebKit)는 필터 범위가 기기 픽셀로 4096 × 4096 넓이를 넘으면 필터를 건 그림을 통째로 안 그린다 — 테두리만이 아니라 잉크가 사라진다.
 * 그래서 범위를 캔버스에 보이는 만큼만 잡고, 그래도 한계에 가까우면 테두리를 포기한다(`null`).
 */
export const FILTER_PIXEL_AREA_LIMIT = 4096 * 4096
/** 한계의 이만큼까지만 쓴다. */
const SAFE_SHARE = 0.6
/** 보이는 범위 밖으로 더 덮는 몫(보기 창 한 변의 배수, 한쪽). 가장자리에 걸친 잉크의 테두리가 안 잘리게. */
const EDGE_MARGIN = 0.02

/**
 * @param viewport 보기 창(em). 정사각이고 캔버스의 짧은 변에 맞춰 가운데 그려진다 — 긴 변 쪽으로는 보기 창 밖도 보인다(`크게` 보기).
 * @param canvas 캔버스 크기(CSS px). 아직 못 쟀으면 `null` — 정사각으로 본다.
 */
export function wholeOutlineRegion(viewport: BoxConfig, canvas: { width: number; height: number } | null, pixelRatio: number): BoxConfig | null {
  const short = canvas ? Math.min(canvas.width, canvas.height) : 0
  const measured = canvas !== null && short > 0
  const margin = viewport.width * EDGE_MARGIN
  const width = viewport.width * (measured ? canvas.width / short : 1) + margin * 2
  const height = viewport.height * (measured ? canvas.height / short : 1) + margin * 2
  if (measured) {
    const pixelsPerEm = short / viewport.width * pixelRatio
    if (width * pixelsPerEm * height * pixelsPerEm > FILTER_PIXEL_AREA_LIMIT * SAFE_SHARE) return null
  }
  return { x: viewport.x + viewport.width / 2 - width / 2, y: viewport.y + viewport.height / 2 - height / 2, width, height }
}
