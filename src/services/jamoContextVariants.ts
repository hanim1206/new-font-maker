import type {
  ConstructionReferenceAddress,
  DeepReadonly,
  ExactJamoContextVariantResolutionResult,
  GridProvenance,
  GridReferenceOverride,
  JamoConstructionChannelName,
  JamoContextVariant,
  JamoRoleMaster,
  JamoVariantContext,
  JamoVariantIssue,
  JamoVariantValidationResult,
  RailAxis,
  RailGrid,
  RailPosition,
  RoleConstructionScope,
} from '../types'
import { retileGridCellEdge } from './gridCellRetileCommands'
import { rebindGridReference } from './gridReferences'
import { isContextAllowedForRole } from './jamoContextRoles'
import { validateRoleConstructionScope } from './jamoConstruction'
import { addAuxiliaryRailAndSplitCells } from './masterGridCommands'

const BASE_CONTEXTS = new Set<string>([
  'choseong-only',
  'vertical',
  'horizontal',
  'mixed',
  'vertical-with-jongseong',
  'horizontal-with-jongseong',
  'mixed-with-jongseong',
])
const FINAL_WIDTH_CLASSES = new Set<string>(['narrow', 'normal', 'wide'])
const INITIAL_CLASSES = new Set<string>(['open', 'closed', 'double'])
const CHANNEL_NAMES: readonly JamoConstructionChannelName[] = ['main', 'horizontal', 'vertical']

function encode(value: string): string {
  return encodeURIComponent(value)
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function hasOwnShape(
  value: object,
  required: readonly string[],
  allowed: readonly string[] = required,
): boolean {
  return required.every((key) => hasOwn(value, key))
    && allowed.every((key) => !(key in value) || hasOwn(value, key))
}

export function canonicalVariantContextKey(context: DeepReadonly<JamoVariantContext>): string {
  return [
    context.baseContext,
    context.medialClass ?? '',
    context.finalWidthClass ?? '',
    context.initialClass ?? '',
  ].map(encode).join('|')
}

export function createJamoContextVariantId(
  masterId: string,
  context: DeepReadonly<JamoVariantContext>,
): string {
  return `jamo-context-variant:${encode(masterId)}:${canonicalVariantContextKey(context)}`
}

export function gridReferenceAddressKey(address: DeepReadonly<ConstructionReferenceAddress>): string {
  const owner = [address.masterId, address.channel, address.elementId].map(encode)
  if (address.kind === 'centerline-point') {
    return ['centerline-point', ...owner, address.anchorId, address.referenceId, address.slot, address.axis]
      .map(encode).join(':')
  }
  if (address.kind === 'boundary-point') {
    return ['boundary-point', ...owner, address.treatmentId, address.referenceId, address.slot, address.axis]
      .map(encode).join(':')
  }
  return ['cell-edge', ...owner, address.cellId, address.edge].map(encode).join(':')
}

function pushIssue(issues: JamoVariantIssue[], issue: JamoVariantIssue): void {
  const key = JSON.stringify(issue)
  if (!issues.some((current) => JSON.stringify(current) === key)) issues.push(issue)
}

function stableIssues(issues: JamoVariantIssue[]): JamoVariantIssue[] {
  return issues.sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
}

export function isValidJamoVariantContext(value: unknown): value is JamoVariantContext {
  if (!value || typeof value !== 'object') return false
  const context = value as Partial<JamoVariantContext>
  if (!hasOnlyKeys(value, ['baseContext', 'medialClass', 'finalWidthClass', 'initialClass'])) return false
  if (!hasOwn(value, 'baseContext')) return false
  for (const key of ['medialClass', 'finalWidthClass', 'initialClass'] as const) {
    if (key in value && !hasOwn(value, key)) return false
  }
  if (typeof context.baseContext !== 'string' || !BASE_CONTEXTS.has(context.baseContext)) return false
  if (context.medialClass !== undefined
    && (typeof context.medialClass !== 'string'
      || context.medialClass.trim() === ''
      || context.medialClass.trim() !== context.medialClass)) return false
  if (context.finalWidthClass !== undefined
    && (typeof context.finalWidthClass !== 'string' || !FINAL_WIDTH_CLASSES.has(context.finalWidthClass))) return false
  return context.initialClass === undefined
    || (typeof context.initialClass === 'string' && INITIAL_CLASSES.has(context.initialClass))
}

export function isValidRailPosition(value: unknown): value is RailPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Partial<RailPosition>
  if (!hasOwn(value, 'kind')) return false
  if (position.kind === 'absolute') {
    return hasOnlyKeys(value, ['kind', 'value'])
      && hasOwn(value, 'value')
      && typeof position.value === 'number'
      && Number.isFinite(position.value)
  }
  if (position.kind === 'between') {
    return hasOnlyKeys(value, ['kind', 'fromRailId', 'toRailId', 'ratio'])
      && hasOwn(value, 'fromRailId')
      && hasOwn(value, 'toRailId')
      && hasOwn(value, 'ratio')
      && typeof position.fromRailId === 'string'
      && typeof position.toRailId === 'string'
      && typeof position.ratio === 'number'
      && Number.isFinite(position.ratio)
  }
  return false
}

