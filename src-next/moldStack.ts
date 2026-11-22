import type { BoxConfig, Part } from '../src/types'
import { balloonGroupOf, type BalloonGroup, type BalloonStroke, type Thick } from './moldBalloon'

/**
 * 쌓인 획 법칙으로 자소 칸을 글자 기둥 전체로 다시 나눈다(거북이 굵을-때-획-균형.md ①, 하니무스 2026-11-22 "넣어").
 *
 * 가로줄기 쌓임(세로로 훑기)과 세로줄기 쌓임(가로로 훑기)을 따로 한 번씩:
 * 1. 기둥: 같은 자리를 지나는 곧은 획(25° 안, 길이 0.08em 이상)이 가장 많은 곳. 획 끝 제 굵기 안쪽은 안 센다(「운」 ㅜ 짧은기둥 끝과 ㄴ 기둥 윗끝이 살짝 겹친 것은 쌓임이 아니다). 줄 n개, 쌓인 높이 S(첫 줄 바깥 ~ 끝 줄 바깥, 처음 굵기 잉크).
 * 2. 굵기 t: 자연 틈 p = (S − n × 바라는 굵기) ÷ (n − 1)이 넉넉하면(p ≥ a ÷ (1 − b) × T) 바라는 굵기 그대로,
 *    좁으면 틈 = max(0.16T, aT + bp), t = (S − (n − 1) × 틈) ÷ n. 이 글자의 그 결 획은 자소 가리지 않고 모두 t.
 * 3. 흰 틈: 남은 흰 몫 S − n × t를 처음 틈 비율대로(틈 = max(바닥, λ × 처음 틈)). 바닥 = min(0.16T, 처음 틈). 자소 안 · 사이 틈을 가리지 않는다.
 * 4. 첫 줄 바깥 변은 그대로, 거기서부터 t · 틈을 쌓아 줄 자리를 정한다.
 * 5. 자소마다 제 줄의 옛 중심선 → 새 자리로 칸을 늘이고 옮긴다(줄 하나면 옮기기만). 기둥에 안 걸린 자소는 그 결에선 그대로.
 * 반복해 풀지 않고 한 번에 셈한다. 꼭지 · 열린 팔 · 곁줄기 바닥과 남은 틈은 그 뒤 풍선(`solveBalloon`)이 이 칸 · 이 굵기에서 출발해 맡는다.
 * a · b는 고딕 굵은 폰트 12벌 238자(가로) · 38자(세로)에서 맞춘 값(law.py). 숫자는 방향 · 비율로만 쓴다(R042).
 */
/**
 * 틈 바닥(기준 T = 바라는 세로줄기의 배). 노토 산스 KR 700과 같은 크기로 나란히 놓고 정함(하니무스 2026-11-22 11:41 "노토 700까지"):
 * 법칙 틈(0.21T + 0.64p, 바닥 0.16T)대로면 「늘」 가로가 노토 700보다 가늘고 틈은 넓었고, 「빼」 「뿐」 ㅃ은 0.16T 틈이 실금이라 덩어리였다.
 * 노토 700은 획을 먼저 지키고 틈을 획의 반쯤까지 내준다 — 그래서 획은 바라는 굵기를 먼저, 틈은 그 글자 획의 0.4배까지 줄인 뒤에야 획을 줄인다(노토 700 「늘」 틈 ÷ 보 ≈ 0.4).
 */
export const STACK_LAW = { floor: 0.4 } as const
const LINE_MIN = 0.08
const LINE_TILT = Math.sin(25 / 180 * Math.PI) ** 2
/**
 * 기둥 줄 밖으로 max(0.035em, 줄 범위의 0.35배) 넘게 뻗은 획이 있으면 굳은 자소. 꺾임 · 끝 같은 작은 넘침과
 * 「하」 ㅎ 꼭지(보 위로 줄 범위의 4분의 1쯤)는 안 센다 — ㅎ을 굳히면 고리 속이 못 줄어 가로가 기둥의 0.5배까지 갔다.
 */
const PROTRUDE = { least: 0.035, ratio: 0.35 } as const

