import type { DeepReadonly, JamoVariantContext } from '../types'

/**
 * candidate가 requested 문맥에 적용 가능한 deterministic fallback인지 판정한다.
 * candidate가 선언한 선택 태그는 requested와 모두 일치해야 한다.
 */
export function jamoContextFallbackMatches(
  candidate: DeepReadonly<JamoVariantContext>,
  requested: DeepReadonly<JamoVariantContext>,
): boolean {
  return candidate.baseContext === requested.baseContext
    && (candidate.medialClass === undefined || candidate.medialClass === requested.medialClass)
    && (candidate.finalWidthClass === undefined || candidate.finalWidthClass === requested.finalWidthClass)
    && (candidate.initialClass === undefined || candidate.initialClass === requested.initialClass)
}

/** 태그 수 우선, 동률은 medialClass → finalWidthClass → initialClass 순서다. */
export function jamoContextFallbackPriority(
  context: DeepReadonly<JamoVariantContext>,
): number {
  const tagCount = Number(context.medialClass !== undefined)
    + Number(context.finalWidthClass !== undefined)
    + Number(context.initialClass !== undefined)
  const tagMask = Number(context.medialClass !== undefined) * 4
    + Number(context.finalWidthClass !== undefined) * 2
    + Number(context.initialClass !== undefined)
  return tagCount * 8 + tagMask
}
