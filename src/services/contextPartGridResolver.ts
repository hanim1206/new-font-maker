import type {
  ContextGridPresetV1,
  ContextPartGridIssue,
  ContextPartGridResolutionResult,
  DeepReadonly,
  GridProvenance,
  GridValueProvenance,
  JamoPartRole,
  JamoRoleMaster,
  JamoVariantContext,
  RailGrid,
  RailPosition,
  RoleConstructionScope,
  RoleGridDefaultV1,
  ValidatedContextGridPresetCatalogV1,
} from '../types'
import {
  contextGridPresetCatalogIds,
  parseContextGridPresetCatalogV1,
} from './contextGridPresetCatalogV1'
import {
  isContextAllowedForRole,
  JAMO_PART_ROLES,
} from './jamoContextRoles'
import {
  canonicalVariantContextKey,
  collectConstructionReferenceRails,
  isValidJamoVariantContext,
  resolveExactJamoContextVariant,
  validateJamoContextVariants,
} from './jamoContextVariants'
import { validateRoleConstructionScope } from './jamoConstruction'
import {
  jamoContextFallbackMatches,
  jamoContextFallbackPriority,
} from './jamoContextMatching'

const compareCodePoint = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

function selectBest<T extends { id: string; context: JamoVariantContext }>(
  candidates: readonly DeepReadonly<T>[],
  requested: DeepReadonly<JamoVariantContext>,
): { selected?: DeepReadonly<T>; ambiguous: boolean } {
  const matches = candidates
    .filter((candidate) => jamoContextFallbackMatches(candidate.context, requested))
    .map((candidate) => ({ candidate, priority: jamoContextFallbackPriority(candidate.context) }))
    .sort((left, right) => right.priority - left.priority
      || compareCodePoint(canonicalVariantContextKey(left.candidate.context), canonicalVariantContextKey(right.candidate.context)))
  if (matches.length === 0) return { ambiguous: false }
  return {
    selected: matches[0].candidate,
    ambiguous: matches.length > 1 && matches[0].priority === matches[1].priority
      && canonicalVariantContextKey(matches[0].candidate.context) === canonicalVariantContextKey(matches[1].candidate.context),
  }
}

function positionKey(position: DeepReadonly<RailPosition>): string {
  return position.kind === 'absolute'
    ? `absolute:${position.value}`
    : `between:${position.fromRailId}:${position.toRailId}:${position.ratio}`
}

function issue(
  code: ContextPartGridIssue['code'],
  message: string,
  details: Omit<ContextPartGridIssue, 'code' | 'message'> = {},
): ContextPartGridResolutionResult {
  return { ok: false, issues: [{ code, message, ...details }] }
}

function applyCoreLayer(
  source: RoleConstructionScope,
  patch: DeepReadonly<RoleGridDefaultV1['coreRailPositions']>,
  provenance: Record<string, GridValueProvenance>,
  valueSource: 'role-default' | 'context-preset',
  presetId: string,
): ContextPartGridIssue[] {
  for (const [coreRole, nextPosition] of Object.entries(patch).sort(([left], [right]) => compareCodePoint(left, right))) {
    const rail = [...source.grid.xRails, ...source.grid.yRails]
      .find((candidate) => candidate.kind === 'core' && candidate.coreRole === coreRole)
    if (!rail || !nextPosition) {
      return [{ code: 'invalid-derived-grid', message: `코어 Rail role ${coreRole}을 찾을 수 없습니다.`, presetId }]
    }
    if (positionKey(rail.position) !== positionKey(nextPosition)) {
      rail.position = structuredClone(nextPosition) as RailPosition
    }
    provenance[rail.id] = { source: valueSource, presetId }
  }
  const validation = validateRoleConstructionScope(source)
  return validation.ok ? [] : [{
    code: 'invalid-derived-grid',
    message: `${valueSource} 적용 결과가 유효하지 않습니다.`,
    presetId,
    causeCodes: validation.issues.map(({ code }) => code),
  }]
}

function findRoleDefault(
  defaults: readonly DeepReadonly<RoleGridDefaultV1>[],
  role: JamoPartRole,
): DeepReadonly<RoleGridDefaultV1> | undefined {
  return defaults.find((candidate) => candidate.role === role)
}

function stripVariants(master: JamoRoleMaster): JamoRoleMaster {
  const result = structuredClone(master)
  delete result.contextVariants
  return result
}

