import type { Contour } from './strokeToOutline'

/**
 * 합친 뒤 윤곽 단순화 — 추출(OTF) 전용.
 *
 * 붓·둥글기 폰트는 둥근 곳을 촘촘한 다각형으로 근사해 점이 수백 개가 된다.
 * CharString으로 굳히기 직전에 Douglas-Peucker로 허용오차 ε(1000 UPM 단위) 안에서 점을 줄인다.
 * 화면 미리보기·편집기 윤곽은 이 경로를 지나지 않는다.
 *
 * 지키는 것: 닫힘 · 점 순서(방향) · 윤곽 개수. 곡선 제어점(off-curve)이 섞인 윤곽은 건드리지 않는다.
 */

/** 추출 기본 허용오차(1000 UPM 단위). G0·G1에서 정함 — 점 절반, 모양 이탈 ≤ 1 (플랜 2026-10-02). */
export const EXPORT_SIMPLIFY_EPSILON = 1

interface Pt {
  x: number
  y: number
}

function perpendicularDistance(point: Pt, lineStart: Pt, lineEnd: Pt): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lineLenSq = dx * dx + dy * dy
  if (lineLenSq < 1e-10) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y)
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLenSq))
  return Math.hypot(point.x - (lineStart.x + t * dx), point.y - (lineStart.y + t * dy))
}

function douglasPeucker(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points
  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance)
    const right = douglasPeucker(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

/** 닫힌 윤곽 하나를 단순화한다. 시작점을 고정하지 않도록 가장 먼 두 점에서 쪼개 두 번 돈다. */
export function simplifyClosedContour(contour: Contour, epsilon: number): Contour {
  if (epsilon <= 0 || contour.length <= 4) return contour
  if (contour.some((point) => !point.onCurve)) return contour
  const pts: Pt[] = contour
  let k = 1
  let best = -1
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2
    if (d > best) {
      best = d
      k = i
    }
  }
  const a = douglasPeucker(pts.slice(0, k + 1), epsilon)
  const b = douglasPeucker([...pts.slice(k), pts[0]], epsilon)
  const merged = [...a.slice(0, -1), ...b.slice(0, -1)]
  if (merged.length < 3) return contour
  return merged.map((p) => ({ x: p.x, y: p.y, onCurve: true }))
}

/** 글리프의 합친 윤곽 전체를 단순화한다. 윤곽 개수와 순서는 그대로다. */
export function simplifyMergedContours(contours: Contour[], epsilon: number): Contour[] {
  if (epsilon <= 0) return contours
  return contours.map((contour) => simplifyClosedContour(contour, epsilon))
}
