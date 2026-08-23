import type {
  ConstructionElementAddress,
  ConstructionReferenceAddress,
  ConstructionReferenceLocator,
  CoreXRailRole,
  CoreYRailRole,
  DeepReadonly,
  GridPointRef,
  RailAxis,
  RailUsageCollectionResult,
  ValidatedRoleConstructionSourceV1,
  VariantReferenceTargetUsage,
} from '../types'
import { collectRailUsages } from './gridReferences'

function stableJsonSort<T>(values: T[]): T[] {
  return values.sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
}

function railAxis(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  railId: string,
): RailAxis | null {
  if (source.grid.xRails.some(({ id }) => id === railId)) return 'x'
  if (source.grid.yRails.some(({ id }) => id === railId)) return 'y'
  return null
}

function targetAxis(target: DeepReadonly<ConstructionReferenceAddress>): RailAxis {
  if (target.kind === 'cell-edge') return target.edge === 'left' || target.edge === 'right' ? 'x' : 'y'
  return target.axis
}

function findPoint(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  target: Exclude<DeepReadonly<ConstructionReferenceAddress>, { kind: 'cell-edge' }>,
): DeepReadonly<GridPointRef> | null {
  const master = source.masters.find(({ id }) => id === target.masterId)
  const channel = master?.construction.channels[target.channel]
  const element = channel?.elements.find(({ id }) => id === target.elementId)
  if (!element) return null
  if (target.kind === 'centerline-point') {
    if (element.kind !== 'centerline') return null
    const anchor = element.anchors.find(({ id }) => id === target.anchorId)
    return target.slot === 'point'
      ? anchor?.point ?? null
      : target.slot === 'handle-in' ? anchor?.handleIn ?? null : anchor?.handleOut ?? null
  }
  if (element.kind !== 'area') return null
  const treatment = element.boundaryTreatments.find(({ id }) => id === target.treatmentId)
  return target.slot === 'vertex'
    ? treatment?.vertex ?? null
    : target.slot === 'from' ? treatment?.from ?? null : treatment?.to ?? null
}

function canonicalCellRailIds(cellId: string): string[] {
  const parts = cellId.split(':')
  if (parts.length !== 8 || parts[0] !== 'grid-cell') return []
  try {
    return parts.slice(4).map((part) => decodeURIComponent(part))
  } catch {
    return []
  }
}

export function collectRailUsagesV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  railId: string,
): RailUsageCollectionResult {
  const base = collectRailUsages(source, railId)
  if (!base.ok) return base
  const axis = railAxis(source, railId)
  if (!axis) {
    return { ok: false, error: { code: 'missing-rail', message: `base Rail ${railId}을 찾을 수 없습니다.` } }
  }
  const usages = [...base.usages]
  const gridId = source.grid.id
  for (const master of source.masters) {
    for (const variant of master.contextVariants ?? []) {
      for (const [coreRole, position] of Object.entries(variant.coreRailOverrides ?? {})) {
        const coreRail = [...source.grid.xRails, ...source.grid.yRails]
          .find((rail) => rail.kind === 'core' && rail.coreRole === coreRole)
        if (coreRail?.id === railId) usages.push({
          kind: 'variant-core-override', gridId, railId, axis,
          masterId: master.id, variantId: variant.id,
          coreRole: coreRole as CoreXRailRole | CoreYRailRole,
        })
        if (position?.kind !== 'between') continue
        if (position.fromRailId === railId) usages.push({
          kind: 'variant-between-binding', gridId, railId, axis,
          masterId: master.id, variantId: variant.id,
          ownerKind: 'core-override', ownerId: coreRole, endpoint: 'from',
        })
        if (position.toRailId === railId) usages.push({
          kind: 'variant-between-binding', gridId, railId, axis,
          masterId: master.id, variantId: variant.id,
          ownerKind: 'core-override', ownerId: coreRole, endpoint: 'to',
        })
      }
      for (const variantRail of [
        ...(variant.auxiliaryRails?.xRails ?? []),
        ...(variant.auxiliaryRails?.yRails ?? []),
      ]) {
        if (variantRail.position.kind !== 'between') continue
        if (variantRail.position.fromRailId === railId) usages.push({
          kind: 'variant-between-binding', gridId, railId, axis,
          masterId: master.id, variantId: variant.id,
          ownerKind: 'auxiliary-rail', ownerId: variantRail.id, endpoint: 'from',
        })
        if (variantRail.position.toRailId === railId) usages.push({
          kind: 'variant-between-binding', gridId, railId, axis,
          masterId: master.id, variantId: variant.id,
          ownerKind: 'auxiliary-rail', ownerId: variantRail.id, endpoint: 'to',
        })
      }
      for (const override of variant.referenceOverrides ?? []) {
        if (override.railId === railId) usages.push({
          kind: 'variant-reference-destination', gridId, railId,
          axis: targetAxis(override.target), masterId: master.id,
          variantId: variant.id, overrideId: override.id,
          target: structuredClone(override.target) as ConstructionReferenceAddress,
        })
        if (override.target.kind === 'cell-edge') {
          if (canonicalCellRailIds(override.target.cellId).includes(railId)) usages.push({
            kind: 'variant-reference-target', gridId, railId, axis,
            masterId: master.id, variantId: variant.id, overrideId: override.id,
            target: structuredClone(override.target) as ConstructionReferenceAddress,
            reason: 'cell-id-would-change',
          })
          continue
        }
        const point = findPoint(source, override.target)
        if (point && (override.target.axis === 'x' ? point.xRailId : point.yRailId) === railId) usages.push({
          kind: 'variant-reference-target', gridId, railId, axis,
          masterId: master.id, variantId: variant.id, overrideId: override.id,
          target: structuredClone(override.target) as ConstructionReferenceAddress,
          reason: 'point-current-rail',
        })
      }
    }
  }
  return { ok: true, usages: stableJsonSort(usages) }
}

