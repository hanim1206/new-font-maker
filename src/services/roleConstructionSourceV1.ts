import type {
  DeepReadonly,
  RoleConstructionScope,
  RoleConstructionSourceV1ParseIssue,
  RoleConstructionSourceV1ParseResult,
  ValidatedRoleConstructionSourceV1,
} from '../types'
import { validateJamoContextVariants } from './jamoContextVariants'
import { validateRoleConstructionScope } from './jamoConstruction'

const CORE_ROLES = new Set([
  'outer-left', 'inner-left', 'center-x', 'inner-right', 'outer-right',
  'outer-top', 'inner-top', 'center-y', 'inner-bottom', 'outer-bottom',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function addIssue(
  issues: RoleConstructionSourceV1ParseIssue[],
  issue: RoleConstructionSourceV1ParseIssue,
): void {
  if (!issues.some((current) => current.code === issue.code && current.path === issue.path)) {
    issues.push(issue)
  }
}

function checkKeys(
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: RoleConstructionSourceV1ParseIssue[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  for (const key of Object.keys(value).sort()) {
    if (!allowed.includes(key)) {
      addIssue(issues, {
        code: 'unknown-field',
        path: `${path}.${key}`,
        message: `RoleConstruction v1에 정의되지 않은 필드입니다: ${path}.${key}`,
      })
    }
  }
  return true
}

function inspectPosition(
  value: unknown,
  path: string,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  if (!isRecord(value)) return
  if (value.kind === 'absolute') checkKeys(value, path, ['kind', 'value'], issues)
  else if (value.kind === 'between') {
    checkKeys(value, path, ['kind', 'fromRailId', 'toRailId', 'ratio'], issues)
  } else checkKeys(value, path, ['kind'], issues)
}

function inspectRail(
  value: unknown,
  path: string,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  if (!checkKeys(value, path, ['id', 'kind', 'coreRole', 'position'], issues)) return
  inspectPosition(value.position, `${path}.position`, issues)
}

function inspectPoint(
  value: unknown,
  path: string,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  checkKeys(value, path, ['id', 'xRailId', 'yRailId'], issues)
}

function inspectReferenceTarget(
  value: unknown,
  path: string,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  if (!isRecord(value)) return
  if (value.kind === 'centerline-point') {
    checkKeys(value, path, [
      'kind', 'masterId', 'channel', 'elementId', 'anchorId', 'referenceId', 'slot', 'axis',
    ], issues)
  } else if (value.kind === 'boundary-point') {
    checkKeys(value, path, [
      'kind', 'masterId', 'channel', 'elementId', 'treatmentId', 'referenceId', 'slot', 'axis',
    ], issues)
  } else if (value.kind === 'cell-edge') {
    checkKeys(value, path, ['kind', 'masterId', 'channel', 'elementId', 'cellId', 'edge'], issues)
  } else checkKeys(value, path, ['kind'], issues)
}

function inspectElement(
  value: unknown,
  path: string,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  if (!isRecord(value)) return
  if (value.kind === 'centerline') {
    if (!checkKeys(value, path, [
      'id', 'kind', 'anchors', 'closed', 'thickness', 'linecap', 'linejoin',
    ], issues)) return
    if (Array.isArray(value.anchors)) value.anchors.forEach((anchor, index) => {
      const anchorPath = `${path}.anchors[${index}]`
      if (!checkKeys(anchor, anchorPath, ['id', 'point', 'handleIn', 'handleOut'], issues)) return
      inspectPoint(anchor.point, `${anchorPath}.point`, issues)
      if (anchor.handleIn !== undefined) inspectPoint(anchor.handleIn, `${anchorPath}.handleIn`, issues)
      if (anchor.handleOut !== undefined) inspectPoint(anchor.handleOut, `${anchorPath}.handleOut`, issues)
    })
    return
  }
  if (value.kind === 'area') {
    if (!checkKeys(value, path, ['id', 'kind', 'filledCells', 'boundaryTreatments'], issues)) return
    if (Array.isArray(value.filledCells)) value.filledCells.forEach((cell, index) => {
      checkKeys(cell, `${path}.filledCells[${index}]`, [
        'id', 'leftRailId', 'rightRailId', 'topRailId', 'bottomRailId',
      ], issues)
    })
    if (Array.isArray(value.boundaryTreatments)) value.boundaryTreatments.forEach((treatment, index) => {
      const treatmentPath = `${path}.boundaryTreatments[${index}]`
      if (!isRecord(treatment)) return
      const allowed = treatment.kind === 'curve'
        ? ['id', 'kind', 'vertex', 'from', 'to', 'tension']
        : treatment.kind === 'diagonal' ? ['id', 'kind', 'vertex', 'from', 'to'] : ['id', 'kind']
      if (!checkKeys(treatment, treatmentPath, allowed, issues)) return
      inspectPoint(treatment.vertex, `${treatmentPath}.vertex`, issues)
      inspectPoint(treatment.from, `${treatmentPath}.from`, issues)
      inspectPoint(treatment.to, `${treatmentPath}.to`, issues)
    })
    return
  }
  checkKeys(value, path, ['id', 'kind'], issues)
}

function inspectVariant(
  value: unknown,
  path: string,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  if (!checkKeys(value, path, [
    'id', 'context', 'presetId', 'coreRailOverrides', 'auxiliaryRails', 'referenceOverrides',
  ], issues)) return
  checkKeys(value.context, `${path}.context`, [
    'baseContext', 'medialClass', 'finalWidthClass', 'initialClass',
  ], issues)
  if (value.coreRailOverrides !== undefined && isRecord(value.coreRailOverrides)) {
    for (const [role, position] of Object.entries(value.coreRailOverrides).sort(([a], [b]) => a.localeCompare(b))) {
      if (!CORE_ROLES.has(role)) {
        addIssue(issues, {
          code: 'unknown-field', path: `${path}.coreRailOverrides.${role}`,
          message: `알 수 없는 core Rail role입니다: ${role}`,
        })
      }
      inspectPosition(position, `${path}.coreRailOverrides.${role}`, issues)
    }
  }
  if (value.auxiliaryRails !== undefined
    && checkKeys(value.auxiliaryRails, `${path}.auxiliaryRails`, ['xRails', 'yRails'], issues)) {
    for (const axis of ['xRails', 'yRails'] as const) {
      const rails = value.auxiliaryRails[axis]
      if (Array.isArray(rails)) rails.forEach((rail, index) =>
        inspectRail(rail, `${path}.auxiliaryRails.${axis}[${index}]`, issues))
    }
  }
  if (Array.isArray(value.referenceOverrides)) value.referenceOverrides.forEach((override, index) => {
    const overridePath = `${path}.referenceOverrides[${index}]`
    if (!checkKeys(override, overridePath, ['id', 'target', 'railId'], issues)) return
    inspectReferenceTarget(override.target, `${overridePath}.target`, issues)
  })
}

function inspectKnownFields(
  source: Record<string, unknown>,
  issues: RoleConstructionSourceV1ParseIssue[],
): void {
  checkKeys(source, '$', ['schema', 'version', 'grid', 'masters'], issues)
  if (checkKeys(source.grid, '$.grid', ['id', 'role', 'xRails', 'yRails', 'snapStep', 'minGap'], issues)) {
    for (const axis of ['xRails', 'yRails'] as const) {
      const rails = source.grid[axis]
      if (Array.isArray(rails)) rails.forEach((rail, index) => inspectRail(rail, `$.grid.${axis}[${index}]`, issues))
    }
  }
  if (!Array.isArray(source.masters)) return
  source.masters.forEach((master, masterIndex) => {
    const masterPath = `$.masters[${masterIndex}]`
    if (!checkKeys(master, masterPath, ['id', 'jamoId', 'role', 'construction', 'contextVariants'], issues)) return
    if (checkKeys(master.construction, `${masterPath}.construction`, ['channels'], issues)
      && checkKeys(master.construction.channels, `${masterPath}.construction.channels`, [
        'main', 'horizontal', 'vertical',
      ], issues)) {
      for (const channelName of ['main', 'horizontal', 'vertical'] as const) {
        const channel = master.construction.channels[channelName]
        if (channel === undefined) continue
        const channelPath = `${masterPath}.construction.channels.${channelName}`
        if (!checkKeys(channel, channelPath, ['role', 'gridId', 'elements'], issues)) continue
        if (Array.isArray(channel.elements)) channel.elements.forEach((element, index) =>
          inspectElement(element, `${channelPath}.elements[${index}]`, issues))
      }
    }
    if (Array.isArray(master.contextVariants)) master.contextVariants.forEach((variant, index) =>
      inspectVariant(variant, `${masterPath}.contextVariants[${index}]`, issues))
  })
}

export function parseRoleConstructionSourceV1(
  value: unknown,
  options: { knownPresetIds?: ReadonlySet<string> } = {},
): RoleConstructionSourceV1ParseResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'RoleConstruction source root는 객체여야 합니다.' }] }
  }
  if (value.schema !== 'role-construction') {
    return { ok: false, issues: [{ code: 'unsupported-schema', path: '$.schema', message: `지원하지 않는 source schema입니다: ${String(value.schema)}` }] }
  }
  if (value.version !== 1) {
    return { ok: false, issues: [{ code: 'unsupported-version', path: '$.version', message: `지원하지 않는 source version입니다: ${String(value.version)}` }] }
  }
  const issues: RoleConstructionSourceV1ParseIssue[] = []
  inspectKnownFields(value, issues)
  let clone: unknown
  try {
    clone = structuredClone(value)
  } catch {
    return {
      ok: false,
      issues: [{ code: 'invalid-source', path: '$', message: 'RoleConstruction source를 안전하게 복제할 수 없습니다.' }],
    }
  }
  const sourceValidation = validateRoleConstructionScope(clone)
  if (!sourceValidation.ok) {
    addIssue(issues, {
      code: 'invalid-source', path: '$',
      message: `RoleConstruction source가 유효하지 않습니다: ${sourceValidation.issues.map(({ code }) => code).join(', ')}`,
    })
  }
  try {
    const variantValidation = validateJamoContextVariants(clone, options)
    if (!variantValidation.ok) {
      addIssue(issues, {
        code: 'invalid-variants', path: '$.masters',
        message: `문맥 variant가 유효하지 않습니다: ${variantValidation.issues.map(({ code }) => code).join(', ')}`,
      })
    }
  } catch {
    addIssue(issues, {
      code: 'invalid-variants', path: '$.masters',
      message: '문맥 variant 구조를 안전하게 해석할 수 없습니다.',
    })
  }
  issues.sort((first, second) => `${first.path}\u0000${first.code}`.localeCompare(`${second.path}\u0000${second.code}`))
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, source: clone as DeepReadonly<RoleConstructionScope> as ValidatedRoleConstructionSourceV1 }
}
