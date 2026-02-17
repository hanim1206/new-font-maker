import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { LayoutType, BoxConfig, LayoutSchema, Part, Padding, PartOverride } from '../types'
import { DEFAULT_LAYOUT_CONFIGS, type LayoutConfig } from '../data/layoutConfigs'
import { calculateBoxes, DEFAULT_LAYOUT_SCHEMAS as CALC_SCHEMAS, BASE_PRESETS_SCHEMAS } from '../utils/layoutCalculator'

const STORAGE_KEY = 'font-maker-layout-schemas'

// 글로벌 패딩 기본값
const DEFAULT_GLOBAL_PADDING: Padding = {
  top: 0.075,
  bottom: 0.075,
  left: 0.075,
  right: 0.075,
}

interface LayoutState {
  // 레이아웃 타입별 스키마 (Split + Padding 기반)
  layoutSchemas: Record<LayoutType, LayoutSchema>
  // 레이아웃 타입별 설정 (호환성 - 계산된 boxes)
  layoutConfigs: Record<LayoutType, LayoutConfig>
  // 글로벌 패딩 (전체 레이아웃 기본값)
  globalPadding: Padding
  // 레이아웃별 패딩 오버라이드 (글로벌과 다르게 적용할 레이아웃)
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
  // hydration 완료 여부
  _hydrated: boolean
}

interface LayoutActions {
  // ===== Schema 기반 API (새로운 방식) =====

  // 레이아웃 스키마 조회
  getLayoutSchema: (layoutType: LayoutType) => LayoutSchema

  // Split 값 업데이트
  updateSplit: (layoutType: LayoutType, splitIndex: number, value: number) => void

  // Padding 값 업데이트
  updatePadding: (
    layoutType: LayoutType,
    side: 'top' | 'bottom' | 'left' | 'right',
    value: number
  ) => void

  // 계산된 박스 조회
  getCalculatedBoxes: (layoutType: LayoutType) => Partial<Record<Part, BoxConfig>>

  // 스키마 리셋
  resetLayoutSchema: (layoutType: LayoutType) => void
  resetAllLayoutSchemas: () => void

  // ===== 글로벌 패딩 API =====

  // 글로벌 패딩 업데이트
  updateGlobalPadding: (side: keyof Padding, value: number) => void

  // 레이아웃별 패딩 오버라이드 설정
  setPaddingOverride: (layoutType: LayoutType, side: keyof Padding, value: number) => void

  // 레이아웃별 패딩 오버라이드 제거
  removePaddingOverride: (layoutType: LayoutType) => void

  // 특정 레이아웃의 실효 패딩 계산 (글로벌 + 오버라이드 머지)
  getEffectivePadding: (layoutType: LayoutType) => Padding

  // 특정 레이아웃에 오버라이드가 설정되어 있는지
  hasPaddingOverride: (layoutType: LayoutType) => boolean

  // ===== 파트 오버라이드 API =====

  // 파트별 박스 오프셋 업데이트
  updatePartOverride: (
    layoutType: LayoutType,
    part: Part,
    side: keyof PartOverride,
    value: number
  ) => void

  // 특정 파트 오버라이드 제거
  resetPartOverride: (layoutType: LayoutType, part: Part) => void

  // 전체 파트 오버라이드 제거
  resetAllPartOverrides: (layoutType: LayoutType) => void

  // ===== 프리셋 관리 API (신규) =====

  // basePresets.json과 비교하여 변경 여부 확인
  isModified: () => boolean

  // 특정 레이아웃의 변경 여부 확인
  isLayoutModified: (layoutType: LayoutType) => boolean

  // 현재 상태를 JSON 문자열로 내보내기
  exportSchemas: () => string

  // basePresets.json 기본값으로 초기화
  resetToBasePresets: () => void

  // hydration 완료 표시
  setHydrated: () => void

  // ===== 레거시 API (호환성 유지) =====

  // 레이아웃 설정 조회
  getLayoutConfig: (layoutType: LayoutType) => LayoutConfig

  // 레이아웃 설정 업데이트
  updateLayoutConfig: (layoutType: LayoutType, boxes: LayoutConfig['boxes']) => void

  // 특정 박스만 업데이트
  updateBox: (layoutType: LayoutType, part: keyof LayoutConfig['boxes'], box: BoxConfig) => void

