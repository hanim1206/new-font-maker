import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FontData, FontDataV1_2, FontDataV1_3 } from '../src/types/database'
import type {
  CoreXRailRole,
  CoreYRailRole,
  EditorHistoryEntry,
  JamoPartRole,
  LayoutSchema,
  LayoutType,
  Part,
  PartOverride,
  RoleConstructionScope,
  ShapeSystemSourceV1,
  ShapeSystemSourceV2,
} from '../src/types'
import { parseAndMigrateFontData } from '../src/services/fontDataMigration'
import { createEmptyJamoRoleMaster, createRoleConstructionSourceV1 } from '../src/services/jamoConstruction'
import { createBasePartGrid } from '../src/services/railGridResolver'
import { createShapeSystemSourceV1, SHAPE_SYSTEM_ROLES } from '../src/services/shapeSystemSourceV1'
import { createShapeSystemSourceV2 } from '../src/services/shapeSystemSourceV2'
import { createConnectedShapeSystemV2Fixture } from '../tests/fixtures/shapeSystemV2'

const storageValues = new Map<string, string>()
let failingStorageKey: string | null = null
const localStorageStub = {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key: string) => storageValues.get(key) ?? null,
  key: (index: number) => [...storageValues.keys()][index] ?? null,
  removeItem: (key: string) => { storageValues.delete(key) },
  setItem: (key: string, value: string) => {
    if (key === failingStorageKey) throw new Error(`injected persist failure: ${key}`)
    storageValues.set(key, value)
  },
}

let collectFontData: typeof import('../src/services/fontDataBridge').collectFontData
let applyFontData: typeof import('../src/services/fontDataBridge').applyFontData
let useLayoutStore: typeof import('../src/stores/layoutStore').useLayoutStore
let useJamoStore: typeof import('../src/stores/jamoStore').useJamoStore
let useGlobalStyleStore: typeof import('../src/stores/globalStyleStore').useGlobalStyleStore
let useHistoryStore: typeof import('../src/stores/historyStore').useHistoryStore
let useEditorHistoryStore: typeof import('../src/stores/editorHistoryStore').useEditorHistoryStore
let useShapeSystemStore: typeof import('../src/stores/shapeSystemStore').useShapeSystemStore
let originalFontData: FontData

const X: Record<CoreXRailRole, number> = {
  'outer-left': 0, 'inner-left': 0.2, 'center-x': 0.5, 'inner-right': 0.8, 'outer-right': 1,
}
const Y: Record<CoreYRailRole, number> = {
  'outer-top': 0, 'inner-top': 0.2, 'center-y': 0.5, 'inner-bottom': 0.8, 'outer-bottom': 1,
}

function shapeSourceFor(role: JamoPartRole): RoleConstructionScope {
  const grid = createBasePartGrid({ role, xCorePositions: X, yCorePositions: Y, snapStep: 0.025, minGap: 0.05 })
  return createRoleConstructionSourceV1({
    grid,
    masters: [createEmptyJamoRoleMaster({ jamoId: `font-data:${role}`, role, gridId: grid.id })],
  })
}

function shapeEnvelopeV1(): ShapeSystemSourceV1 {
  return createShapeSystemSourceV1(Object.fromEntries(
    SHAPE_SYSTEM_ROLES.map((role) => [role, shapeSourceFor(role)]),
  ) as Record<JamoPartRole, RoleConstructionScope>)
}

function shapeEnvelope(): ShapeSystemSourceV2 {
  return createShapeSystemSourceV2({
    roleSources: structuredClone(shapeEnvelopeV1().roleSources),
  })
}

function cloneFontData(data: FontData): FontData {
  return structuredClone(data)
}

function clearUserPartOverrides(data: FontData): void {
  for (const schema of Object.values(data.layoutSchemas)) delete schema.userPartOverrides
}

function overrideFor(layoutIndex: number, partIndex: number): PartOverride {
  const seed = (layoutIndex + 1) * 10 + partIndex + 1
  return {
    top: seed / 10_000,
    bottom: -seed / 20_000,
    left: seed / 25_000,
    right: -seed / 50_000,
  }
}

