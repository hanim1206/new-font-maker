import type {
  ContextGridPresetCatalogV1,
  DeepReadonly,
  JamoConstructionChannelName,
  JamoPartRole,
  JamoVariantContext,
  LayoutGridSystemSourceV1,
  RoleConstructionScope,
  ShapeSystemSourceMigrationResult,
  ShapeSystemSourceV2,
  ShapeSystemSourceV2ParseIssue,
  ShapeSystemSourceV2ParseResult,
  ValidatedContextGridPresetCatalogV1,
  ValidatedLayoutGridSystemSourceV1,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'
import {
  contextGridPresetCatalogIds,
  parseContextGridPresetCatalogV1,
} from './contextGridPresetCatalogV1'
import { validateContextCatalogAgainstRoleSources } from './contextPartGridResolver'
import { jamoContextFallbackMatches } from './jamoContextMatching'
import {
  createLayoutGridBindingId,
  parseLayoutGridSystemSourceV1,
} from './layoutGridSystemSourceV1'
import { LAYOUT_GRID_SPLIT_IDS } from './layoutGridTopology'
import {
  parseShapeSystemSourceV1,
  SHAPE_SYSTEM_ROLES,
} from './shapeSystemSourceV1'

const CHANNELS = ['main', 'horizontal', 'vertical'] as const satisfies readonly JamoConstructionChannelName[]
const compareCodePoint = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function addIssue(
  issues: ShapeSystemSourceV2ParseIssue[],
  value: ShapeSystemSourceV2ParseIssue,
): void {
  if (!issues.some((current) => current.code === value.code && current.path === value.path)) {
    issues.push(value)
  }
}

function sortedIssues(issues: ShapeSystemSourceV2ParseIssue[]): ShapeSystemSourceV2ParseIssue[] {
  return issues.sort((left, right) => compareCodePoint(
    `${left.path}\u0000${left.code}`,
    `${right.path}\u0000${right.code}`,
  ))
}

function registerGlobalId(
  owners: Map<string, string>,
  issues: ShapeSystemSourceV2ParseIssue[],
  id: string,
  path: string,
): void {
  const previous = owners.get(id)
  if (previous) {
    addIssue(issues, {
      code: 'duplicate-global-id',
      path,
      message: `안정 ID ${id}이 ${previous}와 중복됩니다.`,
    })
  } else {
    owners.set(id, path)
  }
}

function registerPointId(
  owners: Map<string, string>,
  issues: ShapeSystemSourceV2ParseIssue[],
  point: { id: string },
  path: string,
): void {
  registerGlobalId(owners, issues, point.id, `${path}.id`)
}

function registerRoleSourceIds(
  owners: Map<string, string>,
  issues: ShapeSystemSourceV2ParseIssue[],
  role: JamoPartRole,
  source: DeepReadonly<RoleConstructionScope>,
): void {
  const root = `$.roleSources.${role}`
  registerGlobalId(owners, issues, source.grid.id, `${root}.grid.id`)
  for (const [axis, rails] of [['x', source.grid.xRails], ['y', source.grid.yRails]] as const) {
    rails.forEach((rail, index) => registerGlobalId(
      owners,
      issues,
      rail.id,
      `${root}.grid.${axis}Rails[${index}].id`,
    ))
  }
  source.masters.forEach((master, masterIndex) => {
    const masterPath = `${root}.masters[${masterIndex}]`
    registerGlobalId(owners, issues, master.id, `${masterPath}.id`)
    for (const channelName of CHANNELS) {
      const channel = master.construction.channels[channelName]
      if (!channel) continue
      channel.elements.forEach((element, elementIndex) => {
        const elementPath = `${masterPath}.construction.channels.${channelName}.elements[${elementIndex}]`
        registerGlobalId(owners, issues, element.id, `${elementPath}.id`)
        if (element.kind === 'centerline') {
          element.anchors.forEach((anchor, anchorIndex) => {
            const anchorPath = `${elementPath}.anchors[${anchorIndex}]`
            registerGlobalId(owners, issues, anchor.id, `${anchorPath}.id`)
            registerPointId(owners, issues, anchor.point, `${anchorPath}.point`)
            if (anchor.handleIn) registerPointId(owners, issues, anchor.handleIn, `${anchorPath}.handleIn`)
            if (anchor.handleOut) registerPointId(owners, issues, anchor.handleOut, `${anchorPath}.handleOut`)
          })
          return
        }
        element.filledCells.forEach((cell, cellIndex) => registerGlobalId(
          owners,
          issues,
          cell.id,
          `${elementPath}.filledCells[${cellIndex}].id`,
        ))
        element.boundaryTreatments.forEach((treatment, treatmentIndex) => {
          const treatmentPath = `${elementPath}.boundaryTreatments[${treatmentIndex}]`
          registerGlobalId(owners, issues, treatment.id, `${treatmentPath}.id`)
          registerPointId(owners, issues, treatment.vertex, `${treatmentPath}.vertex`)
          registerPointId(owners, issues, treatment.from, `${treatmentPath}.from`)
          registerPointId(owners, issues, treatment.to, `${treatmentPath}.to`)
        })
      })
    }
    ;(master.contextVariants ?? []).forEach((variant, variantIndex) => {
      const variantPath = `${masterPath}.contextVariants[${variantIndex}]`
      registerGlobalId(owners, issues, variant.id, `${variantPath}.id`)
      variant.auxiliaryRails?.xRails.forEach((rail, index) => registerGlobalId(
        owners,
        issues,
        rail.id,
        `${variantPath}.auxiliaryRails.xRails[${index}].id`,
      ))
      variant.auxiliaryRails?.yRails.forEach((rail, index) => registerGlobalId(
        owners,
        issues,
        rail.id,
        `${variantPath}.auxiliaryRails.yRails[${index}].id`,
      ))
      variant.referenceOverrides?.forEach((override, index) => registerGlobalId(
        owners,
        issues,
        override.id,
        `${variantPath}.referenceOverrides[${index}].id`,
      ))
    })
  })
}

function registerLayoutIds(
  owners: Map<string, string>,
  issues: ShapeSystemSourceV2ParseIssue[],
  source: DeepReadonly<ValidatedLayoutGridSystemSourceV1>,
): void {
  registerGlobalId(owners, issues, source.grid.id, '$.layoutGridSystem.grid.id')
  source.grid.xRails.forEach((rail, index) => registerGlobalId(
    owners,
    issues,
    rail.id,
    `$.layoutGridSystem.grid.xRails[${index}].id`,
  ))
  source.grid.yRails.forEach((rail, index) => registerGlobalId(
    owners,
    issues,
    rail.id,
    `$.layoutGridSystem.grid.yRails[${index}].id`,
  ))
}

/** layout가 아직 null이어도 이후 연결될 canonical 주소와 Shape ID가 충돌하지 않게 예약한다. */
function registerReservedLayoutIds(
  owners: Map<string, string>,
  issues: ShapeSystemSourceV2ParseIssue[],
): void {
  for (const layoutType of SHARED_LAYOUT_TYPES) {
    registerGlobalId(
      owners,
      issues,
      createLayoutGridBindingId(layoutType),
      `$.layoutGridSystem.bindings.${layoutType}.id`,
    )
    LAYOUT_GRID_SPLIT_IDS[layoutType].forEach((id, index) => registerGlobalId(
      owners,
      issues,
      id,
      `$.layoutGridSystem.bindings.${layoutType}.splitRailIds[${index}]`,
    ))
  }
}

function registerCatalogIds(
  owners: Map<string, string>,
  issues: ShapeSystemSourceV2ParseIssue[],
  catalog: DeepReadonly<ValidatedContextGridPresetCatalogV1>,
): void {
  catalog.roleDefaults.forEach((entry, index) => registerGlobalId(
    owners,
    issues,
    entry.id,
    `$.contextPresetCatalog.roleDefaults[${index}].id`,
  ))
  catalog.contextPresets.forEach((entry, index) => registerGlobalId(
    owners,
    issues,
    entry.id,
    `$.contextPresetCatalog.contextPresets[${index}].id`,
  ))
}

function validatePresetLinks(
  issues: ShapeSystemSourceV2ParseIssue[],
  roleSources: DeepReadonly<Record<JamoPartRole, RoleConstructionScope>>,
  catalog: DeepReadonly<ValidatedContextGridPresetCatalogV1> | null,
): void {
  const presets = new Map(catalog?.contextPresets.map((preset) => [preset.id, preset]) ?? [])
  for (const role of SHAPE_SYSTEM_ROLES) {
    const masters = [...roleSources[role].masters].sort((left, right) => compareCodePoint(left.id, right.id))
    for (const master of masters) {
      const variants = [...(master.contextVariants ?? [])]
        .filter((variant) => variant.presetId !== undefined)
        .sort((left, right) => compareCodePoint(left.id, right.id))
      for (const variant of variants) {
        const path = `$.roleSources.${role}.masters.${master.id}.contextVariants.${variant.id}.presetId`
        const preset = presets.get(variant.presetId!)
        if (!preset) {
          addIssue(issues, {
            code: 'invalid-preset-link',
            path,
            message: `문맥 프리셋 ${variant.presetId}을 찾을 수 없습니다.`,
          })
          continue
        }
        if (preset.role !== master.role
          || !jamoContextFallbackMatches(preset.context, variant.context)) {
          addIssue(issues, {
            code: 'invalid-preset-link',
            path,
            message: `문맥 프리셋 ${preset.id}이 master role 또는 variant 문맥과 맞지 않습니다.`,
          })
        }
      }
    }
  }
}

function catalogGridIssuePath(
  roleSources: DeepReadonly<Record<JamoPartRole, RoleConstructionScope>>,
  catalog: DeepReadonly<ValidatedContextGridPresetCatalogV1>,
  value: { presetId?: string; masterId?: string; variantId?: string },
): string {
  if (value.variantId && value.masterId) {
    for (const role of SHAPE_SYSTEM_ROLES) {
      const masterIndex = roleSources[role].masters.findIndex(({ id }) => id === value.masterId)
      if (masterIndex < 0) continue
      const variantIndex = roleSources[role].masters[masterIndex].contextVariants
        ?.findIndex(({ id }) => id === value.variantId) ?? -1
      if (variantIndex >= 0) {
        return `$.roleSources.${role}.masters[${masterIndex}].contextVariants[${variantIndex}]`
      }
    }
  }
  if (value.presetId) {
    const roleDefaultIndex = catalog.roleDefaults.findIndex(({ id }) => id === value.presetId)
    if (roleDefaultIndex >= 0) return `$.contextPresetCatalog.roleDefaults[${roleDefaultIndex}]`
    const contextPresetIndex = catalog.contextPresets.findIndex(({ id }) => id === value.presetId)
    if (contextPresetIndex >= 0) return `$.contextPresetCatalog.contextPresets[${contextPresetIndex}]`
  }
  return '$.contextPresetCatalog'
}

export function createShapeSystemSourceV2(input: {
  roleSources: Record<JamoPartRole, RoleConstructionScope>
  layoutGridSystem?: LayoutGridSystemSourceV1 | null
  contextPresetCatalog?: ContextGridPresetCatalogV1 | null
}): ShapeSystemSourceV2 {
  return {
    schema: 'shape-system',
    version: 2,
    roleSources: structuredClone(input.roleSources),
    layoutGridSystem: input.layoutGridSystem ? structuredClone(input.layoutGridSystem) : null,
    contextPresetCatalog: input.contextPresetCatalog ? structuredClone(input.contextPresetCatalog) : null,
  }
}

export function parseShapeSystemSourceV2(value: unknown): ShapeSystemSourceV2ParseResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'Shape System v2 root는 객체여야 합니다.' }] }
  }
  if (!hasOwn(value, 'schema') || !hasOwn(value, 'version')) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'Shape System v2 schema/version은 own property여야 합니다.' }] }
  }
  if (value.schema !== 'shape-system') {
    return { ok: false, issues: [{ code: 'unsupported-schema', path: '$.schema', message: '지원하지 않는 Shape System schema입니다.' }] }
  }
  if (value.version !== 2) {
    return { ok: false, issues: [{ code: 'unsupported-version', path: '$.version', message: '지원하지 않는 Shape System version입니다.' }] }
  }

  const issues: ShapeSystemSourceV2ParseIssue[] = []
  const expectedKeys = ['schema', 'version', 'roleSources', 'layoutGridSystem', 'contextPresetCatalog']
  const actualKeys = Object.keys(value).sort(compareCodePoint)
  if (actualKeys.length !== expectedKeys.length
    || [...expectedKeys].sort(compareCodePoint).some((key, index) => key !== actualKeys[index] || !hasOwn(value, key))) {
    addIssue(issues, { code: 'unknown-field', path: '$', message: 'Shape System v2 root 필드가 exact 계약과 다릅니다.' })
  }

  let catalog: ValidatedContextGridPresetCatalogV1 | null = null
  if (hasOwn(value, 'contextPresetCatalog')) {
    if (value.contextPresetCatalog !== null) {
      const parsedCatalog = parseContextGridPresetCatalogV1(value.contextPresetCatalog)
      if (!parsedCatalog.ok) {
        for (const child of parsedCatalog.issues) addIssue(issues, {
          code: 'invalid-context-preset-catalog',
          path: `$.contextPresetCatalog${child.path === '$' ? '' : child.path.slice(1)}`,
          message: `문맥 프리셋 catalog가 유효하지 않습니다: ${child.code}`,
        })
      } else catalog = parsedCatalog.catalog
    }
  } else addIssue(issues, { code: 'invalid-root', path: '$.contextPresetCatalog', message: 'contextPresetCatalog가 필요합니다.' })

  const knownPresetIds = catalog ? contextGridPresetCatalogIds(catalog) : new Set<string>()
  let roleSources: Record<JamoPartRole, RoleConstructionScope> | null = null
  if (hasOwn(value, 'roleSources')) {
    const parsedRoles = parseShapeSystemSourceV1({
      schema: 'shape-system',
      version: 1,
      roleSources: value.roleSources,
    }, { knownPresetIds })
    if (!parsedRoles.ok) {
      for (const child of parsedRoles.issues) addIssue(issues, {
        code: child.code,
        path: child.path,
        message: child.message,
      })
    } else roleSources = structuredClone(parsedRoles.source.roleSources) as Record<JamoPartRole, RoleConstructionScope>
  } else addIssue(issues, { code: 'invalid-role-sources', path: '$.roleSources', message: 'roleSources가 필요합니다.' })

  let layoutGridSystem: ValidatedLayoutGridSystemSourceV1 | null = null
  if (hasOwn(value, 'layoutGridSystem')) {
    if (value.layoutGridSystem !== null) {
      const parsedLayout = parseLayoutGridSystemSourceV1(value.layoutGridSystem)
      if (!parsedLayout.ok) {
        for (const child of parsedLayout.issues) addIssue(issues, {
          code: 'invalid-layout-grid-system',
          path: `$.layoutGridSystem${child.path === '$' ? '' : child.path.slice(1)}`,
          message: `layout grid system이 유효하지 않습니다: ${child.code}`,
        })
      } else layoutGridSystem = parsedLayout.source
    }
  } else addIssue(issues, { code: 'invalid-root', path: '$.layoutGridSystem', message: 'layoutGridSystem이 필요합니다.' })

  if (roleSources) validatePresetLinks(issues, roleSources, catalog)
  if (roleSources && catalog) {
    const catalogGridIssues = validateContextCatalogAgainstRoleSources({ roleSources, catalog })
    for (const child of catalogGridIssues) addIssue(issues, {
      code: 'invalid-catalog-grid-link',
      path: catalogGridIssuePath(roleSources, catalog, child),
      message: `문맥 catalog와 역할 grid 합성이 유효하지 않습니다: ${child.code}${child.causeCodes?.length ? ` (${child.causeCodes.join(', ')})` : ''}`,
    })
  }
  if (roleSources) {
    const owners = new Map<string, string>()
    registerReservedLayoutIds(owners, issues)
    if (layoutGridSystem) registerLayoutIds(owners, issues, layoutGridSystem)
    if (catalog) registerCatalogIds(owners, issues, catalog)
    for (const role of SHAPE_SYSTEM_ROLES) registerRoleSourceIds(owners, issues, role, roleSources[role])
  }

  if (issues.length > 0 || !roleSources) return { ok: false, issues: sortedIssues(issues) }
  const source: ShapeSystemSourceV2 = {
    schema: 'shape-system',
    version: 2,
    roleSources,
    layoutGridSystem: layoutGridSystem
      ? structuredClone(layoutGridSystem) as unknown as LayoutGridSystemSourceV1
      : null,
    contextPresetCatalog: catalog
      ? structuredClone(catalog) as unknown as ContextGridPresetCatalogV1
      : null,
  }
  return { ok: true, source: source as unknown as ValidatedShapeSystemSourceV2 }
}