interface Line { at: number; width: number; parts: Part[] }
export interface StackColumn {
  lines: Line[]
  /**
   * 굳은 틈(앞 줄과 뒷 줄이 같은 굳은 자소). 굳은 자소 = 기둥 줄 밖으로 다른 획이 삐져나온 자소(「계」 ㅖ 곁줄기 둘 위아래로 기둥이 뻗음, ㅂ 가운데 보 위로 두 기둥).
   * 그 자소를 줄 사이로 줄이면 삐져나온 획까지 같이 줄어 글자가 작아진다(④) — 중심선 사이는 그대로 두고 옮기기만 한다.
   */
  rigid: boolean[]
  rigidParts: Part[]
}
export interface StackColumns { h: StackColumn | null; v: StackColumn | null }

/** 처음 굵기(`base`)의 잉크로 두 결의 기둥을 잡는다. 굵기 값과 무관해 한 번만 잰다. */
export function stackColumns(strokes: readonly BalloonStroke[], base: Thick): StackColumns {
  const pick = (kind: 'h' | 'v'): StackColumn | null => {
    const segs: { lo: number; hi: number; at: number; width: number; part: Part }[] = []
    for (const stroke of strokes) {
      // 닫힌 획(ㅇ 고리)은 위아래(세로로 훑을 때) · 좌우(가로로 훑을 때) 두 줄로 센다 — 굽은 획이라 토막으로는 안 잡히지만
      // 거북이 자(잉크 줄 묶음)에는 잡혀 「하」 ㅎ이 꼭지 · 보 · 고리 위 · 고리 아래 네 줄로 쌓인다. 줄 길이는 고리 폭의 가운데 60%.
      if (stroke.closed) {
        const xs = stroke.points.map((point) => point.x), ys = stroke.points.map((point) => point.y)
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
        const width = stroke.thickness * (kind === 'h' ? base.h : base.v)
        const [lo, hi] = kind === 'h' ? [x0 + 0.2 * (x1 - x0), x1 - 0.2 * (x1 - x0)] : [y0 + 0.2 * (y1 - y0), y1 - 0.2 * (y1 - y0)]
        if (hi - lo >= LINE_MIN * 0.5) for (const at of kind === 'h' ? [y0, y1] : [x0, x1]) segs.push({ lo: lo - width, hi: hi + width, at, width, part: stroke.part })
        continue
      }
      for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1], b = stroke.points[i], len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len < LINE_MIN) continue
        const lean = kind === 'h' ? ((b.y - a.y) / len) ** 2 : ((b.x - a.x) / len) ** 2
        if (lean > LINE_TILT) continue
        const [lo, hi] = kind === 'h' ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)]
        segs.push({ lo, hi, at: kind === 'h' ? (a.y + b.y) / 2 : (a.x + b.x) / 2, width: stroke.thickness * (kind === 'h' ? base.h : base.v), part: stroke.part })
      }
    }
    let best: Line[] = []
    for (let c = 0; c <= 1.0001; c += 0.01) {
      const col = segs.filter((s) => s.lo + s.width <= c && c <= s.hi - s.width).sort((p, q) => p.at - q.at)
      const lines: Line[] = []
      for (const s of col) {
        const last = lines[lines.length - 1]
        if (last && Math.abs(s.at - last.at) < 0.25 * (s.width + last.width) + 0.01) { if (!last.parts.includes(s.part)) last.parts.push(s.part); continue }
        lines.push({ at: s.at, width: s.width, parts: [s.part] })
      }
      if (lines.length > best.length) best = lines
    }
    if (best.length < 2) return null
    // 자소마다 쌓이는 축의 중심선 범위와, 기둥 줄이 덮는 범위.
    const rigidParts = [...new Set(best.flatMap((line) => line.parts))].filter((part) => {
      const own = best.filter((line) => line.parts.includes(part))
      if (own.length < 2) return false
      const ats = strokes.filter((stroke) => stroke.part === part).flatMap((stroke) => stroke.points.map((point) => (kind === 'h' ? point.y : point.x)))
      const lo = Math.min(...ats), hi = Math.max(...ats)
      const span = own[own.length - 1].at - own[0].at, most = Math.max(PROTRUDE.least, PROTRUDE.ratio * span)
      return own[0].at - lo > most || hi - own[own.length - 1].at > most
    })
    const rigid = best.slice(1).map((line, i) => line.parts.some((part) => rigidParts.includes(part) && best[i].parts.includes(part)))
    return { lines: best, rigid, rigidParts }
  }
  return { h: pick('h'), v: pick('v') }
}

