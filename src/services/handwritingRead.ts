import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../data/Hangul'
import type { JamoData, Part, StrokeDataV2 } from '../types'
import { fitPenStroke, PEN_FIT_EPSILON, penClosesOnItself } from './penStrokeFit'
import type { PenPoint } from './penStrokeFit'
import { adoptStrokeRoles, matchStrokeRoles } from './strokeRoleMatch'

/**
 * 손글씨 한 칸 읽기(플랜 2026-11-09 손글씨 수집 실험실).
 *
 * 정답 글자를 알 때만 쓴다. 칸 안에 그은 획들을 첫닿자 · 홀자 · 받침 자리로 나누고, 자리마다 자모 견본(상자 0–1의 `StrokeDataV2`)과
 * 글자 잉크 상자 기준 배치 상자를 돌려준다. 획 하나하나의 꼴은 `fitPenStroke`가, 프리셋 역할(id)은 `matchStrokeRoles`가 붙인다.
 *
 * 자리 나누기는 획의 바깥 네모만 본다. 홀자부터 찾는다 — 세로로 길고 오른쪽에 선 획이 기둥, 넓은 가로 획이 보.
 * 기둥 · 보에 붙은 짧은 획이 곁줄기 · 짧은기둥. 남은 획은 보 위 · 기둥 왼쪽이 첫닿자, 아래가 받침. 좌표는 전부 칸 기준 0–1.
 */

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export type Slot = 0 | 1 | 2
export type VowelRole = '기둥' | '곁줄기' | '보' | '짧은기둥'

/** 홀자마다 찾을 것: v = [기둥 수, 곁줄기 수, 곁줄기 쪽], h = [짧은기둥 수, 짧은기둥 쪽]. */
const VSPEC: Record<string, { v?: [number, number, 'R' | 'L' | null]; h?: [number, 'U' | 'D' | null] }> = {
  'ㅏ': { v: [1, 1, 'R'] }, 'ㅐ': { v: [2, 1, 'R'] }, 'ㅑ': { v: [1, 2, 'R'] }, 'ㅒ': { v: [2, 2, 'R'] },
  'ㅓ': { v: [1, 1, 'L'] }, 'ㅔ': { v: [2, 1, 'L'] }, 'ㅕ': { v: [1, 2, 'L'] }, 'ㅖ': { v: [2, 2, 'L'] }, 'ㅣ': { v: [1, 0, null] },
  'ㅗ': { h: [1, 'U'] }, 'ㅛ': { h: [2, 'U'] }, 'ㅜ': { h: [1, 'D'] }, 'ㅠ': { h: [2, 'D'] }, 'ㅡ': { h: [0, null] },
  'ㅘ': { h: [1, 'U'], v: [1, 1, 'R'] }, 'ㅙ': { h: [1, 'U'], v: [2, 1, 'R'] }, 'ㅚ': { h: [1, 'U'], v: [1, 0, null] },
  'ㅝ': { h: [1, 'D'], v: [1, 1, 'L'] }, 'ㅞ': { h: [1, 'D'], v: [2, 1, 'L'] }, 'ㅟ': { h: [1, 'D'], v: [1, 0, null] }, 'ㅢ': { h: [0, null], v: [1, 0, null] },
}

export const HANDWRITING_THICKNESS = 0.05

export function decomposeChar(char: string): [string, string, string | null] | null {
  const code = char.charCodeAt(0) - 0xac00
  if (code < 0 || code >= 11172) return null
  const jong = JONGSEONG_LIST[code % 28]
  return [CHOSEONG_LIST[Math.floor(code / 588)], JUNGSEONG_LIST[Math.floor((code % 588) / 28)], jong ? jong : null]
}

export function composeChar(cho: string, jung: string, jong: string | null): string | null {
  const i = (CHOSEONG_LIST as readonly string[]).indexOf(cho)
  const j = (JUNGSEONG_LIST as readonly string[]).indexOf(jung)
  const k = jong ? (JONGSEONG_LIST as readonly string[]).indexOf(jong) : 0
  if (i < 0 || j < 0 || k < 0) return null
  return String.fromCharCode(0xac00 + i * 588 + j * 28 + k)
}

