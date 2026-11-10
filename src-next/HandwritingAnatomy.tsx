import { memo, useEffect, useMemo, useState } from 'react'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import { useContextPlacement } from './notoModel'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { describeStrokeGeometry, grammarOf, STEM_NAME_LABEL, STEM_SHAPE_LABEL, TOUCH_DISTANCE } from '../src/services/strokeGrammar'
import type { JamoType, StemShape } from '../src/services/strokeGrammar'
import { MEDIAL_STEM_ROLES } from '../src/services/medialStemRails'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import type { BoxConfig, JamoData, Part, ResolvedStrokeInkSource, StrokeDataV2 } from '../src/types'
import type { GroupBeakResolver } from '../src/stores/jamoGroupStore'
import { Button } from './components/ui/button'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { EDIT_COLOR } from './editColors'
import { TailCutInk, tailIsOpen, useTailCuts } from './HandwritingTailCut'
import type { CutAngleResolver } from './HandwritingTailCut'
import styles from './HandwritingAnatomy.module.css'

/**
 * 선택한 글자 해부(손글씨 실험실 오른쪽). 프리셋 글자를 크게 그리고 첫닿자 · 홀자 · 받침을 색과 점선 상자로 나눠 보인다.
 * 자모 하나를 누르면 그 자모만 색이 남고, 획 문법(`strokeGrammar`)이 읽은 줄기 · 꺾임 · 머리 · 맺음에 번호를 붙여 펼친다.
 * 이름은 획 문법 표에서, 모양은 지금 그려지는 획(가른 벌 · 문맥 보정이 끝난 획)에서 읽는다.
 */

export type Slot = 'CH' | 'JU' | 'JO'
/** 부위 묶음. 기능 층(짧은기둥의 머리)과 형태 층(세로줄기의 머리) 두 높이가 있다. */
export interface PartScope { key: string; label: string }
export const SLOT_OF: Record<Part, Slot> = { CH: 'CH', JU: 'JU', JU_H: 'JU', JU_V: 'JU', JO: 'JO' }
const SLOT_TYPE: Record<Slot, JamoType> = { CH: 'choseong', JU: 'jungseong', JO: 'jongseong' }
export const SLOT_NAME: Record<Slot, string> = { CH: '첫닿자', JU: '홀자', JO: '받침' }
export const SLOT_COLOR: Record<Slot, string> = { CH: EDIT_COLOR.editSlotCh, JU: EDIT_COLOR.editSlotJu, JO: EDIT_COLOR.editSlotJo }
const SLOT_VAR: Record<Slot, string> = { CH: '--color-edit-slot-ch', JU: '--color-edit-slot-ju', JO: '--color-edit-slot-jo' }
const V = 100

interface AnatomyItem {
  n: number
  strokeId: string
  /** 표의 줄기 이름 또는 마디 모양. */
  label: string
  kind: 'segment' | 'corner' | 'head' | 'tail'
  note: string
  /** 글자 상자(viewBox 0–100) 안 표시 자리. */
  at: { x: number; y: number }
  /** 마디면 그 마디의 중심선(강조할 때 덧그림). */
  line?: { x: number; y: number }[]
  /** 이 부위가 드는 묶음 — 기능 층 · 형태 층. */
  scope: { fn: PartScope; shape: PartScope }
  /** 작은 자모 그림에서 칠할 자리: 마디면 그 마디 길(viewBox 0–100), 끝 · 꺾임이면 점. */
  paint: { d: string } | { x: number; y: number }
  /** 묶음 안을 더 거를 속성(이름은 그대로 두고 따로 단다). 획을 바꿀 때 기본은 묶음 전체, 이걸로 좁힌다. */
  attrs: string[]
}

const vowelKind = (char: string): string => {
  if ('ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'.includes(char)) return '세로홀자'
  if ('ㅗㅛㅜㅠㅡ'.includes(char)) return '가로홀자'
  return '섞임홀자'
}

const toView = (p: { x: number; y: number }, box: Readonly<BoxConfig>) => ({ x: (box.x + p.x * box.width) * V, y: (box.y + p.y * box.height) * V })

/** 홀자 보선 역할 → 자리말. 같은 이름 줄기가 둘 이상일 때만 붙인다. */
const ROLE_PLACE: Record<string, string> = { leftStem: '왼', rightStem: '오른', upperBeam: '위', lowerBeam: '아래', innerPillar: '안', outerPillar: '바깥' }
type Prim = { stroke: StrokeDataV2; box: Readonly<BoxConfig>; source: ResolvedStrokeInkSource }

/**
 * 획마다 부를 이름. 이름(표의 줄기 이름, 없으면 한 마디 획의 모양)은 같은 것끼리 공유하고 — 부위 단위 스타일이 같이 잡도록 —
 * 한 자모에 같은 이름이 둘 이상이면 자리말을 붙인다. 홀자는 보선 역할 표(안 · 바깥 · 위 · 아래 · 왼 · 오른), 나머지는 놓인 자리로.
 */