function validatePresetLinks(
  source: DeepReadonly<RoleConstructionScope>,
  contextPresets: readonly DeepReadonly<ContextGridPresetV1>[],
): ContextPartGridResolutionResult | null {
  const masters = [...source.masters].sort((left, right) => compareCodePoint(left.id, right.id))
  for (const master of masters) {
    const variants = [...(master.contextVariants ?? [])]
      .filter((variant) => variant.presetId !== undefined)
      .sort((left, right) => compareCodePoint(left.id, right.id))
    for (const variant of variants) {
      const preset = contextPresets.find(({ id }) => id === variant.presetId)
      if (!preset) {
        return issue('unknown-preset', `preset ${variant.presetId}을 찾을 수 없습니다.`, {
          presetId: variant.presetId,
          variantId: variant.id,
          masterId: master.id,
        })
      }
      if (preset.role !== master.role) {
        return issue('preset-role-mismatch', '명시 preset의 role이 master role과 다릅니다.', {
          presetId: preset.id,
          variantId: variant.id,
          masterId: master.id,
        })
      }
      if (!jamoContextFallbackMatches(preset.context, variant.context)) {
        return issue('preset-context-mismatch', '명시 preset이 자소 variant 문맥 범위에 없습니다.', {
          presetId: preset.id,
          variantId: variant.id,
          masterId: master.id,
        })
      }
    }
  }
  return null
}