function seedEveryLayoutOverride(data: FontData): Record<LayoutType, LayoutSchema['userPartOverrides']> {
  const expected = {} as Record<LayoutType, LayoutSchema['userPartOverrides']>
  Object.entries(data.layoutSchemas).forEach(([layoutType, schema], layoutIndex) => {
    schema.userPartOverrides = Object.fromEntries(
      schema.slots.map((part, partIndex) => [part, overrideFor(layoutIndex, partIndex)]),
    ) as Partial<Record<Part, PartOverride>>
    expected[layoutType as LayoutType] = structuredClone(schema.userPartOverrides)
  })
  return expected
}

function collectUserPartOverrides(data: FontData): Record<LayoutType, LayoutSchema['userPartOverrides']> {
  return Object.fromEntries(
    Object.entries(data.layoutSchemas).map(([layoutType, schema]) => [
      layoutType,
      structuredClone(schema.userPartOverrides),
    ]),
  ) as Record<LayoutType, LayoutSchema['userPartOverrides']>
}

beforeAll(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', localStorageStub)
  vi.stubGlobal('window', {
    localStorage: localStorageStub,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const bridge = await import('../src/services/fontDataBridge')
  const layoutStore = await import('../src/stores/layoutStore')
  const shapeStore = await import('../src/stores/shapeSystemStore')
  const jamoStore = await import('../src/stores/jamoStore')
  const globalStyleStore = await import('../src/stores/globalStyleStore')
  const historyStore = await import('../src/stores/historyStore')
  const editorHistoryStore = await import('../src/stores/editorHistoryStore')
  collectFontData = bridge.collectFontData
  applyFontData = bridge.applyFontData
  useLayoutStore = layoutStore.useLayoutStore
  useJamoStore = jamoStore.useJamoStore
  useGlobalStyleStore = globalStyleStore.useGlobalStyleStore
  useHistoryStore = historyStore.useHistoryStore
  useEditorHistoryStore = editorHistoryStore.useEditorHistoryStore
  useShapeSystemStore = shapeStore.useShapeSystemStore
  originalFontData = cloneFontData(collectFontData())
})

beforeEach(() => {
  failingStorageKey = null
  applyFontData(cloneFontData(originalFontData))
  vi.clearAllTimers()
  storageValues.clear()
})

afterEach(() => {
  failingStorageKey = null
  applyFontData(cloneFontData(originalFontData))
  vi.clearAllTimers()
  storageValues.clear()
})

afterAll(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('FontData 레이아웃 저장 계약', () => {
  it('모든 레이아웃의 userPartOverrides를 JSON round-trip 뒤 exact 보존한다', () => {
    const source = cloneFontData(originalFontData)
    const expectedOverrides = seedEveryLayoutOverride(source)
    applyFontData(source)

    const serialized = JSON.stringify(collectFontData())
    const parsed = JSON.parse(serialized) as FontData
    expect(parsed.version).toBe('1.4.0')

    applyFontData(parsed)
    const roundTripped = collectFontData()
    expect(collectUserPartOverrides(roundTripped)).toEqual(expectedOverrides)
    expect(roundTripped.layoutSchemas).toEqual(parsed.layoutSchemas)
  })

  it('프로젝트 A 다음 B를 적용하면 A의 override가 B에 잔류하지 않는다', () => {
    const projectA = cloneFontData(originalFontData)
    clearUserPartOverrides(projectA)
    projectA.layoutSchemas['choseong-jungseong-vertical'].userPartOverrides = {
      CH: { top: 0.011, bottom: -0.012, left: 0.013, right: -0.014 },
      JU: { top: -0.021, bottom: 0.022, left: -0.023, right: 0.024 },
    }
    projectA.layoutSchemas['choseong-jungseong-horizontal'].userPartOverrides = {
      CH: { top: 0.031, bottom: 0.032, left: 0.033, right: 0.034 },
    }

    const projectB = cloneFontData(originalFontData)
    clearUserPartOverrides(projectB)
    projectB.layoutSchemas['choseong-jungseong-mixed'].userPartOverrides = {
      JU_H: { top: 0.041, bottom: -0.042, left: 0.043, right: -0.044 },
      JU_V: { top: -0.051, bottom: 0.052, left: -0.053, right: 0.054 },
    }

    applyFontData(projectA)
    expect(useLayoutStore.getState().layoutSchemas['choseong-jungseong-vertical'].userPartOverrides)
      .toEqual(projectA.layoutSchemas['choseong-jungseong-vertical'].userPartOverrides)

    applyFontData(projectB)
    const afterB = collectFontData()
    expect(afterB.layoutSchemas).toEqual(projectB.layoutSchemas)
    expect(afterB.layoutSchemas['choseong-jungseong-vertical'].userPartOverrides).toBeUndefined()
    expect(afterB.layoutSchemas['choseong-jungseong-horizontal'].userPartOverrides).toBeUndefined()
    expect(afterB.layoutSchemas['choseong-jungseong-mixed'].userPartOverrides)
      .toEqual(projectB.layoutSchemas['choseong-jungseong-mixed'].userPartOverrides)
  })

  it('파생 layoutConfigs를 FontData와 직렬화 JSON에 포함하지 않는다', () => {
    const data = collectFontData()
    const serialized = JSON.stringify(data)
    const parsed = JSON.parse(serialized) as Record<string, unknown>

    expect(useLayoutStore.getState().layoutConfigs).toBeDefined()
    expect(data).not.toHaveProperty('layoutConfigs')
    expect(parsed).not.toHaveProperty('layoutConfigs')
    expect(serialized).not.toContain('"layoutConfigs"')
    expect(Object.keys(parsed).sort()).toEqual([
      'globalPadding',
      'globalStyle',
      'jamoData',
      'layoutSchemas',
      'paddingOverrides',
      'version',
    ])
  })

  it('1.2 payload를 기존 필드 손실 없이 1.4로 한 번만 이관한다', () => {
    const legacy = structuredClone(originalFontData) as unknown as FontDataV1_2
    legacy.version = '1.2.0'
    const before = structuredClone(legacy)
    const first = parseAndMigrateFontData(legacy)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.migratedFrom).toBe('1.2.0')
    expect(first.data.version).toBe('1.4.0')
    expect(first.data).not.toHaveProperty('shapeSystem')
    expect({ ...first.data, version: '1.2.0' }).toEqual(legacy)
    expect(legacy).toEqual(before)
    expect(parseAndMigrateFontData(first.data)).toEqual({ ok: true, data: first.data })
  })

  it('1.3 Shape v1을 1.4 Shape v2의 명시적 null/null 상태로 이관한다', () => {
    const legacy = structuredClone(originalFontData) as unknown as FontDataV1_3
    legacy.version = '1.3.0'
    legacy.shapeSystem = shapeEnvelopeV1()
    const before = structuredClone(legacy)
    const result = parseAndMigrateFontData(legacy)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migratedFrom).toBe('1.3.0')
    expect(result.data.version).toBe('1.4.0')
    expect(result.data.shapeSystem?.version).toBe(2)
    expect(result.data.shapeSystem?.layoutGridSystem).toBeNull()
    expect(result.data.shapeSystem?.contextPresetCatalog).toBeNull()
    expect(result.data.shapeSystem?.roleSources).toEqual(legacy.shapeSystem.roleSources)
    expect(legacy).toEqual(before)
    expect(parseAndMigrateFontData(result.data)).toEqual({ ok: true, data: result.data })
  })

  it('1.2의 명시적 legacy stroke·render mode만 canonical 1.4로 변환한다', () => {
    const legacy = structuredClone(originalFontData) as unknown as FontDataV1_2
    legacy.version = '1.2.0'
    legacy.jamoData.choseong['ㄱ'].strokes = [{
      id: 'legacy-horizontal', direction: 'horizontal', x: 0.5, y: 0.5,
      width: 0.8, thickness: 0.1, angle: 0,
    }] as unknown as FontDataV1_2['jamoData']['choseong'][string]['strokes']
    legacy.globalStyle.style.strokeStyle = { mode: 'grid-system-2' } as unknown as FontDataV1_2['globalStyle']['style']['strokeStyle']
    legacy.jamoData.choseong['ㄱ'].overrides = [{
      id: 'legacy-conditions',
      conditions: [{ type: 'jungseongIs', jamo: 'ㅏ' }],
      variant: {}, priority: 1, enabled: true,
    }] as unknown as NonNullable<FontDataV1_2['jamoData']['choseong'][string]['overrides']>
    const parsed = parseAndMigrateFontData(legacy)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.jamoData.choseong['ㄱ'].strokes?.[0]).toEqual(expect.objectContaining({
      id: 'legacy-horizontal', points: expect.any(Array), closed: false, thickness: 0.1,
    }))
    expect(parsed.data.globalStyle.style.strokeStyle).toEqual({ mode: 'legacy-snapped-centerline' })
    expect(parsed.data.jamoData.choseong['ㄱ'].overrides?.[0]).toEqual(expect.objectContaining({
      conditionGroups: [[{ type: 'jungseongIs', jamo: 'ㅏ' }]],
    }))
    expect(parsed.data.jamoData.choseong['ㄱ'].overrides?.[0]).not.toHaveProperty('conditions')
  })

  it('크기 정보가 없는 1.2 legacy rect/path를 NaN canonical stroke로 만들지 않는다', () => {
    for (const stroke of [
      { id: 'bad-rect', direction: 'horizontal', x: 0, y: 0, width: 1 },
      { id: 'bad-path', direction: 'path', x: 0, y: 0, width: 1, pathData: { points: [], closed: false } },
    ]) {
      const legacy = structuredClone(originalFontData) as unknown as FontDataV1_2
      legacy.version = '1.2.0'
      legacy.jamoData.choseong['ㄱ'].strokes = [stroke] as unknown as FontDataV1_2['jamoData']['choseong'][string]['strokes']
      expect(parseAndMigrateFontData(legacy).ok).toBe(false)
    }
  })

  it('누락·future·unknown field와 손상 Shape System을 path issue로 차단한다', () => {
    const missingVersion = cloneFontData(originalFontData) as unknown as Record<string, unknown>
    delete missingVersion.version
    const futureField = { ...cloneFontData(originalFontData), future: true }
    const invalidShape = cloneFontData(originalFontData)
    invalidShape.shapeSystem = shapeEnvelope()
    delete (invalidShape.shapeSystem!.roleSources as unknown as Record<string, unknown>).JO

    for (const [value, path] of [
      [missingVersion, '$.version'],
      [futureField, '$.future'],
      [invalidShape, '$.shapeSystem.roleSources.JO'],
    ] as const) {
      const result = parseAndMigrateFontData(value)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues.map((entry) => entry.path)).toContain(path)
    }
  })

  it('빈 레이아웃·padding·style과 null JamoData를 1.4로 승격하지 않는다', () => {
    const cases = [
      (data: FontData) => { data.layoutSchemas = {} as FontData['layoutSchemas'] },
      (data: FontData) => { data.layoutSchemas['choseong-only'].slots = [] },
      (data: FontData) => { data.globalPadding = {} as FontData['globalPadding'] },
      (data: FontData) => { data.globalStyle.style = {} as FontData['globalStyle']['style'] },
      (data: FontData) => { data.jamoData.jungseong = {} },
      (data: FontData) => {
        const key = Object.keys(data.jamoData.choseong)[0]
        data.jamoData.choseong[key] = null as unknown as FontData['jamoData']['choseong'][string]
      },
    ]
    const before = collectFontData()
    for (const mutate of cases) {
      const invalid = cloneFontData(before)
      mutate(invalid)
      expect(parseAndMigrateFontData(invalid).ok).toBe(false)
      expect(applyFontData(invalid)).toEqual(expect.objectContaining({ ok: false }))
      expect(collectFontData()).toEqual(before)
    }
  })

  it('동일 owner 안의 중복 안정 ID를 정확한 두 번째 경로에서 차단한다', () => {
    const baseStroke = structuredClone(originalFontData.jamoData.choseong['ㄱ'].strokes![0])
    const layoutOverride = {
      id: 'duplicate-layout-override',
      conditionGroups: [[{ type: 'layoutIs' as const, layout: 'choseong-only' as const }]],
      partOverrides: { CH: overrideFor(0, 0) },
      priority: 1,
      enabled: true,
    }
    const gap = {
      id: 'duplicate-layout-gap',
      axis: 'x' as const,
      before: ['CH' as const],
      after: ['JU' as const],
      size: 0.01,
      anchor: 'center' as const,
    }
    const jamoOverride = {
      id: 'duplicate-jamo-override',
      conditionGroups: [[{ type: 'jungseongIs' as const, jamo: 'ㅏ' }]],
      variant: {},
      priority: 1,
      enabled: true,
    }

    const cases: Array<{ path: string; mutate: (data: FontData) => void }> = [
      {
        path: '$.jamoData.choseong.ㄱ.strokes[1].id',
        mutate: (data) => {
          data.jamoData.choseong['ㄱ'].strokes = [baseStroke, structuredClone(baseStroke)]
        },
      },
      {
        path: '$.layoutSchemas.choseong-only.overrides[1].id',
        mutate: (data) => {
          data.layoutSchemas['choseong-only'].overrides = [layoutOverride, structuredClone(layoutOverride)]
        },
      },
      {
        path: '$.layoutSchemas.choseong-jungseong-vertical.gaps[1].id',
        mutate: (data) => {
          data.layoutSchemas['choseong-jungseong-vertical'].gaps = [gap, structuredClone(gap)]
        },
      },
      {
        path: '$.jamoData.choseong.ㄱ.overrides[1].id',
        mutate: (data) => {
          data.jamoData.choseong['ㄱ'].overrides = [jamoOverride, structuredClone(jamoOverride)]
        },
      },
      {
        path: '$.jamoData.choseong.ㄱ.overrides[0].variant.strokes[1].id',
        mutate: (data) => {
          data.jamoData.choseong['ㄱ'].overrides = [{
            ...jamoOverride,
            id: 'variant-stroke-owner',
            variant: { strokes: [baseStroke, structuredClone(baseStroke)] },
          }]
        },
      },
      {
        path: '$.globalStyle.exclusions[1].id',
        mutate: (data) => {
          const exclusion = {
            id: 'duplicate-exclusion',
            property: 'weight' as const,
            layoutType: 'choseong-only' as const,
          }
          data.globalStyle.exclusions = [exclusion, structuredClone(exclusion)]
        },
      },
    ]

    for (const { path, mutate } of cases) {
      const invalid = cloneFontData(originalFontData)
      mutate(invalid)
      const parsed = parseAndMigrateFontData(invalid)
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) {
        expect(parsed.issues).toContainEqual(expect.objectContaining({
          code: 'invalid-field',
          path,
        }))
      }
    }
  })

  it('같은 ID라도 주소 owner가 다르면 1.2 호환 이관을 유지한다', () => {
    const legacy = structuredClone(originalFontData) as unknown as FontDataV1_2
    legacy.version = '1.2.0'
    const firstStroke = structuredClone(legacy.jamoData.choseong['ㄱ'].strokes![0])
    const secondStroke = structuredClone(legacy.jamoData.choseong['ㄴ'].strokes![0])
    firstStroke.id = 'owner-scoped-stroke'
    secondStroke.id = 'owner-scoped-stroke'
    legacy.jamoData.choseong['ㄱ'].strokes = [firstStroke]
    legacy.jamoData.choseong['ㄴ'].strokes = [secondStroke]

    const sharedOverride = {
      id: 'owner-scoped-override',
      conditionGroups: [[{ type: 'layoutIs' as const, layout: 'choseong-only' as const }]],
      partOverrides: { CH: overrideFor(0, 0) },
      priority: 1,
      enabled: true,
    }
    legacy.layoutSchemas['choseong-only'].overrides = [sharedOverride]
    legacy.layoutSchemas['choseong-jungseong-vertical'].overrides = [{
      ...structuredClone(sharedOverride),
      conditionGroups: [[{ type: 'layoutIs', layout: 'choseong-jungseong-vertical' }]],
    }]

    const parsed = parseAndMigrateFontData(legacy)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migratedFrom).toBe('1.2.0')
    expect(parsed.data.jamoData.choseong['ㄱ'].strokes?.[0].id).toBe('owner-scoped-stroke')
    expect(parsed.data.jamoData.choseong['ㄴ'].strokes?.[0].id).toBe('owner-scoped-stroke')
  })

  it('Shape System source만 1.3에 저장하고 A 다음 1.2·미연결 B에서 완전히 지운다', () => {
    const projectA = cloneFontData(originalFontData)
    projectA.shapeSystem = shapeEnvelope()
    expect(applyFontData(projectA)).toEqual(expect.objectContaining({ ok: true }))
    expect(collectFontData().shapeSystem).toEqual(projectA.shapeSystem)
    expect(useShapeSystemStore.getState().source).toEqual(projectA.shapeSystem)
    expect(useShapeSystemStore.getState().past).toEqual([])
    expect(useShapeSystemStore.getState().future).toEqual([])

    const projectB = cloneFontData(originalFontData)
    delete projectB.shapeSystem
    const legacyB = structuredClone(projectB) as unknown as FontDataV1_2
    legacyB.version = '1.2.0'
    expect(applyFontData(legacyB)).toEqual(expect.objectContaining({ ok: true }))
    expect(useShapeSystemStore.getState().source).toBeNull()
    expect(collectFontData()).not.toHaveProperty('shapeSystem')

    applyFontData(projectA)
    expect(applyFontData(projectB)).toEqual(expect.objectContaining({ ok: true }))
    expect(useShapeSystemStore.getState().source).toBeNull()
  })

  it('layout grid와 context catalog가 채워진 Shape v2를 collect/apply/collect에서 exact 보존한다', () => {
    const project = cloneFontData(originalFontData)
    project.shapeSystem = createConnectedShapeSystemV2Fixture()
    expect(applyFontData(project)).toEqual(expect.objectContaining({ ok: true }))

    const first = collectFontData()
    const serialized = JSON.stringify(first)
    expect(first.shapeSystem).toEqual(project.shapeSystem)
    expect(first.shapeSystem?.layoutGridSystem).not.toBeNull()
    expect(first.shapeSystem?.contextPresetCatalog).not.toBeNull()
    expect(useShapeSystemStore.getState().past).toEqual([])
    expect(useShapeSystemStore.getState().future).toEqual([])

    expect(applyFontData(JSON.parse(serialized))).toEqual(expect.objectContaining({ ok: true }))
    expect(collectFontData()).toEqual(first)
    for (const forbidden of ['resolvedGrid', 'stableSplits', 'provenance', 'history']) {
      expect(serialized).not.toContain(`"${forbidden}"`)
    }
  })

  it('손상되거나 미래 version인 입력은 어떤 store도 바꾸지 않는다', () => {
    const seeded = cloneFontData(originalFontData)
    seeded.shapeSystem = shapeEnvelope()
    applyFontData(seeded)
    const before = collectFontData()
    const shapeBefore = structuredClone(useShapeSystemStore.getState().source)
    const invalid = { ...before, version: '9.0.0', future: true }
    expect(applyFontData(invalid)).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'invalid-font-data' }),
    }))
    expect(collectFontData()).toEqual(before)
    expect(useShapeSystemStore.getState().source).toEqual(shapeBefore)
  })

  it('중간 store 적용이 예외를 내면 앞서 바뀐 store까지 exact rollback한다', () => {
    const before = collectFontData()
    const target = cloneFontData(before)
    target.globalPadding.left = 0.123
    const originalLoad = useJamoStore.getState().loadFontData
    useJamoStore.setState({ loadFontData: () => { throw new Error('injected jamo failure') } })
    try {
      expect(applyFontData(target)).toEqual({
        ok: false,
        error: { code: 'apply-failed', message: 'injected jamo failure' },
      })
      expect(collectFontData()).toEqual(before)
    } finally {
      useJamoStore.setState({ loadFontData: originalLoad })
    }
  })

  it('마지막 style 단계 실패도 layout·jamo·history·persist 결과를 모두 복원한다', () => {
    const before = collectFontData()
    applyFontData(before)
    const editorEntry = { id: 'editor-history:A', createdAt: '2026-08-24T00:00:00.000Z' } as EditorHistoryEntry
    useEditorHistoryStore.setState({ entries: [editorEntry], undoEntryIds: [editorEntry.id] })
    vi.advanceTimersByTime(300)
    const storageBefore = new Map(storageValues)
    useHistoryStore.getState().pushSnapshot()
    const historyBefore = structuredClone({
      undoStack: useHistoryStore.getState().undoStack,
      redoStack: useHistoryStore.getState().redoStack,
    })
    const editorHistoryBefore = structuredClone({
      entries: useEditorHistoryStore.getState().entries,
      undoEntryIds: useEditorHistoryStore.getState().undoEntryIds,
    })
    const target = cloneFontData(before)
    target.globalPadding.top = 0.321
    const firstJamo = Object.keys(target.jamoData.choseong)[0]
    target.jamoData.choseong[firstJamo].strokes![0].thickness += 0.001
    const originalLoad = useGlobalStyleStore.getState().loadFontData
    useGlobalStyleStore.setState({ loadFontData: () => { throw new Error('injected style failure') } })
    try {
      expect(applyFontData(target)).toEqual({
        ok: false,
        error: { code: 'apply-failed', message: 'injected style failure' },
      })
      vi.advanceTimersByTime(300)
      expect(collectFontData()).toEqual(before)
      expect(useHistoryStore.getState().undoStack).toEqual(historyBefore.undoStack)
      expect(useHistoryStore.getState().redoStack).toEqual(historyBefore.redoStack)
      expect(useEditorHistoryStore.getState().entries).toEqual(editorHistoryBefore.entries)
      expect(useEditorHistoryStore.getState().undoEntryIds).toEqual(editorHistoryBefore.undoEntryIds)
      expect(storageValues).toEqual(storageBefore)
    } finally {
      useGlobalStyleStore.setState({ loadFontData: originalLoad })
      useHistoryStore.getState().clear()
      useEditorHistoryStore.getState().clear()
    }
  })

  it('persist write가 apply와 rollback에서 계속 실패해도 모든 store와 history를 복원하고 result를 반환한다', () => {
    const before = collectFontData()
    applyFontData(before)
    const editorEntry = { id: 'editor-history:persist-failure', createdAt: '2026-08-24T00:00:00.000Z' } as EditorHistoryEntry
    useEditorHistoryStore.setState({ entries: [editorEntry], undoEntryIds: [editorEntry.id] })
    useHistoryStore.getState().pushSnapshot()
    vi.advanceTimersByTime(300)
    const storageBefore = new Map(storageValues)
    const historyBefore = structuredClone({
      undoStack: useHistoryStore.getState().undoStack,
      redoStack: useHistoryStore.getState().redoStack,
    })
    const editorHistoryBefore = structuredClone({
      entries: useEditorHistoryStore.getState().entries,
      undoEntryIds: useEditorHistoryStore.getState().undoEntryIds,
    })
    const shapeBefore = structuredClone({
      source: useShapeSystemStore.getState().source,
      hydrationStatus: useShapeSystemStore.getState().hydrationStatus,
      hydrationIssues: useShapeSystemStore.getState().hydrationIssues,
      past: useShapeSystemStore.getState().past,
      future: useShapeSystemStore.getState().future,
    })

    const target = cloneFontData(before)
    target.globalPadding.left += 0.001
    target.jamoData.choseong['ㄱ'].strokes![0].thickness += 0.001
    target.globalStyle.style.weight += 100
    target.shapeSystem = shapeEnvelope()
    failingStorageKey = 'font-maker-editor-v2-history'

    const result = applyFontData(target)

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'apply-failed',
        message: expect.stringContaining('injected persist failure'),
      }),
    }))
    expect(collectFontData()).toEqual(before)
    expect(useShapeSystemStore.getState()).toEqual(expect.objectContaining(shapeBefore))
    expect(useHistoryStore.getState().undoStack).toEqual(historyBefore.undoStack)
    expect(useHistoryStore.getState().redoStack).toEqual(historyBefore.redoStack)
    expect(useEditorHistoryStore.getState().entries).toEqual(editorHistoryBefore.entries)
    expect(useEditorHistoryStore.getState().undoEntryIds).toEqual(editorHistoryBefore.undoEntryIds)

    failingStorageKey = null
    vi.advanceTimersByTime(300)
    expect(storageValues).toEqual(storageBefore)
  })

  it('Shape A를 지우는 프로젝트 B의 지연 저장이 실패하면 메모리와 durable raw를 A로 복원한다', () => {
    const projectA = cloneFontData(originalFontData)
    projectA.shapeSystem = shapeEnvelope()
    expect(applyFontData(projectA)).toEqual(expect.objectContaining({ ok: true }))
    const storageBefore = new Map(storageValues)
    const sourceBefore = structuredClone(useShapeSystemStore.getState().source)

    const projectB = cloneFontData(originalFontData)
    delete projectB.shapeSystem
    failingStorageKey = 'font-maker-shape-system-v1'
    const result = applyFontData(projectB)

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'apply-failed',
        message: expect.stringContaining('injected persist failure'),
      }),
    }))
    expect(useShapeSystemStore.getState().source).toEqual(sourceBefore)
    expect(collectFontData().shapeSystem).toEqual(projectA.shapeSystem)
    expect(storageValues).toEqual(storageBefore)
  })

  it('성공한 프로젝트 적용은 이전 layout/jamo session history를 지운다', () => {
    useHistoryStore.getState().pushSnapshot()
    const editorEntry = { id: 'editor-history:clear', createdAt: '2026-08-24T00:00:00.000Z' } as EditorHistoryEntry
    useEditorHistoryStore.setState({ entries: [editorEntry], undoEntryIds: [editorEntry.id] })
    expect(useHistoryStore.getState().canUndo()).toBe(true)
    expect(applyFontData(cloneFontData(originalFontData))).toEqual(expect.objectContaining({ ok: true }))
    expect(useHistoryStore.getState().undoStack).toEqual([])
    expect(useHistoryStore.getState().redoStack).toEqual([])
    expect(useEditorHistoryStore.getState().entries).toEqual([])
    expect(useEditorHistoryStore.getState().undoEntryIds).toEqual([])
  })

  it('Shape System hydration이 차단되면 다른 store를 적용하기 전에 전체를 거부한다', () => {
    const before = collectFontData()
    const target = cloneFontData(before)
    target.globalPadding.right = 0.234
    const shapeBefore = structuredClone({
      source: useShapeSystemStore.getState().source,
      hydrationStatus: useShapeSystemStore.getState().hydrationStatus,
      hydrationIssues: useShapeSystemStore.getState().hydrationIssues,
      past: useShapeSystemStore.getState().past,
      future: useShapeSystemStore.getState().future,
    })
    useShapeSystemStore.setState({ hydrationStatus: 'blocked', hydrationIssues: ['fixture'] })
    try {
      expect(applyFontData(target)).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'shape-system-blocked' }),
      }))
      expect(useLayoutStore.getState().globalPadding).toEqual(before.globalPadding)
    } finally {
      useShapeSystemStore.setState(shapeBefore)
    }
  })

  it('Shape System 파생값과 session history를 FontData에 넣지 않는다', () => {
    const data = cloneFontData(originalFontData)
    data.shapeSystem = shapeEnvelope()
    applyFontData(data)
    const serialized = JSON.stringify(collectFontData())
    for (const forbidden of ['past', 'future', 'provenance', 'resolvedPartGrid', 'InkRegion']) {
      expect(serialized).not.toContain(`"${forbidden}"`)
    }
  })
})
