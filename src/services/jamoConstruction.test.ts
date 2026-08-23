import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  CoreXRailRole,
  CoreYRailRole,
  GridCellRef,
  JamoConstructionChannelName,
  JamoPartRole,
  JamoRoleMaster,
  RoleConstructionScope,
} from '../types'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createJamoRoleMasterId,
  createRoleConstructionSourceV1,
  expectedConstructionChannel,
  validateRoleConstructionScope,
} from './jamoConstruction'
import { createBasePartGrid } from './railGridResolver'

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

function createScope(role: JamoPartRole = 'CH'): RoleConstructionScope {
  const grid = createBasePartGrid({ role, xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  return createRoleConstructionSourceV1({
    grid,
    masters: [createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role, gridId: grid.id })],
  })
}

describe('자소 역할 마스터와 원자 셀 계약', () => {
  it('jamoId+role로 결정적 master ID를 만들고 delimiter를 안전하게 인코딩한다', () => {
    expect(createJamoRoleMasterId('ㄱ:variant', 'CH')).toBe('jamo-role-master:%E3%84%B1%3Avariant:CH')
    expect(createJamoRoleMasterId('ㄱ', 'CH')).not.toBe(createJamoRoleMasterId('ㄱ', 'JO'))
    expect(createJamoRoleMasterId('ㄱ', 'JO')).not.toBe(createJamoRoleMasterId('ㄱ', 'STANDALONE'))
  })

  it('JU_H와 JU_V를 서로 다른 role master와 channel/grid 소유권으로 만든다', () => {
    const horizontal = createScope('JU_H')
    horizontal.masters = [createEmptyJamoRoleMaster({ jamoId: 'ㅙ', role: 'JU_H', gridId: horizontal.grid.id })]
    const vertical = createScope('JU_V')
    vertical.masters = [createEmptyJamoRoleMaster({ jamoId: 'ㅙ', role: 'JU_V', gridId: vertical.grid.id })]
    expect(horizontal.masters[0].construction.channels.horizontal).toEqual({
      role: 'JU_H', gridId: horizontal.grid.id, elements: [],
    })
    expect(vertical.masters[0].construction.channels.vertical).toEqual({
      role: 'JU_V', gridId: vertical.grid.id, elements: [],
    })
    expect(horizontal.masters[0].id).not.toBe(vertical.masters[0].id)
    expect(horizontal.grid.id).not.toBe(vertical.grid.id)
    expect(validateRoleConstructionScope(horizontal)).toEqual({ ok: true, issues: [] })
    expect(validateRoleConstructionScope(vertical)).toEqual({ ok: true, issues: [] })
  })

  it('혼합중성의 잘못된 channel 소유권은 타입 수준에서도 허용하지 않는다', () => {
    const horizontal = createEmptyJamoRoleMaster({ jamoId: 'ㅙ', role: 'JU_H', gridId: 'grid' })
    if (horizontal.role !== 'JU_H') throw new Error('JU_H fixture가 아닙니다.')
    // @ts-expect-error JU_H master에는 vertical channel을 저장할 수 없다.
    horizontal.construction.channels.vertical = { role: 'JU_V', gridId: 'grid', elements: [] }
    // @ts-expect-error JU_H horizontal channel의 role은 JU_H여야 한다.
    horizontal.construction.channels.horizontal.role = 'CH'
    expect(Object.keys(horizontal.construction.channels)).toContain('vertical')
    expectTypeOf<Extract<JamoRoleMaster, { role: 'JU_H' }>['construction']['channels']['main']>()
      .toEqualTypeOf<undefined>()
  })

  it('역할별 허용 channel을 고정한다', () => {
    const roles: JamoPartRole[] = ['STANDALONE', 'CH', 'JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO']
    expect(roles.map((role) => [role, expectedConstructionChannel(role)])).toEqual([
      ['STANDALONE', 'main'], ['CH', 'main'], ['JU_VERTICAL', 'main'], ['JU_HORIZONTAL', 'main'],
      ['JU_H', 'horizontal'], ['JU_V', 'vertical'], ['JO', 'main'],
    ])
  })

  it('persist/import 경계에서 role·channel·grid 불일치를 fail-closed로 거부한다', () => {
    const scope = createScope('JU_H')
    const master = scope.masters[0]
    Object.assign(master, { role: 'JU_V' })
    const channel = master.construction.channels.horizontal!
    Object.assign(channel, { role: 'CH' })
    channel.gridId = 'other-grid'
    Object.assign(master.construction.channels, {
      main: { role: 'JU_H', gridId: scope.grid.id, elements: [] },
    })
    ;(master.construction.channels as Record<string, unknown>).unknown = { role: 'JU_H', gridId: scope.grid.id, elements: [] }
    const result = validateRoleConstructionScope(scope)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'master-role-mismatch', 'invalid-channel-set', 'channel-role-mismatch', 'channel-grid-mismatch',
    ]))
  })

  it('canonical jamoId+role key가 아닌 ID와 같은 key의 이중 master를 거부한다', () => {
    const scope = createScope()
    const duplicate = structuredClone(scope.masters[0])
    duplicate.id = 'custom-master-id'
    scope.masters.push(duplicate)
    const result = validateRoleConstructionScope(scope)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'non-canonical-master-id', 'duplicate-master-key',
    ]))
  })

  it('원자 셀의 Rail 경계·ID·중복 점유를 검증한다', () => {
    const scope = createScope()
    const master = scope.masters[0]
    const channel = master.construction.channels.main!
    const [left, right] = scope.grid.xRails
    const [top, bottom] = scope.grid.yRails
    const cell = {
      id: 'cell:one', leftRailId: left.id, rightRailId: right.id, topRailId: top.id, bottomRailId: bottom.id,
    }
    channel.elements.push({
      id: 'area:one', kind: 'area', filledCells: [cell, { ...cell, id: 'cell:two' }], boundaryTreatments: [],
    })
    const result = validateRoleConstructionScope(scope)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toContain('duplicate-cell-bounds')

    const element = channel.elements[0]
    if (element.kind !== 'area') throw new Error('area fixture가 아닙니다.')
    element.filledCells = [{ ...cell, id: 'cell:wide', rightRailId: scope.grid.xRails[2].id }]
    expect(validateRoleConstructionScope(scope).ok).toBe(false)
    element.filledCells = [{ ...cell, id: 'cell:missing', rightRailId: 'missing' }]
    const missing = validateRoleConstructionScope(scope)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.issues.map(({ code }) => code)).toContain('missing-cell-rail')
  })

  it('centerline anchor·handle과 area curve·diagonal의 안정 참조를 검증한다', () => {
    const scope = createScope()
    const channel = scope.masters[0].construction.channels.main!
    const point = (id: string, xIndex: number, yIndex: number) => ({
      id, xRailId: scope.grid.xRails[xIndex].id, yRailId: scope.grid.yRails[yIndex].id,
    })
    channel.elements.push({
      id: 'centerline:giyeok',
      kind: 'centerline',
      anchors: [
        { id: 'anchor:start', point: point('point:start', 0, 0), handleOut: point('handle:start:out', 1, 0) },
        { id: 'anchor:end', point: point('point:end', 2, 2), handleIn: point('handle:end:in', 1, 2) },
      ],
      closed: false,
      thickness: 0.1,
      linecap: 'round',
      linejoin: 'round',
    }, {
      id: 'area:treatments',
      kind: 'area',
      filledCells: [{
        id: createGridCellId({
          masterId: scope.masters[0].id,
          channel: 'main',
          elementId: 'area:treatments',
          leftRailId: scope.grid.xRails[1].id,
          rightRailId: scope.grid.xRails[2].id,
          topRailId: scope.grid.yRails[1].id,
          bottomRailId: scope.grid.yRails[2].id,
        }),
        leftRailId: scope.grid.xRails[1].id,
        rightRailId: scope.grid.xRails[2].id,
        topRailId: scope.grid.yRails[1].id,
        bottomRailId: scope.grid.yRails[2].id,
      }],
      boundaryTreatments: [{
        id: 'curve:one', kind: 'curve', tension: 0.5,
        vertex: point('curve:vertex', 1, 1), from: point('curve:from', 2, 1), to: point('curve:to', 1, 2),
      }, {
        id: 'diagonal:one', kind: 'diagonal',
        vertex: point('diagonal:vertex', 2, 2), from: point('diagonal:from', 1, 2), to: point('diagonal:to', 2, 1),
      }],
    })
    expect(validateRoleConstructionScope(scope)).toEqual({ ok: true, issues: [] })
  })

  it('boundary treatment는 실제 채움 윤곽 꼭짓점과 인접 두 변을 정확히 하나만 참조해야 한다', () => {
    const createTreatmentScope = () => {
      const scope = createScope()
      const point = (id: string, xIndex: number, yIndex: number) => ({
        id, xRailId: scope.grid.xRails[xIndex].id, yRailId: scope.grid.yRails[yIndex].id,
      })
      const bounds = (left: number, top: number) => ({
        leftRailId: scope.grid.xRails[left].id,
        rightRailId: scope.grid.xRails[left + 1].id,
        topRailId: scope.grid.yRails[top].id,
        bottomRailId: scope.grid.yRails[top + 1].id,
      })
      return { scope, point, bounds }
    }

    const duplicate = createTreatmentScope()
    duplicate.scope.masters[0].construction.channels.main!.elements.push({
      id: 'area:duplicate-treatment', kind: 'area',
      filledCells: [{ id: 'cell:duplicate-treatment', ...duplicate.bounds(1, 1) }],
      boundaryTreatments: [0, 1].map((index) => ({
        id: `curve:duplicate:${index}`, kind: 'curve' as const, tension: 0.5,
        vertex: duplicate.point(`curve:duplicate:${index}:vertex`, 1, 1),
        from: duplicate.point(`curve:duplicate:${index}:from`, 2, 1),
        to: duplicate.point(`curve:duplicate:${index}:to`, 1, 2),
      })),
    })
    expect(validateRoleConstructionScope(duplicate.scope).ok).toBe(false)

    const interior = createTreatmentScope()
    interior.scope.masters[0].construction.channels.main!.elements.push({
      id: 'area:interior-treatment', kind: 'area',
      filledCells: [
        { id: 'cell:interior:00', ...interior.bounds(0, 0) },
        { id: 'cell:interior:10', ...interior.bounds(1, 0) },
        { id: 'cell:interior:01', ...interior.bounds(0, 1) },
        { id: 'cell:interior:11', ...interior.bounds(1, 1) },
      ],
      boundaryTreatments: [{
        id: 'curve:interior', kind: 'curve', tension: 0.5,
        vertex: interior.point('curve:interior:vertex', 1, 1),
        from: interior.point('curve:interior:from', 0, 1),
        to: interior.point('curve:interior:to', 1, 0),
      }],
    })
    expect(validateRoleConstructionScope(interior.scope).ok).toBe(false)

    const offSegment = createTreatmentScope()
    offSegment.scope.masters[0].construction.channels.main!.elements.push({
      id: 'area:off-segment', kind: 'area',
      filledCells: [{ id: 'cell:off-segment', ...offSegment.bounds(1, 1) }],
      boundaryTreatments: [{
        id: 'curve:off-segment', kind: 'curve', tension: 0.5,
        vertex: offSegment.point('curve:off:vertex', 1, 1),
        from: offSegment.point('curve:off:from', 3, 1),
        to: offSegment.point('curve:off:to', 1, 2),
      }],
    })
    expect(validateRoleConstructionScope(offSegment.scope).ok).toBe(false)
  })

  it('중복·없는 Rail·잘못된 centerline과 boundary treatment를 결정적으로 거부한다', () => {
    const scope = createScope()
    const channel = scope.masters[0].construction.channels.main!
    const point = (id: string, xIndex: number, yIndex: number) => ({
      id, xRailId: scope.grid.xRails[xIndex].id, yRailId: scope.grid.yRails[yIndex].id,
    })
    channel.elements.push({
      id: 'centerline:bad', kind: 'centerline', closed: true, thickness: 0,
      linecap: 'invalid' as 'round', linejoin: 'invalid' as 'round',
      anchors: [
        { id: 'duplicate', point: { id: 'duplicate', xRailId: 'missing', yRailId: scope.grid.yRails[0].id } },
        { id: 'anchor:two', point: point('point:two', 1, 1) },
      ],
    }, {
      id: 'area:bad-treatment', kind: 'area', filledCells: [],
      boundaryTreatments: [{
        id: 'curve:bad', kind: 'curve', tension: 2,
        vertex: point('curve:bad:vertex', 1, 1),
        from: point('curve:bad:from', 1, 1),
        to: point('curve:bad:to', 2, 1),
      }, {
        id: 'diagonal:bad', kind: 'diagonal',
        vertex: point('diagonal:bad:vertex', 1, 1),
        from: point('diagonal:bad:from', 0, 1),
        to: point('diagonal:bad:to', 1, 0),
      }],
    })
    const result = validateRoleConstructionScope(scope)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'duplicate-reference-id', 'missing-reference-rail', 'invalid-centerline-shape',
      'invalid-centerline-thickness', 'invalid-boundary-treatment',
    ]))
    expect(JSON.stringify(validateRoleConstructionScope(structuredClone(scope)))).toBe(JSON.stringify(result))
  })

  it('셀 ID는 배열 인덱스 없이 owner와 안정 Rail 경계로 결정한다', () => {
    const input = {
      masterId: 'master:ㄱ', channel: 'main' as const, elementId: 'area:body',
      leftRailId: 'x:left', rightRailId: 'x:right', topRailId: 'y:top', bottomRailId: 'y:bottom',
    }
    expect(createGridCellId(input)).toBe(createGridCellId(structuredClone(input)))
    expect(createGridCellId(input)).not.toMatch(/(?:x|y|row|column)Index/)
    type ForbiddenCellKey = Extract<keyof GridCellRef, 'xIndex' | 'yIndex' | 'rowIndex' | 'columnIndex'>
    expectTypeOf<ForbiddenCellKey>().toEqualTypeOf<never>()
    expectTypeOf<JamoConstructionChannelName>().toEqualTypeOf<'main' | 'horizontal' | 'vertical'>()
  })

  it('잘못된 hydration 구조를 throw 없이 거부한다', () => {
    expect(validateRoleConstructionScope(null).ok).toBe(false)
    expect(validateRoleConstructionScope({ grid: {}, masters: [] }).ok).toBe(false)
    expect(validateRoleConstructionScope({ grid: createScope().grid, masters: [null] }).ok).toBe(false)
    const nullRail = createScope() as unknown as { grid: { xRails: unknown[] }; masters: unknown[] }
    nullRail.grid.xRails = [null]
    expect(() => validateRoleConstructionScope(nullRail)).not.toThrow()
    expect(validateRoleConstructionScope(nullRail).ok).toBe(false)

    const nullElement = createScope() as unknown as RoleConstructionScope
    nullElement.masters[0].construction.channels.main!.elements = [null] as never
    expect(() => validateRoleConstructionScope(nullElement)).not.toThrow()
    expect(validateRoleConstructionScope(nullElement).ok).toBe(false)

    const nullCell = createScope() as unknown as RoleConstructionScope
    nullCell.masters[0].construction.channels.main!.elements = [{
      id: 'area:null-cell', kind: 'area', filledCells: [null] as never, boundaryTreatments: [],
    }]
    expect(() => validateRoleConstructionScope(nullCell)).not.toThrow()
    expect(validateRoleConstructionScope(nullCell).ok).toBe(false)

    const nullReferences = createScope() as unknown as RoleConstructionScope
    nullReferences.masters[0].construction.channels.main!.elements = [{
      id: 'centerline:null-anchor', kind: 'centerline', anchors: [null] as never,
      closed: false, thickness: 0.1,
    }, {
      id: 'area:null-treatment', kind: 'area', filledCells: [], boundaryTreatments: [null] as never,
    }]
    expect(() => validateRoleConstructionScope(nullReferences)).not.toThrow()
    expect(validateRoleConstructionScope(nullReferences).ok).toBe(false)
  })
})