function stemLabelsOf(primitives: Prim[], jamo: JamoData, table: Readonly<Record<string, string | null>>): Map<string, string> {
  const base = new Map<string, string>()
  const centers = new Map<string, { x: number; y: number }>()
  for (const { stroke, box, source } of primitives) {
    const others = primitives.filter((p) => p.source.channel === source.channel && p.stroke.id !== stroke.id).map((p) => p.stroke)
    const geo = describeStrokeGeometry(stroke, others)
    const name = table[stroke.id] as keyof typeof STEM_NAME_LABEL | null | undefined
    const label = name ? STEM_NAME_LABEL[name] : geo.segments.length === 1 ? STEM_SHAPE_LABEL[geo.segments[0].shape] : null
    if (!label) continue
    base.set(stroke.id, label)
    const c = stroke.points.reduce((a, p) => ({ x: a.x + p.x / stroke.points.length, y: a.y + p.y / stroke.points.length }), { x: 0, y: 0 })
    centers.set(stroke.id, toView(c, box))
  }
  const out = new Map(base)
  const groups = new Map<string, string[]>()
  base.forEach((label, id) => groups.set(label, [...(groups.get(label) ?? []), id]))
  const roles = MEDIAL_STEM_ROLES[jamo.char]
  groups.forEach((ids, label) => {
    if (ids.length < 2) return
    const fromRoles = ids.map((id) => ROLE_PLACE[roles?.[id]?.[1] ?? ''])
    if (fromRoles.every(Boolean) && new Set(fromRoles).size === ids.length) { ids.forEach((id, i) => out.set(id, `${fromRoles[i]} ${label}`)); return }
    const pts = ids.map((id) => centers.get(id)!)
    const spread = (k: 'x' | 'y') => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]))
    const k: 'x' | 'y' = spread('x') >= spread('y') ? 'x' : 'y'
    const words = k === 'x' ? (ids.length === 2 ? ['왼', '오른'] : ['왼', '가운데', '오른']) : (ids.length === 2 ? ['위', '아래'] : ['위', '가운데', '아래'])
    const order = [...ids].sort((a, b) => centers.get(a)![k] - centers.get(b)![k])
    order.forEach((id, i) => out.set(id, words[i] ? `${words[i]} ${label}` : `${label} ${i + 1}`))
  })
  return out
}

type V2 = { x: number; y: number }
const unit = (v: V2): V2 => { const d = Math.hypot(v.x, v.y) || 1; return { x: v.x / d, y: v.y / d } }
/**
 * 꺾임이 앉은 귀. 두 팔(꺾임에서 뻗어 나가는 쪽)을 더한 방향의 반대가 귀다 — 팔이 왼쪽 · 아래로 가면 오른 위 귀(ㄱ).
 * 팔 둘이 거의 맞서 한쪽이 안 정해지면 그쪽 말은 뺀다.
 */
function earOf(armA: V2, armB: V2): { word: string; out: V2 } {
  const a = unit(armA), b = unit(armB)
  const v = { x: a.x + b.x, y: a.y + b.y }
  const h = v.x < -0.35 ? '오른' : v.x > 0.35 ? '왼' : ''
  const ver = v.y > 0.35 ? '위' : v.y < -0.35 ? '아래' : ''
  return { word: `${[h, ver].filter(Boolean).join(' ') || '가운데'} 귀`, out: unit({ x: -v.x, y: -v.y }) }
}
/** 꺾임 각: 90° 안팎이면 곧은, 덜 돌면(둔각) 벌어진, 더 돌면(예각) 좁은 꺾임. */
const angleWord = (turn: number) => (turn < 70 ? '벌어진 꺾임' : turn > 110 ? '좁은 꺾임' : '곧은 꺾임')

