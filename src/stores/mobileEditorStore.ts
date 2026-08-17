import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { JamoData, MobileEditorSelection, SmartGuide, StrokeMoveDelta } from '../types'

type MobileEditorScreen = 'editor' | 'history' | 'compare'
type GesturePhase = 'idle' | 'active' | 'saved' | 'error'

interface MobileEditorState {
  screen: MobileEditorScreen
  selection: MobileEditorSelection
  previewJamo: JamoData | null
  gestureStartJamo: JamoData | null
  previewDelta: StrokeMoveDelta
  smartGuides: SmartGuide[]
  phase: GesturePhase
  precise: boolean
  comparedHistoryId: string | null
}

interface MobileEditorActions {
  setScreen: (screen: MobileEditorScreen) => void
  selectPart: () => void
  selectStroke: (strokeId: string) => void
  beginGesture: (jamo: JamoData) => void
  updatePreview: (jamo: JamoData, delta: StrokeMoveDelta, smartGuides?: SmartGuide[]) => void
  finishGesture: (phase: Extract<GesturePhase, 'idle' | 'saved' | 'error'>) => void
  cancelGesture: () => void
  setPrecise: (precise: boolean) => void
  compareHistory: (id: string | null) => void
}

export const useMobileEditorStore = create<MobileEditorState & MobileEditorActions>()(
  immer((set) => ({
    screen: 'editor',
    selection: { kind: 'none' },
    previewJamo: null,
    gestureStartJamo: null,
    previewDelta: { x: 0, y: 0 },
    smartGuides: [],
    phase: 'idle',
    precise: false,
    comparedHistoryId: null,

    setScreen: (screen) => set((state) => { state.screen = screen }),
    selectPart: () => set((state) => {
      state.selection = { kind: 'part', part: 'CH' }
      state.phase = 'idle'
    }),
    selectStroke: (strokeId) => set((state) => {
      state.selection = { kind: 'stroke', part: 'CH', strokeId }
      state.phase = 'idle'
    }),
    beginGesture: (jamo) => set((state) => {
      state.gestureStartJamo = structuredClone(jamo)
      state.previewJamo = structuredClone(jamo)
      state.previewDelta = { x: 0, y: 0 }
      state.smartGuides = []
      state.phase = 'active'
    }),
    updatePreview: (jamo, delta, smartGuides = []) => set((state) => {
      state.previewJamo = jamo
      state.previewDelta = delta
      state.smartGuides = smartGuides
    }),
    finishGesture: (phase) => set((state) => {
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewDelta = { x: 0, y: 0 }
      state.smartGuides = []
      state.phase = phase
    }),
    cancelGesture: () => set((state) => {
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewDelta = { x: 0, y: 0 }
      state.smartGuides = []
      state.phase = 'idle'
    }),
    setPrecise: (precise) => set((state) => { state.precise = precise }),
    compareHistory: (id) => set((state) => {
      state.comparedHistoryId = id
      state.screen = id ? 'compare' : 'history'
    }),
  }))
)
