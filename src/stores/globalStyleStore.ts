import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { LayoutType, StrokeLinecap } from '../types'

const STORAGE_KEY = 'font-maker-global-style'

// ===== 글로벌 스타일 속성 =====
export interface GlobalStyle {
  slant: number         // 기울기 (도, -30~30, 기본 0)
  weight: number        // 두께 (100~900, 100단위, 기본 400)
  letterSpacing: number // 자간 (0~0.3, 기본 0)
  linecap: StrokeLinecap // 획 끝 모양 (기본 'round')
}

// 숫자 속성만 (updateStyle에서 사용)
export type NumericGlobalStyleProp = 'slant' | 'weight' | 'letterSpacing'

/**
 * weight 값(100~900)을 두께 배율(multiplier)로 변환
 * 100=0.4x, 400=1.0x, 900=2.2x (선형 보간)
 */
export function weightToMultiplier(weight: number): number {
  // 100 → 0.4, 400 → 1.0, 900 → 2.2
  if (weight <= 400) {
    return 0.4 + (weight - 100) / 300 * 0.6  // 100→0.4, 400→1.0
  }
  return 1.0 + (weight - 400) / 500 * 1.2     // 400→1.0, 900→2.2
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
  // 숫자 스타일 속성 업데이트
  updateStyle: (prop: NumericGlobalStyleProp, value: number) => void
  // linecap 업데이트
  updateLinecap: (value: StrokeLinecap) => void

  // 제외 규칙 관리
  addExclusion: (property: keyof GlobalStyle, layoutType: LayoutType) => void
  removeExclusion: (id: string) => void
  hasExclusion: (property: keyof GlobalStyle, layoutType: LayoutType) => boolean

  // 특정 레이아웃에 적용될 실제 스타일 계산
  getEffectiveStyle: (layoutType: LayoutType) => GlobalStyle

  // 리셋
  resetStyle: () => void

  // 외부 데이터(Supabase 등)에서 일괄 로드
  loadFontData: (data: {
    style: GlobalStyle
    exclusions: GlobalStyleExclusion[]
  }) => void

  // hydration
  setHydrated: () => void
}

const DEFAULT_STYLE: GlobalStyle = {
  slant: 0,
  weight: 400,
  letterSpacing: 0,
  linecap: 'round',
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

      updateLinecap: (value) =>
        set((state) => {
          state.style.linecap = value
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
            const prop = exclusion.property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(effective as any)[prop] = DEFAULT_STYLE[prop]
          }
        }

        return effective
      },

      resetStyle: () =>
        set((state) => {
          state.style = { ...DEFAULT_STYLE }
          state.exclusions = []
        }),

      loadFontData: (data) =>
        set((state) => {
          state.style = { ...data.style }
          // linecap 백필 (구형 데이터 호환)
          if (!state.style.linecap) {
            state.style.linecap = 'round'
          }
          state.exclusions = [...data.exclusions]
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
          // linecap 백필 (기존 데이터 호환)
          if (!state.style.linecap) {
            state.style.linecap = 'round'
          }
          state.setHydrated()
        }
      },
    }
  )
)

/**
 * 획별 linecap 오버라이드와 글로벌 기본값을 결합하여 최종 linecap 결정
 * strokeLinecap(획별) > globalLinecap(글로벌) > 'round'(폴백)
 */
export function resolveLinecap(
  strokeLinecap: StrokeLinecap | undefined,
  globalLinecap: StrokeLinecap | undefined
): StrokeLinecap {
  return strokeLinecap ?? globalLinecap ?? 'round'
}