function itemsOf(primitives: Prim[], jamo: JamoData, type: JamoType, slot: Slot): AnatomyItem[] {
  const table = grammarOf(type, jamo.char)
  const labels = stemLabelsOf(primitives, jamo, table)
  const out: AnatomyItem[] = []
  let n = 1
  const centerOf = (p: Prim) => toView(p.stroke.points.reduce((a, q) => ({ x: a.x + q.x / p.stroke.points.length, y: a.y + q.y / p.stroke.points.length }), { x: 0, y: 0 }), p.box)
  const named = (want: string) => primitives.filter((p) => table[p.stroke.id] === want)
  const attrsOf = (p: Prim): string[] => {
    const attrs: string[] = [slot === 'JU' ? vowelKind(jamo.char) : SLOT_NAME[slot]]
    const place = labels.get(p.stroke.id)?.split(' ')
    if (place && place.length > 1) attrs.push(place[0])
    const own = table[p.stroke.id]
    const c = centerOf(p)
    if (own === 'gyeotjulgi' || own === 'geolchim') {
      // 곁줄기 방향: 가장 가까운 기둥의 오른쪽인지 왼쪽인지.
      const pillars = named('gidung').map(centerOf)
      if (pillars.length) {
        const near = pillars.reduce((a, q) => (Math.abs(q.x - c.x) < Math.abs(a.x - c.x) ? q : a))
        attrs.push(c.x > near.x ? '오른쪽으로 뻗음' : '왼쪽으로 뻗음')
      }
    }
    if (own === 'jjalbeungidung') {
      // 짧은기둥 방향: 보 위로 서는지(ㅗ) 아래로 내리는지(ㅜ).
      const beams = named('bo').map(centerOf)
      if (beams.length) attrs.push(c.y < beams[0].y ? '보 위' : '보 아래')
    }
    return attrs
  }
  // 층: 닿자의 가로줄기는 맨 위 · 가운데 · 맨 아래, 세로줄기는 맨 왼 · 가운데 · 맨 오른. 쓴 차례가 아니라 놓인 자리로 정한다 —
  // 사용자가 꼴을 바꾸거나 획을 달리 나눠 그려도 같은 자리면 같은 층이다(11-10). 하나뿐이면 자모 안 어디쯤인지로 정한다.
  const layerOf = new Map<string, string>()
  if (slot !== 'JU') {
    const all = primitives.flatMap((p) => p.stroke.points.map((q) => toView(q, p.box)))
    const span = { x0: Math.min(...all.map((q) => q.x)), x1: Math.max(...all.map((q) => q.x)), y0: Math.min(...all.map((q) => q.y)), y1: Math.max(...all.map((q) => q.y)) }
    const segs = primitives.flatMap((p) => {
      const others = primitives.filter((o) => o.source.channel === p.source.channel && o.stroke.id !== p.stroke.id).map((o) => o.stroke)
      return describeStrokeGeometry(p.stroke, others).segments.filter((g) => g.shape === 'garojulgi' || g.shape === 'serojulgi').map((g) => {
        const a = toView(p.stroke.points[g.fromPoint], p.box), b = toView(p.stroke.points[g.toPoint], p.box)
        return { key: `${p.stroke.id}:${g.fromPoint}`, shape: g.shape, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
      })
    })
    for (const shape of ['garojulgi', 'serojulgi'] as const) {
      const k: 'x' | 'y' = shape === 'garojulgi' ? 'y' : 'x'
      const [lo, mid, hi] = shape === 'garojulgi' ? ['맨 위', '가운데', '맨 아래'] : ['맨 왼', '가운데', '맨 오른']
      const size = (k === 'y' ? span.y1 - span.y0 : span.x1 - span.x0) || 1
      // 자모 안 자리 비율로 정한다 — 줄기 개수로 세면 ㅋ의 덧줄기(가운데)가 맨 아래가 되어 버린다.
      for (const g of segs.filter((q) => q.shape === shape)) {
        const t = (g.c[k] - (k === 'y' ? span.y0 : span.x0)) / size
        layerOf.set(g.key, t < 0.35 ? lo : t > 0.65 ? hi : mid)
      }
    }
  }
  for (const prim of primitives) {
    const { stroke, box, source } = prim
    const attrs = attrsOf(prim)
    const others = primitives.filter((p) => p.source.channel === source.channel && p.stroke.id !== stroke.id).map((p) => p.stroke)
    const geo = describeStrokeGeometry(stroke, others)
    // 열린 꼴: 획 끝 하나라도 다른 획에 안 닿으면 트인 꺾임(ㄱ · ㄴ), 끝이 다 막히거나 닫힌 획이면 속공간을 감싸는 꺾임(ㅁ).
    const strokeOpen = !stroke.closed && geo.segments.some((g) => g.head?.open || g.tail?.open)
    const name = table[stroke.id] ?? null
    const stem = labels.get(stroke.id)
    // 기능 층 줄기 이름: 표 이름(기둥 · 보 …), 없으면 닿자는 자리 + 모양(첫닿자 세로줄기), 홀자는 모양.
    const fnStem = (shape: StemShape) => name ? STEM_NAME_LABEL[name] : slot === 'JU' ? STEM_SHAPE_LABEL[shape] : `닿자 ${STEM_SHAPE_LABEL[shape]}`
    const stemScope = (shape: StemShape) => ({ fn: { key: `줄기|${fnStem(shape)}`, label: fnStem(shape) }, shape: { key: `줄기|${STEM_SHAPE_LABEL[shape]}`, label: `모든 ${STEM_SHAPE_LABEL[shape]}` } })
    const endScope = (word: '머리' | '맺음', shape: StemShape) => ({ fn: { key: `${word}|${fnStem(shape)}`, label: `${fnStem(shape)}의 ${word}` }, shape: { key: `${word}|${STEM_SHAPE_LABEL[shape]}`, label: `${STEM_SHAPE_LABEL[shape]}의 ${word}` } })
    const cornerWho = slot === 'JU' ? '홀자' : '닿자'
    const cornerScope = { fn: { key: `꺾임|${cornerWho}`, label: `${cornerWho} 꺾임` }, shape: { key: '꺾임', label: '모든 꺾임' } }
    const pts = stroke.points
    // 끝 표시는 획 끝에서 바깥으로 조금 밀어 마디 번호와 안 겹치게.
    const endMark = (i: number) => {
      const end = toView(pts[i], box)
      const nb = i === 0 ? (pts[0].handleOut ?? pts[1]) : (pts[i].handleIn ?? pts[i - 1])
      const from = toView(nb, box)
      const d = Math.hypot(end.x - from.x, end.y - from.y) || 1
      return { x: end.x + (end.x - from.x) / d * 4.5, y: end.y + (end.y - from.y) / d * 4.5 }
    }
    // 쓰는 차례대로: 머리 → 마디 · 꺾임 번갈아 → 맺음. 머리가 끝 점 쪽이면 거꾸로 센다.
    const reversed = !!geo.head && geo.head.point !== 0
    const steps: ({ seg: (typeof geo.segments)[number] } | { corner: (typeof geo.corners)[number] })[] = []
    geo.segments.forEach((seg, i) => {
      if (stroke.closed && geo.corners[i]) steps.push({ corner: geo.corners[i] })
      steps.push({ seg })
      if (!stroke.closed && geo.corners[i]) steps.push({ corner: geo.corners[i] })
    })
    if (reversed) steps.reverse()
    for (const step of steps) {
      if ('corner' in step) {
        const c = step.corner
        // 닫힌 획은 첫 점을 끝에 한 번 더 적어 두기도 한다 — 그 점을 빼야 첫 꺾임의 이웃이 맞다.
        const ring = stroke.closed && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6 ? pts.slice(0, -1) : pts
        const k = ring.length
        const at = toView(c, box)
        const nb = (j: number) => toView(ring[(j + k) % k], box)
        const ear = earOf({ x: nb(c.point - 1).x - at.x, y: nb(c.point - 1).y - at.y }, { x: nb(c.point + 1).x - at.x, y: nb(c.point + 1).y - at.y })
        out.push({ n: n++, strokeId: stroke.id, kind: 'corner', label: '꺾임', note: `${Math.round(c.turn)}° 돎`, at, scope: cornerScope, paint: at, attrs: [...attrs, ear.word, strokeOpen ? '열린 꼴' : '닫힌 꼴', angleWord(c.turn)] })
        continue
      }
      const seg = step.seg
      const shape = STEM_SHAPE_LABEL[seg.shape]
      if (seg.shape === 'dunggeunjulgi') {
        const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
        const top = pts.reduce((a, p) => (p.y < a.y ? p : a), pts[0])
        out.push({ n: n++, strokeId: stroke.id, label: stem ?? shape, kind: 'segment', note: name ? shape : '닫힌 획', at: toView({ x: c.x, y: top.y }, box), scope: stemScope(seg.shape), paint: { d: pointsToSvgD(pts, stroke.closed, box, V) }, attrs })
        continue
      }
      const a = pts[seg.fromPoint], b = pts[seg.toPoint]
      const line = [a, b].map((p) => toView(p, box))
      const curved = !!(a.handleOut || b.handleIn)
      const one = geo.segments.length === 1
      // 머리 · 맺음은 마디마다 — 가로줄기는 왼쪽, 나머지는 위쪽이 머리(사전). 획을 쓴 차례가 아니라 마디 모양으로 정한다.
      const segName = one && stem ? stem : shape
      // 꼭지에는 층을 안 단다. 같은 축 자리말(ㅍ의 위 · 아래)은 층이 대신하니 속성에서 뺀다 — 이름에는 남는다.
      const sameAxis = seg.shape === 'garojulgi' ? ['위', '아래'] : ['왼', '오른']
      const layer = name === 'kkokji' ? undefined : layerOf.get(`${stroke.id}:${seg.fromPoint}`)
      const segAttrs = layer ? [...attrs.filter((w) => !sameAxis.includes(w)), layer] : attrs
      if (seg.head?.open) out.push({ n: n++, strokeId: stroke.id, kind: 'head', label: '머리', note: `${segName}의 열린 끝`, at: endMark(seg.head.point), scope: endScope('머리', seg.shape), paint: toView(pts[seg.head.point], box), attrs: segAttrs })
      out.push({
        n: n++, strokeId: stroke.id, kind: 'segment',
        label: one && stem ? stem : shape,
        note: [name && one ? shape : name ? `${STEM_NAME_LABEL[name]}의 한 마디` : '', curved ? '휜 마디' : ''].filter(Boolean).join(' · ') || '곧은 마디',
        at: { x: (line[0].x + line[1].x) / 2, y: (line[0].y + line[1].y) / 2 }, line, scope: stemScope(seg.shape),
        paint: { d: pointsToSvgD(pts.slice(Math.min(seg.fromPoint, seg.toPoint), Math.max(seg.fromPoint, seg.toPoint) + 1), false, box, V) },
        attrs: segAttrs,
      })
      if (seg.tail && (seg.tail.open || (seg.tail.kind === 'end' && tailIsOpen(stroke, seg.tail.point, others)))) out.push({ n: n++, strokeId: stroke.id, kind: 'tail', label: '맺음', note: `${segName}의 열린 끝`, at: endMark(seg.tail.point), scope: endScope('맺음', seg.shape), paint: toView(pts[seg.tail.point], box), attrs: segAttrs })
    }
  }
  // 만난 꺾임: 두 획의 끝끼리 맞닿아 귀를 이루는 곳(ㅁ을 두 획으로 그렸을 때의 귀). 한 획 안 꺾임과 같은 묶음에 든다.
  const ends = primitives.flatMap((p) => {
    const pts = p.stroke.points
    if (p.stroke.closed || pts.length < 2) return []
    return [0, pts.length - 1].map((i) => {
      const nb = i === 0 ? (pts[0].handleOut ?? pts[1]) : (pts[i].handleIn ?? pts[i - 1])
      return { p, i, at: toView(pts[i], p.box), arm: toView(nb, p.box), local: pts[i], other: pts[i === 0 ? pts.length - 1 : 0] }
    })
  })
  const touchesOthers = (p: Prim, pt: { x: number; y: number }) => primitives.some((q) => q !== p && q.stroke.points.some((r) => Math.hypot(toView(r, q.box).x - toView(pt, p.box).x, toView(r, q.box).y - toView(pt, p.box).y) < TOUCH_DISTANCE * p.box.width * V))
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    const A = ends[a], B = ends[b]
    if (A.p === B.p) continue
    const reach = TOUCH_DISTANCE * Math.min(A.p.box.width, A.p.box.height) * V
    if (Math.hypot(A.at.x - B.at.x, A.at.y - B.at.y) > reach) continue
    const armA = { x: A.arm.x - A.at.x, y: A.arm.y - A.at.y }, armB = { x: B.arm.x - B.at.x, y: B.arm.y - B.at.y }
    const ua = unit(armA), ub = unit(armB)
    const turn = 180 - Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y))) * 180 / Math.PI
    if (turn < 30 || turn > 150) continue
    const at = { x: (A.at.x + B.at.x) / 2, y: (A.at.y + B.at.y) / 2 }
    const ear = earOf(armA, armB)
    const closed = touchesOthers(A.p, A.other) && touchesOthers(B.p, B.other)
    const who = (p: Prim) => labels.get(p.stroke.id) ?? '획'
    out.push({
      n: n++, strokeId: `${A.p.stroke.id}+${B.p.stroke.id}`, kind: 'corner', label: '만난 꺾임', note: `${who(A.p)} · ${who(B.p)}가 만남`,
      at: { x: at.x + ear.out.x * 4.5, y: at.y + ear.out.y * 4.5 }, scope: { fn: { key: `꺾임|${slot === 'JU' ? '홀자' : '닿자'}`, label: `${slot === 'JU' ? '홀자' : '닿자'} 꺾임` }, shape: { key: '꺾임', label: '모든 꺾임' } },
      paint: at, attrs: [slot === 'JU' ? vowelKind(jamo.char) : SLOT_NAME[slot], ear.word, closed ? '닫힌 꼴' : '열린 꼴', angleWord(turn), '획끼리 만남'],
    })
  }
  // 번호가 앞 번호와 겹치면 마디를 따라 옆으로 옮긴다.
  const near = (p: { x: number; y: number }, upto: number) => out.slice(0, upto).some((o) => Math.hypot(o.at.x - p.x, o.at.y - p.y) < 6)
  out.forEach((it, k) => {
    if (!it.line || !near(it.at, k)) return
    const [a, b] = it.line
    for (const t of [0.3, 0.7, 0.2, 0.8]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (!near(p, k)) { it.at = p; return }
    }
  })
  return out
}

