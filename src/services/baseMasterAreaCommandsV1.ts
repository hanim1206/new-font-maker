import type {
  BaseMasterAreaCommandErrorCode,
  BaseMasterAreaCommandResult,
  BaseMasterAreaCellTargetV1,
  DeepReadonly,
  GridCellRef,
  JamoPartRole,
  JamoRoleMaster,
  SetSevenContextBaseAreaCellV1Command,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { createGridCellId } from './jamoConstruction'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

const TARGET_ROLES = ['STANDALONE', 'CH'] as const

function failure(
  code: BaseMasterAreaCommandErrorCode,
  message: string,
): BaseMasterAreaCommandResult {
  return { ok: false, error: { code, message } }
}

function hasExactOwnKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === allowed.length
    && keys.every((key) => allowed.includes(key))
    && allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isValidCell(value: unknown): value is BaseMasterAreaCellTargetV1['cell'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactOwnKeys(value, ['leftRailId', 'rightRailId', 'topRailId', 'bottomRailId'])) return false
  return Object.values(value).every((railId) => typeof railId === 'string' && railId.trim() !== '')
}

function isValidTarget(value: unknown): value is BaseMasterAreaCellTargetV1 {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && hasExactOwnKeys(value as object, ['masterId', 'elementId', 'cell'])
    && typeof (value as BaseMasterAreaCellTargetV1).masterId === 'string'
    && (value as BaseMasterAreaCellTargetV1).masterId.trim() !== ''
    && typeof (value as BaseMasterAreaCellTargetV1).elementId === 'string'
    && (value as BaseMasterAreaCellTargetV1).elementId.trim() !== ''
    && isValidCell((value as BaseMasterAreaCellTargetV1).cell)
}

function sameCell(
  left: DeepReadonly<Omit<GridCellRef, 'id'>>,
  right: DeepReadonly<Omit<GridCellRef, 'id'>>,
): boolean {
  return left.leftRailId === right.leftRailId
    && left.rightRailId === right.rightRailId
    && left.topRailId === right.topRailId
    && left.bottomRailId === right.bottomRailId
}

function createCell(
  target: DeepReadonly<BaseMasterAreaCellTargetV1>,
): GridCellRef {
  return {
    id: createGridCellId({
      masterId: target.masterId,
      channel: 'main',
      elementId: target.elementId,
      ...target.cell,
    }),
    ...structuredClone(target.cell),
  }
}

function findTargetMaster(
  source: DeepReadonly<ValidatedShapeSystemSourceV2>,
  role: JamoPartRole,
  jamoId: string,
  masterId: string,
) {
  const master = source.roleSources[role].masters.find(({ id }) => id === masterId)
  return master?.jamoId === jamoId && master.role === role ? master : undefined
}

/**
 * J-02의 독립 STANDALONE·CH 원형에 같은 의미의 단일 원자 셀 면을 한 transaction으로
 * 생성하거나 이동한다. 대상은 master/element stable ID로만 찾고 배열 순서를 사용하지 않는다.
 */
