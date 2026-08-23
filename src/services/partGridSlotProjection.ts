import type {
  BoxConfig,
  DeepReadonly,
  GridProvenance,
  GridValueProvenance,
  JamoVariantContext,
  Part,
  PartGridSlotProjectionResult,
  ResolvedShapeRail,
  SuccessfulContextPartGridResolution,
} from '../types'
import { isContextAllowedForRole, isJamoPartRole, partForJamoRole } from './jamoContextRoles'
import { isValidJamoVariantContext } from './jamoContextVariants'
import { resolveRailGrid } from './railGridResolver'

const PARTS = new Set<string>(['CH', 'JU', 'JU_H', 'JU_V', 'JO'])

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isExactSlot(value: unknown): value is DeepReadonly<BoxConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.length !== 4 || keys.join('|') !== 'height|width|x|y') return false
  if (!['x', 'y', 'width', 'height'].every((key) => hasOwn(value, key))) return false
  const slot = value as Partial<BoxConfig>
  return [slot.x, slot.y, slot.width, slot.height].every((entry) =>
    typeof entry === 'number' && Number.isFinite(entry))
    && slot.width! > 0
    && slot.height! > 0
}

function isGridValueProvenance(value: unknown): value is GridValueProvenance {
  if (!isRecord(value) || !hasOwn(value, 'source')) return false
  if (value.source === 'master') return hasExactKeys(value, ['source'])
  if (value.source === 'role-default' || value.source === 'context-preset') {
    return hasExactKeys(value, ['source', 'presetId'])
      && typeof value.presetId === 'string' && value.presetId.trim() !== ''
  }
  if (value.source === 'jamo-override') {
    return hasExactKeys(value, ['source', 'variantId'])
      && typeof value.variantId === 'string' && value.variantId.trim() !== ''
  }
  return false
}

function isContextFallbackOf(
  candidate: DeepReadonly<JamoVariantContext>,
  requested: DeepReadonly<JamoVariantContext>,
): boolean {
  return candidate.baseContext === requested.baseContext
    && (candidate.medialClass === undefined || candidate.medialClass === requested.medialClass)
    && (candidate.finalWidthClass === undefined || candidate.finalWidthClass === requested.finalWidthClass)
    && (candidate.initialClass === undefined || candidate.initialClass === requested.initialClass)
}

function isValidProvenance(
  value: unknown,
  railIds: readonly string[],
  role: SuccessfulContextPartGridResolution['grid']['role'],
): value is DeepReadonly<GridProvenance> {
  if (!isRecord(value)) return false
  const allowed = [
    'railSources', 'referenceSources', 'selectedPresetIds', 'selectedVariantId',
    'selectedVariantContext', 'requestedContext', 'selectedContextPresetContext',
  ] as const
  if (!Object.keys(value).every((key) => allowed.includes(key as typeof allowed[number]))) return false
  if (allowed.some((key) => key in value && !hasOwn(value, key))) return false
  if (!['railSources', 'referenceSources', 'selectedPresetIds', 'requestedContext']
    .every((key) => hasOwn(value, key))) return false
  if (!isRecord(value.railSources) || !isRecord(value.referenceSources)
    || !Array.isArray(value.selectedPresetIds)
    || !isValidJamoVariantContext(value.requestedContext)
    || !isContextAllowedForRole(role, value.requestedContext.baseContext)) return false
  const actualRailIds = Object.keys(value.railSources).sort()
  const expectedRailIds = [...railIds].sort()
  if (actualRailIds.length !== expectedRailIds.length
    || actualRailIds.some((id, index) => id !== expectedRailIds[index])) return false
  if (!Object.values(value.railSources).every(isGridValueProvenance)
    || !Object.entries(value.referenceSources)
      .every(([key, source]) => key.trim() !== '' && isGridValueProvenance(source))) return false
  if (!value.selectedPresetIds.every((id): id is string => typeof id === 'string' && id.trim() !== '')
    || new Set(value.selectedPresetIds).size !== value.selectedPresetIds.length) return false
  if (value.selectedVariantId !== undefined
    && (typeof value.selectedVariantId !== 'string' || value.selectedVariantId.trim() === '')) return false
  if (value.selectedVariantContext !== undefined
    && (!isValidJamoVariantContext(value.selectedVariantContext)
      || !isContextAllowedForRole(role, value.selectedVariantContext.baseContext)
      || !isContextFallbackOf(value.selectedVariantContext, value.requestedContext))) return false
  if ((value.selectedVariantId === undefined) !== (value.selectedVariantContext === undefined)) return false
  return value.selectedContextPresetContext === undefined
    || (isValidJamoVariantContext(value.selectedContextPresetContext)
      && isContextAllowedForRole(role, value.selectedContextPresetContext.baseContext)
      && isContextFallbackOf(value.selectedContextPresetContext, value.requestedContext))
}