/**
 * 목록 차례: 머리 · 맺음은 자기 줄기(마디) 바로 아래에 들여 쓴다 — 줄기 없이 있을 수 없는 부분이라서.
 * 꺾임은 두 마디를 잇는 부분이라 줄기와 같은 높이에 둔다. 번호는 줄기 · 꺾임이 1, 2, 3…, 딸린 부분은 1-1, 1-2.
 */
function listOrder(items: AnatomyItem[]): { it: AnatomyItem; sub: boolean; tag: string }[] {
  const out: { it: AnatomyItem; sub: boolean; tag: string }[] = []
  let top = 0
  items.forEach((it, i) => {
    if (it.kind === 'head' || it.kind === 'tail') return
    top += 1
    out.push({ it, sub: false, tag: `${top}` })
    if (it.kind !== 'segment') return
    const before = items[i - 1], after = items[i + 1]
    let k = 0
    if (before?.kind === 'head' && before.strokeId === it.strokeId) out.push({ it: before, sub: true, tag: `${top}-${++k}` })
    if (after?.kind === 'tail' && after.strokeId === it.strokeId) out.push({ it: after, sub: true, tag: `${top}-${++k}` })
  })
  return out
}

const UNIT: BoxConfig = { x: 0, y: 0, width: 1, height: 1 }
const CHANNELS = ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const
/**
 * 자모 하나에 든 부위 묶음 키 전부(기능 층 + 형태 층). 글자표에 같은 묶음 글자를 칠할 때 쓴다.
 * 기본 자모 획으로 읽는다 — 가른 벌(홀자별 첫닿자)의 꼴 차이는 여기 안 든다.
 */
