import type { PathData, PathPoint } from '../types'

/**
 * PathData의 상대 좌표(0~1)를 절대 viewBox 좌표로 변환하여
 * SVG <path> 요소의 d 속성 문자열을 생성합니다.
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

  const toAbs = (px: number, py: number): [number, number] => [
    absX + px * absWidth,
    absY + py * absHeight,
  ]

  const parts: string[] = []

  // 첫 점으로 이동
  const [startX, startY] = toAbs(points[0].x, points[0].y)
  parts.push(`M ${startX} ${startY}`)

  // 연속 점 쌍에 대해 베지어 세그먼트 생성
  for (let i = 0; i < points.length - 1; i++) {
    appendSegment(parts, points[i], points[i + 1], toAbs)
  }

  // 닫힌 패스: 마지막→첫 점 구간 후 Z
  if (closed && points.length >= 2) {
    appendSegment(parts, points[points.length - 1], points[0], toAbs)
    parts.push('Z')
  }

  return parts.join(' ')
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
