import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LayoutType, Part } from '../src/types'

export interface FontSpace {
  unitsPerEm: number
  width: number
  height: number
}

export interface FontGrid {
  majorDivisions: number
  minorInterval: number
  snapInterval: number
}

export interface DesignBody {
  x: number
  y: number
  width: number
  height: number
}

export interface FontMetrics {
  hangulAdvance: number
  spaceAdvance: number
  punctuationAdvance: number
  lineHeight: number
}

export type ComponentRole = 'initial' | 'medial' | 'final'

export interface GlyphComponentIdentity {
  id: string
  role: ComponentRole
  jamoId: string
}

export type RawGlyphEdit =
  | { kind: 'component-move'; glyph: string; component: GlyphComponentIdentity; layoutType: LayoutType; parts: Part[]; delta: { x: number; y: number } }
  | { kind: 'component-scale'; glyph: string; component: GlyphComponentIdentity; layoutType: LayoutType; parts: Part[]; scale: { x: number; y: number } }
  | { kind: 'stroke-move'; glyph: string; component: GlyphComponentIdentity; jamoType: 'choseong' | 'jungseong' | 'jongseong'; strokeId: string; delta: { x: number; y: number } }
  | { kind: 'stroke-scale'; glyph: string; component: GlyphComponentIdentity; jamoType: 'choseong' | 'jungseong' | 'jongseong'; strokeId: string; scale: { x: number; y: number } }
  | { kind: 'point-move'; glyph: string; component: GlyphComponentIdentity; jamoType: 'choseong' | 'jungseong' | 'jongseong'; strokeId: string; pointIndex: number; delta: { x: number; y: number } }
  | { kind: 'handle-move'; glyph: string; component: GlyphComponentIdentity; jamoType: 'choseong' | 'jungseong' | 'jongseong'; strokeId: string; pointIndex: number; handle: 'in' | 'out'; delta: { x: number; y: number } }

export type InferredEditRule =
  | { kind: 'layout-profile'; layoutType: LayoutType; parts: Part[] }
  | { kind: 'jamo-master'; jamoType: 'choseong' | 'jungseong' | 'jongseong'; jamoId: string; strokeId: string }

export interface SampleGlyphEdit {
  id: string
  createdAt: string
  raw: RawGlyphEdit
  inferredRule: InferredEditRule
}

export const DEFAULT_FONT_SPACE: FontSpace = { unitsPerEm: 1000, width: 1000, height: 1000 }
export const DEFAULT_FONT_GRID: FontGrid = { majorDivisions: 8, minorInterval: 25, snapInterval: 5 }
/** 기본 네모꼴 = Noto 몸통. `REFERENCE_BODY_PADDING`(위 50 · 아래 40 · 왼 50 · 오른 110)과 같은 값. */
export const DEFAULT_DESIGN_BODY: DesignBody = { x: 50, y: 50, width: 840, height: 910 }
const LEGACY_DESIGN_BODY: DesignBody = { x: 75, y: 75, width: 850, height: 850 }
const isLegacyDesignBody = (body: DesignBody) => body.x === LEGACY_DESIGN_BODY.x && body.y === LEGACY_DESIGN_BODY.y && body.width === LEGACY_DESIGN_BODY.width && body.height === LEGACY_DESIGN_BODY.height
export const DEFAULT_FONT_METRICS: FontMetrics = {
  hangulAdvance: 1000,
  spaceAdvance: 500,
  punctuationAdvance: 500,
  lineHeight: 1200,
}

interface CalibrationProjectState {
  fontSpace: FontSpace
  grid: FontGrid
  designBody: DesignBody
  metrics: FontMetrics
  sampleGlyphEdits: SampleGlyphEdit[]
  addSampleGlyphEdit: (edit: SampleGlyphEdit) => void
  removeSampleGlyphEdit: (id: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergePersistedProject(
  persistedState: unknown,
  currentState: CalibrationProjectState,
): CalibrationProjectState {
  const persisted = isRecord(persistedState) ? persistedState : {}
  return {
    ...currentState,
    ...(isRecord(persisted.fontSpace) && { fontSpace: persisted.fontSpace as unknown as FontSpace }),
    ...(isRecord(persisted.grid) && { grid: persisted.grid as unknown as FontGrid }),
    ...(isRecord(persisted.designBody) && { designBody: isLegacyDesignBody(persisted.designBody as unknown as DesignBody) ? DEFAULT_DESIGN_BODY : persisted.designBody as unknown as DesignBody }),
    ...(isRecord(persisted.metrics) && { metrics: persisted.metrics as unknown as FontMetrics }),
    ...(Array.isArray(persisted.sampleGlyphEdits) && {
      sampleGlyphEdits: structuredClone(persisted.sampleGlyphEdits) as SampleGlyphEdit[],
    }),
  }
}

export const useCalibrationProjectStore = create<CalibrationProjectState>()(
  persist(
    (set) => ({
      fontSpace: DEFAULT_FONT_SPACE,
      grid: DEFAULT_FONT_GRID,
      designBody: DEFAULT_DESIGN_BODY,
      metrics: DEFAULT_FONT_METRICS,
      sampleGlyphEdits: [],
      addSampleGlyphEdit: (edit) => set((state) => ({
        sampleGlyphEdits: [...state.sampleGlyphEdits.filter((item) => item.id !== edit.id), edit].slice(-100),
      })),
      removeSampleGlyphEdit: (id) => set((state) => ({
        sampleGlyphEdits: state.sampleGlyphEdits.filter((item) => item.id !== id),
      })),
    }),
    {
      name: 'font-maker-calibration-project',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        fontSpace: state.fontSpace,
        grid: state.grid,
        designBody: state.designBody,
        metrics: state.metrics,
        sampleGlyphEdits: state.sampleGlyphEdits,
      }),
      merge: mergePersistedProject,
    },
  ),
)

export function fontUnitsToNormalized(units: number, fontSpace: FontSpace): number {
  return units / fontSpace.unitsPerEm
}

export function normalizedToFontUnits(value: number, fontSpace: FontSpace): number {
  return Math.round(value * fontSpace.unitsPerEm)
}

export function advanceForCharacter(
  char: string,
  metrics: FontMetrics,
  hangulAdvance = metrics.hangulAdvance,
  spaceAdvance = metrics.spaceAdvance,
): number {
  if (/\s/u.test(char)) return spaceAdvance
  if (/^[.,!?·:;]$/u.test(char)) return metrics.punctuationAdvance
  return hangulAdvance
}
