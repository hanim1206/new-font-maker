import type { StrokeDataV2, JamoData, LegacyStrokeData } from '../types'
import { convertLegacyStroke, isLegacyStroke } from './strokeConversion'

/**
 * 스트로크가 V2 형식인지 확인합니다.
 * V2: points 배열 + closed + thickness
 */
function isV2Stroke(stroke: unknown): stroke is StrokeDataV2 {
  return (
    typeof stroke === 'object' &&
    stroke !== null &&
    'points' in stroke &&
    Array.isArray((stroke as Record<string, unknown>).points) &&
    'closed' in stroke
  )
}

/**
 * 스트로크가 마이그레이션이 필요한지 판단합니다.
 * - 레거시 형식 (direction 필드 존재): V2로 변환 필요
 * - 초기 구형 (angle/thickness 없는 rect): 중간 형식 거쳐 V2로 변환
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function needsMigration(stroke: any): boolean {
  // 이미 V2 형식이면 마이그레이션 불필요
  if (isV2Stroke(stroke)) return false
  // 레거시 형식이면 마이그레이션 필요
  if (isLegacyStroke(stroke)) return true
  // 완전 구형 (direction + 좌상단 좌표) → 마이그레이션 필요
  return 'direction' in stroke || !('points' in stroke)
}

/**
 * 초기 구형 rect 스트로크 (x,y = 좌상단) → 중간 형식 (x,y = 중심) 변환
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateOldRectToCenter(old: any) {
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
    return {
      id: old.id,
      x: round(old.x + old.width / 2),
      y: round(old.y + old.height / 2),
      width: old.height,
      thickness: old.width,
      angle: 90,
      direction: 'vertical',
    }
  }
}

/**
 * 단일 스트로크를 V2로 마이그레이션합니다.
 * - 이미 V2이면 그대로 반환
 * - 레거시 중간 형식 (center + angle): V2로 직접 변환
 * - 완전 구형 (좌상단 + width/height): 중간 형식 거쳐 V2로 변환
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateOneStroke(stroke: any): StrokeDataV2 {
  // 이미 V2 형식
  if (isV2Stroke(stroke)) return stroke

  // 레거시 중간 형식 (angle + thickness 있음)
  if ('angle' in stroke && 'thickness' in stroke) {
    return convertLegacyStroke(stroke)
  }

  // 완전 구형 (좌상단 좌표) → 중간 형식 → V2
  if ('direction' in stroke) {
    if (stroke.direction === 'path') {
      // 구형 path → thickness 없으면 기본값 추가 후 변환
      const patched = { ...stroke, thickness: stroke.thickness ?? 0.1 }
      return convertLegacyStroke(patched)
    }
    // 구형 rect (좌상단) → 중간 형식(중심) → V2
    const centered = migrateOldRectToCenter(stroke) as LegacyStrokeData
    return convertLegacyStroke(centered)
  }

  // 알 수 없는 형식 — 최선의 추측으로 반환
  return stroke as StrokeDataV2
}

/**
 * StrokeData 배열 전체를 V2로 마이그레이션
 */
export function migrateStrokes(strokes: unknown[]): StrokeDataV2[] {
  return strokes.map(migrateOneStroke)
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
