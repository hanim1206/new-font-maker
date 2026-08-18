import type { LayoutGap } from '../types'

export interface GapInsets {
  beforeInset: number
  afterInset: number
}

export function resolveGapInsets(gap: LayoutGap): GapInsets {
  if (gap.beforeInset !== undefined && gap.afterInset !== undefined) {
    return { beforeInset: gap.beforeInset, afterInset: gap.afterInset }
  }
  if (gap.anchor === 'before') return { beforeInset: 0, afterInset: gap.size }
  if (gap.anchor === 'after') return { beforeInset: gap.size, afterInset: 0 }
  return { beforeInset: gap.size / 2, afterInset: gap.size / 2 }
}
