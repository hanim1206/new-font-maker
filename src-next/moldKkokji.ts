import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, Part, StrokeDataV2 } from '../src/types'

/**
 * ㅗ 꼭지 자리(C026, 하니무스 2026-11-27 15:19 "ㅇㅇ"): 꼭지 높이에서 닿자 상자 폭 안 흰 넓이의 가운데에 꼭지를 세운다.
 * 닿자별 예외 없음 — 고딕 8벌 열넷에서 어긋남 평균 0.6%(거북이 study/jamo-branch-wing/10).
 * 닿자 밑이 고르게 비면(ㄷ ㄴ ㅅ ㅈ ㅁ) 상자 가운데, ㄱ · ㅋ처럼 내림이 오른쪽을 막으면 그만큼 왼쪽.
 * 기둥 · 보는 고정이고 꼭지만 옆으로 옮긴다. 닿자를 작게 하거나 키워도 그림에서 바로 다시 센다.
 */

/** 위로 꼭지 하나가 서는 홀자. ㅛ(꼭지 둘)는 뺀다. */
const UP_TICK = new Set([...'ㅗㅘㅙㅚ'])
const MIXED = new Set([...'ㅘㅙㅚ'])

type Boxes = Partial<Record<Part, BoxConfig>>
type Pt = { x: number; y: number }
type InkStyle = Pick<GlobalStyle, 'linecap' | 'linejoin'>

export interface KkokjiFit {
  /** 꼭지를 옮긴 양(글자 칸 좌표, + 오른쪽). */
  shift: number
  /** 흰 넓이 가운데(글자 칸 좌표). */
  center: number
  /** 꼭지가 서는 높이 띠(글자 칸 좌표). */
  band: readonly [number, number]
}

/** 한 높이 줄(또는 띠)에서 닿자 상자 폭 안 흰 구간들. 잉크 토막은 em 좌표 + 두께. */
function whitesOf(span: readonly [number, number], band: readonly [number, number], inks: readonly { points: readonly Pt[]; thickness: number }[]): [number, number][] {
  const [left, right] = span, [top, bottom] = band
  const blocks: [number, number][] = []
  for (const ink of inks) {
    const half = ink.thickness / 2
    for (let i = 0; i + 1 < ink.points.length; i++) {
      const a = ink.points[i], b = ink.points[i + 1]
      // 토막을 띠(두께만큼 넓힌)로 자른 가로 범위.
      const y0 = top - half, y1 = bottom + half
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y)
      if (hi < y0 || lo > y1) continue
      const at = (y: number) => (b.y === a.y ? null : a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y))
      const xs = [a.y >= y0 && a.y <= y1 ? a.x : null, b.y >= y0 && b.y <= y1 ? b.x : null, lo < y0 && hi > y0 ? at(y0) : null, lo < y1 && hi > y1 ? at(y1) : null].filter((x): x is number => x !== null)
      if (!xs.length) continue
      blocks.push([Math.min(...xs) - half, Math.max(...xs) + half])
    }
  }
  blocks.sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  let cursor = left
  for (const [b0, b1] of blocks) {
    if (b1 <= cursor) continue
    const end = Math.min(b0, right)
    if (end > cursor) out.push([cursor, end])
    cursor = Math.max(cursor, b1)
    if (cursor >= right) break
  }
  if (right > cursor) out.push([cursor, right])
  return out
}

/**
 * 꼭지 높이 띠 [위, 아래]에서 닿자 폭 [왼, 오른] 안 흰 넓이의 가운데. 띠를 여러 줄로 잘라 줄마다 흰 구간을 모두 모아
 * 흰 폭으로 무게를 둔 가운데를 낸다. 닿자 획이 다 막은 줄(꼭지 끝이 ㄷ 밑 가로에 붙은 곳)은 뺀다. 흰 곳이 없으면 폭 가운데.
 * 예전엔 줄마다 가장 넓은 흰 구간 하나만 봐서, 굵을 때 ㅉ 다리 끝 · ㅎ 고리 밑이 띠로 내려오면 한쪽 흰 곳만 잡아
 * 꼭지가 그쪽으로 쏠렸다(하니무스 2026-11-27 「쪽」 · 「횟」).
 */
export function whiteCenterOf(span: readonly [number, number], band: readonly [number, number], inks: readonly { points: readonly Pt[]; thickness: number }[], rows = 9): number {
  let sum = 0, weight = 0
  for (let i = 0; i < rows; i++) {
    const y = band[0] + (band[1] - band[0]) * (i + 0.5) / rows
    for (const [l, r] of whitesOf(span, [y, y], inks)) { sum += (l + r) / 2 * (r - l); weight += r - l }
  }
  return weight > 0 ? sum / weight : (span[0] + span[1]) / 2
}

