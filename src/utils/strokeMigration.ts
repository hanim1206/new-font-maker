import type { StrokeData, RectStrokeData, JamoData } from '../types'
import { isPathStroke } from '../types'

/**
 * 구형 rect 스트로크를 신형 포맷으로 마이그레이션합니다.
 *
 * 구형: x,y = 좌상단, width/height = 방향에 따라 길이/두께 혼용
 * 신형: x,y = 중심, width = 길이, thickness = 두께, angle = 회전각
 *
 * 변환 공식:
 * - 가로획: x→x+w/2, y→y+h/2, width 유지, thickness=height, angle=0
 * - 세로획: x→x+w/2, y→y+h/2, width=height(길이), thickness=width(두께), angle=90
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OldRectStroke = any

/**
 * 스트로크가 구형 포맷인지 판단
 * - rect: angle/thickness 없거나 height 잔여필드 있으면 구형
 * - path: thickness 없으면 마이그레이션 필요
 */
export function needsMigration(stroke: StrokeData): boolean {
  // path 스트로크: thickness 없으면 마이그레이션 필요
  if (isPathStroke(stroke)) return !('thickness' in stroke)
  // rect 스트로크: angle/thickness 없으면 구형, 또는 height 잔여필드가 있으면 정리 필요
  return !('angle' in stroke) || !('thickness' in stroke) || ('height' in stroke)
}

/**
 * 구형 rect 스트로크 → 신형 변환
 */
export function migrateRectStroke(old: OldRectStroke): RectStrokeData {
  if (old.direction === 'horizontal') {
    return {
      id: old.id,
      x: round(old.x + old.width / 2),
      y: round(old.y + old.height / 2),
      width: old.width,
      thickness: old.height,
      angle: 0,
      direction: 'horizontal',
    }
  } else {
    // vertical
    return {
      id: old.id,
      x: round(old.x + old.width / 2),
      y: round(old.y + old.height / 2),
      width: old.height, // 길이 (세로 방향이었으므로 height가 길이)
      thickness: old.width, // 두께 (세로획에서 width가 두께)
      angle: 90,
      direction: 'vertical',
    }
  }
}

/**
 * StrokeData 배열 전체를 마이그레이션
 */
export function migrateStrokes(strokes: StrokeData[]): StrokeData[] {
  return strokes.map((stroke) => {
    // path 스트로크: thickness 없으면 기본값 0.1 추가 (구형 localStorage 데이터 대응)
    if (isPathStroke(stroke)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(stroke as any).thickness) {
        return Object.assign({}, stroke, { thickness: 0.1 })
      }
      return stroke
    }

    // 완전 구형 (angle/thickness 없음) → 전체 변환
    if (!('angle' in stroke) || !('thickness' in stroke)) {
      return migrateRectStroke(stroke)
    }

    // 신형이지만 height 잔여필드 정리
    if ('height' in stroke) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { height: _, ...rest } = stroke as RectStrokeData & { height: number }
      return rest as RectStrokeData
    }

    return stroke
  })
}

/**
 * JamoData 전체를 마이그레이션
 */
export function migrateJamoData(jamo: JamoData): JamoData {
  const result = { ...jamo }
  if (result.strokes) {
    result.strokes = migrateStrokes(result.strokes)
  }
  if (result.horizontalStrokes) {
    result.horizontalStrokes = migrateStrokes(result.horizontalStrokes)
  }
  if (result.verticalStrokes) {
    result.verticalStrokes = migrateStrokes(result.verticalStrokes)
  }
  return result
}

/**
 * 0.025 그리드에 스냅 + 소수점 정리
 */
function round(value: number): number {
  const snapped = Math.round(value / 0.025) * 0.025
  return Math.round(snapped * 1000) / 1000
}