  // 기본값으로 리셋
  resetLayoutConfig: (layoutType: LayoutType) => void
  resetAllLayoutConfigs: () => void
}

// 실효 패딩 계산 (글로벌 + 오버라이드 머지)
function computeEffectivePadding(state: LayoutState, layoutType: LayoutType): Padding {
  const override = state.paddingOverrides[layoutType]
  if (!override) return { ...state.globalPadding }
  return { ...state.globalPadding, ...override }
}

// 스키마에서 계산된 boxes로 config 동기화 (글로벌 패딩 적용)
function syncConfigFromSchema(
  state: LayoutState,
  layoutType: LayoutType
): void {
  const schema = state.layoutSchemas[layoutType]
  // 실효 패딩을 스키마에 반영하여 계산
  const effectivePadding = computeEffectivePadding(state, layoutType)
  const schemaWithPadding = { ...schema, padding: effectivePadding }
  const boxes = calculateBoxes(schemaWithPadding)
  state.layoutConfigs[layoutType] = {
    layoutType,
    boxes: boxes as LayoutConfig['boxes'],
  }
}

// 모든 레이아웃의 config를 재동기화
function syncAllConfigs(state: LayoutState): void {
  Object.keys(state.layoutSchemas).forEach((lt) => {
    syncConfigFromSchema(state, lt as LayoutType)
  })
}

