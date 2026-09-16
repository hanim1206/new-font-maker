/**
 * 기준선 드래그 스냅. 손으로 끌 때만 걸리고, 자·방향키의 1u 이동에는 안 걸린다.
 * 우선순위: 모델 값(처음 자리) → 다른 기준선(Noto 실측·다른 부품 rail) → 격자(1/4 굵은선, 1/16 잔선).
 * 값은 em(0~1). 반경도 em이라 캔버스 330px 기준 0.01 ≈ 3px.
 */

export interface SnapCandidate { id: string; label: string; axis: 'x' | 'y'; value: number }
export type SnapKind = 'model' | 'rail' | 'grid'
export interface SnapHit { kind: SnapKind; label: string; id?: string; value: number }
export interface SnapResult { value: number; hit: SnapHit | null }

export interface SnapRadius { model: number; rail: number; grid: number }
/** 모델 자리는 제일 세게, 격자는 제일 약하게 잡는다. */
export const DEFAULT_SNAP_RADIUS: SnapRadius = { model: 0.02, rail: 0.015, grid: 0.012 }

const FINE = 1 / 16
const COARSE = 1 / 4
const EPSILON = 1e-9

function nearestGrid(value: number): { value: number; label: string } | null {
  const snapped = Math.round(value / FINE) * FINE
  if (snapped < -EPSILON || snapped > 1 + EPSILON) return null
  const coarse = Math.abs(snapped / COARSE - Math.round(snapped / COARSE)) < EPSILON
  return { value: snapped, label: coarse ? '격자 1/4' : '격자 1/16' }
}

export function snapRail(input: {
  value: number
  /** 이 rail의 모델 값. 처음 자리. */
  original: number
  axis: 'x' | 'y'
  /** 같은 축 후보만 본다. 자기 자신은 호출자가 뺀다. */
  candidates: readonly SnapCandidate[]
  radius?: Partial<SnapRadius>
}): SnapResult {
  const radius = { ...DEFAULT_SNAP_RADIUS, ...input.radius }
  const { value, original, axis } = input
  if (Math.abs(value - original) <= radius.model) return { value: original, hit: { kind: 'model', label: '모델', value: original } }
  let best: SnapCandidate | null = null
  for (const candidate of input.candidates) {
    if (candidate.axis !== axis) continue
    const distance = Math.abs(candidate.value - value)
    if (distance > radius.rail) continue
    if (!best || distance < Math.abs(best.value - value)) best = candidate
  }
  if (best) return { value: best.value, hit: { kind: 'rail', label: best.label, id: best.id, value: best.value } }
  const grid = nearestGrid(value)
  if (grid && Math.abs(grid.value - value) <= radius.grid) return { value: grid.value, hit: { kind: 'grid', label: grid.label, value: grid.value } }
  return { value, hit: null }
}
