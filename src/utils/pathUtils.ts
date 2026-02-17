import type { PathData, PathPoint, AnchorPoint, BoxConfig } from '../types'

/**
 * PathData의 상대 좌표(0~1)를 절대 viewBox 좌표로 변환하여
 * SVG <path> 요소의 d 속성 문자열을 생성합니다.
 *
 * 닫힌 패스(closed=true)에서 비정방 비율일 때,
 * 베지어 핸들 거리를 보정하여 자연스러운 곡률을 유지합니다.
 */
export function pathDataToSvgD(
  pathData: PathData,
  absX: number,
  absY: number,
  absWidth: number,
  absHeight: number
): string {
  const { points, closed } = pathData
  if (points.length < 2) return ''

  // 닫힌 패스의 비정방 비율 곡률 보정
  // aspect ratio가 1:1이 아닐 때, 짧은 축의 핸들 거리를 늘려서
  // 럭비공 형태 대신 자연스러운 타원 곡률을 만듦
  let adjustedPoints = points
  if (closed && absWidth > 0 && absHeight > 0) {
    const ratio = absWidth / absHeight
    // 비율이 1:1에서 크게 벗어날 때만 보정 (5% 이상 차이)
    if (Math.abs(ratio - 1) > 0.05) {
      adjustedPoints = adjustHandlesForAspectRatio(points, ratio)
    }
  }

  const toAbs = (px: number, py: number): [number, number] => [
    absX + px * absWidth,
    absY + py * absHeight,
  ]

  const parts: string[] = []

  // 첫 점으로 이동
  const [startX, startY] = toAbs(adjustedPoints[0].x, adjustedPoints[0].y)
  parts.push(`M ${startX} ${startY}`)

  // 연속 점 쌍에 대해 베지어 세그먼트 생성
  for (let i = 0; i < adjustedPoints.length - 1; i++) {
    appendSegment(parts, adjustedPoints[i], adjustedPoints[i + 1], toAbs)
  }

  // 닫힌 패스: 마지막→첫 점 구간 후 Z
  if (closed && adjustedPoints.length >= 2) {
    appendSegment(parts, adjustedPoints[adjustedPoints.length - 1], adjustedPoints[0], toAbs)
    parts.push('Z')
  }

  return parts.join(' ')
}

/**
 * 비정방 비율(aspect ratio ≠ 1)에서 베지어 핸들을 보정합니다.
 *
 * 원리: 정방형에서 원(circle)을 비정방형으로 스케일하면
 * 수학적으로 올바른 타원이 되지만, 좁은 축 끝 부분이
 * 뾰족해 보임(럭비공 효과).
 *
 * 보정 방법: 짧은 축 방향의 핸들 거리를 늘려서
 * 곡률이 더 부드럽고 둥글게 유지되도록 함.
 * 이는 폰트 디자인에서 사용하는 superellipse 보간과 유사.
 */
function adjustHandlesForAspectRatio(
  points: PathPoint[],
  ratio: number // width / height
): PathPoint[] {
  // 보정 강도 (0 = 보정 없음, 높을수록 둥글게)
  // ratio가 1에서 멀어질수록 보정 강도 증가
  const deviation = Math.abs(ratio - 1)
  // 최대 30%까지 핸들 거리 보정, 부드러운 곡선으로 전환
  const strength = Math.min(deviation * 0.4, 0.3)

  return points.map((point) => {
    const adjusted = { ...point }

    if (point.handleIn) {
      adjusted.handleIn = adjustHandle(point, point.handleIn, ratio, strength)
    }
    if (point.handleOut) {
      adjusted.handleOut = adjustHandle(point, point.handleOut, ratio, strength)
    }

    return adjusted
  })
}

/**
 * 개별 핸들의 위치를 비율에 따라 보정합니다.
 * 짧은 축 방향으로 이동하는 핸들의 거리를 늘립니다.
 */