// 깊은 복사 헬퍼 (JSON 기반)
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export const useLayoutStore = create<LayoutState & LayoutActions>()(
  persist(
    immer((set, get) => ({
      // 초기 상태
      layoutSchemas: deepClone(CALC_SCHEMAS),
      layoutConfigs: { ...DEFAULT_LAYOUT_CONFIGS },
      globalPadding: { ...DEFAULT_GLOBAL_PADDING },
      paddingOverrides: {},
      _hydrated: false,

      // ===== Schema 기반 API =====

      getLayoutSchema: (layoutType) => {
        return get().layoutSchemas[layoutType]
      },

      updateSplit: (layoutType, splitIndex, value) =>
        set((state) => {
          const schema = state.layoutSchemas[layoutType]
          if (schema.splits && splitIndex < schema.splits.length) {
            schema.splits[splitIndex].value = value
            syncConfigFromSchema(state, layoutType)
          }
        }),

      updatePadding: (layoutType, side, value) =>
        set((state) => {
          const schema = state.layoutSchemas[layoutType]
          if (!schema.padding) {
            schema.padding = { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 }
          }
          schema.padding[side] = value
          syncConfigFromSchema(state, layoutType)
        }),

      getCalculatedBoxes: (layoutType) => {
        const schema = get().layoutSchemas[layoutType]
        return calculateBoxes(schema)
      },

      resetLayoutSchema: (layoutType) =>
        set((state) => {
          state.layoutSchemas[layoutType] = deepClone(BASE_PRESETS_SCHEMAS[layoutType])
          syncConfigFromSchema(state, layoutType)
        }),

      resetAllLayoutSchemas: () =>
        set((state) => {
          state.layoutSchemas = deepClone(BASE_PRESETS_SCHEMAS)
          syncAllConfigs(state)
        }),

      // ===== 글로벌 패딩 API =====

      updateGlobalPadding: (side, value) =>
        set((state) => {
          state.globalPadding[side] = value
          // 모든 레이아웃의 config 재계산
          syncAllConfigs(state)
        }),

      setPaddingOverride: (layoutType, side, value) =>
        set((state) => {
          if (!state.paddingOverrides[layoutType]) {
            state.paddingOverrides[layoutType] = {}
          }
          state.paddingOverrides[layoutType]![side] = value
          syncConfigFromSchema(state, layoutType)
        }),

      removePaddingOverride: (layoutType) =>
        set((state) => {
          delete state.paddingOverrides[layoutType]
          syncConfigFromSchema(state, layoutType)
        }),

      getEffectivePadding: (layoutType) => {
        const state = get()
        const override = state.paddingOverrides[layoutType]
        if (!override) return { ...state.globalPadding }
        return { ...state.globalPadding, ...override }
      },

      hasPaddingOverride: (layoutType) => {
        return !!get().paddingOverrides[layoutType]
      },

      // ===== 파트 오버라이드 API =====

      updatePartOverride: (layoutType, part, side, value) =>
        set((state) => {
          const schema = state.layoutSchemas[layoutType]
          if (!schema.partOverrides) {
            schema.partOverrides = {}
          }
          if (!schema.partOverrides[part]) {
            schema.partOverrides[part] = { top: 0, bottom: 0, left: 0, right: 0 }
          }
          schema.partOverrides[part]![side] = value
          syncConfigFromSchema(state, layoutType)
        }),

      resetPartOverride: (layoutType, part) =>
        set((state) => {
          const schema = state.layoutSchemas[layoutType]
          if (schema.partOverrides) {
            delete schema.partOverrides[part]
            if (Object.keys(schema.partOverrides).length === 0) {
              delete schema.partOverrides
            }
            syncConfigFromSchema(state, layoutType)
          }
        }),

      resetAllPartOverrides: (layoutType) =>
        set((state) => {
          const schema = state.layoutSchemas[layoutType]
          delete schema.partOverrides
          syncConfigFromSchema(state, layoutType)
        }),

      // ===== 프리셋 관리 API (신규) =====

      isModified: () => {
        const current = get().layoutSchemas
        return JSON.stringify(current) !== JSON.stringify(BASE_PRESETS_SCHEMAS)
      },

      isLayoutModified: (layoutType) => {
        const current = get().layoutSchemas[layoutType]
        const base = BASE_PRESETS_SCHEMAS[layoutType]
        return JSON.stringify(current) !== JSON.stringify(base)
      },

      exportSchemas: () => {
        return JSON.stringify({
          version: '1.0.0',
          schemas: get().layoutSchemas,
          exportedAt: new Date().toISOString(),
        }, null, 2)
      },

      resetToBasePresets: () =>
        set((state) => {
          state.layoutSchemas = deepClone(BASE_PRESETS_SCHEMAS)
          Object.keys(state.layoutSchemas).forEach((lt) => {
            syncConfigFromSchema(state, lt as LayoutType)
          })
        }),

      setHydrated: () => set({ _hydrated: true }),

      // ===== 레거시 API (호환성) =====

      getLayoutConfig: (layoutType) => {
        return get().layoutConfigs[layoutType]
      },

      updateLayoutConfig: (layoutType, boxes) =>
        set((state) => {
          state.layoutConfigs[layoutType].boxes = boxes
        }),

      updateBox: (layoutType, part, box) =>
        set((state) => {
          if (part && box) {
            state.layoutConfigs[layoutType].boxes[part] = box
          }
        }),

      resetLayoutConfig: (layoutType) =>
        set((state) => {
          state.layoutConfigs[layoutType] = { ...DEFAULT_LAYOUT_CONFIGS[layoutType] }
        }),

      resetAllLayoutConfigs: () =>
        set((state) => {
          state.layoutConfigs = { ...DEFAULT_LAYOUT_CONFIGS }
        }),
    })),
    {
      name: STORAGE_KEY,
      // layoutSchemas + 패딩 설정 저장 (layoutConfigs는 계산값이라 저장 불필요)
      partialize: (state) => ({
        layoutSchemas: state.layoutSchemas,
        globalPadding: state.globalPadding,
        paddingOverrides: state.paddingOverrides,
      }),
      // hydration 완료 시 콜백
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Layout store hydration failed:', error)
        }
        if (state) {
          // hydration 후 layoutConfigs 동기화 (글로벌 패딩 적용)
          if (!state.globalPadding) {
            state.globalPadding = { ...DEFAULT_GLOBAL_PADDING }
          }
          if (!state.paddingOverrides) {
            state.paddingOverrides = {}
          }
          Object.keys(state.layoutSchemas).forEach((lt) => {
            const layoutType = lt as LayoutType
            const schema = state.layoutSchemas[layoutType]
            const override = state.paddingOverrides[layoutType]
            const effectivePadding = override
              ? { ...state.globalPadding, ...override }
              : { ...state.globalPadding }
            const schemaWithPadding = { ...schema, padding: effectivePadding }
            const boxes = calculateBoxes(schemaWithPadding)
            state.layoutConfigs[layoutType] = {
              layoutType,
              boxes: boxes as LayoutConfig['boxes'],
            }
          })
          state.setHydrated()
        }
      },
    }
  )
)
