import type { LayoutType, LayoutSchema, BoxConfig, Part } from '../types'
import { calculateBoxes, DEFAULT_LAYOUT_SCHEMAS } from '../utils/layoutCalculator'

/**
 * 레이아웃 설정 (호환성 유지용)
 * 기존 코드와의 호환을 위해 boxes 형태로도 제공
 */
export interface LayoutConfig {
  layoutType: LayoutType
  boxes: {
    CH?: BoxConfig
    JU?: BoxConfig
    JU_H?: BoxConfig
    JU_V?: BoxConfig
    JO?: BoxConfig
  }
}

/**
 * LayoutSchema를 LayoutConfig로 변환 (호환성)
 */
function schemaToConfig(schema: LayoutSchema): LayoutConfig {
  const boxes = calculateBoxes(schema)
  return {
    layoutType: schema.id,
    boxes: boxes as LayoutConfig['boxes'],
  }
}

/**
 * 기본 레이아웃 스키마 (Split + Padding 기반)
 * 이것이 실제 저장되는 형식
 */
export { DEFAULT_LAYOUT_SCHEMAS }

/**
 * 기본 레이아웃 설정 (Box 좌표 형식 - 계산된 값)
 * 기존 코드 호환을 위해 유지
 */
export const DEFAULT_LAYOUT_CONFIGS: Record<LayoutType, LayoutConfig> = Object.fromEntries(
  Object.entries(DEFAULT_LAYOUT_SCHEMAS).map(([key, schema]) => [
    key,
    schemaToConfig(schema),
  ])
) as Record<LayoutType, LayoutConfig>

/**
 * LayoutSchema에서 특정 슬롯의 BoxConfig 가져오기
 */
export function getBoxFromSchema(schema: LayoutSchema, part: Part): BoxConfig | undefined {
  const boxes = calculateBoxes(schema)
  return boxes[part]
}

/**
 * Split 값 업데이트 헬퍼
 */
export function updateSplitValue(
  schema: LayoutSchema,
  splitIndex: number,
  newValue: number
): LayoutSchema {
  if (!schema.splits || splitIndex >= schema.splits.length) {
    return schema
  }

  const newSplits = [...schema.splits]
  newSplits[splitIndex] = { ...newSplits[splitIndex], value: newValue }

  return {
    ...schema,
    splits: newSplits,
  }
}

/**
 * Padding 값 업데이트 헬퍼
 */
export function updatePaddingValue(
  schema: LayoutSchema,
  side: 'top' | 'bottom' | 'left' | 'right',
  newValue: number
): LayoutSchema {
  const currentPadding = schema.padding || {
    top: 0.05,
    bottom: 0.05,
    left: 0.05,
    right: 0.05,
  }

  return {
    ...schema,
    padding: {
      ...currentPadding,
      [side]: newValue,
    },
  }
}

/*
 * 레거시 주석 - 향후 확장 가능성을 위해 보존
 * "레이아웃 변형" 기능 구현 시 활용 가능
 *
 * // 초성+세로중성 - 초성 넓게 (splitX: 0.70)
 * // 초성+세로중성 - 중성 넓게 (splitX: 0.50)
 */
