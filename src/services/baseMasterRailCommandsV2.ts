import type {
  BaseMasterRailCommandErrorCode,
  BaseMasterRailCommandResult,
  DeepReadonly,
  JamoPartRole,
  RailPosition,
  SetSevenContextBaseCoreRailV2Command,
  ShapeRail,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

const TARGET_ROLES = ['STANDALONE', 'CH'] as const

function failure(
  code: BaseMasterRailCommandErrorCode,
  message: string,
): BaseMasterRailCommandResult {
  return { ok: false, error: { code, message } }
}

function hasExactOwnKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === allowed.length
    && keys.every((key) => allowed.includes(key))
    && allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isValidPosition(value: unknown): value is { kind: 'absolute'; value: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const position = value as Record<string, unknown>
  return position.kind === 'absolute'
    && hasExactOwnKeys(position, ['kind', 'value'])
    && typeof position.value === 'number'
    && Number.isFinite(position.value)
    && position.value >= 0
    && position.value <= 1
}

function positionKey(position: DeepReadonly<RailPosition>): string {
  return position.kind === 'absolute'
    ? `absolute:${position.value}`
    : `between:${position.fromRailId}:${position.toRailId}:${position.ratio}`
}

function findRail(
  source: DeepReadonly<ValidatedShapeSystemSourceV2>,
  role: JamoPartRole,
  railId: string,
): DeepReadonly<ShapeRail> | undefined {
  const grid = source.roleSources[role].grid
  return [...grid.xRails, ...grid.yRails].find(({ id }) => id === railId)
}

/**
 * 역할 마스터의 독립 소유권은 유지하면서 J-02의 7개 비교 계약에 필요한
 * STANDALONE ㄱ과 CH ㄱ base Rail을 하나의 Shape source transaction으로 갱신한다.
 */
export function setSevenContextBaseCoreRailV2(
  source: unknown,
  command: DeepReadonly<SetSevenContextBaseCoreRailV2Command>,
): BaseMasterRailCommandResult {
  if (!command || typeof command !== 'object' || Array.isArray(command)
    || !hasExactOwnKeys(command, ['transactionId', 'jamoId', 'coreRole', 'position', 'targets'])
    || typeof command.targets !== 'object' || command.targets === null || Array.isArray(command.targets)
    || !hasExactOwnKeys(command.targets, TARGET_ROLES)) {
    return failure('invalid-command', '7문맥 원형 Rail 명령 구조가 유효하지 않습니다.')
  }
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return failure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }
  if (typeof command.jamoId !== 'string' || command.jamoId.trim() === ''
    || typeof command.coreRole !== 'string') {
    return failure('invalid-command', '자소 ID와 core role이 유효해야 합니다.')
  }
  if (!isValidPosition(command.position)) {
    return failure('invalid-position', 'Rail 위치 원본이 유효하지 않습니다.')
  }
  for (const role of TARGET_ROLES) {
    const target = command.targets[role]
    if (!target || typeof target !== 'object' || Array.isArray(target)
      || !hasExactOwnKeys(target, ['masterId', 'railId'])
      || typeof target.masterId !== 'string' || target.masterId.trim() === ''
      || typeof target.railId !== 'string' || target.railId.trim() === '') {
      return failure('invalid-command', `${role} 대상 주소가 유효하지 않습니다.`)
    }
  }

  const parsed = parseShapeSystemSourceV2(source)
  if (!parsed.ok) {
    return failure('invalid-source', `Shape System source가 strict 계약을 통과하지 못했습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }

  let changed = false
  for (const role of TARGET_ROLES) {
    const target = command.targets[role]
    const roleSource = parsed.source.roleSources[role]
    const master = roleSource.masters.find(({ id }) => id === target.masterId)
    if (!master || master.jamoId !== command.jamoId || master.role !== role) {
      return failure('missing-master', `${role} ${command.jamoId} 원형 master를 찾을 수 없습니다.`)
    }
    if (roleSource.masters.some(({ id }) => id !== master.id)) {
      return failure(
        'shared-grid-in-use',
        `${role} base grid를 공유하는 다른 자소가 있어 특정 자소 원형만 안전하게 바꿀 수 없습니다.`,
      )
    }
    const rail = findRail(parsed.source, role, target.railId)
    if (!rail) return failure('stale-target', `${role} Rail ${target.railId}을 찾을 수 없습니다.`)
    if (rail.kind !== 'core' || rail.coreRole !== command.coreRole) {
      return failure('core-role-mismatch', `${role} Rail ID와 core role이 일치하지 않습니다.`)
    }
    if (positionKey(rail.position) !== positionKey(command.position)) changed = true
  }
  if (!changed) return failure('no-op', '두 역할의 base Rail이 이미 같은 위치입니다.')

  const before = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const next = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  for (const role of TARGET_ROLES) {
    const rail = findRail(next as unknown as ValidatedShapeSystemSourceV2, role, command.targets[role].railId)
    if (!rail) return failure('stale-target', `${role} Rail target이 변경되었습니다.`)
    ;(rail as ShapeRail).position = structuredClone(command.position) as RailPosition
  }
  const finalParse = parseShapeSystemSourceV2(next)
  if (!finalParse.ok) {
    return failure('invalid-result', `base Rail 변경 결과가 유효하지 않습니다: ${finalParse.issues.map(({ code }) => code).join(', ')}`)
  }
  const after = structuredClone(finalParse.source) as unknown as ShapeSystemSourceV2
  return {
    ok: true,
    source: finalParse.source,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'set-seven-context-base-core-rail',
      before,
      after,
    },
  }
}