export function collectVariantRailUsagesV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  input: {
    masterId: string
    variantId: string
    axis: RailAxis
    railId: string
  },
): RailUsageCollectionResult {
  const master = source.masters.find(({ id }) => id === input.masterId)
  const variant = master?.contextVariants?.find(({ id }) => id === input.variantId)
  const rails = input.axis === 'x'
    ? variant?.auxiliaryRails?.xRails
    : input.axis === 'y' ? variant?.auxiliaryRails?.yRails : undefined
  if (!master || !variant || !rails?.some(({ id }) => id === input.railId)) {
    return {
      ok: false,
      error: {
        code: 'missing-rail',
        message: `variant Rail ${input.railId}을 찾을 수 없습니다.`,
      },
    }
  }

  const usages = [] as Extract<ReturnType<typeof collectRailUsagesV1>, { ok: true }>['usages']
  const gridId = source.grid.id
  for (const [coreRole, position] of Object.entries(variant.coreRailOverrides ?? {})) {
    if (position?.kind !== 'between') continue
    if (position.fromRailId === input.railId) usages.push({
      kind: 'variant-between-binding', gridId, railId: input.railId, axis: input.axis,
      masterId: master.id, variantId: variant.id,
      ownerKind: 'core-override', ownerId: coreRole, endpoint: 'from',
    })
    if (position.toRailId === input.railId) usages.push({
      kind: 'variant-between-binding', gridId, railId: input.railId, axis: input.axis,
      masterId: master.id, variantId: variant.id,
      ownerKind: 'core-override', ownerId: coreRole, endpoint: 'to',
    })
  }
  for (const rail of [
    ...(variant.auxiliaryRails?.xRails ?? []),
    ...(variant.auxiliaryRails?.yRails ?? []),
  ]) {
    if (rail.id === input.railId || rail.position.kind !== 'between') continue
    if (rail.position.fromRailId === input.railId) usages.push({
      kind: 'variant-between-binding', gridId, railId: input.railId, axis: input.axis,
      masterId: master.id, variantId: variant.id,
      ownerKind: 'auxiliary-rail', ownerId: rail.id, endpoint: 'from',
    })
    if (rail.position.toRailId === input.railId) usages.push({
      kind: 'variant-between-binding', gridId, railId: input.railId, axis: input.axis,
      masterId: master.id, variantId: variant.id,
      ownerKind: 'auxiliary-rail', ownerId: rail.id, endpoint: 'to',
    })
  }
  for (const override of variant.referenceOverrides ?? []) {
    if (override.railId === input.railId) usages.push({
      kind: 'variant-reference-destination', gridId, railId: input.railId,
      axis: input.axis, masterId: master.id, variantId: variant.id,
      overrideId: override.id,
      target: structuredClone(override.target) as ConstructionReferenceAddress,
    })
    if (override.target.kind === 'cell-edge'
      && canonicalCellRailIds(override.target.cellId).includes(input.railId)) usages.push({
      kind: 'variant-reference-target', gridId, railId: input.railId,
      axis: input.axis, masterId: master.id, variantId: variant.id,
      overrideId: override.id,
      target: structuredClone(override.target) as ConstructionReferenceAddress,
      reason: 'cell-id-would-change',
    })
  }
  return { ok: true, usages: stableJsonSort(usages) }
}

function variantTargetUsages(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  predicate: (target: DeepReadonly<ConstructionReferenceAddress>) => boolean,
): VariantReferenceTargetUsage[] {
  const usages: VariantReferenceTargetUsage[] = []
  for (const master of source.masters) for (const variant of master.contextVariants ?? []) {
    for (const override of variant.referenceOverrides ?? []) {
      if (!predicate(override.target)) continue
      usages.push({
        kind: 'variant-reference-target', ownerMasterId: master.id,
        variantId: variant.id, overrideId: override.id,
        target: structuredClone(override.target) as ConstructionReferenceAddress,
      })
    }
  }
  return stableJsonSort(usages)
}

export function collectElementUsagesV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  address: DeepReadonly<ConstructionElementAddress>,
): VariantReferenceTargetUsage[] {
  return variantTargetUsages(source, (target) => target.masterId === address.masterId
    && target.channel === address.channel && target.elementId === address.elementId)
}

export function collectReferenceUsagesV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  locator: DeepReadonly<ConstructionReferenceLocator>,
): VariantReferenceTargetUsage[] {
  return variantTargetUsages(source, (target) => {
    if (target.masterId !== locator.masterId
      || target.channel !== locator.channel
      || target.elementId !== locator.elementId) return false
    return locator.kind === 'cell-reference'
      ? target.kind === 'cell-edge' && target.cellId === locator.cellId
      : target.kind !== 'cell-edge' && target.referenceId === locator.referenceId
  })
}

export function hasPresetCoverageGapV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
): boolean {
  return source.masters.some((master) => master.contextVariants?.some((variant) => Boolean(variant.presetId)))
}
