import { describe, expect, it } from 'vitest'
import type {
  BoundaryTreatment,
  GridAreaElement,
  GridCenterlineElement,
  GridProvenance,
  GridPointRef,
  InkPoint,
  InkRegion,
  JamoConstructionElement,
  JamoPartRole,
  RoleConstructionScope,
} from '../types'
import { createBasePartGrid } from './railGridResolver'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createJamoRoleMasterId,
  expectedConstructionChannel,
} from './jamoConstruction'
import { partForJamoRole } from './jamoContextRoles'
import { collectConstructionReferenceRails } from './jamoContextVariants'
import { projectPartGridToSlot } from './partGridSlotProjection'
import {
  resolveProjectedShapeGlyphInkPrimitives,
  resolveShapeGlyphInkPrimitives,
} from './shapeGlyphInkResolver'
import {
  finalGlyphInkToSvgPath,
  materializeFinalGlyphInk,
  projectFinalGlyphInkToFontContours,
  resolveFinalInkEllipseVertexCount,
} from './finalGlyphInk'

const POSITION = {
  'outer-left': 0,
  'inner-left': 0.2,
  'center-x': 0.5,
  'inner-right': 0.8,
  'outer-right': 1,
  'outer-top': 0,
  'inner-top': 0.2,
  'center-y': 0.5,
  'inner-bottom': 0.8,
  'outer-bottom': 1,
} as const
const STYLE = { mode: 'brush' as const, brush: { tip: 'round' as const, aspectRatio: 0.5, angle: 0 } }
const MATERIALIZATION_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 } as const

function grid() {
  return createBasePartGrid({
    role: 'CH',
    xCorePositions: {
      'outer-left': POSITION['outer-left'], 'inner-left': POSITION['inner-left'], 'center-x': POSITION['center-x'],
      'inner-right': POSITION['inner-right'], 'outer-right': POSITION['outer-right'],
    },
    yCorePositions: {
      'outer-top': POSITION['outer-top'], 'inner-top': POSITION['inner-top'], 'center-y': POSITION['center-y'],
      'inner-bottom': POSITION['inner-bottom'], 'outer-bottom': POSITION['outer-bottom'],
    },
    snapStep: 0.025,
    minGap: 0.05,
  })
}

function rail(axis: 'x' | 'y', role: keyof typeof POSITION): string {
  return `part-grid:CH:${axis}:${role}`
}

function point(id: string, xRole: 'outer-left' | 'inner-left' | 'center-x' | 'inner-right' | 'outer-right', yRole: 'outer-top' | 'inner-top' | 'center-y' | 'inner-bottom' | 'outer-bottom'): GridPointRef {
  return { id, xRailId: rail('x', xRole), yRailId: rail('y', yRole) }
}

function cell(masterId: string, elementId: string, column: number, row: number) {
  const xRoles = ['outer-left', 'inner-left', 'center-x', 'inner-right', 'outer-right'] as const
  const yRoles = ['outer-top', 'inner-top', 'center-y', 'inner-bottom', 'outer-bottom'] as const
  const input = {
    masterId,
    channel: 'main' as const,
    elementId,
    leftRailId: rail('x', xRoles[column]),
    rightRailId: rail('x', xRoles[column + 1]),
    topRailId: rail('y', yRoles[row]),
    bottomRailId: rail('y', yRoles[row + 1]),
  }
  return { id: createGridCellId(input), ...input, masterId: undefined, channel: undefined, elementId: undefined }
}

function cleanCell(value: ReturnType<typeof cell>) {
  const { id, leftRailId, rightRailId, topRailId, bottomRailId } = value
  return { id, leftRailId, rightRailId, topRailId, bottomRailId }
}

function scope(jamoId: string, elements: JamoConstructionElement[]): RoleConstructionScope {
  const roleGrid = grid()
  return {
    schema: 'role-construction',
    version: 1,
    grid: roleGrid,
    masters: [{
      id: createJamoRoleMasterId(jamoId, 'CH'),
      jamoId,
      role: 'CH',
      construction: { channels: { main: { role: 'CH', gridId: roleGrid.id, elements } } },
    }],
  }
}

