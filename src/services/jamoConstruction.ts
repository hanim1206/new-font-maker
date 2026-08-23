import type {
  DeepReadonly,
  BoundaryTreatment,
  GridAreaElement,
  GridCellRef,
  GridPointRef,
  InkRegion,
  JamoConstructionChannelName,
  JamoConstructionIssue,
  JamoPartRole,
  JamoRoleMaster,
  RailGrid,
  ResolvedRailGrid,
  RoleConstructionScope,
  RoleConstructionValidationResult,
} from '../types'
import { validateRailGrid } from './railGridResolver'

const CHANNEL_NAMES: readonly JamoConstructionChannelName[] = ['main', 'horizontal', 'vertical']

function encodeIdPart(value: string): string {
  return encodeURIComponent(value)
}

export function expectedConstructionChannel(role: JamoPartRole): JamoConstructionChannelName {
  if (role === 'JU_H') return 'horizontal'
  if (role === 'JU_V') return 'vertical'
  return 'main'
}

export function createJamoRoleMasterId(jamoId: string, role: JamoPartRole): string {
  return `jamo-role-master:${encodeIdPart(jamoId)}:${encodeIdPart(role)}`
}

export function createGridCellId(input: {
  masterId: string
  channel: JamoConstructionChannelName
  elementId: string
  leftRailId: string
  rightRailId: string
  topRailId: string
  bottomRailId: string
}): string {
  return [
    'grid-cell',
    input.masterId,
    input.channel,
    input.elementId,
    input.leftRailId,
    input.rightRailId,
    input.topRailId,
    input.bottomRailId,
  ].map(encodeIdPart).join(':')
}

export function createEmptyJamoRoleMaster(input: {
  jamoId: string
  role: JamoPartRole
  gridId: string
}): JamoRoleMaster {
  const base = {
    id: createJamoRoleMasterId(input.jamoId, input.role),
    jamoId: input.jamoId,
  }
  if (input.role === 'JU_H') return {
    ...base,
    role: 'JU_H',
    construction: { channels: { horizontal: { role: 'JU_H', gridId: input.gridId, elements: [] } } },
  }
  if (input.role === 'JU_V') return {
    ...base,
    role: 'JU_V',
    construction: { channels: { vertical: { role: 'JU_V', gridId: input.gridId, elements: [] } } },
  }
  return {
    ...base,
    role: input.role,
    construction: { channels: { main: { role: input.role, gridId: input.gridId, elements: [] } } },
  }
}

export function createRoleConstructionSourceV1(input: {
  grid: RailGrid
  masters: JamoRoleMaster[]
}): RoleConstructionScope {
  return {
    schema: 'role-construction',
    version: 1,
    grid: input.grid,
    masters: input.masters,
  }
}

function hasMinimalScopeStructure(value: unknown): value is DeepReadonly<RoleConstructionScope> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { grid?: unknown; masters?: unknown }
  return Boolean(candidate.grid && typeof candidate.grid === 'object' && Array.isArray(candidate.masters))
}

function pushUnique(issues: JamoConstructionIssue[], issue: JamoConstructionIssue): void {
  const key = JSON.stringify(issue)
  if (!issues.some((current) => JSON.stringify(current) === key)) issues.push(issue)
}

interface GridIndexPoint {
  x: number
  y: number
}

interface BoundaryCornerCandidate {
  vertex: GridIndexPoint
  previous: GridIndexPoint
  next: GridIndexPoint
  diagonalEligible: boolean
}

function indexPointKey(point: GridIndexPoint): string {
  return `${point.x},${point.y}`
}

function sameIndexPoint(first: GridIndexPoint, second: GridIndexPoint): boolean {
  return first.x === second.x && first.y === second.y
}