function validReferenceAddress(value: unknown): value is ConstructionReferenceAddress {
  if (!value || typeof value !== 'object') return false
  const address = value as Partial<ConstructionReferenceAddress>
  if (!hasOwn(value, 'kind')) return false
  const ownerIsValid = typeof address.masterId === 'string' && address.masterId.trim() !== ''
    && typeof address.channel === 'string' && CHANNEL_NAMES.includes(address.channel as JamoConstructionChannelName)
    && typeof address.elementId === 'string' && address.elementId.trim() !== ''
  if (!ownerIsValid) return false
  if (address.kind === 'centerline-point') {
    const keys = [
      'kind', 'masterId', 'channel', 'elementId', 'anchorId', 'referenceId', 'slot', 'axis',
    ] as const
    return hasOnlyKeys(value, keys)
      && hasOwnShape(value, keys)
      && ownerIsValid
      && typeof address.anchorId === 'string' && address.anchorId.trim() !== ''
      && typeof address.referenceId === 'string' && address.referenceId.trim() !== ''
      && ['point', 'handle-in', 'handle-out'].includes(String(address.slot))
      && (address.axis === 'x' || address.axis === 'y')
  }
  if (address.kind === 'boundary-point') {
    const keys = [
      'kind', 'masterId', 'channel', 'elementId', 'treatmentId', 'referenceId', 'slot', 'axis',
    ] as const
    return hasOnlyKeys(value, keys)
      && hasOwnShape(value, keys)
      && ownerIsValid
      && typeof address.treatmentId === 'string' && address.treatmentId.trim() !== ''
      && typeof address.referenceId === 'string' && address.referenceId.trim() !== ''
      && ['vertex', 'from', 'to'].includes(String(address.slot))
      && (address.axis === 'x' || address.axis === 'y')
  }
  if (address.kind === 'cell-edge') {
    const keys = ['kind', 'masterId', 'channel', 'elementId', 'cellId', 'edge'] as const
    return hasOnlyKeys(value, keys)
      && hasOwnShape(value, keys)
      && ownerIsValid
      && typeof address.cellId === 'string' && address.cellId.trim() !== ''
      && ['left', 'right', 'top', 'bottom'].includes(String(address.edge))
  }
  return false
}

function targetAxis(address: DeepReadonly<ConstructionReferenceAddress>): RailAxis {
  if (address.kind === 'cell-edge') {
    return address.edge === 'left' || address.edge === 'right' ? 'x' : 'y'
  }
  return address.axis
}

function railAxis(grid: DeepReadonly<RailGrid>, railId: string): RailAxis | null {
  if (grid.xRails.some(({ id }) => id === railId)) return 'x'
  if (grid.yRails.some(({ id }) => id === railId)) return 'y'
  return null
}

