import type { BoxConfig, DecomposedSyllable, Part } from '../src/types'

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
  /** 닿자 뼈대를 넓힐 수 있는 끝(없으면 `WIDEN_MAX`). 사용자가 닿자를 줄였을 때 줄이기 전 넓힘까지만 — 그 이상 넓히면 키만 줄고 폭은 돌아와 납작해진다. */
  widenMax?: number
}

/** 다루는 글자: 홑닿자(ㅍ 빼고) + 세로홀자 중 곁줄기가 오른쪽인 것(ㅏ ㅑ ㅣ ㅐ ㅒ), 받침 있어도 됨. 쌍닿자 · ㅍ · ㅓ는 다음 단계. */
const SCOPE_INITIAL = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅎ'
const SCOPE_MEDIAL = 'ㅏㅑㅣㅐㅒ'
export function haloScope(syllable: DecomposedSyllable): boolean {
  // 받침 글자도(하니무스 2026-11-24 "모든 굵기의 글자"). 키는 받침까지 든 글자 전체 키 — 폰트 일곱 집안에서 전체 키 2.2% · 첫닿자 칸 4.6% · 위 덩이 7.3%로
  // 전체 키가 가장 잘 모였다(4단계-전면/m13.py). 흐림은 첫닿자 잉크만 칠한다(받침 잉크는 안 넣음).
  if (syllable.layoutType !== 'choseong-jungseong-vertical' && syllable.layoutType !== 'choseong-jungseong-vertical-jongseong') return false
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
function profileOf(ch: readonly HaloStroke[], H: number, around: Ink, rows?: { x0: number; x1: number }): (x: number) => number {
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
  // `rows`가 있으면 가로 단면(그 x 범위 안 최댓값)을 y마다 읽는다 — 받침 위.
  const n = rows ? ny : nx, o = rows ? oy : ox
  const col = new Float32Array(n)
  if (rows) {
    const ix0 = Math.max(0, Math.floor((rows.x0 - ox) / cell)), ix1 = Math.min(nx - 1, Math.ceil((rows.x1 - ox) / cell))
    for (let iy = 0; iy < ny; iy++) { let m = 0; for (let ix = ix0; ix <= ix1; ix++) m = Math.max(m, out[iy * nx + ix]); col[iy] = m }
  } else for (let ix = 0; ix < nx; ix++) { let m = 0; for (let iy = 0; iy < ny; iy++) m = Math.max(m, out[iy * nx + ix]); col[ix] = m }
  return (x: number) => {
    const f = (x - o) / cell - 0.5, i = Math.floor(f)
    if (i < 0) return col[0]
    if (i >= n - 1) return col[n - 1]
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

/** 첫닿자 획을 제 잉크 가운데를 두고 가로세로 k배(닿자 크기를 줄이기 전 모양을 다시 만들 때). */
export function scaleChoseong(strokes: readonly HaloStroke[], k: number): HaloStroke[] {
  const ink = inkOf(strokes.filter((s) => s.part === 'CH'))
  if (!ink || k === 1) return [...strokes]
  const cx = (ink.x0 + ink.x1) / 2, cy = (ink.y0 + ink.y1) / 2
  return strokes.map((s) => s.part !== 'CH' ? s : { ...s, points: s.points.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })) })
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
      let lo = 1, hi = Math.max(1, Math.min(WIDEN_MAX, rule.widenMax ?? WIDEN_MAX))
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

/**
 * 받침 위 흐림 선(하니무스 2026-11-24 "방향마다 폰트가 따르는 규칙"). 위 덩이(첫닿자 + 홀자) 잉크를 흐려, 받침 윗변이 진하기 `FINAL_EASE` × (기둥 ÷ 키)에 서게 한다.
 * 폰트 일곱 집안(노토 한 표)에서 받침 윗변 진하기 ÷ (기둥 ÷ 키)의 가운데 1.51, 굵어져도 거의 그대로(지수 0, 4집안). 폰트끼리도 3.5% 흩어져서 그 폭 밖만 고친다.
 * 받침 밑변은 두고 윗변만 옮긴다(받침 칸 위를 줄이거나 늘림). 재는 도구 `study/mold-gap-design/4단계-전면/m5.py`.
 */
export const FINAL_EASE = 1.51
export const FINAL_TOLERANCE = 0.035
/** 이 셈(중심선 + 두께로 칠한 흐림)이 그려진 글자 픽셀로 잰 값보다 받침 쪽으로 1.0% 높게 나온다 — 엔진 19자 × 굵기 0.5 · 1 · 900 가운데, 흩어짐 0.3~1.3%(4단계-전면/fcmp.py). 폭 가운데를 그만큼 옮겨 잰다. */
export const FINAL_MODEL_BIAS = 0.01
export interface FinalFit {
  /** 선 − 받침 윗변, 글자 키의 몫(+ 답답 · − 자리 남음). 고치기 전. */
  err: number
  /** 받침 윗변을 아래로 옮길 양(글자 칸 좌표, − 이면 위로). */
  move: number
  /** 받침 잉크 윗변 · 밑변(글자 칸 좌표). */
  top: number
  bottom: number
}
export function haloFinalFit(strokes: readonly HaloStroke[], ease = FINAL_EASE): FinalFit | null {
  const all = inkOf(strokes), up = strokes.filter((s) => s.part !== 'JO'), jo = strokes.filter((s) => s.part === 'JO'), stem = haloStemOf(strokes)
  const upInk = inkOf(up), joInk = inkOf(jo)
  if (!all || !upInk || !joInk || !stem || joInk.y0 <= upInk.y0) return null
  const H = all.y1 - all.y0
  const T = ease * stem.thickness / H
  // 위 덩이 잉크 중 받침 윗변보다 위에 있는 것만(기둥 끝이 받침 옆으로 내려와도 선을 안 당기게).
  const profile = profileOf(up, H, { x0: Math.min(upInk.x0, joInk.x0), x1: Math.max(upInk.x1, joInk.x1), y0: upInk.y0, y1: Math.max(upInk.y1, joInk.y1) }, { x0: joInk.x0, x1: joInk.x1 })
  // 받침 윗변 바로 위에서 시작해 아래로: 진하기가 T 아래로 처음 내려가는 y.
  let from = joInk.y0 - 0.5 * H
  while (from < joInk.y0 && profile(from) <= T) from += H / GRID / 4
  const line = lineOf(profile, from, T, H)
  const err = (line - joInk.y0) / H - FINAL_MODEL_BIAS
  let move = 0
  // 폭 밖이면 폭 가운데 쪽(폭의 반)까지 옮긴다 — 폭 끝에 세우면 획 끝 · 꺾임 모양 차로 그려진 글자가 다시 폭을 살짝 넘는다.
  const land = 0.5 * FINAL_TOLERANCE
  if (err > FINAL_TOLERANCE) move = (err - land) * H
  else if (err < -FINAL_TOLERANCE) move = (err + land) * H
  // 받침을 반 넘게 줄이지는 않는다.
  move = Math.min(move, 0.5 * (joInk.y1 - joInk.y0))
  return { err, move, top: joInk.y0, bottom: joInk.y1 }
}

type Boxes = Partial<Record<Part, BoxConfig>>

/** 흐림 선 맞춤을 칸에 옮긴다: 첫닿자 칸은 잉크 왼끝을 두고 가로로 넓히고, 홀자 칸은 오른쪽으로 민다. */
export function haloBoxes(boxes: Boxes, fit: HaloFit | null): Boxes {
  if (!fit || (fit.widen === 1 && fit.push === 0)) return boxes
  const out = { ...boxes }
  if (out.CH && fit.widen !== 1) out.CH = { ...out.CH, x: fit.anchor - (fit.anchor - out.CH.x) * fit.widen, width: out.CH.width * fit.widen }
  if (fit.push) for (const part of ['JU', 'JU_H', 'JU_V'] as const) if (out[part]) out[part] = { ...out[part]!, x: out[part]!.x + fit.push }
  return out
}
/** 받침 위 흐림 선: 받침 칸 윗변만 옮긴다(밑변 고정). 받침 획은 칸에 맞춰 늘거나 줄어든다. */
export function finalBoxes(boxes: Boxes, fit: FinalFit | null): Boxes {
  if (!fit || !fit.move || !boxes.JO) return boxes
  const jo = boxes.JO, scale = (fit.bottom - fit.top - fit.move) / Math.max(fit.bottom - fit.top, 1e-6)
  // 칸 밑변은 그대로, 칸 높이는 잉크 높이와 같은 비율로.
  const bottom = jo.y + jo.height, height = jo.height * scale
  return { ...boxes, JO: { ...jo, y: bottom - height, height } }
}

/**
 * 흐림 선 세 방향(첫닿자↔기둥 · 받침 위)을 한 글자 칸에 입힌다. 빚기 화면과 내보내기(`haloPlacement.ts`)가 이 한 함수를 같이 써서
 * 화면과 파일이 안 갈라진다(실험 6-앞, 2026-11-25). `strokesOn`은 그 칸에 그려질 잉크(중심선 + 두께). 고칠 것이 없으면 null.
 */
export function haloCorrect(input: { syllable: DecomposedSyllable; boxes: Boxes; strokesOn: (boxes: Boxes) => HaloStroke[]; rule: HaloRule; bodyRight?: number; jamo?: number }): { fit: HaloFit | null; final: FinalFit | null; boxes: Boxes } | null {
  const { syllable, boxes, strokesOn, bodyRight, jamo = 1 } = input
  let rule = input.rule
  const pillar = haloScope(syllable), final = !!syllable.jongseong && !!boxes.JO
  if (!pillar && !final) return null
  const strokes = pillar || bodyRight !== undefined ? strokesOn(boxes) : []
  // 닿자를 줄였으면(빚기 「닿자 크기」 < 1) 줄이기 전 모양이 넓힐 만큼까지만 넓힌다. 남는 자리로 다시 넓히면
  // 「가」 ㄱ이 키만 줄고 폭은 돌아와 납작해졌다(고양이 잰 표 44×63 → 41×54, 2026-11-27).
  if (pillar && jamo < 1 && jamo > 0) rule = { ...rule, widenMax: haloFit(scaleChoseong(strokes, 1 / jamo), rule)?.widen ?? 1 }
  let fit = pillar ? haloFit(strokes, rule) : null
  // 글자 폭이 정해진 곳(폰트 탭 · OTF)은 기둥을 글자 몸통 오른끝까지만 민다. 빚기 화면은 글자 자리를 같이 넓혀서 이 끝이 없다.
  if (fit && fit.push > 0 && bodyRight !== undefined) {
    const right = inkOf(strokes.filter((stroke) => stroke.part !== 'CH' && stroke.part !== 'JO'))?.x1 ?? -Infinity
    const push = Math.max(0, Math.min(fit.push, bodyRight - right))
    if (push !== fit.push) fit = { ...fit, push }
  }
  const moved = haloBoxes(boxes, fit)
  // 받침 위(흐림 선 셋째 방향): 폰트 일곱 집안 3.5% 폭 밖만 받침 윗변을 옮긴다. 굵어져도 지수 ~0이라 굵기를 안 곱한다.
  const top = final ? haloFinalFit(strokesOn(moved)) : null
  return { fit, final: top, boxes: finalBoxes(moved, top) }
}
