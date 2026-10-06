import { describe, expect, it } from 'vitest'
import { FILTER_PIXEL_AREA_LIMIT, wholeOutlineRegion } from './wholeOutlineRegion'

const VIEW = { x: -0.08, y: -0.08, width: 1.16, height: 1.16 }
const pixelArea = (region: { width: number; height: number }, short: number, pixelRatio: number) => {
  const pixelsPerEm = short / VIEW.width * pixelRatio
  return region.width * pixelsPerEm * region.height * pixelsPerEm
}

describe('통째 선택 테두리 필터의 범위', () => {
  it('정사각 캔버스에서는 보기 창을 조금 넘는 만큼만 덮는다', () => {
    const region = wholeOutlineRegion(VIEW, { width: 306, height: 306 }, 3)!
    expect(region.width).toBeGreaterThan(VIEW.width)
    expect(region.width).toBeLessThan(VIEW.width * 1.1)
    expect(region.x + region.width / 2).toBeCloseTo(VIEW.x + VIEW.width / 2)
  })

  it('`크게`의 길쭉한 캔버스에서는 긴 변 쪽으로 보이는 데까지 덮는다', () => {
    const region = wholeOutlineRegion(VIEW, { width: 792, height: 1094 }, 2)!
    expect(region.height / region.width).toBeGreaterThan(1.3)
    expect(region.height).toBeGreaterThanOrEqual(VIEW.height * 1094 / 792)
    expect(region.y + region.height / 2).toBeCloseTo(VIEW.y + VIEW.height / 2)
  })

  it('폰 · 아이패드 · 큰 아이패드의 `크게`에서 사파리 한계 안에 든다', () => {
    for (const [width, height, pixelRatio] of [[362, 578, 3], [792, 1094, 2], [996, 1280, 2], [1338, 938, 2]] as const) {
      const region = wholeOutlineRegion(VIEW, { width, height }, pixelRatio)
      expect(region).not.toBeNull()
      expect(pixelArea(region!, Math.min(width, height), pixelRatio)).toBeLessThan(FILTER_PIXEL_AREA_LIMIT)
    }
  })

  it('한계에 가까울 만큼 큰 캔버스면 테두리를 포기한다(잉크는 남는다)', () => {
    expect(wholeOutlineRegion(VIEW, { width: 2800, height: 1500 }, 2)).toBeNull()
  })

  it('캔버스를 아직 못 쟀으면 정사각으로 본다', () => {
    const region = wholeOutlineRegion(VIEW, null, 2)!
    expect(region.width).toBeCloseTo(region.height)
  })
})
