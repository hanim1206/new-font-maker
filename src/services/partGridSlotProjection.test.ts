import { describe, expect, it } from 'vitest'
import type {
  BoxConfig,
  CoreXRailRole,
  CoreYRailRole,
  GridProvenance,
  JamoPartRole,
  JamoVariantContext,
  Part,
  RailGrid,
} from '../types'
import { BASE_PRESETS_SCHEMAS, calculateBoxes } from '../utils/layoutCalculator'
import { createEmptyJamoRoleMaster } from './jamoConstruction'
import { projectPartGridToSlot } from './partGridSlotProjection'
import { createBasePartGrid, resolveRailGrid } from './railGridResolver'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0,
  'inner-left': 0.2,
  'center-x': 0.5,
  'inner-right': 0.8,
  'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0,
  'inner-top': 0.2,
  'center-y': 0.5,
  'inner-bottom': 0.8,
  'outer-bottom': 1,
}

function createGrid(role: JamoPartRole = 'CH'): RailGrid {
  return createBasePartGrid({
    role,
    xCorePositions: X,
    yCorePositions: Y,
    snapStep: 0.025,
    minGap: 0.05,
  })
}

function addAuxiliaryRail(grid: RailGrid): string {
  const fromRailId = grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.id
  const toRailId = grid.xRails.find(({ coreRole }) => coreRole === 'center-x')!.id
  const id = `${grid.id}:x:aux:test`
  grid.xRails.splice(2, 0, {
    id,
    kind: 'auxiliary',
    position: { kind: 'between', fromRailId, toRailId, ratio: 0.5 },
  })
  return id
}

function contextForRole(role: JamoPartRole): JamoVariantContext {
  if (role === 'STANDALONE') return { baseContext: 'choseong-only' }
  if (role === 'JU_VERTICAL') return { baseContext: 'vertical' }
  if (role === 'JU_HORIZONTAL') return { baseContext: 'horizontal' }
  if (role === 'JU_H' || role === 'JU_V') return { baseContext: 'mixed' }
  if (role === 'JO') return { baseContext: 'horizontal-with-jongseong' }
  return { baseContext: 'horizontal' }
}

function contextualFor(grid: RailGrid) {
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: grid.role, gridId: grid.id })
  const provenance: GridProvenance = {
    railSources: Object.fromEntries([...grid.xRails, ...grid.yRails].map(({ id }) => [id, { source: 'master' }])),
    referenceSources: {},
    selectedPresetIds: [],
    requestedContext: contextForRole(grid.role),
  }
  return { ok: true as const, grid, master, provenance }
}

