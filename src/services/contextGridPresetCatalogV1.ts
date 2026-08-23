import type {
  ContextGridPresetCatalogIssue,
  ContextGridPresetCatalogParseResult,
  ContextGridPresetCatalogV1,
  ContextGridPresetV1,
  DeepReadonly,
  JamoPartRole,
  JamoVariantContext,
  RoleGridDefaultV1,
  ValidatedContextGridPresetCatalogV1,
} from '../types'
import { isContextAllowedForRole, JAMO_PART_ROLES } from './jamoContextRoles'
import {
  canonicalVariantContextKey,
  isValidJamoVariantContext,
  isValidRailPosition,
} from './jamoContextVariants'
import { CORE_X_RAIL_ROLES, CORE_Y_RAIL_ROLES } from './railGridResolver'

const CORE_ROLES = new Set<string>([...CORE_X_RAIL_ROLES, ...CORE_Y_RAIL_ROLES])
const ROLE_SET = new Set<string>(JAMO_PART_ROLES)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

const compareCodePoint = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

const stableIssues = (issues: ContextGridPresetCatalogIssue[]): ContextGridPresetCatalogIssue[] =>
  issues.sort((left, right) => compareCodePoint(`${left.path}|${left.code}`, `${right.path}|${right.code}`))

const encode = (value: string): string => encodeURIComponent(value)

export function createRoleGridDefaultId(role: JamoPartRole): string {
  return `role-grid-default:${encode(role)}`
}

export function createContextGridPresetId(
  role: JamoPartRole,
  context: DeepReadonly<JamoVariantContext>,
): string {
  return `context-grid-preset:${encode(role)}:${canonicalVariantContextKey(context)}`
}

function validateCorePositions(
  value: unknown,
  path: string,
  issues: ContextGridPresetCatalogIssue[],
): value is RoleGridDefaultV1['coreRailPositions'] {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid-core-position', path, message: 'coreRailPositions는 객체여야 합니다.' })
    return false
  }
  const roles = Object.keys(value).sort(compareCodePoint)
  if (roles.length === 0) {
    issues.push({ code: 'empty-patch', path, message: '빈 코어 Rail patch는 저장하지 않습니다.' })
    return false
  }
  let valid = true
  for (const role of roles) {
    const position = value[role]
    const structurallyValid = CORE_ROLES.has(role) && isValidRailPosition(position)
    const semanticallyValid = structurallyValid && position.kind === 'absolute'
      ? position.value >= 0 && position.value <= 1
      : structurallyValid && position.kind === 'between'
        ? position.fromRailId.trim() !== ''
          && position.toRailId.trim() !== ''
          && position.fromRailId !== position.toRailId
          && position.ratio > 0
          && position.ratio < 1
        : false
    if (!semanticallyValid) {
      valid = false
      issues.push({
        code: 'invalid-core-position',
        path: `${path}.${role}`,
        message: `코어 Rail role ${role}의 위치가 유효하지 않습니다.`,
      })
    }
  }
  return valid
}

function inspectRoleDefault(
  value: unknown,
  index: number,
  issues: ContextGridPresetCatalogIssue[],
): RoleGridDefaultV1 | null {
  const path = `$.roleDefaults[${index}]`
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'role', 'coreRailPositions'])) {
    issues.push({ code: 'unknown-field', path, message: '역할 기본값 필드가 v1 계약과 다릅니다.' })
    return null
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    issues.push({ code: 'invalid-id', path: `${path}.id`, message: '역할 기본값 ID가 유효하지 않습니다.' })
  }
  if (typeof value.role !== 'string' || !ROLE_SET.has(value.role)) {
    issues.push({ code: 'invalid-role', path: `${path}.role`, message: '역할 기본값 role이 유효하지 않습니다.' })
    return null
  }
  const role = value.role as JamoPartRole
  const expectedId = createRoleGridDefaultId(role)
  if (value.id !== expectedId) {
    issues.push({ code: 'non-canonical-id', path: `${path}.id`, message: `역할 기본값 ID는 ${expectedId}여야 합니다.` })
  }
  if (!validateCorePositions(value.coreRailPositions, `${path}.coreRailPositions`, issues)) return null
  return value as unknown as RoleGridDefaultV1
}

function inspectContextPreset(
  value: unknown,
  index: number,
  issues: ContextGridPresetCatalogIssue[],
): ContextGridPresetV1 | null {
  const path = `$.contextPresets[${index}]`
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'role', 'context', 'coreRailPositions'])) {
    issues.push({ code: 'unknown-field', path, message: '문맥 프리셋 필드가 v1 계약과 다릅니다.' })
    return null
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    issues.push({ code: 'invalid-id', path: `${path}.id`, message: '문맥 프리셋 ID가 유효하지 않습니다.' })
  }
  if (typeof value.role !== 'string' || !ROLE_SET.has(value.role)) {
    issues.push({ code: 'invalid-role', path: `${path}.role`, message: '문맥 프리셋 role이 유효하지 않습니다.' })
    return null
  }
  if (!isValidJamoVariantContext(value.context)) {
    issues.push({ code: 'invalid-context', path: `${path}.context`, message: '문맥 프리셋 context가 유효하지 않습니다.' })
    return null
  }
  const role = value.role as JamoPartRole
  const context = value.context
  if (!isContextAllowedForRole(role, context.baseContext)) {
    issues.push({
      code: 'invalid-role-context',
      path: `${path}.context.baseContext`,
      message: `role ${role}에서는 ${context.baseContext} 문맥을 사용할 수 없습니다.`,
    })
    return null
  }
  const expectedId = createContextGridPresetId(role, context)
  if (value.id !== expectedId) {
    issues.push({ code: 'non-canonical-id', path: `${path}.id`, message: `문맥 프리셋 ID는 ${expectedId}여야 합니다.` })
  }
  if (!validateCorePositions(value.coreRailPositions, `${path}.coreRailPositions`, issues)) return null
  return value as unknown as ContextGridPresetV1
}

