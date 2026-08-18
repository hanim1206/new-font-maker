import type { BoxConfig, LayoutSchema, Part, PartOverride } from '../types'

export type LayoutPartEdge = 'top' | 'bottom' | 'left' | 'right'

const MIN_PART_SIZE = 0.1
const EMPTY_OVERRIDE: PartOverride = { top: 0, bottom: 0, left: 0, right: 0 }

export function resizeLayoutPartEdge(
  source: LayoutSchema,
  part: Part,
  box: BoxConfig,
  edge: LayoutPartEdge,
  requestedDelta: number,
  gridStep = 0,
): LayoutSchema {
  const schema = structuredClone(source)
  const rounded = gridStep > 0 ? Math.round(requestedDelta / gridStep) * gridStep : requestedDelta
  const min = edge === 'left' ? -box.x
    : edge === 'right' ? -(1 - box.x - box.width)
      : edge === 'top' ? -box.y
        : -(1 - box.y - box.height)
  const max = (edge === 'left' || edge === 'right' ? box.width : box.height) - MIN_PART_SIZE
  const delta = Math.max(min, Math.min(max, rounded))
  const current = schema.userPartOverrides?.[part] ?? EMPTY_OVERRIDE
  schema.userPartOverrides ??= {}
  schema.userPartOverrides[part] = {
    ...current,
    [edge]: current[edge] + delta,
  }
  return schema
}