function project(grid: RailGrid, part: Part, slot: BoxConfig) {
  return projectPartGridToSlot({ contextual: contextualFor(grid), part, slot })
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

describe('partGridSlotProjection', () => {
  it('비정방 offset slot에 core와 between auxiliary Rail을 축별로 정확히 투영한다', () => {
    const grid = createGrid()
    const auxiliaryId = addAuxiliaryRail(grid)
    const local = resolveRailGrid(grid)
    expect(local.ok).toBe(true)
    const slot = { x: 0.1, y: 0.2, width: 0.3, height: 0.5 }
    const result = project(grid, 'CH', slot)
    expect(result.ok).toBe(true)
    if (!result.ok || !local.ok) return
    expect(result.resolvedPartGrid).toMatchObject({
      coordinateSpace: 'glyph-normalized', sourceGridId: grid.id, role: 'CH', part: 'CH', slot,
    })
    const expectedX = [0.1, 0.16, 0.205, 0.25, 0.34, 0.4]
    const expectedY = [0.2, 0.3, 0.45, 0.6, 0.7]
    result.resolvedPartGrid.xRails.forEach(({ value }, index) => expect(value).toBeCloseTo(expectedX[index], 14))
    result.resolvedPartGrid.yRails.forEach(({ value }, index) => expect(value).toBeCloseTo(expectedY[index], 14))
    expect(result.resolvedPartGrid.xRails.find(({ id }) => id === auxiliaryId)?.value).toBeCloseTo(0.205, 14)
    expect(result.resolvedPartGrid.xRails.map(({ id, axis, kind, coreRole }) => ({ id, axis, kind, coreRole })))
      .toEqual(local.grid.xRails.map(({ id, axis, kind, coreRole }) => ({ id, axis, kind, coreRole })))
    expect(Object.keys(result.provenance.railSources).sort())
      .toEqual([...result.resolvedPartGrid.xRails, ...result.resolvedPartGrid.yRails].map(({ id }) => id).sort())
    expect(result.master.role).toBe('CH')
  })

  it('identity slot은 local resolved Rail 값을 그대로 보존한다', () => {
    const grid = createGrid('JU_VERTICAL')
    const local = resolveRailGrid(grid)
    const result = project(grid, 'JU', { x: 0, y: 0, width: 1, height: 1 })
    expect(result.ok).toBe(true)
    expect(local.ok).toBe(true)
    if (!result.ok || !local.ok) return
    expect(result.resolvedPartGrid.xRails).toEqual(local.grid.xRails)
    expect(result.resolvedPartGrid.yRails).toEqual(local.grid.yRails)
  })

  it.each([
    ['STANDALONE', 'CH'],
    ['CH', 'CH'],
    ['JU_VERTICAL', 'JU'],
    ['JU_HORIZONTAL', 'JU'],
    ['JU_H', 'JU_H'],
    ['JU_V', 'JU_V'],
    ['JO', 'JO'],
  ] as const)('%s role을 %s part에만 투영한다', (role, part) => {
    const grid = createGrid(role)
    const valid = project(grid, part, { x: 0, y: 0, width: 1, height: 1 })
    expect(valid.ok).toBe(true)
    const wrongPart: Part = part === 'CH' ? 'JO' : 'CH'
    const invalid = project(grid, wrongPart, { x: 0, y: 0, width: 1, height: 1 })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.issues[0].code).toBe('role-part-mismatch')
  })

  it.each([
    ['duplicate Rail ID', (grid: RailGrid) => { grid.xRails[1].id = grid.xRails[0].id }],
    ['minGap 위반', (grid: RailGrid) => {
      grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.position = { kind: 'absolute', value: 0.49 }
    }],
    ['between cycle', (grid: RailGrid) => {
      const first = `${grid.id}:x:aux:first`
      const second = `${grid.id}:x:aux:second`
      grid.xRails.splice(2, 0,
        { id: first, kind: 'auxiliary', position: { kind: 'between', fromRailId: second, toRailId: grid.xRails[3].id, ratio: 0.5 } },
        { id: second, kind: 'auxiliary', position: { kind: 'between', fromRailId: grid.xRails[1].id, toRailId: first, ratio: 0.5 } },
      )
    }],
  ] as const)('%s인 local grid를 partial 결과 없이 차단한다', (_label, mutate) => {
    const grid = createGrid()
    mutate(grid)
    const before = JSON.stringify(grid)
    const result = project(grid, 'CH', { x: 0, y: 0, width: 1, height: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('invalid-contextual-grid')
    expect('resolvedPartGrid' in result).toBe(false)
    expect(JSON.stringify(grid)).toBe(before)
  })

  it.each([
    ['zero width', { x: 0, y: 0, width: 0, height: 1 }],
    ['negative height', { x: 0, y: 0, width: 1, height: -1 }],
    ['NaN', { x: Number.NaN, y: 0, width: 1, height: 1 }],
    ['inherited fields', Object.create({ x: 0, y: 0, width: 1, height: 1 })],
  ] as const)('%s slot을 throw 없이 차단한다', (_label, slot) => {
    const result = project(createGrid(), 'CH', slot as BoxConfig)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('invalid-slot')
  })

  it('돌출 slot은 clamp하지 않고 보존하며 overflow projection은 fail-closed한다', () => {
    const protruding = project(createGrid(), 'CH', { x: -0.2, y: 0.1, width: 1.4, height: 1.2 })
    expect(protruding.ok).toBe(true)
    if (protruding.ok) {
      expect(protruding.resolvedPartGrid.xRails.at(0)?.value).toBe(-0.2)
      expect(protruding.resolvedPartGrid.xRails.at(-1)?.value).toBe(1.2)
    }
    const overflow = project(createGrid(), 'CH', {
      x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 1,
    })
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) expect(overflow.issues[0].code).toBe('non-finite-projection')

    for (const slot of [
      { x: 1e16, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: Number.MIN_VALUE, height: 1 },
    ]) {
      const collapsed = project(createGrid(), 'CH', slot)
      expect(collapsed.ok).toBe(false)
      if (!collapsed.ok) expect(collapsed.issues[0].code).toBe('degenerate-projection')
    }
  })

  it.each([
    ['missing rail source', (provenance: GridProvenance) => {
      delete provenance.railSources[Object.keys(provenance.railSources)[0]]
    }],
    ['extra rail source', (provenance: GridProvenance) => {
      provenance.railSources.extra = { source: 'master' }
    }],
    ['malformed source metadata', (provenance: GridProvenance) => {
      const first = Object.keys(provenance.railSources)[0]
      provenance.railSources[first] = { source: 'context-preset' }
    }],
    ['role-incompatible request context', (provenance: GridProvenance) => {
      provenance.requestedContext = { baseContext: 'choseong-only' }
    }],
    ['role-incompatible selected variant context', (provenance: GridProvenance) => {
      provenance.selectedVariantId = 'variant:wrong-role'
      provenance.selectedVariantContext = { baseContext: 'choseong-only' }
    }],
    ['role-incompatible selected preset context', (provenance: GridProvenance) => {
      provenance.selectedContextPresetContext = { baseContext: 'choseong-only' }
    }],
    ['selected context outside requested fallback', (provenance: GridProvenance) => {
      provenance.selectedContextPresetContext = { baseContext: 'horizontal', medialClass: 'wide' }
    }],
    ['inherited selected context', (provenance: GridProvenance) => {
      Object.setPrototypeOf(provenance, {
        selectedVariantId: 'variant:inherited',
        selectedVariantContext: { baseContext: 'horizontal' },
      })
    }],
  ] as const)('%s provenance를 projected Rail과 함께 fail-closed한다', (_label, mutate) => {
    const grid = createGrid('CH')
    const contextual = contextualFor(grid)
    mutate(contextual.provenance)
    const before = JSON.stringify(contextual)
    const result = projectPartGridToSlot({
      contextual,
      part: 'CH',
      slot: { x: 0, y: 0, width: 1, height: 1 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('invalid-provenance')
    expect(JSON.stringify(contextual)).toBe(before)
    expect('resolvedPartGrid' in result).toBe(false)
  })

  it('Design Body가 반영된 최종 slot을 정확히 한 번만 투영한다', () => {
    const schema = {
      ...structuredClone(BASE_PRESETS_SCHEMAS['choseong-jungseong-vertical']),
      designBodyPadding: { top: 0.12, right: 0.18, bottom: 0.08, left: 0.1 },
    }
    const slot = calculateBoxes(schema).CH!
    const result = project(createGrid(), 'CH', slot)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const innerLeft = result.resolvedPartGrid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.value
    const expectedOnce = slot.x + 0.2 * slot.width
    const twiceMapped = slot.x + expectedOnce * slot.width
    expect(innerLeft).toBeCloseTo(expectedOnce, 14)
    expect(innerLeft).not.toBeCloseTo(twiceMapped, 14)
  })

  it('frozen input을 바꾸지 않고 반복 결과와 출력 clone을 결정적으로 만든다', () => {
    const grid = deepFreeze(createGrid())
    const contextual = deepFreeze(contextualFor(grid))
    const slot = deepFreeze({ x: 0.12, y: 0.08, width: 0.4, height: 0.6 })
    const beforeContextual = JSON.stringify(contextual)
    const beforeSlot = JSON.stringify(slot)
    const first = projectPartGridToSlot({ contextual, part: 'CH', slot })
    const second = projectPartGridToSlot({ contextual, part: 'CH', slot })
    expect(second).toEqual(first)
    expect(JSON.stringify(contextual)).toBe(beforeContextual)
    expect(JSON.stringify(slot)).toBe(beforeSlot)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    first.resolvedPartGrid.slot.x = 99
    first.resolvedPartGrid.xRails[0].value = 99
    first.master.jamoId = '변경'
    first.provenance.selectedPresetIds.push('변경')
    expect(JSON.stringify(contextual)).toBe(beforeContextual)
    expect(JSON.stringify(slot)).toBe(beforeSlot)
  })

  it('production projector는 layout/store/FontData/Shape/SVG/OTF/Boolean에 의존하지 않는다', async () => {
    const source = await import('./partGridSlotProjection?raw').then((module) => String(module.default))
    expect(source).not.toMatch(/stores\//)
    expect(source).not.toMatch(/from ['"][^'"]*(?:fontData|layoutGrid|layoutCalculator|stores\/)/i)
    expect(source).not.toMatch(/from ['"][^'"]*(?:shapeGlyph|SvgRenderer|fontExport|fontGenerator|InkRegion|Boolean)/i)
  })
})
