import type { DecomposedSyllable, Part } from '../src/types'

/**
 * 흐림 선(새 틈 규칙 1단계, 거북이 설계 2026-11-23 · 하니무스 "추천대로 ㄱ"). 설계 `study/mold-gap-design/빚기-새-틈-규칙-설계.md`.
 *
 * 첫닿자 잉크만 가우스로 흐리면(반지름 = 글자 키 × 0.13) 진하기가 한 값(T)인 세로선이 생긴다. 실제 폰트는 홀자 기둥 왼변이 이 선 위에 선다.
 * - 선이 기둥보다 왼쪽(자리가 남음, 「다」 「타」): 닿자 뼈대를 오른쪽으로 넓힌다 — 획 두께 · 글자 폭은 그대로(B안).
 * - 선이 기둥을 넘음(답답함, 굵기 끝 「카」 「파」): 기둥이 밖으로 나가 글자가 넓어진다.
 * - 폰트들도 선에서 조금씩 빗나간다. 그 빗나감 폭(`tolerance`) 안이면 아무것도 안 한다 — 처음 모습 대부분이 그대로다.
 *
 * T = 여유 × (기둥 ÷ 키) × (굵어진 배율)^넓어짐. 여유 · 넓어짐이 손잡이 둘이다(`HALO_SCALE`).
 * 순수 셈이다 — 엔진을 부르지 않는다. 중심선(em)과 두께만 받는다.
 */

export interface HaloPt { x: number; y: number }
export interface HaloStroke {
  part: Part
  /** 중심선(글자 칸 좌표, 곡선은 편 점). */
  points: readonly HaloPt[]
  /** 잉크 두께(같은 좌표). 토막 방향마다 다르면 `thick`로 세로 · 가로 배율을 준다. */
  thickness: number
  closed?: boolean
  thick?: { v: number; h: number }
  /** 열린 끝 모양(없으면 둥근 끝). 둥근 끝은 반 두께만큼 더 나가 선을 당긴다. */
  cap?: 'butt' | 'round' | 'square'
}

/** 흐림 반지름 = 글자 키의 몫. 폰트 8벌에서 맞춘 값(고양이 공부 3, `study/변수화-목록-2026-11-23.md` 4번). */
export const HALO_RADIUS = 0.13
/** 글자 키를 몇 칸 격자로 그리나. 반지름이 5칸쯤 되게. */
const GRID = 40

/**
 * 손잡이 눈금(폰트 분포. 비버 2026-11-23, 거북이 자 `m3.py`와 같은 셈으로 보통 · 굵은 폰트 20벌의 ㅏ 14자를 잼).
 * 여유(ease) = 기둥 왼변의 흐림 진하기 ÷ (기둥 ÷ 키), 보통 굵기 글꼴. 작을수록 선이 멀어져 자소 사이가 넓다.
 * 넓어짐(spread) = 굵어질 때 여유가 커지는 지수 q(여유 ∝ 굵어진 배율^q). 작을수록 굵어질 때 기둥이 밖으로 더 나가 글자가 넓어진다.
 */
export const HALO_SCALE = {
  // [여유 끝(선이 멂), 가운데, 촘촘 끝] — IBM 플렉스 0.48 · 나눔명조 0.56 · 고딕 A1 0.63 · 고운바탕 0.63 · 나눔고딕 0.69 · 고운돋움 0.76
  ease: [0.48, 0.63, 0.76],
  // [많이 넓어짐, 가운데, 덜 넓어짐] — 집안 안 보통 → 다른 굵기 10쌍: 나눔고딕 0.33 · 0.42, 고딕 A1 0.38 · 0.38 · 0.45, IBM 0.44 · 1.08, 고운바탕 0.63, 나눔명조 0.89 · 0.90
  spread: [0.33, 0.445, 1.08],
} as const
/**
 * 엔진 처음 값. 여유는 엔진 글줄(ㅏ 14자, 굵기 처음) 기둥 왼변 진하기의 가운데라 처음 모습 대부분이 그대로다(이 값에서 빗나감 가운데 = 0).
 * 넓어짐은 고딕 가운데. 노토 숫자가 아니라 이 엔진 글자에서 잰 값이다.
 */
