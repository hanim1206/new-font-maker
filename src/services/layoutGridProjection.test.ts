import { describe, expect, it } from 'vitest'
import type {
  LayoutGridBinding,
  LayoutPartEdgeRailIds,
  LayoutSchema,
  LayoutType,
  Part,
  ResolvedLayoutGrid,
  SharedLayoutType,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'
import {
  BASE_PRESETS_SCHEMAS,
  calculateBoxes,
  calculateRawBoxes,
  DESIGN_BODY_BASE_PADDING,
} from '../utils/layoutCalculator'
import {
  LAYOUT_GRID_SLOT_PARTS,
  LAYOUT_GRID_SPLIT_IDS,
  identifyLegacySharedSplits,
  isLayoutGridSharedLayoutType,
  resolveAllGridBoundSchemas,
  resolveGridBoundSchema,
} from './layoutGridProjection'

const ALL_LAYOUT_TYPES: readonly LayoutType[] = [
  'choseong-only',
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
]

const edgeValues = (box: { x: number; y: number; width: number; height: number }) => ({
  left: box.x,
  right: box.x + box.width,
  top: box.y,
  bottom: box.y + box.height,
})

function valueKey(value: number): string {
  return Number(value.toFixed(12)).toString().replace('.', '_')
}

function createProjectionFixture() {
  const identified = {} as Record<SharedLayoutType, ReturnType<typeof identifyLegacySharedSplits> & { ok: true }>

  for (const layoutType of SHARED_LAYOUT_TYPES) {
    const result = identifyLegacySharedSplits(BASE_PRESETS_SCHEMAS[layoutType])
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    identified[layoutType] = result
  }

  const railId = (layoutType: SharedLayoutType, axis: 'x' | 'y', value: number) =>
    `layout-grid:${layoutType}:${axis}:${valueKey(value)}`
  const grid: ResolvedLayoutGrid = {
    id: 'layout-grid:shared-v1',
    xRails: [],
    yRails: [],
  }
  const addRail = (layoutType: SharedLayoutType, axis: 'x' | 'y', value: number) => {
    const id = railId(layoutType, axis, value)
    const rails = axis === 'x' ? grid.xRails : grid.yRails
    if (!rails.some((rail) => rail.id === id)) rails.push({ id, axis, value })
    return id
  }
  const bindings = {} as Record<SharedLayoutType, LayoutGridBinding>
  for (const layoutType of SHARED_LAYOUT_TYPES) {
    const splitRailIds: Record<string, string> = {}
    for (const split of identified[layoutType].projection.stableSplits) {
      splitRailIds[split.id] = addRail(layoutType, split.axis, split.value)
    }
    const boxes = calculateRawBoxes(BASE_PRESETS_SCHEMAS[layoutType])
    const partEdgeRailIds: Partial<Record<Part, LayoutPartEdgeRailIds>> = {}
    for (const part of LAYOUT_GRID_SLOT_PARTS[layoutType]) {
      const edges = edgeValues(boxes[part]!)
      partEdgeRailIds[part] = {
        left: addRail(layoutType, 'x', edges.left),
        right: addRail(layoutType, 'x', edges.right),
        top: addRail(layoutType, 'y', edges.top),
        bottom: addRail(layoutType, 'y', edges.bottom),
      }
    }
    bindings[layoutType] = {
      schema: 'layout-grid-binding',
      version: 1,
      id: `layout-binding:${layoutType}`,
      layoutType,
      layoutGridId: grid.id,
      splitRailIds,
      partEdgeRailIds,
    }
  }
  return {
    schemas: structuredClone(BASE_PRESETS_SCHEMAS),
    grid,
    bindings,
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

describe('layoutGridProjection', () => {
  it('공통 7종만 고정 순서로 정의하고 독립 모음 3종은 제외한다', () => {
    expect(SHARED_LAYOUT_TYPES).toEqual([
      'choseong-only',
      'choseong-jungseong-vertical',
      'choseong-jungseong-horizontal',
      'choseong-jungseong-mixed',
      'choseong-jungseong-vertical-jongseong',
      'choseong-jungseong-horizontal-jongseong',
      'choseong-jungseong-mixed-jongseong',
    ])
    expect(isLayoutGridSharedLayoutType('jungseong-vertical-only')).toBe(false)
    expect(isLayoutGridSharedLayoutType('jungseong-horizontal-only')).toBe(false)
    expect(isLayoutGridSharedLayoutType('jungseong-mixed-only')).toBe(false)
  })

  it('legacy split을 축과 의미 순서로 안정 ID에 연결한다', () => {
    for (const layoutType of SHARED_LAYOUT_TYPES) {
      const schema = structuredClone(BASE_PRESETS_SCHEMAS[layoutType])
      if (schema.splits) schema.splits.reverse()
      const result = identifyLegacySharedSplits(schema)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.projection.stableSplits.map(({ id }) => id)).toEqual(LAYOUT_GRID_SPLIT_IDS[layoutType])
      expect(result.projection.stableSplits.map(({ axis }) => axis)).toEqual(
        LAYOUT_GRID_SPLIT_IDS[layoutType].map((id) => id.split(':').at(-2)),
      )
      expect(result.projection.schema.splits?.every((split) => !('id' in split)) ?? true).toBe(true)
      expect(Object.hasOwn(result.projection.schema, 'splits')).toBe(Object.hasOwn(schema, 'splits'))
    }
  })

  it('공통 그리드를 해석해 기존 10종 박스를 exact 유지한다', () => {
    const fixture = deepFreeze(createProjectionFixture())
    const before = JSON.stringify(fixture)
    const result = resolveAllGridBoundSchemas(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const layoutType of ALL_LAYOUT_TYPES) {
      expect(calculateBoxes(result.schemas[layoutType])).toEqual(calculateBoxes(fixture.schemas[layoutType]))
    }
    for (const layoutType of [
      'jungseong-vertical-only',
      'jungseong-horizontal-only',
      'jungseong-mixed-only',
    ] as const) {
      expect(result.schemas[layoutType]).toEqual(fixture.schemas[layoutType])
    }
    expect(JSON.stringify(fixture)).toBe(before)
  })

  it('파생 schema는 저장 split 형식을 유지하고 같은 입력으로 재해석해도 exact 멱등이다', () => {
    const fixture = createProjectionFixture()
    const layoutType: SharedLayoutType = 'choseong-jungseong-mixed-jongseong'
    const first = resolveGridBoundSchema({
      schema: fixture.schemas[layoutType],
      grid: fixture.grid,
      binding: fixture.bindings[layoutType],
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.projection.schema.splits?.every((split) => !('id' in split))).toBe(true)
    const second = resolveGridBoundSchema({
      schema: first.projection.schema,
      grid: fixture.grid,
      binding: fixture.bindings[layoutType],
    })
    expect(second).toEqual(first)
  })

  it('split과 edge가 공유 Rail을 가리킬 때 한 변경이 모든 참조 레이아웃에 전파된다', () => {
    const fixture = createProjectionFixture()
    const firstLayout: SharedLayoutType = 'choseong-jungseong-vertical'
    const secondLayout: SharedLayoutType = 'choseong-jungseong-vertical-jongseong'
    const sharedRail = fixture.bindings[firstLayout].splitRailIds[
      LAYOUT_GRID_SPLIT_IDS['choseong-jungseong-vertical'][0]
    ]
    const secondSplitId = LAYOUT_GRID_SPLIT_IDS[secondLayout][0]
    const oldSecondRail = fixture.bindings[secondLayout].splitRailIds[secondSplitId]
    fixture.bindings[secondLayout].splitRailIds[secondSplitId] = sharedRail
    Object.values(fixture.bindings[secondLayout].partEdgeRailIds).forEach((edges) => {
      if (!edges) return
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        if (edges[edge] === oldSecondRail) edges[edge] = sharedRail
      }
    })
    const beforeUnconnected = structuredClone(fixture.schemas['choseong-jungseong-horizontal'])

    const moved = structuredClone(fixture)
    const rail = moved.grid.xRails.find(({ id }) => id === sharedRail)!
    rail.value += 0.01
    const result = resolveAllGridBoundSchemas(moved)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    ;[firstLayout, secondLayout].forEach((layoutType) => {
      expect(result.schemas[layoutType].splits?.some((split) => split.value === rail.value)).toBe(true)
    })
    expect(result.schemas['choseong-jungseong-horizontal']).toEqual(beforeUnconnected)
  })

  it('Design Body 변환은 resolver가 아니라 calculateBoxes에서 한 번만 적용한다', () => {
    const fixture = createProjectionFixture()
    const layoutType: SharedLayoutType = 'choseong-jungseong-vertical'
    const schema = structuredClone(fixture.schemas[layoutType])
    schema.designBodyPadding = { top: 0.12, bottom: 0.08, left: 0.1, right: 0.06 }
    schema.padding = { top: 0.23, bottom: 0.19, left: 0.21, right: 0.17 }
    const canonicalBodySchema = {
      ...schema,
      padding: DESIGN_BODY_BASE_PADDING,
      designBodyPadding: undefined,
    }
    const rawBoxes = calculateRawBoxes(canonicalBodySchema)
    for (const part of LAYOUT_GRID_SLOT_PARTS[layoutType]) {
      const edges = edgeValues(rawBoxes[part]!)
      const edgeIds = fixture.bindings[layoutType].partEdgeRailIds[part]!
      const additions = [
        ['x', edgeIds.left, edges.left], ['x', edgeIds.right, edges.right],
        ['y', edgeIds.top, edges.top], ['y', edgeIds.bottom, edges.bottom],
      ] as const
      for (const [axis, id, value] of additions) {
        const rails = axis === 'x' ? fixture.grid.xRails : fixture.grid.yRails
        const rail = rails.find((candidate) => candidate.id === id)
        if (rail) rail.value = value
      }
    }
    const result = resolveGridBoundSchema({ schema, grid: fixture.grid, binding: fixture.bindings[layoutType] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.projection.schema.designBodyPadding).toEqual(schema.designBodyPadding)
    const identified = identifyLegacySharedSplits(schema)
    expect(identified.ok).toBe(true)
    if (!identified.ok) return
    expect(result.projection.schema.splits?.map(({ value }) => value)).toEqual(
      identified.projection.schema.splits?.map(({ value }) => value),
    )
    expect(calculateBoxes(result.projection.schema)).toEqual(calculateBoxes(schema))
  })

  it('Design Body 단일 슬롯도 저장 padding과 무관하게 canonical 0.075 body edge만 받는다', () => {
    const fixture = createProjectionFixture()
    const layoutType: SharedLayoutType = 'choseong-only'
    const schema = structuredClone(fixture.schemas[layoutType])
    schema.designBodyPadding = { top: 0.11, bottom: 0.09, left: 0.13, right: 0.07 }
    schema.padding = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 }
    const edges = fixture.bindings[layoutType].partEdgeRailIds.CH!
    const values = {
      [edges.left]: DESIGN_BODY_BASE_PADDING.left,
      [edges.right]: 1 - DESIGN_BODY_BASE_PADDING.right,
      [edges.top]: DESIGN_BODY_BASE_PADDING.top,
      [edges.bottom]: 1 - DESIGN_BODY_BASE_PADDING.bottom,
    }
    for (const rail of [...fixture.grid.xRails, ...fixture.grid.yRails]) {
      if (values[rail.id] !== undefined) rail.value = values[rail.id]
    }
    const result = resolveGridBoundSchema({ schema, grid: fixture.grid, binding: fixture.bindings[layoutType] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.projection.schema.padding).toEqual(schema.padding)
    expect(calculateRawBoxes(result.projection.schema).CH?.width).toBeCloseTo(0.6, 12)
    expect(calculateBoxes(result.projection.schema).CH).toEqual(calculateBoxes(schema).CH)
  })

  it.each([
    ['binding layout mismatch', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      fixture.bindings[layoutType].layoutGridId = 'other-grid'
    }, 'invalid-binding'],
    ['missing split', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      const id = LAYOUT_GRID_SPLIT_IDS[layoutType][0]
      delete fixture.bindings[layoutType].splitRailIds[id]
    }, 'invalid-binding'],
    ['missing part', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      delete fixture.bindings[layoutType].partEdgeRailIds.CH
    }, 'invalid-binding'],
    ['missing rail', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      fixture.bindings[layoutType].partEdgeRailIds.CH!.left = 'missing'
    }, 'missing-rail'],
    ['cross axis', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      fixture.bindings[layoutType].partEdgeRailIds.CH!.left = fixture.grid.yRails[0].id
    }, 'cross-axis-rail'],
    ['split cross axis', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      fixture.bindings[layoutType].splitRailIds[LAYOUT_GRID_SPLIT_IDS[layoutType][0]] = fixture.grid.yRails[0].id
    }, 'cross-axis-rail'],
    ['zero edge', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      fixture.bindings[layoutType].partEdgeRailIds.CH!.right = fixture.bindings[layoutType].partEdgeRailIds.CH!.left
    }, 'invalid-edge-order'],
    ['duplicate rail id', (fixture: ReturnType<typeof createProjectionFixture>) => {
      fixture.grid.xRails[1].id = fixture.grid.xRails[0].id
    }, 'invalid-grid'],
    ['nonfinite rail', (fixture: ReturnType<typeof createProjectionFixture>) => {
      fixture.grid.xRails[0].value = Number.NaN
    }, 'invalid-grid'],
    ['out of range rail', (fixture: ReturnType<typeof createProjectionFixture>) => {
      fixture.grid.xRails[0].value = 1.01
    }, 'invalid-grid'],
    ['future grid field', (fixture: ReturnType<typeof createProjectionFixture>) => {
      Object.assign(fixture.grid, { future: true })
    }, 'invalid-grid'],
    ['future binding field', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      Object.assign(fixture.bindings[layoutType], { future: true })
    }, 'invalid-binding'],
    ['split edge conflict', (fixture: ReturnType<typeof createProjectionFixture>, layoutType: SharedLayoutType) => {
      const splitId = LAYOUT_GRID_SPLIT_IDS[layoutType][0]
      const splitRailId = fixture.bindings[layoutType].splitRailIds[splitId]
      const splitRail = [...fixture.grid.xRails, ...fixture.grid.yRails].find(({ id }) => id === splitRailId)!
      const candidates = splitRail.axis === 'x' ? fixture.grid.xRails : fixture.grid.yRails
      fixture.bindings[layoutType].splitRailIds[splitId] = candidates.find(({ id }) => id !== splitRailId)!.id
    }, 'split-edge-conflict'],
  ])('%s를 fail-closed한다', (_name, mutate, issueCode) => {
    const fixture = createProjectionFixture()
    const layoutType: SharedLayoutType = 'choseong-jungseong-vertical'
    mutate(fixture, layoutType)
    const before = JSON.stringify(fixture)
    const result = resolveGridBoundSchema({
      schema: fixture.schemas[layoutType],
      grid: fixture.grid,
      binding: fixture.bindings[layoutType],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toContain(issueCode)
    expect(JSON.stringify(fixture)).toBe(before)
  })

  it('일괄 해석은 입력 배열 순서와 반복 호출에 무관하며 하나가 실패하면 부분 결과를 내지 않는다', () => {
    const fixture = createProjectionFixture()
    fixture.grid.xRails.reverse()
    fixture.grid.yRails.reverse()
    const first = resolveAllGridBoundSchemas(fixture)
    const second = resolveAllGridBoundSchemas(structuredClone(fixture))
    expect(second).toEqual(first)
    expect(first.ok).toBe(true)

    const invalid = structuredClone(fixture)
    invalid.bindings['choseong-jungseong-mixed-jongseong'].partEdgeRailIds.JO!.bottom = 'missing'
    const failed = resolveAllGridBoundSchemas(invalid)
    expect(failed.ok).toBe(false)
    expect('schemas' in failed).toBe(false)

    const missingSchema = structuredClone(fixture)
    delete (missingSchema.schemas as Partial<Record<LayoutType, LayoutSchema>>)['jungseong-vertical-only']
    const missing = resolveAllGridBoundSchemas(missingSchema)
    expect(missing.ok).toBe(false)
  })

  it('production projection은 store, FontData, partGrid resolver에 의존하지 않는다', async () => {
    const source = await import('./layoutGridProjection?raw').then((module) => String(module.default))
    expect(source).not.toMatch(/stores\//)
    expect(source).not.toMatch(/layoutStore|shapeSystemStore|localStorage|SvgRenderer|fontExportUtils/)
    expect(source).not.toMatch(/fontData/i)
    expect(source).not.toMatch(/railGridResolver|partGrid|contextPartGrid/)
    expect(source).not.toMatch(/calculateBoxes\s*\(/)
    expect(source).toMatch(/calculateRawBoxes/)
  })
})
