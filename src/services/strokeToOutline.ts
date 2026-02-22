/**
 * 획 중심선(StrokeDataV2) → 채워진 윤곽 컨투어 변환
 *
 * SVG는 centerline + stroke-width로 그리지만,
 * 폰트 글리프는 filled outline이 필요.
 * stroke 중심선을 thickness/2만큼 양쪽으로 확장하여
 * 닫힌 윤곽 컨투어를 생성한다.
 *
 * 알고리즘: Subdivision + Perpendicular Offset
 * - 직선: 수직 오프셋
 * - 베지어: 세분화 후 각 마이크로 세그먼트에 수직 오프셋
 * - Douglas-Peucker로 포인트 수 축소
 */
import type { StrokeDataV2, AnchorPoint, BoxConfig, StrokeLinecap } from '../types'

// ===== 타입 정의 =====

/** 폰트 컨투어의 단일 점 */
export interface ContourPoint {
  x: number       // UPM 좌표 (0-1000)
  y: number       // UPM 좌표, Y-up
  onCurve: boolean // true = on-curve, false = off-curve 제어점
}

/** 닫힌 컨투어 (글리프 윤곽) */
export type Contour = ContourPoint[]

/** 2D 벡터 (내부 계산용) */
interface Vec2 {
  x: number
  y: number
}

/** 스트로크 변환 스타일 옵션 */
export interface StrokeStyle {
  weightMultiplier: number
  slant: number               // 기울기 (도)
  globalLinecap: StrokeLinecap
}

// ===== 2D 벡터 유틸리티 =====

function vec(x: number, y: number): Vec2 {
  return { x, y }
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

function normalize(v: Vec2): Vec2 {
  const len = length(v)
  if (len < 1e-10) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

/** 90도 반시계 회전 (왼쪽 법선) */
function perpCCW(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x }
}

function dist(a: Vec2, b: Vec2): number {
  return length(sub(b, a))
}

// ===== 좌표 변환 =====

/**
 * 박스 기준 0-1 좌표 → 폰트 UPM 절대 좌표
 * Y축 뒤집기 + 슬랜트 적용
 *
 * pathUtils.ts L173-176의 toAbs()와 동일한 박스 변환 후,
 * 폰트 좌표계로 전환 (Y flip + slant)
 */
function toFontCoord(
  px: number, py: number,
  box: BoxConfig, upm: number, slant: number
): Vec2 {
  // SVG 절대 좌표 (0-1 → 0-upm)
  const svgX = (box.x + px * box.width) * upm
  const svgY = (box.y + py * box.height) * upm

  // Y축 뒤집기 (SVG y-down → font y-up)
  const fontY = upm - svgY

  // 슬랜트 (SvgRenderer L268: skewX(-slant), 중심 기준)
  const fontX = svgX + (fontY - upm / 2) * Math.tan(slant * Math.PI / 180)

  return vec(fontX, fontY)
}

/**
 * AnchorPoint (+ 핸들) → 폰트 절대 좌표로 변환
 */
function anchorToAbsolute(
  anchor: AnchorPoint,
  box: BoxConfig, upm: number, slant: number
): { point: Vec2; handleIn?: Vec2; handleOut?: Vec2 } {
  const point = toFontCoord(anchor.x, anchor.y, box, upm, slant)
  const handleIn = anchor.handleIn
    ? toFontCoord(anchor.handleIn.x, anchor.handleIn.y, box, upm, slant)
    : undefined
  const handleOut = anchor.handleOut
    ? toFontCoord(anchor.handleOut.x, anchor.handleOut.y, box, upm, slant)
    : undefined
  return { point, handleIn, handleOut }
}

// ===== 비정방 비율 곡률 보정 =====

/**
 * pathUtils.ts L241-278의 adjustAnchorHandlesForAspectRatio() 미러링
 * 닫힌 패스에서 비정방 박스일 때 핸들 보정
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

// ===== 베지어 곡선 수학 =====

/** 2차 → 3차 베지어 승격 */
function quadraticToCubic(
  p0: Vec2, cp: Vec2, p2: Vec2
): { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2 } {
  return {
    p0,
    p1: add(scale(p0, 1 / 3), scale(cp, 2 / 3)),
    p2: add(scale(p2, 1 / 3), scale(cp, 2 / 3)),
    p3: p2,
  }
}

/** 3차 베지어 위의 점 (De Casteljau) */
function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t
  return vec(
    mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  )
}

/** 3차 베지어 접선 벡터 */
function cubicTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t
  return vec(
    3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  )
}