export const HALO_ENGINE = { ease: 0.78, spread: 0.42 } as const
/** 고딕 · 명조 시작값(그 집안 폰트의 가운데). */
export const HALO_PRESETS = {
  gothic: { ease: 0.66, spread: 0.42 }, // 고딕 A1 · 나눔고딕 · 고운돋움 · IBM 플렉스
  myeongjo: { ease: 0.6, spread: 0.89 }, // 나눔명조 · 고운바탕
} as const
/**
 * 빗나감 폭(글자 키의 몫): 보통 굵기 폰트 넷이 제 선에서 빗나간 양(ㅏ 14자 평균)의 가운데 —
 * IBM 플렉스 0.89 · 고딕 A1 1.34 · 고운돋움 1.58 · 나눔고딕 2.15%(거북이 설계 0절 표). 이 안이면 고치지 않는다.
 */
export const HALO_TOLERANCE = 0.015
/** 닿자 뼈대를 넓힐 때 남길 끝 틈(글자 키의 몫). 오른쪽이 열린 닿자(ㄴ ㄷ ㄹ ㅌ) 끝 틈의 폰트 아래 끝(같은 넷, 10%). */
export const HALO_END_GAP = 0.05
/** 뼈대를 넓히는 안전 끝(배). 0단계 B 흉내에서 가장 크게 넓힌 것이 「대」 ×1.22였다. 보통은 끝 틈이 먼저 멈춘다. */
const WIDEN_MAX = 1.3

export interface HaloRule {
  /** 여유(위 `HALO_SCALE.ease`). */
  ease: number
  /** 넓어짐 지수 q. */
  spread: number
  /** 기둥 두께 ÷ 처음 굵기의 기둥 두께. */
  grown: number
}

/** 1단계가 다루는 글자: 홑닿자(ㅍ 빼고) + 세로홀자 중 곁줄기가 오른쪽인 것(ㅏ ㅑ ㅣ ㅐ ㅒ), 받침 없음. 쌍닿자 · ㅍ · ㅓ · 받침은 다음 단계. */
const SCOPE_INITIAL = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅎ'
const SCOPE_MEDIAL = 'ㅏㅑㅣㅐㅒ'
export function haloScope(syllable: DecomposedSyllable): boolean {
  if (syllable.layoutType !== 'choseong-jungseong-vertical' || syllable.jongseong) return false
  const initial = syllable.choseong?.char, medial = syllable.jungseong?.char
  return !!initial && !!medial && SCOPE_INITIAL.includes(initial) && SCOPE_MEDIAL.includes(medial)
}

const segThick = (stroke: HaloStroke, a: HaloPt, b: HaloPt) => {
  if (!stroke.thick) return stroke.thickness
  const l = Math.hypot(b.x - a.x, b.y - a.y), u = l < 1e-9 ? 0.5 : ((b.y - a.y) / l) ** 2
  return stroke.thickness * (stroke.thick.v * u + stroke.thick.h * (1 - u))
}
const segsOf = (stroke: HaloStroke) => {
  const pts = stroke.closed && stroke.points.length > 2 ? [...stroke.points, stroke.points[0]] : stroke.points
  return pts.length === 1 ? [[pts[0], pts[0]] as const] : pts.slice(1).map((b, i) => [pts[i], b] as const)
}

interface Ink { x0: number; x1: number; y0: number; y1: number }
function inkOf(strokes: readonly HaloStroke[]): Ink | null {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  for (const stroke of strokes) segsOf(stroke).forEach(([a, b], at, segs) => {
    const h = segThick(stroke, a, b) / 2, l = Math.hypot(b.x - a.x, b.y - a.y)
    const flat = !stroke.closed && stroke.cap && stroke.cap !== 'round' && l > 1e-9
    // 열린 각진 끝은 옆으로만 반 두께(네모 끝은 앞으로도 반 두께). 둥근 끝 · 이음매는 사방 반 두께.
    const ends: [HaloPt, boolean, number][] = [[a, !!flat && at === 0, -1], [b, !!flat && at === segs.length - 1, 1]]
    for (const [p, isFlat, dir] of ends) {
      if (!isFlat) { add(p.x - h, p.y - h); add(p.x + h, p.y + h); continue }
      const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l, along = stroke.cap === 'square' ? h * dir : 0
      add(p.x - uy * h + ux * along, p.y + ux * h + uy * along); add(p.x + uy * h + ux * along, p.y - ux * h + uy * along)
    }
  })
  return x0 < x1 ? { x0, x1, y0, y1 } : null
}

