import type { LayoutSchema, BoxConfig, Part, Padding, LayoutType, PartOverride, OverrideCondition } from '../types'

/** 음절 컨텍스트 (calculateBoxes에 전달 시 레이아웃 오버라이드 해석에 사용) */
export interface SyllableContext {
  cho: string
  jung: string
  jong: string
}

/** OR(AND) 조건 매칭 — JamoOverride와 동일한 로직 */
function matchesConditionGroups(
  conditionGroups: OverrideCondition[][],
  context: SyllableContext,
  layoutType: LayoutType,
): boolean {
  if (conditionGroups.length === 0) return false
  return conditionGroups.some((group) =>
    group.every((cond) => {
      if (cond.type === 'layoutIs') return cond.layout === layoutType
      if (cond.type === 'choseongIs') return cond.jamo === context.cho
      if (cond.type === 'jungseongIs') return cond.jamo === context.jung
      if (cond.type === 'jongseongIs') return cond.jamo === context.jong
      return false
    })
  )
}
import basePresets from '../data/basePresets.json'

// 기본 패딩 값
const DEFAULT_PADDING: Padding = {
  top: 0.05,
  bottom: 0.05,
  left: 0.05,
  right: 0.05,
}

// Split 없을 때 사용하는 기본 패딩 (넓은 여백)
const DEFAULT_SINGLE_SLOT_PADDING: Padding = {
  top: 0.15,
  bottom: 0.15,
  left: 0.15,
  right: 0.15,
}

/**
 * Padding으로부터 BoxConfig 계산
 */
function paddingToBox(padding: Padding): BoxConfig {
  return {
    x: padding.left,
    y: padding.top,
    width: 1 - padding.left - padding.right,
    height: 1 - padding.top - padding.bottom,
  }
}

/**
 * partOverrides 적용: 계산된 박스에 오프셋 적용
 * 양수 = 안쪽 축소, 음수 = 바깥 확장 (오버랩 허용)
 */
function applyPartOverrides(
  boxes: Partial<Record<Part, BoxConfig>>,
  overrides?: Partial<Record<Part, PartOverride>>
): Partial<Record<Part, BoxConfig>> {
  if (!overrides) return boxes

  const result = { ...boxes }

  for (const [part, override] of Object.entries(overrides)) {
    const box = result[part as Part]
    if (!box || !override) continue

    const top = override.top ?? 0
    const bottom = override.bottom ?? 0
    const left = override.left ?? 0
    const right = override.right ?? 0

    result[part as Part] = {
      x: box.x + left,
      y: box.y + top,
      width: Math.max(0.01, box.width - left - right),
      height: Math.max(0.01, box.height - top - bottom),
    }
  }

  return result
}

/**
 * LayoutSchema로부터 각 슬롯의 BoxConfig 계산
 * context가 주어지면 schema.overrides에서 매칭되는 LayoutOverride의 partOverrides를 병합
 */
export function calculateBoxes(
  schema: LayoutSchema,
  context?: SyllableContext,
): Partial<Record<Part, BoxConfig>> {
  const rawBoxes = calculateRawBoxes(schema)

  let effectivePartOverrides = schema.partOverrides

  if (context && schema.overrides && schema.overrides.length > 0) {
    // 우선순위 내림차순으로 매칭 오버라이드 검색
    const matching = schema.overrides
      .filter((o) => o.enabled && matchesConditionGroups(o.conditionGroups, context, schema.id))
      .sort((a, b) => b.priority - a.priority)

    if (matching.length > 0) {
      // 가장 높은 우선순위 오버라이드의 partOverrides를 기본 partOverrides에 병합
      effectivePartOverrides = {
        ...schema.partOverrides,
        ...matching[0].partOverrides,
      }
    }
  }

  return applyPartOverrides(rawBoxes, effectivePartOverrides)
}

/**
 * Split + Padding 기반 박스 계산 (오버라이드 적용 전)
 */
