import type {
  DeepReadonly,
  GridAreaElement,
  GridCellEdge,
  GridPointRef,
  GridReferenceAddress,
  GridReferenceCommandErrorCode,
  GridReferenceCommandResult,
  JamoConstructionChannelName,
  RailAxis,
  RailUsage,
  RailUsageCollectionResult,
  RebindGridReferenceCommand,
  ResolvedRailGrid,
  RoleConstructionScope,
} from '../types'
import { validateRoleConstructionScope } from './jamoConstruction'

const CHANNEL_NAMES: readonly JamoConstructionChannelName[] = ['main', 'horizontal', 'vertical']

function referenceFailure(
  code: GridReferenceCommandErrorCode,
  message: string,
): GridReferenceCommandResult {
  return { ok: false, error: { code, message } }
}

function railAxis(scope: DeepReadonly<RoleConstructionScope>, railId: string): RailAxis | null {
  if (scope.grid.xRails.some(({ id }) => id === railId)) return 'x'
  if (scope.grid.yRails.some(({ id }) => id === railId)) return 'y'
  return null
}

function edgeAxis(edge: GridCellEdge): RailAxis {
  return edge === 'left' || edge === 'right' ? 'x' : 'y'
}

function cellRailId(cell: DeepReadonly<GridAreaElement['filledCells'][number]>, edge: GridCellEdge): string {
  if (edge === 'left') return cell.leftRailId
  if (edge === 'right') return cell.rightRailId
  if (edge === 'top') return cell.topRailId
  return cell.bottomRailId
}

function matchingNeighbor(
  element: DeepReadonly<GridAreaElement>,
  cell: DeepReadonly<GridAreaElement['filledCells'][number]>,
  edge: GridCellEdge,
): DeepReadonly<GridAreaElement['filledCells'][number]> | undefined {
  return element.filledCells.find((candidate) => {
    if (candidate.id === cell.id) return false
    if (edge === 'left') {
      return candidate.rightRailId === cell.leftRailId
        && candidate.topRailId === cell.topRailId && candidate.bottomRailId === cell.bottomRailId
    }
    if (edge === 'right') {
      return candidate.leftRailId === cell.rightRailId
        && candidate.topRailId === cell.topRailId && candidate.bottomRailId === cell.bottomRailId
    }
    if (edge === 'top') {
      return candidate.bottomRailId === cell.topRailId
        && candidate.leftRailId === cell.leftRailId && candidate.rightRailId === cell.rightRailId
    }
    return candidate.topRailId === cell.bottomRailId
      && candidate.leftRailId === cell.leftRailId && candidate.rightRailId === cell.rightRailId
  })
}

function stableUsageSort(usages: RailUsage[]): RailUsage[] {
  return usages.sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
}

/**
 * 현재 RoleConstructionScope 안의 grid between과 master construction만 수집한다.
 * sparse variant가 추가되기 전까지 이 결과를 store/UI의 강제 삭제에 사용하지 않는다.
 */
