import { describe, expect, it } from 'vitest'
import type {
  CoreRailRole,
  JamoPartRole,
  JamoVariantContext,
  SetSevenContextBaseCoreRailV2Command,
  ShapeSystemSourceV2,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { resolveContextualPartGrid } from './contextPartGridResolver'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { createEmptyJamoRoleMaster, createJamoRoleMasterId } from './jamoConstruction'
import {
  removeCoreRailOverrideV1,
  setCoreRailOverrideV1,
} from './jamoContextVariantCommandsV1'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'
import { setSevenContextBaseCoreRailV2 } from './baseMasterRailCommandsV2'

const CONTEXTS = [
  ['STANDALONE', { baseContext: 'choseong-only' }],
  ['CH', { baseContext: 'vertical' }],
  ['CH', { baseContext: 'horizontal' }],
  ['CH', { baseContext: 'mixed' }],
  ['CH', { baseContext: 'vertical-with-jongseong' }],
  ['CH', { baseContext: 'horizontal-with-jongseong' }],
  ['CH', { baseContext: 'mixed-with-jongseong' }],
] as const satisfies readonly (readonly [JamoPartRole, JamoVariantContext])[]

function railId(
  source: ValidatedShapeSystemSourceV2,
  role: 'STANDALONE' | 'CH',
  coreRole: CoreRailRole,
): string {
  return [...source.roleSources[role].grid.xRails, ...source.roleSources[role].grid.yRails]
    .find((rail) => rail.coreRole === coreRole)!.id
}

function command(
  source: ValidatedShapeSystemSourceV2,
  overrides: Partial<SetSevenContextBaseCoreRailV2Command> = {},
): SetSevenContextBaseCoreRailV2Command {
  const coreRole = overrides.coreRole ?? 'inner-left'
  return {
    transactionId: 'tx:base-master:inner-left',
    jamoId: 'ㄱ',
    coreRole,
    position: { kind: 'absolute', value: 0.25 },
    targets: {
      STANDALONE: {
        masterId: createJamoRoleMasterId('ㄱ', 'STANDALONE'),
        railId: railId(source, 'STANDALONE', coreRole),
      },
      CH: {
        masterId: createJamoRoleMasterId('ㄱ', 'CH'),
        railId: railId(source, 'CH', coreRole),
      },
    },
    ...overrides,
  }
}

function resolvedRail(
  source: ValidatedShapeSystemSourceV2,
  role: 'STANDALONE' | 'CH',
  context: JamoVariantContext,
  coreRole: CoreRailRole = 'inner-left',
) {
  const result = resolveContextualPartGrid({
    source: source.roleSources[role],
    catalog: source.contextPresetCatalog,
    masterId: createJamoRoleMasterId('ㄱ', role),
    requestedContext: context,
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('fixture context 해석 실패')
  const rail = [...result.grid.xRails, ...result.grid.yRails]
    .find((candidate) => candidate.coreRole === coreRole)!
  return { rail, provenance: result.provenance.railSources[rail.id] }
}

function replaceChSource(
  source: ValidatedShapeSystemSourceV2,
  roleSource: ShapeSystemSourceV2['roleSources']['CH'],
): ValidatedShapeSystemSourceV2 {
  const next = structuredClone(source) as unknown as ShapeSystemSourceV2
  next.roleSources.CH = structuredClone(roleSource)
  const parsed = parseShapeSystemSourceV2(next)
  if (!parsed.ok) throw new Error(`fixture parse 실패: ${parsed.issues.map(({ code }) => code).join(',')}`)
  return parsed.source
}

describe('J-02 7문맥 base/master core Rail command', () => {
  it('독립 STANDALONE/CH owner를 한 transaction으로 바꾸고 7개 결과를 master provenance로 전파한다', () => {
    const source = createStarterShapeSystemV2()
    const untouchedRoles = Object.fromEntries(
      (['JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO'] as const)
        .map((role) => [role, structuredClone(source.roleSources[role])]),
    )
    const beforeMasters = {
      STANDALONE: structuredClone(source.roleSources.STANDALONE.masters),
      CH: structuredClone(source.roleSources.CH.masters),
    }
    const beforeCatalog = structuredClone(source.contextPresetCatalog)
    const beforeLayout = structuredClone(source.layoutGridSystem)
    const target = command(source)
    const result = setSevenContextBaseCoreRailV2(source, target)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transaction).toMatchObject({
      id: target.transactionId,
      kind: 'master-grid',
      command: 'set-seven-context-base-core-rail',
      before: source,
      after: result.source,
    })
    expect(result.source.roleSources.STANDALONE.masters).toEqual(beforeMasters.STANDALONE)
    expect(result.source.roleSources.CH.masters).toEqual(beforeMasters.CH)
    for (const [role, roleSource] of Object.entries(untouchedRoles)) {
      expect(result.source.roleSources[role as JamoPartRole]).toEqual(roleSource)
    }
    expect(result.source.contextPresetCatalog).toEqual(beforeCatalog)
    expect(result.source.layoutGridSystem).toEqual(beforeLayout)
    for (const role of ['STANDALONE', 'CH'] as const) {
      expect(result.source.roleSources[role].grid.xRails.map(({ id }) => id))
        .toEqual(source.roleSources[role].grid.xRails.map(({ id }) => id))
      expect(result.source.roleSources[role].grid.yRails.map(({ id }) => id))
        .toEqual(source.roleSources[role].grid.yRails.map(({ id }) => id))
    }
    for (const [role, context] of CONTEXTS) {
      const resolved = resolvedRail(result.source, role, context)
      expect(resolved.rail.position).toEqual({ kind: 'absolute', value: 0.25 })
      expect(resolved.provenance).toEqual({ source: 'master' })
    }
    expect(target.targets.STANDALONE.railId).not.toBe(target.targets.CH.railId)
  })

  it('sparse context override leaf를 exact 보존하고 제거하면 새 base와 provenance가 즉시 드러난다', () => {
    const starter = createStarterShapeSystemV2()
    const context = { baseContext: 'horizontal' } as const
    const setOverride = setCoreRailOverrideV1(starter.roleSources.CH, {
      transactionId: 'tx:fixture:override',
      masterId: createJamoRoleMasterId('ㄱ', 'CH'),
      context,
      coreRole: 'inner-left',
      position: { kind: 'absolute', value: 0.27 },
    })
    expect(setOverride.ok).toBe(true)
    if (!setOverride.ok) return
    const source = replaceChSource(starter, setOverride.scope)
    const variantsBefore = structuredClone(source.roleSources.CH.masters[0].contextVariants)
    const result = setSevenContextBaseCoreRailV2(source, command(source))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.roleSources.CH.masters[0].contextVariants).toEqual(variantsBefore)
    expect(resolvedRail(result.source, 'CH', context)).toMatchObject({
      rail: { position: { kind: 'absolute', value: 0.27 } },
      provenance: { source: 'jamo-override' },
    })

    const removed = removeCoreRailOverrideV1(result.source.roleSources.CH, {
      transactionId: 'tx:fixture:remove',
      masterId: createJamoRoleMasterId('ㄱ', 'CH'),
      context,
      coreRole: 'inner-left',
    })
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    const withoutOverride = replaceChSource(result.source, removed.scope)
    expect(resolvedRail(withoutOverride, 'CH', context)).toEqual(expect.objectContaining({
      rail: expect.objectContaining({ position: { kind: 'absolute', value: 0.25 } }),
      provenance: { source: 'master' },
    }))
  })

  it.each([
    ['no-op', (source: ValidatedShapeSystemSourceV2) => command(source, { position: { kind: 'absolute', value: 0.2 } }), 'no-op'],
    ['stale Rail ID', (source: ValidatedShapeSystemSourceV2) => {
      const value = command(source)
      value.targets.CH.railId = 'rail:stale'
      return value
    }, 'stale-target'],
    ['core role mismatch', (source: ValidatedShapeSystemSourceV2) => {
      const value = command(source)
      value.targets.CH.railId = railId(source, 'CH', 'center-x')
      return value
    }, 'core-role-mismatch'],
    ['invalid minGap', (source: ValidatedShapeSystemSourceV2) => command(source, { position: { kind: 'absolute', value: 0.49 } }), 'invalid-result'],
    ['shared grid sibling', (source: ValidatedShapeSystemSourceV2) => command(source), 'shared-grid-in-use'],
  ] as const)('%s은 partial result 없이 source를 exact 보존한다', (_label, createCommand, code) => {
    let source = createStarterShapeSystemV2()
    if (_label === 'shared grid sibling') {
      const mutable = structuredClone(source) as unknown as ShapeSystemSourceV2
      mutable.roleSources.CH.masters.push(createEmptyJamoRoleMaster({
        jamoId: 'ㄴ', role: 'CH', gridId: mutable.roleSources.CH.grid.id,
      }))
      const parsed = parseShapeSystemSourceV2(mutable)
      if (!parsed.ok) throw new Error('sibling fixture parse 실패')
      source = parsed.source
    }
    const before = JSON.stringify(source)
    const result = setSevenContextBaseCoreRailV2(source, createCommand(source))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
    expect(JSON.stringify(source)).toBe(before)
    expect('transaction' in result).toBe(false)
  })

  it('unknown field가 있는 source와 command를 strict하게 거부한다', () => {
    const source = createStarterShapeSystemV2()
    const malformedSource = structuredClone(source) as unknown as Record<string, unknown>
    malformedSource.future = true
    expect(setSevenContextBaseCoreRailV2(malformedSource, command(source))).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'invalid-source' }),
    }))
    const malformedCommand = Object.assign(command(source), { future: true })
    expect(setSevenContextBaseCoreRailV2(source, malformedCommand)).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'invalid-command' }),
    }))
  })
})
