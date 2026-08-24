import { describe, expect, it } from 'vitest'
import type {
  GridAreaElement,
  SetBaseMasterAreaCellsV1Command,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { createGridCellId, createJamoRoleMasterId } from './jamoConstruction'
import { createJamoContextVariantId } from './jamoContextVariants'
import { setBaseMasterAreaCellsV1 } from './baseMasterAreaCommandsV1'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

const ELEMENT_ID = 'j02:area:CH:giyeok:primary'
const MASTER_ID = createJamoRoleMasterId('ㄱ', 'CH')

function cell(source: ValidatedShapeSystemSourceV2, column: number, row: number) {
  const grid = source.roleSources.CH.grid
  return {
    leftRailId: grid.xRails[column].id,
    rightRailId: grid.xRails[column + 1].id,
    topRailId: grid.yRails[row].id,
    bottomRailId: grid.yRails[row + 1].id,
  }
}

function command(
  source: ValidatedShapeSystemSourceV2,
  mode: 'fill' | 'erase',
  coordinates: ReadonlyArray<readonly [number, number]>,
): SetBaseMasterAreaCellsV1Command {
  return {
    transactionId: `tx:base-area:${mode}:${coordinates.map((value) => value.join('-')).join(':')}`,
    mode,
    jamoId: 'ㄱ',
    target: { masterId: MASTER_ID, elementId: ELEMENT_ID },
    cells: coordinates.map(([column, row]) => cell(source, column, row)),
  }
}

function areaElement(source: ValidatedShapeSystemSourceV2): GridAreaElement {
  const element = source.roleSources.CH.masters
    .find(({ id }) => id === MASTER_ID)!
    .construction.channels.main!.elements.find(({ id }) => id === ELEMENT_ID)
  expect(element?.kind).toBe('area')
  if (!element || element.kind !== 'area') throw new Error('CH primary area fixture가 없습니다.')
  return element
}

describe('J-02 CH 원형 다중 셀 점유 command', () => {
  it('여러 원자 셀을 stable element/cell ID로 한 transaction에 채우고 STANDALONE·중심선을 보존한다', () => {
    const source = createStarterShapeSystemV2()
    const beforeStandalone = structuredClone(source.roleSources.STANDALONE)
    const beforeCenterline = structuredClone(source.roleSources.CH.masters[0].construction.channels.main!.elements)
    const fill = command(source, 'fill', [[0, 0], [1, 0], [1, 1]])
    const result = setBaseMasterAreaCellsV1(source, fill)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transaction).toMatchObject({
      id: fill.transactionId,
      kind: 'master-grid',
      command: 'set-base-master-area-cells',
      before: source,
      after: result.source,
    })
    expect(result.source.roleSources.STANDALONE).toEqual(beforeStandalone)
    expect(result.source.roleSources.CH.masters[0].construction.channels.main!.elements[0])
      .toEqual(beforeCenterline[0])
    expect(areaElement(result.source).filledCells).toEqual(fill.cells.map((bounds) => ({
      id: createGridCellId({ masterId: MASTER_ID, channel: 'main', elementId: ELEMENT_ID, ...bounds }),
      ...bounds,
    })))
  })

  it('기존 단일 점유 셀을 읽어 확장하고 이미 찬 셀은 중복 생성하지 않는다', () => {
    const source = createStarterShapeSystemV2()
    const first = setBaseMasterAreaCellsV1(source, command(source, 'fill', [[1, 0]]))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const existingId = areaElement(first.source).filledCells[0].id
    const expanded = setBaseMasterAreaCellsV1(first.source, command(first.source, 'fill', [[1, 0], [2, 0], [2, 1]]))

    expect(expanded.ok).toBe(true)
    if (!expanded.ok) return
    expect(areaElement(expanded.source).filledCells).toHaveLength(3)
    expect(areaElement(expanded.source).filledCells.find(({ id }) => id === existingId)).toBeDefined()
  })

  it('여러 찬 셀을 한 번에 비우고 마지막 셀 뒤에도 primary area 요소를 유지한다', () => {
    const source = createStarterShapeSystemV2()
    const filled = setBaseMasterAreaCellsV1(source, command(source, 'fill', [[0, 0], [1, 0], [2, 0]]))
    expect(filled.ok).toBe(true)
    if (!filled.ok) return
    const erased = setBaseMasterAreaCellsV1(filled.source, command(filled.source, 'erase', [[0, 0], [1, 0]]))
    expect(erased.ok).toBe(true)
    if (!erased.ok) return
    expect(areaElement(erased.source).filledCells).toEqual([expect.objectContaining(cell(erased.source, 2, 0))])

    const emptied = setBaseMasterAreaCellsV1(erased.source, command(erased.source, 'erase', [[2, 0]]))
    expect(emptied.ok).toBe(true)
    if (!emptied.ok) return
    expect(areaElement(emptied.source)).toMatchObject({ id: ELEMENT_ID, filledCells: [], boundaryTreatments: [] })
  })

  it('다른 면 점유, 중복 방문 명령, no-op은 partial result 없이 source를 보존한다', () => {
    const source = createStarterShapeSystemV2()
    const filled = setBaseMasterAreaCellsV1(source, command(source, 'fill', [[0, 0]]))
    expect(filled.ok).toBe(true)
    if (!filled.ok) return
    const before = JSON.stringify(filled.source)
    expect(setBaseMasterAreaCellsV1(filled.source, command(filled.source, 'fill', [[0, 0]])))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'no-op' }) }))
    expect(setBaseMasterAreaCellsV1(filled.source, command(filled.source, 'erase', [[0, 0], [0, 0]])))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'invalid-command' }) }))

    const mutable = structuredClone(filled.source) as unknown as ShapeSystemSourceV2
    mutable.roleSources.CH.masters[0].construction.channels.main!.elements.push({
      id: 'area:other', kind: 'area', filledCells: [{
        id: createGridCellId({ masterId: MASTER_ID, channel: 'main', elementId: 'area:other', ...cell(filled.source, 1, 0) }),
        ...cell(filled.source, 1, 0),
      }], boundaryTreatments: [],
    })
    const parsed = parseShapeSystemSourceV2(mutable)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(setBaseMasterAreaCellsV1(parsed.source, command(parsed.source, 'fill', [[1, 0]])))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'cell-occupied' }) }))
    expect(JSON.stringify(filled.source)).toBe(before)
  })

  it('비울 셀을 문맥 override가 참조하면 fail-closed하고 unknown field도 거부한다', () => {
    const source = createStarterShapeSystemV2()
    const filled = setBaseMasterAreaCellsV1(source, command(source, 'fill', [[0, 0]]))
    expect(filled.ok).toBe(true)
    if (!filled.ok) return
    const mutable = structuredClone(filled.source) as unknown as ShapeSystemSourceV2
    const master = mutable.roleSources.CH.masters[0]
    const sourceCell = areaElement(filled.source).filledCells[0]
    const context = { baseContext: 'horizontal' } as const
    master.contextVariants = [{
      id: createJamoContextVariantId(master.id, context), context, referenceOverrides: [{
        id: 'override:area-edge',
        target: {
          kind: 'cell-edge', masterId: master.id, channel: 'main',
          elementId: ELEMENT_ID, cellId: sourceCell.id, edge: 'right',
        },
        railId: mutable.roleSources.CH.grid.xRails[2].id,
      }],
    }]
    const parsed = parseShapeSystemSourceV2(mutable)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(setBaseMasterAreaCellsV1(parsed.source, command(parsed.source, 'erase', [[0, 0]])))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'variant-in-use' }) }))

    const malformedCommand = Object.assign(command(filled.source, 'fill', [[1, 0]]), { future: true })
    expect(setBaseMasterAreaCellsV1(filled.source, malformedCommand))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'invalid-command' }) }))
  })
})