function collectBoundaryCornerCandidates(
  cells: readonly unknown[],
  xRailIndexes: ReadonlyMap<string, number>,
  yRailIndexes: ReadonlyMap<string, number>,
): Map<string, BoundaryCornerCandidate[]> {
  const edges = new Map<string, { from: GridIndexPoint; to: GridIndexPoint }>()
  const occupied = new Set<string>()
  const addEdge = (from: GridIndexPoint, to: GridIndexPoint) => {
    const key = `${indexPointKey(from)}>${indexPointKey(to)}`
    const reverse = `${indexPointKey(to)}>${indexPointKey(from)}`
    if (edges.has(reverse)) edges.delete(reverse)
    else edges.set(key, { from, to })
  }
  for (const value of cells) {
    if (!value || typeof value !== 'object') continue
    const cell = value as Partial<GridCellRef>
    const left = typeof cell.leftRailId === 'string' ? xRailIndexes.get(cell.leftRailId) : undefined
    const right = typeof cell.rightRailId === 'string' ? xRailIndexes.get(cell.rightRailId) : undefined
    const top = typeof cell.topRailId === 'string' ? yRailIndexes.get(cell.topRailId) : undefined
    const bottom = typeof cell.bottomRailId === 'string' ? yRailIndexes.get(cell.bottomRailId) : undefined
    if (left === undefined || right === undefined || top === undefined || bottom === undefined
      || right !== left + 1 || bottom !== top + 1) continue
    occupied.add(`${left},${top}`)
    addEdge({ x: left, y: top }, { x: right, y: top })
    addEdge({ x: right, y: top }, { x: right, y: bottom })
    addEdge({ x: right, y: bottom }, { x: left, y: bottom })
    addEdge({ x: left, y: bottom }, { x: left, y: top })
  }

  const candidates = new Map<string, BoundaryCornerCandidate[]>()
  const remaining = new Map(edges)
  while (remaining.size > 0) {
    const [firstKey, first] = [...remaining.entries()].sort(([a], [b]) => a.localeCompare(b))[0]
    remaining.delete(firstKey)
    const contour: GridIndexPoint[] = [first.from, first.to]
    let current = first.to
    let closed = false
    let steps = 0
    while (steps <= edges.size + 1) {
      if (sameIndexPoint(current, contour[0])) {
        closed = true
        contour.pop()
        break
      }
      const outgoing = [...remaining.entries()].filter(([, edge]) => sameIndexPoint(edge.from, current))
      if (outgoing.length !== 1) break
      const [key, edge] = outgoing[0]
      remaining.delete(key)
      current = edge.to
      contour.push(current)
      steps += 1
    }
    if (!closed || contour.length < 3) continue
    let simplified = contour
    let changed = true
    while (changed && simplified.length >= 3) {
      changed = false
      const nextPoints = simplified.filter((point, index) => {
        const previous = simplified[(index - 1 + simplified.length) % simplified.length]
        const next = simplified[(index + 1) % simplified.length]
        const cross = (point.x - previous.x) * (next.y - point.y)
          - (point.y - previous.y) * (next.x - point.x)
        if (cross === 0) changed = true
        return cross !== 0
      })
      if (nextPoints.length === simplified.length || nextPoints.length < 3) break
      simplified = nextPoints
    }
    simplified.forEach((vertex, index) => {
      const adjacentFilled = [
        occupied.has(`${vertex.x - 1},${vertex.y - 1}`),
        occupied.has(`${vertex.x},${vertex.y - 1}`),
        occupied.has(`${vertex.x - 1},${vertex.y}`),
        occupied.has(`${vertex.x},${vertex.y}`),
      ].filter(Boolean).length
      const key = indexPointKey(vertex)
      const currentCandidates = candidates.get(key) ?? []
      currentCandidates.push({
        vertex,
        previous: simplified[(index - 1 + simplified.length) % simplified.length],
        next: simplified[(index + 1) % simplified.length],
        diagonalEligible: adjacentFilled === 1,
      })
      candidates.set(key, currentCandidates)
    })
  }
  return candidates
}

function pointOnBoundarySegment(point: GridIndexPoint, vertex: GridIndexPoint, end: GridIndexPoint): boolean {
  if (sameIndexPoint(point, vertex)) return false
  const cross = (point.x - vertex.x) * (end.y - vertex.y)
    - (point.y - vertex.y) * (end.x - vertex.x)
  if (cross !== 0) return false
  return point.x >= Math.min(vertex.x, end.x) && point.x <= Math.max(vertex.x, end.x)
    && point.y >= Math.min(vertex.y, end.y) && point.y <= Math.max(vertex.y, end.y)
}