/** 3차 베지어 근사 호 길이 (선형 세분화) */
function approxCubicArcLength(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, steps = 16): number {
  let len = 0
  let prev = p0
  for (let i = 1; i <= steps; i++) {
    const curr = cubicPoint(p0, p1, p2, p3, i / steps)
    len += dist(prev, curr)
    prev = curr
  }
  return len
}

// ===== 세그먼트 오프셋 =====

interface OffsetSegment {
  left: Vec2[]
  right: Vec2[]
}

/**
 * 직선 세그먼트 오프셋
 * 양쪽 수직 방향으로 halfWidth만큼 이동
 */
function offsetLineSegment(p0: Vec2, p1: Vec2, halfWidth: number): OffsetSegment {
  const dir = normalize(sub(p1, p0))
  // 길이 0 세그먼트 처리
  if (dir.x === 0 && dir.y === 0) {
    return { left: [p0, p1], right: [p0, p1] }
  }
  const n = perpCCW(dir)
  const offset = scale(n, halfWidth)
  return {
    left: [add(p0, offset), add(p1, offset)],
    right: [sub(p0, offset), sub(p1, offset)],
  }
}

/**
 * 3차 베지어 세그먼트 오프셋
 * 곡선을 N개 직선으로 세분화한 뒤 각각 오프셋
 */
function offsetCubicSegment(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2,
  halfWidth: number
): OffsetSegment {
  // 적응적 세분화: 호 길이가 클수록 더 많이 분할
  const arcLen = approxCubicArcLength(p0, p1, p2, p3)
  const subdivisions = Math.max(8, Math.min(48, Math.ceil(arcLen / (halfWidth * 0.5))))

  const leftPoints: Vec2[] = []
  const rightPoints: Vec2[] = []

  for (let i = 0; i <= subdivisions; i++) {
    const t = i / subdivisions
    const point = cubicPoint(p0, p1, p2, p3, t)
    let tangent = cubicTangent(p0, p1, p2, p3, t)

    // 접선이 0인 경우 (끝점에서 발생 가능) 앞뒤 근사값 사용
    if (length(tangent) < 1e-10) {
      const dt = 0.001
      if (t < 0.5) {
        tangent = cubicTangent(p0, p1, p2, p3, t + dt)
      } else {
        tangent = cubicTangent(p0, p1, p2, p3, t - dt)
      }
    }

    const n = perpCCW(normalize(tangent))
    leftPoints.push(add(point, scale(n, halfWidth)))
    rightPoints.push(sub(point, scale(n, halfWidth)))
  }

  return { left: leftPoints, right: rightPoints }
}

// ===== Linecap 생성 =====

/** 베지어 근사 원호 상수 */
const KAPPA = 0.5522847498

/**
 * 획 끝 모양 생성
 *
 * @param center 끝점 중심 좌표
 * @param tangent 획 방향 접선 (끝점에서 바깥 방향)
 * @param leftPoint 왼쪽 오프셋 점
 * @param rightPoint 오른쪽 오프셋 점
 * @param halfWidth 획 반폭
 * @param capType 끝 모양 종류
 * @returns on-curve 포인트 배열 (leftPoint → rightPoint 방향)
 */
function generateLinecap(
  center: Vec2,
  tangent: Vec2,
  leftPoint: Vec2,
  rightPoint: Vec2,
  halfWidth: number,
  capType: StrokeLinecap
): ContourPoint[] {
  const dir = normalize(tangent) // 바깥 방향
  const n = perpCCW(dir) // 왼쪽 법선

  if (capType === 'butt') {
    // butt: 별도 점 추가 없음 (left→right 직선)
    return []
  }

  if (capType === 'square') {
    // square: halfWidth만큼 바깥으로 연장된 사각형
    const ext = scale(dir, halfWidth)
    const p1 = add(leftPoint, ext)
    const p2 = add(rightPoint, ext)
    return [
      { x: p1.x, y: p1.y, onCurve: true },
      { x: p2.x, y: p2.y, onCurve: true },
    ]
  }

  // round: 반원 (2개의 quarter-arc cubic bezier)
  // left → top → right
  const topPoint = add(center, scale(dir, halfWidth))
  const kappaOffset = halfWidth * KAPPA

  // 왼쪽 quarter arc: leftPoint → topPoint
  const cp1 = add(leftPoint, scale(dir, kappaOffset))
  const cp2 = add(topPoint, scale(n, kappaOffset))

  // 오른쪽 quarter arc: topPoint → rightPoint
  const cp3 = sub(topPoint, scale(n, kappaOffset))
  const cp4 = add(rightPoint, scale(dir, kappaOffset))

  return [
    { x: cp1.x, y: cp1.y, onCurve: false },
    { x: cp2.x, y: cp2.y, onCurve: false },
    { x: topPoint.x, y: topPoint.y, onCurve: true },
    { x: cp3.x, y: cp3.y, onCurve: false },
    { x: cp4.x, y: cp4.y, onCurve: false },
  ]
}