function adjustHandle(
  anchor: PathPoint,
  handle: { x: number; y: number },
  ratio: number,
  strength: number
): { x: number; y: number } {
  const dx = handle.x - anchor.x
  const dy = handle.y - anchor.y

  let adjustedDx = dx
  let adjustedDy = dy

  if (ratio > 1) {
    // 가로가 세로보다 넓음 → 세로(Y) 방향 핸들 거리를 늘림
    // Y 방향으로 이동하는 핸들(dy가 큰)의 거리를 확대
    if (Math.abs(dy) > 0.001) {
      adjustedDy = dy * (1 + strength)
    }
  } else {
    // 세로가 가로보다 넓음 → 가로(X) 방향 핸들 거리를 늘림
    if (Math.abs(dx) > 0.001) {
      adjustedDx = dx * (1 + strength)
    }
  }

  return {
    x: anchor.x + adjustedDx,
    y: anchor.y + adjustedDy,
  }
}

/**
 * 두 점 사이의 세그먼트를 SVG 경로 명령으로 추가합니다.
 * 핸들 유무에 따라 C(큐빅), Q(이차), L(직선) 선택.
 */
function appendSegment(
  parts: string[],
  from: PathPoint,
  to: PathPoint,
  toAbs: (x: number, y: number) => [number, number]
): void {
  const hasOut = from.handleOut !== undefined
  const hasIn = to.handleIn !== undefined
  const [toX, toY] = toAbs(to.x, to.y)

  if (hasOut && hasIn) {
    const [cp1x, cp1y] = toAbs(from.handleOut!.x, from.handleOut!.y)
    const [cp2x, cp2y] = toAbs(to.handleIn!.x, to.handleIn!.y)
    parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${toX} ${toY}`)
  } else if (hasOut) {
    const [cpx, cpy] = toAbs(from.handleOut!.x, from.handleOut!.y)
    parts.push(`Q ${cpx} ${cpy} ${toX} ${toY}`)
  } else if (hasIn) {
    const [cpx, cpy] = toAbs(to.handleIn!.x, to.handleIn!.y)
    parts.push(`Q ${cpx} ${cpy} ${toX} ${toY}`)
  } else {
    parts.push(`L ${toX} ${toY}`)
  }
}

// ===== 통합 StrokeData(V2) 렌더링 =====

/**
 * AnchorPoint[] + BoxConfig → SVG path d 속성 문자열
 *
 * 모든 좌표를 박스 기준 0~1에서 절대 SVG viewBox 좌표로 변환합니다.
 * 닫힌 패스(closed=true)에서 비정방 비율일 때 베지어 핸들 보정도 적용합니다.
 */
export function pointsToSvgD(
  points: AnchorPoint[],
  closed: boolean,
  box: BoxConfig,
  viewBoxSize: number
): string {
  if (points.length < 2 && !closed) return ''
  if (points.length < 1) return ''

  const toAbs = (px: number, py: number): [number, number] => [
    (box.x + px * box.width) * viewBoxSize,
    (box.y + py * box.height) * viewBoxSize,
  ]

  // 닫힌 패스의 비정방 비율 곡률 보정
  let renderPoints: AnchorPoint[] = points
  if (closed && box.width > 0 && box.height > 0) {
    const absWidth = box.width * viewBoxSize
    const absHeight = box.height * viewBoxSize
    const ratio = absWidth / absHeight
    if (Math.abs(ratio - 1) > 0.05) {
      renderPoints = adjustAnchorHandlesForAspectRatio(points, ratio)
    }
  }

  const parts: string[] = []

  // 첫 점으로 이동
  const [startX, startY] = toAbs(renderPoints[0].x, renderPoints[0].y)
  parts.push(`M ${startX} ${startY}`)

  // 연속 점 쌍에 대해 세그먼트 생성
  for (let i = 0; i < renderPoints.length - 1; i++) {
    appendAnchorSegment(parts, renderPoints[i], renderPoints[i + 1], toAbs)
  }

  // 닫힌 패스: 마지막→첫 점 구간 후 Z
  if (closed && renderPoints.length >= 2) {
    appendAnchorSegment(parts, renderPoints[renderPoints.length - 1], renderPoints[0], toAbs)
    parts.push('Z')
  }

  return parts.join(' ')
}

/**
 * AnchorPoint 쌍의 세그먼트를 SVG 경로 명령으로 추가합니다.
 */
function appendAnchorSegment(
  parts: string[],
  from: AnchorPoint,
  to: AnchorPoint,
  toAbs: (x: number, y: number) => [number, number]
): void {
  const hasOut = from.handleOut !== undefined
  const hasIn = to.handleIn !== undefined
  const [toX, toY] = toAbs(to.x, to.y)

  if (hasOut && hasIn) {
    const [cp1x, cp1y] = toAbs(from.handleOut!.x, from.handleOut!.y)
    const [cp2x, cp2y] = toAbs(to.handleIn!.x, to.handleIn!.y)
    parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${toX} ${toY}`)
  } else if (hasOut) {
    const [cpx, cpy] = toAbs(from.handleOut!.x, from.handleOut!.y)
    parts.push(`Q ${cpx} ${cpy} ${toX} ${toY}`)
  } else if (hasIn) {
    const [cpx, cpy] = toAbs(to.handleIn!.x, to.handleIn!.y)
    parts.push(`Q ${cpx} ${cpy} ${toX} ${toY}`)
  } else {
    parts.push(`L ${toX} ${toY}`)
  }
}

