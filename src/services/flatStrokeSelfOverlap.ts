import { ClipperD, ClipType, EndType, FillRule, JoinType, PolyTreeD, inflatePathsD } from 'clipper2-ts'
import type { PathD, PolyPathD } from 'clipper2-ts'
import type { StrokeLinecap, StrokeLinejoin } from '../types'
import type { BrushContour, BrushInkGroup, BrushPoint } from './brushGeometry'
import { DEFAULT_MITER_LIMIT } from './strokeJoin'

/**
 * 일자 스트로커가 만든 윤곽이 스스로 겹칠 때의 대체 경로.
 *
 * 일자 스트로커는 중심선을 양쪽으로 반폭씩 민 링을 만든다. 곡선이 반폭보다 급하게 꺾이면(ㅎ의 ㅇ 위 점을 끌어 핸들을 위로 모은 뾰족한 자리)
 * 안쪽 오프셋이 뒤집혀 고리가 생긴다. 그 링을 evenodd로 칠하면 획 안에 쐐기가 뚫리고,
 * 최종 잉크(카드 · OTF)는 스스로 겹친 링을 거부해 그 자소가 통째로 빠진다(2026-09-28).
 * 겹칠 때만 중심선을 Clipper2 오프셋(두께 절반, 겹친 부분은 합친다)으로 다시 만든다. 겹치지 않는 획은 그대로다.
 * 대체 경로에서는 대비(토막별 두께)와 모서리별 둥글기 반지름을 못 따른다 — 이미 깨진 모양을 메우는 길이라서다.
 */

/** 소수 8자리 격자. `polygonBoolean`과 같다. */
const PRECISION = 8

type Pair = { x: number; y: number }

function cross(a: Pair, b: Pair, c: Pair): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** 두 선분이 끝점 공유 없이 제대로 가로지르는지. 스치기만 하는 건 겹침으로 안 본다. */
function segmentsCross(a: Pair, b: Pair, c: Pair, d: Pair): boolean {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)) return false
  if (Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function ringsCross(first: readonly Pair[], second: readonly Pair[] | null): boolean {
  const other = second ?? first
  for (let i = 0; i < first.length; i += 1) {
    const a = first[i], b = first[(i + 1) % first.length]
    for (let j = second ? 0 : i + 2; j < other.length; j += 1) {
      // 같은 링에서는 이웃 변(끝점을 나눈 변)을 건너뛴다.
      if (!second && (j + 1) % other.length === i) continue
      if (segmentsCross(a, b, other[j], other[(j + 1) % other.length])) return true
    }
  }
  return false
}

/** 윤곽 묶음 중 스스로 겹치거나 서로 가로지르는 링이 있는지. 한 묶음 = [바깥, ...구멍]. */
export function flatGroupsOverlap(groups: readonly BrushInkGroup[]): boolean {
  return groups.some((group) => group.some((ring, index) => ringsCross(ring, null) || group.slice(index + 1).some((other) => ringsCross(ring, other))))
}

function collect(node: PolyPathD, out: BrushInkGroup[]): void {
  for (let index = 0; index < node.count; index += 1) {
    const outer = node.child(index)
    if (!outer.poly || outer.poly.length < 3) continue
    const group: BrushContour[] = [outer.poly.map(({ x, y }) => ({ x, y }))]
    for (let holeIndex = 0; holeIndex < outer.count; holeIndex += 1) {
      const hole = outer.child(holeIndex)
      if (hole.poly && hole.poly.length >= 3) group.push(hole.poly.map(({ x, y }) => ({ x, y })))
    }
    out.push(group)
    for (let holeIndex = 0; holeIndex < outer.count; holeIndex += 1) collect(outer.child(holeIndex), out)
  }
}

/** 편 중심선을 반폭만큼 부풀린 면. 닫힌 획은 띠(안팎 두 링), 열린 획은 끝 모양을 따른다. */
export function inflateFlatCenterline(points: readonly BrushPoint[], closed: boolean, thickness: number, cap: StrokeLinecap, join: StrokeLinejoin, rounded: boolean, miterLimit = DEFAULT_MITER_LIMIT): BrushInkGroup[] {
  const path: PathD = points.map(({ x, y }) => ({ x, y }))
  if (closed && path.length > 1) {
    const first = path[0], last = path[path.length - 1]
    if (Math.abs(first.x - last.x) < 1e-12 && Math.abs(first.y - last.y) < 1e-12) path.pop()
  }
  if (path.length < 2) return []
  const joinType = rounded || join === 'round' ? JoinType.Round : join === 'bevel' ? JoinType.Bevel : JoinType.Miter
  const endType = closed ? EndType.Joined : cap === 'round' ? EndType.Round : cap === 'square' ? EndType.Square : EndType.Butt
  const inflated = inflatePathsD([path], thickness / 2, joinType, endType, miterLimit, PRECISION)
  if (!inflated.length) return []
  // 바깥 · 구멍 짝을 세운다.
  const clipper = new ClipperD(PRECISION)
  clipper.addSubjectPaths(inflated)
  const tree = new PolyTreeD()
  clipper.execute(ClipType.Union, FillRule.NonZero, tree)
  const out: BrushInkGroup[] = []
  collect(tree, out)
  return out
}
