import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_FONT_PRESET, FONT_PRESET_IDS } from '../src/types/database'
import type { FontPresetId } from '../src/types/database'

/**
 * 지금 연 폰트의 프리셋 버전. 모델 입구(`notoModel.ts`)가 이 값을 보고 v1 · v2 모델을 준다.
 * 폰트를 만들 때만 기본값을 박고(`resetToDefault`), 불러올 때는 폰트 값을 따르고(`setPreset`), 저장할 때는 이 값을 그대로 쓴다.
 * 폰트 사본 키(`LOCAL_FONT_KEYS`)에 들어 있어 다른 폰트로 옮기면 같이 비워진다.
 */
export const FONT_PRESET_STORAGE_KEY = 'font-maker-font-preset'

export const isFontPresetId = (value: unknown): value is FontPresetId => (FONT_PRESET_IDS as readonly unknown[]).includes(value)

/** 화면에 쓰는 짧은 이름. */
export const FONT_PRESET_LABEL: Record<FontPresetId, string> = { 'basic-gothic': 'v1 노토', 'basic-gothic-v2': 'v2' }

interface FontPresetState {
  preset: FontPresetId
  setPreset: (preset: FontPresetId | undefined) => void
  resetToDefault: () => void
}

export const useFontPresetStore = create<FontPresetState>()(persist((set) => ({
  preset: DEFAULT_FONT_PRESET,
  // 1.4 이하에서 올린 폰트에는 칸이 없다 — 그때는 v1이었다.
  setPreset: (preset) => set({ preset: preset ?? 'basic-gothic' }),
  resetToDefault: () => set({ preset: DEFAULT_FONT_PRESET }),
}), {
  name: FONT_PRESET_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ preset: state.preset }),
  merge: (persisted, current) => {
    const preset = (persisted as { preset?: unknown } | null)?.preset
    return { ...current, preset: isFontPresetId(preset) ? preset : current.preset }
  },
}))
