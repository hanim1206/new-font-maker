import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StrokeDataV2, SymbolGlyph } from '../types'
import { createDebouncedStorage } from '../utils/debouncedStorage'

/**
 * 획으로 만든 숫자 · 기호. 글자 → `{ char, strokes }`. 여기 없는 글자는 노토 윤곽으로 그린다(화면 · 추출 모두).
 * 손을 댄 기호만 들어간다 — 씨앗 획(`symbolSeeds`)은 편집기가 처음 열 때 채워 주고, 고치기 전에는 저장하지 않는다.
 * 플랜: docs/plans/2026-10-08_숫자-기호-획-편집.md
 */

const STORAGE_KEY = 'font-maker-symbol-data'
const rawStorage = createDebouncedStorage(300)
const debouncedStorage = createJSONStorage(() => rawStorage)

export function flushSymbolStorePersistence(): void {
  rawStorage.flush(STORAGE_KEY)
}

interface SymbolState {
  symbols: Record<string, SymbolGlyph>
}

interface SymbolActions {
  /** 기호 하나의 획을 통째로 바꾼다. */
  setStrokes: (char: string, strokes: StrokeDataV2[]) => void
  /** 노토로 되돌린다. */
  resetSymbol: (char: string) => void
  /** 폰트를 열 때 통째로 바꾼다. 없으면 비운다(전부 노토). */
  loadFontData: (symbols: Record<string, SymbolGlyph> | undefined) => void
}

export const useSymbolStore = create<SymbolState & SymbolActions>()(
  persist(
    immer((set) => ({
      symbols: {},
      setStrokes: (char, strokes) => set((state) => { state.symbols[char] = { char, strokes: structuredClone(strokes) } }),
      resetSymbol: (char) => set((state) => { delete state.symbols[char] }),
      loadFontData: (symbols) => set((state) => { state.symbols = structuredClone(symbols ?? {}) }),
    })),
    {
      name: STORAGE_KEY,
      storage: debouncedStorage,
      partialize: (state) => ({ symbols: state.symbols }),
    },
  ),
)