type AxisProjection =
  | { ok: true; rails: ResolvedShapeRail[] }
  | { ok: false; code: 'non-finite-projection' | 'degenerate-projection' }

function projectRails(
  rails: readonly DeepReadonly<ResolvedShapeRail>[],
  origin: number,
  scale: number,
): AxisProjection {
  const projected = rails.map((rail) => ({
    ...rail,
    value: origin + rail.value * scale,
  }))
  if (!projected.every(({ value }) => Number.isFinite(value))) {
    return { ok: false, code: 'non-finite-projection' }
  }
  if (projected.some((rail, index) => index > 0 && rail.value <= projected[index - 1].value)) {
    return { ok: false, code: 'degenerate-projection' }
  }
  return { ok: true, rails: projected }
}

/**
 * 검증된 로컬 context part grid를 calculateBoxes()가 만든 최종 slot에 한 번 투영한다.
 * Design Body, 저장, construction 해석은 이 서비스의 책임이 아니다.
 */
export function projectPartGridToSlot(input: {
  contextual: DeepReadonly<SuccessfulContextPartGridResolution>
  part: Part
  slot: DeepReadonly<BoxConfig>
}): PartGridSlotProjectionResult {
  if (!input || typeof input !== 'object'
    || !input.contextual || input.contextual.ok !== true
    || typeof input.part !== 'string' || !PARTS.has(input.part)) {
    return { ok: false, issues: [{ code: 'invalid-request', message: 'part grid 투영 요청이 유효하지 않습니다.' }] }
  }
  if (!isExactSlot(input.slot)) {
    return { ok: false, issues: [{ code: 'invalid-slot', message: 'slot은 유한한 위치와 양의 크기를 가져야 합니다.' }] }
  }
  const local = resolveRailGrid(input.contextual.grid)
  if (!local.ok) {
    return {
      ok: false,
      issues: [{
        code: 'invalid-contextual-grid',
        message: 'context part grid를 해석할 수 없습니다.',
        causeCodes: local.issues.map(({ code }) => code),
      }],
    }
  }
  if (!isJamoPartRole(local.grid.role) || partForJamoRole(local.grid.role) !== input.part) {
    return {
      ok: false,
      issues: [{
        code: 'role-part-mismatch',
        message: `role ${local.grid.role}은 ${input.part} slot에 투영할 수 없습니다.`,
      }],
    }
  }
  const railIds = [...local.grid.xRails, ...local.grid.yRails].map(({ id }) => id)
  if (!isValidProvenance(input.contextual.provenance, railIds, local.grid.role)) {
    return {
      ok: false,
      issues: [{ code: 'invalid-provenance', message: 'context part grid provenance가 Rail 결과와 맞지 않습니다.' }],
    }
  }
  if (!input.contextual.master || input.contextual.master.role !== local.grid.role) {
    return {
      ok: false,
      issues: [{ code: 'invalid-request', message: 'context master와 grid role이 맞지 않습니다.' }],
    }
  }
  const xRails = projectRails(local.grid.xRails, input.slot.x, input.slot.width)
  const yRails = projectRails(local.grid.yRails, input.slot.y, input.slot.height)
  if (!xRails.ok || !yRails.ok) {
    const code = !xRails.ok ? xRails.code : !yRails.ok ? yRails.code : 'non-finite-projection'
    return {
      ok: false,
      issues: [{
        code,
        message: code === 'degenerate-projection'
          ? 'slot 투영에서 인접 Rail이 같은 좌표로 붕괴했습니다.'
          : 'slot 투영 결과가 유한하지 않습니다.',
      }],
    }
  }
  let provenance: GridProvenance
  let master: SuccessfulContextPartGridResolution['master']
  try {
    provenance = structuredClone(input.contextual.provenance) as GridProvenance
    master = structuredClone(input.contextual.master) as SuccessfulContextPartGridResolution['master']
  } catch {
    return {
      ok: false,
      issues: [{ code: 'invalid-request', message: 'context 결과를 안전하게 복제할 수 없습니다.' }],
    }
  }
  return {
    ok: true,
    resolvedPartGrid: {
      coordinateSpace: 'glyph-normalized',
      sourceGridId: local.grid.id,
      role: local.grid.role,
      part: input.part,
      slot: { ...input.slot },
      xRails: xRails.rails,
      yRails: yRails.rails,
    },
    master,
    provenance,
  }
}
