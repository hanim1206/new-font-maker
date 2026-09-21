import type { BoxConfig, Part, StrokeDataV2 } from '../src/types'
import { PART_LABEL } from './partColors'
import { snapRail } from './railSnap'
import type { SnapCandidate, SnapHit } from './railSnap'

/**
 * 획 편집의 끌기 스냅. 레이아웃의 기준선 스냅(`snapRail`)을 그대로 쓴다 — 같은 우선순위(처음 자리 → 기준선 · 다른 획 → 격자), 같은 반경(em).
 * 축마다 따로 건다. 그래서 가로로 끄는 동안 y는 `처음 자리`에 붙어 있고(손 떨림이 안 들어감), 반경을 넘게 벗어나야 사선으로 풀린다.
 * 모든 값은 em(글자 칸 0~1).
 */

export interface SnapAnchors { x: readonly number[]; y: readonly number[] }
export interface StrokeSnapResult { delta: { x: number; y: number }; hits: { x: SnapHit | null; y: SnapHit | null } }

const KIND_RANK: Record<SnapHit['kind'], number> = { model: 0, rail: 1, grid: 2 }
const STRAIGHT_EPSILON = 1e-6

function snapAxis(axis: 'x' | 'y', anchors: readonly number[], requested: number, candidates: readonly SnapCandidate[]): { delta: number; hit: SnapHit | null } {
  let best: { delta: number; hit: SnapHit; shift: number } | null = null
  for (const anchor of anchors) {
    const result = snapRail({ value: anchor + requested, original: anchor, axis, candidates })
    if (!result.hit) continue
    const shift = Math.abs(result.value - (anchor + requested))
    // 센 것이 이긴다(처음 자리 > 기준선 > 격자). 같으면 덜 움직이는 쪽.
    if (!best || KIND_RANK[result.hit.kind] < KIND_RANK[best.hit.kind] || (KIND_RANK[result.hit.kind] === KIND_RANK[best.hit.kind] && shift < best.shift)) {
      best = { delta: result.value - anchor, hit: result.hit.kind === 'model' ? { ...result.hit, label: '처음 자리' } : result.hit, shift }
    }
  }
  return best ? { delta: best.delta, hit: best.hit } : { delta: requested, hit: null }
}

/** 요청한 이동(em)을 스냅한 이동으로 바꾼다. 닻이 없는 축은 그대로 둔다. */
export function snapStrokeDrag(input: { anchors: SnapAnchors; requested: { x: number; y: number }; candidates: readonly SnapCandidate[] }): StrokeSnapResult {
  const x = snapAxis('x', input.anchors.x, input.requested.x, input.candidates)
  const y = snapAxis('y', input.anchors.y, input.requested.y, input.candidates)
  return { delta: { x: x.delta, y: y.delta }, hits: { x: x.hit, y: y.hit } }
}

const emPoint = (point: { x: number; y: number }, box: BoxConfig) => ({ x: box.x + point.x * box.width, y: box.y + point.y * box.height })

/** 곧은 가로 · 세로 획인지. 곡선 핸들이 있으면 곧지 않다. */
function straightAxisOf(stroke: StrokeDataV2): 'horizontal' | 'vertical' | null {
  if (stroke.points.length < 2 || stroke.points.some((point) => point.handleIn || point.handleOut)) return null
  const first = stroke.points[0]
  if (stroke.points.every((point) => Math.abs(point.y - first.y) < STRAIGHT_EPSILON)) return 'horizontal'
  if (stroke.points.every((point) => Math.abs(point.x - first.x) < STRAIGHT_EPSILON)) return 'vertical'
  return null
}

/** 획 몸통을 끌 때 걸리는 자리: 곧은 획은 중심선 하나와 두 끝, 아니면 꼭짓점 전부. */
export function strokeBodyAnchors(stroke: StrokeDataV2, box: BoxConfig): SnapAnchors {
  const points = stroke.points.map((point) => emPoint(point, box))
  const axis = straightAxisOf(stroke)
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  if (axis === 'horizontal') return { x: [Math.min(...xs), Math.max(...xs)], y: [ys[0]] }
  if (axis === 'vertical') return { x: [xs[0]], y: [Math.min(...ys), Math.max(...ys)] }
  return { x: xs, y: ys }
}

export const pointAnchors = (point: { x: number; y: number }, box: BoxConfig): SnapAnchors => {
  const em = emPoint(point, box)
  return { x: [em.x], y: [em.y] }
}

export interface SnapStrokeSource { strokeId: string; label: string; stroke: StrokeDataV2; box: BoxConfig }

/** 같은 글자 안 획에서 나오는 후보: 곧은 획의 중심선, 그리고 모든 획의 두 끝점. id는 `stroke:<획>:center` · `stroke:<획>:p<번호>`. */
export function strokeSnapCandidates(sources: readonly SnapStrokeSource[]): SnapCandidate[] {
  return sources.flatMap(({ strokeId, label, stroke, box }) => {
    const axis = straightAxisOf(stroke)
    const out: SnapCandidate[] = []
    if (axis === 'horizontal') out.push({ id: `stroke:${strokeId}:center`, label: `${label} 중심`, axis: 'y', value: emPoint(stroke.points[0], box).y })
    if (axis === 'vertical') out.push({ id: `stroke:${strokeId}:center`, label: `${label} 중심`, axis: 'x', value: emPoint(stroke.points[0], box).x })
    const ends = stroke.closed ? [] : [0, stroke.points.length - 1]
    for (const index of new Set(ends)) {
      const em = emPoint(stroke.points[index], box)
      out.push({ id: `stroke:${strokeId}:p${index}`, label: `${label} 끝`, axis: 'x', value: em.x }, { id: `stroke:${strokeId}:p${index}`, label: `${label} 끝`, axis: 'y', value: em.y })
    }
    return out
  })
}

/** 부품 상자 네 변(잉크 바깥면, 기준 틀의 바깥면). */
export function faceSnapCandidates(parts: readonly { part: Part; faces: { left: number; right: number; top: number; bottom: number } }[]): SnapCandidate[] {
  return parts.flatMap(({ part, faces }) => [
    { id: `face:${part}:left`, label: `${PART_LABEL[part]} 왼변`, axis: 'x' as const, value: faces.left },
    { id: `face:${part}:right`, label: `${PART_LABEL[part]} 오른변`, axis: 'x' as const, value: faces.right },
    { id: `face:${part}:top`, label: `${PART_LABEL[part]} 윗변`, axis: 'y' as const, value: faces.top },
    { id: `face:${part}:bottom`, label: `${PART_LABEL[part]} 아랫변`, axis: 'y' as const, value: faces.bottom },
  ])
}

/** 끄는 것 자신에게서 나온 후보를 뺀다. 몸통을 끌면 그 획 전부, 점을 끌면 그 획의 중심선과 그 점. */
export function withoutOwnCandidates(candidates: readonly SnapCandidate[], dragged: { strokeId: string; pointIndex?: number }): SnapCandidate[] {
  const own = `stroke:${dragged.strokeId}:`
  return candidates.filter((candidate) => {
    if (!candidate.id.startsWith(own)) return true
    if (dragged.pointIndex === undefined) return false
    return candidate.id !== `${own}center` && candidate.id !== `${own}p${dragged.pointIndex}`
  })
}
