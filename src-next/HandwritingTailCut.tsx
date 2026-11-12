import { useId, useMemo } from 'react'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { describeStrokeGeometry, STEM_SHAPE_LABEL } from '../src/services/strokeGrammar'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { PartStyle } from '../src/renderers/SvgRenderer'
import type { BoxConfig, DecomposedSyllable, GlyphInkPlacement, Part, ResolvedStrokeInkSource, StrokeDataV2 } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'

/**
 * 맺음 비스듬히 자르기(손글씨 실험실). 엔진에는 맺음 꼴을 바꾸는 길이 없어서, 그린 뒤 파트 잉크에 가림판(SVG mask)을 걸어 끝을 깎는다.
 * 긴 귀는 원래 끝 그대로 두고 짧은 쪽 귀만 굵기 × tan(각)만큼 깎는다 — 줄기 길이와 보선이 지켜진다(사용자 11-11).
 * 끝 모양이 둥글면(꺾임 모두 굴리기) 깎은 면과 안 맞는다.
 */

/** 이 획의 이 모양 마디 맺음을 몇 도로 자를지. 없거나 0이면 안 자른다. */
export type CutAngleResolver = (source: ResolvedStrokeInkSource, shapeLabel: string) => number | undefined
export interface TailCut { source: ResolvedStrokeInkSource; points: string }

const V = 100
type Prim = { stroke: StrokeDataV2; box: Readonly<BoxConfig>; source: ResolvedStrokeInkSource; weightMultiplier: number; effectiveLinecap?: string }

/**
 * 맺음이 열렸는지. 획 문법은 끝에서 0.1 안에 다른 획이 있으면 닿은 끝으로 읽는데, 그러면 곁줄기 아래로 조금 내려온 기둥 끝(ㅞ의 안 기둥)까지
 * 막힌 끝이 된다. 맺음은 끝이 다른 획 밖으로 나와 있으면 열린 것으로 본다 — 끝 점이 다른 획에서 이만큼(자모 상자 기준) 떨어져 있으면 열림.
 */
const TAIL_GAP = 0.05
export function tailIsOpen(stroke: StrokeDataV2, point: number, others: readonly StrokeDataV2[]): boolean {
  const p = stroke.points[point]
  const toSeg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
  }
  return others.every((other) => {
    const pts = other.closed ? [...other.points, other.points[0]] : other.points
    return pts.slice(1).every((q, i) => toSeg(pts[i], q) > TAIL_GAP)
  })
}

