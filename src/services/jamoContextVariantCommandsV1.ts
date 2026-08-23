import type {
  AddVariantAuxiliaryRailV1Command,
  ContextVariantCommandOptions,
  ContextVariantCommandErrorCode,
  ContextVariantCommandResult,
  DeepReadonly,
  JamoContextVariant,
  JamoRoleMaster,
  JamoVariantContext,
  RemoveCoreRailOverrideV1Command,
  RemoveVariantAuxiliaryRailV1Command,
  RemoveVariantReferenceOverrideV1Command,
  RoleConstructionScope,
  RailUsage,
  SetCoreRailOverrideV1Command,
  SetVariantReferenceOverrideV1Command,
  ValidatedRoleConstructionSourceV1,
} from '../types'
import {
  canonicalVariantContextKey,
  createJamoContextVariantId,
} from './jamoContextVariants'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'
import { collectVariantRailUsagesV1 } from './roleConstructionUsagesV1'

function failure(
  code: ContextVariantCommandErrorCode,
  message: string,
  usages?: RailUsage[],
): ContextVariantCommandResult {
  return { ok: false, error: { code, message, ...(usages ? { usages } : {}) } }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function variantIsEmpty(variant: DeepReadonly<JamoContextVariant>): boolean {
  return !variant.presetId
    && Object.keys(variant.coreRailOverrides ?? {}).length === 0
    && (variant.auxiliaryRails?.xRails.length ?? 0) === 0
    && (variant.auxiliaryRails?.yRails.length ?? 0) === 0
    && (variant.referenceOverrides?.length ?? 0) === 0
}

function canonicalizeVariant(master: JamoRoleMaster, variant: JamoContextVariant): void {
  if (variant.coreRailOverrides && Object.keys(variant.coreRailOverrides).length === 0) {
    delete variant.coreRailOverrides
  }
  if (variant.auxiliaryRails
    && variant.auxiliaryRails.xRails.length === 0
    && variant.auxiliaryRails.yRails.length === 0) delete variant.auxiliaryRails
  if (variant.referenceOverrides?.length === 0) delete variant.referenceOverrides
  if (variantIsEmpty(variant)) {
    master.contextVariants = master.contextVariants?.filter(({ id }) => id !== variant.id)
  }
  if (master.contextVariants?.length === 0) delete master.contextVariants
}

function findVariant(
  master: JamoRoleMaster,
  context: DeepReadonly<JamoVariantContext>,
): JamoContextVariant | undefined {
  const key = canonicalVariantContextKey(context)
  return master.contextVariants?.find((variant) => canonicalVariantContextKey(variant.context) === key)
}

function ensureVariant(
  master: JamoRoleMaster,
  context: DeepReadonly<JamoVariantContext>,
): JamoContextVariant {
  const existing = findVariant(master, context)
  if (existing) return existing
  const variant: JamoContextVariant = {
    id: createJamoContextVariantId(master.id, context),
    context: structuredClone(context) as JamoVariantContext,
  }
  master.contextVariants = [...(master.contextVariants ?? []), variant]
  return variant
}

function mutateSource(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  input: {
    transactionId: string
    masterId: string
    context: DeepReadonly<JamoVariantContext>
    command: 'set-context-variant-patch' | 'remove-context-variant-patch'
    createVariant: boolean
    options: DeepReadonly<ContextVariantCommandOptions>
    mutate: (variant: JamoContextVariant) => ContextVariantCommandResult | null
  },
): ContextVariantCommandResult {
  if (typeof input.transactionId !== 'string' || input.transactionId.trim() === '') {
    return failure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }
  const parsed = parseRoleConstructionSourceV1(source, { knownPresetIds: input.options.knownPresetIds })
  if (!parsed.ok) {
    if (parsed.issues.some(({ message }) => message.includes('preset-coverage-incomplete'))) {
      return failure('preset-coverage-incomplete', 'presetId가 있는 source를 수정하려면 preset catalog coverage가 필요합니다.')
    }
    return failure('invalid-source', `variant command source가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }
  const next = structuredClone(parsed.source) as unknown as RoleConstructionScope
  const master = next.masters.find(({ id }) => id === input.masterId)
  if (!master) return failure('missing-master', `master ${input.masterId}을 찾을 수 없습니다.`)
  const variant = input.createVariant
    ? ensureVariant(master, input.context)
    : findVariant(master, input.context)
  if (!variant) return failure('missing-variant-value', '해당 context variant를 찾을 수 없습니다.')
  const mutationFailure = input.mutate(variant)
  if (mutationFailure) return mutationFailure
  canonicalizeVariant(master, variant)
  if (canonicalJson(next) === canonicalJson(parsed.source)) {
    return failure('no-op', 'variant patch 결과가 기존 source와 같습니다.')
  }
  const finalParse = parseRoleConstructionSourceV1(next, { knownPresetIds: input.options.knownPresetIds })
  if (!finalParse.ok) {
    return failure('invalid-result', `variant patch 결과가 유효하지 않습니다: ${finalParse.issues.map(({ code }) => code).join(', ')}`)
  }
  const before = structuredClone(parsed.source) as unknown as RoleConstructionScope
  const after = structuredClone(finalParse.source) as unknown as RoleConstructionScope
  return {
    ok: true,
    scope: finalParse.source,
    transaction: {
      id: input.transactionId,
      kind: 'master-grid',
      command: input.command,
      before,
      after,
    },
  }
}

export function setCoreRailOverrideV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<SetCoreRailOverrideV1Command>,
  options: DeepReadonly<ContextVariantCommandOptions> = {},
): ContextVariantCommandResult {
  const inheritedPosition = [...source.grid.xRails, ...source.grid.yRails]
    .find((rail) => rail.kind === 'core' && rail.coreRole === command.coreRole)?.position
  return mutateSource(source, {
    ...command,
    command: 'set-context-variant-patch',
    createVariant: true,
    options,
    mutate: (variant) => {
      if (inheritedPosition
        && canonicalJson(command.position) === canonicalJson(inheritedPosition)) {
        if (!variant.coreRailOverrides?.[command.coreRole]) {
          return failure('no-op', `core override ${command.coreRole}은 상속값과 같습니다.`)
        }
        delete variant.coreRailOverrides[command.coreRole]
        return null
      }
      variant.coreRailOverrides = {
        ...(variant.coreRailOverrides ?? {}),
        [command.coreRole]: structuredClone(command.position),
      }
      return null
    },
  })
}

export function removeCoreRailOverrideV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<RemoveCoreRailOverrideV1Command>,
  options: DeepReadonly<ContextVariantCommandOptions> = {},
): ContextVariantCommandResult {
  return mutateSource(source, {
    ...command,
    command: 'remove-context-variant-patch',
    createVariant: false,
    options,
    mutate: (variant) => {
      if (!variant.coreRailOverrides?.[command.coreRole]) {
        return failure('missing-variant-value', `core override ${command.coreRole}을 찾을 수 없습니다.`)
      }
      delete variant.coreRailOverrides[command.coreRole]
      return null
    },
  })
}

export function setVariantReferenceOverrideV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<SetVariantReferenceOverrideV1Command>,
  options: DeepReadonly<ContextVariantCommandOptions> = {},
): ContextVariantCommandResult {
  return mutateSource(source, {
    ...command,
    command: 'set-context-variant-patch',
    createVariant: true,
    options,
    mutate: (variant) => {
      const overrides = [...(variant.referenceOverrides ?? [])]
      const index = overrides.findIndex(({ id }) => id === command.override.id)
      const value = structuredClone(command.override)
      if (index < 0) overrides.push(value)
      else overrides[index] = value
      variant.referenceOverrides = overrides
      return null
    },
  })
}

export function removeVariantReferenceOverrideV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<RemoveVariantReferenceOverrideV1Command>,
  options: DeepReadonly<ContextVariantCommandOptions> = {},
): ContextVariantCommandResult {
  return mutateSource(source, {
    ...command,
    command: 'remove-context-variant-patch',
    createVariant: false,
    options,
    mutate: (variant) => {
      const overrides = variant.referenceOverrides ?? []
      if (!overrides.some(({ id }) => id === command.overrideId)) {
        return failure('missing-variant-value', `reference override ${command.overrideId}을 찾을 수 없습니다.`)
      }
      variant.referenceOverrides = overrides.filter(({ id }) => id !== command.overrideId)
      return null
    },
  })
}

export function addVariantAuxiliaryRailV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<AddVariantAuxiliaryRailV1Command>,
  options: DeepReadonly<ContextVariantCommandOptions> = {},
): ContextVariantCommandResult {
  if (command.axis !== 'x' && command.axis !== 'y') {
    return failure('invalid-variant-value', `알 수 없는 variant Rail 축입니다: ${String(command.axis)}`)
  }
  return mutateSource(source, {
    ...command,
    command: 'set-context-variant-patch',
    createVariant: true,
    options,
    mutate: (variant) => {
      const rails = [
        ...(variant.auxiliaryRails?.xRails ?? []),
        ...(variant.auxiliaryRails?.yRails ?? []),
      ]
      if (rails.some(({ id }) => id === command.rail.id)) {
        return failure('duplicate-variant-value', `variant Rail ${command.rail.id}이 이미 존재합니다.`)
      }
      variant.auxiliaryRails ??= { xRails: [], yRails: [] }
      const target = command.axis === 'x'
        ? variant.auxiliaryRails.xRails : variant.auxiliaryRails.yRails
      target.push(structuredClone(command.rail))
      return null
    },
  })
}

export function removeVariantAuxiliaryRailV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<RemoveVariantAuxiliaryRailV1Command>,
  options: DeepReadonly<ContextVariantCommandOptions> = {},
): ContextVariantCommandResult {
  if (command.axis !== 'x' && command.axis !== 'y') {
    return failure('invalid-variant-value', `알 수 없는 variant Rail 축입니다: ${String(command.axis)}`)
  }
  const parsed = parseRoleConstructionSourceV1(source, { knownPresetIds: options.knownPresetIds })
  if (!parsed.ok) {
    if (parsed.issues.some(({ message }) => message.includes('preset-coverage-incomplete'))) {
      return failure('preset-coverage-incomplete', 'presetId가 있는 source를 수정하려면 preset catalog coverage가 필요합니다.')
    }
    return failure('invalid-source', `variant command source가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }
  const master = parsed.source.masters.find(({ id }) => id === command.masterId)
  const variant = master?.contextVariants?.find(
    (candidate) => canonicalVariantContextKey(candidate.context) === canonicalVariantContextKey(command.context),
  )
  if (!master) return failure('missing-master', `master ${command.masterId}을 찾을 수 없습니다.`)
  if (!variant) return failure('missing-variant-value', '해당 context variant를 찾을 수 없습니다.')
  const collected = collectVariantRailUsagesV1(parsed.source, {
    masterId: master.id,
    variantId: variant.id,
    axis: command.axis,
    railId: command.railId,
  })
  if (!collected.ok) return failure('missing-variant-value', collected.error.message)
  if (collected.usages.length > 0) {
    return failure(
      'variant-value-in-use',
      `variant Rail ${command.railId}을 ${collected.usages.length}개 참조가 사용 중입니다.`,
      collected.usages,
    )
  }
  return mutateSource(source, {
    ...command,
    command: 'remove-context-variant-patch',
    createVariant: false,
    options,
    mutate: (variant) => {
      const rails = command.axis === 'x'
        ? variant.auxiliaryRails?.xRails : variant.auxiliaryRails?.yRails
      if (!rails?.some(({ id }) => id === command.railId)) {
        return failure('missing-variant-value', `variant Rail ${command.railId}을 찾을 수 없습니다.`)
      }
      if (command.axis === 'x') {
        variant.auxiliaryRails!.xRails = rails.filter(({ id }) => id !== command.railId)
      } else {
        variant.auxiliaryRails!.yRails = rails.filter(({ id }) => id !== command.railId)
      }
      return null
    },
  })
}
