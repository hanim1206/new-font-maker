import type {
  DeepReadonly,
  GridAreaElement,
  GridCellRef,
  GridCellRetileCommandResult,
  GridCellRetileErrorCode,
  GridReferenceAddress,
  RetileGridCellEdgeCommand,
  RoleConstructionScope,
} from '../types'
import { createGridCellId, validateRoleConstructionScope } from './jamoConstruction'

type CellEdgeAddress = Extract<GridReferenceAddress, { kind: 'cell-edge' }>

function failure(
  code: GridCellRetileErrorCode,
  message: string,
  cellId?: string,
): GridCellRetileCommandResult {
  return { ok: false, error: { code, message, ...(cellId && { cellId }) } }
}

function edgeAxis(edge: CellEdgeAddress['edge']): 'x' | 'y' {
  return edge === 'left' || edge === 'right' ? 'x' : 'y'
}

function edgeRailId(cell: DeepReadonly<GridCellRef>, edge: CellEdgeAddress['edge']): string {
  if (edge === 'left') return cell.leftRailId
  if (edge === 'right') return cell.rightRailId
  if (edge === 'top') return cell.topRailId
  return cell.bottomRailId
}

function oppositeRailId(cell: DeepReadonly<GridCellRef>, edge: CellEdgeAddress['edge']): string {
  if (edge === 'left') return cell.rightRailId
  if (edge === 'right') return cell.leftRailId
  if (edge === 'top') return cell.bottomRailId
  return cell.topRailId
}

function matchingNeighbor(
  element: DeepReadonly<GridAreaElement>,
  cell: DeepReadonly<GridCellRef>,
  edge: CellEdgeAddress['edge'],
): DeepReadonly<GridCellRef> | undefined {
  return element.filledCells.find((candidate) => {
    if (candidate.id === cell.id) return false
    if (edge === 'left') return candidate.rightRailId === cell.leftRailId
      && candidate.topRailId === cell.topRailId && candidate.bottomRailId === cell.bottomRailId
    if (edge === 'right') return candidate.leftRailId === cell.rightRailId
      && candidate.topRailId === cell.topRailId && candidate.bottomRailId === cell.bottomRailId
    if (edge === 'top') return candidate.bottomRailId === cell.topRailId
      && candidate.leftRailId === cell.leftRailId && candidate.rightRailId === cell.rightRailId
    return candidate.topRailId === cell.bottomRailId
      && candidate.leftRailId === cell.leftRailId && candidate.rightRailId === cell.rightRailId
  })
}

function boundsKey(cell: Omit<GridCellRef, 'id'>): string {
  return [cell.leftRailId, cell.rightRailId, cell.topRailId, cell.bottomRailId].join('\u0000')
}

function createRetiledBounds(
  cell: DeepReadonly<GridCellRef>,
  edge: CellEdgeAddress['edge'],
  railIds: readonly string[],
  destinationIndex: number,
  oppositeIndex: number,
): Array<Omit<GridCellRef, 'id'>> {
  const start = Math.min(destinationIndex, oppositeIndex)
  const end = Math.max(destinationIndex, oppositeIndex)
  const result: Array<Omit<GridCellRef, 'id'>> = []
  for (let index = start; index < end; index += 1) {
    if (edge === 'left' || edge === 'right') {
      result.push({
        leftRailId: railIds[index],
        rightRailId: railIds[index + 1],
        topRailId: cell.topRailId,
        bottomRailId: cell.bottomRailId,
      })
    } else {
      result.push({
        leftRailId: cell.leftRailId,
        rightRailId: cell.rightRailId,
        topRailId: railIds[index],
        bottomRailId: railIds[index + 1],
      })
    }
  }
  return result
}

