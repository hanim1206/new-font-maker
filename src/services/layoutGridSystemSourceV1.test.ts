import { describe, expect, it } from 'vitest'
import type {
  Axis,
  BoxConfig,
  LayoutGridBinding,
  LayoutGridSourceRailV1,
  LayoutGridSystemSourceV1,
  LayoutPartEdgeRailIds,
  LayoutSchema,
  LayoutType,
  Part,
  SharedLayoutType,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'
import {
  LAYOUT_GRID_EDGE_EQUALITY_GROUPS,
  identifyLegacySharedSplits,
  LAYOUT_GRID_SLOT_PARTS,
  LAYOUT_GRID_SPLIT_IDS,
  resolveAllGridBoundSchemas,
} from './layoutGridProjection'
import {
  createLayoutGridBindingId,
  LAYOUT_GRID_GAP_EPSILON,
  parseLayoutGridSystemSourceV1,
} from './layoutGridSystemSourceV1'
import { LAYOUT_GRID_TOPOLOGIES } from './layoutGridTopology'
import { BASE_PRESETS_SCHEMAS, calculateRawBoxes } from '../utils/layoutCalculator'

const x = (index: number) => `layout-grid:test:x:${index}`
const y = (index: number) => `layout-grid:test:y:${index}`

function edges(left: number, right: number, top: number, bottom: number): LayoutPartEdgeRailIds {
  return { left: x(left), right: x(right), top: y(top), bottom: y(bottom) }
}

const PART_EDGES: Readonly<Record<SharedLayoutType, Partial<Record<Part, LayoutPartEdgeRailIds>>>> = {
  'choseong-only': { CH: edges(0, 4, 0, 4) },
  'choseong-jungseong-vertical': {
    CH: edges(0, 2, 0, 4), JU: edges(2, 4, 0, 4),
  },
  'choseong-jungseong-horizontal': {
    CH: edges(0, 4, 0, 2), JU: edges(0, 4, 2, 4),
  },
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

const EXPECTED_EDGE_EQUALITY_SIGNATURES: Readonly<Record<SharedLayoutType, readonly string[]>> = {
  'choseong-only': [],
  'choseong-jungseong-vertical': [
    'choseong-jungseong-vertical:x:ch-ju:CH.right|JU.left',
    '-:CH.top|JU.top',
    '-:CH.bottom|JU.bottom',
  ],
  'choseong-jungseong-horizontal': [
    'choseong-jungseong-horizontal:y:ch-ju:CH.bottom|JU.top',
    '-:CH.left|JU.left',
    '-:CH.right|JU.right',
  ],
  'choseong-jungseong-mixed': [
    'choseong-jungseong-mixed:x:left-column-ju-v:CH.right|JU_H.right|JU_V.left',
    'choseong-jungseong-mixed:y:ch-ju-h:CH.bottom|JU_H.top',
    '-:CH.left|JU_H.left',
    '-:CH.top|JU_V.top',
    '-:JU_H.bottom|JU_V.bottom',
  ],
  'choseong-jungseong-vertical-jongseong': [
    'choseong-jungseong-vertical-jongseong:x:ch-ju:CH.right|JU.left',
    'choseong-jungseong-vertical-jongseong:y:upper-jo:CH.bottom|JO.top|JU.bottom',
    '-:CH.top|JU.top',
    '-:CH.left|JO.left',
    '-:JO.right|JU.right',
  ],
  'choseong-jungseong-horizontal-jongseong': [
    'choseong-jungseong-horizontal-jongseong:y:ch-ju:CH.bottom|JU.top',
    'choseong-jungseong-horizontal-jongseong:y:ju-jo:JO.top|JU.bottom',
    '-:CH.left|JO.left|JU.left',
    '-:CH.right|JO.right|JU.right',
  ],
  'choseong-jungseong-mixed-jongseong': [
    'choseong-jungseong-mixed-jongseong:x:left-column-ju-v:CH.right|JU_H.right|JU_V.left',
    'choseong-jungseong-mixed-jongseong:y:ch-ju-h:CH.bottom|JU_H.top',
    'choseong-jungseong-mixed-jongseong:y:upper-jo:JO.top|JU_H.bottom|JU_V.bottom',
    '-:CH.left|JO.left|JU_H.left',
    '-:CH.top|JU_V.top',
    '-:JO.right|JU_V.right',
  ],
}

function equalitySignature(group: (typeof LAYOUT_GRID_EDGE_EQUALITY_GROUPS)[SharedLayoutType][number]): string {
  const edges = group.edges.map(({ part, edge }) => `${part}.${edge}`).sort().join('|')
  return `${group.splitId ?? '-'}:${edges}`
}

function splitRailIds(layoutType: SharedLayoutType): Record<string, string> {
  return Object.fromEntries(LAYOUT_GRID_SPLIT_IDS[layoutType].map((id) => {
    if (id.includes(':x:')) return [id, x(2)]
    if (id.endsWith(':upper-jo') || id.endsWith(':ju-jo')) return [id, y(3)]
    return [id, y(2)]
  }))
}

function binding(layoutType: SharedLayoutType): LayoutGridBinding {
  return {
    schema: 'layout-grid-binding',
    version: 1,
    id: createLayoutGridBindingId(layoutType),
    layoutType,
    layoutGridId: 'layout-grid:test',
    splitRailIds: splitRailIds(layoutType),
    partEdgeRailIds: structuredClone(PART_EDGES[layoutType]),
  }
}

function source(): LayoutGridSystemSourceV1 {
  return {
    schema: 'layout-grid-system',
    version: 1,
    grid: {
      schema: 'layout-grid-source',
      version: 1,
      id: 'layout-grid:test',
      xRails: [0, 0.25, 0.5, 0.75, 1].map((value, index) => ({
        id: x(index), axis: 'x' as const, position: { kind: 'absolute' as const, value },
      })),
      yRails: [0, 0.25, 0.5, 0.75, 1].map((value, index) => ({
        id: y(index), axis: 'y' as const, position: { kind: 'absolute' as const, value },
      })),
      snapStep: 0.025,
      minGap: 0.05,
    },
    bindings: Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => [
      layoutType,
      binding(layoutType),
    ])) as Record<SharedLayoutType, LayoutGridBinding>,
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

const coordinateKey = (value: number): string => value.toFixed(12)

/** 실제 legacy 기준값을 검증하기 위한 test-only 명시 연결본. production initializer가 아니다. */
function legacyBaselineSource(): LayoutGridSystemSourceV1 {
  const values: Record<Axis, Map<string, number>> = { x: new Map(), y: new Map() }
  const addValue = (axis: Axis, value: number): void => {
    values[axis].set(coordinateKey(value), value)
  }
  const schemas = structuredClone(BASE_PRESETS_SCHEMAS) as Record<LayoutType, LayoutSchema>
  const boxesByLayout = new Map<SharedLayoutType, Partial<Record<Part, BoxConfig>>>()
  const splitsByLayout = new Map<SharedLayoutType, { id: string; axis: Axis; value: number }[]>()
  for (const layoutType of SHARED_LAYOUT_TYPES) {
    const identified = identifyLegacySharedSplits(schemas[layoutType])
    if (!identified.ok) throw new Error(identified.issues[0]?.message)
    splitsByLayout.set(layoutType, identified.projection.stableSplits)
    identified.projection.stableSplits.forEach(({ axis, value }) => addValue(axis, value))
    const boxes = calculateRawBoxes(schemas[layoutType])
    boxesByLayout.set(layoutType, boxes)
    for (const part of LAYOUT_GRID_SLOT_PARTS[layoutType]) {
      const box = boxes[part]
      if (!box) throw new Error(`${layoutType}/${part} box가 없습니다.`)
      addValue('x', box.x)
      addValue('x', box.x + box.width)
      addValue('y', box.y)
      addValue('y', box.y + box.height)
    }
  }
  const axisValues: Record<Axis, number[]> = {
    x: [...values.x.values()].sort((left, right) => left - right),
    y: [...values.y.values()].sort((left, right) => left - right),
  }
  const railId = (axis: Axis, value: number): string => {
    const index = axisValues[axis].findIndex((candidate) => coordinateKey(candidate) === coordinateKey(value))
    if (index < 0) throw new Error(`${axis}/${value} Rail이 없습니다.`)
    return `layout-grid:legacy-baseline:${axis}:${index}`
  }
  const rails = (axis: Axis): LayoutGridSourceRailV1[] => axisValues[axis].map((value, index) => ({
    id: `layout-grid:legacy-baseline:${axis}:${index}`,
    axis,
    position: { kind: 'absolute', value },
  }))
  const bindings = Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => {
    const boxes = boxesByLayout.get(layoutType)!
    const stableSplits = splitsByLayout.get(layoutType)!
    return [layoutType, {
      schema: 'layout-grid-binding',
      version: 1,
      id: createLayoutGridBindingId(layoutType),
      layoutType,
      layoutGridId: 'layout-grid:legacy-baseline',
      splitRailIds: Object.fromEntries(stableSplits.map((split) => [split.id, railId(split.axis, split.value)])),
      partEdgeRailIds: Object.fromEntries(LAYOUT_GRID_SLOT_PARTS[layoutType].map((part) => {
        const box = boxes[part]!
        return [part, {
          left: railId('x', box.x),
          right: railId('x', box.x + box.width),
          top: railId('y', box.y),
          bottom: railId('y', box.y + box.height),
        }]
      })),
    } satisfies LayoutGridBinding]
  })) as Record<SharedLayoutType, LayoutGridBinding>
  const gaps = [...axisValues.x, ...axisValues.y]
    .sort((left, right) => left - right)
    .slice(1)
    .map((value, index) => value - [...axisValues.x, ...axisValues.y].sort((left, right) => left - right)[index])
    .filter((gap) => gap > 1e-12)
  return {
    schema: 'layout-grid-system',
    version: 1,
    grid: {
      schema: 'layout-grid-source',
      version: 1,
      id: 'layout-grid:legacy-baseline',
      xRails: rails('x'),
      yRails: rails('y'),
      snapStep: 0.005,
      minGap: Math.min(...gaps) / 2,
    },
    bindings,
  }
}