export function resolveContextualPartGrid(input: {
  source: DeepReadonly<RoleConstructionScope>
  catalog: unknown
  masterId: string
  requestedContext: DeepReadonly<JamoVariantContext>
}): ContextPartGridResolutionResult {
  const parsedCatalog = parseContextGridPresetCatalogV1(input?.catalog)
  if (!parsedCatalog.ok) {
    return issue('invalid-catalog', '문맥 프리셋 catalog가 유효하지 않습니다.', {
      causeCodes: parsedCatalog.issues.map(({ code }) => code),
    })
  }
  if (typeof input?.masterId !== 'string' || input.masterId.trim() === ''
    || !isValidJamoVariantContext(input?.requestedContext)) {
    return issue('invalid-request', 'master ID 또는 요청 문맥이 유효하지 않습니다.')
  }
  const knownPresetIds = contextGridPresetCatalogIds(parsedCatalog.catalog)
  const sourceValidation = validateJamoContextVariants(input.source, { knownPresetIds })
  if (!sourceValidation.ok) {
    if (sourceValidation.issues.length === 1 && sourceValidation.issues[0].code === 'invalid-preset-id') {
      return issue('unknown-preset', sourceValidation.issues[0].message, {
        variantId: sourceValidation.issues[0].variantId,
        masterId: sourceValidation.issues[0].masterId,
      })
    }
    return issue('invalid-source', '자소 문맥 source가 유효하지 않습니다.', {
      causeCodes: sourceValidation.issues.map(({ code }) => code),
    })
  }
  const invalidPresetLink = validatePresetLinks(input.source, parsedCatalog.catalog.contextPresets)
  if (invalidPresetLink) return invalidPresetLink
  const source = structuredClone(input.source) as RoleConstructionScope
  const master = source.masters.find(({ id }) => id === input.masterId)
  if (!master) return issue('missing-master', '요청한 자소 master가 없습니다.', { masterId: input.masterId })
  if (master.role !== source.grid.role
    || !isContextAllowedForRole(source.grid.role, input.requestedContext.baseContext)) {
    return issue('role-mismatch', 'master role과 요청 문맥이 맞지 않습니다.', { masterId: master.id })
  }

  const presetSelection = selectBest(
    parsedCatalog.catalog.contextPresets.filter(({ role }) => role === source.grid.role),
    input.requestedContext,
  )
  if (presetSelection.ambiguous) return issue('ambiguous-context-preset', '동일 우선순위 문맥 프리셋이 중복됩니다.')
  const variantSelection = selectBest(master.contextVariants ?? [], input.requestedContext)
  if (variantSelection.ambiguous) return issue('ambiguous-jamo-variant', '동일 우선순위 자소 variant가 중복됩니다.', { masterId: master.id })
  const variant = variantSelection.selected

  let contextPreset: DeepReadonly<ContextGridPresetV1> | undefined = presetSelection.selected
  if (variant?.presetId) {
    const explicit = parsedCatalog.catalog.contextPresets.find(({ id }) => id === variant.presetId)
    if (!explicit) return issue('unknown-preset', `preset ${variant.presetId}을 찾을 수 없습니다.`, { presetId: variant.presetId, variantId: variant.id })
    if (explicit.role !== source.grid.role) {
      return issue('preset-role-mismatch', '명시 preset의 role이 master role과 다릅니다.', { presetId: explicit.id, variantId: variant.id })
    }
    if (!jamoContextFallbackMatches(explicit.context, input.requestedContext)) {
      return issue('preset-context-mismatch', '명시 preset이 요청 문맥 fallback 범위에 없습니다.', { presetId: explicit.id, variantId: variant.id })
    }
    contextPreset = explicit
  }

  const railSources: GridProvenance['railSources'] = {}
  for (const rail of [...source.grid.xRails, ...source.grid.yRails]) railSources[rail.id] = { source: 'master' }
  const roleDefault = findRoleDefault(parsedCatalog.catalog.roleDefaults, source.grid.role)
  if (roleDefault) {
    const issues = applyCoreLayer(source, roleDefault.coreRailPositions, railSources, 'role-default', roleDefault.id)
    if (issues.length > 0) return { ok: false, issues }
  }
  if (contextPreset) {
    const issues = applyCoreLayer(source, contextPreset.coreRailPositions, railSources, 'context-preset', contextPreset.id)
    if (issues.length > 0) return { ok: false, issues }
  }

  const baseMaster = source.masters.find(({ id }) => id === master.id)!
  const beforeVariantReferences = collectConstructionReferenceRails(baseMaster)
  let resolvedGrid: RailGrid
  let resolvedMaster: JamoRoleMaster
  let exactProvenance: GridProvenance | undefined
  const variantHasJamoPatch = variant && (
    Object.keys(variant.coreRailOverrides ?? {}).length > 0
    || (variant.auxiliaryRails?.xRails.length ?? 0) > 0
    || (variant.auxiliaryRails?.yRails.length ?? 0) > 0
    || (variant.referenceOverrides?.length ?? 0) > 0
  )
  if (variant && variantHasJamoPatch) {
    const selectedMaster = source.masters.find(({ id }) => id === master.id)!
    const selectedVariant = selectedMaster.contextVariants?.find(({ id }) => id === variant.id)
    if (!selectedVariant) return issue('invalid-jamo-override', '선택한 variant를 파생 source에서 찾을 수 없습니다.', { variantId: variant.id })
    delete selectedVariant.presetId
    const exact = resolveExactJamoContextVariant({
      source,
      masterId: master.id,
      variantId: variant.id,
      knownPresetIds,
    })
    if (!exact.ok) {
      return issue('invalid-jamo-override', '자소 sparse override를 적용할 수 없습니다.', {
        variantId: variant.id,
        causeCodes: exact.issues.map(({ code }) => code),
      })
    }
    resolvedGrid = exact.grid
    resolvedMaster = exact.master
    exactProvenance = exact.provenance
  } else {
    resolvedGrid = structuredClone(source.grid)
    resolvedMaster = stripVariants(baseMaster)
  }

  for (const rail of [...resolvedGrid.xRails, ...resolvedGrid.yRails]) {
    const isVariantAux = variant && [...(variant.auxiliaryRails?.xRails ?? []), ...(variant.auxiliaryRails?.yRails ?? [])]
      .some(({ id }) => id === rail.id)
    const changedCore = Boolean(variant && rail.coreRole && variant.coreRailOverrides?.[rail.coreRole])
    if ((isVariantAux || changedCore) && variant) {
      railSources[rail.id] = { source: 'jamo-override', variantId: variant.id }
    }
    else if (!railSources[rail.id]) railSources[rail.id] = { source: 'master' }
  }

  const referenceSources: GridProvenance['referenceSources'] = {}
  const finalReferences = collectConstructionReferenceRails(resolvedMaster)
  for (const [key, railId] of finalReferences) {
    const unchanged = beforeVariantReferences.get(key) === railId
    referenceSources[key] = unchanged
      ? structuredClone(railSources[railId] ?? { source: 'master' })
      : exactProvenance?.referenceSources[key] ?? { source: 'jamo-override', variantId: variant?.id }
  }
  const provenance: GridProvenance = {
    railSources,
    referenceSources,
    selectedPresetIds: [roleDefault?.id, contextPreset?.id].filter((id): id is string => id !== undefined),
    selectedVariantId: variant?.id,
    selectedVariantContext: variant ? structuredClone(variant.context) : undefined,
    requestedContext: structuredClone(input.requestedContext),
    selectedContextPresetContext: contextPreset ? structuredClone(contextPreset.context) : undefined,
  }
  return { ok: true, grid: resolvedGrid, master: resolvedMaster, provenance }
}

