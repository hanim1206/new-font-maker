import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayoutSchema, LayoutType, Padding } from '../src/types'
import type { LayoutConfig } from '../src/data/layoutConfigs'
import { calculateBoxes } from '../src/utils/layoutCalculator'

const STORAGE_KEY = 'font-maker-layout-schemas'
const TARGET_LAYOUT: LayoutType = 'choseong-jungseong-vertical'
const OTHER_LAYOUT: LayoutType = 'choseong-jungseong-horizontal'
const storageValues = new Map<string, string>()
const localStorageStub = {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key: string) => storageValues.get(key) ?? null,
  key: (index: number) => [...storageValues.keys()][index] ?? null,
  removeItem: (key: string) => { storageValues.delete(key) },
  setItem: (key: string, value: string) => { storageValues.set(key, value) },
}

interface LayoutSnapshot {
  layoutSchemas: Record<LayoutType, LayoutSchema>
  globalPadding: Padding
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
}

interface PersistedLayoutState {
  state: LayoutSnapshot & { layoutConfigs?: Record<LayoutType, LayoutConfig> }
  version: number
}

let useLayoutStore: typeof import('../src/stores/layoutStore').useLayoutStore
let originalState: LayoutSnapshot

type LayoutStoreHook = typeof import('../src/stores/layoutStore').useLayoutStore
type LayoutStoreState = ReturnType<LayoutStoreHook['getState']>
type ForbiddenDerivedWriter = Extract<
  keyof LayoutStoreState,
  'updateLayoutConfig' | 'updateBox' | 'resetLayoutConfig' | 'resetAllLayoutConfigs'
>
const DERIVED_WRITERS_ARE_NOT_PUBLIC: ForbiddenDerivedWriter extends never ? true : never = true

function clone<T>(value: T): T {
  return structuredClone(value)
}

function restoreOriginalState(): void {
  useLayoutStore.getState().loadFontData(clone(originalState))
  vi.clearAllTimers()
  storageValues.clear()
}

function flushPersistedState(): PersistedLayoutState {
  vi.advanceTimersByTime(300)
  const raw = storageValues.get(STORAGE_KEY)
  if (!raw) throw new Error('레이아웃 저장 payload가 기록되지 않았습니다.')
  return JSON.parse(raw) as PersistedLayoutState
}

beforeAll(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', localStorageStub)
  vi.stubGlobal('window', {
    localStorage: localStorageStub,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const layoutStore = await import('../src/stores/layoutStore')
  useLayoutStore = layoutStore.useLayoutStore
  const state = useLayoutStore.getState()
  originalState = {
    layoutSchemas: clone(state.layoutSchemas),
    globalPadding: clone(state.globalPadding),
    paddingOverrides: clone(state.paddingOverrides),
  }
})

beforeEach(restoreOriginalState)
afterEach(restoreOriginalState)

afterAll(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('layoutStore 사용자 보정 전체 교체', () => {
  it('파생 layoutConfigs의 직접 쓰기 API를 노출하지 않는다', () => {
    const state = useLayoutStore.getState() as unknown as Record<string, unknown>

    expect(DERIVED_WRITERS_ARE_NOT_PUBLIC).toBe(true)
    expect(state).not.toHaveProperty('updateLayoutConfig')
    expect(state).not.toHaveProperty('updateBox')
    expect(state).not.toHaveProperty('resetLayoutConfig')
    expect(state).not.toHaveProperty('resetAllLayoutConfigs')
  })

  it('입력을 deep clone하고 대상 config만 즉시 다시 계산해 저장한다', () => {
    const beforeTarget = clone(useLayoutStore.getState().layoutSchemas[TARGET_LAYOUT])
    const beforeOther = clone(useLayoutStore.getState().layoutSchemas[OTHER_LAYOUT])
    const beforeOtherConfig = clone(useLayoutStore.getState().layoutConfigs[OTHER_LAYOUT])
    const overrides: NonNullable<LayoutSchema['userPartOverrides']> = {
      CH: { top: 0.011, bottom: -0.012, left: 0.013, right: -0.014 },
      JU: { top: -0.021, bottom: 0.022, left: -0.023, right: 0.024 },
    }

    useLayoutStore.getState().setUserPartOverrides(TARGET_LAYOUT, overrides)
    overrides.CH!.top = 0.9

    const state = useLayoutStore.getState()
    expect(state.layoutSchemas[TARGET_LAYOUT]).toEqual({
      ...beforeTarget,
      userPartOverrides: {
        CH: { top: 0.011, bottom: -0.012, left: 0.013, right: -0.014 },
        JU: { top: -0.021, bottom: 0.022, left: -0.023, right: 0.024 },
      },
    })
    expect(state.layoutSchemas[OTHER_LAYOUT]).toEqual(beforeOther)
    expect(state.layoutConfigs[OTHER_LAYOUT]).toEqual(beforeOtherConfig)

    const effectivePadding = state.getEffectivePadding(TARGET_LAYOUT)
    const expectedBoxes = calculateBoxes({ ...state.layoutSchemas[TARGET_LAYOUT], padding: effectivePadding })
    expect(state.layoutConfigs[TARGET_LAYOUT]).toEqual({
      layoutType: TARGET_LAYOUT,
      boxes: expectedBoxes,
    })

    const persisted = flushPersistedState()
    expect(persisted.state.layoutSchemas[TARGET_LAYOUT].userPartOverrides)
      .toEqual(state.layoutSchemas[TARGET_LAYOUT].userPartOverrides)
    expect(persisted.state.layoutSchemas[OTHER_LAYOUT]).toEqual(beforeOther)
    expect(persisted.state.layoutConfigs).toBeUndefined()
  })

  it.each([
    ['undefined', undefined],
    ['빈 맵', {}],
  ] as const)('%s 입력은 userPartOverrides 필드를 삭제해 정규화한다', (_label, emptyValue) => {
    useLayoutStore.getState().setUserPartOverrides(TARGET_LAYOUT, {
      CH: { top: 0.01, bottom: 0.02, left: 0.03, right: 0.04 },
    })
    useLayoutStore.getState().setUserPartOverrides(TARGET_LAYOUT, emptyValue)

    const state = useLayoutStore.getState()
    const schema = state.layoutSchemas[TARGET_LAYOUT]
    expect(schema.userPartOverrides).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(schema, 'userPartOverrides')).toBe(false)
    const effectivePadding = state.getEffectivePadding(TARGET_LAYOUT)
    expect(state.layoutConfigs[TARGET_LAYOUT]).toEqual({
      layoutType: TARGET_LAYOUT,
      boxes: calculateBoxes({ ...schema, padding: effectivePadding }),
    })

    const persisted = flushPersistedState()
    const persistedSchema = persisted.state.layoutSchemas[TARGET_LAYOUT]
    expect(persistedSchema.userPartOverrides).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(persistedSchema, 'userPartOverrides')).toBe(false)
    expect(persisted.state.layoutConfigs).toBeUndefined()
  })
})