describe('layoutGridSystemSourceV1', () => {
  it('공통 grid 1개와 정확히 7개 binding을 strict source로 해석한다', () => {
    const input = source()
    const result = parseLayoutGridSystemSourceV1(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resolvedGrid).toEqual({
      id: input.grid.id,
      xRails: input.grid.xRails.map(({ id, axis, position }) => ({ id, axis, value: position.kind === 'absolute' ? position.value : -1 })),
      yRails: input.grid.yRails.map(({ id, axis, position }) => ({ id, axis, value: position.kind === 'absolute' ? position.value : -1 })),
    })
    expect(Object.keys(result.source.bindings)).toEqual(SHARED_LAYOUT_TYPES)
    for (const layoutType of SHARED_LAYOUT_TYPES) {
      expect(Object.keys(result.source.bindings[layoutType].partEdgeRailIds).sort())
        .toEqual([...LAYOUT_GRID_SLOT_PARTS[layoutType]].sort())
    }
  })

  it('between Rail을 안정 ID 참조로 해석하고 원본에는 위치식을 보존한다', () => {
    const input = source()
    input.grid.xRails[2].position = {
      kind: 'between', fromRailId: x(1), toRailId: x(3), ratio: 0.5,
    }
    const result = parseLayoutGridSystemSourceV1(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resolvedGrid.xRails[2].value).toBe(0.5)
    expect(result.source.grid.xRails[2].position).toEqual(input.grid.xRails[2].position)
  })

  it('validated source의 resolved grid와 7 bindings를 production projection에 그대로 전달한다', () => {
    const parsed = parseLayoutGridSystemSourceV1(source())
    if (!parsed.ok) throw new Error(parsed.issues[0]?.message)
    const schemas = structuredClone(BASE_PRESETS_SCHEMAS) as Record<LayoutType, LayoutSchema>
    for (const layoutType of SHARED_LAYOUT_TYPES) {
      schemas[layoutType] = {
        id: layoutType,
        slots: [...LAYOUT_GRID_SLOT_PARTS[layoutType]],
        splits: LAYOUT_GRID_SPLIT_IDS[layoutType].map((id) => ({
          axis: id.includes(':x:') ? 'x' : 'y',
          value: id.includes(':x:') ? 0.4 : id.endsWith(':upper-jo') || id.endsWith(':ju-jo') ? 0.7 : 0.4,
        })),
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }
    }
    const projected = resolveAllGridBoundSchemas({
      schemas,
      grid: parsed.resolvedGrid,
      bindings: parsed.source.bindings,
    })
    expect(projected.ok).toBe(true)
    if (projected.ok) {
      expect(projected.schemas['choseong-jungseong-mixed'].splits).toEqual([
        { axis: 'x', value: 0.5 },
        { axis: 'y', value: 0.5 },
      ])
    }
  })

  it('실제 legacy 10종 기준값을 parser에서 projection까지 byte-semantic 보존한다', () => {
    const schemas = deepFreeze(structuredClone(BASE_PRESETS_SCHEMAS) as Record<LayoutType, LayoutSchema>)
    const input = deepFreeze(legacyBaselineSource())
    const before = JSON.stringify(input)
    const parsed = parseLayoutGridSystemSourceV1(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const projected = resolveAllGridBoundSchemas({
      schemas,
      grid: parsed.resolvedGrid,
      bindings: parsed.source.bindings,
    })
    expect(projected.ok).toBe(true)
    if (!projected.ok) return
    expect(projected.schemas).toEqual(schemas)
    for (const layoutType of SHARED_LAYOUT_TYPES) {
      expect(projected.stableSplits[layoutType].map(({ id }) => id)).toEqual(LAYOUT_GRID_SPLIT_IDS[layoutType])
    }
    expect(JSON.stringify(input)).toBe(before)
  })

  it('IEEE-754 exact minGap 경계를 허용하고 실제 미달만 차단한다', () => {
    expect(LAYOUT_GRID_GAP_EPSILON).toBe(1e-12)
    const exact = source()
    exact.grid.xRails.forEach((rail, index) => {
      rail.position = { kind: 'absolute', value: [0, 0.1, 0.15, 0.5, 1][index] }
    })
    exact.grid.minGap = 0.05
    expect(parseLayoutGridSystemSourceV1(exact).ok).toBe(true)

    const below = structuredClone(exact)
    below.grid.xRails[2].position = { kind: 'absolute', value: 0.149999 }
    const result = parseLayoutGridSystemSourceV1(below)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some(({ code }) => code === 'invalid-gap')).toBe(true)

    const tolerated = structuredClone(exact)
    tolerated.grid.xRails[2].position = {
      kind: 'absolute', value: 0.15 - LAYOUT_GRID_GAP_EPSILON / 2,
    }
    expect(parseLayoutGridSystemSourceV1(tolerated).ok).toBe(true)

    const outsideTolerance = structuredClone(exact)
    outsideTolerance.grid.xRails[2].position = {
      kind: 'absolute', value: 0.15 - LAYOUT_GRID_GAP_EPSILON * 2,
    }
    const outsideResult = parseLayoutGridSystemSourceV1(outsideTolerance)
    expect(outsideResult.ok).toBe(false)
    if (!outsideResult.ok) {
      expect(outsideResult.issues.some(({ code }) => code === 'invalid-gap')).toBe(true)
    }
  })

  it('split Rail과 의미상 같은 part edge가 다르면 source 단계에서 차단한다', () => {
    const input = source()
    const layoutType = 'choseong-jungseong-vertical'
    const splitId = LAYOUT_GRID_SPLIT_IDS[layoutType][0]
    input.bindings[layoutType].splitRailIds[splitId] = x(1)
    const result = parseLayoutGridSystemSourceV1(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'invalid-binding',
        path: `$.bindings.${layoutType}.partEdgeRailIds.CH.right`,
      }))
    }
  })

  it('7종 topology의 모든 split과 정렬 edge 동치 관계를 strict source에서 검증한다', () => {
    for (const layoutType of SHARED_LAYOUT_TYPES) {
      const topology = LAYOUT_GRID_TOPOLOGIES[layoutType]
      const groups = LAYOUT_GRID_EDGE_EQUALITY_GROUPS[layoutType]
      expect(groups.map(equalitySignature).sort()).toEqual(
        [...EXPECTED_EDGE_EQUALITY_SIGNATURES[layoutType]].sort(),
      )
      expect(groups.filter(({ splitId }) => splitId !== undefined).map(({ splitId }) => splitId))
        .toEqual(topology.splits.map(({ id }) => id))
      for (const group of groups) {
        expect(group.edges.length).toBeGreaterThanOrEqual(2)
        const split = group.splitId
          ? topology.splits.find(({ id }) => id === group.splitId)
          : undefined
        for (const { part, edge } of group.edges) {
          expect(topology.slots).toContain(part)
          if (split) expect(edge === 'left' || edge === 'right' ? 'x' : 'y').toBe(split.axis)
        }

        const input = source()
        const target = group.edges.at(-1)!
        const currentRailId = input.bindings[layoutType].partEdgeRailIds[target.part]![target.edge]
        const candidates = target.edge === 'left' || target.edge === 'right'
          ? [x(1), x(3)]
          : [y(1), y(3)]
        input.bindings[layoutType].partEdgeRailIds[target.part]![target.edge] =
          candidates.find((railId) => railId !== currentRailId)!
        const result = parseLayoutGridSystemSourceV1(input)
        expect(result.ok, `${layoutType}/${target.part}.${target.edge}`).toBe(false)
        if (!result.ok) {
          expect(result.issues).toContainEqual(expect.objectContaining({
            code: 'invalid-binding',
            path: `$.bindings.${layoutType}.partEdgeRailIds.${target.part}.${target.edge}`,
          }))
        }
      }
    }
  })

  it.each([
    ['future root field', (value: LayoutGridSystemSourceV1 & Record<string, unknown>) => { value.future = true }],
    ['missing binding', (value: LayoutGridSystemSourceV1) => { delete (value.bindings as Partial<typeof value.bindings>)['choseong-only'] }],
    ['extra binding', (value: LayoutGridSystemSourceV1) => {
      ;(value.bindings as Record<string, LayoutGridBinding>).extra = binding('choseong-only')
    }],
    ['noncanonical binding id', (value: LayoutGridSystemSourceV1) => { value.bindings['choseong-only'].id = 'binding:random' }],
    ['wrong grid ownership', (value: LayoutGridSystemSourceV1) => { value.bindings['choseong-only'].layoutGridId = 'other-grid' }],
    ['missing split reference', (value: LayoutGridSystemSourceV1) => {
      const id = LAYOUT_GRID_SPLIT_IDS['choseong-jungseong-vertical'][0]
      value.bindings['choseong-jungseong-vertical'].splitRailIds[id] = 'missing'
    }],
    ['cross-axis edge', (value: LayoutGridSystemSourceV1) => {
      value.bindings['choseong-only'].partEdgeRailIds.CH!.left = y(0)
    }],
    ['reversed edge', (value: LayoutGridSystemSourceV1) => {
      value.bindings['choseong-only'].partEdgeRailIds.CH = edges(4, 0, 0, 4)
    }],
  ] as const)('%s를 fail-closed한다', (_label, mutate) => {
    const input = source() as LayoutGridSystemSourceV1 & Record<string, unknown>
    mutate(input)
    const result = parseLayoutGridSystemSourceV1(input)
    expect(result.ok).toBe(false)
  })

  it.each([
    ['duplicate Rail ID', (value: LayoutGridSystemSourceV1) => { value.grid.yRails[0].id = value.grid.xRails[0].id }],
    ['missing between reference', (value: LayoutGridSystemSourceV1) => {
      value.grid.xRails[2].position = { kind: 'between', fromRailId: 'missing', toRailId: x(3), ratio: 0.5 }
    }],
    ['cross-axis between reference', (value: LayoutGridSystemSourceV1) => {
      value.grid.xRails[2].position = { kind: 'between', fromRailId: y(1), toRailId: x(3), ratio: 0.5 }
    }],
    ['cyclic between reference', (value: LayoutGridSystemSourceV1) => {
      value.grid.xRails[1].position = { kind: 'between', fromRailId: x(0), toRailId: x(2), ratio: 0.5 }
      value.grid.xRails[2].position = { kind: 'between', fromRailId: x(1), toRailId: x(3), ratio: 0.5 }
    }],
    ['nonmonotonic Rail order', (value: LayoutGridSystemSourceV1) => {
      value.grid.xRails[2].position = { kind: 'absolute', value: 0.2 }
    }],
    ['minGap violation', (value: LayoutGridSystemSourceV1) => {
      value.grid.xRails[2].position = { kind: 'absolute', value: 0.27 }
    }],
    ['inherited absolute value', (value: LayoutGridSystemSourceV1) => {
      value.grid.xRails[2].position = Object.create({ kind: 'absolute', value: 0.5 })
    }],
  ] as const)('%s Rail 원본을 throw 없이 차단한다', (_label, mutate) => {
    const input = source()
    mutate(input)
    expect(() => parseLayoutGridSystemSourceV1(input)).not.toThrow()
    expect(parseLayoutGridSystemSourceV1(input).ok).toBe(false)
  })

  it.each([
    ['null', (rails: unknown[]) => { rails[2] = null }],
    ['undefined', (rails: unknown[]) => { rails[2] = undefined }],
    ['sparse hole', (rails: unknown[]) => { delete rails[2] }],
    ['primitive', (rails: unknown[]) => { rails[2] = 7 }],
    ['missing id object', (rails: unknown[]) => { rails[2] = { axis: 'x', position: { kind: 'absolute', value: 0.5 } } }],
  ] as const)('%s Rail 배열 항목을 no-throw fail-closed한다', (_label, mutate) => {
    const input = source()
    mutate(input.grid.xRails as unknown[])
    let result: ReturnType<typeof parseLayoutGridSystemSourceV1> | undefined
    expect(() => { result = parseLayoutGridSystemSourceV1(input) }).not.toThrow()
    expect(result?.ok).toBe(false)
    expect(result).not.toHaveProperty('source')
    expect(result).not.toHaveProperty('resolvedGrid')
    if (result && !result.ok) expect(result.issues.some(({ code }) => code === 'invalid-rail')).toBe(true)
  })

  it.each(['grid', 'rail'] as const)('canonical split ID와 충돌하는 %s ID를 차단한다', (target) => {
    const input = source()
    const splitId = LAYOUT_GRID_SPLIT_IDS['choseong-jungseong-vertical'][0]
    if (target === 'grid') {
      input.grid.id = splitId
      for (const layoutType of SHARED_LAYOUT_TYPES) input.bindings[layoutType].layoutGridId = splitId
    } else {
      input.grid.xRails[2].id = splitId
    }
    const result = parseLayoutGridSystemSourceV1(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some(({ code }) => code === 'duplicate-id')).toBe(true)
  })

  it('forward between chain을 재귀 없이 결정적으로 해석한다', () => {
    const input = source()
    input.grid.xRails[1].position = { kind: 'between', fromRailId: x(0), toRailId: x(2), ratio: 0.5 }
    input.grid.xRails[2].position = { kind: 'between', fromRailId: x(0), toRailId: x(3), ratio: 0.5 }
    const first = parseLayoutGridSystemSourceV1(input)
    const second = parseLayoutGridSystemSourceV1(input)
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (first.ok) expect(first.resolvedGrid.xRails.map(({ value }) => value)).toEqual([0, 0.1875, 0.375, 0.75, 1])
  })

  it('깊은 forward between chain도 stack overflow 없이 선형 해석한다', () => {
    const input = source()
    const lastIndex = 1000
    input.grid.xRails = Array.from({ length: lastIndex + 1 }, (_, index): LayoutGridSourceRailV1 => ({
      id: x(index),
      axis: 'x',
      position: index === 0
        ? { kind: 'absolute', value: 0 }
        : index === lastIndex
          ? { kind: 'absolute', value: 1 }
          : { kind: 'between', fromRailId: x(0), toRailId: x(index + 1), ratio: index / (index + 1) },
    }))
    input.grid.minGap = 0.0005
    let result: ReturnType<typeof parseLayoutGridSystemSourceV1> | undefined
    expect(() => { result = parseLayoutGridSystemSourceV1(input) }).not.toThrow()
    expect(result?.ok).toBe(true)
    if (result?.ok) {
      expect(result.resolvedGrid.xRails[1].value).toBeCloseTo(0.001, 12)
      expect(result.resolvedGrid.xRails[999].value).toBeCloseTo(0.999, 12)
    }
  })

  it('prototype root/grid/binding 필드를 own source로 승인하지 않는다', () => {
    const inheritedRoot = Object.create(source())
    expect(parseLayoutGridSystemSourceV1(inheritedRoot).ok).toBe(false)

    const input = source()
    input.bindings['choseong-only'] = Object.create(input.bindings['choseong-only'])
    expect(parseLayoutGridSystemSourceV1(input).ok).toBe(false)
  })

  it('frozen 입력을 바꾸지 않고 반복 결과와 clone을 결정적으로 유지한다', () => {
    const input = deepFreeze(source())
    const before = JSON.stringify(input)
    const first = parseLayoutGridSystemSourceV1(input)
    const second = parseLayoutGridSystemSourceV1(input)
    expect(second).toEqual(first)
    expect(JSON.stringify(input)).toBe(before)
    if (!first.ok) throw new Error(first.issues[0]?.message)
    ;(first.resolvedGrid.xRails[0] as { value: number }).value = 99
    expect(JSON.stringify(input)).toBe(before)
  })

  it('binding 삽입 순서와 오류 입력의 key 순서가 결과를 바꾸지 않는다', () => {
    const normal = source()
    const reversed = source()
    reversed.bindings = Object.fromEntries(
      [...SHARED_LAYOUT_TYPES].reverse().map((layoutType) => [layoutType, reversed.bindings[layoutType]]),
    ) as Record<SharedLayoutType, LayoutGridBinding>
    expect(parseLayoutGridSystemSourceV1(reversed)).toEqual(parseLayoutGridSystemSourceV1(normal))

    const invalidA = source()
    invalidA.bindings['choseong-jungseong-vertical'].splitRailIds[
      LAYOUT_GRID_SPLIT_IDS['choseong-jungseong-vertical'][0]
    ] = 'missing'
    invalidA.bindings['choseong-only'].partEdgeRailIds.CH!.left = y(0)
    const invalidB = structuredClone(invalidA)
    invalidB.bindings = Object.fromEntries(
      [...SHARED_LAYOUT_TYPES].reverse().map((layoutType) => [layoutType, invalidB.bindings[layoutType]]),
    ) as Record<SharedLayoutType, LayoutGridBinding>
    expect(parseLayoutGridSystemSourceV1(invalidB)).toEqual(parseLayoutGridSystemSourceV1(invalidA))
  })

  it('production parser는 store·FontData·Shape·UI에 의존하지 않는다', async () => {
    const [parser, projection, topology] = await Promise.all([
      import('./layoutGridSystemSourceV1?raw').then((module) => String(module.default)),
      import('./layoutGridProjection?raw').then((module) => String(module.default)),
      import('./layoutGridTopology?raw').then((module) => String(module.default)),
    ])
    const imports = [...parser.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).sort()
    expect([...new Set(imports)]).toEqual(['../types', './layoutGridTopology'])
    const topologyImports = [...topology.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
    expect([...new Set(topologyImports)]).toEqual(['../types'])
    expect(parser).not.toMatch(/layoutGridProjection/)
    expect(projection).not.toMatch(/layoutGridSystemSourceV1/)
    expect(parser).not.toMatch(/localStorage|window|document|react|zustand|stores\//i)
  })
})