function areaElement(jamoId: string, kind: 'top' | 'ring', treatment?: BoundaryTreatment): GridAreaElement {
  const masterId = createJamoRoleMasterId(jamoId, 'CH')
  const elementId = `area:${jamoId}`
  const cells = []
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
    if (kind === 'top' ? row === 0 : row === 0 || row === 3 || column === 0 || column === 3) {
      cells.push(cleanCell(cell(masterId, elementId, column, row)))
    }
  }
  return { id: elementId, kind: 'area', filledCells: cells, boundaryTreatments: treatment ? [treatment] : [] }
}

function lineElement(id: string, direction: 'vertical' | 'horizontal'): GridCenterlineElement {
  const first = direction === 'vertical'
    ? point(`${id}:from`, 'inner-right', 'outer-top')
    : point(`${id}:from`, 'outer-left', 'center-y')
  const second = direction === 'vertical'
    ? point(`${id}:to`, 'inner-right', 'outer-bottom')
    : point(`${id}:to`, 'outer-right', 'center-y')
  return {
    id,
    kind: 'centerline',
    anchors: [
      { id: `${id}:anchor:from`, point: first },
      { id: `${id}:anchor:to`, point: second },
    ],
    closed: false,
    thickness: 0.12,
  }
}

function resolve(source: RoleConstructionScope, slot = { x: 0, y: 0, width: 1, height: 1 }) {
  return resolveShapeGlyphInkPrimitives({
    source,
    masterId: source.masters[0].id,
    glyphId: source.masters[0].jamoId,
    part: 'CH',
    slot,
    weightMultiplier: 1,
  })
}

function resolveProjected(
  source: RoleConstructionScope,
  slot = { x: 0, y: 0, width: 1, height: 1 },
) {
  const master = source.masters[0]
  const requestedContext = master.role === 'STANDALONE'
    ? { baseContext: 'choseong-only' as const }
    : master.role === 'JU_VERTICAL'
      ? { baseContext: 'vertical' as const }
      : master.role === 'JU_HORIZONTAL'
        ? { baseContext: 'horizontal' as const }
        : master.role === 'JU_H' || master.role === 'JU_V'
          ? { baseContext: 'mixed' as const }
          : master.role === 'JO'
            ? { baseContext: 'horizontal-with-jongseong' as const }
            : { baseContext: 'horizontal' as const }
  const provenance: GridProvenance = {
    railSources: Object.fromEntries(
      [...source.grid.xRails, ...source.grid.yRails].map(({ id }) => [id, { source: 'master' }]),
    ),
    referenceSources: Object.fromEntries(
      [...collectConstructionReferenceRails(master)].map(([key]) => [key, { source: 'master' }]),
    ),
    selectedPresetIds: [],
    requestedContext,
  }
  const projection = projectPartGridToSlot({
    contextual: { ok: true, grid: source.grid, master, provenance },
    part: partForJamoRole(master.role),
    slot,
  })
  if (!projection.ok) return projection
  return resolveProjectedShapeGlyphInkPrimitives({
    projection,
    glyphId: master.jamoId,
    weightMultiplier: 1,
  })
}

function singleLineScope(role: JamoPartRole): RoleConstructionScope {
  const roleGrid = createBasePartGrid({
    role,
    xCorePositions: {
      'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
    },
    yCorePositions: {
      'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
    },
    snapStep: 0.025,
    minGap: 0.05,
  })
  const master = createEmptyJamoRoleMaster({ jamoId: `test-${role}`, role, gridId: roleGrid.id })
  const channel = master.construction.channels[expectedConstructionChannel(role)]!
  channel.elements.push({
    id: `line:${role}`,
    kind: 'centerline',
    anchors: [
      {
        id: `anchor:${role}:from`,
        point: {
          id: `point:${role}:from`,
          xRailId: roleGrid.xRails.find(({ coreRole }) => coreRole === 'outer-left')!.id,
          yRailId: roleGrid.yRails.find(({ coreRole }) => coreRole === 'outer-top')!.id,
        },
      },
      {
        id: `anchor:${role}:to`,
        point: {
          id: `point:${role}:to`,
          xRailId: roleGrid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!.id,
          yRailId: roleGrid.yRails.find(({ coreRole }) => coreRole === 'outer-bottom')!.id,
        },
      },
    ],
    closed: false,
    thickness: 0.08,
  })
  return { schema: 'role-construction', version: 1, grid: roleGrid, masters: [master] }
}

