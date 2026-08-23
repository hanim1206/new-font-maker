import type {
  AnchorPoint,
  BoxConfig,
  DeepReadonly,
  GridCenterlineElement,
  GridPointRef,
  JamoConstructionChannel,
  JamoRoleMaster,
  JamoVariantContext,
  Part,
  PartGridSlotProjectionResult,
  ResolvedCenterlinePrimitive,
  ResolvedInkPrimitive,
  ResolvedPartGridInkSource,
  ResolvedRailGrid,
  RoleConstructionScope,
  SlotProjectedPartGrid,
  StrokeLinecap,
  StrokeLinejoin,
} from '../types'
import { gridCellToInkRegion, validateRoleConstructionScope } from './jamoConstruction'
import { partForJamoRole } from './jamoContextRoles'
import { resolveContextualPartGrid } from './contextPartGridResolver'
import { projectPartGridToSlot } from './partGridSlotProjection'

export type ShapeGlyphInkIssueCode =
  | 'invalid-request'
  | 'invalid-source'
  | 'missing-master'
  | 'role-mismatch'
  | 'missing-rail'
  | 'unsupported-boundary-treatment'
  | 'empty-construction'

export interface ShapeGlyphInkIssue {
  code: ShapeGlyphInkIssueCode
  message: string
  masterId?: string
  elementId?: string
  referenceId?: string
}

export type ShapeGlyphInkResolutionResult =
  | {
    ok: true
    primitives: ResolvedInkPrimitive[]
    grid: SlotProjectedPartGrid
    master: JamoRoleMaster
    provenance: SuccessfulPartGridSlotProjection['provenance']
  }
  | { ok: false; issues: ShapeGlyphInkIssue[] }

export interface ResolveShapeGlyphInkInput {
  source: DeepReadonly<RoleConstructionScope>
  masterId: string
  glyphId: string
  part: Part
  slot: Readonly<BoxConfig>
  weightMultiplier: number
  globalLinecap?: StrokeLinecap
  globalLinejoin?: StrokeLinejoin
}

type SuccessfulPartGridSlotProjection = Extract<PartGridSlotProjectionResult, { ok: true }>

export interface ResolveProjectedShapeGlyphInkInput {
  projection: DeepReadonly<SuccessfulPartGridSlotProjection>
  glyphId: string
  weightMultiplier: number
  globalLinecap?: StrokeLinecap
  globalLinejoin?: StrokeLinejoin
}

export type ProjectedShapeGlyphInkResolutionResult =
  | {
    ok: true
    primitives: ResolvedInkPrimitive[]
    grid: SlotProjectedPartGrid
    master: JamoRoleMaster
    provenance: SuccessfulPartGridSlotProjection['provenance']
  }
  | { ok: false; issues: ShapeGlyphInkIssue[] }

type PrimitiveResolutionResult =
  | { ok: true; primitives: ResolvedInkPrimitive[] }
  | { ok: false; issues: ShapeGlyphInkIssue[] }

function primitiveId(kind: 'centerline' | 'region', source: ResolvedPartGridInkSource, leafId?: string): string {
  return [kind, source.glyphId, source.part, source.jamoId, source.elementId, leafId]
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => encodeURIComponent(segment))
    .join(':')
}

function channelForMaster(master: DeepReadonly<JamoRoleMaster>): DeepReadonly<JamoConstructionChannel> {
  if (master.role === 'JU_H') return master.construction.channels.horizontal
  if (master.role === 'JU_V') return master.construction.channels.vertical
  return master.construction.channels.main
}

function railMaps(grid: DeepReadonly<Pick<ResolvedRailGrid, 'xRails' | 'yRails'>>) {
  return {
    x: new Map(grid.xRails.map((rail) => [rail.id, rail.value])),
    y: new Map(grid.yRails.map((rail) => [rail.id, rail.value])),
  }
}