function referenceTargetExists(
  master: DeepReadonly<JamoRoleMaster>,
  target: DeepReadonly<ConstructionReferenceAddress>,
): boolean {
  if (target.masterId !== master.id) return false
  const channel = master.construction.channels[target.channel]
  const element = channel?.elements.find(({ id }) => id === target.elementId)
  if (!element) return false
  if (target.kind === 'centerline-point') {
    if (element.kind !== 'centerline') return false
    const anchor = element.anchors.find(({ id }) => id === target.anchorId)
    const point = target.slot === 'point'
      ? anchor?.point
      : target.slot === 'handle-in' ? anchor?.handleIn : anchor?.handleOut
    return point?.id === target.referenceId
  }
  if (target.kind === 'boundary-point') {
    if (element.kind !== 'area') return false
    const treatment = element.boundaryTreatments.find(({ id }) => id === target.treatmentId)
    const point = target.slot === 'vertex'
      ? treatment?.vertex
      : target.slot === 'from' ? treatment?.from : treatment?.to
    return point?.id === target.referenceId
  }
  return element.kind === 'area' && element.filledCells.some(({ id }) => id === target.cellId)
}

function deriveVariantSource(
  source: DeepReadonly<RoleConstructionScope>,
  ownerMasterId: string,
  variant: DeepReadonly<JamoContextVariant>,
): { source?: RoleConstructionScope; issues: JamoVariantIssue[] } {
  let derived = structuredClone(source) as RoleConstructionScope
  for (const master of derived.masters) delete master.contextVariants
  const issues: JamoVariantIssue[] = []
  for (const [coreRole, position] of Object.entries(variant.coreRailOverrides ?? {})) {
    const rail = [...derived.grid.xRails, ...derived.grid.yRails].find((candidate) =>
      candidate.kind === 'core' && candidate.coreRole === coreRole)
    if (!rail || !position || typeof position !== 'object') {
      pushIssue(issues, {
        code: 'invalid-core-rail-override', variantId: variant.id,
        message: `코어 Rail role ${coreRole} override를 적용할 수 없습니다.`,
      })
      continue
    }
    rail.position = structuredClone(position) as RailPosition
  }
  const coreValidation = validateRoleConstructionScope(derived)
  if (!coreValidation.ok) {
    pushIssue(issues, {
      code: 'invalid-derived-grid', variantId: variant.id,
      message: `variant core override 결과가 유효하지 않습니다: ${coreValidation.issues.map(({ code }) => code).join(', ')}`,
    })
    return { issues }
  }
  const pending = [
    ...(variant.auxiliaryRails?.xRails ?? []).map((rail) => ({ axis: 'x' as const, rail })),
    ...(variant.auxiliaryRails?.yRails ?? []).map((rail) => ({ axis: 'y' as const, rail })),
  ]
  while (pending.length > 0) {
    const ready = pending.filter(({ axis, rail }) => {
      const position = rail.position
      if (position.kind !== 'between') return false
      const rails = axis === 'x' ? derived.grid.xRails : derived.grid.yRails
      const from = rails.findIndex(({ id }) => id === position.fromRailId)
      const to = rails.findIndex(({ id }) => id === position.toRailId)
      return from >= 0 && to === from + 1
    }).sort((first, second) => first.rail.id.localeCompare(second.rail.id))
    if (ready.length === 0) {
      pushIssue(issues, {
        code: 'invalid-derived-grid', variantId: variant.id,
        message: 'variant auxiliary Rail을 안정적인 인접 순서로 합성할 수 없습니다.',
      })
      return { issues }
    }
    const next = ready[0]
    const position = next.rail.position
    if (position.kind !== 'between') {
      pushIssue(issues, { code: 'invalid-variant-rail', variantId: variant.id, railId: next.rail.id, message: 'variant auxiliary Rail은 between 위치여야 합니다.' })
      return { issues }
    }
    const result = addAuxiliaryRailAndSplitCells(derived, {
      transactionId: `resolve:${variant.id}:add:${next.rail.id}`,
      axis: next.axis,
      railId: next.rail.id,
      fromRailId: position.fromRailId,
      toRailId: position.toRailId,
      ratio: position.ratio,
    })
    if (!result.ok) {
      pushIssue(issues, { code: 'invalid-derived-grid', variantId: variant.id, railId: next.rail.id, message: result.error.message })
      return { issues }
    }
    derived = result.scope
    pending.splice(pending.indexOf(next), 1)
  }
  if (!derived.masters.some(({ id }) => id === ownerMasterId)) {
    pushIssue(issues, { code: 'orphan-reference-target', variantId: variant.id, masterId: ownerMasterId, message: 'variant owner master를 찾을 수 없습니다.' })
  }
  return issues.length > 0 ? { issues } : { source: derived, issues: [] }
}