function unitItems(jamo: JamoData, slot: Slot): { prims: Prim[]; items: AnatomyItem[] } {
  // 섞임홀자는 가로 · 세로 획이 각자 상자 기준이라, 작은 그림에서 대충 겹치지 않게 가로는 왼쪽, 세로는 오른쪽에 놓는다.
  const mixed = !!jamo.horizontalStrokes?.length && !!jamo.verticalStrokes?.length
  const boxOf = (channel: (typeof CHANNELS)[number]): BoxConfig => !mixed ? UNIT : channel === 'horizontalStrokes' ? { x: 0, y: 0, width: 0.72, height: 1 } : { x: 0.6, y: 0, width: 0.4, height: 1 }
  const prims: Prim[] = CHANNELS.flatMap((channel) => ((jamo[channel] ?? []) as StrokeDataV2[]).map((stroke) => ({
    stroke, box: boxOf(channel),
    source: { kind: 'stroke' as const, glyphId: '', part: (slot === 'JU' ? (channel === 'horizontalStrokes' ? 'JU_H' : channel === 'verticalStrokes' ? 'JU_V' : 'JU') : slot) as Part, channel, jamoId: jamo.char, strokeId: stroke.id },
  })))
  return { prims, items: itemsOf(prims, jamo, SLOT_TYPE[slot], slot) }
}