/** 홀자 기둥: 세로로 가장 긴 홀자 토막 가운데 가장 왼쪽 것. 왼변과 두께. */
export function haloStemOf(strokes: readonly HaloStroke[]): { left: number; thickness: number } | null {
  let best: { left: number; thickness: number; len: number } | null = null
  let longest = 0
  const segs = strokes.filter((s) => s.part !== 'CH' && s.part !== 'JO').flatMap((s) => segsOf(s).map(([a, b]) => ({ a, b, t: segThick(s, a, b) })))
  for (const { a, b } of segs) if (Math.abs(b.x - a.x) < 0.25 * Math.abs(b.y - a.y)) longest = Math.max(longest, Math.abs(b.y - a.y))
  for (const { a, b, t } of segs) {
    const len = Math.abs(b.y - a.y)
    if (Math.abs(b.x - a.x) >= 0.25 * len || len < 0.6 * longest) continue
    const left = Math.min(a.x, b.x) - t / 2
    if (!best || left < best.left) best = { left, thickness: t, len }
  }
  return best && { left: best.left, thickness: best.thickness }
}

/** 첫닿자 잉크를 흐린 진하기의 세로 단면 최댓값. x(글자 칸 좌표)마다 읽는 함수를 돌려준다. */
function profileOf(ch: readonly HaloStroke[], H: number, around: Ink): (x: number) => number {
  const cell = H / GRID, sigma = HALO_RADIUS * GRID, pad = Math.ceil(3 * sigma) + 2
  const ox = around.x0 - pad * cell, oy = around.y0 - pad * cell
  const nx = Math.ceil((around.x1 - around.x0) / cell) + 2 * pad, ny = Math.ceil((around.y1 - around.y0) / cell) + 2 * pad
  const grid = new Float32Array(nx * ny)
  for (const stroke of ch) segsOf(stroke).forEach(([a, b], at, segs) => {
    const half = segThick(stroke, a, b) / 2
    // 열린 끝(첫 토막 앞 · 마지막 토막 뒤)만 끝 모양을 따른다. 이음매는 둥글게 이어 틈이 안 생기게.
    const open = !stroke.closed && stroke.cap && stroke.cap !== 'round'
    const reachStart = open && at === 0 ? (stroke.cap === 'square' ? half : 0) : Infinity
    const reachEnd = open && at === segs.length - 1 ? (stroke.cap === 'square' ? half : 0) : Infinity
    const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - half - ox) / cell) - 1), ix1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + half - ox) / cell) + 1)
    const iy0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - half - oy) / cell) - 1), iy1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + half - oy) / cell) + 1)
    const dx = b.x - a.x, dy = b.y - a.y, ll = dx * dx + dy * dy
    for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      const px = ox + (ix + 0.5) * cell, py = oy + (iy + 0.5) * cell
      const len = Math.sqrt(ll), raw = ll < 1e-12 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / ll
      const t = Math.max(0, Math.min(1, raw))
      const d = Math.hypot(px - a.x - t * dx, py - a.y - t * dy)
      // 끝 너머로 간 거리. 둥근 끝 · 이음매는 거리 그대로, 각진 끝은 끝 모양이 허락한 만큼까지만 잉크.
      const beyond = raw < 0 ? -raw * len - reachStart : raw > 1 ? (raw - 1) * len - reachEnd : -Infinity
      const across = len < 1e-9 ? d : Math.abs((px - a.x) * dy - (py - a.y) * dx) / len
      const flatEnd = beyond > -Infinity
      const cover = flatEnd
        ? Math.max(0, Math.min(1, (half - across) / cell + 0.5, 0.5 - beyond / cell))
        : Math.max(0, Math.min(1, (half - d) / cell + 0.5))
      if (cover > grid[iy * nx + ix]) grid[iy * nx + ix] = cover
    }
  })
  const r = Math.ceil(4 * sigma), kernel = new Float32Array(2 * r + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) { kernel[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += kernel[i + r] }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum
  const tmp = new Float32Array(nx * ny), out = new Float32Array(nx * ny)
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    let v = 0
    for (let k = -r; k <= r; k++) { const j = ix + k; if (j >= 0 && j < nx) v += grid[iy * nx + j] * kernel[k + r] }
    tmp[iy * nx + ix] = v
  }
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    let v = 0
    for (let k = -r; k <= r; k++) { const j = iy + k; if (j >= 0 && j < ny) v += tmp[j * nx + ix] * kernel[k + r] }
    out[iy * nx + ix] = v
  }
  const col = new Float32Array(nx)
  for (let ix = 0; ix < nx; ix++) { let m = 0; for (let iy = 0; iy < ny; iy++) m = Math.max(m, out[iy * nx + ix]); col[ix] = m }
  return (x: number) => {
    const f = (x - ox) / cell - 0.5, i = Math.floor(f)
    if (i < 0) return col[0]
    if (i >= nx - 1) return col[nx - 1]
    return col[i] + (col[i + 1] - col[i]) * (f - i)
  }
}

