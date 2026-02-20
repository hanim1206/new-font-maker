import type {
  DecomposedSyllable,
  JamoData,
  JamoOverride,
  LayoutType,
  OverrideCondition,
} from '../types'

// ===== 음절 컨텍스트 (조건 평가에 필요한 정보) =====
export interface SyllableContext {
  choseongChar: string | null
  jungseongChar: string | null
  jongseongChar: string | null
  layoutType: LayoutType
}

/** DecomposedSyllable → SyllableContext 변환 */
export function extractContext(syllable: DecomposedSyllable): SyllableContext {
  return {
    choseongChar: syllable.choseong?.char ?? null,
    jungseongChar: syllable.jungseong?.char ?? null,
    jongseongChar: syllable.jongseong?.char ?? null,
    layoutType: syllable.layoutType,
  }
}

/** 단일 조건 평가 */
function evaluateCondition(condition: OverrideCondition, ctx: SyllableContext): boolean {
  switch (condition.type) {
    case 'choseongIs':
      return ctx.choseongChar === condition.jamo
    case 'jungseongIs':
      return ctx.jungseongChar === condition.jamo
    case 'jongseongIs':
      return ctx.jongseongChar === condition.jamo
    case 'layoutIs':
      return ctx.layoutType === condition.layout
  }
}

/** conditionGroups 가져오기 (레거시 conditions → 단일 그룹 마이그레이션) */
function getConditionGroups(override: JamoOverride): OverrideCondition[][] {
  if (override.conditionGroups && override.conditionGroups.length > 0) {
    return override.conditionGroups
  }
  // 레거시: conditions → 단일 AND 그룹으로 변환
  if (override.conditions && override.conditions.length > 0) {
    return [override.conditions]
  }
  return []
}

/**
 * 오버라이드가 컨텍스트에 매칭되는지 확인
 * conditionGroups: 외부 = OR, 내부 = AND
 * 하나 이상의 그룹이 모든 조건을 만족하면 매칭
 */
function isOverrideMatching(override: JamoOverride, ctx: SyllableContext): boolean {
  if (!override.enabled) return false
  const groups = getConditionGroups(override)
  if (groups.length === 0) return false
  // OR: 하나의 그룹이라도 모든 조건(AND) 만족하면 true
  return groups.some(group =>
    group.length > 0 && group.every(c => evaluateCondition(c, ctx))
  )
}

/**
 * JamoData에서 컨텍스트에 맞는 최종 데이터 해석
 * 1. overrides 배열에서 enabled && conditionGroups 매칭 필터
 * 2. priority 내림차순 정렬, 첫 번째 매칭 선택
 * 3. 매칭된 variant의 필드를 base JamoData 위에 머지
 */
export function resolveJamoData(jamo: JamoData, ctx: SyllableContext): JamoData {
  if (!jamo.overrides || jamo.overrides.length === 0) return jamo

  // 매칭되는 오버라이드 필터 + priority 내림차순
  const matching = jamo.overrides
    .filter(o => isOverrideMatching(o, ctx))
    .sort((a, b) => b.priority - a.priority)

  if (matching.length === 0) return jamo

  // 최우선 매칭 variant를 base 위에 머지
  const variant = matching[0].variant
  return {
    ...jamo,
    ...(variant.strokes !== undefined && { strokes: variant.strokes }),
    ...(variant.horizontalStrokes !== undefined && { horizontalStrokes: variant.horizontalStrokes }),
    ...(variant.verticalStrokes !== undefined && { verticalStrokes: variant.verticalStrokes }),
    ...(variant.padding !== undefined && { padding: variant.padding }),
    ...(variant.horizontalPadding !== undefined && { horizontalPadding: variant.horizontalPadding }),
    ...(variant.verticalPadding !== undefined && { verticalPadding: variant.verticalPadding }),
  }
}