/** 부리를 얹을 수 있는 자리의 묶음 키: 세로줄기의 열린 머리. */
export const BEAK_TARGET_KEY = '머리|세로줄기'
/**
 * 자모에서 부리가 얹힐 획 → 그 머리가 달린 줄기 이름(기둥 · 짧은기둥 · 닿자 세로줄기 …).
 * 부리는 획 단위로 걸리므로(`SvgRenderer`의 `groupBeakOf`) 획 id로 찾는다.
 */
export function beakHeadsOf(jamo: JamoData, slot: Slot): Map<string, string> {
  const out = new Map<string, string>()
  unitItems(jamo, slot).items.forEach((it) => { if (it.kind === 'head' && it.scope.shape.key === BEAK_TARGET_KEY) out.set(it.strokeId, it.scope.fn.key.split('|')[1]) })
  return out
}

/** 자모에서 맺음(열린 끝)이 달린 자리 → 줄기 이름. 키는 `획 id:마디 모양` — 한 획에 맺음이 둘일 수 있어서(ㅅ). */
export function tailEndsOf(jamo: JamoData, slot: Slot): Map<string, string> {
  const out = new Map<string, string>()
  unitItems(jamo, slot).items.forEach((it) => { if (it.kind === 'tail') out.set(`${it.strokeId}:${it.scope.shape.key.split('|')[1]}`, it.scope.fn.key.split('|')[1]) })
  return out
}

export function jamoScopeKeys(jamo: JamoData, slot: Slot): Set<string> {
  const keys = new Set<string>()
  unitItems(jamo, slot).items.forEach((it) => { keys.add(it.scope.fn.key); keys.add(it.scope.shape.key) })
  return keys
}

const CHO_ORDER = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNG_ORDER = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONG_ORDER = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'
/** 자모를 보일 본보기 글자: 첫닿자는 ○+ㅏ, 홀자는 ㅇ+○, 받침은 가+○. 글자 속 상자 비율 그대로 보이려고. */
export const sampleChar = (slot: Slot, ch: string): string | null => {
  const [c, j, t] = slot === 'CH' ? [CHO_ORDER.indexOf(ch), 0, 0] : slot === 'JU' ? [11, JUNG_ORDER.indexOf(ch), 0] : [0, 0, JONG_ORDER.indexOf(ch)]
  if (c < 0 || j < 0 || t < 0) return null
  return String.fromCharCode(0xac00 + (c * 21 + j) * 28 + t)
}

