import type { JamoLayoutContext, JamoPartRole, Part } from '../types'

export const JAMO_PART_ROLES = [
  'STANDALONE',
  'CH',
  'JU_VERTICAL',
  'JU_HORIZONTAL',
  'JU_H',
  'JU_V',
  'JO',
] as const satisfies readonly JamoPartRole[]

const CONTEXTS_BY_ROLE: Readonly<Record<JamoPartRole, ReadonlySet<JamoLayoutContext>>> = {
  STANDALONE: new Set(['choseong-only']),
  CH: new Set([
    'vertical',
    'horizontal',
    'mixed',
    'vertical-with-jongseong',
    'horizontal-with-jongseong',
    'mixed-with-jongseong',
  ]),
  JU_VERTICAL: new Set(['vertical', 'vertical-with-jongseong']),
  JU_HORIZONTAL: new Set(['horizontal', 'horizontal-with-jongseong']),
  JU_H: new Set(['mixed', 'mixed-with-jongseong']),
  JU_V: new Set(['mixed', 'mixed-with-jongseong']),
  JO: new Set([
    'vertical-with-jongseong',
    'horizontal-with-jongseong',
    'mixed-with-jongseong',
  ]),
}

const PART_BY_ROLE: Readonly<Record<JamoPartRole, Part>> = {
  STANDALONE: 'CH',
  CH: 'CH',
  JU_VERTICAL: 'JU',
  JU_HORIZONTAL: 'JU',
  JU_H: 'JU_H',
  JU_V: 'JU_V',
  JO: 'JO',
}

export function isJamoPartRole(value: unknown): value is JamoPartRole {
  return typeof value === 'string' && (JAMO_PART_ROLES as readonly string[]).includes(value)
}

export function isContextAllowedForRole(
  role: JamoPartRole,
  context: JamoLayoutContext,
): boolean {
  return CONTEXTS_BY_ROLE[role].has(context)
}

export function partForJamoRole(role: JamoPartRole): Part {
  return PART_BY_ROLE[role]
}
