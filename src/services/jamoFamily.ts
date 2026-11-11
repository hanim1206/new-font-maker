// 닿자 가족 — 가장 간단한 자모를 먼저 만들면, 같은 가족의 뒤 자모가 그 꼴을 이어받는다.
// 이어받은 점은 앞 자모의 점을 계속 가리킨다. 앞을 고치면 뒤로 전파되고, 뒤에서는 그 점을 직접 못 움직인다(끊으면 따로 간다).
// 이어 붙는 관계는 프리셋 획 모양에서 찾는다: 앞 자모를 뒤 자모 안의 자리(region)로 옮겨 놓았을 때 겹치는 점끼리 잇는다.
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'
import { frameOf } from '../utils/jamoFrame'

export interface XY { x: number; y: number }
interface Region { x0: number; y0: number; x1: number; y1: number }

/** 뒤 자모가 앞 자모를 어디에 품는가. strokes를 주면 그 획만 잇는다(ㅊ의 꼭지는 ㅎ의 꼭지만). */
export interface FamilyRelation { parent: string; regions: Region[]; strokes?: string[]; into?: string[] }

export interface FamilyStage { id: string; name: string; members: string[] }

export const FAMILY_STAGES: FamilyStage[] = [
  { id: 'giyeok', name: 'ㄱ 가족', members: ['ㄱ', 'ㅋ', 'ㄲ'] },
  { id: 'nieun', name: 'ㄴ 가족', members: ['ㄴ', 'ㄷ', 'ㅌ', 'ㄸ', 'ㄹ'] },
  { id: 'mieum', name: 'ㅁ 가족', members: ['ㅁ', 'ㅂ', 'ㅍ', 'ㅃ'] },
  { id: 'ieung', name: 'ㅇ 가족', members: ['ㅇ', 'ㅎ'] },
  { id: 'siot', name: 'ㅅ 가족', members: ['ㅅ', 'ㅈ', 'ㅊ', 'ㅆ', 'ㅉ'] },
]

const FULL: Region = { x0: 0, y0: 0, x1: 1, y1: 1 }

/** 앞 자모에서 이어받는 자리. 순서대로 찾고, 먼저 맞은 것이 이긴다. */
export const FAMILY_RELATIONS: Record<string, FamilyRelation[]> = {
  'ㅋ': [{ parent: 'ㄱ', regions: [FULL] }],
  'ㄲ': [{ parent: 'ㄱ', regions: [{ x0: 0, y0: 0, x1: 0.37, y1: 1 }, { x0: 0.598, y0: 0, x1: 0.978, y1: 0.728 }] }],
  'ㄷ': [{ parent: 'ㄴ', regions: [FULL] }],
  'ㅌ': [{ parent: 'ㄷ', regions: [FULL] }],
  'ㄸ': [{ parent: 'ㄷ', regions: [{ x0: 0, y0: 0.007, x1: 0.5625, y1: 0.961 }, { x0: 0.587, y0: 0.004, x1: 1, y1: 0.99 }] }],
  'ㄹ': [{ parent: 'ㄷ', regions: [{ x0: 0, y0: 0.493, x1: 1, y1: 1 }] }],
  'ㅂ': [{ parent: 'ㅁ', regions: [FULL] }],
  'ㅍ': [{ parent: 'ㅂ', regions: [FULL] }],
  'ㅃ': [{ parent: 'ㅂ', regions: [{ x0: 0.061, y0: 0, x1: 0.395, y1: 1 }, { x0: 0.612, y0: 0, x1: 0.946, y1: 1 }] }],
  'ㅎ': [{ parent: 'ㅇ', regions: [{ x0: 0.169, y0: 0.447, x1: 0.831, y1: 1 }] }],
  'ㅈ': [{ parent: 'ㅅ', regions: [FULL] }],
  'ㅊ': [
    // 꼭지는 ㅎ에서 배운다 — ㅎ 맨 위 0.213 높이를 ㅊ 맨 위 0.247 높이로
    { parent: 'ㅎ', regions: [{ x0: 0, y0: 0, x1: 1, y1: 1.16 }], strokes: ['ㅎ-1'], into: ['ㅊ-dot'] },
    { parent: 'ㅈ', regions: [{ x0: 0, y0: 0.247, x1: 1, y1: 1 }] },
  ],
  'ㅆ': [{ parent: 'ㅅ', regions: [{ x0: 0, y0: 0, x1: 0.523, y1: 1 }, { x0: 0.5, y0: 0, x1: 1, y1: 1 }] }],
  'ㅉ': [{ parent: 'ㅈ', regions: [{ x0: 0, y0: 0, x1: 0.472, y1: 0.95 }, { x0: 0.472, y0: 0, x1: 1, y1: 1 }] }],
}

const MATCH_TOL = 0.09