export interface HandwritingStroke {
  raw: PenPoint[]
  bb: Rect
  /** 끝이 시작으로 돌아오는 획(ㅇ). 기둥 · 보 후보에서 뺀다. */
  round: boolean
  slot?: Slot
  role?: VowelRole
}

export interface JamoSample {
  char: string
  slot: Slot
  /** 상자 0–1로 옮긴 획. 섞임홀자는 `strokes` 대신 아래 둘. */
  strokes: StrokeDataV2[]
  horizontalStrokes?: StrokeDataV2[]
  verticalStrokes?: StrokeDataV2[]
  /** 섞임홀자 안에서 가로부 · 세로부가 차지하는 자리(홀자 상자 0–1). */
  mixedBoxes?: { JU_H: Rect; JU_V: Rect }
  /** 상자 가로/세로. 다른 자리에 놓을 때 찌그러짐을 막는 데 쓴다. */
  asp: number
  /** 어느 글자에서 가져왔나. */
  from: string
}

export interface PartRead {
  slot: Slot
  char: string
  strokes: number[]
  /** 칸 좌표의 상자. */
  abs: Rect | null
  sample: JamoSample | null
}

export interface SyllableRead {
  char: string
  jamo: string[]
  strokes: HandwritingStroke[]
  parts: PartRead[]
  /** 글자 잉크 상자를 1로 놓은 배치 상자. 섞임홀자는 JU 대신 JU_H · JU_V. */
  boxes: Partial<Record<Part, Rect>>
  /** 칸 안에서 글자 잉크가 차지한 자리(칸 0–1). */
  frame: { x0: number; y0: number; w: number; h: number }
  /** 자리마다 획이 하나라도 있으면 ok. */
  state: 'ok' | 'bad'
  notes: string[]
}

export interface ReadOptions {
  epsilon?: number
  thickness?: number
  /** 프리셋 자모(역할 id를 승계할 때). 없으면 자유 획 id로 둔다. */
  preset?: (type: JamoData['type'], char: string) => JamoData | undefined
}

const bboxOf = (points: readonly PenPoint[]): Rect => ({
  x0: Math.min(...points.map((p) => p.x)), y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)), y1: Math.max(...points.map((p) => p.y)),
})
const union = (rects: Rect[]): Rect | null => rects.length === 0 ? null : {
  x0: Math.min(...rects.map((r) => r.x0)), y0: Math.min(...rects.map((r) => r.y0)),
  x1: Math.max(...rects.map((r) => r.x1)), y1: Math.max(...rects.map((r) => r.y1)),
}
const pathLength = (points: readonly PenPoint[]) => points.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0, 0)

function toStroke(raw: PenPoint[]): HandwritingStroke {
  const bb = bboxOf(raw)
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0, diag = Math.hypot(w, h)
  const close = Math.hypot(raw[0].x - raw[raw.length - 1].x, raw[0].y - raw[raw.length - 1].y)
  // 둥근 획: 끝이 시작 가까이 돌아오고 길이가 상자 둘레의 반을 넘는다(ㅇ · 덜 닫힌 ㅇ).
  const round = penClosesOnItself(raw) || (close < 0.35 * diag && pathLength(raw) > 2.3 * Math.max(w, h) && diag > 0.06)
  return { raw, bb, round }
}

type Dim = { w: number; h: number; cx: number; cy: number }
const dimOf = (s: HandwritingStroke): Dim => ({ w: s.bb.x1 - s.bb.x0, h: s.bb.y1 - s.bb.y0, cx: (s.bb.x0 + s.bb.x1) / 2, cy: (s.bb.y0 + s.bb.y1) / 2 })

