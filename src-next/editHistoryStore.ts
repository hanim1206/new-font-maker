import { create } from 'zustand'
import type { HistoryEntry } from './CalibrationSentenceEditor'

/**
 * 되돌리기 · 다시 실행 기록. 편집 화면의 상태였는데 자소↔검수를 오가면 화면이 다시 열리며 사라졌다(피드백 31).
 * 메모리에만 둔다 — 저장하지 않는다. 폰트를 바꾸면 앱이 새로 뜨므로 기록도 같이 비워진다.
 * `setHistory` · `setFuture`는 React `setState`처럼 값이나 갱신 함수를 받는다.
 */
type Updater<T> = T | ((entries: T) => T)

interface EditHistoryState {
  history: HistoryEntry[]
  future: HistoryEntry[]
}

interface EditHistoryActions {
  setHistory: (update: Updater<HistoryEntry[]>) => void
  setFuture: (update: Updater<HistoryEntry[]>) => void
}

const resolve = <T,>(update: Updater<T>, current: T): T => typeof update === 'function' ? (update as (entries: T) => T)(current) : update

export const useEditHistoryStore = create<EditHistoryState & EditHistoryActions>((set) => ({
  history: [],
  future: [],
  setHistory: (update) => set((state) => ({ history: resolve(update, state.history) })),
  setFuture: (update) => set((state) => ({ future: resolve(update, state.future) })),
}))
