import type {
  ContextGridPresetCatalogV1,
  CoreXRailRole,
  CoreYRailRole,
  JamoPartRole,
  RoleConstructionScope,
  ValidatedShapeSystemSourceV2,
} from '../types'
import {
  createEmptyJamoRoleMaster,
  createRoleConstructionSourceV1,
} from './jamoConstruction'
import { createBasePartGrid } from './railGridResolver'
import { SHAPE_SYSTEM_ROLES } from './shapeSystemSourceV1'
import { createShapeSystemSourceV2, parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

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

function createRoleSource(role: JamoPartRole): RoleConstructionScope {
  const grid = createBasePartGrid({
    role,
    xCorePositions: X,
    yCorePositions: Y,
    snapStep: 0.005,
    minGap: 0.05,
  })
  const masters = role === 'CH' || role === 'STANDALONE'
    ? [createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role, gridId: grid.id })]
    : []
  for (const master of masters) {
    master.construction.channels.main!.elements = [{
      id: `starter:centerline:${role}:giyeok`,
      kind: 'centerline',
      closed: false,
      thickness: 0.12,
      anchors: [
        {
          id: `starter:anchor:${role}:start`,
          point: {
            id: `starter:point:${role}:start`,
            xRailId: grid.xRails[1].id,
            yRailId: grid.yRails[1].id,
          },
        },
        {
          id: `starter:anchor:${role}:corner`,
          point: {
            id: `starter:point:${role}:corner`,
            xRailId: grid.xRails[3].id,
            yRailId: grid.yRails[1].id,
          },
        },
        {
          id: `starter:anchor:${role}:end`,
          point: {
            id: `starter:point:${role}:end`,
            xRailId: grid.xRails[3].id,
            yRailId: grid.yRails[3].id,
          },
        },
      ],
    }]
  }
  return createRoleConstructionSourceV1({ grid, masters })
}

/**
 * 기존 프로젝트 migration과 분리된 명시적 시작 구조다.
 * 화면에서 사용자가 선택했을 때만 만들며 legacy source를 추측해 연결하지 않는다.
 */
export function createStarterShapeSystemV2(): ValidatedShapeSystemSourceV2 {
  const roleSources = Object.fromEntries(
    SHAPE_SYSTEM_ROLES.map((role) => [role, createRoleSource(role)]),
  ) as Record<JamoPartRole, RoleConstructionScope>
  const emptyCatalog: ContextGridPresetCatalogV1 = {
    schema: 'context-grid-preset-catalog',
    version: 1,
    roleDefaults: [],
    contextPresets: [],
  }
  const parsed = parseShapeSystemSourceV2(createShapeSystemSourceV2({
    roleSources,
    layoutGridSystem: null,
    contextPresetCatalog: emptyCatalog,
  }))
  if (!parsed.ok) {
    throw new Error(`추천 Shape 시작 구조가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }
  return parsed.source
}
