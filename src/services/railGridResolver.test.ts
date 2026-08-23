import { describe, expect, it } from 'vitest'
import type {
  CoreXRailRole,
  CoreYRailRole,
  JamoPartRole,
  RailGrid,
  ShapeRail,
} from '../types'
import {
  CORE_X_RAIL_ROLES,
  CORE_Y_RAIL_ROLES,
  createBasePartGrid,
  resolveRailGrid,
  validateRailGrid,
} from './railGridResolver'

const X_POSITIONS: Record<CoreXRailRole, number> = {
  'outer-left': 0,
  'inner-left': 0.2,
  'center-x': 0.5,
  'inner-right': 0.8,
  'outer-right': 1,
}
const Y_POSITIONS: Record<CoreYRailRole, number> = {
  'outer-top': 0,
  'inner-top': 0.2,
  'center-y': 0.5,
  'inner-bottom': 0.8,
  'outer-bottom': 1,
}
const ROLES: JamoPartRole[] = [
  'STANDALONE',
  'CH',
  'JU_VERTICAL',
  'JU_HORIZONTAL',
  'JU_H',
  'JU_V',
  'JO',
]

function createGrid(role: JamoPartRole = 'CH'): RailGrid {
  return createBasePartGrid({
    role,
    xCorePositions: X_POSITIONS,
    yCorePositions: Y_POSITIONS,
    snapStep: 0.025,
    minGap: 0.05,
  })
}

function issueCodes(grid: RailGrid) {
  const result = validateRailGrid(grid)
  return result.ok ? [] : result.issues.map((issue) => issue.code)
}

