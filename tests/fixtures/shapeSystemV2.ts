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
} from '../../src/types'
import { SHARED_LAYOUT_TYPES } from '../../src/types'
import {
  createContextGridPresetId,
  createRoleGridDefaultId,
} from '../../src/services/contextGridPresetCatalogV1'
import {
  createEmptyJamoRoleMaster,
  createRoleConstructionSourceV1,
} from '../../src/services/jamoConstruction'
import { createJamoContextVariantId } from '../../src/services/jamoContextVariants'
import { createLayoutGridBindingId } from '../../src/services/layoutGridSystemSourceV1'
import { LAYOUT_GRID_SPLIT_IDS } from '../../src/services/layoutGridTopology'
import { createBasePartGrid } from '../../src/services/railGridResolver'
import { SHAPE_SYSTEM_ROLES } from '../../src/services/shapeSystemSourceV1'
import { createShapeSystemSourceV2 } from '../../src/services/shapeSystemSourceV2'

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
const x = (index: number) => `fixture:v2:layout:x:${index}`
const y = (index: number) => `fixture:v2:layout:y:${index}`

function edges(left: number, right: number, top: number, bottom: number): LayoutPartEdgeRailIds {
  return { left: x(left), right: x(right), top: y(top), bottom: y(bottom) }
}

const PART_EDGES: Readonly<Record<SharedLayoutType, Partial<Record<Part, LayoutPartEdgeRailIds>>>> = {
  'choseong-only': { CH: edges(0, 4, 0, 4) },
  'choseong-jungseong-vertical': { CH: edges(0, 2, 0, 4), JU: edges(2, 4, 0, 4) },
  'choseong-jungseong-horizontal': { CH: edges(0, 4, 0, 2), JU: edges(0, 4, 2, 4) },
  'choseong-jungseong-mixed': {
    CH: edges(0, 2, 0, 2),
    JU_H: edges(0, 2, 2, 4),
    JU_V: edges(2, 4, 0, 4),
  },
  'choseong-jungseong-vertical-jongseong': {
    CH: edges(0, 2, 0, 3),
    JU: edges(2, 4, 0, 3),
    JO: edges(0, 4, 3, 4),
  },
  'choseong-jungseong-horizontal-jongseong': {
    CH: edges(0, 4, 0, 2),
    JU: edges(0, 4, 2, 3),
    JO: edges(0, 4, 3, 4),
  },
  'choseong-jungseong-mixed-jongseong': {
    CH: edges(0, 2, 0, 2),
    JU_H: edges(0, 2, 2, 3),
    JU_V: edges(2, 4, 0, 3),
    JO: edges(0, 4, 3, 4),
  },
}

function splitRailIds(layoutType: SharedLayoutType): Record<string, string> {
  return Object.fromEntries(LAYOUT_GRID_SPLIT_IDS[layoutType].map((id) => {
    if (id.includes(':x:')) return [id, x(2)]
    if (id.endsWith(':upper-jo') || id.endsWith(':ju-jo')) return [id, y(3)]
    return [id, y(2)]
  }))
}

function createLayoutGridSystemFixture(): LayoutGridSystemSourceV1 {
  const gridId = 'fixture:v2:layout-grid'
  const bindings = Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => [layoutType, {
    schema: 'layout-grid-binding',
    version: 1,
    id: createLayoutGridBindingId(layoutType),
    layoutType,
    layoutGridId: gridId,
    splitRailIds: splitRailIds(layoutType),
    partEdgeRailIds: structuredClone(PART_EDGES[layoutType]),
  } satisfies LayoutGridBinding])) as Record<SharedLayoutType, LayoutGridBinding>
  return {
    schema: 'layout-grid-system',
    version: 1,
    grid: {
      schema: 'layout-grid-source',
      version: 1,
      id: gridId,
      xRails: [0, 0.25, 0.5, 0.75, 1].map((value, index) => ({
        id: x(index),
        axis: 'x',
        position: { kind: 'absolute', value },
      })),
      yRails: [0, 0.25, 0.5, 0.75, 1].map((value, index) => ({
        id: y(index),
        axis: 'y',
        position: { kind: 'absolute', value },
      })),
      snapStep: 0.025,
      minGap: 0.05,
    },
    bindings,
  }
}

function createRoleSourcesFixture(): Record<JamoPartRole, RoleConstructionScope> {
  return Object.fromEntries(SHAPE_SYSTEM_ROLES.map((role) => {
    const grid = createBasePartGrid({
      role,
      xCorePositions: X,
      yCorePositions: Y,
      snapStep: 0.025,
      minGap: 0.05,
    })
    return [role, createRoleConstructionSourceV1({
      grid,
      masters: [createEmptyJamoRoleMaster({
        jamoId: `fixture:v2:${role}`,
        role,
        gridId: grid.id,
      })],
    })]
  })) as Record<JamoPartRole, RoleConstructionScope>
}

export function createConnectedShapeSystemV2Fixture(): ShapeSystemSourceV2 {
  const roleSources = createRoleSourcesFixture()
  const context: JamoVariantContext = { baseContext: 'horizontal', medialClass: 'wide' }
  const presetId = createContextGridPresetId('CH', context)
  const catalog: ContextGridPresetCatalogV1 = {
    schema: 'context-grid-preset-catalog',
    version: 1,
    roleDefaults: [{
      id: createRoleGridDefaultId('CH'),
      role: 'CH',
      coreRailPositions: { 'inner-right': { kind: 'absolute', value: 0.79 } },
    }],
    contextPresets: [{
      id: presetId,
      role: 'CH',
      context,
      coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.54 } },
    }],
  }
  const master = roleSources.CH.masters[0]
  master.contextVariants = [{
    id: createJamoContextVariantId(master.id, context),
    context,
    presetId,
    coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.22 } },
  }]
  return createShapeSystemSourceV2({
    roleSources,
    layoutGridSystem: createLayoutGridSystemFixture(),
    contextPresetCatalog: catalog,
  })
}
