import type { GapAnchor, LayoutGap, LayoutSchema } from '../types'
import { calculateRawBoxes } from '../utils/layoutCalculator'
import { resolveGapInsets } from '../utils/layoutGapUtils'

export const CH_JU_VERTICAL_GAP_ID = 'ch-ju-vertical'
const MIN_PART_SIZE = 0.1
const MIN_GAP_SIZE = -0.25

export function supportsChJungVerticalGap(schema: LayoutSchema): boolean {
  return schema.id === 'choseong-jungseong-vertical' || schema.id === 'choseong-jungseong-vertical-jongseong'
}

export function getChJungVerticalGap(schema: LayoutSchema): LayoutGap {
  const found = schema.gaps?.find((gap) => gap.id === CH_JU_VERTICAL_GAP_ID)
  if (found) {
    const insets = resolveGapInsets(found)
    return { ...found, ...insets, size: insets.beforeInset + insets.afterInset }
  }
  return {
    id: CH_JU_VERTICAL_GAP_ID,
    axis: 'x',
    before: ['CH'],
    after: ['JU'],
    size: 0,
    anchor: 'center',
  }
}

function maximumGapDelta(schema: LayoutSchema, gap: LayoutGap, anchor: GapAnchor): number {
  const boxes = calculateRawBoxes(schema)
  const beforeWidth = boxes.CH?.width ?? 0
  const afterWidth = boxes.JU?.width ?? 0
  const insets = resolveGapInsets(gap)
  const beforeAvailable = Math.max(0, beforeWidth - MIN_PART_SIZE - insets.beforeInset)
  const afterAvailable = Math.max(0, afterWidth - MIN_PART_SIZE - insets.afterInset)
  if (anchor === 'before') return afterAvailable
  if (anchor === 'after') return beforeAvailable
  return Math.min(beforeAvailable, afterAvailable) * 2
}

export function setChJungVerticalGap(
  source: LayoutSchema,
  patch: { size?: number; anchor?: GapAnchor },
  gridStep = 0.005,
): LayoutSchema {
  if (!supportsChJungVerticalGap(source)) return structuredClone(source)
  const schema = structuredClone(source)
  const current = getChJungVerticalGap(schema)
  const anchor = patch.anchor ?? current.anchor
  const currentInsets = resolveGapInsets(current)
  const currentSize = currentInsets.beforeInset + currentInsets.afterInset
  const requested = patch.size ?? currentSize
  const snapped = gridStep > 0 ? Math.round(requested / gridStep) * gridStep : requested
  const requestedDelta = snapped - currentSize
  const delta = Math.max(MIN_GAP_SIZE - currentSize, Math.min(maximumGapDelta(schema, current, anchor), requestedDelta))
  const beforeInset = currentInsets.beforeInset + (anchor === 'before' ? 0 : anchor === 'after' ? delta : delta / 2)
  const afterInset = currentInsets.afterInset + (anchor === 'after' ? 0 : anchor === 'before' ? delta : delta / 2)
  const gap = { ...current, anchor, beforeInset, afterInset, size: beforeInset + afterInset }
  schema.gaps = [...(schema.gaps ?? []).filter((item) => item.id !== gap.id), gap]
  return schema
}