/** Shape v1을 추측 없이 v2의 명시적 unbound(null/null) 상태로 올리는 유일 경계다. */
export function parseAndMigrateShapeSystemSource(value: unknown): ShapeSystemSourceMigrationResult {
  if (!isRecord(value) || !hasOwn(value, 'version')) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'Shape System source version이 없습니다.' }] }
  }
  if (value.version === 2) return parseShapeSystemSourceV2(value)
  if (value.version !== 1) {
    return { ok: false, issues: [{ code: 'unsupported-version', path: '$.version', message: `지원하지 않는 Shape System version입니다: ${String(value.version)}` }] }
  }
  const parsedV1 = parseShapeSystemSourceV1(value)
  if (!parsedV1.ok) return { ok: false, issues: parsedV1.issues }
  let migrated: ShapeSystemSourceV2
  try {
    migrated = {
      schema: 'shape-system',
      version: 2,
      roleSources: structuredClone(parsedV1.source.roleSources) as Record<JamoPartRole, RoleConstructionScope>,
      layoutGridSystem: null,
      contextPresetCatalog: null,
    }
  } catch {
    return { ok: false, issues: [{ code: 'clone-failed', path: '$', message: 'Shape System source를 안전하게 복제할 수 없습니다.' }] }
  }
  const parsedV2 = parseShapeSystemSourceV2(migrated)
  return parsedV2.ok ? { ...parsedV2, migratedFrom: 1 } : parsedV2
}

export function presetContextMatchesVariant(
  preset: DeepReadonly<JamoVariantContext>,
  variant: DeepReadonly<JamoVariantContext>,
): boolean {
  return jamoContextFallbackMatches(preset, variant)
}
