import { create } from 'zustand'
import type { LayoutType, LayoutSchema, Padding, JamoData } from '../types'
import { useLayoutStore } from './layoutStore'
import { useJamoStore } from './jamoStore'

const MAX_HISTORY = 50

interface HistorySnapshot {
  layout: {
    layoutSchemas: Record<LayoutType, LayoutSchema>
    globalPadding: Padding
    paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
  }
  jamo: {
    choseong: Record<string, JamoData>
    jungseong: Record<string, JamoData>
    jongseong: Record<string, JamoData>
  }
}

interface HistoryState {
  undoStack: HistorySnapshot[]
  redoStack: HistorySnapshot[]
}

interface HistoryActions {
  /** 현재 스토어 상태를 스냅샷으로 저장 (변경 전에 호출) */
  pushSnapshot: () => void
  /** 이전 상태로 되돌리기 */
  undo: () => void
  /** 되돌리기 취소 */
  redo: () => void
  /** 히스토리 초기화 (프로젝트 로드 시) */
  clear: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

function captureSnapshot(): HistorySnapshot {
  const layoutState = useLayoutStore.getState()
  const jamoState = useJamoStore.getState()
  return {
    layout: {
      layoutSchemas: JSON.parse(JSON.stringify(layoutState.layoutSchemas)),
      globalPadding: { ...layoutState.globalPadding },
      paddingOverrides: JSON.parse(JSON.stringify(layoutState.paddingOverrides)),
    },
    jamo: {
      choseong: JSON.parse(JSON.stringify(jamoState.choseong)),
      jungseong: JSON.parse(JSON.stringify(jamoState.jungseong)),
      jongseong: JSON.parse(JSON.stringify(jamoState.jongseong)),
    },
  }
}

function applySnapshot(snapshot: HistorySnapshot) {
  useLayoutStore.getState().loadFontData(snapshot.layout)
  useJamoStore.getState().loadFontData(snapshot.jamo)
}

export const useHistoryStore = create<HistoryState & HistoryActions>()((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: () => {
    const snapshot = captureSnapshot()
    set((state) => ({
      undoStack: [...state.undoStack.slice(-(MAX_HISTORY - 1)), snapshot],
      redoStack: [],
    }))
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return
    const current = captureSnapshot()
    const prev = undoStack[undoStack.length - 1]
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
    }))
    applySnapshot(prev)
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return
    const current = captureSnapshot()
    const next = redoStack[redoStack.length - 1]
    set((state) => ({
      undoStack: [...state.undoStack, current],
      redoStack: state.redoStack.slice(0, -1),
    }))
    applySnapshot(next)
  },

  clear: () => set({ undoStack: [], redoStack: [] }),

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}))