export interface PointLink { parent: string; stroke: string; index: number; sx: number; sy: number }
/** 자모 → 획 id → 점 번호 → 이어받은 앞 점(없으면 그 자모 것). */
export type FamilyLinks = Record<string, Record<string, (PointLink | null)[]>>

const bboxOf = (strokes: readonly StrokeDataV2[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of strokes) for (const p of s.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x0, y0, x1, y1 }
}

/** 프리셋 획에서 이어받는 점을 찾는다. */
export function findFamilyLinks(presets: Record<string, StrokeDataV2[]>): FamilyLinks {
  const links: FamilyLinks = {}
  for (const stage of FAMILY_STAGES) for (const ch of stage.members) {
    const strokes = presets[ch] ?? []
    links[ch] = Object.fromEntries(strokes.map((s) => [s.id, s.points.map(() => null as PointLink | null)]))
    // 짝 후보 = (관계 · 자리 · 앞 획). 뒤 획마다 가장 많은 점이 겹치는 후보부터(같으면 더 가까운 것) 잇는다.
    // ㅈ의 왼다리가 ㅅ의 오른다리 머리에, ㄸ의 오른 ㄷ이 왼 ㄷ 자리에 붙지 않게 하려는 것이다.
    const candidates = (FAMILY_RELATIONS[ch] ?? []).flatMap((rel) => {
      const pb = bboxOf(presets[rel.parent] ?? [])
      const pw = Math.max(pb.x1 - pb.x0, 1e-6), ph = Math.max(pb.y1 - pb.y0, 1e-6)
      return rel.regions.flatMap((r) => {
        const sx = (r.x1 - r.x0) / pw, sy = (r.y1 - r.y0) / ph
        const place = (q: XY): XY => ({ x: r.x0 + (q.x - pb.x0) * sx, y: r.y0 + (q.y - pb.y0) * sy })
        return (presets[rel.parent] ?? []).filter((ps) => !rel.strokes || rel.strokes.includes(ps.id))
          .map((ps) => ({ rel, ps, sx, sy, placed: ps.points.map(place) }))
      })
    })
    for (const s of strokes) {
      const row = links[ch][s.id]
      const scored = candidates.filter((c) => !c.rel.into || c.rel.into.includes(s.id)).map((c) => {
        let n = 0, sum = 0
        s.points.forEach((p) => {
          const d = Math.min(...c.placed.map((m) => Math.hypot(m.x - p.x, m.y - p.y)))
          if (d < MATCH_TOL) { n++; sum += d }
        })
        return { c, n, sum }
      }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n || a.sum - b.sum)
      for (const { c } of scored) s.points.forEach((p, i) => {
        if (row[i]) return
        let best: PointLink | null = null, bestD = MATCH_TOL
        c.placed.forEach((m, k) => {
          const d = Math.hypot(m.x - p.x, m.y - p.y)
          if (d < bestD) { bestD = d; best = { parent: c.rel.parent, stroke: c.ps.id, index: k, sx: c.sx, sy: c.sy } }
        })
        if (best) row[i] = best
      })
    }
  }
  return links
}

/** 사용자가 직접 옮긴 양(점마다). 끊은 획은 cut에 들어간다. */
export interface FamilyEdits {
  moves: Record<string, Record<string, Record<number, XY>>>
  cut: Record<string, string[]>
}
export const emptyFamilyEdits = (): FamilyEdits => ({ moves: {}, cut: {} })

const isCut = (edits: FamilyEdits, ch: string, stroke: string) => !!edits.cut[ch]?.includes(stroke)

/** 이 점이 지금 앞 자모를 가리키는가(끊었으면 아니다). */
export function linkOf(links: FamilyLinks, edits: FamilyEdits, ch: string, stroke: string, index: number): PointLink | null {
  if (isCut(edits, ch, stroke)) return null
  return links[ch]?.[stroke]?.[index] ?? null
}

/** 프리셋에서 얼마나 옮겨졌나 = 내 손 + 이어받은 앞 점의 옮김(자리 크기만큼 줄여서). */
export function deltaOf(links: FamilyLinks, edits: FamilyEdits, ch: string, stroke: string, index: number, depth = 0): XY {
  const own = edits.moves[ch]?.[stroke]?.[index] ?? { x: 0, y: 0 }
  const link = depth < 8 ? linkOf(links, edits, ch, stroke, index) : null
  if (!link) return own
  const up = deltaOf(links, edits, link.parent, link.stroke, link.index, depth + 1)
  return { x: own.x + up.x * link.sx, y: own.y + up.y * link.sy }
}

const shift = (p: AnchorPoint, d: XY): AnchorPoint => ({
  x: p.x + d.x, y: p.y + d.y,
  ...(p.handleIn ? { handleIn: { x: p.handleIn.x + d.x, y: p.handleIn.y + d.y } } : {}),
  ...(p.handleOut ? { handleOut: { x: p.handleOut.x + d.x, y: p.handleOut.y + d.y } } : {}),
})

