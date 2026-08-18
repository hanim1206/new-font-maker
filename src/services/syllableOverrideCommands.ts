import type { JamoData, JamoOverride, JamoTransform, MobileEditorPart, OverrideCondition } from '../types'
import { decomposeSyllable } from '../utils/hangulUtils'
import { extractContext, resolveJamoData } from '../utils/overrideResolver'

export const DEFAULT_JAMO_TRANSFORM: JamoTransform = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
}

export function applyRelativeJamoScale(
  start: JamoTransform,
  relative: { x: number; y: number },
  step = 0.01,
): JamoTransform {
  const round = (value: number) => Math.round(value / step) * step
  return {
    ...start,
    scaleX: Math.max(0.2, round(start.scaleX * relative.x)),
    scaleY: Math.max(0.2, round(start.scaleY * relative.y)),
  }
}

export function resetJamoTransformPosition(transform: JamoTransform): JamoTransform {
  return { ...transform, translateX: 0, translateY: 0 }
}

export function resetJamoTransformScale(transform: JamoTransform): JamoTransform {
  return { ...transform, scaleX: 1, scaleY: 1 }
}

export function isDefaultJamoTransform(transform: JamoTransform): boolean {
  return transform.translateX === 0
    && transform.translateY === 0
    && transform.scaleX === 1
    && transform.scaleY === 1
}

export function getSyllableOverrideId(syllable: string, part: MobileEditorPart): string {
  return `syllable:${syllable}:${part}`
}

export function getSyllableTransform(jamo: JamoData, syllable: string, part: MobileEditorPart): JamoTransform {
  return {
    ...DEFAULT_JAMO_TRANSFORM,
    ...jamo.overrides?.find((override) => override.id === getSyllableOverrideId(syllable, part))?.variant.transform,
  }
}

export function setSyllableTransform(
  jamo: JamoData,
  syllable: string,
  part: MobileEditorPart,
  transform: JamoTransform,
  maps: {
    choseong: Record<string, JamoData>
    jungseong: Record<string, JamoData>
    jongseong: Record<string, JamoData>
  },
): JamoData {
  const decomposed = decomposeSyllable(syllable, maps.choseong, maps.jungseong, maps.jongseong)
  const conditions: OverrideCondition[] = [{ type: 'layoutIs', layout: decomposed.layoutType }]
  if (decomposed.choseong) conditions.push({ type: 'choseongIs', jamo: decomposed.choseong.char })
  if (decomposed.jungseong) conditions.push({ type: 'jungseongIs', jamo: decomposed.jungseong.char })
  if (decomposed.jongseong) conditions.push({ type: 'jongseongIs', jamo: decomposed.jongseong.char })

  const id = getSyllableOverrideId(syllable, part)
  const override: JamoOverride = {
    id,
    conditionGroups: [conditions],
    variant: { transform },
    priority: 1000,
    enabled: true,
  }
  const overrides = [...(jamo.overrides ?? [])]
  const index = overrides.findIndex((item) => item.id === id)
  if (index >= 0) overrides[index] = override
  else overrides.push(override)
  return { ...jamo, overrides }
}

export function resetSyllableTransform(jamo: JamoData, syllable: string, part: MobileEditorPart): JamoData {
  const id = getSyllableOverrideId(syllable, part)
  const overrides = (jamo.overrides ?? []).filter((override) => override.id !== id)
  return { ...jamo, ...(overrides.length > 0 ? { overrides } : { overrides: undefined }) }
}

export function previewJamoTransform(jamo: JamoData, transform: JamoTransform): JamoData {
  const previewOverride: JamoOverride = {
    id: 'preview-transform',
    conditionGroups: [[{ type: 'layoutIs', layout: 'choseong-only' }]],
    variant: { transform },
    priority: 1,
    enabled: true,
  }
  return resolveJamoData({ ...jamo, overrides: [previewOverride] }, {
    ...extractContext({ char: jamo.char, choseong: null, jungseong: null, jongseong: null, layoutType: 'choseong-only' }),
  })
}
