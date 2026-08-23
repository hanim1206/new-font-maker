import { describe, expect, it } from 'vitest'
import type {
  ContextGridPresetCatalogV1,
  CoreXRailRole,
  CoreYRailRole,
  GridCellRef,
  JamoContextVariant,
  JamoVariantContext,
  RoleConstructionScope,
} from '../types'
import {
  createContextGridPresetId,
  createRoleGridDefaultId,
} from './contextGridPresetCatalogV1'
import {
  contextualGridPresetPriority,
  resolveContextualPartGrid,
} from './contextPartGridResolver'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  createRoleConstructionSourceV1,
} from './jamoConstruction'
import {
  createJamoContextVariantId,
  gridReferenceAddressKey,
  resolveExactJamoContextVariant,
} from './jamoContextVariants'
import { createBasePartGrid } from './railGridResolver'

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}
const REQUEST: JamoVariantContext = {
  baseContext: 'horizontal', medialClass: 'wide', finalWidthClass: 'normal', initialClass: 'open',
}
const AUX = 'rail:contextual:x:aux'

function createFixture() {
  const grid = createBasePartGrid({ role: 'CH', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'CH', gridId: grid.id })
  const innerLeft = grid.xRails.find(({ coreRole }) => coreRole === 'inner-left')!.id
  const centerX = grid.xRails.find(({ coreRole }) => coreRole === 'center-x')!.id
  const innerTop = grid.yRails.find(({ coreRole }) => coreRole === 'inner-top')!.id
  const centerY = grid.yRails.find(({ coreRole }) => coreRole === 'center-y')!.id
  const outerRight = grid.xRails.find(({ coreRole }) => coreRole === 'outer-right')!.id
  const centerlineId = 'centerline:contextual:giyeok'
  const anchorId = 'anchor:contextual:start'
  const pointId = 'point:contextual:start'
  const handleId = 'point:contextual:handle'
  master.construction.channels.main!.elements.push({
    id: centerlineId,
    kind: 'centerline',
    closed: false,
    thickness: 0.1,
    anchors: [{
      id: anchorId,
      point: { id: pointId, xRailId: innerLeft, yRailId: innerTop },
      handleOut: { id: handleId, xRailId: centerX, yRailId: innerTop },
    }, {
      id: 'anchor:contextual:end',
      point: { id: 'point:contextual:end', xRailId: outerRight, yRailId: centerY },
    }],
  })
  const areaId = 'area:contextual:block'
  const bounds = { leftRailId: innerLeft, rightRailId: centerX, topRailId: innerTop, bottomRailId: centerY }
  const cell: GridCellRef = {
    id: createGridCellId({ masterId: master.id, channel: 'main', elementId: areaId, ...bounds }),
    ...bounds,
  }
  master.construction.channels.main!.elements.push({
    id: areaId, kind: 'area', filledCells: [cell], boundaryTreatments: [],
  })
  const source = createRoleConstructionSourceV1({ grid, masters: [master] })
  return { source, masterId: master.id, centerlineId, anchorId, pointId, handleId, innerLeft, centerX }
}

function createVariant(fixture: ReturnType<typeof createFixture>, context: JamoVariantContext = REQUEST): JamoContextVariant {
  return {
    id: createJamoContextVariantId(fixture.masterId, context),
    context: structuredClone(context),
    coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.28 } },
    auxiliaryRails: {
      xRails: [{
        id: AUX,
        kind: 'auxiliary',
        position: { kind: 'between', fromRailId: fixture.innerLeft, toRailId: fixture.centerX, ratio: 0.5 },
      }],
      yRails: [],
    },
    referenceOverrides: [{
      id: 'override:contextual:start:x',
      target: {
        kind: 'centerline-point', masterId: fixture.masterId, channel: 'main',
        elementId: fixture.centerlineId, anchorId: fixture.anchorId,
        referenceId: fixture.pointId, slot: 'point', axis: 'x',
      },
      railId: AUX,
    }],
  }
}

