import {
  ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE,
  type DeepReadonly,
  type RailUsage,
  type RemoveAuxiliaryRailSourceV1Command,
  type RemoveRailCommandErrorCode,
  type RemoveRailSourceV1CommandResult,
  type RoleConstructionScope,
  type ValidatedRoleConstructionSourceV1,
} from '../types'
import { removeAuxiliaryRail } from './masterGridCommands'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'
import { collectRailUsagesV1, hasPresetCoverageGapV1 } from './roleConstructionUsagesV1'

function failure(
  code: RemoveRailCommandErrorCode,
  message: string,
  usages: RailUsage[] = [],
): RemoveRailSourceV1CommandResult {
  return { ok: false, error: { code, message, usages } }
}

function fullParseFailureCode(
  issues: { code: string; message: string }[],
): RemoveRailCommandErrorCode {
  return issues.some(({ code }) => code === 'unknown-field'
    || code === 'unsupported-schema' || code === 'unsupported-version')
    || issues.some(({ code, message }) => code === 'invalid-variants'
      && message.includes('preset-coverage-incomplete'))
    ? 'incomplete-usage-coverage'
    : 'invalid-scope'
}

export function removeAuxiliaryRailSourceV1(
  source: DeepReadonly<ValidatedRoleConstructionSourceV1>,
  command: DeepReadonly<RemoveAuxiliaryRailSourceV1Command>,
): RemoveRailSourceV1CommandResult {
  if (command.usageCoverage !== ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE) {
    return failure('incomplete-usage-coverage', 'RoleConstruction source v1 전체 usage coverage가 필요합니다.')
  }
  const parsed = parseRoleConstructionSourceV1(source)
  if (!parsed.ok) {
    const presetCoverageMissing = parsed.issues.some(({ message }) => message.includes('preset-coverage-incomplete'))
    return failure(
      fullParseFailureCode(parsed.issues),
      presetCoverageMissing
        ? '실제 preset patch universe가 없으므로 presetId가 있는 source의 Rail을 삭제할 수 없습니다.'
        : `삭제 source가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`,
    )
  }
  if (hasPresetCoverageGapV1(parsed.source)) {
    return failure(
      'incomplete-usage-coverage',
      '실제 preset patch universe가 없으므로 presetId가 있는 source의 Rail을 삭제할 수 없습니다.',
    )
  }
  const collected = collectRailUsagesV1(parsed.source, command.railId)
  if (!collected.ok) {
    return failure('missing-rail', collected.error.message)
  }
  const variantUsages = collected.usages.filter(({ kind }) => kind.startsWith('variant-'))
  if (variantUsages.length > 0) {
    return failure(
      'rail-in-use',
      `Rail ${command.railId}을 참조하는 문맥 variant가 있어 삭제할 수 없습니다.`,
      collected.usages,
    )
  }

  const mutable = structuredClone(parsed.source) as RoleConstructionScope
  const variantsByMaster = new Map(
    mutable.masters.map((master) => [master.id, structuredClone(master.contextVariants)] as const),
  )
  for (const master of mutable.masters) delete master.contextVariants
  const baseResult = removeAuxiliaryRail(mutable, {
    transactionId: command.transactionId,
    axis: command.axis,
    railId: command.railId,
    usageCoverage: 'role-construction-v1',
  })
  if (!baseResult.ok) return baseResult
  for (const master of baseResult.scope.masters) {
    const variants = variantsByMaster.get(master.id)
    if (variants !== undefined) master.contextVariants = variants
  }
  const finalParse = parseRoleConstructionSourceV1(baseResult.scope)
  if (!finalParse.ok) {
    return failure(
      'invalid-result',
      `삭제 결과가 full source validation을 통과하지 못했습니다: ${finalParse.issues.map(({ code }) => code).join(', ')}`,
    )
  }
  const before = structuredClone(parsed.source) as RoleConstructionScope
  const after = structuredClone(finalParse.source) as RoleConstructionScope
  return {
    ok: true,
    scope: finalParse.source,
    merges: baseResult.merges,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'delete-auxiliary-rail',
      before,
      after,
    },
  }
}
