import { describe, expect, it } from 'vitest'
import type {
  ContextGridPresetCatalogV1,
  CoreXRailRole,
  CoreYRailRole,
  JamoPartRole,
  JamoVariantContext,
  LayoutGridBinding,
  LayoutGridSystemSourceV1,
  LayoutPartEdgeRailIds,
  Part,
  RoleConstructionScope,
  ShapeSystemSourceV2,
  SharedLayoutType,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'
import { readFileSync } from 'node:fs'
import {
  createContextGridPresetId,
  createRoleGridDefaultId,
} from './contextGridPresetCatalogV1'
import { createEmptyJamoRoleMaster, createRoleConstructionSourceV1 } from './jamoConstruction'
import { createJamoContextVariantId } from './jamoContextVariants'
import { createLayoutGridBindingId } from './layoutGridSystemSourceV1'
import {
  LAYOUT_GRID_SLOT_PARTS,
  LAYOUT_GRID_SPLIT_IDS,
} from './layoutGridTopology'
import { createBasePartGrid } from './railGridResolver'
import { createShapeSystemSourceV1, SHAPE_SYSTEM_ROLES } from './shapeSystemSourceV1'
import {
  createShapeSystemSourceV2,
  parseAndMigrateShapeSystemSource,
  parseShapeSystemSourceV2,
} from './shapeSystemSourceV2'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const x = (index: number) => `shape-v2:layout:x:${index}`
const y = (index: number) => `shape-v2:layout:y:${index}`

function sourceFor(role: JamoPartRole): RoleConstructionScope {
  const grid = createBasePartGrid({
    role,
    xCorePositions: X,
    yCorePositions: Y,
    snapStep: 0.025,
    minGap: 0.05,
  })
  return createRoleConstructionSourceV1({
    grid,
    masters: [createEmptyJamoRoleMaster({ jamoId: `fixture:${role}`, role, gridId: grid.id })],
  })
}

function roleSources(): Record<JamoPartRole, RoleConstructionScope> {
  return Object.fromEntries(SHAPE_SYSTEM_ROLES.map((role) => [role, sourceFor(role)])) as Record<
    JamoPartRole,
    RoleConstructionScope
  >
}

function edges(left: number, right: number, top: number, bottom: number): LayoutPartEdgeRailIds {
  return { left: x(left), right: x(right), top: y(top), bottom: y(bottom) }
}

const PART_EDGES: Readonly<Record<SharedLayoutType, Partial<Record<Part, LayoutPartEdgeRailIds>>>> = {
  'choseong-only': { CH: edges(0, 4, 0, 4) },
  'choseong-jungseong-vertical': { CH: edges(0, 2, 0, 4), JU: edges(2, 4, 0, 4) },
  'choseong-jungseong-horizontal': { CH: edges(0, 4, 0, 2), JU: edges(0, 4, 2, 4) },
  'choseong-jungseong-mixed': {
    CH: edges(0, 2, 0, 2), JU_H: edges(0, 2, 2, 4), JU_V: edges(2, 4, 0, 4),
  },
  'choseong-jungseong-vertical-jongseong': {
    CH: edges(0, 2, 0, 3), JU: edges(2, 4, 0, 3), JO: edges(0, 4, 3, 4),
  },
  'choseong-jungseong-horizontal-jongseong': {
    CH: edges(0, 4, 0, 2), JU: edges(0, 4, 2, 3), JO: edges(0, 4, 3, 4),
  },
  'choseong-jungseong-mixed-jongseong': {
    CH: edges(0, 2, 0, 2), JU_H: edges(0, 2, 2, 3),
    JU_V: edges(2, 4, 0, 3), JO: edges(0, 4, 3, 4),
  },
}

function splitRailIds(layoutType: SharedLayoutType): Record<string, string> {
  return Object.fromEntries(LAYOUT_GRID_SPLIT_IDS[layoutType].map((id) => {
    if (id.includes(':x:')) return [id, x(2)]
    if (id.endsWith(':upper-jo') || id.endsWith(':ju-jo')) return [id, y(3)]
    return [id, y(2)]
  }))
}

function layoutGridSystem(): LayoutGridSystemSourceV1 {
  const gridId = 'shape-v2:layout-grid'
  const bindings = Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => [layoutType, {
    schema: 'layout-grid-binding',
    version: 1,
    id: createLayoutGridBindingId(layoutType),
    layoutType,
    layoutGridId: gridId,
    splitRailIds: splitRailIds(layoutType),
    partEdgeRailIds: structuredClone(PART_EDGES[layoutType]),
  } satisfies LayoutGridBinding])) as Record<SharedLayoutType, LayoutGridBinding>
  for (const layoutType of SHARED_LAYOUT_TYPES) {
    expect(Object.keys(bindings[layoutType].partEdgeRailIds).sort())
      .toEqual([...LAYOUT_GRID_SLOT_PARTS[layoutType]].sort())
  }
  return {
    schema: 'layout-grid-system',
    version: 1,
    grid: {
      schema: 'layout-grid-source',
      version: 1,
      id: gridId,
      xRails: [0, 0.25, 0.5, 0.75, 1].map((value, index) => ({
        id: x(index), axis: 'x', position: { kind: 'absolute', value },
      })),
      yRails: [0, 0.25, 0.5, 0.75, 1].map((value, index) => ({
        id: y(index), axis: 'y', position: { kind: 'absolute', value },
      })),
      snapStep: 0.025,
      minGap: 0.05,
    },
    bindings,
  }
}

