import type { DrawnStem, RelPoint, StemKind } from './strokeLab'

/** 휨 단계 하나: 그은 휨과 기울기를 얼마나 남길지(1 = 그대로, 0 = 없앰). */
export interface BendLevel { bend: number; tilt: number }

/**
 * 그은 줄기의 휨과 기울기를 따로 줄인다. 울타리 보정이 획끼리 닿는 글자에서 쓴다.
 * 기울기 = 끝점이 축에서 벗어난 만큼(시작 → 끝 직선), 휨 = 그 직선에서 벗어난 만큼.
 * 동그라미는 놓일 자리의 크기에 맞춰 들어가므로 그대로 둔다.
 */
export function bentStems(stems: Partial<Record<StemKind, DrawnStem>>, keep: BendLevel): Partial<Record<StemKind, DrawnStem>> {
  if (keep.bend === 1 && keep.tilt === 1) return stems
  const out: Partial<Record<StemKind, DrawnStem>> = {}
  for (const [kind, stem] of Object.entries(stems) as [StemKind, DrawnStem][]) {
    if (!stem.ok || !stem.shape) { out[kind] = stem; continue }
    const tilt = stem.shape[stem.shape.length - 1].r
    const scale = <T extends { t: number; r: number }>(point: T): T => ({ ...point, r: tilt * point.t * keep.tilt + (point.r - tilt * point.t) * keep.bend })
    out[kind] = { ...stem, shape: stem.shape.map((point): RelPoint => ({ ...scale(point), ...(point.handleIn ? { handleIn: scale(point.handleIn) } : {}), ...(point.handleOut ? { handleOut: scale(point.handleOut) } : {}) })) }
  }
  return out
}