export function validateRoleConstructionScope(value: unknown): RoleConstructionValidationResult {
  const issues: JamoConstructionIssue[] = []
  if (!hasMinimalScopeStructure(value)) {
    return {
      ok: false,
      issues: [{
        code: 'invalid-scope-structure',
        message: 'RoleConstructionScope는 grid와 masters 배열을 포함해야 합니다.',
      }],
    }
  }

  const scope = value
  if (scope.schema !== 'role-construction' || scope.version !== 1) {
    pushUnique(issues, {
      code: 'unsupported-source-version',
      message: `지원하지 않는 RoleConstruction source입니다: ${String(scope.schema)}@${String(scope.version)}`,
    })
    return { ok: false, issues }
  }
  const gridValidation = validateRailGrid(scope.grid)
  if (!gridValidation.ok) {
    pushUnique(issues, {
      code: 'invalid-grid',
      message: `역할 그리드가 유효하지 않습니다: ${gridValidation.issues.map(({ code }) => code).join(', ')}`,
    })
    return { ok: false, issues }
  }

  const xRailIndexes = new Map(scope.grid.xRails.map((rail, index) => [rail.id, index]))
  const yRailIndexes = new Map(scope.grid.yRails.map((rail, index) => [rail.id, index]))
  const masterIds = new Set<string>()
  const masterKeys = new Set<string>()

  for (const master of scope.masters) {
    if (!master || typeof master !== 'object') {
      pushUnique(issues, { code: 'invalid-master-id', message: '자소 마스터가 객체가 아닙니다.' })
      continue
    }
    const masterId = typeof master.id === 'string' ? master.id : ''
    if (masterId.trim() === '') {
      pushUnique(issues, { code: 'invalid-master-id', masterId, message: '자소 마스터 ID는 비어 있을 수 없습니다.' })
    } else if (masterIds.has(masterId)) {
      pushUnique(issues, { code: 'duplicate-master-id', masterId, message: `자소 마스터 ID ${masterId}가 중복됩니다.` })
    } else {
      masterIds.add(masterId)
    }
    if (typeof master.jamoId !== 'string' || master.jamoId.trim() === '') {
      pushUnique(issues, { code: 'invalid-jamo-id', masterId, message: '자소 ID는 비어 있을 수 없습니다.' })
    } else if (typeof master.role === 'string') {
      const masterKey = `${master.jamoId}\u0000${master.role}`
      if (masterKeys.has(masterKey)) {
        pushUnique(issues, {
          code: 'duplicate-master-key', masterId,
          message: `자소 역할 마스터 ${master.jamoId}+${master.role}가 중복됩니다.`,
        })
      } else {
        masterKeys.add(masterKey)
      }
      const canonicalId = createJamoRoleMasterId(master.jamoId, master.role)
      if (masterId !== canonicalId) {
        pushUnique(issues, {
          code: 'non-canonical-master-id', masterId,
          message: `마스터 ID는 jamoId+role canonical ID ${canonicalId}여야 합니다.`,
        })
      }
    }
    if (master.role !== scope.grid.role) {
      pushUnique(issues, {
        code: 'master-role-mismatch',
        masterId,
        message: `마스터 role ${String(master.role)}이 grid role ${scope.grid.role}과 다릅니다.`,
      })
    }

    const channels = master.construction?.channels
    if (!channels || typeof channels !== 'object') {
      pushUnique(issues, { code: 'invalid-channel-set', masterId, message: 'construction channels가 없습니다.' })
      continue
    }
    const unknownChannelNames = Object.keys(channels).filter(
      (name) => !CHANNEL_NAMES.includes(name as JamoConstructionChannelName),
    )
    if (unknownChannelNames.length > 0) {
      pushUnique(issues, {
        code: 'invalid-channel-set',
        masterId,
        message: `알 수 없는 construction channel이 있습니다: ${unknownChannelNames.join(', ')}`,
      })
    }
    const activeChannels = CHANNEL_NAMES.filter((name) => channels[name] !== undefined)
    const expected = expectedConstructionChannel(scope.grid.role)
    if (activeChannels.length !== 1 || activeChannels[0] !== expected) {
      pushUnique(issues, {
        code: 'invalid-channel-set',
        masterId,
        message: `${scope.grid.role} 마스터는 ${expected} channel 하나만 가져야 합니다.`,
      })
    }

    const elementIds = new Set<string>()
    const cellIds = new Set<string>()
    const referenceIds = new Set<string>()
    const registerReferenceId = (
      id: unknown,
      context: Pick<JamoConstructionIssue, 'channel' | 'elementId' | 'anchorId' | 'treatmentId'>,
      ownerLabel: string,
    ): string => {
      const referenceId = typeof id === 'string' ? id : ''
      if (referenceId.trim() === '') {
        pushUnique(issues, {
          code: 'invalid-reference-id', masterId, ...context, referenceId,
          message: `${ownerLabel} ID는 비어 있을 수 없습니다.`,
        })
      } else if (referenceIds.has(referenceId)) {
        pushUnique(issues, {
          code: 'duplicate-reference-id', masterId, ...context, referenceId,
          message: `편집 참조 ID ${referenceId}가 중복됩니다.`,
        })
      } else {
        referenceIds.add(referenceId)
      }
      return referenceId
    }
    const validatePoint = (
      value: unknown,
      context: Pick<JamoConstructionIssue, 'channel' | 'elementId' | 'anchorId' | 'treatmentId'>,
      slotLabel: string,
    ): GridPointRef | null => {
      if (!value || typeof value !== 'object') {
        pushUnique(issues, {
          code: 'invalid-reference-id', masterId, ...context,
          message: `${slotLabel} point가 객체가 아닙니다.`,
        })
        return null
      }
      const point = value as Partial<GridPointRef>
      const referenceId = registerReferenceId(point.id, context, `${slotLabel} point`)
      if (typeof point.xRailId !== 'string' || !xRailIndexes.has(point.xRailId)) {
        pushUnique(issues, {
          code: 'missing-reference-rail', masterId, ...context, referenceId,
          railId: point.xRailId,
          message: `${slotLabel} point의 X Rail ${String(point.xRailId)}을 찾을 수 없습니다.`,
        })
      }
      if (typeof point.yRailId !== 'string' || !yRailIndexes.has(point.yRailId)) {
        pushUnique(issues, {
          code: 'missing-reference-rail', masterId, ...context, referenceId,
          railId: point.yRailId,
          message: `${slotLabel} point의 Y Rail ${String(point.yRailId)}을 찾을 수 없습니다.`,
        })
      }
      return typeof point.xRailId === 'string' && typeof point.yRailId === 'string'
        ? { id: referenceId, xRailId: point.xRailId, yRailId: point.yRailId }
        : null
    }
    for (const channelName of activeChannels) {
      const channel = channels[channelName]
      if (!channel || typeof channel !== 'object' || !Array.isArray(channel.elements)) {
        pushUnique(issues, { code: 'invalid-channel-set', masterId, channel: channelName, message: 'channel elements가 배열이 아닙니다.' })
        continue
      }
      if (channel.role !== master.role) {
        pushUnique(issues, {
          code: 'channel-role-mismatch', masterId, channel: channelName,
          message: `channel role ${String(channel.role)}이 master role ${String(master.role)}과 다릅니다.`,
        })
      }
      if (channel.gridId !== scope.grid.id) {
        pushUnique(issues, {
          code: 'channel-grid-mismatch', masterId, channel: channelName,
          message: `channel grid ${String(channel.gridId)}가 scope grid ${scope.grid.id}와 다릅니다.`,
        })
      }

      for (const element of channel.elements) {
        if (!element || typeof element !== 'object') {
          pushUnique(issues, {
            code: 'invalid-element-kind', masterId, channel: channelName,
            message: 'construction element가 객체가 아닙니다.',
          })
          continue
        }
        const elementId = typeof element.id === 'string' ? element.id : ''
        if (elementId.trim() === '') {
          pushUnique(issues, { code: 'invalid-element-id', masterId, channel: channelName, elementId, message: '요소 ID는 비어 있을 수 없습니다.' })
        } else if (elementIds.has(elementId)) {
          pushUnique(issues, { code: 'duplicate-element-id', masterId, channel: channelName, elementId, message: `요소 ID ${elementId}가 중복됩니다.` })
        } else {
          elementIds.add(elementId)
        }
        if (element.kind === 'centerline') {
          if (!Array.isArray(element.anchors)) {
            pushUnique(issues, {
              code: 'invalid-centerline-shape', masterId, channel: channelName, elementId,
              message: 'centerline anchors는 배열이어야 합니다.',
            })
            continue
          }
          if (typeof element.closed !== 'boolean'
            || (element.closed ? element.anchors.length < 3 : element.anchors.length < 2)) {
            pushUnique(issues, {
              code: 'invalid-centerline-shape', masterId, channel: channelName, elementId,
              message: '열린 centerline은 2개, 닫힌 centerline은 3개 이상의 anchor가 필요합니다.',
            })
          }
          if (!Number.isFinite(element.thickness) || element.thickness <= 0 || element.thickness > 1) {
            pushUnique(issues, {
              code: 'invalid-centerline-thickness', masterId, channel: channelName, elementId,
              message: 'centerline thickness는 0보다 크고 1 이하여야 합니다.',
            })
          }
          if (element.linecap !== undefined && !['round', 'butt', 'square'].includes(element.linecap)) {
            pushUnique(issues, {
              code: 'invalid-centerline-shape', masterId, channel: channelName, elementId,
              message: `알 수 없는 linecap입니다: ${String(element.linecap)}`,
            })
          }
          if (element.linejoin !== undefined && !['round', 'miter', 'bevel'].includes(element.linejoin)) {
            pushUnique(issues, {
              code: 'invalid-centerline-shape', masterId, channel: channelName, elementId,
              message: `알 수 없는 linejoin입니다: ${String(element.linejoin)}`,
            })
          }
          for (const rawAnchor of element.anchors) {
            if (!rawAnchor || typeof rawAnchor !== 'object') {
              pushUnique(issues, {
                code: 'invalid-centerline-anchor', masterId, channel: channelName, elementId,
                message: 'centerline anchor가 객체가 아닙니다.',
              })
              continue
            }
            const anchor = rawAnchor as Partial<typeof rawAnchor>
            const anchorId = registerReferenceId(anchor.id, { channel: channelName, elementId }, 'anchor')
            const context = { channel: channelName, elementId, anchorId }
            validatePoint(anchor.point, context, 'anchor')
            if (anchor.handleIn !== undefined) validatePoint(anchor.handleIn, context, 'handle-in')
            if (anchor.handleOut !== undefined) validatePoint(anchor.handleOut, context, 'handle-out')
          }
          continue
        }
        if (element.kind !== 'area' || !Array.isArray(element.filledCells)
          || !Array.isArray(element.boundaryTreatments)) {
          pushUnique(issues, {
            code: 'invalid-element-kind', masterId, channel: channelName, elementId,
            message: 'construction element는 centerline 또는 완전한 area여야 합니다.',
          })
          continue
        }

        const bounds = new Set<string>()
        for (const cell of element.filledCells) {
          if (!cell || typeof cell !== 'object') {
            pushUnique(issues, {
              code: 'invalid-cell-id', masterId, channel: channelName, elementId,
              message: 'filled cell이 객체가 아닙니다.',
            })
            continue
          }
          const cellId = typeof cell.id === 'string' ? cell.id : ''
          if (cellId.trim() === '') {
            pushUnique(issues, { code: 'invalid-cell-id', masterId, channel: channelName, elementId, cellId, message: '셀 ID는 비어 있을 수 없습니다.' })
          } else if (cellIds.has(cellId)) {
            pushUnique(issues, { code: 'duplicate-cell-id', masterId, channel: channelName, elementId, cellId, message: `셀 ID ${cellId}가 중복됩니다.` })
          } else {
            cellIds.add(cellId)
          }

          if (typeof cell.leftRailId === 'string' && typeof cell.rightRailId === 'string'
            && typeof cell.topRailId === 'string' && typeof cell.bottomRailId === 'string') {
            const canonicalCellId = createGridCellId({
              masterId,
              channel: channelName,
              elementId,
              leftRailId: cell.leftRailId,
              rightRailId: cell.rightRailId,
              topRailId: cell.topRailId,
              bottomRailId: cell.bottomRailId,
            })
            if (cellId !== canonicalCellId) {
              pushUnique(issues, {
                code: 'non-canonical-cell-id', masterId, channel: channelName, elementId, cellId,
                message: `셀 ID는 안정 owner+Rail 경계 ID ${canonicalCellId}여야 합니다.`,
              })
            }
          }

          const railRefs = [
            [cell.leftRailId, xRailIndexes] as const,
            [cell.rightRailId, xRailIndexes] as const,
            [cell.topRailId, yRailIndexes] as const,
            [cell.bottomRailId, yRailIndexes] as const,
          ]
          for (const [id, indexes] of railRefs) {
            if (!indexes.has(id)) {
              pushUnique(issues, {
                code: 'missing-cell-rail', masterId, channel: channelName, elementId, cellId, railId: id,
                message: `셀 ${cellId}이 없는 Rail ${String(id)}을 참조합니다.`,
              })
            }
          }
          const left = xRailIndexes.get(cell.leftRailId)
          const right = xRailIndexes.get(cell.rightRailId)
          const top = yRailIndexes.get(cell.topRailId)
          const bottom = yRailIndexes.get(cell.bottomRailId)
          if (left !== undefined && right !== undefined && top !== undefined && bottom !== undefined
            && (right !== left + 1 || bottom !== top + 1)) {
            pushUnique(issues, {
              code: 'non-atomic-cell', masterId, channel: channelName, elementId, cellId,
              message: `셀 ${cellId}은 인접 Rail 사이의 원자 셀이 아닙니다.`,
            })
          }
          const signature = [cell.leftRailId, cell.rightRailId, cell.topRailId, cell.bottomRailId].join('\u0000')
          if (bounds.has(signature)) {
            pushUnique(issues, {
              code: 'duplicate-cell-bounds', masterId, channel: channelName, elementId, cellId,
              message: `요소 ${elementId}에 같은 경계의 셀이 중복됩니다.`,
            })
          } else {
            bounds.add(signature)
          }
        }

        const boundaryCandidates = collectBoundaryCornerCandidates(
          element.filledCells,
          xRailIndexes,
          yRailIndexes,
        )
        const treatmentCountsByVertex = new Map<string, number>()
        for (const rawTreatment of element.boundaryTreatments) {
          if (!rawTreatment || typeof rawTreatment !== 'object') {
            pushUnique(issues, {
              code: 'invalid-boundary-treatment', masterId, channel: channelName, elementId,
              message: 'boundary treatment가 객체가 아닙니다.',
            })
            continue
          }
          const treatment = rawTreatment as Partial<BoundaryTreatment>
          const treatmentId = registerReferenceId(
            treatment.id,
            { channel: channelName, elementId },
            'boundary treatment',
          )
          const context = { channel: channelName, elementId, treatmentId }
          if (treatment.kind !== 'curve' && treatment.kind !== 'diagonal') {
            pushUnique(issues, {
              code: 'invalid-boundary-treatment', masterId, ...context,
              message: `알 수 없는 boundary treatment kind입니다: ${String(treatment.kind)}`,
            })
            continue
          }
          if (treatment.kind === 'curve'
            && (!Number.isFinite(treatment.tension) || treatment.tension! < 0 || treatment.tension! > 1)) {
            pushUnique(issues, {
              code: 'invalid-boundary-treatment', masterId, ...context,
              message: 'curve tension은 0과 1 사이의 유한한 값이어야 합니다.',
            })
          }
          const vertex = validatePoint(treatment.vertex, context, `${treatment.kind} vertex`)
          const from = validatePoint(treatment.from, context, `${treatment.kind} from`)
          const to = validatePoint(treatment.to, context, `${treatment.kind} to`)
          if (vertex && from && to) {
            const coordinate = (point: GridPointRef) => `${point.xRailId}\u0000${point.yRailId}`
            if (coordinate(vertex) === coordinate(from)
              || coordinate(vertex) === coordinate(to)
              || coordinate(from) === coordinate(to)) {
              pushUnique(issues, {
                code: 'invalid-boundary-treatment', masterId, ...context,
                message: 'boundary treatment의 vertex/from/to는 서로 다른 교점이어야 합니다.',
              })
            }
            const vertexKey = coordinate(vertex)
            const treatmentCount = (treatmentCountsByVertex.get(vertexKey) ?? 0) + 1
            treatmentCountsByVertex.set(vertexKey, treatmentCount)
            if (treatmentCount > 1) {
              pushUnique(issues, {
                code: 'invalid-boundary-treatment', masterId, ...context,
                message: '같은 윤곽 vertex에는 boundary treatment를 하나만 적용할 수 있습니다.',
              })
            }
            const toIndexPoint = (point: GridPointRef): GridIndexPoint | null => {
              const x = xRailIndexes.get(point.xRailId)
              const y = yRailIndexes.get(point.yRailId)
              return x === undefined || y === undefined ? null : { x, y }
            }
            const vertexIndex = toIndexPoint(vertex)
            const fromIndex = toIndexPoint(from)
            const toIndex = toIndexPoint(to)
            if (vertexIndex && fromIndex && toIndex) {
              const candidates = boundaryCandidates.get(indexPointKey(vertexIndex)) ?? []
              const candidate = candidates.length === 1 ? candidates[0] : undefined
              const followsBoundary = candidate && (
                (pointOnBoundarySegment(fromIndex, candidate.vertex, candidate.previous)
                  && pointOnBoundarySegment(toIndex, candidate.vertex, candidate.next))
                || (pointOnBoundarySegment(fromIndex, candidate.vertex, candidate.next)
                  && pointOnBoundarySegment(toIndex, candidate.vertex, candidate.previous))
              )
              if (!candidate || !followsBoundary
                || (treatment.kind === 'diagonal' && !candidate.diagonalEligible)) {
                pushUnique(issues, {
                  code: 'invalid-boundary-treatment', masterId, ...context,
                  message: 'boundary treatment는 실제 채움 윤곽의 한 꼭짓점과 인접한 두 변을 참조해야 합니다.',
                })
              }
            }
          }
        }
      }
    }
  }

  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues }
}

export function gridCellToInkRegion(
  cell: DeepReadonly<GridCellRef>,
  grid: DeepReadonly<Pick<ResolvedRailGrid, 'xRails' | 'yRails'>>,
): InkRegion | null {
  const x = new Map(grid.xRails.map((rail) => [rail.id, rail.value]))
  const y = new Map(grid.yRails.map((rail) => [rail.id, rail.value]))
  const left = x.get(cell.leftRailId)
  const right = x.get(cell.rightRailId)
  const top = y.get(cell.topRailId)
  const bottom = y.get(cell.bottomRailId)
  if (left === undefined || right === undefined || top === undefined || bottom === undefined || left >= right || top >= bottom) return null
  return {
    outer: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
    holes: [],
  }
}

export function gridAreaToInkRegions(
  element: DeepReadonly<GridAreaElement>,
  grid: DeepReadonly<ResolvedRailGrid>,
): InkRegion[] {
  return element.filledCells.map((cell) => {
    const region = gridCellToInkRegion(cell, grid)
    if (!region) throw new Error(`채워진 셀 ${cell.id}의 Rail 경계를 해석할 수 없습니다.`)
    return region
  })
}
