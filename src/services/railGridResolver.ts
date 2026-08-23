import type {
  CoreXRailRole,
  CoreYRailRole,
  DeepReadonly,
  JamoPartRole,
  RailAxis,
  RailGrid,
  RailGridIssue,
  RailGridResolutionResult,
  RailGridValidationResult,
  ResolvedRailGrid,
  ResolvedShapeRail,
  ShapeRail,
} from '../types'

export const CORE_X_RAIL_ROLES: readonly CoreXRailRole[] = [
  'outer-left',
  'inner-left',
  'center-x',
  'inner-right',
  'outer-right',
]

export const CORE_Y_RAIL_ROLES: readonly CoreYRailRole[] = [
  'outer-top',
  'inner-top',
  'center-y',
  'inner-bottom',
  'outer-bottom',
]

const CORE_X_ROLE_SET = new Set<string>(CORE_X_RAIL_ROLES)
const CORE_Y_ROLE_SET = new Set<string>(CORE_Y_RAIL_ROLES)
const JAMO_PART_ROLE_SET = new Set<string>([
  'STANDALONE', 'CH', 'JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO',
])
// IEEE-754 뺄셈의 경계 노이즈만 허용하고 실제 minGap 미달은 통과시키지 않는다.
const GAP_EPSILON = Number.EPSILON * 16

interface RailEntry {
  axis: RailAxis
  rail: DeepReadonly<ShapeRail>
}

interface Analysis {
  issues: RailGridIssue[]
  resolved?: ResolvedRailGrid
}

function railId(gridId: string, axis: RailAxis, role: CoreXRailRole | CoreYRailRole): string {
  return `${gridId}:${axis}:${role}`
}

export function createBasePartGrid(input: {
  role: JamoPartRole
  xCorePositions: Readonly<Record<CoreXRailRole, number>>
  yCorePositions: Readonly<Record<CoreYRailRole, number>>
  snapStep: number
  minGap: number
}): RailGrid {
  const id = `part-grid:${input.role}`
  return {
    id,
    role: input.role,
    xRails: CORE_X_RAIL_ROLES.map((coreRole) => ({
      id: railId(id, 'x', coreRole),
      kind: 'core',
      coreRole,
      position: { kind: 'absolute', value: input.xCorePositions[coreRole] },
    })),
    yRails: CORE_Y_RAIL_ROLES.map((coreRole) => ({
      id: railId(id, 'y', coreRole),
      kind: 'core',
      coreRole,
      position: { kind: 'absolute', value: input.yCorePositions[coreRole] },
    })),
    snapStep: input.snapStep,
    minGap: input.minGap,
  }
}

function isRoleForAxis(role: string | undefined, axis: RailAxis): boolean {
  return role !== undefined && (axis === 'x' ? CORE_X_ROLE_SET : CORE_Y_ROLE_SET).has(role)
}

function hasMinimalRailGridStructure(value: unknown): value is DeepReadonly<RailGrid> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { xRails?: unknown; yRails?: unknown }
  if (!Array.isArray(candidate.xRails) || !Array.isArray(candidate.yRails)) return false
  return [...candidate.xRails, ...candidate.yRails].every((rail) => {
    if (!rail || typeof rail !== 'object') return false
    const position = (rail as { position?: unknown }).position
    return Boolean(position && typeof position === 'object')
  })
}