// ===== Douglas-Peucker 단순화 =====

function perpendicularDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lineLenSq = dx * dx + dy * dy

  if (lineLenSq < 1e-10) return dist(point, lineStart)

  const t = Math.max(0, Math.min(1,
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLenSq
  ))

  const proj = vec(lineStart.x + t * dx, lineStart.y + t * dy)
  return dist(point, proj)
}

function douglasPeucker(points: Vec2[], tolerance: number): Vec2[] {
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

// ===== 메인 변환 함수 =====

/**
 * 단일 세그먼트의 종류 판별 + 오프셋 계산
 *
 * pathUtils.ts appendAnchorSegment() (L212-235)와 동일한 로직:
 * - 양쪽 handleOut+handleIn → cubic bezier
 * - 한쪽 handle만 → quadratic → cubic 승격
 * - handle 없음 → 직선
 */
function offsetSegment(
  fromAbs: { point: Vec2; handleOut?: Vec2 },
  toAbs: { point: Vec2; handleIn?: Vec2 },
  halfWidth: number
): OffsetSegment {
  const hasOut = fromAbs.handleOut !== undefined
  const hasIn = toAbs.handleIn !== undefined

  if (hasOut && hasIn) {
    // Cubic bezier
    return offsetCubicSegment(
      fromAbs.point, fromAbs.handleOut!, toAbs.handleIn!, toAbs.point,
      halfWidth
    )
  }

  if (hasOut) {
    // Quadratic → cubic 승격
    const cubic = quadraticToCubic(fromAbs.point, fromAbs.handleOut!, toAbs.point)
    return offsetCubicSegment(cubic.p0, cubic.p1, cubic.p2, cubic.p3, halfWidth)
  }

  if (hasIn) {
    // Quadratic → cubic 승격
    const cubic = quadraticToCubic(fromAbs.point, toAbs.handleIn!, toAbs.point)
    return offsetCubicSegment(cubic.p0, cubic.p1, cubic.p2, cubic.p3, halfWidth)
  }

  // 직선
  return offsetLineSegment(fromAbs.point, toAbs.point, halfWidth)
}

/**
 * 세그먼트의 시작/끝 접선 벡터 계산
 */
function getSegmentTangents(
  fromAbs: { point: Vec2; handleOut?: Vec2 },
  toAbs: { point: Vec2; handleIn?: Vec2 }
): { startTangent: Vec2; endTangent: Vec2 } {
  const hasOut = fromAbs.handleOut !== undefined
  const hasIn = toAbs.handleIn !== undefined

  if (hasOut && hasIn) {
    // Cubic: 시작 접선 = cp1-p0, 끝 접선 = p3-cp2
    let startT = sub(fromAbs.handleOut!, fromAbs.point)
    let endT = sub(toAbs.point, toAbs.handleIn!)
    if (length(startT) < 1e-10) startT = sub(toAbs.point, fromAbs.point)
    if (length(endT) < 1e-10) endT = sub(toAbs.point, fromAbs.point)
    return { startTangent: normalize(startT), endTangent: normalize(endT) }
  }

  if (hasOut) {
    let startT = sub(fromAbs.handleOut!, fromAbs.point)
    let endT = sub(toAbs.point, fromAbs.handleOut!)
    if (length(startT) < 1e-10) startT = sub(toAbs.point, fromAbs.point)
    if (length(endT) < 1e-10) endT = sub(toAbs.point, fromAbs.point)
    return { startTangent: normalize(startT), endTangent: normalize(endT) }
  }

  if (hasIn) {
    let startT = sub(toAbs.handleIn!, fromAbs.point)
    let endT = sub(toAbs.point, toAbs.handleIn!)
    if (length(startT) < 1e-10) startT = sub(toAbs.point, fromAbs.point)
    if (length(endT) < 1e-10) endT = sub(toAbs.point, fromAbs.point)
    return { startTangent: normalize(startT), endTangent: normalize(endT) }
  }

  // 직선
  const t = normalize(sub(toAbs.point, fromAbs.point))
  return { startTangent: t, endTangent: t }
}

/**
 * StrokeDataV2를 폰트 윤곽 컨투어로 변환
 *
 * @param stroke 획 데이터
 * @param box 레이아웃 박스 (0-1 정규화)
 * @param upm Units Per Em
 * @param style 글로벌 스타일 (weight, slant, linecap)
 * @returns 컨투어 배열 (open stroke: 1개, closed: 2개)
 */
export function strokeToContours(
  stroke: StrokeDataV2,
  box: BoxConfig,
  upm: number,
  style: StrokeStyle
): Contour[] {
  const points = stroke.points
  if (points.length < 2 && !stroke.closed) return []
  if (points.length < 1) return []

  // 비정방 비율 곡률 보정 (pathUtils.ts L178-187 미러링)
  let renderPoints = points
  if (stroke.closed && box.width > 0 && box.height > 0) {
    const absWidth = box.width * upm
    const absHeight = box.height * upm
    const ratio = absWidth / absHeight
    if (Math.abs(ratio - 1) > 0.05) {
      renderPoints = adjustAnchorHandlesForAspectRatio(points, ratio)
    }
  }

  // 획 반폭 계산 (SvgRenderer L114: thickness * weightMultiplier * viewBoxSize)
  const strokeWidth = stroke.thickness * style.weightMultiplier * upm
  const halfWidth = strokeWidth / 2
  // 최소 반폭 보장
  const effectiveHalfWidth = Math.max(halfWidth, 0.5)

  // linecap 결정 (globalStyleStore resolveLinecap 로직)
  const capType: StrokeLinecap = stroke.linecap ?? style.globalLinecap ?? 'round'

  // 앵커 → 절대 좌표 변환
  const absAnchors = renderPoints.map(a => anchorToAbsolute(a, box, upm, style.slant))

  // 세그먼트 수 결정
  const segCount = stroke.closed ? absAnchors.length : absAnchors.length - 1
  if (segCount <= 0) return []

  // 모든 세그먼트 오프셋 계산
  const segments: OffsetSegment[] = []
  const segTangents: Array<{ startTangent: Vec2; endTangent: Vec2 }> = []

  for (let i = 0; i < segCount; i++) {
    const fromIdx = i
    const toIdx = (i + 1) % absAnchors.length
    const from = absAnchors[fromIdx]
    const to = absAnchors[toIdx]

    segments.push(offsetSegment(
      { point: from.point, handleOut: from.handleOut },
      { point: to.point, handleIn: to.handleIn },
      effectiveHalfWidth
    ))

    segTangents.push(getSegmentTangents(
      { point: from.point, handleOut: from.handleOut },
      { point: to.point, handleIn: to.handleIn }
    ))
  }

  if (stroke.closed) {
    return assembleClosedContours(absAnchors, segments, segTangents, effectiveHalfWidth)
  } else {
    return assembleOpenContours(absAnchors, segments, segTangents, effectiveHalfWidth, capType)
  }
}

/**
 * Open stroke 컨투어 조립
 * left forward → end cap → right backward → start cap
 * 결과: CW (시계 방향) 1개 컨투어
 */
function assembleOpenContours(
  absAnchors: Array<{ point: Vec2; handleIn?: Vec2; handleOut?: Vec2 }>,
  segments: OffsetSegment[],
  segTangents: Array<{ startTangent: Vec2; endTangent: Vec2 }>,
  halfWidth: number,
  capType: StrokeLinecap
): Contour[] {
  // 왼쪽 전진 포인트 수집
  let leftPoints: Vec2[] = []
  let rightPoints: Vec2[] = []

  for (let i = 0; i < segments.length; i++) {
    if (i === 0) {
      leftPoints.push(...segments[i].left)
      rightPoints.push(...segments[i].right)
    } else {
      // 조인: 이전 세그먼트 끝 법선 → 현재 세그먼트 시작 법선
      // 단순 연결 (join point = 각 세그먼트 오프셋 점)
      leftPoints.push(...segments[i].left)
      rightPoints.push(...segments[i].right)
    }
  }

  // Douglas-Peucker 단순화
  leftPoints = douglasPeucker(leftPoints, 0.5)
  rightPoints = douglasPeucker(rightPoints, 0.5)

  // 컨투어 조립: left → endCap → right(역순) → startCap
  const contour: ContourPoint[] = []

  // 1. Left side forward
  for (const p of leftPoints) {
    contour.push({ x: Math.round(p.x), y: Math.round(p.y), onCurve: true })
  }

  // 2. End cap
  const lastLeft = leftPoints[leftPoints.length - 1]
  const lastRight = rightPoints[rightPoints.length - 1]
  const endTangent = segTangents[segTangents.length - 1].endTangent
  const endCenter = absAnchors[absAnchors.length - 1].point
  const endCap = generateLinecap(endCenter, endTangent, lastLeft, lastRight, halfWidth, capType)
  contour.push(...endCap)

  // 3. Right side backward
  for (let i = rightPoints.length - 1; i >= 0; i--) {
    contour.push({ x: Math.round(rightPoints[i].x), y: Math.round(rightPoints[i].y), onCurve: true })
  }

  // 4. Start cap
  const firstLeft = leftPoints[0]
  const firstRight = rightPoints[0]
  const startTangent = scale(segTangents[0].startTangent, -1) // 바깥 방향 (시작점에서 뒤로)
  const startCenter = absAnchors[0].point
  const startCap = generateLinecap(startCenter, startTangent, firstRight, firstLeft, halfWidth, capType)
  contour.push(...startCap)

  return contour.length >= 3 ? [contour] : []
}

/**
 * Closed stroke 컨투어 조립
 * 외곽 (CW) + 내곽 (CCW) = 도넛 형태
 */
function assembleClosedContours(
  absAnchors: Array<{ point: Vec2; handleIn?: Vec2; handleOut?: Vec2 }>,
  segments: OffsetSegment[],
  _segTangents: Array<{ startTangent: Vec2; endTangent: Vec2 }>,
  halfWidth: number
): Contour[] {
  // 왼쪽 = outer, 오른쪽 = inner
  let outerPoints: Vec2[] = []
  let innerPoints: Vec2[] = []

  for (const seg of segments) {
    outerPoints.push(...seg.left)
    innerPoints.push(...seg.right)
  }

  // 단순화
  outerPoints = douglasPeucker(outerPoints, 0.5)
  innerPoints = douglasPeucker(innerPoints, 0.5)

  // 감기 방향 결정: outer는 CW, inner는 CCW
  // OpenType: CW = filled, CCW = hole
  const outerContour: Contour = ensureWindingDirection(
    outerPoints.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), onCurve: true })),
    'cw'
  )

  const innerContour: Contour = ensureWindingDirection(
    innerPoints.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), onCurve: true })),
    'ccw'
  )

  const result: Contour[] = []

  // 가운데 보이드가 있는 닫힌 획 (ㅇ 등)인지 확인
  // inner가 outer 안에 있으면 도넛형, 아니면 단일 컨투어
  if (outerContour.length >= 3) result.push(outerContour)
  if (innerContour.length >= 3 && isDonutShape(absAnchors, halfWidth)) {
    result.push(innerContour)
  }

  return result
}