/** 지금 보이는 획 — 프리셋 + 옮김. 손잡이는 점과 같이 움직인다. */
export function familyStrokes(presets: Record<string, StrokeDataV2[]>, links: FamilyLinks, edits: FamilyEdits, ch: string): StrokeDataV2[] {
  return (presets[ch] ?? []).map((s) => ({ ...s, points: s.points.map((p, i) => shift(p, deltaOf(links, edits, ch, s.id, i))) }))
}

/** 점 하나를 옮긴다(이어받은 점은 못 옮긴다 — 끊어야 한다). */
export function moveFamilyPoint(links: FamilyLinks, edits: FamilyEdits, ch: string, stroke: string, index: number, by: XY): FamilyEdits {
  if (linkOf(links, edits, ch, stroke, index)) return edits
  const prev = edits.moves[ch]?.[stroke]?.[index] ?? { x: 0, y: 0 }
  return {
    ...edits,
    moves: { ...edits.moves, [ch]: { ...edits.moves[ch], [stroke]: { ...edits.moves[ch]?.[stroke], [index]: { x: prev.x + by.x, y: prev.y + by.y } } } },
  }
}

/** 획 하나를 끊는다 — 지금 이어받은 모양을 내 것으로 굳히고, 앞으로는 따로 간다. */
export function cutFamilyStroke(presets: Record<string, StrokeDataV2[]>, links: FamilyLinks, edits: FamilyEdits, ch: string, stroke: string): FamilyEdits {
  if (isCut(edits, ch, stroke)) return edits
  const s = presets[ch]?.find((t) => t.id === stroke)
  if (!s) return edits
  const frozen = Object.fromEntries(s.points.map((_, i) => [i, deltaOf(links, edits, ch, stroke, i)]))
  return { moves: { ...edits.moves, [ch]: { ...edits.moves[ch], [stroke]: frozen } }, cut: { ...edits.cut, [ch]: [...(edits.cut[ch] ?? []), stroke] } }
}

/** 끊은 획을 다시 잇는다 — 내 손으로 옮긴 것은 버린다. */
export function relinkFamilyStroke(edits: FamilyEdits, ch: string, stroke: string): FamilyEdits {
  const moves = { ...edits.moves[ch] }
  delete moves[stroke]
  return { moves: { ...edits.moves, [ch]: moves }, cut: { ...edits.cut, [ch]: (edits.cut[ch] ?? []).filter((s) => s !== stroke) } }
}

/** 프리셋 닿자 획을 자모별로 모은다. */
export function presetConsonantStrokes(jamo: (ch: string) => JamoData | undefined): Record<string, StrokeDataV2[]> {
  const out: Record<string, StrokeDataV2[]> = {}
  for (const stage of FAMILY_STAGES) for (const ch of stage.members) out[ch] = jamo(ch)?.strokes ?? []
  return out
}

/** 자모의 획마다 점마다 프리셋에서 옮겨진 양. 하나도 안 옮겨졌으면 null. */
export function familyDeltas(presets: Record<string, StrokeDataV2[]>, links: FamilyLinks, edits: FamilyEdits, ch: string): XY[][] | null {
  const out = (presets[ch] ?? []).map((s) => s.points.map((_, i) => deltaOf(links, edits, ch, s.id, i)))
  return out.some((row) => row.some((d) => Math.abs(d.x) > 1e-9 || Math.abs(d.y) > 1e-9)) ? out : null
}

const shiftStrokes = (strokes: StrokeDataV2[] | undefined, deltas: XY[][]): StrokeDataV2[] | undefined => {
  if (!strokes || strokes.length !== deltas.length || strokes.some((s, i) => s.points.length !== deltas[i].length)) return strokes
  return strokes.map((s, i) => ({ ...s, points: s.points.map((p, j) => shift(p, deltas[i][j])) }))
}

/**
 * 가족 캔버스에서 고친 꼴을 자모 데이터에 입힌다. 첫닿자 · 받침은 획 순서와 점 수가 같아서 같은 옮김을 그대로 쓴다.
 * 순서나 점 수가 다른 채널(문맥 변형 등)은 건드리지 않는다. 기준 틀은 프리셋으로 굳혀, 옮긴 점이 상자 안팎으로 그대로 보이게 한다.
 */
export function withFamilyDeltas(base: JamoData, deltas: XY[][]): JamoData {
  const contextStrokes = base.contextStrokes
    ? Object.fromEntries(Object.entries(base.contextStrokes).map(([k, v]) => [k, shiftStrokes(v, deltas)])) as JamoData['contextStrokes']
    : undefined
  return { ...base, strokes: shiftStrokes(base.strokes, deltas), ...(contextStrokes ? { contextStrokes } : {}), frame: frameOf(base) }
}
