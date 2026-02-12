import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { LayoutType } from '../types'

const STORAGE_KEY = 'font-maker-global-style'

// ===== 글로벌 스타일 속성 =====
export interface GlobalStyle {
  slant: number         // 기울기 (도, -30~30, 기본 0)
  weight: number        // 두께 배율 (0.5~2.0, 기본 1.0)
  letterSpacing: number // 자간 (0~0.3, 기본 0)
}

// ===== 레이아웃별 속성 제외 =====
export interface GlobalStyleExclusion {
  id: string
  property: keyof GlobalStyle
  layoutType: LayoutType
}

interface GlobalStyleState {
  style: GlobalStyle
  exclusions: GlobalStyleExclusion[]
  _hydrated: boolean
}

interface GlobalStyleActions {
  // 스타일 속성 업데이트
  updateStyle: (prop: keyof GlobalStyle, value: number) => void

  // 제외 규칙 관리
  addExclusion: (property: keyof GlobalStyle, layoutType: LayoutType) => void
  removeExclusion: (id: string) => void
  hasExclusion: (property: keyof GlobalStyle, layoutType: LayoutType) => boolean

  // 특정 레이아웃에 적용될 실제 스타일 계산
  getEffectiveStyle: (layoutType: LayoutType) => GlobalStyle

  // 리셋
  resetStyle: () => void

  // hydration
  setHydrated: () => void
}

const DEFAULT_STYLE: GlobalStyle = {
  slant: 0,
  weight: 1.0,
  letterSpacing: 0,
}

export const useGlobalStyleStore = create<GlobalStyleState & GlobalStyleActions>()(
  persist(
    immer((set, get) => ({
      style: { ...DEFAULT_STYLE },
      exclusions: [],
      _hydrated: false,

      updateStyle: (prop, value) =>
        set((state) => {
          state.style[prop] = value
        }),

      addExclusion: (property, layoutType) =>
        set((state) => {
          // 중복 방지
          const exists = state.exclusions.some(
            (e) => e.property === property && e.layoutType === layoutType
          )
          if (!exists) {
            state.exclusions.push({
              id: `${property}-${layoutType}`,
              property,
              layoutType,
            })
          }
        }),

      removeExclusion: (id) =>
        set((state) => {
          state.exclusions = state.exclusions.filter((e) => e.id !== id)
        }),

      hasExclusion: (property, layoutType) => {
        return get().exclusions.some(
          (e) => e.property === property && e.layoutType === layoutType
        )
      },

      getEffectiveStyle: (layoutType) => {
        const { style, exclusions } = get()
        const effective = { ...style }

        for (const exclusion of exclusions) {
          if (exclusion.layoutType === layoutType) {
            // 제외된 속성은 기본값으로 되돌림
            effective[exclusion.property] = DEFAULT_STYLE[exclusion.property]
          }
        }

        return effective
      },

      resetStyle: () =>
        set((state) => {
          state.style = { ...DEFAULT_STYLE }
          state.exclusions = []
        }),

      setHydrated: () => set({ _hydrated: true }),
    })),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        style: state.style,
        exclusions: state.exclusions,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('GlobalStyle store hydration failed:', error)
        }
        if (state) {
          state.setHydrated()
        }
      },
    }
  )
)