export function calculateRawBoxes(schema: LayoutSchema): Partial<Record<Part, BoxConfig>> {
  const boxes: Partial<Record<Part, BoxConfig>> = {}
  const padding = schema.padding || DEFAULT_PADDING
  const splits = schema.splits || []
  const layoutType = schema.id

  // Split 0개: padding만으로 단일 슬롯 계산
  if (splits.length === 0) {
    const singlePadding = schema.padding || DEFAULT_SINGLE_SLOT_PADDING
    const singleSlot = schema.slots[0]
    if (singleSlot) {
      boxes[singleSlot] = paddingToBox(singlePadding)
    }
    return boxes
  }

  // 레이아웃 타입별 계산 분기
  switch (layoutType) {
    case 'choseong-jungseong-vertical':
      return calculateVerticalSplit(schema, padding)

    case 'choseong-jungseong-horizontal':
      return calculateHorizontalSplit(schema, padding)

    case 'choseong-jungseong-vertical-jongseong':
      return calculateVerticalWithJongseong(schema, padding)

    case 'choseong-jungseong-horizontal-jongseong':
      return calculateHorizontalWithJongseong(schema, padding)

    case 'choseong-jungseong-mixed':
      return calculateMixedJungseong(schema, padding)

    case 'choseong-jungseong-mixed-jongseong':
      return calculateMixedJungseongWithJongseong(schema, padding)

    case 'jungseong-mixed-only':
      return calculateMixedJungseongOnly(schema, padding)

    default: {
      // 단일 슬롯 (choseong-only, jungseong-*-only)
      const singlePadding = schema.padding || DEFAULT_SINGLE_SLOT_PADDING
      if (schema.slots[0]) {
        boxes[schema.slots[0]] = paddingToBox(singlePadding)
      }
      return boxes
    }
  }
}

/**
 * 초성 + 세로중성 (X축 분할 1개)
 * CH: 좌측, JU: 우측
 */
function calculateVerticalSplit(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  const splitX = schema.splits?.[0]?.value ?? 0.6

  return {
    CH: {
      x: padding.left,
      y: padding.top,
      width: splitX - padding.left,
      height: 1 - padding.top - padding.bottom,
    },
    JU: {
      x: splitX,
      y: padding.top,
      width: 1 - splitX - padding.right,
      height: 1 - padding.top - padding.bottom,
    },
  }
}

/**
 * 초성 + 가로중성 (Y축 분할 1개)
 * CH: 상단, JU: 하단
 */
function calculateHorizontalSplit(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  const splitY = schema.splits?.[0]?.value ?? 0.55

  return {
    CH: {
      x: padding.left,
      y: padding.top,
      width: 1 - padding.left - padding.right,
      height: splitY - padding.top,
    },
    JU: {
      x: padding.left,
      y: splitY,
      width: 1 - padding.left - padding.right,
      height: 1 - splitY - padding.bottom,
    },
  }
}

/**
 * 초성 + 세로중성 + 종성 (X축 + Y축 분할)
 * CH: 좌상, JU: 우상, JO: 하단 전체
 */
function calculateVerticalWithJongseong(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  const splitX = schema.splits?.find((s) => s.axis === 'x')?.value ?? 0.6
  const splitY = schema.splits?.find((s) => s.axis === 'y')?.value ?? 0.55

  return {
    CH: {
      x: padding.left,
      y: padding.top,
      width: splitX - padding.left,
      height: splitY - padding.top,
    },
    JU: {
      x: splitX,
      y: padding.top,
      width: 1 - splitX - padding.right,
      height: splitY - padding.top,
    },
    JO: {
      x: padding.left,
      y: splitY,
      width: 1 - padding.left - padding.right,
      height: 1 - splitY - padding.bottom,
    },
  }
}

/**
 * 초성 + 가로중성 + 종성 (Y축 분할 2개)
 * CH: 상단, JU: 중단, JO: 하단
 */