/** 첫닿자 잉크 오른끝부터 오른쪽으로 진하기가 T 아래로 처음 내려가는 x. */
function lineOf(profile: (x: number) => number, from: number, T: number, H: number): number {
  const step = H / GRID / 4
  let x = from
  for (let i = 0; i < 4 * GRID; i++) {
    const next = x + step
    if (profile(next) <= T) { const a = profile(x), b = profile(next); return a - b > 1e-9 ? x + step * (a - T) / (a - b) : next }
    x = next
  }
  return x
}

export interface HaloFit {
  /** 선 − 기둥 왼변, 글자 키의 몫(+ 답답 · − 자리 남음). 고치기 전. */
  err: number
  /** 기둥 왼변의 진하기 ÷ (기둥 ÷ 키) — 이 글자의 여유(재기용). */
  ease: number
  /** 닿자 뼈대 가로 배율(왼끝 고정)과 그 왼끝. */
  widen: number
  anchor: number
  /** 홀자를 오른쪽으로 옮길 양(글자 칸 좌표). */
  push: number
  /** 고친 뒤 선 − 기둥, 끝 틈(둘 다 글자 키의 몫). */
  after: number
  gap: number
  /** 기둥 두께 ÷ 글자 키(재기용). */
  stem: number
}

const scaleCh = (strokes: readonly HaloStroke[], anchor: number, k: number) => strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ x: anchor + (p.x - anchor) * k, y: p.y })) }))

/** 한 글자의 흐림 선 맞추기. 다루지 않는 모양(기둥 · 닿자 없음)이면 null. */
export function haloFit(strokes: readonly HaloStroke[], rule: HaloRule): HaloFit | null {
  const all = inkOf(strokes), ch = strokes.filter((s) => s.part === 'CH'), stem = haloStemOf(strokes)
  const chInk = inkOf(ch)
  if (!all || !chInk || !stem || chInk.x1 >= stem.left) return null
  const H = all.y1 - all.y0
  const T = rule.ease * Math.max(rule.grown, 1e-3) ** rule.spread * stem.thickness / H
  const measure = (k: number) => {
    const scaled = k === 1 ? ch : scaleCh(ch, chInk.x0, k)
    const ink = inkOf(scaled)!
    const profile = profileOf(scaled, H, { x0: ink.x0, x1: Math.max(ink.x1, stem.left + 0.5 * H), y0: all.y0, y1: all.y1 })
    return { line: lineOf(profile, ink.x1, T, H), right: ink.x1, profile }
  }
  const first = measure(1)
  const err = (first.line - stem.left) / H
  const ease = first.profile(stem.left) / (stem.thickness / H)
  let widen = 1, push = 0, after = err, gap = (stem.left - first.right) / H
  if (err < -HALO_TOLERANCE) {
    // 자리가 남음: 선이 기둥에 닿거나 끝 틈이 폰트 아래 끝에 닿을 때까지 뼈대를 넓힌다(남은 자리는 선까지 메운다).
    const ok = (k: number) => { const m = measure(k); return m.line <= stem.left && (stem.left - m.right) / H >= HALO_END_GAP }
    if (ok(1)) {
      let lo = 1, hi = WIDEN_MAX
      if (ok(hi)) lo = hi
      else for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid }
      widen = lo
      const m = measure(widen)
      after = (m.line - stem.left) / H; gap = (stem.left - m.right) / H
    }
  } else if (err > HALO_TOLERANCE) {
    // 답답함: 기둥이 밖으로(글자가 넓어진다). 글자 폭은 덜 바뀌게 빗나감 폭 끝까지만.
    push = (err - HALO_TOLERANCE) * H
    after = HALO_TOLERANCE; gap += push / H
  }
  return { err, ease, widen, anchor: chInk.x0, push, after, gap, stem: stem.thickness / H }
}
