import type {
  AddAuxiliaryRailCommand,
  DeepReadonly,
  GridCellRef,
  GridCellMergeAudit,
  GridCellSplitAudit,
  JamoConstructionChannelName,
  MasterGridCommandErrorCode,
  MasterGridCommandResult,
  RailUsage,
  RemoveAuxiliaryRailCommand,
  RemoveRailCommandErrorCode,
  RemoveRailCommandResult,
  RoleConstructionScope,
  SourceCommandTransaction,
} from '../types'
import { createGridCellId, validateRoleConstructionScope } from './jamoConstruction'
import { collectRailUsages } from './gridReferences'
import { resolveRailGrid } from './railGridResolver'

const GAP_EPSILON = Number.EPSILON * 16

function failure(
  code: MasterGridCommandErrorCode,
  message: string,
  details: { railId?: string; cellId?: string } = {},
): MasterGridCommandResult {
  return { ok: false, error: { code, message, ...details } }
}

function cloneScope(scope: DeepReadonly<RoleConstructionScope>): RoleConstructionScope {
  return structuredClone(scope) as RoleConstructionScope
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function hasCompleteRoleConstructionV1Universe(scope: DeepReadonly<RoleConstructionScope>): boolean {
  if (!hasOnlyKeys(scope, ['schema', 'version', 'grid', 'masters'])) return false
  if (!hasOnlyKeys(scope.grid, ['id', 'role', 'xRails', 'yRails', 'snapStep', 'minGap'])) return false
  for (const rail of [...scope.grid.xRails, ...scope.grid.yRails]) {
    if (!hasOnlyKeys(rail, ['id', 'kind', 'coreRole', 'position'])) return false
    if (rail.position.kind === 'absolute') {
      if (!hasOnlyKeys(rail.position, ['kind', 'value'])) return false
    } else if (!hasOnlyKeys(rail.position, ['kind', 'fromRailId', 'toRailId', 'ratio'])) return false
  }
  for (const master of scope.masters) {
    if (!hasOnlyKeys(master, ['id', 'jamoId', 'role', 'construction'])
      || !hasOnlyKeys(master.construction, ['channels'])
      || !hasOnlyKeys(master.construction.channels, ['main', 'horizontal', 'vertical'])) return false
    for (const channel of Object.values(master.construction.channels)) {
      if (!channel) continue
      if (!hasOnlyKeys(channel, ['role', 'gridId', 'elements'])) return false
      for (const element of channel.elements) {
        if (element.kind === 'centerline') {
          if (!hasOnlyKeys(element, ['id', 'kind', 'anchors', 'closed', 'thickness', 'linecap', 'linejoin'])) return false
          for (const anchor of element.anchors) {
            if (!hasOnlyKeys(anchor, ['id', 'point', 'handleIn', 'handleOut'])) return false
            for (const point of [anchor.point, anchor.handleIn, anchor.handleOut]) {
              if (point && !hasOnlyKeys(point, ['id', 'xRailId', 'yRailId'])) return false
            }
          }
          continue
        }
        if (!hasOnlyKeys(element, ['id', 'kind', 'filledCells', 'boundaryTreatments'])) return false
        for (const cell of element.filledCells) {
          if (!hasOnlyKeys(cell, ['id', 'leftRailId', 'rightRailId', 'topRailId', 'bottomRailId'])) return false
        }
        for (const treatment of element.boundaryTreatments) {
          const allowed = treatment.kind === 'curve'
            ? ['id', 'kind', 'vertex', 'from', 'to', 'tension']
            : ['id', 'kind', 'vertex', 'from', 'to']
          if (!hasOnlyKeys(treatment, allowed)) return false
          for (const point of [treatment.vertex, treatment.from, treatment.to]) {
            if (!hasOnlyKeys(point, ['id', 'xRailId', 'yRailId'])) return false
          }
        }
      }
    }
  }
  return true
}

function removeFailure(
  code: RemoveRailCommandErrorCode,
  message: string,
  usages: RailUsage[] = [],
): RemoveRailCommandResult {
  return { ok: false, error: { code, message, usages } }
}

function splitCell(
  cell: GridCellRef,
  input: {
    axis: 'x' | 'y'
    railId: string
    masterId: string
    channel: JamoConstructionChannelName
    elementId: string
  },
): [GridCellRef, GridCellRef] {
  const first: Omit<GridCellRef, 'id'> = input.axis === 'x'
    ? { ...cell, rightRailId: input.railId }
    : { ...cell, bottomRailId: input.railId }
  const second: Omit<GridCellRef, 'id'> = input.axis === 'x'
    ? { ...cell, leftRailId: input.railId }
    : { ...cell, topRailId: input.railId }
  const withId = (value: Omit<GridCellRef, 'id'>): GridCellRef => ({
    ...value,
    id: createGridCellId({
      masterId: input.masterId,
      channel: input.channel,
      elementId: input.elementId,
      ...value,
    }),
  })
  return [withId(first), withId(second)]
}

export function undoSourceTransaction<T>(transaction: DeepReadonly<SourceCommandTransaction<T>>): T {
  return structuredClone(transaction.before) as T
}

export function redoSourceTransaction<T>(transaction: DeepReadonly<SourceCommandTransaction<T>>): T {
  return structuredClone(transaction.after) as T
}

export function addAuxiliaryRailAndSplitCells(
  source: DeepReadonly<RoleConstructionScope>,
  command: DeepReadonly<AddAuxiliaryRailCommand>,
): MasterGridCommandResult {
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return failure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }
  const sourceValidation = validateRoleConstructionScope(source)
  if (!sourceValidation.ok) {
    return failure('invalid-scope', `명령 전 source가 유효하지 않습니다: ${sourceValidation.issues.map(({ code }) => code).join(', ')}`)
  }
  if (source.masters.some((master) => master.contextVariants !== undefined
    && (!Array.isArray(master.contextVariants) || master.contextVariants.length > 0))) {
    return failure(
      'variant-usage-unchecked',
      '문맥 variant target과 함께 분할하는 aggregate command가 연결되기 전에는 base Rail을 추가할 수 없습니다.',
    )
  }
  if (command.axis !== 'x' && command.axis !== 'y') {
    return failure('invalid-axis', `알 수 없는 Rail 축입니다: ${String(command.axis)}`)
  }
  if (typeof command.railId !== 'string' || command.railId.trim() === '') {
    return failure('invalid-rail-id', '새 Rail ID는 비어 있지 않아야 합니다.', { railId: command.railId })
  }
  const allRailIds = new Set([...source.grid.xRails, ...source.grid.yRails].map(({ id }) => id))
  if (allRailIds.has(command.railId)) {
    return failure('duplicate-rail-id', `Rail ID ${command.railId}가 이미 존재합니다.`, { railId: command.railId })
  }
  if (!Number.isFinite(command.ratio) || command.ratio <= 0 || command.ratio >= 1) {
    return failure('invalid-ratio', '보조 Rail ratio는 0과 1 사이여야 합니다.', { railId: command.railId })
  }

  const rails = command.axis === 'x' ? source.grid.xRails : source.grid.yRails
  const otherRails = command.axis === 'x' ? source.grid.yRails : source.grid.xRails
  const fromIndex = rails.findIndex(({ id }) => id === command.fromRailId)
  const toIndex = rails.findIndex(({ id }) => id === command.toRailId)
  if (fromIndex < 0 || toIndex < 0) {
    const crossAxis = otherRails.some(({ id }) => id === command.fromRailId || id === command.toRailId)
    return failure(
      crossAxis ? 'cross-axis-reference' : 'missing-reference',
      crossAxis ? '보조 Rail의 두 기준은 같은 축이어야 합니다.' : '보조 Rail이 참조하는 기존 Rail을 찾을 수 없습니다.',
      { railId: command.railId },
    )
  }
  if (toIndex !== fromIndex + 1) {
    return failure('non-adjacent-reference', '보조 Rail은 현재 인접한 두 Rail 사이에만 추가할 수 있습니다.', { railId: command.railId })
  }

  const resolved = resolveRailGrid(source.grid)
  if (!resolved.ok) return failure('invalid-scope', '명령 전 RailGrid를 해석할 수 없습니다.')
  const resolvedRails = command.axis === 'x' ? resolved.grid.xRails : resolved.grid.yRails
  const from = resolvedRails.find(({ id }) => id === command.fromRailId)?.value
  const to = resolvedRails.find(({ id }) => id === command.toRailId)?.value
  if (from === undefined || to === undefined) return failure('missing-reference', '보조 Rail 기준 좌표를 해석할 수 없습니다.')
  const value = from + (to - from) * command.ratio
  if (value - from + GAP_EPSILON < source.grid.minGap || to - value + GAP_EPSILON < source.grid.minGap) {
    return failure('min-gap-violation', '새 Rail이 최소 간격을 만족하지 않습니다.', { railId: command.railId })
  }

  const before = cloneScope(source)
  const next = cloneScope(source)
  const nextRails = command.axis === 'x' ? next.grid.xRails : next.grid.yRails
  nextRails.splice(toIndex, 0, {
    id: command.railId,
    kind: 'auxiliary',
    position: {
      kind: 'between',
      fromRailId: command.fromRailId,
      toRailId: command.toRailId,
      ratio: command.ratio,
    },
  })

  const existingCellIds = new Set<string>()
  for (const master of next.masters) {
    for (const channel of Object.values(master.construction.channels)) {
      for (const element of channel?.elements ?? []) {
        if (element.kind !== 'area') continue
        for (const cell of element.filledCells) existingCellIds.add(cell.id)
      }
    }
  }
  const generatedIds = new Set<string>()
  const splits: GridCellSplitAudit[] = []
  let collisionCellId: string | undefined
  for (const master of next.masters) {
    for (const [channelName, channel] of Object.entries(master.construction.channels) as Array<[
      JamoConstructionChannelName,
      NonNullable<(typeof master.construction.channels)[JamoConstructionChannelName]>,
    ]>) {
      if (!channel) continue
      for (const element of channel.elements) {
        if (element.kind !== 'area') continue
        element.filledCells = element.filledCells.flatMap((cell) => {
          const crossesInsertedRail = command.axis === 'x'
            ? cell.leftRailId === command.fromRailId && cell.rightRailId === command.toRailId
            : cell.topRailId === command.fromRailId && cell.bottomRailId === command.toRailId
          if (!crossesInsertedRail) return [cell]
          const children = splitCell(cell, {
            axis: command.axis,
            railId: command.railId,
            masterId: master.id,
            channel: channelName,
            elementId: element.id,
          })
          for (const child of children) {
            if (existingCellIds.has(child.id) || generatedIds.has(child.id)) {
              collisionCellId = child.id
              return [cell]
            }
            generatedIds.add(child.id)
          }
          splits.push({
            masterId: master.id,
            channel: channelName,
            elementId: element.id,
            parentCellId: cell.id,
            childCellIds: [children[0].id, children[1].id],
          })
          return children
        })
      }
    }
  }
  if (collisionCellId) {
    return failure(
      'child-cell-id-collision',
      `분할 셀 ID ${collisionCellId}가 충돌합니다.`,
      { cellId: collisionCellId },
    )
  }

  const nextValidation = validateRoleConstructionScope(next)
  if (!nextValidation.ok) {
    return failure('invalid-result', `명령 결과가 유효하지 않습니다: ${nextValidation.issues.map(({ code }) => code).join(', ')}`)
  }
  const after = cloneScope(next)
  return {
    ok: true,
    scope: next,
    splits,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'add-auxiliary-rail',
      before,
      after,
    },
  }
}