export function validateJamoContextVariants(
  source: unknown,
  options: { knownPresetIds?: ReadonlySet<string> } = {},
): JamoVariantValidationResult {
  const sourceValidation = validateRoleConstructionScope(source)
  if (!sourceValidation.ok) {
    return {
      ok: false,
      issues: [{ code: 'orphan-reference-target', message: 'variant source가 유효하지 않습니다.' }],
    }
  }
  const typed = source as RoleConstructionScope
  const issues: JamoVariantIssue[] = []
  const variantIds = new Set<string>()
  const globalVariantRailIds = new Set<string>([
    ...typed.grid.xRails.map(({ id }) => id),
    ...typed.grid.yRails.map(({ id }) => id),
  ])
  for (const master of typed.masters) {
    const contextKeys = new Set<string>()
    if ('contextVariants' in master && !hasOwn(master, 'contextVariants')) {
      pushIssue(issues, {
        code: 'invalid-variant-id', masterId: master.id,
        message: 'contextVariants는 master own field여야 합니다.',
      })
      continue
    }
    if (master.contextVariants !== undefined && !Array.isArray(master.contextVariants)) {
      pushIssue(issues, {
        code: 'invalid-variant-id', masterId: master.id,
        message: 'contextVariants는 배열이어야 합니다.',
      })
      continue
    }
    for (const rawVariant of master.contextVariants ?? []) {
      const variantKeys = [
        'id', 'context', 'presetId', 'coreRailOverrides', 'auxiliaryRails', 'referenceOverrides',
      ] as const
      if (!rawVariant || typeof rawVariant !== 'object'
        || !hasOnlyKeys(rawVariant, variantKeys)
        || !hasOwnShape(rawVariant, ['id', 'context'], variantKeys)) {
        pushIssue(issues, {
          code: 'invalid-variant-id', masterId: master.id,
          message: 'variant가 완전한 v1 객체가 아닙니다.',
        })
        continue
      }
      const variant = rawVariant as JamoContextVariant
      const variantId = typeof variant.id === 'string' ? variant.id : ''
      if (variantId.trim() === '') {
        pushIssue(issues, { code: 'invalid-variant-id', masterId: master.id, variantId, message: 'variant ID는 비어 있을 수 없습니다.' })
      } else if (variantIds.has(variantId)) {
        pushIssue(issues, { code: 'duplicate-variant-id', masterId: master.id, variantId, message: `variant ID ${variantId}가 중복됩니다.` })
      } else {
        variantIds.add(variantId)
      }
      if (!isValidJamoVariantContext(variant.context)
        || !isContextAllowedForRole(master.role, variant.context.baseContext)) {
        pushIssue(issues, {
          code: 'invalid-variant-context',
          masterId: master.id,
          variantId,
          message: `master role ${master.role}에서 variant context를 사용할 수 없습니다.`,
        })
        continue
      }
      const contextKey = canonicalVariantContextKey(variant.context)
      if (contextKeys.has(contextKey)) {
        pushIssue(issues, { code: 'duplicate-variant-context', masterId: master.id, variantId, message: '같은 master에 동일한 variant context가 중복됩니다.' })
      } else {
        contextKeys.add(contextKey)
      }
      const expectedId = createJamoContextVariantId(master.id, variant.context)
      if (variantId !== expectedId) {
        pushIssue(issues, { code: 'non-canonical-variant-id', masterId: master.id, variantId, message: `variant ID는 ${expectedId}여야 합니다.` })
      }
      if (variant.presetId !== undefined) {
        if (typeof variant.presetId !== 'string' || variant.presetId.trim() === '') {
          pushIssue(issues, { code: 'invalid-preset-id', masterId: master.id, variantId, message: 'preset ID는 비어 있을 수 없습니다.' })
        } else if (!options.knownPresetIds) {
          pushIssue(issues, { code: 'preset-coverage-incomplete', masterId: master.id, variantId, message: 'preset catalog 검증 범위가 없습니다.' })
        } else if (!options.knownPresetIds.has(variant.presetId)) {
          pushIssue(issues, { code: 'invalid-preset-id', masterId: master.id, variantId, message: `preset ${variant.presetId}을 찾을 수 없습니다.` })
        }
      }
      if (variant.auxiliaryRails !== undefined
        && (!variant.auxiliaryRails || typeof variant.auxiliaryRails !== 'object'
          || !hasOnlyKeys(variant.auxiliaryRails, ['xRails', 'yRails'])
          || !hasOwnShape(variant.auxiliaryRails, ['xRails', 'yRails'])
          || !Array.isArray(variant.auxiliaryRails.xRails)
          || !Array.isArray(variant.auxiliaryRails.yRails))) {
        pushIssue(issues, { code: 'invalid-variant-rail', masterId: master.id, variantId, message: 'variant auxiliaryRails가 완전하지 않습니다.' })
        continue
      }
      if (variant.coreRailOverrides !== undefined
        && (!variant.coreRailOverrides || typeof variant.coreRailOverrides !== 'object'
          || Array.isArray(variant.coreRailOverrides))) {
        pushIssue(issues, { code: 'invalid-core-rail-override', masterId: master.id, variantId, message: 'coreRailOverrides는 객체여야 합니다.' })
        continue
      }
      if (variant.referenceOverrides !== undefined && !Array.isArray(variant.referenceOverrides)) {
        pushIssue(issues, { code: 'invalid-reference-override', masterId: master.id, variantId, message: 'referenceOverrides는 배열이어야 합니다.' })
        continue
      }
      const sparseCount = Object.keys(variant.coreRailOverrides ?? {}).length
        + (variant.auxiliaryRails?.xRails.length ?? 0)
        + (variant.auxiliaryRails?.yRails.length ?? 0)
        + (variant.referenceOverrides?.length ?? 0)
        + (variant.presetId ? 1 : 0)
      if (sparseCount === 0) {
        pushIssue(issues, { code: 'empty-variant', masterId: master.id, variantId, message: '빈 sparse variant는 저장하지 않습니다.' })
      }
      const issueCountBeforeGrid = issues.length
      for (const [coreRole, position] of Object.entries(variant.coreRailOverrides ?? {})) {
        if (![...typed.grid.xRails, ...typed.grid.yRails]
          .some((rail) => rail.kind === 'core' && rail.coreRole === coreRole)
          || !isValidRailPosition(position)) {
          pushIssue(issues, {
            code: 'invalid-core-rail-override', masterId: master.id, variantId,
            message: `코어 Rail role ${coreRole} override가 유효하지 않습니다.`,
          })
        }
      }
      for (const [axis, rails] of [
        ['x', variant.auxiliaryRails?.xRails ?? []],
        ['y', variant.auxiliaryRails?.yRails ?? []],
      ] as const) {
        for (const rail of rails) {
          if (!rail || typeof rail !== 'object' || rail.kind !== 'auxiliary' || rail.coreRole !== undefined
            || !hasOnlyKeys(rail, ['id', 'kind', 'position'])
            || !hasOwnShape(rail, ['id', 'kind', 'position'])
            || typeof rail.id !== 'string' || rail.id.trim() === ''
            || !isValidRailPosition(rail.position)
            || rail.position.kind !== 'between') {
            pushIssue(issues, { code: 'invalid-variant-rail', masterId: master.id, variantId, railId: rail?.id, message: `${axis.toUpperCase()} variant Rail이 유효하지 않습니다.` })
            continue
          }
          if (globalVariantRailIds.has(rail.id)) {
            pushIssue(issues, { code: 'duplicate-variant-rail-id', masterId: master.id, variantId, railId: rail.id, message: `variant Rail ID ${rail.id}가 중복됩니다.` })
          } else {
            globalVariantRailIds.add(rail.id)
          }
        }
      }
      const derived = issues.length === issueCountBeforeGrid
        ? deriveVariantSource(typed, master.id, variant)
        : { issues: [] }
      for (const issue of derived.issues) pushIssue(issues, { ...issue, masterId: master.id })
      const derivedMaster = derived.source?.masters.find(({ id }) => id === master.id)
      const targetKeys = new Set<string>()
      const overrideIds = new Set<string>()
      const cellElements = new Set<string>()
      const validOverrides: GridReferenceOverride[] = []
      const overrideIssueStart = issues.length
      for (const override of variant.referenceOverrides ?? []) {
        if (!override || typeof override !== 'object'
          || !hasOnlyKeys(override, ['id', 'target', 'railId'])
          || !hasOwnShape(override, ['id', 'target', 'railId'])
          || typeof override.id !== 'string' || override.id.trim() === ''
          || typeof override.railId !== 'string' || override.railId.trim() === ''
          || !validReferenceAddress(override.target)) {
          pushIssue(issues, { code: 'invalid-reference-override', masterId: master.id, variantId, message: 'reference override가 완전하지 않습니다.' })
          continue
        }
        validOverrides.push(override)
        if (overrideIds.has(override.id)) {
          pushIssue(issues, { code: 'duplicate-reference-override', masterId: master.id, variantId, overrideId: override.id, message: `override ID ${override.id}가 중복됩니다.` })
        } else {
          overrideIds.add(override.id)
        }
        const targetKey = gridReferenceAddressKey(override.target)
        if (targetKeys.has(targetKey)) {
          pushIssue(issues, { code: 'duplicate-reference-override', masterId: master.id, variantId, overrideId: override.id, message: '같은 target의 override가 중복됩니다.' })
        } else {
          targetKeys.add(targetKey)
        }
        if (!derivedMaster || !referenceTargetExists(derivedMaster, override.target)) {
          pushIssue(issues, { code: 'orphan-reference-target', masterId: master.id, variantId, overrideId: override.id, elementId: override.target.elementId, message: 'override target을 base master에서 찾을 수 없습니다.' })
        }
        const destinationAxis = derived.source ? railAxis(derived.source.grid, override.railId) : null
        if (!destinationAxis) {
          pushIssue(issues, { code: 'orphan-destination-rail', masterId: master.id, variantId, overrideId: override.id, railId: override.railId, message: 'override destination Rail을 찾을 수 없습니다.' })
        } else if (destinationAxis !== targetAxis(override.target)) {
          pushIssue(issues, { code: 'axis-mismatch', masterId: master.id, variantId, overrideId: override.id, railId: override.railId, message: 'override target과 destination Rail 축이 다릅니다.' })
        }
        if (override.target.kind === 'cell-edge') {
          if (cellElements.has(override.target.elementId)) {
            pushIssue(issues, { code: 'overlapping-retile', masterId: master.id, variantId, overrideId: override.id, elementId: override.target.elementId, message: '같은 area element의 cell retile override는 한 variant에 하나만 허용합니다.' })
          }
          cellElements.add(override.target.elementId)
        }
      }
      if (derived.source && issues.length === overrideIssueStart) {
        let dryRun = derived.source
        for (const override of [...validOverrides]
          .sort((first, second) => gridReferenceAddressKey(first.target).localeCompare(gridReferenceAddressKey(second.target)))) {
          const result = override.target.kind === 'cell-edge'
            ? retileGridCellEdge(dryRun, {
              transactionId: `validate:${variant.id}:${override.id}`,
              target: override.target,
              railId: override.railId,
            })
            : rebindGridReference(dryRun, {
              transactionId: `validate:${variant.id}:${override.id}`,
              target: override.target,
              railId: override.railId,
            })
          if (!result.ok) {
            pushIssue(issues, {
              code: 'invalid-reference-override', masterId: master.id, variantId,
              overrideId: override.id, elementId: override.target.elementId,
              message: `reference override를 적용할 수 없습니다: ${result.error.message}`,
            })
            break
          }
          dryRun = result.scope
        }
      }
    }
  }
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues: stableIssues(issues) }
}