function resolveConstructionPrimitives(input: {
  master: DeepReadonly<JamoRoleMaster>
  sourceGridId: string
  grid: DeepReadonly<Pick<ResolvedRailGrid, 'xRails' | 'yRails'>>
  glyphId: string
  part: Part
  weightMultiplier: number
  globalLinecap?: StrokeLinecap
  globalLinejoin?: StrokeLinejoin
}): PrimitiveResolutionResult {
  const channel = channelForMaster(input.master)
  if (channel.gridId !== input.sourceGridId || channel.role !== input.master.role) {
    return {
      ok: false,
      issues: [{
        code: 'role-mismatch', masterId: input.master.id,
        message: 'construction channel의 역할 또는 gridId가 다릅니다.',
      }],
    }
  }
  const maps = railMaps(input.grid)
  const primitives: ResolvedInkPrimitive[] = []
  for (const element of channel.elements) {
    const source: ResolvedPartGridInkSource = {
      kind: 'part-grid', glyphId: input.glyphId, part: input.part,
      jamoId: input.master.jamoId, elementId: element.id,
    }
    if (element.kind === 'centerline') {
      const resolved = resolveCenterline(element, maps)
      if ('issue' in resolved) return { ok: false, issues: [resolved.issue] }
      const primitive: ResolvedCenterlinePrimitive<ResolvedPartGridInkSource> = {
        kind: 'centerline',
        coordinateSpace: 'stroke-local-with-glyph-box',
        id: primitiveId('centerline', source),
        source,
        stroke: {
          id: element.id,
          points: resolved.points,
          closed: element.closed,
          thickness: element.thickness,
          linecap: element.linecap,
          linejoin: element.linejoin,
        },
        box: { x: 0, y: 0, width: 1, height: 1 },
        weightMultiplier: input.weightMultiplier,
        effectiveLinecap: element.linecap ?? input.globalLinecap ?? 'round',
        effectiveLinejoin: element.linejoin ?? input.globalLinejoin ?? 'round',
      }
      primitives.push(primitive)
      continue
    }
    if (element.boundaryTreatments.length > 0) {
      return {
        ok: false,
        issues: [{
          code: 'unsupported-boundary-treatment',
          masterId: input.master.id,
          elementId: element.id,
          message: '곡률·사선 boundary treatment는 공통 윤곽 변환이 연결되기 전에는 무시할 수 없습니다.',
        }],
      }
    }
    for (const cell of element.filledCells) {
      const region = gridCellToInkRegion(cell, input.grid)
      if (!region) {
        return {
          ok: false,
          issues: [{
            code: 'missing-rail', masterId: input.master.id, elementId: element.id,
            referenceId: cell.id, message: '점유 셀 Rail 경계를 해석할 수 없습니다.',
          }],
        }
      }
      primitives.push({
        kind: 'region',
        coordinateSpace: 'glyph-normalized',
        id: primitiveId('region', source, cell.id),
        source,
        region,
      })
    }
  }
  if (primitives.length === 0) {
    return {
      ok: false,
      issues: [{
        code: 'empty-construction', masterId: input.master.id,
        message: '최종 잉크로 만들 construction element가 없습니다.',
      }],
    }
  }
  return { ok: true, primitives }
}

function resolvePoint(
  point: DeepReadonly<GridPointRef>,
  grid: ReturnType<typeof railMaps>,
): AnchorPoint | null {
  const x = grid.x.get(point.xRailId)
  const y = grid.y.get(point.yRailId)
  return x === undefined || y === undefined ? null : { x, y }
}

function resolveCenterline(
  element: DeepReadonly<GridCenterlineElement>,
  grid: ReturnType<typeof railMaps>,
): { points: AnchorPoint[] } | { issue: ShapeGlyphInkIssue } {
  const points: AnchorPoint[] = []
  for (const anchor of element.anchors) {
    const point = resolvePoint(anchor.point, grid)
    const handleIn = anchor.handleIn ? resolvePoint(anchor.handleIn, grid) : undefined
    const handleOut = anchor.handleOut ? resolvePoint(anchor.handleOut, grid) : undefined
    if (!point || (anchor.handleIn && !handleIn) || (anchor.handleOut && !handleOut)) {
      return {
        issue: {
          code: 'missing-rail',
          message: `중심선 ${element.id}의 Rail 참조를 해석할 수 없습니다.`,
          elementId: element.id,
          referenceId: anchor.id,
        },
      }
    }
    points.push({ ...point, ...(handleIn ? { handleIn } : {}), ...(handleOut ? { handleOut } : {}) })
  }
  return { points }
}

const EMPTY_CONTEXT_PRESET_CATALOG = {
  schema: 'context-grid-preset-catalog',
  version: 1,
  roleDefaults: [],
  contextPresets: [],
} as const

function representativeContext(role: JamoRoleMaster['role']): JamoVariantContext {
  if (role === 'STANDALONE') return { baseContext: 'choseong-only' }
  if (role === 'JU_VERTICAL') return { baseContext: 'vertical' }
  if (role === 'JU_HORIZONTAL') return { baseContext: 'horizontal' }
  if (role === 'JU_H' || role === 'JU_V') return { baseContext: 'mixed' }
  if (role === 'JO') return { baseContext: 'horizontal-with-jongseong' }
  return { baseContext: 'horizontal' }
}

/**
 * 검증된 역할 마스터의 Rail 기반 선·면 원본을 글리프 좌표 primitive로 해석한다.
 * 문맥 선택과 layout slot 선택은 호출자가 끝낸 뒤 이 순수 경계에 전달한다.
 */
