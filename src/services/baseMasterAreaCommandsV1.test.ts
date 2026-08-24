import { describe, expect, it } from 'vitest'
import type {
  SetSevenContextBaseAreaCellV1Command,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { createGridCellId, createJamoRoleMasterId } from './jamoConstruction'
import { createJamoContextVariantId } from './jamoContextVariants'
import { setSevenContextBaseAreaCellV1 } from './baseMasterAreaCommandsV1'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

const ELEMENT_IDS = {
  STANDALONE: 'j02:area:STANDALONE:giyeok:primary',
  CH: 'j02:area:CH:giyeok:primary',
} as const

function target(
  source: ValidatedShapeSystemSourceV2,
  role: 'STANDALONE' | 'CH',
  x: number,
  y: number,
) {
  const scope = source.roleSources[role]
  return {
    masterId: createJamoRoleMasterId('ㄱ', role),
    elementId: ELEMENT_IDS[role],
    cell: {
      leftRailId: scope.grid.xRails[x].id,
      rightRailId: scope.grid.xRails[x + 1].id,
      topRailId: scope.grid.yRails[y].id,
      bottomRailId: scope.grid.yRails[y + 1].id,
    },
  }
}

function command(
  source: ValidatedShapeSystemSourceV2,
  mode: 'create' | 'move',
  x: number,
  y: number,
): SetSevenContextBaseAreaCellV1Command {
  return {
    transactionId: `tx:base-area:${mode}:${x}:${y}`,
    mode,
    jamoId: 'ㄱ',
    targets: {
      STANDALONE: target(source, 'STANDALONE', x, y),
      CH: target(source, 'CH', x, y),
    },
  }
}

function areaElement(source: ValidatedShapeSystemSourceV2, role: 'STANDALONE' | 'CH') {
  const element = source.roleSources[role].masters
    .find(({ id }) => id === createJamoRoleMasterId('ㄱ', role))!
    .construction.channels.main!.elements.find(({ id }) => id === ELEMENT_IDS[role])
  expect(element?.kind).toBe('area')
  if (!element || element.kind !== 'area') throw new Error('면 fixture가 없습니다.')
  return element
}

describe('J-02 7문맥 단일 원자 셀 면 command', () => {
  it('STANDALONE·CH에 stable owner/element/cell ID 면을 한 transaction으로 생성한다', () => {
    const source = createStarterShapeSystemV2()
    const beforeRails = Object.fromEntries((['STANDALONE', 'CH'] as const).map((role) => [
      role,
      structuredClone(source.roleSources[role].grid),
    ]))
    const beforeCenterlines = Object.fromEntries((['STANDALONE', 'CH'] as const).map((role) => [
      role,
      structuredClone(source.roleSources[role].masters[0].construction.channels.main!.elements),
    ]))
    const create = command(source, 'create', 0, 0)
    const result = setSevenContextBaseAreaCellV1(source, create)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transaction).toMatchObject({
      id: create.transactionId,
      kind: 'master-grid',
      command: 'create-seven-context-base-area-cell',
      before: source,
      after: result.source,
    })
    for (const role of ['STANDALONE', 'CH'] as const) {
      const element = areaElement(result.source, role)
      expect(element.id).toBe(ELEMENT_IDS[role])
      expect(element.filledCells).toEqual([{
        id: createGridCellId({
          masterId: create.targets[role].masterId,
          channel: 'main',
          elementId: ELEMENT_IDS[role],
          ...create.targets[role].cell,
        }),
        ...create.targets[role].cell,
      }])
      expect(result.source.roleSources[role].grid).toEqual(beforeRails[role])
      expect(result.source.roleSources[role].masters[0].construction.channels.main!.elements[0])
        .toEqual(beforeCenterlines[role][0])
    }
    for (const role of ['JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO'] as const) {
      expect(result.source.roleSources[role]).toEqual(source.roleSources[role])
    }
  })

  it('stable element ID를 유지한 채 목적 원자 셀만 이동하고 transaction before/after를 만든다', () => {
    const source = createStarterShapeSystemV2()
    const created = setSevenContextBaseAreaCellV1(source, command(source, 'create', 0, 0))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const move = command(created.source, 'move', 1, 0)
    const result = setSevenContextBaseAreaCellV1(created.source, move)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transaction.command).toBe('move-seven-context-base-area-cell')
    expect(result.transaction.before).toEqual(created.source)
    for (const role of ['STANDALONE', 'CH'] as const) {
      const element = areaElement(result.source, role)
      expect(element.id).toBe(ELEMENT_IDS[role])
      expect(element.filledCells).toHaveLength(1)
      expect(element.filledCells[0]).toEqual(expect.objectContaining(move.targets[role].cell))
    }
  })

  it.each([
    ['create target exists', (source: ValidatedShapeSystemSourceV2) => command(source, 'create', 0, 0), 'target-exists'],
    ['move no-op', (source: ValidatedShapeSystemSourceV2) => command(source, 'move', 0, 0), 'no-op'],
    ['move stale ID', (source: ValidatedShapeSystemSourceV2) => {
      const value = command(source, 'move', 1, 0)
      value.targets.CH.elementId = 'area:stale'
      return value
    }, 'stale-target'],
  ] as const)('%s은 partial result 없이 source를 보존한다', (_label, attempt, code) => {
    const starter = createStarterShapeSystemV2()
    const created = setSevenContextBaseAreaCellV1(starter, command(starter, 'create', 0, 0))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const before = JSON.stringify(created.source)
    const result = setSevenContextBaseAreaCellV1(created.source, attempt(created.source))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
    expect(JSON.stringify(created.source)).toBe(before)
  })

  it('문맥 reference override가 target 면을 쓰거나 source/command에 unknown field가 있으면 fail-closed한다', () => {
    const starter = createStarterShapeSystemV2()
    const created = setSevenContextBaseAreaCellV1(starter, command(starter, 'create', 0, 0))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const mutable = structuredClone(created.source) as unknown as ShapeSystemSourceV2
    const master = mutable.roleSources.CH.masters[0]
    const cell = areaElement(created.source, 'CH').filledCells[0]
    const context = { baseContext: 'horizontal' } as const
    master.contextVariants = [{
      id: createJamoContextVariantId(master.id, context), context, referenceOverrides: [{
        id: 'override:area-edge',
        target: {
          kind: 'cell-edge', masterId: master.id, channel: 'main',
          elementId: ELEMENT_IDS.CH, cellId: cell.id, edge: 'right',
        },
        railId: mutable.roleSources.CH.grid.xRails[2].id,
      }],
    }]
    const parsed = parseShapeSystemSourceV2(mutable)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(setSevenContextBaseAreaCellV1(parsed.source, command(parsed.source, 'move', 1, 0)))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'variant-in-use' }) }))

    const malformedSource = Object.assign(structuredClone(created.source), { future: true })
    expect(setSevenContextBaseAreaCellV1(malformedSource, command(created.source, 'move', 1, 0)))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'invalid-source' }) }))
    const malformedCommand = Object.assign(command(created.source, 'move', 1, 0), { future: true })
    expect(setSevenContextBaseAreaCellV1(created.source, malformedCommand))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'invalid-command' }) }))
  })
})
