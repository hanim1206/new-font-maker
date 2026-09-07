import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createRoleConstructionSourceV1,
  expectedConstructionChannel,
} from '../../../services/jamoConstruction'
import { parseRoleConstructionSourceV1 } from '../../../services/roleConstructionSourceV1'
import { createBasePartGrid } from '../../../services/railGridResolver'
import type {
  CoreXRailRole,
  CoreYRailRole,
  DeepReadonly,
  GridAreaElement,
  GridCenterlineElement,
  GridPointRef,
  JamoConstructionChannelName,
  JamoConstructionElement,
  JamoPartRole,
  RailGrid,
  RoleConstructionScope,
} from '../../../types'

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

export const FIVE_GUIDE_SHAPE_FIXTURE_ROLE_ORDER = [
  'STANDALONE',
  'CH',
  'JU_VERTICAL',
  'JU_HORIZONTAL',
  'JU_H',
  'JU_V',
  'JO',
] as const satisfies readonly JamoPartRole[]

interface FixtureMasterSpec {
  jamoId: 'ㄱ' | 'ㅁ' | 'ㅏ' | 'ㅗ' | 'ㅘ'
  geometry: 'giyeok' | 'mieum-area' | 'a' | 'o'
}

const ROLE_MASTERS: Record<JamoPartRole, readonly FixtureMasterSpec[]> = {
  STANDALONE: [
    { jamoId: 'ㄱ', geometry: 'giyeok' },
    { jamoId: 'ㅁ', geometry: 'mieum-area' },
  ],
  CH: [
    { jamoId: 'ㄱ', geometry: 'giyeok' },
    { jamoId: 'ㅁ', geometry: 'mieum-area' },
  ],
  JU_VERTICAL: [{ jamoId: 'ㅏ', geometry: 'a' }],
  JU_HORIZONTAL: [{ jamoId: 'ㅗ', geometry: 'o' }],
  JU_H: [{ jamoId: 'ㅘ', geometry: 'o' }],
  JU_V: [{ jamoId: 'ㅘ', geometry: 'a' }],
  JO: [
    { jamoId: 'ㄱ', geometry: 'giyeok' },
    { jamoId: 'ㅁ', geometry: 'mieum-area' },
  ],
}

export interface FiveGuideShapeFixtureV0 {
  version: 'shape-source-v0'
  roleOrder: typeof FIVE_GUIDE_SHAPE_FIXTURE_ROLE_ORDER
  roleSources: Record<JamoPartRole, RoleConstructionScope>
}

export function createFiveGuideFixtureId(
  kind: 'element' | 'anchor' | 'point',
  ...parts: Array<string | number>
): string {
  return [
    'five-guide-square-p0',
    kind,
    ...parts.map((part) => encodeURIComponent(String(part))),
  ].join(':')
}

function railId(
  grid: RailGrid,
  axis: 'x' | 'y',
  role: CoreXRailRole | CoreYRailRole,
): string {
  const rail = (axis === 'x' ? grid.xRails : grid.yRails).find((candidate) => candidate.coreRole === role)
  if (!rail) throw new Error(`${grid.role}/${axis}/${role} fixture Rail이 없습니다.`)
  return rail.id
}

function point(
  input: {
    role: JamoPartRole
    jamoId: string
    channel: JamoConstructionChannelName
    semanticName: string
    anchorIndex: number
    x: CoreXRailRole
    y: CoreYRailRole
    grid: RailGrid
  },
): GridPointRef {
  return {
    id: createFiveGuideFixtureId(
      'point',
      input.role,
      input.jamoId,
      input.channel,
      input.semanticName,
      input.anchorIndex,
    ),
    xRailId: railId(input.grid, 'x', input.x),
    yRailId: railId(input.grid, 'y', input.y),
  }
}

function centerline(input: {
  role: JamoPartRole
  jamoId: string
  channel: JamoConstructionChannelName
  semanticName: string
  grid: RailGrid
  points: ReadonlyArray<readonly [CoreXRailRole, CoreYRailRole]>
}): GridCenterlineElement {
  return {
    id: createFiveGuideFixtureId(
      'element',
      input.role,
      input.jamoId,
      input.channel,
      input.semanticName,
    ),
    kind: 'centerline',
    closed: false,
    thickness: 0.12,
    linecap: 'round',
    linejoin: 'round',
    anchors: input.points.map(([x, y], anchorIndex) => ({
      id: createFiveGuideFixtureId(
        'anchor',
        input.role,
        input.jamoId,
        input.channel,
        input.semanticName,
        anchorIndex,
      ),
      point: point({ ...input, anchorIndex, x, y }),
    })),
  }
}