/**
 * 바라는 굵기 `ref`(그 결 줄기, em) · 기준 `T`(바라는 세로줄기, em)에서 법칙 굵기와 줄 자리. 넉넉하면 null.
 * `least`는 앞 걸음들이 낸 가장 굵은 t — 굵기 값을 올렸는데 틈 바닥(0.16T)이 커져 획이 도로 가늘어지지 않게(④) 그 아래로 안 내린다.
 */
function layOf(column: StackColumn, ref: number, T: number, extra: { lo: number; hi: number }, least: number) {
  const { lines } = column, n = lines.length
  const top = lines[0].at - lines[0].width / 2 - extra.lo
  const S = lines[n - 1].at + lines[n - 1].width / 2 + extra.hi - top
  const gaps0 = lines.slice(1).map((line, i) => Math.max(0, line.at - line.width / 2 - (lines[i].at + lines[i].width / 2)) + (i === 0 ? extra.lo : 0) + (i === n - 2 ? extra.hi : 0))
  // 굳은 틈: 중심선 사이 D 그대로(틈 = D − t). 무른 틈: 바닥 min(0.5t, 처음 틈) 위에서 처음 틈 비율대로.
  // 바닥은 굵기 값(T)이 아니라 그 글자의 획 t에 묶는다 — T에 묶으면 굵기를 올릴수록 바닥이 커져 획이 도로 가늘어졌다(「뿐」).
  const { rigid } = column
  const D = lines.slice(1).map((line, i) => line.at - lines[i].at)
  const r = rigid.filter(Boolean).length
  const rigidD = D.reduce((sum, d, i) => sum + (rigid[i] ? d : 0), 0)
  let t = ref, floors: number[] = [], flexFloor = 0
  for (let k = 0; k < 8; k++) {
    floors = gaps0.map((g) => Math.min(STACK_LAW.floor * t, g))
    flexFloor = floors.reduce((sum, f, i) => sum + (rigid[i] ? 0 : f), 0)
    // 무른 틈이 모두 바닥이면 t = (S − 굳은 D 합 − 무른 바닥 합) ÷ (n − 굳은 틈 수). 굳은 틈도 바닥 아래로는 안 간다.
    t = Math.min(ref, (S - rigidD - flexFloor) / (n - r), ...D.map((d, i) => (rigid[i] ? d - floors[i] : Infinity)))
  }
  void T
  t = Math.min(ref, Math.max(t, least))
  const white = Math.max(0, S - rigidD - (n - r) * t)
  let gaps: number[]
  if (white <= flexFloor) gaps = floors.map((f, i) => (rigid[i] ? D[i] - t : f * (flexFloor > 1e-9 ? white / flexFloor : 0)))
  else {
    let lo = 0, hi = 8
    for (let k = 0; k < 50; k++) { const lam = (lo + hi) / 2, sum = floors.reduce((acc, f, i) => acc + (rigid[i] ? 0 : Math.max(f, lam * gaps0[i])), 0); if (sum < white) lo = lam; else hi = lam }
    gaps = floors.map((f, i) => (rigid[i] ? D[i] - t : Math.max(f, hi * gaps0[i])))
  }
  const centers: number[] = []
  let edge = top
  for (let i = 0; i < n; i++) { centers.push(edge + t / 2); edge += t + (gaps[i] ?? 0) }
  return { t, centers }
}

export interface StackLay {
  strokes: BalloonStroke[]
  boxes: Partial<Record<Part, BoxConfig>>
  /** 풍선이 출발할 묶음별 굵기 배율. 기둥에 걸린 자소의 묶음은 그 결이 t, 나머지는 처음 굵기. */
  start: Partial<Record<BalloonGroup, Thick>>
  applied: { h: boolean; v: boolean }
}

/**
 * 칸 · 중심선을 법칙대로 다시 놓는다. `wants`는 굵기 1부터 지금까지 걸음마다의 바라는 배율(마지막이 지금) — ④를 위해 앞 걸음의 t를 바닥으로 쓴다.
 * `outer`는 세로줄기 쌓임에서 글자 바깥 변이 넓어지는 양(풍선의 넓어짐 공식과 같은 값, 세로줄기 1em당).
 */