function calculateHorizontalWithJongseong(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  // Y축 splits를 순서대로 사용
  const ySplits = schema.splits?.filter((s) => s.axis === 'y') ?? []
  const splitY1 = ySplits[0]?.value ?? 0.375
  const splitY2 = ySplits[1]?.value ?? 0.6

  return {
    CH: {
      x: padding.left,
      y: padding.top,
      width: 1 - padding.left - padding.right,
      height: splitY1 - padding.top,
    },
    JU: {
      x: padding.left,
      y: splitY1,
      width: 1 - padding.left - padding.right,
      height: splitY2 - splitY1,
    },
    JO: {
      x: padding.left,
      y: splitY2,
      width: 1 - padding.left - padding.right,
      height: 1 - splitY2 - padding.bottom,
    },
  }
}

/**
 * 초성 + 혼합중성 (JU_H, JU_V 별도)
 */
function calculateMixedJungseong(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  const splitX = schema.splits?.find((s) => s.axis === 'x')?.value ?? 0.55
  const splitY = schema.splits?.find((s) => s.axis === 'y')?.value ?? 0.5

  return {
    CH: {
      x: padding.left,
      y: padding.top,
      width: splitX - padding.left,
      height: splitY - padding.top,
    },
    JU_H: {
      x: padding.left,
      y: splitY,
      width: splitX - padding.left,
      height: 1 - splitY - padding.bottom,
    },
    JU_V: {
      x: splitX,
      y: padding.top,
      width: 1 - splitX - padding.right,
      height: 1 - padding.top - padding.bottom,
    },
  }
}

/**
 * 초성 + 혼합중성 + 종성
 */
function calculateMixedJungseongWithJongseong(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  const splitX = schema.splits?.find((s) => s.axis === 'x')?.value ?? 0.55
  // Y축 splits: 첫 번째는 CH/JU_H 경계, 두 번째는 JO 상단
  const ySplits = schema.splits?.filter((s) => s.axis === 'y') ?? []
  const splitY1 = ySplits[0]?.value ?? 0.5
  const splitY2 = ySplits[1]?.value ?? 0.75

  return {
    CH: {
      x: padding.left,
      y: padding.top,
      width: splitX - padding.left,
      height: splitY1 - padding.top,
    },
    JU_H: {
      x: padding.left,
      y: splitY1,
      width: splitX - padding.left,
      height: splitY2 - splitY1,
    },
    JU_V: {
      x: splitX,
      y: padding.top,
      width: 1 - splitX - padding.right,
      height: splitY2 - padding.top,
    },
    JO: {
      x: padding.left,
      y: splitY2,
      width: 1 - padding.left - padding.right,
      height: 1 - splitY2 - padding.bottom,
    },
  }
}

/**
 * 혼합중성만 (JU_H, JU_V)
 */
function calculateMixedJungseongOnly(
  schema: LayoutSchema,
  padding: Padding
): Partial<Record<Part, BoxConfig>> {
  const splitX = schema.splits?.find((s) => s.axis === 'x')?.value ?? 0.5
  const splitY = schema.splits?.find((s) => s.axis === 'y')?.value ?? 0.5

  return {
    JU_H: {
      x: padding.left,
      y: splitY,
      width: splitX - padding.left,
      height: 1 - splitY - padding.bottom,
    },
    JU_V: {
      x: splitX,
      y: padding.top,
      width: 1 - splitX - padding.right,
      height: 1 - padding.top - padding.bottom,
    },
  }
}

/**
 * 레이아웃 타입에 따른 기본 LayoutSchema 생성
 */
export function getDefaultSchema(layoutType: LayoutType): LayoutSchema {
  return DEFAULT_LAYOUT_SCHEMAS[layoutType]
}

/**
 * 기본 레이아웃 스키마 정의 (basePresets.json에서 로드)
 */
export const DEFAULT_LAYOUT_SCHEMAS: Record<LayoutType, LayoutSchema> =
  basePresets.schemas as Record<LayoutType, LayoutSchema>

/**
 * basePresets.json의 원본 데이터 (변경 감지용)
 */
export const BASE_PRESETS_SCHEMAS: Record<LayoutType, LayoutSchema> =
  basePresets.schemas as Record<LayoutType, LayoutSchema>

