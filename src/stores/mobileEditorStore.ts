import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { JamoData, LayoutSchema, MobileEditorPart, MobileEditorSelection, Part, SmartGuide, StrokeMoveDelta, StrokeScale } from '../types'

type MobileEditorScreen = 'editor' | 'layout' | 'jamo-base' | 'history' | 'compare'
type GesturePhase = 'idle' | 'active' | 'saved' | 'error'

interface MobileEditorState {
  screen: MobileEditorScreen
  activeSyllable: string
  activePart: MobileEditorPart
  selection: MobileEditorSelection
  previewJamo: JamoData | null
  gestureStartJamo: JamoData | null
  previewSchema: LayoutSchema | null
  gestureStartSchema: LayoutSchema | null
  previewDelta: StrokeMoveDelta
  previewScale: StrokeScale
  activeScaleAxes: { x: boolean; y: boolean }
  smartGuides: SmartGuide[]
  phase: GesturePhase
  comparedHistoryId: string | null
}

interface MobileEditorActions {
  setScreen: (screen: MobileEditorScreen) => void
  setActiveSyllable: (syllable: string) => void
  setActivePart: (part: MobileEditorPart) => void
  clearSelection: () => void
  selectPart: (part: Part) => void
  selectStroke: (part: Part, strokeId: string) => void
  selectPoint: (part: Part, strokeId: string, pointIndex: number) => void
  selectHandle: (part: Part, strokeId: string, pointIndex: number, handle: 'in' | 'out') => void
  beginGesture: (jamo: JamoData, previewJamo?: JamoData) => void
  beginLayoutGesture: (schema: LayoutSchema) => void
  updatePreview: (jamo: JamoData, delta: StrokeMoveDelta, smartGuides?: SmartGuide[]) => void
  updateScalePreview: (jamo: JamoData, scale: StrokeScale, activeAxes?: { x: boolean; y: boolean }) => void
  updateLayoutPreview: (schema: LayoutSchema, delta: StrokeMoveDelta, smartGuides?: SmartGuide[]) => void
  finishGesture: (phase: Extract<GesturePhase, 'idle' | 'saved' | 'error'>) => void
  cancelGesture: () => void
  compareHistory: (id: string | null) => void
}

export const useMobileEditorStore = create<MobileEditorState & MobileEditorActions>()(
  immer((set) => ({
    screen: 'editor',
    activeSyllable: '곰',
    activePart: 'CH',
    selection: { kind: 'none' },
    previewJamo: null,
    gestureStartJamo: null,
    previewSchema: null,
    gestureStartSchema: null,
    previewDelta: { x: 0, y: 0 },
    previewScale: { x: 1, y: 1 },
    activeScaleAxes: { x: false, y: false },
    smartGuides: [],
    phase: 'idle',
    comparedHistoryId: null,

    setScreen: (screen) => set((state) => { state.screen = screen }),
    setActiveSyllable: (syllable) => set((state) => {
      state.activeSyllable = syllable
      state.selection = { kind: 'none' }
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewSchema = null
      state.gestureStartSchema = null
      state.previewDelta = { x: 0, y: 0 }
      state.previewScale = { x: 1, y: 1 }
      state.activeScaleAxes = { x: false, y: false }
      state.smartGuides = []
      state.phase = 'idle'
    }),
    setActivePart: (part) => set((state) => {
      state.activePart = part
      state.selection = { kind: 'none' }
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewSchema = null
      state.gestureStartSchema = null
      state.previewDelta = { x: 0, y: 0 }
      state.previewScale = { x: 1, y: 1 }
      state.activeScaleAxes = { x: false, y: false }
      state.smartGuides = []
      state.phase = 'idle'
    }),
    clearSelection: () => set((state) => {
      state.selection = { kind: 'none' }
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewSchema = null
      state.gestureStartSchema = null
      state.previewDelta = { x: 0, y: 0 }
      state.previewScale = { x: 1, y: 1 }
      state.activeScaleAxes = { x: false, y: false }
      state.smartGuides = []
      state.phase = 'idle'
    }),
    selectPart: (part) => set((state) => {
      state.selection = { kind: 'part', part }
      state.phase = 'idle'
    }),
    selectStroke: (part, strokeId) => set((state) => {
      state.selection = { kind: 'stroke', part, strokeId }
      state.phase = 'idle'
    }),
    selectPoint: (part, strokeId, pointIndex) => set((state) => {
      state.selection = { kind: 'point', part, strokeId, pointIndex }
      state.phase = 'idle'
    }),
    selectHandle: (part, strokeId, pointIndex, handle) => set((state) => {
      state.selection = { kind: 'handle', part, strokeId, pointIndex, handle }
      state.phase = 'idle'
    }),
    beginGesture: (jamo, previewJamo) => set((state) => {
      state.gestureStartJamo = structuredClone(jamo)
      state.previewJamo = structuredClone(previewJamo ?? jamo)
      state.previewDelta = { x: 0, y: 0 }
      state.previewScale = { x: 1, y: 1 }
      state.activeScaleAxes = { x: false, y: false }
      state.smartGuides = []
      state.phase = 'active'
    }),
    beginLayoutGesture: (schema) => set((state) => {
      state.gestureStartSchema = structuredClone(schema)
      state.previewSchema = structuredClone(schema)
      state.previewDelta = { x: 0, y: 0 }
      state.smartGuides = []
      state.phase = 'active'
    }),
    updatePreview: (jamo, delta, smartGuides = []) => set((state) => {
      state.previewJamo = jamo
      state.previewDelta = delta
      state.smartGuides = smartGuides
    }),
    updateScalePreview: (jamo, scale, activeAxes = { x: false, y: false }) => set((state) => {
      state.previewJamo = jamo
      state.previewScale = scale
      state.activeScaleAxes = activeAxes
      state.smartGuides = []
    }),
    updateLayoutPreview: (schema, delta, smartGuides = []) => set((state) => {
      state.previewSchema = schema
      state.previewDelta = delta
      state.smartGuides = smartGuides
    }),
    finishGesture: (phase) => set((state) => {
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewSchema = null
      state.gestureStartSchema = null
      state.previewDelta = { x: 0, y: 0 }
      state.previewScale = { x: 1, y: 1 }
      state.activeScaleAxes = { x: false, y: false }
      state.smartGuides = []
      state.phase = phase
    }),
    cancelGesture: () => set((state) => {
      state.previewJamo = null
      state.gestureStartJamo = null
      state.previewSchema = null
      state.gestureStartSchema = null
      state.previewDelta = { x: 0, y: 0 }
      state.previewScale = { x: 1, y: 1 }
      state.activeScaleAxes = { x: false, y: false }
      state.smartGuides = []
      state.phase = 'idle'
    }),
    compareHistory: (id) => set((state) => {
      state.comparedHistoryId = id
      state.screen = id ? 'compare' : 'history'
    }),
  }))
)