export function collectRailUsages(
  scope: DeepReadonly<RoleConstructionScope>,
  railId: string,
): RailUsageCollectionResult {
  const validation = validateRoleConstructionScope(scope)
  if (!validation.ok) {
    return {
      ok: false,
      error: { code: 'invalid-scope', message: `사용처 수집 source가 유효하지 않습니다: ${validation.issues.map(({ code }) => code).join(', ')}` },
    }
  }
  const axis = railAxis(scope, railId)
  if (!axis) return { ok: false, error: { code: 'missing-rail', message: `Rail ${railId}을 찾을 수 없습니다.` } }
  const gridId = scope.grid.id
  const usages: RailUsage[] = []
  const targetRail = (axis === 'x' ? scope.grid.xRails : scope.grid.yRails).find(({ id }) => id === railId)!
  if (targetRail.kind === 'core' && targetRail.coreRole) {
    usages.push({
      kind: 'core-role', gridId, railId, axis, role: scope.grid.role, coreRole: targetRail.coreRole,
    })
  }

  for (const dependent of [...scope.grid.xRails, ...scope.grid.yRails]) {
    if (dependent.position.kind !== 'between') continue
    const dependentAxis = railAxis(scope, dependent.id)!
    if (dependent.position.fromRailId === railId) {
      usages.push({
        kind: 'between-binding', gridId, railId, axis: dependentAxis,
        dependentRailId: dependent.id, endpoint: 'from',
      })
    }
    if (dependent.position.toRailId === railId) {
      usages.push({
        kind: 'between-binding', gridId, railId, axis: dependentAxis,
        dependentRailId: dependent.id, endpoint: 'to',
      })
    }
  }

  const addPointUsage = (input: {
    masterId: string
    channel: JamoConstructionChannelName
    elementId: string
    point: DeepReadonly<GridPointRef>
    slot: Extract<RailUsage, { kind: 'point-reference' }>['slot']
    anchorId?: string
    treatmentId?: string
  }) => {
    if (input.point.xRailId === railId) {
      usages.push({
        kind: 'point-reference', gridId, railId, axis: 'x', masterId: input.masterId,
        channel: input.channel, elementId: input.elementId, referenceId: input.point.id,
        ...(input.anchorId && { anchorId: input.anchorId }),
        ...(input.treatmentId && { treatmentId: input.treatmentId }),
        slot: input.slot,
      })
    }
    if (input.point.yRailId === railId) {
      usages.push({
        kind: 'point-reference', gridId, railId, axis: 'y', masterId: input.masterId,
        channel: input.channel, elementId: input.elementId, referenceId: input.point.id,
        ...(input.anchorId && { anchorId: input.anchorId }),
        ...(input.treatmentId && { treatmentId: input.treatmentId }),
        slot: input.slot,
      })
    }
  }

  for (const master of scope.masters) {
    for (const channelName of CHANNEL_NAMES) {
      const channel = master.construction.channels[channelName]
      if (!channel) continue
      for (const element of channel.elements) {
        if (element.kind === 'centerline') {
          for (const anchor of element.anchors) {
            addPointUsage({ masterId: master.id, channel: channelName, elementId: element.id, anchorId: anchor.id, point: anchor.point, slot: 'anchor-point' })
            if (anchor.handleIn) addPointUsage({ masterId: master.id, channel: channelName, elementId: element.id, anchorId: anchor.id, point: anchor.handleIn, slot: 'handle-in' })
            if (anchor.handleOut) addPointUsage({ masterId: master.id, channel: channelName, elementId: element.id, anchorId: anchor.id, point: anchor.handleOut, slot: 'handle-out' })
          }
          continue
        }
        for (const treatment of element.boundaryTreatments) {
          const prefix = treatment.kind === 'curve' ? 'curve' : 'diagonal'
          addPointUsage({ masterId: master.id, channel: channelName, elementId: element.id, treatmentId: treatment.id, point: treatment.vertex, slot: `${prefix}-vertex` })
          addPointUsage({ masterId: master.id, channel: channelName, elementId: element.id, treatmentId: treatment.id, point: treatment.from, slot: `${prefix}-from` })
          addPointUsage({ masterId: master.id, channel: channelName, elementId: element.id, treatmentId: treatment.id, point: treatment.to, slot: `${prefix}-to` })
        }
        for (const cell of element.filledCells) {
          for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
            if (cellRailId(cell, edge) !== railId) continue
            const neighbor = matchingNeighbor(element, cell, edge)
            usages.push({
              kind: 'cell-boundary', gridId, railId, axis: edgeAxis(edge), masterId: master.id,
              channel: channelName, elementId: element.id, cellId: cell.id, edge,
              ...(neighbor && { neighborCellId: neighbor.id }),
              reason: neighbor ? 'merge-safe' : 'occupancy-differs',
            })
          }
        }
      }
    }
  }
  return { ok: true, usages: stableUsageSort(usages) }
}

export function resolveGridPointRef(
  point: DeepReadonly<GridPointRef>,
  grid: DeepReadonly<ResolvedRailGrid>,
): { id: string; x: number; y: number } | null {
  const x = grid.xRails.find(({ id }) => id === point.xRailId)?.value
  const y = grid.yRails.find(({ id }) => id === point.yRailId)?.value
  return x === undefined || y === undefined ? null : { id: point.id, x, y }
}

function targetAxis(target: DeepReadonly<GridReferenceAddress>): RailAxis {
  if (target.kind === 'cell-edge') return edgeAxis(target.edge)
  return target.axis
}