function pointInRing(target: InkPoint, ring: readonly InkPoint[]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]
    if ((current.y > target.y) !== (prior.y > target.y)
      && target.x < (prior.x - current.x) * (target.y - current.y) / (prior.y - current.y) + current.x) inside = !inside
  }
  return inside
}

function filled(target: InkPoint, regions: readonly InkRegion[]): boolean {
  return regions.flatMap((region) => [region.outer, ...region.holes]).filter((ring) => pointInRing(target, ring)).length % 2 === 1
}

function signedArea(ring: readonly InkPoint[]): number {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

describe('Shape master 공통 최종 InkRegion', () => {
  it.each([
    ['STANDALONE', 'CH'],
    ['CH', 'CH'],
    ['JU_VERTICAL', 'JU'],
    ['JU_HORIZONTAL', 'JU'],
    ['JU_H', 'JU_H'],
    ['JU_V', 'JU_V'],
    ['JO', 'JO'],
  ] as const)('%s master를 %s projected part로 해석한다', (role, part) => {
    const slot = role === 'JU_H'
      ? { x: 0.08, y: 0.12, width: 0.7, height: 0.18 }
      : role === 'JU_V'
        ? { x: 0.72, y: 0.2, width: 0.16, height: 0.65 }
        : { x: 0.1, y: 0.2, width: 0.3, height: 0.5 }
    const result = resolveProjected(singleLineScope(role), slot)
    if (!result.ok) throw new Error(result.issues[0]?.message)
    expect(result.grid.role).toBe(role)
    expect(result.grid.part).toBe(part)
    expect(result.master.role).toBe(role)
    expect(result.primitives).toHaveLength(1)
    const primitive = result.primitives[0]
    expect(primitive.source.part).toBe(part)
    if (primitive.kind !== 'centerline') throw new Error('centerline이 필요합니다.')
    expect(primitive.box).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(primitive.stroke.points[0]).toMatchObject({ x: slot.x, y: slot.y })
    expect(primitive.stroke.points[1]).toMatchObject({
      x: slot.x + slot.width,
      y: slot.y + slot.height,
    })
  })

  it('projected master의 role·part·channel gridId 결속을 fail-closed한다', () => {
    const source = singleLineScope('CH')
    const master = source.masters[0]
    const provenance: GridProvenance = {
      railSources: Object.fromEntries(
        [...source.grid.xRails, ...source.grid.yRails].map(({ id }) => [id, { source: 'master' }]),
      ),
      referenceSources: Object.fromEntries(
        [...collectConstructionReferenceRails(master)].map(([key]) => [key, { source: 'master' }]),
      ),
      selectedPresetIds: [],
      requestedContext: { baseContext: 'horizontal' },
    }
    const projection = projectPartGridToSlot({
      contextual: { ok: true, grid: source.grid, master, provenance },
      part: 'CH',
      slot: { x: 0.1, y: 0.2, width: 0.3, height: 0.5 },
    })
    if (!projection.ok) throw new Error(projection.issues[0]?.message)

    const wrongPart = structuredClone(projection)
    wrongPart.resolvedPartGrid.part = 'JO'
    expect(resolveProjectedShapeGlyphInkPrimitives({
      projection: wrongPart, glyphId: 'ㄱ', weightMultiplier: 1,
    })).toMatchObject({ ok: false, issues: [{ code: 'role-mismatch' }] })

    const wrongChannel = structuredClone(projection)
    wrongChannel.master.construction.channels.main!.gridId = 'other-grid'
    expect(resolveProjectedShapeGlyphInkPrimitives({
      projection: wrongChannel, glyphId: 'ㄱ', weightMultiplier: 1,
    })).toMatchObject({ ok: false, issues: [{ code: 'role-mismatch' }] })
  })

  it('projected consumer는 projection과 provenance를 바꾸지 않는다', () => {
    const source = singleLineScope('STANDALONE')
    const master = source.masters[0]
    const provenance: GridProvenance = {
      railSources: Object.fromEntries(
        [...source.grid.xRails, ...source.grid.yRails].map(({ id }) => [id, { source: 'master' }]),
      ),
      referenceSources: Object.fromEntries(
        [...collectConstructionReferenceRails(master)].map(([key]) => [key, { source: 'master' }]),
      ),
      selectedPresetIds: [],
      requestedContext: { baseContext: 'choseong-only' },
    }
    const projection = projectPartGridToSlot({
      contextual: { ok: true, grid: source.grid, master, provenance },
      part: 'CH',
      slot: { x: 0.1, y: 0.2, width: 0.3, height: 0.5 },
    })
    if (!projection.ok) throw new Error(projection.issues[0]?.message)
    const before = JSON.stringify(projection)
    deepFreeze(projection)
    const result = resolveProjectedShapeGlyphInkPrimitives({
      projection, glyphId: 'ㄱ', weightMultiplier: 1,
    })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(projection)).toBe(before)
    if (result.ok) expect(result.provenance).toEqual(projection.provenance)
  })

  it.each([
    ['ㄱ 선·면 교차', () => scope('ㄱ', [areaElement('ㄱ', 'top'), lineElement('line:giyeok-right', 'vertical')])],
    ['ㅇ hole', () => scope('ㅇ', [areaElement('ㅇ', 'ring')])],
    ['ㅇ hole 통과 선', () => scope('ㅇ', [areaElement('ㅇ', 'ring'), lineElement('line:ieung-center', 'horizontal')])],
  ] as const)('%s가 기존 직접 경로와 slot-projected 경로에서 같은 최종 윤곽을 만든다', (_label, createSource) => {
    const source = createSource()
    const slot = { x: 0.13, y: 0.07, width: 0.42, height: 0.68 }
    const direct = resolve(source, slot)
    const projected = resolveProjected(source, slot)
    if (!direct.ok) throw new Error(direct.issues[0]?.message)
    if (!projected.ok) throw new Error(projected.issues[0]?.message)
    expect(projected.primitives.map(({ id, kind, source }) => ({ id, kind, source })))
      .toEqual(direct.primitives.map(({ id, kind, source }) => ({ id, kind, source })))
    const directFinal = materializeFinalGlyphInk(direct.primitives, STYLE, MATERIALIZATION_OPTIONS)
    const projectedFinal = materializeFinalGlyphInk(projected.primitives, STYLE, MATERIALIZATION_OPTIONS)
    if (!directFinal.ok || !projectedFinal.ok) throw new Error('최종 잉크를 만들 수 없습니다.')
    expect(projectedFinal.ink).toEqual(directFinal.ink)
    expect(finalGlyphInkToSvgPath(projectedFinal.ink)).toBe(finalGlyphInkToSvgPath(directFinal.ink))
    expect(projectFinalGlyphInkToFontContours(projectedFinal.ink, {
      upm: 1000, ascender: 880, slant: 7, originX: 0.03,
    })).toEqual(projectFinalGlyphInkToFontContours(directFinal.ink, {
      upm: 1000, ascender: 880, slant: 7, originX: 0.03,
    }))
  })

  it('실제 ㄱ의 점유 면과 중심선 교차를 한 positive region으로 합친다', () => {
    const source = scope('ㄱ', [areaElement('ㄱ', 'top'), lineElement('line:giyeok-right', 'vertical')])
    const frozen = JSON.stringify(source)
    const result = resolve(source)
    if (!result.ok) throw new Error(result.issues[0]?.message)
    const final = materializeFinalGlyphInk(result.primitives, STYLE, MATERIALIZATION_OPTIONS)
    if (!final.ok) throw new Error(final.message)

    expect(final.ink.regions).toHaveLength(1)
    expect(final.ink.regions[0].holes).toHaveLength(0)
    expect(filled({ x: 0.8, y: 0.12 }, final.ink.regions)).toBe(true)
    expect(filled({ x: 0.8, y: 0.65 }, final.ink.regions)).toBe(true)
    expect(JSON.stringify(source)).toBe(frozen)
  })

  it('실제 점유 셀 ㅇ의 outer와 hole을 유지한다', () => {
    const source = scope('ㅇ', [areaElement('ㅇ', 'ring')])
    const result = resolve(source)
    if (!result.ok) throw new Error(result.issues[0]?.message)
    const final = materializeFinalGlyphInk(result.primitives, STYLE, MATERIALIZATION_OPTIONS)
    if (!final.ok) throw new Error(final.message)

    expect(final.ink.regions).toHaveLength(1)
    expect(final.ink.regions[0].holes).toHaveLength(1)
    expect(signedArea(final.ink.regions[0].outer)).toBeLessThan(0)
    expect(signedArea(final.ink.regions[0].holes[0])).toBeGreaterThan(0)
    expect(filled({ x: 0.5, y: 0.5 }, final.ink.regions)).toBe(false)
    expect(filled({ x: 0.1, y: 0.5 }, final.ink.regions)).toBe(true)
  })

  it('ㅇ hole을 지나는 중심선 잉크만 다시 채운다', () => {
    const source = scope('ㅇ', [areaElement('ㅇ', 'ring'), lineElement('line:ieung-center', 'horizontal')])
    const result = resolve(source)
    if (!result.ok) throw new Error(result.issues[0]?.message)
    const final = materializeFinalGlyphInk(result.primitives, STYLE, MATERIALIZATION_OPTIONS)
    if (!final.ok) throw new Error(final.message)

    expect(filled({ x: 0.5, y: 0.5 }, final.ink.regions)).toBe(true)
    expect(filled({ x: 0.5, y: 0.35 }, final.ink.regions)).toBe(false)
    expect(filled({ x: 0.1, y: 0.5 }, final.ink.regions)).toBe(true)
    expect(final.ink.regions[0].holes).toHaveLength(2)
  })

  it('primitive 입력 순서와 반복 호출에 무관하게 SVG·OTF 투영이 exact 같다', () => {
    const result = resolve(scope('ㄱ', [areaElement('ㄱ', 'top'), lineElement('line:giyeok-right', 'vertical')]))
    if (!result.ok) throw new Error(result.issues[0]?.message)
    const first = materializeFinalGlyphInk(result.primitives, STYLE, MATERIALIZATION_OPTIONS)
    const second = materializeFinalGlyphInk([...result.primitives].reverse(), STYLE, MATERIALIZATION_OPTIONS)
    if (!first.ok || !second.ok) throw new Error('최종 잉크를 만들 수 없습니다.')
    expect(second.ink).toEqual(first.ink)
    expect(finalGlyphInkToSvgPath(second.ink)).toBe(finalGlyphInkToSvgPath(first.ink))
    expect(projectFinalGlyphInkToFontContours(second.ink, { upm: 1000, ascender: 880, slant: 0 }))
      .toEqual(projectFinalGlyphInkToFontContours(first.ink, { upm: 1000, ascender: 880, slant: 0 }))
  })

  it('아직 materialize하지 않는 곡률·사선을 조용히 무시하지 않는다', () => {
    const treatment: BoundaryTreatment = {
      id: 'treatment:top-left',
      kind: 'curve',
      vertex: point('treatment:vertex', 'outer-left', 'outer-top'),
      from: point('treatment:from', 'inner-left', 'outer-top'),
      to: point('treatment:to', 'outer-left', 'inner-top'),
      tension: 0.5,
    }
    const result = resolve(scope('ㅇ', [areaElement('ㅇ', 'ring', treatment)]))
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'unsupported-boundary-treatment' }] })
  })

  it('brush 스타일의 non-round cap/join은 일자 stroker로 면을 만들고, 다른 스타일은 fail-loud 처리한다', () => {
    const resolved = resolve(scope('ㄱ', [lineElement('line:non-round', 'vertical')]))
    if (!resolved.ok) throw new Error(resolved.issues[0]?.message)
    const primitive = resolved.primitives[0]
    expect(primitive.kind).toBe('centerline')
    if (primitive.kind !== 'centerline') return
    const flat = materializeFinalGlyphInk([
      { ...primitive, effectiveLinecap: 'butt', effectiveLinejoin: 'miter' },
    ], STYLE, MATERIALIZATION_OPTIONS)
    expect(flat.ok).toBe(true)
    if (!flat.ok) return
    // butt 끝은 중심선 끝에서 잘리므로 세로 범위가 round보다 두께만큼 짧다.
    const round = materializeFinalGlyphInk([primitive], STYLE, MATERIALIZATION_OPTIONS)
    if (!round.ok) throw new Error(round.message)
    const spanY = (ink: typeof flat.ink) => { const ys = ink.regions.flatMap((r) => r.outer.map((p) => p.y)); return Math.max(...ys) - Math.min(...ys) }
    expect(spanY(round.ink) - spanY(flat.ink)).toBeCloseTo(primitive.stroke.thickness * primitive.weightMultiplier, 3)
    const result = materializeFinalGlyphInk([
      { ...primitive, effectiveLinecap: 'butt' },
    ], { mode: 'dot-pattern', dotSize: 1, gap: 0, rows: 1, stagger: false, omitEvery: 0 }, MATERIALIZATION_OPTIONS)
    expect(result).toEqual({
      ok: false,
      primitiveId: primitive.id,
      message: expect.stringContaining('butt/round'),
    })
  })

  it('UPM 기준 0.5 unit 오차에 맞춰 두꺼운 round cap 분할 수를 늘린다', () => {
    const resolved = resolve(scope('ㄱ', [lineElement('line:adaptive-round', 'vertical')]))
    if (!resolved.ok) throw new Error(resolved.issues[0]?.message)
    const primitive = resolved.primitives[0]
    expect(primitive.kind).toBe('centerline')
    if (primitive.kind !== 'centerline') return
    const final = materializeFinalGlyphInk([
      { ...primitive, weightMultiplier: 2.2 },
    ], STYLE, MATERIALIZATION_OPTIONS)
    if (!final.ok) throw new Error(final.message)
    expect(final.ink.regions[0].outer.length).toBeGreaterThan(32)
    const radius = primitive.stroke.thickness * 2.2 / 2
    const vertices = resolveFinalInkEllipseVertexCount(radius, MATERIALIZATION_OPTIONS)
    expect(radius * (1 - Math.cos(Math.PI / vertices))).toBeLessThanOrEqual(0.0005)
    expect(resolveFinalInkEllipseVertexCount(10, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.000001 })).toBe(0)
    expect(materializeFinalGlyphInk([primitive], STYLE, { unitsPerEm: 0, maxCurveErrorFontUnits: 0.5 }))
      .toMatchObject({ ok: false, message: expect.stringContaining('1000 UPM') })
  })

  it('production Shape consumer는 slot affine이나 local Rail resolve를 재구현하지 않는다', async () => {
    const source = await import('./shapeGlyphInkResolver?raw').then((module) => String(module.default))
    expect(source).toContain("from './partGridSlotProjection'")
    expect(source).toContain('resolveProjectedShapeGlyphInkPrimitives')
    expect(source).not.toContain("from './railGridResolver'")
    expect(source).not.toContain('projectRegion')
    expect(source).not.toMatch(/slot\.(?:x|y)\s*\+/)
  })
})
