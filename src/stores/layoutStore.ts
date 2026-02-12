import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { LayoutType, BoxConfig, LayoutSchema, Part } from '../types'
import { DEFAULT_LAYOUT_CONFIGS, type LayoutConfig } from '../data/layoutConfigs'
import { calculateBoxes, DEFAULT_LAYOUT_SCHEMAS as CALC_SCHEMAS, BASE_PRESETS_SCHEMAS } from '../utils/layoutCalculator'

const STORAGE_KEY = 'font-maker-layout-schemas'

interface LayoutState {
  // 레이아웃 타입별 스키마 (Split + Padding 기반)
  layoutSchemas: Record<LayoutType, LayoutSchema>
  // 레이아웃 타입별 설정 (호환성 - 계산된 boxes)
  layoutConfigs: Record<LayoutType, LayoutConfig>
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

// 스키마에서 계산된 boxes로 config 동기화
function syncConfigFromSchema(
  state: LayoutState,
  layoutType: LayoutType
): void {
  const schema = state.layoutSchemas[layoutType]
  const boxes = calculateBoxes(schema)
  state.layoutConfigs[layoutType] = {
    layoutType,
    boxes: boxes as LayoutConfig['boxes'],
  }
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
          Object.keys(state.layoutSchemas).forEach((lt) => {
            syncConfigFromSchema(state, lt as LayoutType)
          })
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
      // layoutSchemas만 저장 (layoutConfigs는 계산값이라 저장 불필요)
      partialize: (state) => ({ layoutSchemas: state.layoutSchemas }),
      // hydration 완료 시 콜백
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Layout store hydration failed:', error)
        }
        if (state) {
          // hydration 후 layoutConfigs 동기화
          Object.keys(state.layoutSchemas).forEach((lt) => {
            const schema = state.layoutSchemas[lt as LayoutType]
            const boxes = calculateBoxes(schema)
            state.layoutConfigs[lt as LayoutType] = {
              layoutType: lt as LayoutType,
              boxes: boxes as LayoutConfig['boxes'],
            }
          })
          state.setHydrated()
        }
      },
    }
  )
)