/** 획들을 첫닿자 · 홀자 · 받침 자리로 나눈다. 홀자 획에는 역할도 붙인다. */
export function groupByPlace(strokes: HandwritingStroke[], jamo: [string, string, string | null]): number[][] {
  const [, v, jong] = jamo
  const D = strokes.map(dimOf)
  const ink = union(strokes.map((s) => s.bb))!
  const IW = (ink.x1 - ink.x0) || 1, IH = (ink.y1 - ink.y0) || 1
  const used = new Set<number>()
  const G: number[][] = [[], [], []]
  const sp = VSPEC[v] ?? { v: [1, 0, null] as [number, number, null] }
  const take = (i: number, role: VowelRole) => { G[1].push(i); used.add(i); strokes[i].role = role }
  const isRound = (i: number) => strokes[i].round
  const isV = (i: number) => D[i].h >= D[i].w * 1.4 && !isRound(i)
  const isH = (i: number) => D[i].w >= D[i].h * 1.4 && !isRound(i)
  const free = () => D.map((_, i) => i).filter((i) => !used.has(i))

  // 1) 기둥: 세로로 길고 오른쪽에 있는 획. 겹기둥이면 그 곁의 두 번째 기둥도.
  const stems: number[] = []
  if (sp.v) {
    const c = free().filter(isV).sort((p, q) => (D[q].h / IH + 0.6 * (D[q].cx - ink.x0) / IW) - (D[p].h / IH + 0.6 * (D[p].cx - ink.x0) / IW))
    if (c.length === 0) {
      const r = free().filter((i) => !isRound(i)).reduce((m, i) => m < 0 || D[i].cx > D[m].cx ? i : m, -1)
      if (r >= 0) c.push(r)
    }
    if (c.length) {
      stems.push(c[0])
      if (sp.v[0] === 2) {
        const s2 = c.slice(1).find((i) => Math.abs(D[i].cx - D[c[0]].cx) < IW * 0.45 && D[i].h > D[c[0]].h * 0.45)
        if (s2 !== undefined) stems.push(s2)
      }
    }
    stems.forEach((i) => take(i, '기둥'))
  }
  const stemL = stems.length ? stems.reduce((m, i) => D[i].cx < D[m].cx ? i : m, stems[0]) : -1

  // 2) 보: 넓은 가로 획. 섞임홀자면 기둥 왼쪽에서 찾는다. 짧은기둥이 붙어 있으면 보일 가능성이 높다.
  let beam = -1
  if (sp.h) {
    const up = sp.h[1] === 'U'
    const c = free().filter(isH).filter((i) => stemL < 0 || D[i].cx < D[stemL].cx)
    const score = (i: number) => {
      const B = D[i]
      const attached = sp.h![0] > 0 && free().some((j) => j !== i && D[j].h >= D[j].w * 1.1 && D[j].cx >= strokes[i].bb.x0 && D[j].cx <= strokes[i].bb.x1
        && (up ? D[j].cy < B.cy && Math.abs(strokes[j].bb.y1 - B.cy) < IH * 0.25 : D[j].cy > B.cy && Math.abs(strokes[j].bb.y0 - B.cy) < IH * 0.25))
      return B.w / IW + 0.5 * (B.cy - ink.y0) / IH * (jong ? 0.3 : 1) + (attached ? 0.5 : 0)
    }
    c.sort((p, q) => score(q) - score(p))
    if (c.length) { beam = c[0]; take(beam, '보') }
    if (beam >= 0 && sp.h[0] > 0) {
      const B = D[beam]
      free().filter((i) => D[i].h >= D[i].w * 1.1 && D[i].cx >= strokes[beam].bb.x0 && D[i].cx <= strokes[beam].bb.x1 && (up ? D[i].cy < B.cy : D[i].cy > B.cy))
        .map((i) => ({ i, g: up ? Math.abs(strokes[i].bb.y1 - B.cy) : Math.abs(strokes[i].bb.y0 - B.cy) }))
        .filter((x) => x.g < IH * 0.25).sort((p, q) => p.g - q.g).slice(0, sp.h[0])
        .forEach((x) => take(x.i, '짧은기둥'))
    }
  }

  // 3) 곁줄기: 기둥에 붙은 짧은 가로 획(오른쪽 또는 왼쪽)
  if (stemL >= 0 && sp.v && sp.v[1] > 0) {
    const S = D[stemL], right = sp.v[2] === 'R'
    free().filter((i) => D[i].w >= D[i].h * 1.1 && Math.abs(D[i].cy - S.cy) <= S.h * 0.48 && (right ? D[i].cx > S.cx : D[i].cx < S.cx))
      .map((i) => ({ i, g: right ? Math.abs(strokes[i].bb.x0 - S.cx) : Math.abs(strokes[i].bb.x1 - S.cx) }))
      .filter((x) => x.g < IW * 0.25).sort((p, q) => p.g - q.g).slice(0, sp.v[1])
      .forEach((x) => take(x.i, '곁줄기'))
  }

  // 4) 나머지: 첫닿자와 받침
  const rest = free()
  if (!jong) rest.forEach((i) => G[0].push(i))
  else if (beam >= 0) {
    const by = D[beam].cy
    const sy = stemL >= 0 ? strokes[stemL].bb.y1 : by
    rest.forEach((i) => (D[i].cy > by && (!sp.v || D[i].cy > Math.min(sy, by + IH * 0.1) - IH * 0.05) ? G[2] : G[0]).push(i))
  } else if (rest.length === 1) {
    const sh = stemL >= 0 ? D[stemL].h : IH
    const sy1 = stemL >= 0 ? strokes[stemL].bb.y1 : ink.y1
    ;(D[rest[0]].cy > sy1 - 0.15 * sh ? G[2] : G[0]).push(rest[0])
  } else if (rest.length) {
    // 가장 큰 세로 틈에서 가른다
    const o = rest.slice().sort((p, q) => D[p].cy - D[q].cy)
    let gi = 0, gv = -1
    for (let k = 0; k < o.length - 1; k++) { const g = D[o[k + 1]].cy - D[o[k]].cy; if (g > gv) { gv = g; gi = k } }
    o.forEach((i, k) => (k <= gi ? G[0] : G[2]).push(i))
  }
  G.forEach((g, slot) => g.forEach((i) => { strokes[i].slot = slot as Slot }))
  return G
}