function mergeAcrossRail(
  cells: GridCellRef[],
  input: {
    axis: 'x' | 'y'
    railId: string
    masterId: string
    channel: JamoConstructionChannelName
    elementId: string
  },
): { cells: GridCellRef[]; audits: GridCellMergeAudit[]; collisionId?: string } {
  const existingIds = new Set(cells.map(({ id }) => id))
  const processed = new Set<string>()
  const next: GridCellRef[] = []
  const audits: GridCellMergeAudit[] = []
  for (const cell of cells) {
    if (processed.has(cell.id)) continue
    const firstSide = input.axis === 'x'
      ? cell.rightRailId === input.railId
      : cell.bottomRailId === input.railId
    const secondSide = input.axis === 'x'
      ? cell.leftRailId === input.railId
      : cell.topRailId === input.railId
    if (!firstSide && !secondSide) {
      next.push(cell)
      continue
    }
    const neighbor = cells.find((candidate) => {
      if (candidate.id === cell.id || processed.has(candidate.id)) return false
      if (input.axis === 'x') {
        const opposite = firstSide
          ? candidate.leftRailId === input.railId
          : candidate.rightRailId === input.railId
        return opposite && candidate.topRailId === cell.topRailId && candidate.bottomRailId === cell.bottomRailId
      }
      const opposite = firstSide
        ? candidate.topRailId === input.railId
        : candidate.bottomRailId === input.railId
      return opposite && candidate.leftRailId === cell.leftRailId && candidate.rightRailId === cell.rightRailId
    })
    if (!neighbor) {
      next.push(cell)
      continue
    }
    const leading = firstSide ? cell : neighbor
    const trailing = firstSide ? neighbor : cell
    const bounds: Omit<GridCellRef, 'id'> = input.axis === 'x'
      ? {
        leftRailId: leading.leftRailId,
        rightRailId: trailing.rightRailId,
        topRailId: leading.topRailId,
        bottomRailId: leading.bottomRailId,
      }
      : {
        leftRailId: leading.leftRailId,
        rightRailId: leading.rightRailId,
        topRailId: leading.topRailId,
        bottomRailId: trailing.bottomRailId,
      }
    const mergedId = createGridCellId({
      masterId: input.masterId,
      channel: input.channel,
      elementId: input.elementId,
      ...bounds,
    })
    existingIds.delete(cell.id)
    existingIds.delete(neighbor.id)
    if (existingIds.has(mergedId)) return { cells, audits, collisionId: mergedId }
    existingIds.add(mergedId)
    processed.add(cell.id)
    processed.add(neighbor.id)
    next.push({ id: mergedId, ...bounds })
    audits.push({
      masterId: input.masterId,
      channel: input.channel,
      elementId: input.elementId,
      parentCellIds: [leading.id, trailing.id],
      mergedCellId: mergedId,
    })
  }
  return { cells: next, audits }
}