function mieumArea(input: {
  role: JamoPartRole
  channel: JamoConstructionChannelName
  grid: RailGrid
  masterId: string
}): GridAreaElement {
  const elementId = createFiveGuideFixtureId(
    'element',
    input.role,
    'ㅁ',
    input.channel,
    'mieum-area',
  )
  const filledCells = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if (row !== 0 && row !== 3 && column !== 0 && column !== 3) continue
      const leftRailId = input.grid.xRails[column].id
      const rightRailId = input.grid.xRails[column + 1].id
      const topRailId = input.grid.yRails[row].id
      const bottomRailId = input.grid.yRails[row + 1].id
      filledCells.push({
        id: createGridCellId({
          masterId: input.masterId,
          channel: input.channel,
          elementId,
          leftRailId,
          rightRailId,
          topRailId,
          bottomRailId,
        }),
        leftRailId,
        rightRailId,
        topRailId,
        bottomRailId,
      })
    }
  }
  return { id: elementId, kind: 'area', filledCells, boundaryTreatments: [] }
}

function elementsFor(
  role: JamoPartRole,
  spec: FixtureMasterSpec,
  channel: JamoConstructionChannelName,
  grid: RailGrid,
  masterId: string,
): JamoConstructionElement[] {
  const shared = { role, jamoId: spec.jamoId, channel, grid }
  if (spec.geometry === 'giyeok') return [centerline({
    ...shared,
    semanticName: 'giyeok',
    points: [
      ['inner-left', 'inner-top'],
      ['inner-right', 'inner-top'],
      ['inner-right', 'inner-bottom'],
    ],
  })]
  if (spec.geometry === 'mieum-area') return [mieumArea({ role, channel, grid, masterId })]
  if (spec.geometry === 'a') return [
    centerline({
      ...shared,
      semanticName: 'vertical',
      points: [['center-x', 'inner-top'], ['center-x', 'inner-bottom']],
    }),
    centerline({
      ...shared,
      semanticName: 'arm',
      points: [['center-x', 'center-y'], ['inner-right', 'center-y']],
    }),
  ]
  return [
    centerline({
      ...shared,
      semanticName: 'horizontal',
      points: [['inner-left', 'center-y'], ['inner-right', 'center-y']],
    }),
    centerline({
      ...shared,
      semanticName: 'vertical',
      points: [['center-x', 'inner-top'], ['center-x', 'center-y']],
    }),
  ]
}

function roleSource(role: JamoPartRole): RoleConstructionScope {
  const grid = createBasePartGrid({
    role,
    xCorePositions: X,
    yCorePositions: Y,
    snapStep: 0.005,
    minGap: 0.05,
  })
  const masters = ROLE_MASTERS[role].map((spec) => {
    const master = createEmptyJamoRoleMaster({ jamoId: spec.jamoId, role, gridId: grid.id })
    const channelName = expectedConstructionChannel(role)
    const channel = master.construction.channels[channelName]
    if (!channel) throw new Error(`${role}/${spec.jamoId}/${channelName} fixture channel이 없습니다.`)
    channel.elements = elementsFor(role, spec, channelName, grid, master.id)
    return master
  })
  const parsed = parseRoleConstructionSourceV1(createRoleConstructionSourceV1({ grid, masters }))
  if (!parsed.ok) {
    throw new Error(`${role} Shape fixture가 유효하지 않습니다: ${parsed.issues.map(({ code }) => code).join(', ')}`)
  }
  return parsed.source as unknown as RoleConstructionScope
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((child) => deepFreeze(child))
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

export function createFiveGuideShapeFixtureV0(): DeepReadonly<FiveGuideShapeFixtureV0> {
  const roleSources = Object.fromEntries(
    FIVE_GUIDE_SHAPE_FIXTURE_ROLE_ORDER.map((role) => [role, roleSource(role)]),
  ) as Record<JamoPartRole, RoleConstructionScope>
  return deepFreeze({
    version: 'shape-source-v0',
    roleOrder: FIVE_GUIDE_SHAPE_FIXTURE_ROLE_ORDER,
    roleSources,
  })
}