const EPS = 1e-6
/** 칸 좌표 획 → 상자 0–1. 제어점도 같이 옮긴다. */
function normalizeInto(stroke: StrokeDataV2, box: Rect): StrokeDataV2 {
  const w = Math.max(EPS, box.x1 - box.x0), h = Math.max(EPS, box.y1 - box.y0)
  const map = (p: { x: number; y: number }) => ({ x: (p.x - box.x0) / w, y: (p.y - box.y0) / h })
  return {
    ...stroke,
    points: stroke.points.map((p) => ({ ...map(p), ...(p.handleIn ? { handleIn: map(p.handleIn) } : {}), ...(p.handleOut ? { handleOut: map(p.handleOut) } : {}) })),
  }
}
/** 획 굵기의 반만큼 상자를 키운다. 곧은 세로 획 하나는 폭이 0이라 상자가 선이 되기 때문이다. */
const pad = (r: Rect, t: number): Rect => ({ x0: r.x0 - t, y0: r.y0 - t, x1: r.x1 + t, y1: r.y1 + t })
const rel = (r: Rect, in_: Rect): Rect => {
  const w = Math.max(EPS, in_.x1 - in_.x0), h = Math.max(EPS, in_.y1 - in_.y0)
  return { x0: (r.x0 - in_.x0) / w, y0: (r.y0 - in_.y0) / h, x1: (r.x1 - in_.x0) / w, y1: (r.y1 - in_.y0) / h }
}

/** 프리셋 역할 승계. 프리셋이 없거나 짝이 안 맞는 획은 자유 획 id로 남는다. */
function adopt(drawn: StrokeDataV2[], presets: StrokeDataV2[] | undefined, jamoKey: string): StrokeDataV2[] {
  if (!presets || presets.length === 0 || drawn.length === 0) return drawn
  const match = matchStrokeRoles(drawn, presets)
  return adoptStrokeRoles(drawn, presets, match, { jamoKey, openAsClosed: () => true }).strokes
}