function addResolvedReferenceProvenance(
  master: DeepReadonly<JamoRoleMaster>,
  provenance: GridProvenance,
  explicitOverrideKeys: ReadonlySet<string>,
  inheritedReferenceRails: ReadonlyMap<string, string>,
  variantId: string,
): void {
  const sourceForRail = (railId: string): GridProvenance['referenceSources'][string] =>
    provenance.railSources[railId]?.source === 'jamo-override'
      ? { source: 'jamo-override', variantId }
      : { source: 'master' }
  const setReference = (key: string, railId: string, forceOverride = false) => {
    const inheritedRailId = inheritedReferenceRails.get(key)
    provenance.referenceSources[key] = forceOverride
      || explicitOverrideKeys.has(key)
      || inheritedRailId === undefined
      || inheritedRailId !== railId
      ? { source: 'jamo-override', variantId }
      : sourceForRail(railId)
  }
  for (const channelName of CHANNEL_NAMES) {
    const channel = master.construction.channels[channelName]
    if (!channel) continue
    for (const element of channel.elements) {
      if (element.kind === 'centerline') {
        for (const anchor of element.anchors) {
          const refs = [
            ['point', anchor.point], ['handle-in', anchor.handleIn], ['handle-out', anchor.handleOut],
          ] as const
          for (const [slot, point] of refs) {
            if (!point) continue
            for (const axis of ['x', 'y'] as const) {
              const key = gridReferenceAddressKey({
                kind: 'centerline-point', masterId: master.id, channel: channelName,
                elementId: element.id, anchorId: anchor.id, referenceId: point.id, slot, axis,
              })
              setReference(key, axis === 'x' ? point.xRailId : point.yRailId)
            }
          }
        }
        continue
      }
      for (const treatment of element.boundaryTreatments) {
        for (const slot of ['vertex', 'from', 'to'] as const) {
          const point = treatment[slot]
          for (const axis of ['x', 'y'] as const) {
            const key = gridReferenceAddressKey({
              kind: 'boundary-point', masterId: master.id, channel: channelName,
              elementId: element.id, treatmentId: treatment.id, referenceId: point.id, slot, axis,
            })
            setReference(key, axis === 'x' ? point.xRailId : point.yRailId)
          }
        }
      }
      for (const cell of element.filledCells) for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        const key = gridReferenceAddressKey({
          kind: 'cell-edge', masterId: master.id, channel: channelName,
          elementId: element.id, cellId: cell.id, edge,
        })
        const railId = edge === 'left' ? cell.leftRailId
          : edge === 'right' ? cell.rightRailId
            : edge === 'top' ? cell.topRailId : cell.bottomRailId
        setReference(key, railId)
      }
    }
  }
}

