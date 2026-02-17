/**
 * 레거시 획 데이터(RectStrokeData / PathStrokeData)를 통합 StrokeDataV2로 변환합니다.
 *
 * RectStrokeData: 중심점(x,y) + width + angle → 시작점/끝점 2포인트
 * PathStrokeData: 바운딩박스 + 상대 포인트 → 박스 직접 상대 포인트
 */
import type {
  RectStrokeData,
  PathStrokeData,
  LegacyStrokeData,
  StrokeDataV2,
  AnchorPoint,
} from '../types'
import { isPathStroke } from '../types'

/**
 * RectStrokeData → StrokeDataV2
 *
 * 가로획 (angle=0): 중심에서 좌우로 width/2 만큼 확장
 * 세로획 (angle=90): 중심에서 상하로 width/2 만큼 확장
 * 임의 각도: 삼각함수로 시작/끝점 계산
 */
export function convertRectToNew(rect: RectStrokeData): StrokeDataV2 {
  const angle = rect.angle ?? 0
  const halfLen = rect.width / 2

  let start: AnchorPoint
  let end: AnchorPoint

  if (angle === 0) {
    // 가로획: x축 방향
    start = { x: rect.x - halfLen, y: rect.y }
    end = { x: rect.x + halfLen, y: rect.y }
  } else if (angle === 90) {
    // 세로획: y축 방향
    // 현재 시스템에서 width는 세로획일 때 box.height 기준으로 스케일링됨
    // 새 시스템에서는 y좌표가 0~1(박스 높이 기준)이므로 동일하게 halfLen 사용
    start = { x: rect.x, y: rect.y - halfLen }
    end = { x: rect.x, y: rect.y + halfLen }
  } else {
    // 임의 각도: 삼각함수
    const angleRad = (angle * Math.PI) / 180
    const dx = halfLen * Math.cos(angleRad)
    const dy = halfLen * Math.sin(angleRad)
    start = { x: rect.x - dx, y: rect.y - dy }
    end = { x: rect.x + dx, y: rect.y + dy }
  }

  return {
    id: rect.id,
    points: [start, end],
    closed: false,
    thickness: rect.thickness,
    label: rect.direction, // 'horizontal' | 'vertical'
  }
}

/**
 * PathStrokeData → StrokeDataV2
 *
 * 바운딩박스(x,y,width,height) 내 상대좌표를 박스 직접 상대좌표로 변환
 * point.x → stroke.x + point.x * stroke.width
 * point.y → stroke.y + point.y * stroke.height
 */
export function convertPathToNew(path: PathStrokeData): StrokeDataV2 {
  const points: AnchorPoint[] = path.pathData.points.map((pt) => {
    const anchor: AnchorPoint = {
      x: path.x + pt.x * path.width,
      y: path.y + pt.y * path.height,
    }

    if (pt.handleIn) {
      anchor.handleIn = {
        x: path.x + pt.handleIn.x * path.width,
        y: path.y + pt.handleIn.y * path.height,
      }
    }
    if (pt.handleOut) {
      anchor.handleOut = {
        x: path.x + pt.handleOut.x * path.width,
        y: path.y + pt.handleOut.y * path.height,
      }
    }

    return anchor
  })

  return {
    id: path.id,
    points,
    closed: path.pathData.closed,
    thickness: path.thickness,
    label: path.pathData.closed ? 'circle' : 'curve',
  }
}

/**
 * LegacyStrokeData → StrokeDataV2
 * 타입에 따라 적절한 변환 함수를 호출합니다.
 */
export function convertLegacyStroke(stroke: LegacyStrokeData): StrokeDataV2 {
  if (isPathStroke(stroke)) {
    return convertPathToNew(stroke)
  }
  return convertRectToNew(stroke)
}

/**
 * 레거시 획 배열인지 확인합니다.
 * direction 필드가 있으면 레거시입니다.
 */
export function isLegacyStroke(stroke: unknown): stroke is LegacyStrokeData {
  return (
    typeof stroke === 'object' &&
    stroke !== null &&
    'direction' in stroke &&
    typeof (stroke as Record<string, unknown>).direction === 'string'
  )
}

/**
 * 레거시 획 배열을 새 형식으로 마이그레이션합니다.
 * 이미 새 형식이면 그대로 반환합니다.
 */
export function migrateStrokes(strokes: unknown[]): StrokeDataV2[] {
  return strokes.map((stroke) => {
    if (isLegacyStroke(stroke)) {
      return convertLegacyStroke(stroke)
    }
    // 이미 새 형식이면 그대로 반환
    return stroke as StrokeDataV2
  })
}