/** 칸 하나를 읽는다. `raws`는 칸 0–1 좌표의 그은 점 묶음. */
export function readSyllable(char: string, raws: PenPoint[][], options: ReadOptions = {}): SyllableRead | null {
  const jamo = decomposeChar(char)
  if (!jamo) return null
  const strokes = raws.filter((r) => r.length >= 2).map(toStroke)
  const notes: string[] = []
  if (strokes.length === 0) return null
  const want = jamo.filter((x): x is string => !!x)
  const groups = groupByPlace(strokes, jamo)
  const epsilon = options.epsilon ?? PEN_FIT_EPSILON
  const thickness = options.thickness ?? HANDWRITING_THICKNESS
  const half = thickness / 2
  const ink = pad(union(strokes.map((s) => s.bb))!, half)
  const fitted = strokes.map((s, i) => fitPenStroke(s.raw, { epsilon, thickness, id: `pen-${i}` })?.stroke ?? null)
  const type = (slot: Slot): JamoData['type'] => slot === 0 ? 'choseong' : slot === 1 ? 'jungseong' : 'jongseong'
  const boxes: Partial<Record<Part, Rect>> = {}

  const parts: PartRead[] = want.map((ch, k) => {
    const slot = k as Slot
    const idx = groups[slot]
    const raw = union(idx.map((i) => strokes[i].bb))
    const abs = raw ? pad(raw, half) : null
    if (!abs || idx.length === 0) { notes.push(`${ch} 자리에 획이 없어요`); return { slot, char: ch, strokes: idx, abs: null, sample: null } }
    const presetJamo = options.preset?.(type(slot), ch)
    const own = idx.map((i) => fitted[i]).filter((s): s is StrokeDataV2 => s !== null)
    // ㅇ 자리의 한 획은 닫힌 획으로
    const closedOwn = own.map((s, j) => (ch === 'ㅇ' || ch === 'ㅎ') && strokes[idx[j]].round ? { ...s, closed: true } : s)
    const mixed = slot === 1 && !!VSPEC[ch]?.v && !!VSPEC[ch]?.h
    let sample: JamoSample
    if (mixed) {
      const vIdx = idx.filter((i) => strokes[i].role === '기둥' || strokes[i].role === '곁줄기')
      const hIdx = idx.filter((i) => !vIdx.includes(i))
      const vRaw = union(vIdx.map((i) => strokes[i].bb)), hRaw = union(hIdx.map((i) => strokes[i].bb))
      const vBox = vRaw ? pad(vRaw, half) : abs
      const hBox = hRaw ? pad(hRaw, half) : abs
      const pick = (list: number[]) => list.map((i) => closedOwn[idx.indexOf(i)]).filter((s): s is StrokeDataV2 => !!s)
      sample = {
        char: ch, slot, strokes: [], from: char, asp: (abs.x1 - abs.x0) / Math.max(EPS, abs.y1 - abs.y0),
        verticalStrokes: adopt(pick(vIdx).map((s) => normalizeInto(s, vBox)), presetJamo?.verticalStrokes, ch),
        horizontalStrokes: adopt(pick(hIdx).map((s) => normalizeInto(s, hBox)), presetJamo?.horizontalStrokes, ch),
        mixedBoxes: { JU_H: rel(hBox, abs), JU_V: rel(vBox, abs) },
      }
      boxes.JU_H = rel(hBox, ink)
      boxes.JU_V = rel(vBox, ink)
    } else {
      const presets = presetJamo ? (presetJamo.strokes && presetJamo.strokes.length ? presetJamo.strokes : [...(presetJamo.verticalStrokes ?? []), ...(presetJamo.horizontalStrokes ?? [])]) : undefined
      sample = { char: ch, slot, strokes: adopt(closedOwn.map((s) => normalizeInto(s, abs)), presets, ch), from: char, asp: (abs.x1 - abs.x0) / Math.max(EPS, abs.y1 - abs.y0) }
      boxes[slot === 0 ? 'CH' : slot === 1 ? 'JU' : 'JO'] = rel(abs, ink)
    }
    return { slot, char: ch, strokes: idx, abs, sample }
  })

  return {
    char, jamo: want, strokes, parts, boxes,
    frame: { x0: ink.x0, y0: ink.y0, w: ink.x1 - ink.x0, h: ink.y1 - ink.y0 },
    state: notes.length ? 'bad' : 'ok', notes,
  }
}