export function removeAuxiliaryRail(
  source: DeepReadonly<RoleConstructionScope>,
  command: DeepReadonly<RemoveAuxiliaryRailCommand>,
): RemoveRailCommandResult {
  if (typeof command.transactionId !== 'string' || command.transactionId.trim() === '') {
    return removeFailure('invalid-transaction-id', 'transaction ID는 비어 있지 않아야 합니다.')
  }
  if (command.usageCoverage !== 'role-construction-v1') {
    return removeFailure(
      'incomplete-usage-coverage',
      '현재 RoleConstruction v1 밖의 참조가 있을 수 있어 Rail 삭제를 차단했습니다.',
    )
  }
  const validation = validateRoleConstructionScope(source)
  if (!validation.ok) {
    return removeFailure('invalid-scope', `삭제 source가 유효하지 않습니다: ${validation.issues.map(({ code }) => code).join(', ')}`)
  }
  if (!hasCompleteRoleConstructionV1Universe(source)) {
    return removeFailure(
      'incomplete-usage-coverage',
      '현재 RoleConstruction v1 밖의 참조가 있을 수 있어 Rail 삭제를 차단했습니다.',
    )
  }
  if (command.axis !== 'x' && command.axis !== 'y') {
    return removeFailure('axis-mismatch', `알 수 없는 Rail 축입니다: ${String(command.axis)}`)
  }
  const axisRails = command.axis === 'x' ? source.grid.xRails : source.grid.yRails
  const otherRails = command.axis === 'x' ? source.grid.yRails : source.grid.xRails
  const rail = axisRails.find(({ id }) => id === command.railId)
  if (!rail) {
    return removeFailure(
      otherRails.some(({ id }) => id === command.railId) ? 'axis-mismatch' : 'missing-rail',
      `삭제할 ${command.axis.toUpperCase()} Rail ${command.railId}을 찾을 수 없습니다.`,
    )
  }
  const collected = collectRailUsages(source, command.railId)
  if (!collected.ok) return removeFailure('invalid-scope', collected.error.message)
  const usages = collected.usages
  if (rail.kind === 'core') {
    return removeFailure('core-rail-locked', '코어 Rail은 사용처가 없어도 삭제할 수 없습니다.', usages)
  }
  const hardUsages = usages.filter(({ kind }) => kind === 'point-reference' || kind === 'between-binding')
  if (hardUsages.length > 0) {
    return removeFailure('rail-in-use', '보조 Rail의 하드 참조를 먼저 재연결해야 합니다.', usages)
  }
  const occupancyConflicts = usages.filter(
    (usage) => usage.kind === 'cell-boundary' && usage.reason === 'occupancy-differs',
  )
  if (occupancyConflicts.length > 0) {
    return removeFailure('occupancy-differs', '양쪽 셀 점유가 달라 자동 병합할 수 없습니다.', usages)
  }

  const next = cloneScope(source)
  const merges: GridCellMergeAudit[] = []
  for (const master of next.masters) {
    for (const [channelName, channel] of Object.entries(master.construction.channels) as Array<[
      JamoConstructionChannelName,
      NonNullable<(typeof master.construction.channels)[JamoConstructionChannelName]>,
    ]>) {
      if (!channel) continue
      for (const element of channel.elements) {
        if (element.kind !== 'area') continue
        const merged = mergeAcrossRail(element.filledCells, {
          axis: command.axis,
          railId: command.railId,
          masterId: master.id,
          channel: channelName,
          elementId: element.id,
        })
        if (merged.collisionId) {
          return removeFailure(
            'cell-id-collision',
            `병합 셀 ID ${merged.collisionId}가 기존 셀과 충돌합니다.`,
            usages,
          )
        }
        element.filledCells = merged.cells
        merges.push(...merged.audits)
      }
    }
  }
  const nextRails = command.axis === 'x' ? next.grid.xRails : next.grid.yRails
  nextRails.splice(nextRails.findIndex(({ id }) => id === command.railId), 1)
  const nextValidation = validateRoleConstructionScope(next)
  if (!nextValidation.ok) {
    return removeFailure(
      'invalid-result',
      `삭제 결과가 유효하지 않습니다: ${nextValidation.issues.map(({ code }) => code).join(', ')}`,
      usages,
    )
  }
  const before = cloneScope(source)
  const after = cloneScope(next)
  return {
    ok: true,
    scope: next,
    merges,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'delete-auxiliary-rail',
      before,
      after,
    },
  }
}