export function parseContextGridPresetCatalogV1(value: unknown): ContextGridPresetCatalogParseResult {
  const issues: ContextGridPresetCatalogIssue[] = []
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: '문맥 프리셋 catalog는 객체여야 합니다.' }] }
  }
  if (!hasOwn(value, 'schema') || value.schema !== 'context-grid-preset-catalog') {
    issues.push({ code: 'unsupported-schema', path: '$.schema', message: '지원하지 않는 catalog schema입니다.' })
  }
  if (!hasOwn(value, 'version') || value.version !== 1) {
    issues.push({ code: 'unsupported-version', path: '$.version', message: '지원하지 않는 catalog version입니다.' })
  }
  if (!hasExactKeys(value, ['schema', 'version', 'roleDefaults', 'contextPresets'])) {
    issues.push({ code: 'unknown-field', path: '$', message: 'catalog root 필드가 v1 계약과 다릅니다.' })
  }
  if (!Array.isArray(value.roleDefaults)) {
    issues.push({ code: 'invalid-root', path: '$.roleDefaults', message: 'roleDefaults는 배열이어야 합니다.' })
  }
  if (!Array.isArray(value.contextPresets)) {
    issues.push({ code: 'invalid-root', path: '$.contextPresets', message: 'contextPresets는 배열이어야 합니다.' })
  }
  if (issues.length > 0 || !Array.isArray(value.roleDefaults) || !Array.isArray(value.contextPresets)) {
    return { ok: false, issues: stableIssues(issues) }
  }

  const roleDefaults: RoleGridDefaultV1[] = []
  for (let index = 0; index < value.roleDefaults.length; index += 1) {
    if (!hasOwn(value.roleDefaults, index)) {
      issues.push({
        code: 'invalid-root',
        path: `$.roleDefaults[${index}]`,
        message: 'roleDefaults sparse slot은 저장할 수 없습니다.',
      })
      continue
    }
    const parsed = inspectRoleDefault(value.roleDefaults[index], index, issues)
    if (parsed) roleDefaults.push(parsed)
  }
  const contextPresets: ContextGridPresetV1[] = []
  for (let index = 0; index < value.contextPresets.length; index += 1) {
    if (!hasOwn(value.contextPresets, index)) {
      issues.push({
        code: 'invalid-root',
        path: `$.contextPresets[${index}]`,
        message: 'contextPresets sparse slot은 저장할 수 없습니다.',
      })
      continue
    }
    const parsed = inspectContextPreset(value.contextPresets[index], index, issues)
    if (parsed) contextPresets.push(parsed)
  }
  const ids = new Set<string>()
  for (const [path, id] of [
    ...roleDefaults.map((entry, index) => [`$.roleDefaults[${index}].id`, entry.id] as const),
    ...contextPresets.map((entry, index) => [`$.contextPresets[${index}].id`, entry.id] as const),
  ]) {
    if (ids.has(id)) issues.push({ code: 'duplicate-id', path, message: `catalog ID ${id}가 중복됩니다.` })
    ids.add(id)
  }
  const roles = new Set<JamoPartRole>()
  for (const [index, entry] of roleDefaults.entries()) {
    if (roles.has(entry.role)) {
      issues.push({ code: 'duplicate-role-default', path: `$.roleDefaults[${index}].role`, message: `role ${entry.role} 기본값이 중복됩니다.` })
    }
    roles.add(entry.role)
  }
  const contexts = new Set<string>()
  for (const [index, entry] of contextPresets.entries()) {
    const key = `${entry.role}|${canonicalVariantContextKey(entry.context)}`
    if (contexts.has(key)) {
      issues.push({ code: 'duplicate-context-preset', path: `$.contextPresets[${index}].context`, message: '같은 role/context 프리셋이 중복됩니다.' })
    }
    contexts.add(key)
  }
  if (issues.length > 0) return { ok: false, issues: stableIssues(issues) }

  let cloned: ContextGridPresetCatalogV1
  try {
    cloned = structuredClone(value) as unknown as ContextGridPresetCatalogV1
  } catch {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'catalog를 안전하게 복제할 수 없습니다.' }] }
  }
  return { ok: true, catalog: cloned as unknown as ValidatedContextGridPresetCatalogV1 }
}

export function contextGridPresetCatalogIds(
  catalog: DeepReadonly<ValidatedContextGridPresetCatalogV1>,
): ReadonlySet<string> {
  return new Set(catalog.contextPresets.map(({ id }) => id))
}