export function setSevenContextBaseAreaCellV1(
  source: unknown,
  command: DeepReadonly<SetSevenContextBaseAreaCellV1Command>,
): BaseMasterAreaCommandResult {
  if (!command || typeof command !== 'object' || Array.isArray(command)
    || !hasExactOwnKeys(command, ['transactionId', 'mode', 'jamoId', 'targets'])
    || (command.mode !== 'create' && command.mode !== 'move')
    || typeof command.jamoId !== 'string' || command.jamoId.trim() === ''
    || !command.targets || typeof command.targets !== 'object' || Array.isArray(command.targets)
    || !hasExactOwnKeys(command.targets, TARGET_ROLES)
    || TARGET_ROLES.some((role) => !isValidTarget(command.targets[role]))) {
    return failure('invalid-command', '7문맥 원형 면 명령 구조가 유효하지 않습니다.')
  }
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return failure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }

  const parsed = parseShapeSystemSourceV2(source)
  if (!parsed.ok) {
    return failure('invalid-source', `Shape System source가 strict 계약을 통과하지 못했습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }

  let changed = false
  for (const role of TARGET_ROLES) {
    const target = command.targets[role]
    const master = findTargetMaster(parsed.source, role, command.jamoId, target.masterId)
    if (!master) return failure('missing-master', `${role} ${command.jamoId} 원형 master를 찾을 수 없습니다.`)
    const channel = master.construction.channels.main
    if (!channel || channel.role !== role || channel.gridId !== parsed.source.roleSources[role].grid.id) {
      return failure('stale-target', `${role} 원형 main channel 소유권이 일치하지 않습니다.`)
    }
    const element = channel.elements.find(({ id }) => id === target.elementId)
    if (command.mode === 'create' && element) {
      return failure('target-exists', `${role} 면 요소 ${target.elementId}가 이미 존재합니다.`)
    }
    if (command.mode === 'move') {
      if (!element) return failure('stale-target', `${role} 면 요소 ${target.elementId}를 찾을 수 없습니다.`)
      if (element.kind !== 'area' || element.filledCells.length !== 1 || element.boundaryTreatments.length !== 0) {
        return failure('unsupported-area-shape', '첫 면 이동 흐름은 곡률·사선이 없는 단일 원자 셀만 지원합니다.')
      }
      const variantUsesTarget = master.contextVariants?.some((variant) =>
        variant.referenceOverrides?.some(({ target: address }) => address.elementId === target.elementId),
      ) ?? false
      if (variantUsesTarget) {
        return failure('variant-in-use', `${role} 면 요소를 참조하는 문맥 override가 있어 이동할 수 없습니다.`)
      }
      if (!sameCell(element.filledCells[0], target.cell)) changed = true
    } else {
      changed = true
    }
    const occupied = channel.elements.some((candidate) => candidate.kind === 'area'
      && candidate.id !== target.elementId
      && candidate.filledCells.some((cell) => sameCell(cell, target.cell)))
    if (occupied) return failure('cell-occupied', `${role} 목적 셀은 이미 다른 면이 점유하고 있습니다.`)
  }
  if (!changed) return failure('no-op', '두 역할의 면이 이미 목적 셀에 있습니다.')

  const before = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const next = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  for (const role of TARGET_ROLES) {
    const target = command.targets[role]
    const master = findTargetMaster(
      next as unknown as ValidatedShapeSystemSourceV2,
      role,
      command.jamoId,
      target.masterId,
    )
    if (!master) return failure('stale-target', `${role} 면 target이 변경되었습니다.`)
    const channel = (master as unknown as JamoRoleMaster).construction.channels.main
    if (!channel) return failure('stale-target', `${role} main channel이 변경되었습니다.`)
    const elements = channel.elements
    if (command.mode === 'create') {
      elements.push({
        id: target.elementId,
        kind: 'area',
        filledCells: [createCell(target)],
        boundaryTreatments: [],
      })
      continue
    }
    const element = elements.find(({ id }) => id === target.elementId)
    if (!element || element.kind !== 'area') return failure('stale-target', `${role} 면 target이 변경되었습니다.`)
    element.filledCells = [createCell(target)]
  }

  const finalParse = parseShapeSystemSourceV2(next)
  if (!finalParse.ok) {
    return failure('invalid-result', `원형 면 변경 결과가 유효하지 않습니다: ${finalParse.issues.map(({ code }) => code).join(', ')}`)
  }
  const after = structuredClone(finalParse.source) as unknown as ShapeSystemSourceV2
  return {
    ok: true,
    source: finalParse.source,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: command.mode === 'create'
        ? 'create-seven-context-base-area-cell'
        : 'move-seven-context-base-area-cell',
      before,
      after,
    },
  }
}