/**
 * ㅗ 꼭지를 흰 넓이 가운데로 옮긴 음절. 칸으로 그리는 글자만, 꼭지 · 보를 못 찾으면 받은 그대로.
 * `multiplier`는 그릴 때 획 두께 배율(잉크 폭을 셀 때만 쓴다).
 */
export function kkokjiSyllable(syllable: DecomposedSyllable, boxes: Boxes, style: InkStyle, multiplier: number): { syllable: DecomposedSyllable; fit: KkokjiFit | null } {
  const ju = syllable.jungseong, ch = boxes.CH
  if (!ju || !ch || !UP_TICK.has(ju.char) || !syllable.choseong) return { syllable, fit: null }
  const part: Part = MIXED.has(ju.char) ? 'JU_H' : 'JU'
  const prims = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: 1, globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } }).primitives
  const em = prims.map((p) => ({ p, points: flattenStrokeCenterline(p.stroke as StrokeDataV2, p.box), thickness: p.stroke.thickness * multiplier }))
  const vowel = em.filter(({ p }) => p.source.part === part && p.stroke.points.length === 2 && !p.stroke.points.some((q) => q.handleIn || q.handleOut))
  const dir = (pts: readonly Pt[]) => { const a = pts[0], b = pts[pts.length - 1]; return { a, b, dx: b.x - a.x, dy: b.y - a.y } }
  const flats = vowel.filter(({ points }) => { const d = dir(points); return Math.abs(d.dx) > 2 * Math.abs(d.dy) })
  const ups = vowel.filter(({ points }) => { const d = dir(points); return Math.abs(d.dy) > 2 * Math.abs(d.dx) })
  if (!flats.length || !ups.length) return { syllable, fit: null }
  const bo = flats.reduce((m, s) => (Math.abs(dir(s.points).dx) > Math.abs(dir(m.points).dx) ? s : m))
  const boY = (bo.points[0].y + bo.points[bo.points.length - 1].y) / 2
  // 꼭지: 아래 끝이 보에 닿고 위로 선 세로 토막.
  const tick = ups.find(({ points, thickness }) => { const ys = points.map((q) => q.y); return Math.abs(Math.max(...ys) - boY) < Math.max(thickness, bo.thickness) * 1.5 && Math.min(...ys) < boY })
  if (!tick) return { syllable, fit: null }
  const top = Math.min(...tick.points.map((q) => q.y)), bottom = boY - bo.thickness / 2
  if (bottom <= top) return { syllable, fit: null }
  const inks = em.filter(({ p }) => p.source.part === 'CH')
  // 폭은 닿자 상자와 닿자 잉크 폭이 겹치는 곳: 상자가 잉크보다 한쪽으로 넓으면(굵을 때 칸을 옮긴 ㅉ) 그 빈 곳이 가운데를 끌었다.
  let inkL = Infinity, inkR = -Infinity
  for (const ink of inks) for (const q of ink.points) { inkL = Math.min(inkL, q.x - ink.thickness / 2); inkR = Math.max(inkR, q.x + ink.thickness / 2) }
  const span: [number, number] = inkR > inkL ? [Math.max(ch.x, inkL), Math.min(ch.x + ch.width, inkR)] : [ch.x, ch.x + ch.width]
  const center = whiteCenterOf(span[1] > span[0] ? span : [ch.x, ch.x + ch.width], [top, bottom], inks)
  const now = tick.points.reduce((s, q) => s + q.x, 0) / tick.points.length
  const shift = center - now
  if (Math.abs(shift) < 1e-4) return { syllable, fit: { shift: 0, center, band: [top, bottom] } }
  // 저장 꼴의 그 획을 찾아 x만 옮긴다(칸 좌표 → 획이 놓인 칸의 몫).
  const channel = tick.p.source.channel, id = tick.p.source.strokeId
  const list = (channel === 'strokes' ? ju.strokes : ju[channel]) as StrokeDataV2[] | undefined
  const at = list?.findIndex((stroke) => stroke.id === id) ?? -1
  if (!list || at < 0) return { syllable, fit: null }
  const k = shift / tick.p.box.width
  const moved = list.map((stroke, i) => (i === at ? { ...stroke, points: stroke.points.map((q) => ({ ...q, x: q.x + k })) } : stroke))
  return { syllable: { ...syllable, jungseong: { ...ju, [channel]: moved } }, fit: { shift, center, band: [top, bottom] } }
}