export function resolveShapeGlyphInkPrimitives(
  input: ResolveShapeGlyphInkInput,
): ShapeGlyphInkResolutionResult {
  if (!input || typeof input !== 'object' || typeof input.glyphId !== 'string'
    || !input.slot || typeof input.slot !== 'object') {
    return { ok: false, issues: [{ code: 'invalid-request', message: 'Shape primitive 요청이 유효하지 않습니다.' }] }
  }
  const slotValues = [input.slot.x, input.slot.y, input.slot.width, input.slot.height]
  if (!input.glyphId.trim() || slotValues.some((value) => !Number.isFinite(value))
    || input.slot.width <= 0 || input.slot.height <= 0
    || !Number.isFinite(input.weightMultiplier) || input.weightMultiplier <= 0) {
    return { ok: false, issues: [{ code: 'invalid-request', message: 'glyphId, slot, weightMultiplier가 유효해야 합니다.' }] }
  }
  const validation = validateRoleConstructionScope(input.source)
  if (!validation.ok) {
    return { ok: false, issues: [{ code: 'invalid-source', message: '역할 마스터 또는 RailGrid가 유효하지 않습니다.' }] }
  }
  const master = input.source.masters.find(({ id }) => id === input.masterId)
  if (!master) {
    return { ok: false, issues: [{ code: 'missing-master', masterId: input.masterId, message: 'Shape master를 찾을 수 없습니다.' }] }
  }
  if (master.role !== input.source.grid.role) {
    return { ok: false, issues: [{ code: 'role-mismatch', masterId: master.id, message: 'master 역할과 part grid 역할이 다릅니다.' }] }
  }
  if (partForJamoRole(master.role) !== input.part) {
    return { ok: false, issues: [{ code: 'role-mismatch', masterId: master.id, message: 'master 역할과 출력 part가 다릅니다.' }] }
  }
  let baseSource: RoleConstructionScope
  try {
    baseSource = structuredClone(input.source) as RoleConstructionScope
  } catch {
    return { ok: false, issues: [{ code: 'invalid-source', message: '역할 마스터 원본을 안전하게 복제할 수 없습니다.' }] }
  }
  for (const candidate of baseSource.masters) delete candidate.contextVariants
  const contextual = resolveContextualPartGrid({
    source: baseSource,
    catalog: EMPTY_CONTEXT_PRESET_CATALOG,
    masterId: master.id,
    requestedContext: representativeContext(master.role),
  })
  if (!contextual.ok) {
    return { ok: false, issues: [{ code: 'invalid-source', masterId: master.id, message: contextual.issues[0]?.message ?? 'base master를 해석할 수 없습니다.' }] }
  }
  const projection = projectPartGridToSlot({ contextual, part: input.part, slot: input.slot })
  if (!projection.ok) {
    return { ok: false, issues: [{ code: 'invalid-source', masterId: master.id, message: projection.issues[0]?.message ?? 'part grid를 투영할 수 없습니다.' }] }
  }
  return resolveProjectedShapeGlyphInkPrimitives({
    projection,
    glyphId: input.glyphId,
    weightMultiplier: input.weightMultiplier,
    globalLinecap: input.globalLinecap,
    globalLinejoin: input.globalLinejoin,
  })
}

/**
 * slot 투영이 끝난 Rail을 다시 변환하지 않고 Shape primitive로 해석한다.
 * 중심선은 glyph 좌표 + identity box, 면은 glyph 좌표 region을 그대로 사용한다.
 */
export function resolveProjectedShapeGlyphInkPrimitives(
  input: ResolveProjectedShapeGlyphInkInput,
): ProjectedShapeGlyphInkResolutionResult {
  if (!input || typeof input !== 'object' || !input.projection || input.projection.ok !== true
    || typeof input.glyphId !== 'string' || input.glyphId.trim() === ''
    || !Number.isFinite(input.weightMultiplier) || input.weightMultiplier <= 0) {
    return { ok: false, issues: [{ code: 'invalid-request', message: '투영 결과, glyphId, weightMultiplier가 유효해야 합니다.' }] }
  }
  let projection: SuccessfulPartGridSlotProjection
  try {
    projection = structuredClone(input.projection) as SuccessfulPartGridSlotProjection
  } catch {
    return { ok: false, issues: [{ code: 'invalid-request', message: '투영 결과를 안전하게 복제할 수 없습니다.' }] }
  }
  const { resolvedPartGrid: grid, master } = projection
  if (grid.coordinateSpace !== 'glyph-normalized'
    || master.role !== grid.role
    || partForJamoRole(master.role) !== grid.part) {
    return {
      ok: false,
      issues: [{ code: 'role-mismatch', masterId: master.id, message: '투영 grid, master, part의 역할이 맞지 않습니다.' }],
    }
  }
  const result = resolveConstructionPrimitives({
    master,
    sourceGridId: grid.sourceGridId,
    grid,
    glyphId: input.glyphId,
    part: grid.part,
    weightMultiplier: input.weightMultiplier,
    globalLinecap: input.globalLinecap,
    globalLinejoin: input.globalLinejoin,
  })
  return result.ok
    ? { ...result, grid, master, provenance: projection.provenance }
    : result
}