/**
 * 닫힌 획이 도넛형(구멍이 있는)인지 판별
 * 내부 공간이 충분히 크면 도넛
 */
function isDonutShape(
  absAnchors: Array<{ point: Vec2 }>,
  halfWidth: number
): boolean {
  // 바운딩 박스 계산
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const a of absAnchors) {
    minX = Math.min(minX, a.point.x)
    maxX = Math.max(maxX, a.point.x)
    minY = Math.min(minY, a.point.y)
    maxY = Math.max(maxY, a.point.y)
  }
  const w = maxX - minX
  const h = maxY - minY
  const minDim = Math.min(w, h)

  // 내부 구멍이 있으려면 최소 치수가 획폭의 2배보다 커야 함
  return minDim > halfWidth * 2.5
}

/**
 * 컨투어 감기 방향 보장
 */
function ensureWindingDirection(
  contour: Contour,
  direction: 'cw' | 'ccw'
): Contour {
  const area = computeSignedArea(contour)
  // 양수 area = CCW (Y-up 좌표계), 음수 = CW
  const isCCW = area > 0

  if ((direction === 'ccw' && !isCCW) || (direction === 'cw' && isCCW)) {
    return [...contour].reverse()
  }
  return contour
}

/**
 * 부호 있는 면적 계산 (Shoelace formula)
 */
function computeSignedArea(contour: Contour): number {
  let area = 0
  const n = contour.length
  for (let i = 0; i < n; i++) {
    const curr = contour[i]
    const next = contour[(i + 1) % n]
    area += curr.x * next.y - next.x * curr.y
  }
  return area / 2
}
