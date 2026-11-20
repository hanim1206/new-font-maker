import type { DrawnStem, RelPoint, StemKind } from './strokeLab'

/**
 * 그은 줄기의 휨 · 기울기를 `keep`만큼만 남긴다(1 = 그은 그대로, 0 = 곧게). 울타리 보정이 획끼리 닿는 글자에서 휨을 줄일 때 쓴다.
 * 동그라미는 놓일 자리의 크기에 맞춰 들어가므로 그대로 둔다.
 */
export function bentStems(stems: Partial<Record<StemKind, DrawnStem>>, keep: number): Partial<Record<StemKind, DrawnStem>> {
  if (keep === 1) return stems
  const scale = <T extends { t: number; r: number }>(point: T): T => ({ ...point, r: point.r * keep })
  const out: Partial<Record<StemKind, DrawnStem>> = {}
  for (const [kind, stem] of Object.entries(stems) as [StemKind, DrawnStem][]) {
    out[kind] = stem.ok && stem.shape
      ? { ...stem, shape: stem.shape.map((point): RelPoint => ({ ...scale(point), ...(point.handleIn ? { handleIn: scale(point.handleIn) } : {}), ...(point.handleOut ? { handleOut: scale(point.handleOut) } : {}) })) }
      : stem
  }
  return out
}