export function rebindGridReference(
  source: DeepReadonly<RoleConstructionScope>,
  command: DeepReadonly<RebindGridReferenceCommand>,
): GridReferenceCommandResult {
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return referenceFailure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }
  const sourceValidation = validateRoleConstructionScope(source)
  if (!sourceValidation.ok) {
    return referenceFailure('invalid-scope', `rebind source가 유효하지 않습니다: ${sourceValidation.issues.map(({ code }) => code).join(', ')}`)
  }
  if (source.masters.some((master) => master.contextVariants !== undefined
    && (!Array.isArray(master.contextVariants) || master.contextVariants.length > 0))) {
    return referenceFailure(
      'variant-usage-unchecked',
      '문맥 variant usage를 함께 갱신하는 aggregate command가 연결되기 전에는 base 참조를 재연결할 수 없습니다.',
    )
  }
  const target = command.target
  const axis = targetAxis(target)
  const destinationAxis = railAxis(source, command.railId)
  if (!destinationAxis) return referenceFailure('missing-rail', `대상 Rail ${command.railId}을 찾을 수 없습니다.`)
  if (destinationAxis !== axis) return referenceFailure('axis-mismatch', '참조는 같은 축의 Rail로만 재연결할 수 있습니다.')

  const next = structuredClone(source) as RoleConstructionScope
  let matches = 0
  let currentRailId: string | undefined
  const setPointAxis = (point: GridPointRef) => {
    matches += 1
    currentRailId = axis === 'x' ? point.xRailId : point.yRailId
    if (axis === 'x') point.xRailId = command.railId
    else point.yRailId = command.railId
  }

  if (target.kind === 'rail-position') {
    if (target.gridId !== next.grid.id) return referenceFailure('target-not-found', '다른 grid의 Rail position 주소입니다.')
    const owner = (axis === 'x' ? next.grid.xRails : next.grid.yRails)
      .find(({ id }) => id === target.ownerRailId)
    if (owner?.position.kind === 'between') {
      matches = 1
      currentRailId = target.endpoint === 'from'
        ? owner.position.fromRailId
        : owner.position.toRailId
      if (target.endpoint === 'from') owner.position.fromRailId = command.railId
      else owner.position.toRailId = command.railId
    }
  } else {
    for (const master of next.masters) {
      if (master.id !== target.masterId) continue
      const channel = master.construction.channels[target.channel]
      if (!channel) continue
      for (const element of channel.elements) {
        if (element.id !== target.elementId) continue
        if (target.kind === 'centerline-point' && element.kind === 'centerline') {
          const anchor = element.anchors.find(({ id }) => id === target.anchorId)
          const point = target.slot === 'point'
            ? anchor?.point
            : target.slot === 'handle-in' ? anchor?.handleIn : anchor?.handleOut
          if (point?.id === target.referenceId) setPointAxis(point)
        } else if (target.kind === 'boundary-point' && element.kind === 'area') {
          const treatment = element.boundaryTreatments.find(({ id }) => id === target.treatmentId)
          const point = target.slot === 'vertex'
            ? treatment?.vertex
            : target.slot === 'from' ? treatment?.from : treatment?.to
          if (point?.id === target.referenceId) setPointAxis(point)
        } else if (target.kind === 'cell-edge' && element.kind === 'area') {
          const cell = element.filledCells.find(({ id }) => id === target.cellId)
          if (cell) {
            matches = 1
            currentRailId = cellRailId(cell, target.edge)
          }
        }
      }
    }
  }

  if (matches === 0) return referenceFailure('target-not-found', '재연결할 안정 참조 주소를 찾을 수 없습니다.')
  if (matches > 1) return referenceFailure('target-ambiguous', '재연결 주소가 둘 이상과 일치합니다.')
  if (currentRailId === command.railId) return referenceFailure('no-op', '이미 같은 Rail을 참조하고 있습니다.')
  if (target.kind === 'cell-edge') {
    return referenceFailure('requires-cell-retile', '원자 셀 경계는 관련 셀을 함께 재타일링하는 topology command가 필요합니다.')
  }

  const nextValidation = validateRoleConstructionScope(next)
  if (!nextValidation.ok) {
    return referenceFailure('invalid-result', `재연결 결과가 유효하지 않습니다: ${nextValidation.issues.map(({ code }) => code).join(', ')}`)
  }
  const before = structuredClone(source) as RoleConstructionScope
  const after = structuredClone(next)
  return {
    ok: true,
    scope: next,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'rebind-grid-reference',
      before,
      after,
    },
  }
}