/**
 * AnchorPoint 배열의 비정방 비율 곡률 보정
 * (기존 adjustHandlesForAspectRatio와 동일한 로직, AnchorPoint용)
 */
function adjustAnchorHandlesForAspectRatio(
  points: AnchorPoint[],
  ratio: number
): AnchorPoint[] {
  const deviation = Math.abs(ratio - 1)
  const strength = Math.min(deviation * 0.4, 0.3)

  return points.map((point) => {
    const adjusted = { ...point }

    if (point.handleIn) {
      const dx = point.handleIn.x - point.x
      const dy = point.handleIn.y - point.y
      let adjustedDx = dx
      let adjustedDy = dy
      if (ratio > 1) {
        if (Math.abs(dy) > 0.001) adjustedDy = dy * (1 + strength)
      } else {
        if (Math.abs(dx) > 0.001) adjustedDx = dx * (1 + strength)
      }
      adjusted.handleIn = { x: point.x + adjustedDx, y: point.y + adjustedDy }
    }
    if (point.handleOut) {
      const dx = point.handleOut.x - point.x
      const dy = point.handleOut.y - point.y
      let adjustedDx = dx
      let adjustedDy = dy
      if (ratio > 1) {
        if (Math.abs(dy) > 0.001) adjustedDy = dy * (1 + strength)
      } else {
        if (Math.abs(dx) > 0.001) adjustedDx = dx * (1 + strength)
      }
      adjusted.handleOut = { x: point.x + adjustedDx, y: point.y + adjustedDy }
    }

    return adjusted
  })
}

/**
 * 4점 큐빅 베지어로 원(타원)을 근사하는 PathData를 생성합니다.
 * K=0.5523은 원에 가장 가까운 4-포인트 베지어 근사 상수입니다.
 */
export function createCirclePath(
  cx: number = 0.5,
  cy: number = 0.5,
  rx: number = 0.5,
  ry: number = 0.5
): PathData {
  const K = 0.5522847498

  const top: PathPoint = {
    x: cx,
    y: cy - ry,
    handleIn: { x: cx - rx * K, y: cy - ry },
    handleOut: { x: cx + rx * K, y: cy - ry },
  }
  const right: PathPoint = {
    x: cx + rx,
    y: cy,
    handleIn: { x: cx + rx, y: cy - ry * K },
    handleOut: { x: cx + rx, y: cy + ry * K },
  }
  const bottom: PathPoint = {
    x: cx,
    y: cy + ry,
    handleIn: { x: cx + rx * K, y: cy + ry },
    handleOut: { x: cx - rx * K, y: cy + ry },
  }
  const left: PathPoint = {
    x: cx - rx,
    y: cy,
    handleIn: { x: cx - rx, y: cy + ry * K },
    handleOut: { x: cx - rx, y: cy - ry * K },
  }

  return {
    points: [top, right, bottom, left],
    closed: true,
  }
}