function analyzeRailGrid(value: unknown): Analysis {
  const issues: RailGridIssue[] = []
  const issueKeys = new Set<string>()
  const pushIssue = (issue: RailGridIssue) => {
    const key = JSON.stringify(issue)
    if (!issueKeys.has(key)) {
      issueKeys.add(key)
      issues.push(issue)
    }
  }

  if (!hasMinimalRailGridStructure(value)) {
    pushIssue({
      code: 'invalid-grid-structure',
      message: 'RailGrid는 xRails, yRails와 각 레일의 position 객체를 포함해야 합니다.',
    })
    return { issues }
  }
  const grid = value

  if (typeof grid.id !== 'string' || grid.id.trim() === '') {
    pushIssue({ code: 'invalid-grid-id', message: '그리드 ID는 비어 있지 않은 문자열이어야 합니다.' })
  }
  if (!Number.isFinite(grid.snapStep) || grid.snapStep <= 0) {
    pushIssue({ code: 'invalid-snap-step', message: 'snapStep은 0보다 큰 유한한 값이어야 합니다.' })
  }
  if (!Number.isFinite(grid.minGap) || grid.minGap <= 0) {
    pushIssue({ code: 'invalid-min-gap', message: 'minGap은 0보다 큰 유한한 값이어야 합니다.' })
  }
  if (typeof grid.role !== 'string' || !JAMO_PART_ROLE_SET.has(grid.role)) {
    pushIssue({ code: 'invalid-role', message: `알 수 없는 자소 역할입니다: ${String(grid.role)}` })
  }

  const axes = [
    { axis: 'x' as const, rails: grid.xRails, roles: CORE_X_RAIL_ROLES },
    { axis: 'y' as const, rails: grid.yRails, roles: CORE_Y_RAIL_ROLES },
  ]
  const allRails = new Map<string, RailEntry>()
  for (const { axis, rails } of axes) {
    for (const rail of rails) {
      if (typeof rail.id === 'string' && rail.id.trim() !== '' && !allRails.has(rail.id)) {
        allRails.set(rail.id, { axis, rail })
      }
    }
  }

  const seenIds = new Set<string>()
  const axisMaps = new Map<RailAxis, Map<string, DeepReadonly<ShapeRail>>>()
  for (const { axis, rails, roles } of axes) {
    const axisMap = new Map<string, DeepReadonly<ShapeRail>>()
    const roleCounts = new Map<string, number>()
    axisMaps.set(axis, axisMap)

    for (const rail of rails) {
      if (typeof rail.id !== 'string' || rail.id.trim() === '') {
        pushIssue({ code: 'invalid-rail-id', axis, railId: rail.id, message: `${axis.toUpperCase()} 레일 ID가 비어 있습니다.` })
      } else {
        if (seenIds.has(rail.id)) {
          pushIssue({ code: 'duplicate-rail-id', axis, railId: rail.id, message: `레일 ID ${rail.id}가 중복됩니다.` })
        } else {
          seenIds.add(rail.id)
        }
        if (!axisMap.has(rail.id)) axisMap.set(rail.id, rail)
      }

      if (rail.kind === 'core') {
        if (!rail.coreRole) {
          pushIssue({ code: 'missing-core-role', axis, railId: rail.id, message: `코어 레일 ${rail.id}에 role이 없습니다.` })
        } else if (!isRoleForAxis(rail.coreRole, axis)) {
          pushIssue({
            code: 'core-role-axis-mismatch',
            axis,
            railId: rail.id,
            coreRole: rail.coreRole,
            message: `${rail.coreRole}은 ${axis.toUpperCase()}축 role이 아닙니다.`,
          })
        } else {
          roleCounts.set(rail.coreRole, (roleCounts.get(rail.coreRole) ?? 0) + 1)
        }
      } else if (rail.kind === 'auxiliary' && rail.coreRole) {
        pushIssue({
          code: 'core-role-on-auxiliary',
          axis,
          railId: rail.id,
          coreRole: rail.coreRole,
          message: `보조 레일 ${rail.id}는 코어 role을 가질 수 없습니다.`,
        })
      } else if (rail.kind !== 'auxiliary') {
        pushIssue({
          code: 'invalid-rail-kind',
          axis,
          railId: rail.id,
          message: `레일 ${rail.id}의 kind가 core 또는 auxiliary가 아닙니다.`,
        })
      }

      if (rail.position.kind === 'absolute') {
        if (!Number.isFinite(rail.position.value)) {
          pushIssue({ code: 'non-finite-position', axis, railId: rail.id, message: `레일 ${rail.id}의 절대 위치가 유한하지 않습니다.` })
        } else if (rail.position.value < 0 || rail.position.value > 1) {
          pushIssue({ code: 'out-of-range-position', axis, railId: rail.id, message: `레일 ${rail.id}의 절대 위치가 0–1 범위를 벗어납니다.` })
        }
      } else if (rail.position.kind === 'between') {
        if (!Number.isFinite(rail.position.ratio) || rail.position.ratio <= 0 || rail.position.ratio >= 1) {
          pushIssue({ code: 'invalid-ratio', axis, railId: rail.id, message: `레일 ${rail.id}의 between ratio는 0과 1 사이여야 합니다.` })
        }
        if (rail.position.fromRailId === rail.id || rail.position.toRailId === rail.id) {
          pushIssue({ code: 'self-reference', axis, railId: rail.id, message: `레일 ${rail.id}가 자기 자신을 참조합니다.` })
        }
        if (rail.position.fromRailId === rail.position.toRailId) {
          pushIssue({
            code: 'identical-between-reference',
            axis,
            railId: rail.id,
            referenceRailId: rail.position.fromRailId,
            message: `레일 ${rail.id}의 between 시작과 끝 참조가 같습니다.`,
          })
        }
        for (const referenceRailId of [rail.position.fromRailId, rail.position.toRailId]) {
          const reference = allRails.get(referenceRailId)
          if (!reference) {
            pushIssue({
              code: 'missing-reference',
              axis,
              railId: rail.id,
              referenceRailId,
              message: `레일 ${rail.id}가 없는 레일 ${referenceRailId}를 참조합니다.`,
            })
          } else if (reference.axis !== axis) {
            pushIssue({
              code: 'cross-axis-reference',
              axis,
              railId: rail.id,
              referenceRailId,
              message: `레일 ${rail.id}의 between 참조는 같은 축이어야 합니다.`,
            })
          }
        }
      } else {
        pushIssue({
          code: 'invalid-position-kind',
          axis,
          railId: rail.id,
          message: `레일 ${rail.id}의 position kind가 absolute 또는 between이 아닙니다.`,
        })
      }
    }

    for (const role of roles) {
      const count = roleCounts.get(role) ?? 0
      if (count === 0) {
        pushIssue({ code: 'missing-core-role', axis, coreRole: role, message: `${axis.toUpperCase()}축 코어 role ${role}이 없습니다.` })
      } else if (count > 1) {
        pushIssue({ code: 'duplicate-core-role', axis, coreRole: role, message: `${axis.toUpperCase()}축 코어 role ${role}이 중복됩니다.` })
      }
    }

    const orderedCoreRoles = rails
      .filter((rail) => rail.kind === 'core' && isRoleForAxis(rail.coreRole, axis))
      .map((rail) => rail.coreRole)
    const hasOneOfEveryRole = orderedCoreRoles.length === roles.length
      && roles.every((role) => roleCounts.get(role) === 1)
    if (hasOneOfEveryRole && orderedCoreRoles.some((role, index) => role !== roles[index])) {
      pushIssue({
        code: 'core-role-order-mismatch',
        axis,
        message: `${axis.toUpperCase()}축 코어 role의 의미 순서가 뒤집혔습니다.`,
      })
    }
  }

  const cyclicRailIds = new Map<RailAxis, Set<string>>()
  for (const { axis, rails } of axes) {
    const axisMap = axisMaps.get(axis)!
    const states = new Map<string, 'visiting' | 'done'>()
    const cyclic = new Set<string>()
    const visit = (railIdValue: string, path: string[]) => {
      const state = states.get(railIdValue)
      if (state === 'visiting') {
        const start = path.indexOf(railIdValue)
        for (const id of path.slice(start)) cyclic.add(id)
        return
      }
      if (state === 'done') return
      const rail = axisMap.get(railIdValue)
      if (!rail) return
      states.set(railIdValue, 'visiting')
      if (rail.position.kind === 'between') {
        for (const referenceId of [rail.position.fromRailId, rail.position.toRailId]) {
          if (referenceId !== railIdValue && axisMap.has(referenceId)) visit(referenceId, [...path, railIdValue])
        }
      }
      states.set(railIdValue, 'done')
    }
    for (const rail of rails) visit(rail.id, [])
    cyclicRailIds.set(axis, cyclic)
    for (const rail of rails) {
      if (cyclic.has(rail.id)) {
        pushIssue({ code: 'cyclic-reference', axis, railId: rail.id, message: `레일 ${rail.id}의 between 참조가 순환합니다.` })
      }
    }
  }

  const resolvedAxes = new Map<RailAxis, ResolvedShapeRail[]>()
  for (const { axis, rails } of axes) {
    const axisMap = axisMaps.get(axis)!
    const cyclic = cyclicRailIds.get(axis)!
    const values = new Map<string, number>()
    const resolving = new Set<string>()
    const resolveValue = (id: string): number | undefined => {
      if (values.has(id)) return values.get(id)
      if (cyclic.has(id) || resolving.has(id)) return undefined
      const rail = axisMap.get(id)
      if (!rail) return undefined
      if (rail.position.kind === 'absolute') {
        if (!Number.isFinite(rail.position.value) || rail.position.value < 0 || rail.position.value > 1) return undefined
        values.set(id, rail.position.value)
        return rail.position.value
      }
      if (rail.position.kind !== 'between') return undefined
      if (!Number.isFinite(rail.position.ratio) || rail.position.ratio <= 0 || rail.position.ratio >= 1) return undefined
      if (rail.position.fromRailId === id || rail.position.toRailId === id) return undefined
      if (!axisMap.has(rail.position.fromRailId) || !axisMap.has(rail.position.toRailId)) return undefined
      resolving.add(id)
      const from = resolveValue(rail.position.fromRailId)
      const to = resolveValue(rail.position.toRailId)
      resolving.delete(id)
      if (from === undefined || to === undefined) return undefined
      if (from >= to) {
        pushIssue({ code: 'reversed-between-span', axis, railId: id, message: `레일 ${id}의 between 기준 순서가 뒤집혔습니다.` })
        return undefined
      }
      const value = from + (to - from) * rail.position.ratio
      values.set(id, value)
      return value
    }

    const resolved: ResolvedShapeRail[] = rails.flatMap((rail) => {
      const value = resolveValue(rail.id)
      return value === undefined ? [] : [{
        id: rail.id,
        axis,
        kind: rail.kind,
        ...(rail.coreRole && { coreRole: rail.coreRole }),
        value,
      }]
    })
    resolvedAxes.set(axis, resolved)

    if (Number.isFinite(grid.minGap) && grid.minGap > 0) {
      for (let index = 1; index < rails.length; index += 1) {
        const previous = resolveValue(rails[index - 1].id)
        const current = resolveValue(rails[index].id)
        if (previous === undefined || current === undefined) continue
        if (current <= previous) {
          pushIssue({ code: 'non-monotonic', axis, railId: rails[index].id, message: `${axis.toUpperCase()} 레일 순서가 단조 증가하지 않습니다.` })
        } else if (current - previous + GAP_EPSILON < grid.minGap) {
          pushIssue({ code: 'min-gap-violation', axis, railId: rails[index].id, message: `${axis.toUpperCase()} 레일 간격이 minGap보다 작습니다.` })
        }
      }
    }
  }

  if (issues.length > 0) return { issues }
  return {
    issues,
    resolved: {
      id: grid.id,
      role: grid.role,
      xRails: resolvedAxes.get('x')!,
      yRails: resolvedAxes.get('y')!,
      snapStep: grid.snapStep,
      minGap: grid.minGap,
    },
  }
}

export function validateRailGrid(grid: unknown): RailGridValidationResult {
  const { issues } = analyzeRailGrid(grid)
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues }
}

export function resolveRailGrid(grid: unknown): RailGridResolutionResult {
  const analysis = analyzeRailGrid(grid)
  return analysis.resolved
    ? { ok: true, grid: analysis.resolved }
    : { ok: false, issues: analysis.issues }
}