const HORIZONTAL: JamoVariantContext = { baseContext: 'horizontal', medialClass: 'wide' }

function catalog(): ContextGridPresetCatalogV1 {
  return {
    schema: 'context-grid-preset-catalog',
    version: 1,
    roleDefaults: [{
      id: createRoleGridDefaultId('CH'),
      role: 'CH',
      coreRailPositions: { 'inner-right': { kind: 'absolute', value: 0.79 } },
    }],
    contextPresets: [{
      id: createContextGridPresetId('CH', HORIZONTAL),
      role: 'CH',
      context: structuredClone(HORIZONTAL),
      coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.54 } },
    }],
  }
}

function connectedSource(): ShapeSystemSourceV2 {
  const roles = roleSources()
  const master = roles.CH.masters[0]
  const presets = catalog()
  master.contextVariants = [{
    id: createJamoContextVariantId(master.id, HORIZONTAL),
    context: structuredClone(HORIZONTAL),
    presetId: presets.contextPresets[0].id,
    coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.22 } },
  }]
  return createShapeSystemSourceV2({
    roleSources: roles,
    layoutGridSystem: layoutGridSystem(),
    contextPresetCatalog: presets,
  })
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

describe('Shape System source v2', () => {
  it('v1을 추측 없이 v2 null/null 상태로 올리고 두 번째 parse는 exact 멱등이다', () => {
    const legacy = deepFreeze(createShapeSystemSourceV1(roleSources()))
    const before = JSON.stringify(legacy)
    const migrated = parseAndMigrateShapeSystemSource(legacy)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.migratedFrom).toBe(1)
    expect(migrated.source.version).toBe(2)
    expect(migrated.source.layoutGridSystem).toBeNull()
    expect(migrated.source.contextPresetCatalog).toBeNull()
    expect(JSON.stringify(legacy)).toBe(before)
    const second = parseAndMigrateShapeSystemSource(migrated.source)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.source).toEqual(migrated.source)
  })

  it('layout grid, catalog, 7개 역할 원본을 JSON round-trip 뒤 exact 보존한다', () => {
    const input = deepFreeze(connectedSource())
    const before = JSON.stringify(input)
    const parsed = parseShapeSystemSourceV2(JSON.parse(before))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.source).toEqual(input)
    expect(parsed.source).not.toBe(input)
    expect(Object.keys(parsed.source.roleSources)).toEqual(SHAPE_SYSTEM_ROLES)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(parsed.source)).not.toContain('resolvedGrid')
    expect(JSON.stringify(parsed.source)).not.toContain('provenance')
    expect(JSON.stringify(parsed.source)).not.toContain('history')
  })

  it('선택되지 않은 sibling까지 잘못 연결된 preset role/context를 차단한다', () => {
    const input = connectedSource()
    const sibling = createEmptyJamoRoleMaster({
      jamoId: 'fixture:CH:sibling',
      role: 'CH',
      gridId: input.roleSources.CH.grid.id,
    })
    const broadContext: JamoVariantContext = { baseContext: 'vertical' }
    const specificPresetContext: JamoVariantContext = { baseContext: 'vertical', medialClass: 'wide' }
    const siblingPreset = {
      id: createContextGridPresetId('CH', specificPresetContext),
      role: 'CH' as const,
      context: specificPresetContext,
      coreRailPositions: { 'center-x': { kind: 'absolute' as const, value: 0.52 } },
    }
    input.contextPresetCatalog!.contextPresets.push(siblingPreset)
    sibling.contextVariants = [{
      id: createJamoContextVariantId(sibling.id, broadContext),
      context: broadContext,
      presetId: siblingPreset.id,
      coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.22 } },
    }]
    input.roleSources.CH.masters.push(sibling)
    const result = parseShapeSystemSourceV2(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'invalid-preset-link',
      path: expect.stringContaining(sibling.id),
    }))
  })

  it.each([
    ['missing between Rail', (input: ShapeSystemSourceV2) => {
      const rail = input.roleSources.CH.grid.xRails.find(({ coreRole }) => coreRole === 'center-x')!
      input.contextPresetCatalog!.roleDefaults[0].coreRailPositions['inner-right'] = {
        kind: 'between', fromRailId: 'missing', toRailId: rail.id, ratio: 0.5,
      }
    }],
    ['role default + preset minGap', (input: ShapeSystemSourceV2) => {
      input.contextPresetCatalog!.roleDefaults[0].coreRailPositions = {
        'inner-left': { kind: 'absolute', value: 0.25 },
      }
      input.contextPresetCatalog!.contextPresets[0].coreRailPositions = {
        'center-x': { kind: 'absolute', value: 0.26 },
      }
    }],
    ['role default + preset cycle', (input: ShapeSystemSourceV2) => {
      const grid = input.roleSources.CH.grid
      const innerLeft = grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!
      const center = grid.xRails.find(({ coreRole }) => coreRole === 'center-x')!
      const innerRight = grid.xRails.find(({ coreRole }) => coreRole === 'inner-right')!
      input.contextPresetCatalog!.roleDefaults[0].coreRailPositions = {
        'inner-left': {
          kind: 'between', fromRailId: center.id, toRailId: innerRight.id, ratio: 0.25,
        },
      }
      input.contextPresetCatalog!.contextPresets[0].coreRailPositions = {
        'center-x': {
          kind: 'between', fromRailId: innerLeft.id, toRailId: innerRight.id, ratio: 0.5,
        },
      }
    }],
    ['preset + stored variant minGap', (input: ShapeSystemSourceV2) => {
      input.contextPresetCatalog!.contextPresets[0].coreRailPositions = {
        'inner-left': { kind: 'absolute', value: 0.3 },
      }
      input.roleSources.CH.masters[0].contextVariants![0].coreRailOverrides = {
        'center-x': { kind: 'absolute', value: 0.34 },
      }
    }],
  ] as const)('%s 합성을 저장 시점에 fail-closed한다', (_label, mutate) => {
    const input = deepFreeze(connectedSource())
    const mutable = structuredClone(input)
    mutate(mutable)
    const before = JSON.stringify(mutable)
    const first = parseShapeSystemSourceV2(mutable)
    const second = parseShapeSystemSourceV2(structuredClone(mutable))
    expect(first.ok).toBe(false)
    expect(second).toEqual(first)
    if (!first.ok) expect(first.issues.map(({ code }) => code)).toContain('invalid-catalog-grid-link')
    expect(JSON.stringify(mutable)).toBe(before)
  })

  it('layout/role/catalog 전체 ID universe의 충돌을 차단한다', () => {
    const input = connectedSource()
    const roleGridId = input.roleSources.CH.grid.id
    input.layoutGridSystem!.grid.id = roleGridId
    for (const binding of Object.values(input.layoutGridSystem!.bindings)) {
      binding.layoutGridId = roleGridId
    }
    const result = parseShapeSystemSourceV2(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-global-id', path: '$.roleSources.CH.grid.id' }),
    ]))
  })

  it('layout이 null이어도 canonical split/binding 주소를 future owner로 예약한다', () => {
    const legacy = createShapeSystemSourceV1(roleSources())
    const reservedSplitId = LAYOUT_GRID_SPLIT_IDS['choseong-jungseong-vertical'][0]
    legacy.roleSources.STANDALONE.grid.id = reservedSplitId
    legacy.roleSources.STANDALONE.masters[0].construction.channels.main!.gridId = reservedSplitId
    const result = parseAndMigrateShapeSystemSource(legacy)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map(({ code }) => code)).toContain('duplicate-global-id')
  })

  it('element·variant auxiliary owner도 layout ID와 같은 전역 universe에서 차단한다', () => {
    const input = connectedSource()
    const master = input.roleSources.CH.masters[0]
    const xRails = input.roleSources.CH.grid.xRails
    const yRails = input.roleSources.CH.grid.yRails
    master.construction.channels.main!.elements.push({
      id: input.layoutGridSystem!.grid.id,
      kind: 'centerline',
      closed: false,
      thickness: 0.1,
      anchors: [
        {
          id: 'shape-v2:anchor:0',
          point: { id: 'shape-v2:point:0', xRailId: xRails[1].id, yRailId: yRails[1].id },
        },
        {
          id: 'shape-v2:anchor:1',
          point: { id: 'shape-v2:point:1', xRailId: xRails[3].id, yRailId: yRails[3].id },
        },
      ],
    })
    master.contextVariants![0].auxiliaryRails = {
      xRails: [{
        id: createRoleGridDefaultId('CH'),
        kind: 'auxiliary',
        position: {
          kind: 'between', fromRailId: xRails[1].id, toRailId: xRails[2].id, ratio: 0.5,
        },
      }],
      yRails: [],
    }
    const result = parseShapeSystemSourceV2(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.filter(({ code }) => code === 'duplicate-global-id')).toEqual([
      expect.objectContaining({ path: expect.stringContaining('.elements[0].id') }),
      expect.objectContaining({ path: expect.stringContaining('.auxiliaryRails.xRails[0].id') }),
    ])
  })

  it.each([
    ['future root', (source: ShapeSystemSourceV2) => Object.assign(source, { resolvedGrid: {} }), 'unknown-field'],
    ['future layout', (source: ShapeSystemSourceV2) => Object.assign(source.layoutGridSystem!.grid, { boxes: {} }), 'invalid-layout-grid-system'],
    ['future catalog', (source: ShapeSystemSourceV2) => Object.assign(source.contextPresetCatalog!, { provenance: {} }), 'invalid-context-preset-catalog'],
  ] as const)('%s 파생/future 필드를 저장 원본으로 승인하지 않는다', (_label, mutate, code) => {
    const input = connectedSource()
    mutate(input)
    const result = parseShapeSystemSourceV2(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((entry) => entry.code)).toContain(code)
  })

  it('inherited root field와 future version을 throw 없이 fail-closed한다', () => {
    const inherited = Object.create(connectedSource()) as unknown
    expect(() => parseShapeSystemSourceV2(inherited)).not.toThrow()
    expect(parseShapeSystemSourceV2(inherited).ok).toBe(false)
    const future = connectedSource() as ShapeSystemSourceV2 & { version: number }
    future.version = 3
    const result = parseAndMigrateShapeSystemSource(future)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('unsupported-version')
  })

  it('roleSources 입력 key 순서와 issue 순서가 결정적이다', () => {
    const input = connectedSource()
    input.roleSources = Object.fromEntries(
      [...SHAPE_SYSTEM_ROLES].reverse().map((role) => [role, input.roleSources[role]]),
    ) as Record<JamoPartRole, RoleConstructionScope>
    const first = parseShapeSystemSourceV2(input)
    const second = parseShapeSystemSourceV2(structuredClone(input))
    expect(second).toEqual(first)
    expect(first.ok).toBe(true)
    if (first.ok) expect(Object.keys(first.source.roleSources)).toEqual(SHAPE_SYSTEM_ROLES)
  })

  it('V2 parser dependency는 pure leaf 방향만 유지한다', () => {
    const source = readFileSync(new URL('./shapeSystemSourceV2.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/stores|fontData|SvgRenderer|fontGenerator|localStorage|window|document/)
    const children = [
      './shapeSystemSourceV1.ts',
      './contextGridPresetCatalogV1.ts',
      './layoutGridSystemSourceV1.ts',
      './jamoContextMatching.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    for (const child of children) expect(child).not.toContain("from './shapeSystemSourceV2'")
  })
})
