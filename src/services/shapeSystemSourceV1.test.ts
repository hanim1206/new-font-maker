import { describe, expect, it } from 'vitest'
import type { CoreXRailRole, CoreYRailRole, JamoPartRole, RoleConstructionScope } from '../types'
import { createEmptyJamoRoleMaster, createRoleConstructionSourceV1 } from './jamoConstruction'
import { createBasePartGrid } from './railGridResolver'
import {
  createShapeSystemSourceV1,
  parseShapeSystemSourceV1,
  SHAPE_SYSTEM_ROLES,
} from './shapeSystemSourceV1'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}

function sourceFor(role: JamoPartRole): RoleConstructionScope {
  const grid = createBasePartGrid({ role, xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  return createRoleConstructionSourceV1({
    grid,
    masters: [createEmptyJamoRoleMaster({ jamoId: `fixture:${role}`, role, gridId: grid.id })],
  })
}

function envelope() {
  return createShapeSystemSourceV1(Object.fromEntries(
    SHAPE_SYSTEM_ROLES.map((role) => [role, sourceFor(role)]),
  ) as Record<JamoPartRole, RoleConstructionScope>)
}

describe('Shape System source v1 strict envelope', () => {
  it('7개 역할 source와 안정 ID를 JSON round-trip 뒤 exact 보존한다', () => {
    const input = envelope()
    const before = structuredClone(input)
    const parsed = parseShapeSystemSourceV1(JSON.parse(JSON.stringify(input)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.source).toEqual(input)
    expect(input).toEqual(before)
    expect(Object.keys(parsed.source.roleSources)).toEqual(SHAPE_SYSTEM_ROLES)
    const ids = SHAPE_SYSTEM_ROLES.flatMap((role) => {
      const source = parsed.source.roleSources[role]
      return [source.grid.id, ...source.grid.xRails.map(({ id }) => id),
        ...source.grid.yRails.map(({ id }) => id), ...source.masters.map(({ id }) => id)]
    })
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('roleSources 입력 key 순서와 무관하게 canonical 역할 순서로 반환한다', () => {
    const input = envelope()
    input.roleSources = Object.fromEntries(
      [...SHAPE_SYSTEM_ROLES].reverse().map((role) => [role, input.roleSources[role]]),
    ) as Record<JamoPartRole, RoleConstructionScope>
    const before = Object.keys(input.roleSources)
    const parsed = parseShapeSystemSourceV1(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(before).toEqual([...SHAPE_SYSTEM_ROLES].reverse())
    expect(Object.keys(parsed.source.roleSources)).toEqual(SHAPE_SYSTEM_ROLES)
    expect(Object.keys(input.roleSources)).toEqual(before)
  })

  it('역할 누락·추가·key와 grid role 불일치를 결정적으로 차단한다', () => {
    const input = envelope() as unknown as {
      roleSources: Record<string, RoleConstructionScope>
      schema: string
      version: number
    }
    delete input.roleSources.JO
    input.roleSources.FUTURE = sourceFor('JO')
    input.roleSources.CH.grid.role = 'JO'
    const first = parseShapeSystemSourceV1(input)
    const second = parseShapeSystemSourceV1(structuredClone(input))
    expect(second).toEqual(first)
    expect(first.ok).toBe(false)
    if (first.ok) return
    expect(first.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'missing-role-source', 'unknown-field', 'role-mismatch',
    ]))
  })

  it('중첩 future field와 손상 source를 strict source parser로 차단한다', () => {
    const input = envelope()
    ;(input.roleSources.CH.grid as unknown as { future?: unknown }).future = { resolved: true }
    const result = parseShapeSystemSourceV1(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual([expect.objectContaining({
      code: 'invalid-role-source', path: '$.roleSources.CH',
    })])
  })

  it.each([
    [null, 'invalid-root'],
    [{ schema: 'future', version: 1, roleSources: {} }, 'unsupported-schema'],
    [{ schema: 'shape-system', version: 2, roleSources: {} }, 'unsupported-version'],
  ])('지원하지 않는 root/schema/version을 fail-closed한다', (input, code) => {
    const result = parseShapeSystemSourceV1(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe(code)
  })

  it('prototype에서 상속된 root·role source를 own 저장값으로 오인하지 않는다', () => {
    const valid = envelope()
    const inheritedRoot = Object.create(valid) as unknown
    expect(() => parseShapeSystemSourceV1(inheritedRoot)).not.toThrow()
    const rootResult = parseShapeSystemSourceV1(inheritedRoot)
    expect(rootResult.ok).toBe(false)
    if (!rootResult.ok) expect(rootResult.issues[0].code).toBe('invalid-root')

    const inheritedRoles = envelope()
    inheritedRoles.roleSources = Object.create(inheritedRoles.roleSources) as Record<JamoPartRole, RoleConstructionScope>
    expect(() => parseShapeSystemSourceV1(inheritedRoles)).not.toThrow()
    const roleResult = parseShapeSystemSourceV1(inheritedRoles)
    expect(roleResult.ok).toBe(false)
    if (!roleResult.ok) expect(roleResult.issues.map(({ code }) => code))
      .toContain('missing-role-source')
  })

  it('역할 사이의 grid·Rail·master ID 중복을 차단한다', () => {
    const input = envelope()
    input.roleSources.JO.grid.id = input.roleSources.CH.grid.id
    input.roleSources.JO.masters[0].construction.channels.main!.gridId = input.roleSources.CH.grid.id
    input.roleSources.JO.grid.xRails[0].id = input.roleSources.CH.grid.xRails[0].id
    const result = parseShapeSystemSourceV1(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'duplicate-grid-id', 'duplicate-rail-id',
    ]))
  })
})