/**
 * 저장 catalog가 7개 역할 원본 위에서 항상 해석 가능한지 검증한다.
 * 역할 기본값, 각 문맥 preset, 저장된 각 variant의 최종 합성을 모두 확인한다.
 */
export function validateContextCatalogAgainstRoleSources(input: {
  roleSources: DeepReadonly<Record<JamoPartRole, RoleConstructionScope>>
  catalog: DeepReadonly<ValidatedContextGridPresetCatalogV1>
}): ContextPartGridIssue[] {
  const issues: ContextPartGridIssue[] = []
  const issueKeys = new Set<string>()
  const push = (value: ContextPartGridIssue): void => {
    const key = JSON.stringify([
      value.code, value.presetId, value.variantId, value.masterId, value.causeCodes,
    ])
    if (!issueKeys.has(key)) {
      issueKeys.add(key)
      issues.push(value)
    }
  }
  const seedRailSources = (source: DeepReadonly<RoleConstructionScope>): GridProvenance['railSources'] =>
    Object.fromEntries(
      [...source.grid.xRails, ...source.grid.yRails].map(({ id }) => [id, { source: 'master' as const }]),
    )

  for (const role of JAMO_PART_ROLES) {
    const source = input.roleSources[role]
    const roleDefault = findRoleDefault(input.catalog.roleDefaults, role)
    if (roleDefault) {
      const candidate = structuredClone(source) as RoleConstructionScope
      for (const value of applyCoreLayer(
        candidate,
        roleDefault.coreRailPositions,
        seedRailSources(source),
        'role-default',
        roleDefault.id,
      )) push(value)
    }

    const presets = input.catalog.contextPresets
      .filter((preset) => preset.role === role)
      .sort((left, right) => compareCodePoint(left.id, right.id))
    for (const preset of presets) {
      const candidate = structuredClone(source) as RoleConstructionScope
      const provenance = seedRailSources(source)
      if (roleDefault) {
        const roleIssues = applyCoreLayer(
          candidate,
          roleDefault.coreRailPositions,
          provenance,
          'role-default',
          roleDefault.id,
        )
        if (roleIssues.length > 0) {
          roleIssues.forEach(push)
          continue
        }
      }
      for (const value of applyCoreLayer(
        candidate,
        preset.coreRailPositions,
        provenance,
        'context-preset',
        preset.id,
      )) push(value)
    }

    const masters = [...source.masters].sort((left, right) => compareCodePoint(left.id, right.id))
    for (const master of masters) {
      const variants = [...(master.contextVariants ?? [])]
        .sort((left, right) => compareCodePoint(left.id, right.id))
      for (const variant of variants) {
        const resolved = resolveContextualPartGrid({
          source,
          catalog: input.catalog,
          masterId: master.id,
          requestedContext: variant.context,
        })
        if (!resolved.ok) {
          resolved.issues.forEach((value) => push({
            ...value,
            masterId: value.masterId ?? master.id,
            variantId: value.variantId ?? variant.id,
          }))
        }
      }
    }
  }
  return issues.sort((left, right) => compareCodePoint(
    JSON.stringify([left.masterId, left.variantId, left.presetId, left.code]),
    JSON.stringify([right.masterId, right.variantId, right.presetId, right.code]),
  ))
}

export function contextualGridPresetPriority(context: DeepReadonly<JamoVariantContext>): number {
  return jamoContextFallbackPriority(context)
}

export function contextualGridPresetMatches(
  candidate: DeepReadonly<JamoVariantContext>,
  requested: DeepReadonly<JamoVariantContext>,
): boolean {
  return jamoContextFallbackMatches(candidate, requested)
}

export function contextualGridPresetSelectionKey(context: DeepReadonly<JamoVariantContext>): string {
  return `${jamoContextFallbackPriority(context)}:${canonicalVariantContextKey(context)}`
}
