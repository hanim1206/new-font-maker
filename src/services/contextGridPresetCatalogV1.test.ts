import { describe, expect, it } from 'vitest'
import type { ContextGridPresetCatalogV1, JamoPartRole, JamoVariantContext } from '../types'
import {
  contextGridPresetCatalogIds,
  createContextGridPresetId,
  createRoleGridDefaultId,
  parseContextGridPresetCatalogV1,
} from './contextGridPresetCatalogV1'

const CONTEXT: JamoVariantContext = {
  baseContext: 'horizontal',
  medialClass: 'wide',
}

function createCatalog(): ContextGridPresetCatalogV1 {
  return {
    schema: 'context-grid-preset-catalog',
    version: 1,
    roleDefaults: [{
      id: createRoleGridDefaultId('CH'),
      role: 'CH',
      coreRailPositions: { 'inner-right': { kind: 'absolute', value: 0.78 } },
    }],
    contextPresets: [{
      id: createContextGridPresetId('CH', CONTEXT),
      role: 'CH',
      context: structuredClone(CONTEXT),
      coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.54 } },
    }],
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

describe('contextGridPresetCatalogV1', () => {
  it('canonical ID와 strict v1 catalog를 입력과 분리된 readonly source로 parse한다', () => {
    const input = deepFreeze(createCatalog())
    const before = JSON.stringify(input)
    const result = parseContextGridPresetCatalogV1(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog).toEqual(input)
    expect(result.catalog).not.toBe(input)
    expect(contextGridPresetCatalogIds(result.catalog)).toEqual(new Set([input.contextPresets[0].id]))
    expect(JSON.stringify(input)).toBe(before)
  })

  it('context property 순서와 무관한 canonical ID를 만든다', () => {
    const reordered: JamoVariantContext = { medialClass: 'wide', baseContext: 'horizontal' }
    expect(createContextGridPresetId('CH', reordered)).toBe(createContextGridPresetId('CH', CONTEXT))
    expect(createRoleGridDefaultId('JU_H')).toBe('role-grid-default:JU_H')
  })

  it.each([
    ['root future field', (catalog: ContextGridPresetCatalogV1) => Object.assign(catalog, { future: true }), 'unknown-field'],
    ['future version', (catalog: ContextGridPresetCatalogV1) => Object.assign(catalog, { version: 2 }), 'unsupported-version'],
    ['noncanonical id', (catalog: ContextGridPresetCatalogV1) => { catalog.roleDefaults[0].id = 'wrong' }, 'non-canonical-id'],
    ['duplicate id', (catalog: ContextGridPresetCatalogV1) => { catalog.contextPresets[0].id = catalog.roleDefaults[0].id }, 'duplicate-id'],
    ['duplicate role default', (catalog: ContextGridPresetCatalogV1) => { catalog.roleDefaults.push(structuredClone(catalog.roleDefaults[0])) }, 'duplicate-role-default'],
    ['duplicate context preset', (catalog: ContextGridPresetCatalogV1) => { catalog.contextPresets.push(structuredClone(catalog.contextPresets[0])) }, 'duplicate-context-preset'],
    ['empty patch', (catalog: ContextGridPresetCatalogV1) => { catalog.contextPresets[0].coreRailPositions = {} }, 'empty-patch'],
    ['unknown core role', (catalog: ContextGridPresetCatalogV1) => Object.assign(catalog.contextPresets[0].coreRailPositions, { future: { kind: 'absolute', value: 0.4 } }), 'invalid-core-position'],
    ['invalid absolute', (catalog: ContextGridPresetCatalogV1) => { catalog.contextPresets[0].coreRailPositions['center-x'] = { kind: 'absolute', value: 1.2 } }, 'invalid-core-position'],
    ['invalid context', (catalog: ContextGridPresetCatalogV1) => { catalog.contextPresets[0].context.medialClass = ' wide' }, 'invalid-context'],
  ] as const)('%s를 strip/default하지 않고 fail-closed한다', (_label, mutate, code) => {
    const catalog = createCatalog()
    mutate(catalog)
    const before = JSON.stringify(catalog)
    const first = parseContextGridPresetCatalogV1(catalog)
    const second = parseContextGridPresetCatalogV1(structuredClone(catalog))
    expect(first.ok).toBe(false)
    expect(second).toEqual(first)
    if (!first.ok) expect(first.issues.map((issue) => issue.code)).toContain(code)
    expect(JSON.stringify(catalog)).toBe(before)
  })

  it.each([
    ['roleDefaults object', (catalog: ContextGridPresetCatalogV1) => {
      ;(catalog as unknown as { roleDefaults: unknown }).roleDefaults = {}
    }],
    ['context null', (catalog: ContextGridPresetCatalogV1) => {
      ;(catalog.contextPresets[0] as unknown as { context: unknown }).context = null
    }],
    ['positions null', (catalog: ContextGridPresetCatalogV1) => {
      ;(catalog.roleDefaults[0] as unknown as { coreRailPositions: unknown }).coreRailPositions = null
    }],
  ] as const)('malformed hydration(%s)을 throw하지 않는다', (_label, mutate) => {
    const catalog = createCatalog()
    mutate(catalog)
    expect(() => parseContextGridPresetCatalogV1(catalog)).not.toThrow()
    expect(parseContextGridPresetCatalogV1(catalog).ok).toBe(false)
  })

  it.each([
    ['roleDefaults', (catalog: ContextGridPresetCatalogV1) => {
      catalog.roleDefaults = new Array(1) as ContextGridPresetCatalogV1['roleDefaults']
    }],
    ['contextPresets', (catalog: ContextGridPresetCatalogV1) => {
      catalog.contextPresets = new Array(1) as ContextGridPresetCatalogV1['contextPresets']
    }],
  ] as const)('sparse %s 배열을 canonical source로 승인하지 않는다', (_label, mutate) => {
    const catalog = createCatalog()
    mutate(catalog)
    expect(() => parseContextGridPresetCatalogV1(catalog)).not.toThrow()
    const result = parseContextGridPresetCatalogV1(catalog)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map(({ code }) => code)).toContain('invalid-root')
  })

  it.each([
    ['inherited context', (catalog: ContextGridPresetCatalogV1) => {
      catalog.contextPresets[0].context = Object.create({ baseContext: 'horizontal' }) as JamoVariantContext
    }],
    ['inherited absolute position', (catalog: ContextGridPresetCatalogV1) => {
      catalog.roleDefaults[0].coreRailPositions['inner-right'] = Object.create({ kind: 'absolute', value: 0.78 })
    }],
    ['inherited between position', (catalog: ContextGridPresetCatalogV1) => {
      catalog.roleDefaults[0].coreRailPositions['inner-right'] = Object.create({
        kind: 'between', fromRailId: 'a', toRailId: 'b', ratio: 0.5,
      })
    }],
  ] as const)('%s 속성으로 strict brand를 만들 수 없다', (_label, mutate) => {
    const catalog = createCatalog()
    mutate(catalog)
    expect(() => parseContextGridPresetCatalogV1(catalog)).not.toThrow()
    expect(parseContextGridPresetCatalogV1(catalog).ok).toBe(false)
  })

  it.each([
    ['STANDALONE', 'choseong-only', true],
    ['STANDALONE', 'vertical', false],
    ['CH', 'choseong-only', false],
    ['CH', 'vertical', true],
    ['JU_VERTICAL', 'vertical-with-jongseong', true],
    ['JU_VERTICAL', 'horizontal', false],
    ['JU_HORIZONTAL', 'horizontal-with-jongseong', true],
    ['JU_HORIZONTAL', 'mixed', false],
    ['JU_H', 'mixed', true],
    ['JU_H', 'vertical', false],
    ['JU_V', 'mixed-with-jongseong', true],
    ['JU_V', 'horizontal', false],
    ['JO', 'horizontal-with-jongseong', true],
    ['JO', 'horizontal', false],
  ] as const)('%s + %s 역할·문맥 행렬을 strict parse한다', (role, baseContext, valid) => {
    const context = { baseContext } as JamoVariantContext
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog',
      version: 1,
      roleDefaults: [],
      contextPresets: [{
        id: createContextGridPresetId(role as JamoPartRole, context),
        role: role as JamoPartRole,
        context,
        coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.5 } },
      }],
    }
    const result = parseContextGridPresetCatalogV1(catalog)
    expect(result.ok).toBe(valid)
    if (!valid && !result.ok) expect(result.issues.map(({ code }) => code)).toContain('invalid-role-context')
  })

  it('7개 역할 × 7개 기본 문맥의 전체 허용 행렬을 고정한다', () => {
    const contexts = [
      'choseong-only',
      'vertical',
      'horizontal',
      'mixed',
      'vertical-with-jongseong',
      'horizontal-with-jongseong',
      'mixed-with-jongseong',
    ] as const
    const allowed: Record<JamoPartRole, ReadonlySet<(typeof contexts)[number]>> = {
      STANDALONE: new Set(['choseong-only']),
      CH: new Set(contexts.slice(1)),
      JU_VERTICAL: new Set(['vertical', 'vertical-with-jongseong']),
      JU_HORIZONTAL: new Set(['horizontal', 'horizontal-with-jongseong']),
      JU_H: new Set(['mixed', 'mixed-with-jongseong']),
      JU_V: new Set(['mixed', 'mixed-with-jongseong']),
      JO: new Set(['vertical-with-jongseong', 'horizontal-with-jongseong', 'mixed-with-jongseong']),
    }
    for (const role of Object.keys(allowed) as JamoPartRole[]) {
      for (const baseContext of contexts) {
        const context: JamoVariantContext = { baseContext }
        const result = parseContextGridPresetCatalogV1({
          schema: 'context-grid-preset-catalog',
          version: 1,
          roleDefaults: [],
          contextPresets: [{
            id: createContextGridPresetId(role, context),
            role,
            context,
            coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.5 } },
          }],
        })
        expect(result.ok, `${role} + ${baseContext}`).toBe(allowed[role].has(baseContext))
      }
    }
  })
})