function addXAuxiliary(
  grid: RailGrid,
  index: number,
  rail: ShapeRail,
): RailGrid {
  const next = structuredClone(grid)
  next.xRails.splice(index, 0, rail)
  return next
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

describe('안정 ID RailGrid resolver', () => {
  it('7개 역할에 X/Y 각 5개 코어 role과 결정적 ID를 만든다', () => {
    for (const role of ROLES) {
      const first = createGrid(role)
      const second = createGrid(role)
      expect(first).toEqual(second)
      expect(first.xRails.map((rail) => rail.coreRole)).toEqual(CORE_X_RAIL_ROLES)
      expect(first.yRails.map((rail) => rail.coreRole)).toEqual(CORE_Y_RAIL_ROLES)
      expect(new Set([...first.xRails, ...first.yRails].map((rail) => rail.id)).size).toBe(10)
      expect(validateRailGrid(first)).toEqual({ ok: true, issues: [] })
    }
  })

  it('위치가 달라도 역할 기반 grid/rail ID는 유지된다', () => {
    const first = createGrid('JU_H')
    const second = createBasePartGrid({
      role: 'JU_H',
      xCorePositions: { ...X_POSITIONS, 'inner-left': 0.25 },
      yCorePositions: Y_POSITIONS,
      snapStep: 0.025,
      minGap: 0.05,
    })
    expect(second.id).toBe(first.id)
    expect(second.xRails.map((rail) => rail.id)).toEqual(first.xRails.map((rail) => rail.id))
    expect(second.yRails.map((rail) => rail.id)).toEqual(first.yRails.map((rail) => rail.id))
  })

  it('중첩 between을 같은 축의 안정 ID로 해석하고 원본 순서를 유지한다', () => {
    const base = createGrid()
    const left = base.xRails[0].id
    const innerLeft = base.xRails[1].id
    const firstId = 'aux:x:first'
    const withFirst = addXAuxiliary(base, 1, {
      id: firstId,
      kind: 'auxiliary',
      position: { kind: 'between', fromRailId: left, toRailId: innerLeft, ratio: 0.5 },
    })
    const nestedId = 'aux:x:nested'
    const grid = addXAuxiliary(withFirst, 2, {
      id: nestedId,
      kind: 'auxiliary',
      position: { kind: 'between', fromRailId: firstId, toRailId: innerLeft, ratio: 0.5 },
    })
    const result = resolveRailGrid(grid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.grid.xRails.map(({ id }) => id)).toEqual(grid.xRails.map(({ id }) => id))
    expect(result.grid.xRails.find(({ id }) => id === firstId)?.value).toBeCloseTo(0.1)
    expect(result.grid.xRails.find(({ id }) => id === nestedId)?.value).toBeCloseTo(0.15)
    expect(grid.xRails[1].position).toEqual({
      kind: 'between', fromRailId: left, toRailId: innerLeft, ratio: 0.5,
    })
  })

  it('deep-frozen 입력을 변경하거나 resolved 값을 원본에 기록하지 않는다', () => {
    const grid = deepFreeze(createGrid())
    const before = JSON.stringify(grid)
    const result = resolveRailGrid(grid)
    expect(result.ok).toBe(true)
    expect(JSON.stringify(grid)).toBe(before)
    expect('value' in grid.xRails[0]).toBe(false)
  })

  it('중복 ID와 core role 누락·중복·축 혼용·보조 오염을 모두 보고한다', () => {
    const grid = createGrid()
    grid.yRails[0].id = grid.xRails[0].id
    grid.xRails[0].coreRole = undefined
    grid.xRails[1].coreRole = 'center-x'
    grid.xRails.push({
      id: 'aux:polluted',
      kind: 'auxiliary',
      coreRole: 'inner-right',
      position: { kind: 'absolute', value: 0.9 },
    })
    grid.yRails[1].coreRole = 'inner-left'
    const codes = issueCodes(grid)
    expect(codes).toContain('duplicate-rail-id')
    expect(codes).toContain('missing-core-role')
    expect(codes).toContain('duplicate-core-role')
    expect(codes).toContain('core-role-axis-mismatch')
    expect(codes).toContain('core-role-on-auxiliary')
  })

  it('비어 있는 ID와 유한하지 않거나 범위 밖인 수치를 거부한다', () => {
    const grid = createGrid()
    grid.id = ' '
    grid.xRails[0].id = ''
    grid.xRails[0].position = { kind: 'absolute', value: Number.NaN }
    grid.xRails[1].position = { kind: 'absolute', value: 1.2 }
    grid.snapStep = 0
    grid.minGap = Number.POSITIVE_INFINITY
    const codes = issueCodes(grid)
    expect(codes).toContain('invalid-grid-id')
    expect(codes).toContain('invalid-rail-id')
    expect(codes).toContain('non-finite-position')
    expect(codes).toContain('out-of-range-position')
    expect(codes).toContain('invalid-snap-step')
    expect(codes).toContain('invalid-min-gap')
  })

  it('hydration의 잘못된 구조·role·discriminant를 예외 없이 거부한다', () => {
    expect(validateRailGrid(null)).toEqual({
      ok: false,
      issues: [{
        code: 'invalid-grid-structure',
        message: 'RailGrid는 xRails, yRails와 각 레일의 position 객체를 포함해야 합니다.',
      }],
    })
    expect(validateRailGrid({ xRails: [], yRails: [null] }).ok).toBe(false)

    const grid = createGrid() as unknown as {
      role: string
      xRails: Array<{ kind: string; position: { kind: string } }>
    }
    grid.role = 'UNKNOWN'
    grid.xRails[0].kind = 'unknown'
    grid.xRails[1].position.kind = 'unknown'
    const result = validateRailGrid(grid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'invalid-role',
      'invalid-rail-kind',
      'invalid-position-kind',
    ]))
  })

  it('코어 role의 의미 순서가 위치 배열과 다르면 거부한다', () => {
    const grid = createGrid()
    const firstRole = grid.xRails[0].coreRole
    grid.xRails[0].coreRole = grid.xRails[1].coreRole
    grid.xRails[1].coreRole = firstRole
    expect(issueCodes(grid)).toContain('core-role-order-mismatch')
  })

  it('missing·cross-axis·self reference와 ratio 0/1/NaN을 거부한다', () => {
    const base = createGrid()
    const target = base.xRails[1]
    target.kind = 'auxiliary'
    target.coreRole = undefined
    target.position = {
      kind: 'between',
      fromRailId: target.id,
      toRailId: base.yRails[0].id,
      ratio: Number.NaN,
    }
    const missing = structuredClone(base)
    const missingTarget = missing.xRails[1]
    if (missingTarget.position.kind !== 'between') throw new Error('between fixture가 아닙니다.')
    missingTarget.position.fromRailId = 'missing'
    missingTarget.position.ratio = 0
    const codes = issueCodes(base)
    expect(codes).toContain('self-reference')
    expect(codes).toContain('cross-axis-reference')
    expect(codes).toContain('invalid-ratio')
    expect(issueCodes(missing)).toContain('missing-reference')
    expect(issueCodes(missing)).toContain('invalid-ratio')
    missingTarget.position.ratio = 1
    expect(issueCodes(missing)).toContain('invalid-ratio')
  })

  it('순환 between을 결정적으로 거부한다', () => {
    const grid = createGrid()
    const left = grid.xRails[0].id
    const right = grid.xRails[1].id
    const firstId = 'aux:cycle:a'
    const secondId = 'aux:cycle:b'
    grid.xRails.splice(1, 0,
      { id: firstId, kind: 'auxiliary', position: { kind: 'between', fromRailId: left, toRailId: secondId, ratio: 0.5 } },
      { id: secondId, kind: 'auxiliary', position: { kind: 'between', fromRailId: firstId, toRailId: right, ratio: 0.5 } },
    )
    const result = validateRailGrid(grid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.filter(({ code }) => code === 'cyclic-reference').map(({ railId }) => railId)).toEqual([
      firstId,
      secondId,
    ])
  })

  it('3-node cycle 구성원만 표시하고 그 cycle에 의존하는 레일은 구성원으로 오인하지 않는다', () => {
    const grid = createGrid()
    const left = grid.xRails[0].id
    const right = grid.xRails[1].id
    const ids = ['aux:cycle:a', 'aux:cycle:b', 'aux:cycle:c']
    grid.xRails.splice(1, 0,
      { id: ids[0], kind: 'auxiliary', position: { kind: 'between', fromRailId: left, toRailId: ids[1], ratio: 0.5 } },
      { id: ids[1], kind: 'auxiliary', position: { kind: 'between', fromRailId: ids[2], toRailId: right, ratio: 0.5 } },
      { id: ids[2], kind: 'auxiliary', position: { kind: 'between', fromRailId: ids[0], toRailId: right, ratio: 0.5 } },
      { id: 'aux:dependent', kind: 'auxiliary', position: { kind: 'between', fromRailId: left, toRailId: ids[0], ratio: 0.5 } },
    )
    const result = validateRailGrid(grid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.filter(({ code }) => code === 'cyclic-reference').map(({ railId }) => railId)).toEqual(ids)
  })

  it('뒤집힌 between 기준을 거부한다', () => {
    const grid = createGrid()
    const id = 'aux:reversed'
    grid.xRails.splice(1, 0, {
      id,
      kind: 'auxiliary',
      position: {
        kind: 'between',
        fromRailId: grid.xRails[1].id,
        toRailId: grid.xRails[0].id,
        ratio: 0.5,
      },
    })
    expect(issueCodes(grid)).toContain('reversed-between-span')
  })

  it('between의 시작과 끝이 같은 레일이면 구조적으로 거부한다', () => {
    const grid = createGrid()
    const referenceId = grid.xRails[0].id
    grid.xRails.splice(1, 0, {
      id: 'aux:identical',
      kind: 'auxiliary',
      position: { kind: 'between', fromRailId: referenceId, toRailId: referenceId, ratio: 0.5 },
    })
    expect(issueCodes(grid)).toContain('identical-between-reference')
  })

  it('같은 축과 다른 축의 중복 ID를 모두 두 번째 레일에 귀속해 거부한다', () => {
    const sameAxis = createGrid()
    sameAxis.xRails[1].id = sameAxis.xRails[0].id
    const crossAxis = createGrid()
    crossAxis.yRails[0].id = crossAxis.xRails[0].id
    for (const [grid, axis] of [[sameAxis, 'x'], [crossAxis, 'y']] as const) {
      const result = resolveRailGrid(grid)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.issues.find(({ code }) => code === 'duplicate-rail-id')?.axis).toBe(axis)
    }
  })

  it('배열 순서 교차를 정렬하거나 clamp하지 않고 거부한다', () => {
    const grid = createGrid()
    const first = grid.xRails[0]
    const second = grid.xRails[1]
    grid.xRails[0] = second
    grid.xRails[1] = first
    const result = resolveRailGrid(grid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code }) => code)).toContain('non-monotonic')
    expect(grid.xRails[0].id).toBe(second.id)
  })

  it('minGap 정확 경계는 허용하고 미만은 거부한다', () => {
    const exact = createGrid()
    exact.minGap = 0.2
    expect(validateRailGrid(exact).ok).toBe(true)
    const below = createGrid()
    below.minGap = 0.200000000001
    expect(issueCodes(below)).toContain('min-gap-violation')
  })

  it('Y축 nested between도 minGap 경계를 같은 규칙으로 검사한다', () => {
    const grid = createGrid()
    const top = grid.yRails[0].id
    const innerTop = grid.yRails[1].id
    const firstId = 'aux:y:first'
    const nestedId = 'aux:y:nested'
    grid.yRails.splice(1, 0,
      {
        id: firstId,
        kind: 'auxiliary',
        position: { kind: 'between', fromRailId: top, toRailId: innerTop, ratio: 0.5 },
      },
      {
        id: nestedId,
        kind: 'auxiliary',
        position: { kind: 'between', fromRailId: firstId, toRailId: innerTop, ratio: 0.5 },
      },
    )
    grid.minGap = 0.05
    expect(validateRailGrid(grid).ok).toBe(true)
    const resolved = resolveRailGrid(grid)
    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.grid.yRails.find(({ id }) => id === firstId)?.value).toBeCloseTo(0.1)
      expect(resolved.grid.yRails.find(({ id }) => id === nestedId)?.value).toBeCloseTo(0.15)
    }
    grid.minGap = 0.050000000001
    expect(issueCodes(grid)).toContain('min-gap-violation')
  })

  it('동일한 invalid 입력의 issue 순서와 내용이 결정적이다', () => {
    const grid = createGrid()
    grid.xRails[0].position = { kind: 'absolute', value: 0.4 }
    grid.xRails[1].position = { kind: 'absolute', value: 0.3 }
    const first = validateRailGrid(grid)
    const second = validateRailGrid(structuredClone(grid))
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('복합 invalid 입력의 issue 귀속 순서를 exact 고정한다', () => {
    const grid = createGrid()
    grid.xRails.splice(1, 0, {
      id: 'aux:bad',
      kind: 'auxiliary',
      position: {
        kind: 'between',
        fromRailId: 'missing',
        toRailId: grid.yRails[0].id,
        ratio: 0,
      },
    })
    const result = validateRailGrid(grid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ code, axis, railId, referenceRailId }) => ({
      code, axis, railId, referenceRailId,
    }))).toEqual([
      { code: 'invalid-ratio', axis: 'x', railId: 'aux:bad', referenceRailId: undefined },
      { code: 'missing-reference', axis: 'x', railId: 'aux:bad', referenceRailId: 'missing' },
      { code: 'cross-axis-reference', axis: 'x', railId: 'aux:bad', referenceRailId: grid.yRails[0].id },
    ])
  })
})