export function retileGridCellEdge(
  source: DeepReadonly<RoleConstructionScope>,
  command: DeepReadonly<RetileGridCellEdgeCommand>,
): GridCellRetileCommandResult {
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return failure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }
  const target = command.target as Partial<CellEdgeAddress> | undefined
  if (!target || target.kind !== 'cell-edge'
    || typeof target.masterId !== 'string'
    || typeof target.channel !== 'string'
    || typeof target.elementId !== 'string'
    || typeof target.cellId !== 'string'
    || !['left', 'right', 'top', 'bottom'].includes(String(target.edge))) {
    return failure('invalid-target', '완전한 안정 cell-edge 주소가 필요합니다.')
  }
  const sourceValidation = validateRoleConstructionScope(source)
  if (!sourceValidation.ok) {
    return failure('invalid-scope', `retile source가 유효하지 않습니다: ${sourceValidation.issues.map(({ code }) => code).join(', ')}`)
  }
  if (source.masters.some((master) => master.contextVariants !== undefined
    && (!Array.isArray(master.contextVariants) || master.contextVariants.length > 0))) {
    return failure(
      'variant-usage-unchecked',
      '문맥 variant usage를 함께 재타일링하는 aggregate command가 필요합니다.',
      target.cellId,
    )
  }
  const stableTarget = target as CellEdgeAddress
  const axis = edgeAxis(stableTarget.edge)
  const rails = axis === 'x' ? source.grid.xRails : source.grid.yRails
  const otherRails = axis === 'x' ? source.grid.yRails : source.grid.xRails
  const destinationIndex = rails.findIndex(({ id }) => id === command.railId)
  if (destinationIndex < 0) {
    return failure(
      otherRails.some(({ id }) => id === command.railId) ? 'axis-mismatch' : 'missing-rail',
      `대상 ${axis.toUpperCase()} Rail ${command.railId}을 찾을 수 없습니다.`,
    )
  }

  const next = structuredClone(source) as RoleConstructionScope
  let matches = 0
  let targetElement: GridAreaElement | undefined
  let targetCell: GridCellRef | undefined
  let targetCellIndex = -1
  for (const master of next.masters) {
    if (master.id !== stableTarget.masterId) continue
    const channel = master.construction.channels[stableTarget.channel]
    if (!channel) continue
    for (const element of channel.elements) {
      if (element.id !== stableTarget.elementId || element.kind !== 'area') continue
      const index = element.filledCells.findIndex(({ id }) => id === stableTarget.cellId)
      if (index < 0) continue
      matches += 1
      targetElement = element
      targetCell = element.filledCells[index]
      targetCellIndex = index
    }
  }
  if (matches === 0 || !targetElement || !targetCell) {
    return failure('target-not-found', '재타일링할 안정 cell-edge 주소를 찾을 수 없습니다.', stableTarget.cellId)
  }
  if (matches > 1) return failure('target-ambiguous', 'cell-edge 주소가 둘 이상과 일치합니다.', stableTarget.cellId)
  const currentRailId = edgeRailId(targetCell, stableTarget.edge)
  if (currentRailId === command.railId) return failure('no-op', '이미 같은 Rail을 참조하고 있습니다.', stableTarget.cellId)
  if (matchingNeighbor(targetElement, targetCell, stableTarget.edge)) {
    return failure('internal-cell-seam', '채워진 셀 사이의 내부 seam은 개별 경계로 이동할 수 없습니다.', stableTarget.cellId)
  }

  const oppositeId = oppositeRailId(targetCell, stableTarget.edge)
  const oppositeIndex = rails.findIndex(({ id }) => id === oppositeId)
  if (oppositeIndex < 0) return failure('invalid-scope', '반대쪽 셀 경계 Rail을 찾을 수 없습니다.', stableTarget.cellId)
  const validDirection = stableTarget.edge === 'left' || stableTarget.edge === 'top'
    ? destinationIndex <= oppositeIndex
    : destinationIndex >= oppositeIndex
  if (!validDirection) {
    return failure('crosses-opposite-edge', '대상 Rail이 셀의 반대쪽 경계를 넘어갑니다.', stableTarget.cellId)
  }

  const candidateBounds = createRetiledBounds(
    targetCell,
    stableTarget.edge,
    rails.map(({ id }) => id),
    destinationIndex,
    oppositeIndex,
  )
  const existingByBounds = new Map(
    targetElement.filledCells
      .filter(({ id }) => id !== targetCell!.id)
      .map((cell) => [boundsKey(cell), cell] as const),
  )
  const existingById = new Map(
    targetElement.filledCells
      .filter(({ id }) => id !== targetCell!.id)
      .map((cell) => [cell.id, cell] as const),
  )
  const generated: GridCellRef[] = []
  const reusedCellIds: string[] = []
  for (const bounds of candidateBounds) {
    const existing = existingByBounds.get(boundsKey(bounds))
    if (existing) {
      reusedCellIds.push(existing.id)
      continue
    }
    const id = createGridCellId({
      masterId: stableTarget.masterId,
      channel: stableTarget.channel,
      elementId: stableTarget.elementId,
      ...bounds,
    })
    const collision = existingById.get(id)
    if (collision && boundsKey(collision) !== boundsKey(bounds)) {
      return failure('cell-id-collision', `재타일링 셀 ID ${id}가 충돌합니다.`, id)
    }
    generated.push({ id, ...bounds })
  }
  targetElement.filledCells.splice(targetCellIndex, 1, ...generated)
  const nextValidation = validateRoleConstructionScope(next)
  if (!nextValidation.ok) {
    return failure('invalid-result', `재타일링 결과가 유효하지 않습니다: ${nextValidation.issues.map(({ code }) => code).join(', ')}`, stableTarget.cellId)
  }
  const before = structuredClone(source) as RoleConstructionScope
  const after = structuredClone(next)
  return {
    ok: true,
    scope: next,
    audit: {
      masterId: stableTarget.masterId,
      channel: stableTarget.channel,
      elementId: stableTarget.elementId,
      sourceCellId: stableTarget.cellId,
      generatedCellIds: generated.map(({ id }) => id),
      reusedCellIds,
    },
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'retile-grid-cell-edge',
      before,
      after,
    },
  }
}
