import type {
  DeepReadonly,
  JamoPartRole,
  RoleConstructionScope,
  ShapeSystemSourceV1,
  ShapeSystemSourceV1ParseIssue,
  ShapeSystemSourceV1ParseResult,
  ValidatedShapeSystemSourceV1,
} from '../types'
import { JAMO_PART_ROLES } from './jamoContextRoles'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'

export const SHAPE_SYSTEM_ROLES = JAMO_PART_ROLES

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function issue(
  issues: ShapeSystemSourceV1ParseIssue[],
  value: ShapeSystemSourceV1ParseIssue,
): void {
  if (!issues.some((current) => current.code === value.code && current.path === value.path)) {
    issues.push(value)
  }
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ShapeSystemSourceV1ParseIssue[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (allowed.includes(key)) continue
    issue(issues, {
      code: 'unknown-field',
      path: `${path}.${key}`,
      message: `Shape System v1에 정의되지 않은 필드입니다: ${path}.${key}`,
    })
  }
}

export function createShapeSystemSourceV1(
  roleSources: Record<JamoPartRole, RoleConstructionScope>,
): ShapeSystemSourceV1 {
  return {
    schema: 'shape-system',
    version: 1,
    roleSources: Object.fromEntries(SHAPE_SYSTEM_ROLES.map((role) => [
      role,
      structuredClone(roleSources[role]),
    ])) as Record<JamoPartRole, RoleConstructionScope>,
  }
}

export function parseShapeSystemSourceV1(
  value: unknown,
  options: { knownPresetIds?: ReadonlySet<string> } = {},
): ShapeSystemSourceV1ParseResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ code: 'invalid-root', path: '$', message: 'Shape System source root는 객체여야 합니다.' }],
    }
  }
  if (!hasOwn(value, 'schema') || !hasOwn(value, 'version') || !hasOwn(value, 'roleSources')) {
    return {
      ok: false,
      issues: [{
        code: 'invalid-root', path: '$',
        message: 'Shape System root의 schema, version, roleSources는 own property여야 합니다.',
      }],
    }
  }
  if (value.schema !== 'shape-system') {
    return {
      ok: false,
      issues: [{
        code: 'unsupported-schema', path: '$.schema',
        message: `지원하지 않는 Shape System schema입니다: ${String(value.schema)}`,
      }],
    }
  }
  if (value.version !== 1) {
    return {
      ok: false,
      issues: [{
        code: 'unsupported-version', path: '$.version',
        message: `지원하지 않는 Shape System version입니다: ${String(value.version)}`,
      }],
    }
  }

  const issues: ShapeSystemSourceV1ParseIssue[] = []
  const parsedRoleSources = new Map<JamoPartRole, RoleConstructionScope>()
  unknownKeys(value, ['schema', 'version', 'roleSources'], '$', issues)
  if (!isRecord(value.roleSources)) {
    issue(issues, {
      code: 'invalid-role-sources', path: '$.roleSources',
      message: 'roleSources는 7개 역할 source 객체여야 합니다.',
    })
  } else {
    unknownKeys(value.roleSources, SHAPE_SYSTEM_ROLES, '$.roleSources', issues)
    for (const role of SHAPE_SYSTEM_ROLES) {
      const path = `$.roleSources.${role}`
      if (!hasOwn(value.roleSources, role)) {
        issue(issues, {
          code: 'missing-role-source', path,
          message: `${role} 역할 source가 필요합니다.`,
        })
        continue
      }
      const rawSource = value.roleSources[role]
      if (isRecord(rawSource) && isRecord(rawSource.grid)
        && rawSource.grid.role !== role) issue(issues, {
        code: 'role-mismatch', path: `${path}.grid.role`,
        message: `roleSources.${role}의 grid role은 ${role}이어야 합니다.`,
      })
      const parsed = parseRoleConstructionSourceV1(value.roleSources[role], options)
      if (!parsed.ok) {
        issue(issues, {
          code: 'invalid-role-source', path,
          message: `${role} 역할 source가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`,
        })
        continue
      }
      parsedRoleSources.set(role, structuredClone(parsed.source) as unknown as RoleConstructionScope)
      if (parsed.source.masters.some((master) => master.role !== role)) issue(issues, {
        code: 'role-mismatch', path: `${path}.masters`,
        message: `roleSources.${role}에는 같은 역할 master만 저장할 수 있습니다.`,
      })
    }
  }

  if (isRecord(value.roleSources)) {
    const gridOwners = new Map<string, string>()
    const railOwners = new Map<string, string>()
    const masterOwners = new Map<string, string>()
    for (const role of SHAPE_SYSTEM_ROLES) {
      const parsedSource = parsedRoleSources.get(role)
      if (!parsedSource) continue
      const gridPath = `$.roleSources.${role}.grid`
      const previousGrid = gridOwners.get(parsedSource.grid.id)
      if (previousGrid) issue(issues, {
        code: 'duplicate-grid-id', path: `${gridPath}.id`,
        message: `grid ID ${parsedSource.grid.id}이 ${previousGrid}와 중복됩니다.`,
      })
      else gridOwners.set(parsedSource.grid.id, gridPath)
      for (const rail of [...parsedSource.grid.xRails, ...parsedSource.grid.yRails]) {
        const previousRail = railOwners.get(rail.id)
        if (previousRail) issue(issues, {
          code: 'duplicate-rail-id', path: `${gridPath}.${rail.id}`,
          message: `Rail ID ${rail.id}이 ${previousRail}와 중복됩니다.`,
        })
        else railOwners.set(rail.id, `${gridPath}.${rail.id}`)
      }
      for (const master of parsedSource.masters) {
        const masterPath = `$.roleSources.${role}.masters.${master.id}`
        const previousMaster = masterOwners.get(master.id)
        if (previousMaster) issue(issues, {
          code: 'duplicate-master-id', path: masterPath,
          message: `master ID ${master.id}이 ${previousMaster}와 중복됩니다.`,
        })
        else masterOwners.set(master.id, masterPath)
      }
    }
  }

  issues.sort((first, second) => `${first.path}\u0000${first.code}`.localeCompare(`${second.path}\u0000${second.code}`))
  if (issues.length > 0) return { ok: false, issues }
  const canonical: ShapeSystemSourceV1 = {
    schema: 'shape-system',
    version: 1,
    roleSources: Object.fromEntries(SHAPE_SYSTEM_ROLES.map((role) => [
      role,
      parsedRoleSources.get(role)!,
    ])) as Record<JamoPartRole, RoleConstructionScope>,
  }
  return { ok: true, source: canonical as DeepReadonly<ShapeSystemSourceV1> as ValidatedShapeSystemSourceV1 }
}
