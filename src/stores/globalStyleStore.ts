import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { BrushStyle, LayoutType, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle } from '../types'

export { weightToMultiplier } from '../utils/globalStyleUtils'

const STORAGE_KEY = 'font-maker-global-style'

// ===== 글로벌 스타일 속성 =====
export interface GlobalStyle {
  slant: number         // 기울기 (도, -30~30, 기본 0)
  weight: number        // 두께 (100~900, 100단위, 기본 400)
  letterSpacing: number // 자간 (0~0.3, 기본 0)
  linecap: StrokeLinecap  // 획 끝 모양 (기본 'round')
  linejoin: StrokeLinejoin // 획 꺾임 모양 (기본 'round')
  brush: BrushStyle       // 폰트 전체에 적용하는 붓촉
  strokeStyle: StrokeRenderStyle // 중심선을 최종 윤곽으로 바꾸는 공통 규칙
}

// 숫자 속성만 (updateStyle에서 사용)
export type NumericGlobalStyleProp = 'slant' | 'weight' | 'letterSpacing'

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
  // linejoin 업데이트
  updateLinejoin: (value: StrokeLinejoin) => void
  setBrushStyle: (value: BrushStyle) => void
  setStrokeRenderStyle: (value: StrokeRenderStyle) => void

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

export const DEFAULT_STYLE: GlobalStyle = {
  slant: 0,
  weight: 400,
  letterSpacing: 0,
  linecap: 'round',
  linejoin: 'round',
  brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
  strokeStyle: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } },
}

export function normalizeBrushStyle(value: Partial<BrushStyle> | undefined): BrushStyle {
  const tip = value?.tip === 'ellipse' || value?.tip === 'rectangle' ? value.tip : 'round'
  const aspectRatio = Math.max(0.2, Math.min(1, Number.isFinite(value?.aspectRatio) ? value!.aspectRatio! : 0.5))
  const angle = Math.max(-90, Math.min(90, Number.isFinite(value?.angle) ? value!.angle! : 0))
  return { tip, aspectRatio, angle }
}

export function normalizeStrokeRenderStyle(
  value: unknown,
  legacyBrush?: Partial<BrushStyle>,
): StrokeRenderStyle {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : undefined
  if (input?.mode === 'angled-area') {
    const rawCutAngle = Math.max(-60, Math.min(60, Number.isFinite(input.cutAngle) ? input.cutAngle as number : 35))
    const cutAngle = Math.abs(rawCutAngle) < 15 ? (rawCutAngle < 0 ? -15 : 15) : rawCutAngle
    const cornerRadius = Math.max(0, Math.min(1, Number.isFinite(input.cornerRadius) ? input.cornerRadius as number : 0.2))
    return { mode: 'angled-area', cutAngle, cornerRadius }
  }
  if (input?.mode === 'dot-pattern') {
    const dotSize = Math.max(0.5, Math.min(1.5, Number.isFinite(input.dotSize) ? input.dotSize as number : 1))
    const gap = Math.max(0, Math.min(2, Number.isFinite(input.gap) ? input.gap as number : 0.5))
    const rows = Math.max(1, Math.min(3, Math.round(Number.isFinite(input.rows) ? input.rows as number : 1)))
    const rawOmitEvery = Math.round(Number.isFinite(input.omitEvery) ? input.omitEvery as number : 0)
    const omitEvery = rawOmitEvery === 0 ? 0 : Math.max(2, Math.min(8, rawOmitEvery))
    return { mode: 'dot-pattern', dotSize, gap, rows, stagger: input.stagger === true, omitEvery }
  }
  if (input?.mode === 'legacy-snapped-centerline' || input?.mode === 'grid-system-2') {
    return { mode: 'legacy-snapped-centerline' }
  }
  const candidate = input?.mode === 'brush' && input.brush && typeof input.brush === 'object'
    ? input.brush as Partial<BrushStyle>
    : legacyBrush
  return { mode: 'brush', brush: normalizeBrushStyle(candidate) }
}

function normalizeGlobalStyle(style: GlobalStyle): GlobalStyle {
  const brush = normalizeBrushStyle(style.brush)
  const strokeStyle = normalizeStrokeRenderStyle(style.strokeStyle, brush)
  return { ...style, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : brush, strokeStyle }
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

      updateLinejoin: (value) =>
        set((state) => {
          state.style.linejoin = value
        }),

      setBrushStyle: (value) =>
        set((state) => {
          state.style.brush = normalizeBrushStyle(value)
          state.style.strokeStyle = { mode: 'brush', brush: state.style.brush }
        }),

      setStrokeRenderStyle: (value) =>
        set((state) => {
          state.style.strokeStyle = normalizeStrokeRenderStyle(value, state.style.brush)
          if (state.style.strokeStyle.mode === 'brush') state.style.brush = state.style.strokeStyle.brush
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
          // linejoin 백필 (구형 데이터 호환)
          if (!state.style.linejoin) {
            state.style.linejoin = 'round'
          }
          state.style = normalizeGlobalStyle(state.style)
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
          // linejoin 백필 (기존 데이터 호환)
          if (!state.style.linejoin) {
            state.style.linejoin = 'round'
          }
          state.style = normalizeGlobalStyle(state.style)
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

/**
 * 획별 linejoin 오버라이드와 글로벌 기본값을 결합하여 최종 linejoin 결정
 * strokeLinejoin(획별) > globalLinejoin(글로벌) > 'round'(폴백)
 */
export function resolveLinejoin(
  strokeLinejoin: StrokeLinejoin | undefined,
  globalLinejoin: StrokeLinejoin | undefined
): StrokeLinejoin {
  return strokeLinejoin ?? globalLinejoin ?? 'round'
}
