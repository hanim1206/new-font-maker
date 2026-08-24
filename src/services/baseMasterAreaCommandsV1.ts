import type {
  BaseMasterAreaCommandErrorCode,
  BaseMasterAreaCommandResult,
  BaseMasterAreaTargetV1,
  DeepReadonly,
  GridCellRef,
  JamoRoleMaster,
  SetBaseMasterAreaCellsV1Command,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { createGridCellId } from './jamoConstruction'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

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

function isValidCell(value: unknown): value is Omit<GridCellRef, 'id'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactOwnKeys(value, ['leftRailId', 'rightRailId', 'topRailId', 'bottomRailId'])) return false
  return Object.values(value).every((railId) => typeof railId === 'string' && railId.trim() !== '')
}

function isValidTarget(value: unknown): value is BaseMasterAreaTargetV1 {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && hasExactOwnKeys(value as object, ['masterId', 'elementId'])
    && typeof (value as BaseMasterAreaTargetV1).masterId === 'string'
    && (value as BaseMasterAreaTargetV1).masterId.trim() !== ''
    && typeof (value as BaseMasterAreaTargetV1).elementId === 'string'
    && (value as BaseMasterAreaTargetV1).elementId.trim() !== ''
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
  target: DeepReadonly<BaseMasterAreaTargetV1>,
  cell: DeepReadonly<Omit<GridCellRef, 'id'>>,
): GridCellRef {
  return {
    id: createGridCellId({
      masterId: target.masterId,
      channel: 'main',
      elementId: target.elementId,
      ...cell,
    }),
    ...structuredClone(cell),
  }
}

function findTargetMaster(
  source: DeepReadonly<ValidatedShapeSystemSourceV2>,
  jamoId: string,
  masterId: string,
) {
  const master = source.roleSources.CH.masters.find(({ id }) => id === masterId)
  return master?.jamoId === jamoId && master.role === 'CH' ? master : undefined
}

/**
 * J-02 CH 원형의 stable primary area가 소유한 원자 셀 점유 집합을 한 transaction으로
 * 추가하거나 제거한다. 마지막 셀을 제거해도 area element 자체는 유지한다.
 */
export function setBaseMasterAreaCellsV1(
  source: unknown,
  command: DeepReadonly<SetBaseMasterAreaCellsV1Command>,
): BaseMasterAreaCommandResult {
  if (!command || typeof command !== 'object' || Array.isArray(command)
    || !hasExactOwnKeys(command, ['transactionId', 'mode', 'jamoId', 'target', 'cells'])
    || (command.mode !== 'fill' && command.mode !== 'erase')
    || typeof command.jamoId !== 'string' || command.jamoId.trim() === ''
    || !isValidTarget(command.target)
    || !Array.isArray(command.cells) || command.cells.length === 0
    || command.cells.some((cell) => !isValidCell(cell))) {
    return failure('invalid-command', '원형 면 점유 명령 구조가 유효하지 않습니다.')
  }
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return failure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }

  const parsed = parseShapeSystemSourceV2(source)
  if (!parsed.ok) {
    return failure('invalid-source', `Shape System source가 strict 계약을 통과하지 못했습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }

  const requestedKeys = new Set(command.cells.map((cell) => JSON.stringify(cell)))
  if (requestedKeys.size !== command.cells.length) {
    return failure('invalid-command', '한 명령에서 같은 원자 셀을 중복 지정할 수 없습니다.')
  }
  const target = command.target
  const master = findTargetMaster(parsed.source, command.jamoId, target.masterId)
  if (!master) return failure('missing-master', `CH ${command.jamoId} 원형 master를 찾을 수 없습니다.`)
  const channel = master.construction.channels.main
  if (!channel || channel.role !== 'CH' || channel.gridId !== parsed.source.roleSources.CH.grid.id) {
    return failure('stale-target', 'CH 원형 main channel 소유권이 일치하지 않습니다.')
  }
  const element = channel.elements.find(({ id }) => id === target.elementId)
  if (element && (element.kind !== 'area' || element.boundaryTreatments.length !== 0)) {
    return failure('unsupported-area-shape', '곡률·사선이 있는 면은 현재 점유 도구로 바꿀 수 없습니다.')
  }
  if (command.mode === 'erase' && !element) {
    return failure('stale-target', `CH 면 요소 ${target.elementId}를 찾을 수 없습니다.`)
  }
  if (command.mode === 'fill') {
    const occupiedByOtherArea = command.cells.some((requested) => channel.elements.some((candidate) =>
      candidate.kind === 'area' && candidate.id !== target.elementId
      && candidate.filledCells.some((cell) => sameCell(cell, requested))))
    if (occupiedByOtherArea) return failure('cell-occupied', '목적 셀은 이미 다른 면이 점유하고 있습니다.')
  }
  const existingCells = element?.kind === 'area' ? element.filledCells : []
  const changed = command.mode === 'fill'
    ? command.cells.some((requested) => !existingCells.some((cell) => sameCell(cell, requested)))
    : command.cells.some((requested) => existingCells.some((cell) => sameCell(cell, requested)))
  if (!changed) return failure('no-op', '점유 집합이 이미 요청한 상태입니다.')
  if (command.mode === 'erase') {
    const removedIds = new Set(existingCells
      .filter((cell) => command.cells.some((requested) => sameCell(cell, requested)))
      .map(({ id }) => id))
    const variantUsesRemovedCell = master.contextVariants?.some((variant) =>
      variant.referenceOverrides?.some(({ target: address }) => address.elementId === target.elementId
        && address.kind === 'cell-edge' && removedIds.has(address.cellId)),
    ) ?? false
    if (variantUsesRemovedCell) {
      return failure('variant-in-use', '비울 셀을 참조하는 문맥 override가 있어 변경할 수 없습니다.')
    }
  }

  const before = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const next = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const nextMaster = findTargetMaster(
    next as unknown as ValidatedShapeSystemSourceV2,
    command.jamoId,
    target.masterId,
  )
  if (!nextMaster) return failure('stale-target', 'CH 면 target이 변경되었습니다.')
  const nextChannel = (nextMaster as unknown as JamoRoleMaster).construction.channels.main
  if (!nextChannel) return failure('stale-target', 'CH main channel이 변경되었습니다.')
  let nextElement = nextChannel.elements.find(({ id }) => id === target.elementId)
  if (!nextElement) {
    nextElement = { id: target.elementId, kind: 'area', filledCells: [], boundaryTreatments: [] }
    nextChannel.elements.push(nextElement)
  }
  if (nextElement.kind !== 'area') return failure('stale-target', 'CH 면 target이 변경되었습니다.')
  nextElement.filledCells = command.mode === 'fill'
    ? [...nextElement.filledCells, ...command.cells
      .filter((requested) => !nextElement!.filledCells.some((cell) => sameCell(cell, requested)))
      .map((cell) => createCell(target, cell))]
    : nextElement.filledCells.filter((cell) => !command.cells.some((requested) => sameCell(cell, requested)))

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
      command: 'set-base-master-area-cells',
      before,
      after,
    },
  }
}
