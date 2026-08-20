import type { AnchorPoint } from '../types'

const POSITION_EPSILON = 1e-6

function samePosition(first: AnchorPoint, second: AnchorPoint): boolean {
  return Math.abs(first.x - second.x) <= POSITION_EPSILON
    && Math.abs(first.y - second.y) <= POSITION_EPSILON
}

/**
 * 닫힌 획은 `closed` 자체가 마지막→첫 점 연결을 표현한다.
 * 레거시 데이터의 중복 마지막 시작점은 제거하되, 닫힘 곡선의 handleIn은 첫 점에 보존한다.
 */
export function normalizeClosedStrokePoints(
  points: AnchorPoint[],
  closed: boolean,
): AnchorPoint[] {
  if (!closed || points.length < 2) return points

  const first = points[0]
  let endIndex = points.length
  let closingHandleIn = first.handleIn

  while (endIndex > 1 && samePosition(first, points[endIndex - 1])) {
    closingHandleIn ??= points[endIndex - 1].handleIn
    endIndex -= 1
  }

  if (endIndex === points.length) return points

  const normalizedFirst = closingHandleIn && closingHandleIn !== first.handleIn
    ? { ...first, handleIn: { ...closingHandleIn } }
    : first
  return [normalizedFirst, ...points.slice(1, endIndex)]
}
