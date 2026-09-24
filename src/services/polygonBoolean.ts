import { ClipperD, ClipType, FillRule, PolyTreeD } from 'clipper2-ts'
import type { PathD, PathsD, PolyPathD } from 'clipper2-ts'

/**
 * 면 Boolean. `polygon-clipping`과 같은 모양을 주고받는다 — 링은 `[x, y]` 쌍,
 * 결과 링은 닫힘(첫 점을 끝에 한 번 더), 바깥은 CCW · 구멍은 CW(y 위쪽 수학 좌표 기준 부호).
 *
 * 계산은 Clipper2(정수 좌표)가 한다. `polygon-clipping`은 거의 겹친 가는 사각형 여러 장을
 * 합칠 때 끝나지 않는 루프에 빠졌다(2026-09-24, `싸` 첫닿자를 납작하게 누른 카드).
 * 정수 격자라 그런 루프가 없다.
 */
export type Pair = [number, number]
export type Ring = Pair[]
export type Polygon = Ring[]
export type MultiPolygon = Polygon[]
export type Geom = Polygon | MultiPolygon

/** 소수 8자리 격자. em(0–1) 좌표는 1e-8, CFF(1000 단위) 좌표도 정수 범위 안에 든다. */
const PRECISION = 8

function isMultiPolygon(geom: Geom): geom is MultiPolygon {
  return Array.isArray(geom[0]?.[0]?.[0])
}

function signedArea(path: PathD): number {
  let area = 0
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index]
    const next = path[(index + 1) % path.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

// 입력 방향을 믿지 않는다. 바깥은 +, 구멍은 −로 돌려 NonZero로 채우면 링 순서만으로 뜻이 선다.
function toPaths(geom: Geom): PathsD {
  const polygons = isMultiPolygon(geom) ? geom : [geom]
  const paths: PathsD = []
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => {
      const path = ring.map(([x, y]) => ({ x, y }))
      if (path.length < 3) return
      const area = signedArea(path)
      if (area === 0) return
      paths.push((index === 0) === (area > 0) ? path : path.reverse())
    })
  }
  return paths
}

function toRing(path: PathD, outer: boolean): Ring {
  const oriented = (signedArea(path) > 0) === outer ? path : [...path].reverse()
  const ring = oriented.map((point): Pair => [point.x, point.y])
  ring.push([ring[0][0], ring[0][1]])
  return ring
}

// 바깥 → 그 구멍들 → 구멍 안의 섬은 다시 새 다각형으로.
function collect(node: PolyPathD, out: MultiPolygon): void {
  for (let index = 0; index < node.count; index += 1) {
    const outer = node.child(index)
    if (!outer.poly || outer.poly.length < 3) continue
    const polygon: Polygon = [toRing(outer.poly, true)]
    out.push(polygon)
    for (let holeIndex = 0; holeIndex < outer.count; holeIndex += 1) {
      const hole = outer.child(holeIndex)
      if (hole.poly && hole.poly.length >= 3) polygon.push(toRing(hole.poly, false))
    }
    for (let holeIndex = 0; holeIndex < outer.count; holeIndex += 1) collect(outer.child(holeIndex), out)
  }
}

function run(clipType: ClipType, subject: PathsD, clip: PathsD): MultiPolygon {
  const clipper = new ClipperD(PRECISION)
  // 한 직선 위 중간점은 버린다(polygon-clipping과 같게).
  clipper.preserveCollinear = false
  clipper.addSubjectPaths(subject)
  if (clip.length) clipper.addClipPaths(clip)
  const tree = new PolyTreeD()
  clipper.execute(clipType, FillRule.NonZero, tree)
  const out: MultiPolygon = []
  collect(tree, out)
  return out
}

export function union(geom: Geom, ...geoms: Geom[]): MultiPolygon {
  return run(ClipType.Union, [geom, ...geoms].flatMap(toPaths), [])
}

export function intersection(subject: Geom, clip: Geom): MultiPolygon {
  return run(ClipType.Intersection, toPaths(subject), toPaths(clip))
}

export function difference(subject: Geom, clip: Geom): MultiPolygon {
  return run(ClipType.Difference, toPaths(subject), toPaths(clip))
}

export function xor(subject: Geom, clip: Geom): MultiPolygon {
  return run(ClipType.Xor, toPaths(subject), toPaths(clip))
}