/** 묶음 상자의 작은 자모: 같은 크기 글자 네모 안에, 본보기 글자 속 자리 · 비율 그대로 그 자모만 흐리게 그리고, 고른 묶음에 드는 부위만 자리 색으로 칠한다. */
const ScopeMini = memo(function ScopeMini({ ch, slot, scopeKey, style }: { ch: string; slot: Slot; scopeKey: string; style: GlobalStyle }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const drawn = useMemo(() => {
    const sample = sampleChar(slot, ch)
    if (!sample) return null
    const syllable = decomposeSyllable(sample, choseong, jungseong, jongseong)
    const jamo = slot === 'CH' ? syllable.choseong : slot === 'JU' ? syllable.jungseong : syllable.jongseong
    if (!jamo) return null
    const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
    const schema = { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
    const resolved = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'schema', schema }, weightMultiplier: weightToMultiplier(style.weight), globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const prims = resolved.primitives.filter((p) => SLOT_OF[p.source.part] === slot).map((p) => ({ stroke: p.stroke as StrokeDataV2, box: p.box, source: p.source }))
    if (!prims.length) return null
    return { prims, items: itemsOf(prims, jamo, SLOT_TYPE[slot], slot) }
  }, [ch, slot, choseong, jungseong, jongseong, schemas, globalPadding, paddingOverrides, style.weight, style.linecap, style.linejoin])
  if (!drawn) return <b>{ch}</b>
  const { prims, items } = drawn
  const hits = items.filter((it) => it.scope.fn.key === scopeKey || it.scope.shape.key === scopeKey)
  const color = SLOT_COLOR[slot]
  // 칸은 모두 같은 크기의 글자 네모. 그 안에 자모가 본보기 글자 속 자리 · 크기 그대로 그려진다.
  const sw = 5
  return <svg viewBox="-4 -4 108 108" width={60} height={60} className={styles.mini} role="img" aria-label={ch}>
    {prims.map((p) => <path key={p.stroke.id} d={pointsToSvgD(p.stroke.points, p.stroke.closed, p.box, V)} fill="none" stroke={EDIT_COLOR.editSlotOff} strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter" />)}
    {hits.map((it, i) => 'd' in it.paint
      ? <path key={i} d={it.paint.d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter" />
      : <circle key={i} cx={it.paint.x} cy={it.paint.y} r={4.5} fill={color} />)}
  </svg>
})

export const HandwritingAnatomy = memo(function HandwritingAnatomy({ char, style, size = 360, onScope, scopeJamo, focusRequest, onFocusSlot, groupBeakOf, cutAngleOf, onAddStyle }: {
  char: string; style: GlobalStyle; size?: number
  onScope?: (scope: PartScope | null) => void
  scopeJamo?: { slot: Slot; total: number; hits: string[] }[]
  /** 자모 카드에서 고르면 그 자리를 바로 펼친다. */
  focusRequest?: { char: string; slot: Slot; at: number } | null
  /** 펼친 자리가 바뀌면 알린다(자모 카드 표시용). */
  onFocusSlot?: (slot: Slot | null) => void
  /** 부위 스타일 규칙이 정한 획별 부리. */
  groupBeakOf?: GroupBeakResolver
  /** 부위 스타일 규칙이 정한 맺음 자르기. */
  cutAngleOf?: CutAngleResolver | null
  /** 고른 부위에 스타일 걸기 팝업을 연다. 세로줄기의 머리(부리)와 맺음(비스듬히 자르기). */
  onAddStyle?: (from: { kind: 'beak' | 'cut'; stem: string; slot: Slot }) => void
}) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const schema = useMemo(() => {
    const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
    return { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  }, [schemas, globalPadding, paddingOverrides, syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, style)
  const [focus, setFocus] = useState<{ char: string; slot: Slot } | null>(null)
  useEffect(() => { if (focusRequest) { setHot(null); setFocus({ char: focusRequest.char, slot: focusRequest.slot }) } }, [focusRequest?.at]) // eslint-disable-line react-hooks/exhaustive-deps
  const [hot, setHot] = useState<number | null>(null)
  const slot = focus?.char === char ? focus.slot : null
  useEffect(() => { onFocusSlot?.(slot) }, [slot]) // eslint-disable-line react-hooks/exhaustive-deps

  // 렌더러와 같은 입력으로 획을 풀어, 그려지는 그 획에서 부위를 읽는다.
  const resolved = useMemo(() => resolveGlyphInkPrimitives({
    syllable,
    placement: placement.kind === 'schema' ? { kind: 'schema', schema: placement.schema } : { kind: 'boxes', boxes: placement.boxes },
    weightMultiplier: weightToMultiplier(style.weight),
    globalLinecap: style.linecap,
    globalLinejoin: style.linejoin,
    horizontalInkBounds: { min: 0, max: 1 },
  }), [syllable, placement, style.weight, style.linecap, style.linejoin])

  const slots = useMemo(() => {
    const jamoOf: Record<Slot, JamoData | undefined> = { CH: syllable.choseong ?? undefined, JU: syllable.jungseong ?? undefined, JO: syllable.jongseong ?? undefined }
    return (['CH', 'JU', 'JO'] as Slot[]).flatMap((s) => {
      const jamo = jamoOf[s]
      if (!jamo) return []
      const prims = resolved.primitives.filter((p) => SLOT_OF[p.source.part] === s).map((p) => ({ stroke: p.stroke as StrokeDataV2, box: p.box, source: p.source }))
      const parts = (Object.entries(resolved.boxes) as [Part, BoxConfig][]).filter(([part]) => SLOT_OF[part] === s).map(([, b]) => b)
      return [{ slot: s, jamo, prims, parts, items: itemsOf(prims, jamo, SLOT_TYPE[s], s) }]
    })
  }, [resolved, syllable])

  const active = slots.find((s) => s.slot === slot) ?? null
  const hotItem = active?.items.find((it) => it.n === hot) ?? null
  const ordered = useMemo(() => (active ? listOrder(active.items) : []), [active])
  const tagOf = new Map(ordered.map((o) => [o.it.n, o.tag]))
  // 형태 층으로 넓히기는 나중에 획을 바꾸고 전파 범위를 고를 때 꺼낸다(사용자 11-09). 지금은 기능 층만.
  const scope = hotItem ? hotItem.scope.fn : null
  useEffect(() => { onScope?.(scope) }, [scope?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = (source: ResolvedStrokeInkSource) => {
    const s = SLOT_OF[source.part]
    if (!slot) return SLOT_COLOR[s]
    if (s !== slot) return EDIT_COLOR.editSlotOff
    if (hotItem && !hotItem.strokeId.split('+').includes(source.strokeId)) return EDIT_COLOR.editGuide
    return SLOT_COLOR[s]
  }
  const cuts = useTailCuts(syllable, placement, style, cutAngleOf)
  const styleKind = !hotItem ? null : hotItem.kind === 'tail' ? 'cut' as const : hotItem.kind === 'head' && hotItem.scope.shape.key === BEAK_TARGET_KEY ? 'beak' as const : null
  const pick = (s: Slot) => { setHot(null); setFocus(slot === s ? null : { char, slot: s }) }

  return <div className={styles.wrap} data-testid="handwriting-anatomy">
    <div className={styles.stage}>
      <div className={styles.main}>
      <div className={styles.big} onClick={() => { setHot(null); setFocus(null) }}>
        <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
          size={size} globalStyle={style} overflow="visible" clipGlyphs={false} strokeColorOf={colorOf} groupBeakOf={groupBeakOf}>
          <TailCutInk cuts={cuts} colorOf={colorOf} />
          {slots.filter((s) => !slot || s.slot === slot).flatMap((s) => s.parts.map((b, i) => <rect key={`${s.slot}-${i}`} x={b.x * V} y={b.y * V} width={b.width * V} height={b.height * V}
            fill="none" stroke={SLOT_COLOR[s.slot]} strokeWidth={0.35} strokeDasharray="1.2 1" pointerEvents="none" />))}
          {/* 자모 고르기: 획 위를 누르면 그 자모가 펼쳐진다. 투명한 굵은 선이 눌림을 받는다. */}
          {slots.flatMap((s) => s.prims.map((p, i) => <path key={`hit-${s.slot}-${i}`} d={pointsToSvgD(p.stroke.points, p.stroke.closed, p.box, V)} fill="none" stroke="transparent" strokeWidth={9}
            pointerEvents="stroke" className={styles.hit} data-testid={`handwriting-anatomy-${s.slot}`} onClick={(e) => { e.stopPropagation(); if (slot !== s.slot) pick(s.slot) }} />))}
          {hotItem?.line && <polyline points={hotItem.line.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={0.6} strokeDasharray="1.5 1" pointerEvents="none" />}
          {active?.items.map((it) => { const tag = tagOf.get(it.n) ?? `${it.n}`; const long = tag.length > 2; return <g key={it.n} className={styles.mark} onClick={(e) => { e.stopPropagation(); setHot(hot === it.n ? null : it.n) }}>
            <circle cx={it.at.x} cy={it.at.y} r={(hot === it.n ? 3.6 : 3) + (long ? 0.6 : 0)} fill={hot === it.n ? EDIT_COLOR.foreground : SLOT_COLOR[active.slot]} stroke={EDIT_COLOR.surface} strokeWidth={0.5} />
            <text x={it.at.x} y={it.at.y + 1.25} fontSize={long ? 2.5 : 3.4} fontWeight={700} textAnchor="middle" fill={EDIT_COLOR.surface}>{tag}</text>
          </g> })}
        </SvgRenderer>
      </div>
      {scope && <div className={styles.scope} data-testid="handwriting-anatomy-scope">
        <span>묶음</span><b>{scope.label}</b>
        {scopeJamo?.map((g) => <div key={g.slot} className={styles.scopeJamo} style={{ ['--slot' as string]: `var(${SLOT_VAR[g.slot]})` }}>
          <i aria-hidden="true" /><small>{SLOT_NAME[g.slot]}</small><em>{g.hits.length}/{g.total}</em>
          <span className={styles.minis}>{g.hits.map((h) => <ScopeMini key={h} ch={h} slot={g.slot} scopeKey={scope.key} style={style} />)}</span>
        </div>)}
      
        {onAddStyle && hotItem && (styleKind
          ? <Button size="sm" variant="primary" className={styles.addStyle} onClick={() => onAddStyle({ kind: styleKind, stem: hotItem.scope.fn.key.split('|')[1], slot: active!.slot })} data-testid="handwriting-add-style">스타일 추가하기</Button>
          : <p className={styles.hint}>이 부위에 걸 스타일은 아직 없어요. 지금은 세로줄기의 머리에 부리, 맺음에 비스듬히 자르기를 걸 수 있어요.</p>)}
      </div>}
      </div>
      <div className={styles.side}>
        {active && <div className={styles.sideHead} style={{ ['--slot' as string]: `var(${SLOT_VAR[active.slot]})` }}>
          <i aria-hidden="true" /><b>{SLOT_NAME[active.slot]} {active.jamo.char}</b>{active.slot === 'JU' && <small>{vowelKind(active.jamo.char)}</small>}
        </div>}
        {active && <ol className={styles.rows}>
          {ordered.map(({ it, sub, tag }) => <li key={it.n} className={sub ? styles.sub : undefined}>
            <button type="button" className={`${styles.row}${hot === it.n ? ` ${styles.rowOn}` : ''}`} style={{ ['--slot' as string]: `var(${SLOT_VAR[active.slot]})` }} onClick={() => setHot(hot === it.n ? null : it.n)}>
              <span className={styles.n}>{tag}</span><b>{it.label}</b><small>{it.note}</small><code>{it.strokeId}</code>
              {!sub && <span className={styles.attrs}>{it.attrs.map((a) => <em key={a}>{a}</em>)}</span>}
            </button>
          </li>)}
        </ol>}
        {!active && <p className={styles.hint}>글자에서 자모를 누르면 그 자모의 부위가 번호로 펼쳐져요. 빈 곳을 누르면 닫혀요.</p>}
      </div>
    </div>


  </div>
})