export function collectConstructionReferenceRails(master: DeepReadonly<JamoRoleMaster>): Map<string, string> {
  const result = new Map<string, string>()
  for (const channelName of CHANNEL_NAMES) {
    const channel = master.construction.channels[channelName]
    if (!channel) continue
    for (const element of channel.elements) {
      if (element.kind === 'centerline') {
        for (const anchor of element.anchors) {
          for (const [slot, point] of [
            ['point', anchor.point], ['handle-in', anchor.handleIn], ['handle-out', anchor.handleOut],
          ] as const) {
            if (!point) continue
            for (const axis of ['x', 'y'] as const) result.set(
              gridReferenceAddressKey({
                kind: 'centerline-point', masterId: master.id, channel: channelName,
                elementId: element.id, anchorId: anchor.id, referenceId: point.id, slot, axis,
              }),
              axis === 'x' ? point.xRailId : point.yRailId,
            )
          }
        }
        continue
      }
      for (const treatment of element.boundaryTreatments) {
        for (const slot of ['vertex', 'from', 'to'] as const) {
          const point = treatment[slot]
          for (const axis of ['x', 'y'] as const) result.set(
            gridReferenceAddressKey({
              kind: 'boundary-point', masterId: master.id, channel: channelName,
              elementId: element.id, treatmentId: treatment.id, referenceId: point.id, slot, axis,
            }),
            axis === 'x' ? point.xRailId : point.yRailId,
          )
        }
      }
      for (const cell of element.filledCells) for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        result.set(
          gridReferenceAddressKey({
            kind: 'cell-edge', masterId: master.id, channel: channelName,
            elementId: element.id, cellId: cell.id, edge,
          }),
          edge === 'left' ? cell.leftRailId
            : edge === 'right' ? cell.rightRailId
              : edge === 'top' ? cell.topRailId : cell.bottomRailId,
        )
      }
    }
  }
  return result
}

