import { describe, expect, it } from 'vitest'
import type { CoreXRailRole, CoreYRailRole, JamoContextVariant, RoleConstructionScope } from '../types'
import {
  createEmptyJamoRoleMaster,
  createRoleConstructionSourceV1,
} from './jamoConstruction'
import { createJamoContextVariantId } from './jamoContextVariants'
import { createBasePartGrid } from './railGridResolver'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}

function createSource(): RoleConstructionScope {
  const grid = createBasePartGrid({
    role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05,
  })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'CH', gridId: grid.id })
  const context = { baseContext: 'horizontal' as const }
  const variant: JamoContextVariant = {
    id: createJamoContextVariantId(master.id, context),
    context,
    coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.25 } },
  }
  master.contextVariants = [variant]
  return createRoleConstructionSourceV1({ grid, masters: [master] })
}

describe('RoleConstruction source v1 strict parser', () => {
  it('완전한 source를 deep-cloned validated 결과로 exact round-trip한다', () => {
    const source = createSource()
    const serialized = JSON.parse(JSON.stringify(source)) as unknown
    const first = parseRoleConstructionSourceV1(serialized)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.source).toEqual(source)
    expect(first.source).not.toBe(serialized)
    ;(serialized as RoleConstructionScope).masters[0].jamoId = 'mutated'
    expect(first.source.masters[0].jamoId).toBe('ㄱ')
    expect(parseRoleConstructionSourceV1(first.source)).toEqual(first)
  })

  it.each([
    [{}, 'unsupported-schema'],
    [{ schema: 'future', version: 1 }, 'unsupported-schema'],
    [{ schema: 'role-construction' }, 'unsupported-version'],
    [{ schema: 'role-construction', version: 2 }, 'unsupported-version'],
    [{ schema: 'role-construction', version: '1' }, 'unsupported-version'],
  ] as const)('schema/version %j을 하위 해석 없이 차단한다', (value, code) => {
    const result = parseRoleConstructionSourceV1(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toEqual([code])
  })

  it.each([
    ['root', (source: RoleConstructionScope) => Object.assign(source, { future: true }), '$.future'],
    ['grid', (source: RoleConstructionScope) => Object.assign(source.grid, { derivedBoxes: [] }), '$.grid.derivedBoxes'],
    ['rail', (source: RoleConstructionScope) => Object.assign(source.grid.xRails[0], { provenance: {} }), '$.grid.xRails[0].provenance'],
    ['master', (source: RoleConstructionScope) => Object.assign(source.masters[0], { layoutBindings: [] }), '$.masters[0].layoutBindings'],
    ['variant', (source: RoleConstructionScope) => Object.assign(source.masters[0].contextVariants![0], { resolvedGrid: {} }), '$.masters[0].contextVariants[0].resolvedGrid'],
    ['context', (source: RoleConstructionScope) => Object.assign(source.masters[0].contextVariants![0].context, { rank: 1 }), '$.masters[0].contextVariants[0].context.rank'],
  ] as const)('%s의 미래 필드를 strip하지 않고 exact path로 차단한다', (_label, mutate, path) => {
    const source = createSource()
    mutate(source)
    const before = JSON.stringify(source)
    const result = parseRoleConstructionSourceV1(source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unknown-field', path }))
    expect(JSON.stringify(source)).toBe(before)
  })

  it.each([
    ['contextVariants object', (source: RoleConstructionScope) => {
      ;(source.masters[0] as unknown as { contextVariants: unknown }).contextVariants = {}
    }],
    ['referenceOverrides object', (source: RoleConstructionScope) => {
      ;(source.masters[0].contextVariants![0] as unknown as { referenceOverrides: unknown }).referenceOverrides = {}
    }],
    ['target null', (source: RoleConstructionScope) => {
      const variant = source.masters[0].contextVariants![0]
      ;(variant as unknown as { referenceOverrides: unknown }).referenceOverrides = [{
        id: 'override:bad', target: null, railId: source.grid.xRails[0].id,
      }]
    }],
    ['null master', (source: RoleConstructionScope) => {
      ;(source.masters as unknown[])[0] = null
    }],
  ] as const)('malformed persisted JSON(%s)을 throw 없이 거부한다', (_label, mutate) => {
    const source = createSource()
    mutate(source)
    expect(() => parseRoleConstructionSourceV1(source)).not.toThrow()
    expect(parseRoleConstructionSourceV1(source).ok).toBe(false)
  })

  it('issue 순서가 입력과 재실행에 대해 결정적이다', () => {
    const source = createSource()
    Object.assign(source, { zFuture: true, aFuture: true })
    Object.assign(source.masters[0], { futureMaster: true })
    const first = parseRoleConstructionSourceV1(source)
    const second = parseRoleConstructionSourceV1(structuredClone(source))
    expect(second).toEqual(first)
    if (!first.ok) expect(first.issues.map(({ path }) => path)).toEqual([
      '$.aFuture', '$.masters[0].futureMaster', '$.zFuture',
    ])
  })

  it('복제할 수 없는 persisted 값도 예외 대신 invalid-source로 차단한다', () => {
    const source = createSource() as RoleConstructionScope & { future?: unknown }
    source.future = () => 'not cloneable'
    expect(() => parseRoleConstructionSourceV1(source)).not.toThrow()
    const result = parseRoleConstructionSourceV1(source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual([{
      code: 'invalid-source', path: '$', message: 'RoleConstruction source를 안전하게 복제할 수 없습니다.',
    }])
  })
})