export function tailCutsOf(primitives: readonly Prim[], angleOf: CutAngleResolver): TailCut[] {
  const out: TailCut[] = []
  for (const prim of primitives) {
    const { stroke, box, source } = prim
    if (stroke.closed || stroke.points.length < 2) continue
    const others = primitives.filter((p) => p.source.part === source.part && p.source.channel === source.channel && p.stroke.id !== stroke.id).map((p) => p.stroke)
    const pts = stroke.points
    const view = (p: { x: number; y: number }) => ({ x: (box.x + p.x * box.width) * V, y: (box.y + p.y * box.height) * V })
    for (const seg of describeStrokeGeometry(stroke, others).segments) {
      const tail = seg.tail
      if (!tail || tail.kind !== 'end' || !(tail.open || tailIsOpen(stroke, tail.point, others))) continue
      const angle = angleOf(source, STEM_SHAPE_LABEL[seg.shape])
      if (!angle) continue
      const i = tail.point
      const nb = i === 0 ? (pts[0].handleOut ?? pts[1]) : (pts[i].handleIn ?? pts[i - 1])
      const end = view(pts[i]), from = view(nb)
      const len = Math.hypot(end.x - from.x, end.y - from.y)
      const t = stroke.thickness * prim.weightMultiplier * V
      if (!len || t <= 0) continue
      const d = { x: (end.x - from.x) / len, y: (end.y - from.y) / len }
      const n = { x: -d.y, y: d.x }
      // 끝 면의 두 귀. 각이 양수면 A(획 방향 왼쪽)가 긴 귀로 남고 B가 깎인다.
      const A0 = { x: end.x + n.x * t / 2, y: end.y + n.y * t / 2 }
      const B0 = { x: end.x - n.x * t / 2, y: end.y - n.y * t / 2 }
      const [keep, cut, side] = angle > 0 ? [A0, B0, -1] : [B0, A0, 1]
      const ext = t * Math.tan(Math.abs(angle) * Math.PI / 180)
      const c = { x: cut.x - d.x * ext, y: cut.y - d.y * ext }
      // 가림판 세모: 긴 귀 → 깎인 면 끝(c) → 깎이는 귀 바깥. 네모 끝(square)이면 끝 너머 반 굵기까지 덮는다. 경계가 비치지 않게 조금 넉넉히.
      const over = (prim.effectiveLinecap === 'square' ? t / 2 : 0) + 0.3
      const f = { x: keep.x - c.x, y: keep.y - c.y }
      const p1 = { x: keep.x + f.x * 0.15, y: keep.y + f.y * 0.15 }
      const p2 = { x: c.x - f.x * 0.15 + n.x * side * 0.3, y: c.y - f.y * 0.15 + n.y * side * 0.3 }
      const p3 = { x: cut.x + d.x * over + n.x * side * 0.3, y: cut.y + d.y * over + n.y * side * 0.3 }
      const points = [p1, p2, p3]
      out.push({ source, points: points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') })
    }
  }
  return out
}

/** 글자 하나의 맺음 가림판 세모. 자르는 규칙이 없으면(`angleOf` 없음) 획을 풀지 않는다. */
export function useTailCuts(syllable: DecomposedSyllable, placement: GlyphInkPlacement, style: GlobalStyle, angleOf: CutAngleResolver | null | undefined): TailCut[] {
  return useMemo(() => {
    if (!angleOf) return []
    const resolved = resolveGlyphInkPrimitives({ syllable, placement, weightMultiplier: weightToMultiplier(style.weight), globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    return tailCutsOf(resolved.primitives.map((p) => ({ stroke: p.stroke as StrokeDataV2, box: p.box, source: p.source, weightMultiplier: p.weightMultiplier, effectiveLinecap: p.effectiveLinecap })), angleOf)
  }, [syllable, placement, style.weight, style.linecap, style.linejoin, angleOf])
}

/**
 * 깎을 가림판. `partStyles`는 렌더러에 그대로 넘기고(받은 `base`에 `mask`만 얹는다), `defs`는 `children`으로 넣는다.
 * 가림판은 파트마다 하나 — 그 파트 잉크 묶음 전체에 걸리고, 깎는 세모는 획 끝 굵기 안쪽이라 다른 획은 거의 안 건드린다.
 */
export function useTailCutMask(cuts: readonly TailCut[], base?: Partial<Record<Part, PartStyle>>): { partStyles: Partial<Record<Part, PartStyle>> | undefined; defs: React.ReactNode } {
  const raw = useId()
  const idBase = `tailcut${raw.replace(/:/g, '')}`
  return useMemo(() => {
    if (!cuts.length) return { partStyles: base, defs: null }
    const byPart = new Map<Part, TailCut[]>()
    cuts.forEach((cut) => byPart.set(cut.source.part, [...(byPart.get(cut.source.part) ?? []), cut]))
    const partStyles: Partial<Record<Part, PartStyle>> = { ...base }
    byPart.forEach((_, part) => { partStyles[part] = { ...partStyles[part], mask: `url(#${idBase}-${part})` } })
    const defs = <defs>{[...byPart.entries()].map(([part, list]) => <mask key={part} id={`${idBase}-${part}`} maskUnits="userSpaceOnUse" x={-100} y={-100} width={300} height={300}>
      <rect x={-100} y={-100} width={300} height={300} fill="#fff" />
      {list.map((cut, i) => <polygon key={i} points={cut.points} fill="#000" />)}
    </mask>)}</defs>
    return { partStyles, defs }
  }, [cuts, base, idBase])
}
