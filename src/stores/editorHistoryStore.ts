import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditorHistoryEntry } from '../types'

const MAX_HISTORY = 50

interface EditorHistoryState {
  entries: EditorHistoryEntry[]
  undoEntryIds: string[]
  addEntry: (
    entry: Omit<EditorHistoryEntry, 'id' | 'createdAt'>,
    options?: { undoable?: boolean }
  ) => EditorHistoryEntry
  popUndoableEntry: () => EditorHistoryEntry | null
  clear: () => void
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `history-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useEditorHistoryStore = create<EditorHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      undoEntryIds: [],
      addEntry: (entry, options) => {
        const next: EditorHistoryEntry = {
          ...entry,
          id: createId(),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({
          entries: [next, ...state.entries].slice(0, MAX_HISTORY),
          undoEntryIds: options?.undoable === false
            ? state.undoEntryIds
            : [next.id, ...state.undoEntryIds].slice(0, MAX_HISTORY),
        }))
        return next
      },
      popUndoableEntry: () => {
        let popped: EditorHistoryEntry | null = null
        set((state) => {
          const [latestId, ...rest] = state.undoEntryIds
          if (!latestId) return state
          popped = state.entries.find((entry) => entry.id === latestId) ?? null
          return { undoEntryIds: rest }
        })
        return popped
      },
      clear: () => set({ entries: [], undoEntryIds: [] }),
    }),
    { name: 'font-maker-editor-v2-history' }
  )
)
