import type { InferredEditRule, RawGlyphEdit, SampleGlyphEdit } from './calibrationProjectStore'

export function inferEditRule(edit: RawGlyphEdit): InferredEditRule {
  if (edit.kind === 'component-move' || edit.kind === 'component-scale') {
    return { kind: 'layout-profile', layoutType: edit.layoutType, parts: [...edit.parts] }
  }
  return {
    kind: 'jamo-master',
    jamoType: edit.jamoType,
    jamoId: edit.component.jamoId,
    strokeId: edit.strokeId,
  }
}

export function createSampleGlyphEdit(raw: RawGlyphEdit): SampleGlyphEdit {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    id,
    createdAt: new Date().toISOString(),
    raw,
    inferredRule: inferEditRule(raw),
  }
}