function createCatalog(): ContextGridPresetCatalogV1 {
  const context = { baseContext: 'horizontal' as const, medialClass: 'wide' }
  return {
    schema: 'context-grid-preset-catalog',
    version: 1,
    roleDefaults: [{
      id: createRoleGridDefaultId('CH'), role: 'CH',
      coreRailPositions: { 'inner-right': { kind: 'absolute', value: 0.78 } },
    }],
    contextPresets: [{
      id: createContextGridPresetId('CH', { baseContext: 'horizontal' }),
      role: 'CH', context: { baseContext: 'horizontal' },
      coreRailPositions: { 'inner-top': { kind: 'absolute', value: 0.22 } },
    }, {
      id: createContextGridPresetId('CH', context),
      role: 'CH', context,
      coreRailPositions: {
        'inner-left': { kind: 'absolute', value: 0.26 },
        'center-x': { kind: 'absolute', value: 0.54 },
      },
    }],
  }
}

function railPosition(source: { grid: RoleConstructionScope['grid'] }, coreRole: CoreXRailRole | CoreYRailRole) {
  return [...source.grid.xRails, ...source.grid.yRails].find((rail) => rail.coreRole === coreRole)!.position
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

describe('contextPartGridResolver', () => {
  it('master → role default → context preset → jamo override 순서와 leaf provenance를 적용한다', () => {
    const fixture = createFixture()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const catalog = createCatalog()
    const beforeSource = JSON.stringify(fixture.source)
    const beforeCatalog = JSON.stringify(catalog)
    const result = resolveContextualPartGrid({
      source: deepFreeze(fixture.source), catalog: deepFreeze(catalog), masterId: fixture.masterId, requestedContext: REQUEST,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(railPosition(result, 'inner-left')).toEqual({ kind: 'absolute', value: 0.28 })
    expect(railPosition(result, 'center-x')).toEqual({ kind: 'absolute', value: 0.54 })
    expect(railPosition(result, 'inner-right')).toEqual({ kind: 'absolute', value: 0.78 })
    expect(railPosition(result, 'outer-right')).toEqual({ kind: 'absolute', value: 1 })
    const ids = Object.fromEntries([...result.grid.xRails, ...result.grid.yRails]
      .filter((rail) => rail.coreRole).map((rail) => [rail.coreRole!, rail.id]))
    expect(result.provenance.railSources[ids['inner-left']]).toEqual({ source: 'jamo-override', variantId: variant.id })
    expect(result.provenance.railSources[ids['center-x']]).toEqual({ source: 'context-preset', presetId: catalog.contextPresets[1].id })
    expect(result.provenance.railSources[ids['inner-right']]).toEqual({ source: 'role-default', presetId: catalog.roleDefaults[0].id })
    expect(result.provenance.railSources[ids['outer-right']]).toEqual({ source: 'master' })
    expect(result.provenance.railSources[AUX]).toEqual({ source: 'jamo-override', variantId: variant.id })
    const handleKey = gridReferenceAddressKey({
      kind: 'centerline-point', masterId: fixture.masterId, channel: 'main', elementId: fixture.centerlineId,
      anchorId: fixture.anchorId, referenceId: fixture.handleId, slot: 'handle-out', axis: 'x',
    })
    expect(result.provenance.referenceSources[handleKey]).toEqual({ source: 'context-preset', presetId: catalog.contextPresets[1].id })
    expect(result.provenance.referenceSources[gridReferenceAddressKey(variant.referenceOverrides![0].target)])
      .toEqual({ source: 'jamo-override', variantId: variant.id })
    expect(result.provenance.selectedPresetIds).toEqual([catalog.roleDefaults[0].id, catalog.contextPresets[1].id])
    expect(result.provenance.selectedVariantId).toBe(variant.id)
    expect(result.master).not.toHaveProperty('contextVariants')
    expect(JSON.stringify(fixture.source)).toBe(beforeSource)
    expect(JSON.stringify(catalog)).toBe(beforeCatalog)
  })

  it('specificity와 medial → final → initial 동률 우선순위를 입력 순서와 무관하게 적용한다', () => {
    const fixture = createFixture()
    const catalog = createCatalog()
    const finalContext = { baseContext: 'horizontal' as const, finalWidthClass: 'normal' as const }
    catalog.contextPresets.push({
      id: createContextGridPresetId('CH', finalContext), role: 'CH', context: finalContext,
      coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.52 } },
    })
    const first = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    catalog.contextPresets.reverse()
    const second = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(second).toEqual(first)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(railPosition(first, 'center-x')).toEqual({ kind: 'absolute', value: 0.54 })
    expect(contextualGridPresetPriority({ baseContext: 'horizontal', medialClass: 'wide' }))
      .toBeGreaterThan(contextualGridPresetPriority(finalContext))
  })

  it('3태그 > 2태그 > 1태그 > base fallback과 7개 baseContext 격리를 고정한다', () => {
    const full = contextualGridPresetPriority(REQUEST)
    const two = contextualGridPresetPriority({ baseContext: 'horizontal', medialClass: 'wide', finalWidthClass: 'normal' })
    const one = contextualGridPresetPriority({ baseContext: 'horizontal', medialClass: 'wide' })
    const base = contextualGridPresetPriority({ baseContext: 'horizontal' })
    expect(full).toBeGreaterThan(two)
    expect(two).toBeGreaterThan(one)
    expect(one).toBeGreaterThan(base)
    const fixture = createFixture()
    const result = resolveContextualPartGrid({
      source: fixture.source, catalog: createCatalog(), masterId: fixture.masterId,
      requestedContext: { baseContext: 'vertical' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.provenance.selectedPresetIds).toEqual([createRoleGridDefaultId('CH')])
  })

  it('preset과 독립적으로 가장 구체적인 자소 variant를 선택하고 배열 순서에 의존하지 않는다', () => {
    const fixture = createFixture()
    const baseContext = { baseContext: 'horizontal' as const }
    const medialContext = { baseContext: 'horizontal' as const, medialClass: 'wide' }
    const baseVariant: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, baseContext), context: baseContext,
      coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.23 } },
    }
    const medialVariant: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, medialContext), context: medialContext,
      coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.24 } },
    }
    fixture.source.masters[0].contextVariants = [baseVariant, medialVariant]
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const first = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    fixture.source.masters[0].contextVariants.reverse()
    const second = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(second).toEqual(first)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(railPosition(first, 'inner-left')).toEqual({ kind: 'absolute', value: 0.24 })
    expect(first.provenance.selectedVariantId).toBe(medialVariant.id)
  })

  it('자소 variant 동률도 medial → final → initial 순서와 base fallback을 따른다', () => {
    const fixture = createFixture()
    const contexts = [
      { baseContext: 'horizontal' as const },
      { baseContext: 'horizontal' as const, initialClass: 'open' as const },
      { baseContext: 'horizontal' as const, finalWidthClass: 'normal' as const },
      { baseContext: 'horizontal' as const, medialClass: 'wide' },
    ]
    fixture.source.masters[0].contextVariants = contexts.map((context, index) => ({
      id: createJamoContextVariantId(fixture.masterId, context),
      context,
      coreRailOverrides: { 'inner-left': { kind: 'absolute' as const, value: 0.21 + index * 0.01 } },
    })).reverse()
    const emptyCatalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const tied = resolveContextualPartGrid({
      source: fixture.source, catalog: emptyCatalog, masterId: fixture.masterId, requestedContext: REQUEST,
    })
    expect(tied.ok).toBe(true)
    if (!tied.ok) return
    expect(railPosition(tied, 'inner-left')).toEqual({ kind: 'absolute', value: 0.24 })
    expect(tied.provenance.selectedVariantId).toBe(createJamoContextVariantId(fixture.masterId, contexts[3]))

    const baseOnly = resolveContextualPartGrid({
      source: fixture.source,
      catalog: emptyCatalog,
      masterId: fixture.masterId,
      requestedContext: { baseContext: 'horizontal' },
    })
    expect(baseOnly.ok).toBe(true)
    if (baseOnly.ok) expect(baseOnly.provenance.selectedVariantId)
      .toBe(createJamoContextVariantId(fixture.masterId, contexts[0]))
  })

  it('variant presetId가 compatible한 낮은 specificity preset을 명시 선택한다', () => {
    const fixture = createFixture()
    const variant = createVariant(fixture)
    const catalog = createCatalog()
    variant.presetId = catalog.contextPresets[0].id
    fixture.source.masters[0].contextVariants = [variant]
    const result = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(railPosition(result, 'center-x')).toEqual({ kind: 'absolute', value: 0.5 })
    expect(railPosition(result, 'inner-top')).toEqual({ kind: 'absolute', value: 0.22 })
    expect(result.provenance.selectedPresetIds.at(-1)).toBe(catalog.contextPresets[0].id)
  })

  it.each([
    ['unknown preset', 'missing', 'unknown-preset'],
    ['wrong role preset', 'wrong-role', 'preset-role-mismatch'],
    ['wrong context preset', 'wrong-context', 'preset-context-mismatch'],
  ] as const)('%s을 fail-closed한다', (_label, mode, code) => {
    const fixture = createFixture()
    const variant = createVariant(fixture)
    const catalog = createCatalog()
    if (mode === 'missing') variant.presetId = 'preset:missing'
    if (mode === 'wrong-role') {
      const context = { baseContext: 'horizontal' as const }
      catalog.contextPresets.push({
        id: createContextGridPresetId('JU_HORIZONTAL', context), role: 'JU_HORIZONTAL', context,
        coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.51 } },
      })
      variant.presetId = catalog.contextPresets.at(-1)!.id
    }
    if (mode === 'wrong-context') {
      const context = { baseContext: 'vertical' as const }
      catalog.contextPresets.push({
        id: createContextGridPresetId('CH', context), role: 'CH', context,
        coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.51 } },
      })
      variant.presetId = catalog.contextPresets.at(-1)!.id
    }
    fixture.source.masters[0].contextVariants = [variant]
    const before = JSON.stringify(fixture.source)
    const result = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((entry) => entry.code)).toContain(code)
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect('grid' in result).toBe(false)
  })

  it('override 제거에 따라 context → role default → master가 live로 드러난다', () => {
    const fixture = createFixture()
    const catalog = createCatalog()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const withVariant = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(withVariant.ok && railPosition(withVariant, 'inner-left')).toEqual({ kind: 'absolute', value: 0.28 })
    delete variant.coreRailOverrides!['inner-left']
    const withContext = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(withContext.ok && railPosition(withContext, 'inner-left')).toEqual({ kind: 'absolute', value: 0.26 })
    catalog.contextPresets[1].coreRailPositions = { 'center-x': { kind: 'absolute', value: 0.54 } }
    catalog.roleDefaults[0].coreRailPositions['inner-left'] = { kind: 'absolute', value: 0.22 }
    const withRole = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(withRole.ok && railPosition(withRole, 'inner-left')).toEqual({ kind: 'absolute', value: 0.22 })
    delete catalog.roleDefaults[0].coreRailPositions['inner-left']
    const withMaster = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(withMaster.ok && railPosition(withMaster, 'inner-left')).toEqual({ kind: 'absolute', value: 0.2 })
  })

  it('상위값과 semantic-equal이어도 명시 patch가 live ownership을 가진다', () => {
    const fixture = createFixture()
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1,
      roleDefaults: [{
        id: createRoleGridDefaultId('CH'), role: 'CH',
        coreRailPositions: { 'inner-left': { kind: 'absolute', value: 0.2 } },
      }],
      contextPresets: [{
        id: createContextGridPresetId('CH', { baseContext: 'horizontal' }), role: 'CH',
        context: { baseContext: 'horizontal' },
        coreRailPositions: { 'center-x': { kind: 'absolute', value: 0.5 } },
      }],
    }
    const variant: JamoContextVariant = {
      id: createJamoContextVariantId(fixture.masterId, REQUEST), context: structuredClone(REQUEST),
      coreRailOverrides: { 'inner-right': { kind: 'absolute', value: 0.8 } },
    }
    fixture.source.masters[0].contextVariants = [variant]
    const result = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = Object.fromEntries(result.grid.xRails.map((rail) => [rail.coreRole, rail.id]))
    expect(result.provenance.railSources[ids['inner-left']]).toEqual({
      source: 'role-default', presetId: catalog.roleDefaults[0].id,
    })
    expect(result.provenance.railSources[ids['center-x']]).toEqual({
      source: 'context-preset', presetId: catalog.contextPresets[0].id,
    })
    expect(result.provenance.railSources[ids['inner-right']]).toEqual({
      source: 'jamo-override', variantId: variant.id,
    })
  })

  it.each([
    ['STANDALONE', 'choseong-only'],
    ['CH', 'mixed-with-jongseong'],
    ['JU_VERTICAL', 'vertical-with-jongseong'],
    ['JU_HORIZONTAL', 'horizontal'],
    ['JU_H', 'mixed'],
    ['JU_V', 'mixed-with-jongseong'],
    ['JO', 'horizontal-with-jongseong'],
  ] as const)('%s role은 %s 문맥만 자기 grid에서 해석한다', (role, baseContext) => {
    const grid = createBasePartGrid({ role, xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
    const master = createEmptyJamoRoleMaster({ jamoId: role === 'JO' ? 'ㄱ' : 'ㄱ', role, gridId: grid.id })
    const source = createRoleConstructionSourceV1({ grid, masters: [master] })
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const result = resolveContextualPartGrid({
      source, catalog, masterId: master.id,
      requestedContext: { baseContext } as JamoVariantContext,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.grid.role).toBe(role)
  })

  it('다른 role 전용 baseContext로 fallback하지 않는다', () => {
    const grid = createBasePartGrid({ role: 'JO', xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
    const master = createEmptyJamoRoleMaster({ jamoId: 'ㄱ', role: 'JO', gridId: grid.id })
    const source = createRoleConstructionSourceV1({ grid, masters: [master] })
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const result = resolveContextualPartGrid({
      source, catalog, masterId: master.id, requestedContext: { baseContext: 'horizontal' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('role-mismatch')
  })

  it('CH는 choseong-only 문맥을 STANDALONE에서 빌려오지 않는다', () => {
    const fixture = createFixture()
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const result = resolveContextualPartGrid({
      source: fixture.source,
      catalog,
      masterId: fixture.masterId,
      requestedContext: { baseContext: 'choseong-only' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('role-mismatch')
  })

  it('선택되지 않은 다른 master의 preset 링크도 catalog role/context로 검증한다', () => {
    const fixture = createFixture()
    const sibling = createEmptyJamoRoleMaster({
      jamoId: 'ㄴ', role: 'CH', gridId: fixture.source.grid.id,
    })
    const siblingContext = { baseContext: 'horizontal' as const }
    const wrongRolePreset = {
      id: createContextGridPresetId('JU_HORIZONTAL', siblingContext),
      role: 'JU_HORIZONTAL' as const,
      context: siblingContext,
      coreRailPositions: { 'center-x': { kind: 'absolute' as const, value: 0.51 } },
    }
    sibling.contextVariants = [{
      id: createJamoContextVariantId(sibling.id, siblingContext),
      context: siblingContext,
      presetId: wrongRolePreset.id,
      coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.24 } },
    }]
    fixture.source.masters.push(sibling)
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1,
      roleDefaults: [], contextPresets: [wrongRolePreset],
    }
    const before = JSON.stringify(fixture.source)
    const result = resolveContextualPartGrid({
      source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        code: 'preset-role-mismatch', masterId: sibling.id,
      })
    }
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect('grid' in result).toBe(false)
  })

  it('선택되지 않은 sibling variant도 master role의 문맥 행렬을 벗어날 수 없다', () => {
    const fixture = createFixture()
    const sibling = createEmptyJamoRoleMaster({
      jamoId: 'ㄴ', role: 'CH', gridId: fixture.source.grid.id,
    })
    const deadContext = { baseContext: 'choseong-only' as const }
    sibling.contextVariants = [{
      id: createJamoContextVariantId(sibling.id, deadContext),
      context: deadContext,
      coreRailOverrides: { 'inner-left': { kind: 'absolute', value: 0.24 } },
    }]
    fixture.source.masters.push(sibling)
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const before = JSON.stringify(fixture.source)
    const result = resolveContextualPartGrid({
      source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        code: 'invalid-source', causeCodes: ['invalid-variant-context'],
      })
    }
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect('grid' in result).toBe(false)
  })

  it.each([
    ['variant envelope', (fixture: ReturnType<typeof createFixture>) => {
      const variant = createVariant(fixture)
      fixture.source.masters[0].contextVariants = [Object.assign(
        Object.create({ id: variant.id, context: variant.context }),
        { coreRailOverrides: variant.coreRailOverrides },
      )]
    }],
    ['reference override envelope', (fixture: ReturnType<typeof createFixture>) => {
      const variant = createVariant(fixture)
      variant.referenceOverrides = [Object.create(variant.referenceOverrides![0])]
      fixture.source.masters[0].contextVariants = [variant]
    }],
    ['reference target address', (fixture: ReturnType<typeof createFixture>) => {
      const variant = createVariant(fixture)
      const override = variant.referenceOverrides![0]
      override.target = Object.create(override.target)
      fixture.source.masters[0].contextVariants = [variant]
    }],
  ] as const)('prototype 상속 %s을 throw 없이 invalid-source로 차단한다', (_label, mutate) => {
    const fixture = createFixture()
    mutate(fixture)
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const before = JSON.stringify(fixture.source)
    expect(() => resolveContextualPartGrid({
      source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST,
    })).not.toThrow()
    const result = resolveContextualPartGrid({
      source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('invalid-source')
    expect(JSON.stringify(fixture.source)).toBe(before)
    expect('grid' in result).toBe(false)
  })

  it.each([
    ['context preset', (fixture: ReturnType<typeof createFixture>, catalog: ContextGridPresetCatalogV1) => {
      catalog.roleDefaults[0].coreRailPositions = { 'inner-left': { kind: 'absolute', value: 0.22 } }
      catalog.contextPresets[1].coreRailPositions = { 'center-x': { kind: 'absolute', value: 0.79 } }
    }],
    ['selected variant', (fixture: ReturnType<typeof createFixture>) => {
      const variant = createVariant(fixture)
      variant.coreRailOverrides = { 'inner-left': { kind: 'absolute', value: 0.49 } }
      fixture.source.masters[0].contextVariants = [variant]
    }],
  ] as const)('앞 계층 성공 뒤 invalid %s를 partial result 없이 차단한다', (_label, mutate) => {
    const fixture = createFixture()
    const catalog = createCatalog()
    mutate(fixture, catalog)
    const sourceBefore = JSON.stringify(fixture.source)
    const catalogBefore = JSON.stringify(catalog)
    const result = resolveContextualPartGrid({
      source: deepFreeze(fixture.source),
      catalog: deepFreeze(catalog),
      masterId: fixture.masterId,
      requestedContext: REQUEST,
    })
    expect(result.ok).toBe(false)
    expect('grid' in result).toBe(false)
    expect('master' in result).toBe(false)
    expect(JSON.stringify(fixture.source)).toBe(sourceBefore)
    expect(JSON.stringify(catalog)).toBe(catalogBefore)
  })

  it('catalog가 비었을 때 기존 exact sparse 결과와 grid/master/leaf provenance가 같다', () => {
    const fixture = createFixture()
    const variant = createVariant(fixture)
    fixture.source.masters[0].contextVariants = [variant]
    const catalog: ContextGridPresetCatalogV1 = {
      schema: 'context-grid-preset-catalog', version: 1, roleDefaults: [], contextPresets: [],
    }
    const contextual = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    const exact = resolveExactJamoContextVariant({ source: fixture.source, masterId: fixture.masterId, variantId: variant.id })
    expect(contextual.ok).toBe(true)
    expect(exact.ok).toBe(true)
    if (!contextual.ok || !exact.ok) return
    expect(contextual.grid).toEqual(exact.grid)
    expect(contextual.master).toEqual(exact.master)
    expect(contextual.provenance.railSources).toEqual(exact.provenance.railSources)
    expect(contextual.provenance.referenceSources).toEqual(exact.provenance.referenceSources)
  })

  it('invalid derived minGap과 role-context mismatch를 partial result 없이 차단한다', () => {
    const fixture = createFixture()
    const catalog = createCatalog()
    catalog.roleDefaults[0].coreRailPositions = { 'inner-left': { kind: 'absolute', value: 0.49 } }
    const invalid = resolveContextualPartGrid({ source: fixture.source, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.issues[0].code).toBe('invalid-derived-grid')
    expect('grid' in invalid).toBe(false)

    const standalone = structuredClone(fixture.source)
    standalone.grid.role = 'STANDALONE'
    const mismatch = resolveContextualPartGrid({ source: standalone, catalog, masterId: fixture.masterId, requestedContext: REQUEST })
    expect(mismatch.ok).toBe(false)
  })

  it('production resolver는 store, FontData, layout/SVG/OTF에 의존하지 않는다', async () => {
    const sources = await Promise.all([
      import('./contextPartGridResolver?raw').then((module) => String(module.default)),
      import('./contextGridPresetCatalogV1?raw').then((module) => String(module.default)),
      import('./jamoContextRoles?raw').then((module) => String(module.default)),
    ])
    for (const source of sources) {
      expect(source).not.toMatch(/stores\//)
      expect(source).not.toMatch(/localStorage|fontData|layoutGrid|SvgRenderer|fontExport|fontGenerator/i)
    }
  })
})