export function resolveExactJamoContextVariant(input: {
  source: DeepReadonly<RoleConstructionScope>
  masterId: string
  variantId: string
  knownPresetIds?: ReadonlySet<string>
}): ExactJamoContextVariantResolutionResult {
  const validation = validateJamoContextVariants(input.source, { knownPresetIds: input.knownPresetIds })
  if (!validation.ok) return { ok: false, issues: validation.issues }
  const source = structuredClone(input.source) as RoleConstructionScope
  const master = source.masters.find(({ id }) => id === input.masterId)
  const variant = master?.contextVariants?.find(({ id }) => id === input.variantId)
  if (!master || !variant) {
    return {
      ok: false,
      issues: [{ code: 'invalid-variant-id', masterId: input.masterId, variantId: input.variantId, message: 'exact variant를 찾을 수 없습니다.' }],
    }
  }
  if (variant.presetId) {
    return {
      ok: false,
      issues: [{
        code: 'preset-coverage-incomplete', masterId: master.id, variantId: variant.id,
        message: 'exact resolver는 실제 preset patch 입력이 연결되기 전에는 presetId를 적용하지 않습니다.',
      }],
    }
  }
  const derived = deriveVariantSource(source, master.id, variant)
  if (!derived.source) return { ok: false, issues: stableIssues(derived.issues) }
  const provenance: GridProvenance = {
    railSources: {},
    referenceSources: {},
    selectedPresetIds: [],
    selectedVariantId: variant.id,
    selectedVariantContext: structuredClone(variant.context),
  }
  for (const rail of [...derived.source.grid.xRails, ...derived.source.grid.yRails]) {
    const overriddenCore = rail.coreRole && variant.coreRailOverrides?.[rail.coreRole]
    const variantAuxiliary = [...(variant.auxiliaryRails?.xRails ?? []), ...(variant.auxiliaryRails?.yRails ?? [])]
      .some(({ id }) => id === rail.id)
    provenance.railSources[rail.id] = overriddenCore || variantAuxiliary
      ? { source: 'jamo-override', variantId: variant.id }
      : { source: 'master' }
  }
  const inheritedMaster = derived.source.masters.find(({ id }) => id === master.id)
  if (!inheritedMaster) {
    return {
      ok: false,
      issues: [{ code: 'orphan-reference-target', masterId: master.id, variantId: variant.id, message: '파생 master를 찾을 수 없습니다.' }],
    }
  }
  const inheritedReferenceRails = collectConstructionReferenceRails(inheritedMaster)
  let working = derived.source
  const explicitOverrideKeys = new Set<string>()
  for (const override of [...(variant.referenceOverrides ?? [])]
    .sort((first, second) => gridReferenceAddressKey(first.target).localeCompare(gridReferenceAddressKey(second.target)))) {
    if (override.target.kind === 'cell-edge') {
      const result = retileGridCellEdge(working, {
        transactionId: `resolve:${variant.id}:${override.id}`,
        target: override.target,
        railId: override.railId,
      })
      if (!result.ok) {
        return { ok: false, issues: [{ code: 'orphan-reference-target', masterId: master.id, variantId: variant.id, overrideId: override.id, message: result.error.message }] }
      }
      working = result.scope
    } else {
      const result = rebindGridReference(working, {
        transactionId: `resolve:${variant.id}:${override.id}`,
        target: override.target,
        railId: override.railId,
      })
      if (!result.ok) {
        return { ok: false, issues: [{ code: 'orphan-reference-target', masterId: master.id, variantId: variant.id, overrideId: override.id, message: result.error.message }] }
      }
      working = result.scope
      explicitOverrideKeys.add(gridReferenceAddressKey(override.target))
    }
  }
  const resolvedMaster = structuredClone(working.masters.find(({ id }) => id === master.id)!)
  delete resolvedMaster.contextVariants
  addResolvedReferenceProvenance(
    resolvedMaster,
    provenance,
    explicitOverrideKeys,
    inheritedReferenceRails,
    variant.id,
  )
  return { ok: true, grid: working.grid, master: resolvedMaster, provenance }
}

export function collectJamoContextVariantOrphans(
  source: unknown,
  options: { knownPresetIds?: ReadonlySet<string> } = {},
): JamoVariantIssue[] {
  const result = validateJamoContextVariants(source, options)
  return result.ok ? [] : result.issues
}
