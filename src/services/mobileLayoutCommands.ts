import type { BoxConfig, LayoutSchema, Part, PartOverride, StrokeMoveDelta } from '../types'

const EPSILON = 0.000001
const EMPTY_OVERRIDE: PartOverride = { top: 0, bottom: 0, left: 0, right: 0 }

export interface MoveLayoutPartsResult {
  schema: LayoutSchema
  delta: StrokeMoveDelta
  changed: boolean
}

export function moveLayoutParts(
  source: LayoutSchema,
  parts: Part[],
  boxes: Partial<Record<Part, BoxConfig>>,
  requested: StrokeMoveDelta,
  gridStep?: number,
): MoveLayoutPartsResult {
  const schema = structuredClone(source)
  const targetBoxes = parts.map((part) => boxes[part]).filter((box): box is BoxConfig => !!box)
  if (targetBoxes.length === 0) return { schema, delta: { x: 0, y: 0 }, changed: false }
  const minX = Math.min(...targetBoxes.map((box) => box.x))
  const maxX = Math.max(...targetBoxes.map((box) => box.x + box.width))
  const minY = Math.min(...targetBoxes.map((box) => box.y))
  const maxY = Math.max(...targetBoxes.map((box) => box.y + box.height))
  const snap = (anchor: number, value: number, min: number, max: number): number => {
    const clamped = Math.max(min, Math.min(max, value))
    if (!gridStep || gridStep <= 0 || Math.abs(clamped) < EPSILON) return clamped
    const snapped = Math.round((anchor + clamped) / gridStep) * gridStep - anchor
    return Math.max(min, Math.min(max, snapped))
  }
  const delta = {
    x: snap(minX, requested.x, -minX, 1 - maxX),
    y: snap(minY, requested.y, -minY, 1 - maxY),
  }
  if (Math.abs(delta.x) < EPSILON && Math.abs(delta.y) < EPSILON) {
    return { schema, delta: { x: 0, y: 0 }, changed: false }
  }
  schema.partOverrides ??= {}
  parts.forEach((part) => {
    const current = schema.partOverrides?.[part] ?? EMPTY_OVERRIDE
    schema.partOverrides![part] = {
      left: current.left + delta.x,
      right: current.right - delta.x,
      top: current.top + delta.y,
      bottom: current.bottom - delta.y,
    }
  })
  return { schema, delta, changed: true }
}
