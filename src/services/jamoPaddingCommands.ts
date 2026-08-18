import type { JamoData, Padding, StrokeMoveDelta } from '../types'

const LIMIT = 0.5
const EMPTY_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 }

export interface MoveJamoPaddingResult {
  jamo: JamoData
  delta: StrokeMoveDelta
  changed: boolean
}

function paddingTargets(jamo: JamoData): Array<keyof Pick<JamoData, 'padding' | 'horizontalPadding' | 'verticalPadding'>> {
  const targets: Array<keyof Pick<JamoData, 'padding' | 'horizontalPadding' | 'verticalPadding'>> = ['padding']
  if (jamo.horizontalPadding) targets.push('horizontalPadding')
  if (jamo.verticalPadding) targets.push('verticalPadding')
  return targets
}

export function moveJamoPadding(source: JamoData, requested: StrokeMoveDelta, gridStep = 0): MoveJamoPaddingResult {
  const jamo = structuredClone(source)
  const keys = paddingTargets(jamo)
  const paddings = keys.map((key) => jamo[key] ?? EMPTY_PADDING)
  const snap = (value: number) => gridStep > 0 ? Math.round(value / gridStep) * gridStep : value
  const requestedX = snap(requested.x)
  const requestedY = snap(requested.y)
  const minX = Math.max(...paddings.map((padding) => Math.max(-LIMIT - padding.left, padding.right - LIMIT)))
  const maxX = Math.min(...paddings.map((padding) => Math.min(LIMIT - padding.left, padding.right + LIMIT)))
  const minY = Math.max(...paddings.map((padding) => Math.max(-LIMIT - padding.top, padding.bottom - LIMIT)))
  const maxY = Math.min(...paddings.map((padding) => Math.min(LIMIT - padding.top, padding.bottom + LIMIT)))
  const delta = {
    x: Math.max(minX, Math.min(maxX, requestedX)),
    y: Math.max(minY, Math.min(maxY, requestedY)),
  }
  keys.forEach((key) => {
    const padding = jamo[key] ?? EMPTY_PADDING
    jamo[key] = {
      top: padding.top + delta.y,
      bottom: padding.bottom - delta.y,
      left: padding.left + delta.x,
      right: padding.right - delta.x,
    }
  })
  return { jamo, delta, changed: Math.abs(delta.x) > 0.000001 || Math.abs(delta.y) > 0.000001 }
}
