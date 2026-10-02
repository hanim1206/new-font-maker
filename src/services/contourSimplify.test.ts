import { describe, expect, it } from 'vitest'
import { simplifyClosedContour, simplifyMergedContours } from './contourSimplify'
import type { Contour } from './strokeToOutline'

/** 반지름 r 원을 n점 다각형으로. 둥근 윤곽을 점으로 촘촘히 찍은 추출 윤곽과 같은 모양. */
function circleContour(r: number, n: number): Contour {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return { x: 500 + r * Math.cos(t), y: 500 + r * Math.sin(t), onCurve: true }
  })
}

function signedArea(contour: Contour): number {
  let area = 0
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]
    const b = contour[(i + 1) % contour.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

function maxDeviation(original: Contour, simplified: Contour): number {
  const distToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    const t = lenSq < 1e-10 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }
  return Math.max(...original.map((p) =>
    Math.min(...simplified.map((_, i) => distToSegment(p, simplified[i], simplified[(i + 1) % simplified.length])))
  ))
}

describe('simplifyClosedContour', () => {
  it('점을 줄이되 원본 점이 허용오차 밖으로 벗어나지 않는다', () => {
    const original = circleContour(200, 256)
    const simplified = simplifyClosedContour(original, 1)
    expect(simplified.length).toBeLessThan(original.length / 2)
    expect(maxDeviation(original, simplified)).toBeLessThanOrEqual(1)
  })

  it('방향(부호 있는 넓이의 부호)을 지킨다 — 채움과 구멍이 뒤집히면 안 된다', () => {
    const fill = circleContour(200, 128)
    const hole = [...circleContour(100, 128)].reverse()
    expect(Math.sign(signedArea(simplifyClosedContour(fill, 1)))).toBe(Math.sign(signedArea(fill)))
    expect(Math.sign(signedArea(simplifyClosedContour(hole, 1)))).toBe(Math.sign(signedArea(hole)))
  })

  it('곡선 제어점(off-curve)이 섞인 윤곽은 그대로 둔다', () => {
    const contour: Contour = circleContour(200, 64)
    contour[10] = { ...contour[10], onCurve: false }
    expect(simplifyClosedContour(contour, 2)).toBe(contour)
  })

  it('ε 0 이하면 그대로 둔다', () => {
    const contour = circleContour(200, 64)
    expect(simplifyClosedContour(contour, 0)).toBe(contour)
    expect(simplifyMergedContours([contour], 0)).toEqual([contour])
  })

  it('윤곽 개수와 순서를 바꾸지 않는다', () => {
    const contours = [circleContour(200, 128), [...circleContour(100, 128)].reverse(), circleContour(30, 16)]
    const simplified = simplifyMergedContours(contours, 1)
    expect(simplified).toHaveLength(3)
    // 작은 윤곽(점 16개 → 4개 이하로는 안 줄어듦)도 자리와 방향을 지킨다
    expect(Math.sign(signedArea(simplified[1]))).toBe(Math.sign(signedArea(contours[1])))
    expect(simplified[2].length).toBeGreaterThanOrEqual(3)
  })
})