export function stackLay(
  columns: StackColumns, strokes: readonly BalloonStroke[], boxes: Partial<Record<Part, BoxConfig>>, base: Thick, wants: readonly Thick[],
  outer?: { left: number; right: number },
): StackLay {
  const median = [...strokes].map((s) => s.thickness).sort((a, b) => a - b)[Math.floor(strokes.length / 2)] ?? 0.07
  const start: Partial<Record<BalloonGroup, Thick>> = {}
  const maps: Partial<Record<Part, { x?: (v: number) => number; kx?: number; y?: (v: number) => number; ky?: number }>> = {}
  const applied = { h: false, v: false }
  for (const kind of ['h', 'v'] as const) {
    const column = columns[kind]
    if (!column) continue
    const extraOf = (w: Thick) => {
      if (kind === 'h' || !outer) return { lo: 0, hi: 0 }
      const delta = median * Math.max(0, w.v - base.v), lo = column.lines[0].at - column.lines[0].width / 2, hi = column.lines[column.lines.length - 1].at + column.lines[column.lines.length - 1].width / 2
      return { lo: Math.min(lo, outer.left * delta), hi: Math.min(1 - hi, outer.right * delta) }
    }
    let least = 0, lay: ReturnType<typeof layOf> | null = null
    for (const w of wants) {
      const ref = median * (kind === 'h' ? w.h : w.v), T = median * w.v
      lay = layOf(column, ref, T, extraOf(w), least)
      if (lay) least = Math.max(least, lay.t)
    }
    if (!lay) continue
    const multiplier = lay.t / median
    if (!(multiplier > base[kind] + 1e-6)) continue
    applied[kind] = true
    const centers = lay.centers
    const touched = new Set(column.lines.flatMap((line) => line.parts))
    // 법칙이 걸린 결(t < 바라는 굵기)만 t를 바닥으로 넘긴다. 넉넉한 결은 줄 자리만 나누고 굵기는 풍선이 처음 굵기부터 푼다 —
    // 넉넉한데도 바라는 굵기를 바닥으로 박으면 「차」 ㅊ 꼭지(세로)가 안 가늘어져 그 밑 보가 처음 굵기까지 눌렸다.
    const last = wants[wants.length - 1]
    if (multiplier < (kind === 'h' ? last.h : last.v) - 1e-6) for (const part of touched) { const g = balloonGroupOf(part); start[g] = { ...(start[g] ?? base), [kind]: multiplier } }
    for (const part of touched) {
      const idx = column.lines.map((line, i) => (line.parts.includes(part) ? i : -1)).filter((i) => i >= 0)
      const a = idx[0], b = idx[idx.length - 1]
      const oa = column.lines[a].at, ob = column.lines[b].at, na = centers[a], nb = centers[b]
      const k = idx.length >= 2 && ob - oa > 1e-6 && !column.rigidParts.includes(part) ? (nb - na) / (ob - oa) : 1
      const map = (v: number) => na + (v - oa) * k
      const entry = maps[part] ?? {}
      if (kind === 'h') { entry.y = map; entry.ky = k } else { entry.x = map; entry.kx = k }
      maps[part] = entry
    }
  }
  if (!applied.h && !applied.v) return { strokes: [...strokes], boxes, start, applied }
  const nextBoxes: Partial<Record<Part, BoxConfig>> = { ...boxes }
  for (const [part, map] of Object.entries(maps) as [Part, NonNullable<(typeof maps)[Part]>][]) {
    const box = boxes[part]
    if (!box) continue
    nextBoxes[part] = {
      ...box,
      ...(map.x ? { x: map.x(box.x), width: box.width * (map.kx ?? 1) } : {}),
      ...(map.y ? { y: map.y(box.y), height: box.height * (map.ky ?? 1) } : {}),
    }
  }
  const nextStrokes = strokes.map((stroke) => {
    const map = maps[stroke.part]
    if (!map) return stroke
    return { ...stroke, points: stroke.points.map((point) => ({ x: map.x ? map.x(point.x) : point.x, y: map.y ? map.y(point.y) : point.y })) }
  })
  return { strokes: nextStrokes, boxes: nextBoxes, start, applied }
}
