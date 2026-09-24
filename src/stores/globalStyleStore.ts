import { useMemo } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { BrushStyle, LayoutType, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle } from '../types'
import { DEFAULT_STEM_BEAK, normalizeStemBeak, type StemBeakStyle } from '../services/stemBeak'

export { weightToMultiplier } from '../utils/globalStyleUtils'

const STORAGE_KEY = 'font-maker-global-style'

// ===== 글로벌 스타일 속성 =====
export interface GlobalStyle {
  slant: number         // 기울기 (도, -30~30, 기본 0)
  weight: number        // 두께 (100~900, 100단위, 기본 400)
  letterSpacing: number // 자간 (0~0.3, 기본 0)
  linecap: StrokeLinecap  // 획 끝 모양 (기본 'butt' — Noto 계열처럼 각진 끝)
  linejoin: StrokeLinejoin // 획 꺾임 모양 (기본 'miter')
  brush: BrushStyle       // 폰트 전체에 적용하는 붓촉
  strokeStyle: StrokeRenderStyle // 중심선을 최종 윤곽으로 바꾸는 공통 규칙
  stemBeak?: StemBeakStyle // 세로줄기 열린 머리에 얹는 부리. 없으면 꺼짐(옛 저장분)
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
  setStemBeak: (value: Partial<StemBeakStyle>) => void

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

/**
 * 기본은 각진 끝(butt/miter). brush 모드에서 끝이 둥글지 않으면 일정 폭 stroker로 면을 만들어
 * Noto 고딕 계열 목표·fit 리포트(butt/miter)와 같은 모양이 된다. 둥근 끝은 사용자가 고르는 옵션.
 */
export const DEFAULT_STYLE: GlobalStyle = {
  slant: 0,
  weight: 400,
  letterSpacing: 0,
  linecap: 'butt',
  linejoin: 'miter',
  brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
  strokeStyle: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } },
  stemBeak: { ...DEFAULT_STEM_BEAK },
}

/**
 * 한 레이아웃에 실제로 먹는 전역 스타일. 전역 값을 읽는 모든 곳이 이 길 하나를 거친다.
 * 제외 규칙이 없으면 같은 객체를 그대로 돌려준다(메모가 안 깨진다).
 */
export function effectiveStyleOf(style: GlobalStyle, exclusions: readonly GlobalStyleExclusion[], layoutType: LayoutType): GlobalStyle {
  const excluded = exclusions.filter((exclusion) => exclusion.layoutType === layoutType)
  if (excluded.length === 0) return style
  const effective = { ...style }
  for (const exclusion of excluded) {
    // 제외된 속성은 기본값으로 되돌림
    const prop = exclusion.property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(effective as any)[prop] = DEFAULT_STYLE[prop]
  }
  return effective
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
  // 전역 둥글기(0~1). 없거나 0이면 키 자체를 안 둔다 — 옛 저장분과 같은 모양.
  const roundness = input?.mode === 'brush' && Number.isFinite(input.roundness) ? Math.max(0, Math.min(1, input.roundness as number)) : 0
  // 안쪽 둥글기는 따로 정했을 때만 키를 둔다. 없으면 바깥을 따른다(연결).
  const innerRoundness = input?.mode === 'brush' && Number.isFinite(input.innerRoundness) ? Math.max(0, Math.min(1, input.innerRoundness as number)) : undefined
  const style: StrokeRenderStyle = { mode: 'brush', brush: normalizeBrushStyle(candidate) }
  if (roundness > 0) style.roundness = roundness
  if (innerRoundness !== undefined) style.innerRoundness = innerRoundness
  return style
}

function normalizeGlobalStyle(style: GlobalStyle): GlobalStyle {
  const brush = normalizeBrushStyle(style.brush)
  const strokeStyle = normalizeStrokeRenderStyle(style.strokeStyle, brush)
  return { ...style, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : brush, strokeStyle, stemBeak: normalizeStemBeak(style.stemBeak) }
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
          // 붓촉만 바꿀 때 전역 둥글기는 그대로 둔다.
          const previous = state.style.strokeStyle.mode === 'brush' ? state.style.strokeStyle : undefined
          state.style.strokeStyle = normalizeStrokeRenderStyle({ mode: 'brush', brush: state.style.brush, roundness: previous?.roundness, innerRoundness: previous?.innerRoundness })
        }),

      setStrokeRenderStyle: (value) =>
        set((state) => {
          state.style.strokeStyle = normalizeStrokeRenderStyle(value, state.style.brush)
          if (state.style.strokeStyle.mode === 'brush') state.style.brush = state.style.strokeStyle.brush
        }),

      setStemBeak: (value) =>
        set((state) => {
          state.style.stemBeak = normalizeStemBeak({ ...DEFAULT_STEM_BEAK, ...state.style.stemBeak, ...value })
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
        return { ...effectiveStyleOf(style, exclusions, layoutType) }
      },

      resetStyle: () =>
        set((state) => {
          state.style = { ...DEFAULT_STYLE }
          state.exclusions = []
        }),

      loadFontData: (data) =>
        set((state) => {
          state.style = { ...data.style }
          // linecap·linejoin 백필 (구형 데이터 호환)
          if (!state.style.linecap) {
            state.style.linecap = DEFAULT_STYLE.linecap
          }
          if (!state.style.linejoin) {
            state.style.linejoin = DEFAULT_STYLE.linejoin
          }
          state.style = normalizeGlobalStyle(state.style)
          state.exclusions = [...data.exclusions]
        }),

      setHydrated: () => set({ _hydrated: true }),
    })),
    {
      name: STORAGE_KEY,
      // v1: 기본 끝 모양이 round → butt/miter로 바뀜. 옛 기본값 그대로인 저장분만 따라간다(새 셸엔 끝 모양 UI가 없다).
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { style?: Partial<GlobalStyle>; exclusions?: GlobalStyleExclusion[] }
        if (version < 1 && state.style && state.style.linecap === 'round' && state.style.linejoin === 'round') {
          state.style = { ...state.style, linecap: DEFAULT_STYLE.linecap, linejoin: DEFAULT_STYLE.linejoin }
        }
        return state
      },
      partialize: (state) => ({
        style: state.style,
        exclusions: state.exclusions,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('GlobalStyle store hydration failed:', error)
        }
        if (state) {
          // linecap·linejoin 백필 (기존 데이터 호환)
          if (!state.style.linecap) {
            state.style.linecap = DEFAULT_STYLE.linecap
          }
          if (!state.style.linejoin) {
            state.style.linejoin = DEFAULT_STYLE.linejoin
          }
          state.style = normalizeGlobalStyle(state.style)
          state.setHydrated()
        }
      },
    }
  )
)

/** `getEffectiveStyle`의 구독판. 화면은 `state.style`을 바로 읽지 않고 이 훅으로 읽는다. */
export function useEffectiveGlobalStyle(layoutType: LayoutType): GlobalStyle {
  const style = useGlobalStyleStore((state) => state.style)
  const exclusions = useGlobalStyleStore((state) => state.exclusions)
  return useMemo(() => effectiveStyleOf(style, exclusions, layoutType), [style, exclusions, layoutType])
}

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
