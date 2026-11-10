import { useMemo } from 'react'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { describeStrokeGeometry, STEM_SHAPE_LABEL } from '../src/services/strokeGrammar'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, GlyphInkPlacement, ResolvedStrokeInkSource, StrokeDataV2 } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { EDIT_COLOR } from './editColors'

/**
 * 맺음 비스듬히 자르기(손글씨 실험실). 엔진에는 맺음 꼴을 바꾸는 길이 없어서, 그려진 획 끝에 쐐기 하나를 덧그려 끝 면을 기울인다.
 * 그래서 기울인 쪽으로 획이 굵기 × tan(각)만큼 길어진다 — 깎는 게 아니라 붙이는 것이다. 끝 모양이 둥글면(꺾임 모두 굴리기) 안 맞는다.
 */

/** 이 획의 이 모양 마디 맺음을 몇 도로 자를지. 없거나 0이면 안 자른다. */
export type CutAngleResolver = (source: ResolvedStrokeInkSource, shapeLabel: string) => number | undefined
export interface TailCut { source: ResolvedStrokeInkSource; points: string }

const V = 100
type Prim = { stroke: StrokeDataV2; box: Readonly<BoxConfig>; source: ResolvedStrokeInkSource; weightMultiplier: number }

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
      // 획 끝 면(굵기만큼의 선분)에서 한쪽 귀만 앞으로 민 세모. 이음매가 안 보이게 뒤로 살짝 겹친다.
      const back = 0.4
      const a = { x: end.x + n.x * t / 2 - d.x * back, y: end.y + n.y * t / 2 - d.y * back }
      const b = { x: end.x - n.x * t / 2 - d.x * back, y: end.y - n.y * t / 2 - d.y * back }
      const base = angle > 0 ? a : b
      const ext = t * Math.tan(Math.abs(angle) * Math.PI / 180) + back
      const c = { x: base.x + d.x * ext, y: base.y + d.y * ext }
      out.push({ source, points: [a, b, c].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') })
    }
  }
  return out
}

/** 글자 하나의 맺음 쐐기. 자르는 규칙이 없으면(`angleOf` 없음) 획을 풀지 않는다. */
export function useTailCuts(syllable: DecomposedSyllable, placement: GlyphInkPlacement, style: GlobalStyle, angleOf: CutAngleResolver | null | undefined): TailCut[] {
  return useMemo(() => {
    if (!angleOf) return []
    const resolved = resolveGlyphInkPrimitives({ syllable, placement, weightMultiplier: weightToMultiplier(style.weight), globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    return tailCutsOf(resolved.primitives.map((p) => ({ stroke: p.stroke as StrokeDataV2, box: p.box, source: p.source, weightMultiplier: p.weightMultiplier })), angleOf)
  }, [syllable, placement, style.weight, style.linecap, style.linejoin, angleOf])
}

/** `SvgRenderer`의 `children`으로 넣는다(글자 viewBox 0–100, 기울기 그룹 안). */
export function TailCutInk({ cuts, colorOf, hidden }: { cuts: readonly TailCut[]; colorOf?: (source: ResolvedStrokeInkSource) => string | undefined; hidden?: (source: ResolvedStrokeInkSource) => boolean }) {
  return <>{cuts.filter((cut) => !hidden?.(cut.source)).map((cut, i) => <polygon key={i} points={cut.points} fill={colorOf?.(cut.source) ?? EDIT_COLOR.foreground} pointerEvents="none" />)}</>
}
