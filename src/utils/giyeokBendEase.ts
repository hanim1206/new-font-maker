import type { MedialFamily, StrokeDataV2 } from '../types'

/**
 * ㄱ 무리 내림 굽음 덜기(엔진 자동 보정).
 * 사용자가 그린 ㄱ · ㅋ · ㄲ 획(가 모양)은 하나다. 아래홀자(고) · 섞임홀자(과) 벌에서는 엔진이 내림 굽음만 줄여 그린다.
 * 굽음 = 내림 끝이 꺾임(모서리)보다 왼쪽으로 간 거리. 그 거리에 벌마다 비율을 곱한다. 저장된 획은 안 바뀐다.
 *
 * 비율 출처(2026-11-27, 고딕 7벌 노토 한 표, 2-가 전파 판 img/10 · 11):
 * 「고 ÷ 가」 굽음 비 0.09~0.21(가운데 0.13), 「과 ÷ 가」 0.13~0.24. 엔진 획에서 폰트 범위 안에 드는 값으로
 * 처음엔 가운데쯤(아래 0.087 · 섞임 0.065, 잰 굽음 0.12)으로 넣었다가 하니무스 "고 에서 너무 커브 쎈데"(2026-11-27)로
 * 폰트 범위 맨 아래(고 굽음 0.08, 42닷)에 맞춰 아래 0.04 · 섞임 0.03으로 내림. 사용자가 바꿀 수 있게 값으로 받는다(화면 손잡이는 아직 없음).
 *
 * 줄인 굽음 = max(굽음 × 비율, 비율 × FULL_BEND). 기본 프리셋(0.92)은 고 0.037 · 과 0.028.
 * 굽음이 GENTLE_BEND 이하인 획(살짝 굽은 ㄱ)은 고 · 과에서도 그대로 둔다.
 */
export interface BendEase {
  bottom: number
  mixed: number
}

export const BEND_EASE_DEFAULT: Readonly<BendEase> = { bottom: 0.04, mixed: 0.03 }

/** 굽음을 더는 닿자. ㅈ · ㅅ 같은 삐침은 모양이 비슷해도 넣지 않는다(내림이 아니라 삐침). */
export const BEND_EASE_JAMO = 'ㄱㅋㄲ'

/** 기본 프리셋 가 ㄱ 굽음(꺾임 − 내림 끝, 칸 폭 대비). 바닥 = 비율 × 이 값. */
export const FULL_BEND = 0.92

/** 이만큼 이하로 굽은 내림(살짝 굽은 ㄱ, 사용자 프리셋 01의 0.056 등)은 이미 고 · 과 모양이라 손 안 댄다. */
export const GENTLE_BEND = 0.06

type Pt = { x: number; y: number }
type Anchor = StrokeDataV2['points'][number]

/** 마지막 토막(꺾임 → 내림 끝)의 x를 y로 읽는다. 손잡이 하나면 이차, 둘이면 삼차(brushGeometry와 같은 꼴). */
function segmentXAt(from: Anchor, to: Anchor, y: number): number | null {
  const out = from.handleOut
  const incoming = to.handleIn
  const bez = (t: number): Pt => {
    const u = 1 - t
    if (out && incoming) {
      return {
        x: u * u * u * from.x + 3 * u * u * t * out.x + 3 * u * t * t * incoming.x + t * t * t * to.x,
        y: u * u * u * from.y + 3 * u * u * t * out.y + 3 * u * t * t * incoming.y + t * t * t * to.y,
      }
    }
    const c = out ?? incoming
    if (c) return { x: u * u * from.x + 2 * u * t * c.x + t * t * to.x, y: u * u * from.y + 2 * u * t * c.y + t * t * to.y }
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }
  const lo = Math.min(from.y, to.y)
  const hi = Math.max(from.y, to.y)
  if (y < lo - 1e-6 || y > hi + 1e-6) return null
  let best = bez(0)
  for (let i = 1; i <= 200; i += 1) {
    const p = bez(i / 200)
    if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p
  }
  return best.x
}

/** 이 획의 마지막 토막이 왼쪽 아래로 굽은 내림인가: 앞 토막이 가로(꺾임), 끝이 꺾임보다 아래 · 왼쪽. */
function bentDescender(stroke: StrokeDataV2): boolean {
  const pts = stroke.points
  if (stroke.closed || pts.length < 3) return false
  const [a, c, e] = pts.slice(-3)
  // 긋기로 가로 마디를 바꾸면 꺾임 앞에 점이 촘촘히 붙는다. 바로 앞 점은 꺾임과 높이가 비슷하고 왼쪽이면 가로 마디로 본다.
  const horizontal = Math.abs(c.y - a.y) < 0.15 && c.x - a.x > 0.001
  return horizontal && e.y - c.y > 0.3 && c.x - e.x > 0.005
}

function scaleX(p: Pt | undefined, originX: number, factor: number): Pt | undefined {
  return p ? { x: originX + (p.x - originX) * factor, y: p.y } : undefined
}

/**
 * 벌에 맞춰 내림 굽음을 줄인 획. 오른 벌 · 벌 모름 · 대상 아닌 자모면 그대로 돌려준다.
 * 굽은 내림에 끝이 붙은 다른 획(ㅋ 가운데 가로획)은 같은 높이의 내림 자리 변화만큼 끝을 옮긴다.
 */
// 같은 획 배열 · 같은 비율이면 같은 결과 객체를 돌려준다(화면 · OTF가 획 객체로 짝을 맞춘다).
const memo = new WeakMap<readonly StrokeDataV2[], Map<number, StrokeDataV2[]>>()

export function easeBendForFamily<T extends readonly StrokeDataV2[]>(
  jamoChar: string,
  strokes: T,
  family: MedialFamily | null | undefined,
  ease: Readonly<BendEase> | false = BEND_EASE_DEFAULT,
): T {
  if (!ease || !family || family === 'right' || !BEND_EASE_JAMO.includes(jamoChar)) return strokes
  const factor = family === 'bottom' ? ease.bottom : ease.mixed
  if (!(factor >= 0) || factor === 1) return strokes
  let cached = memo.get(strokes)
  if (!cached) memo.set(strokes, (cached = new Map()))
  const hit = cached.get(factor)
  if (hit) return hit as unknown as T
  const out = easeStrokes(strokes as unknown as StrokeDataV2[], factor)
  cached.set(factor, out)
  return out as unknown as T
}

function easeStrokes(strokes: StrokeDataV2[], factor: number): StrokeDataV2[] {
  const bent = strokes.map(bentDescender)
  if (!bent.some(Boolean)) return strokes

  const pairs: { before: [Anchor, Anchor]; after: [Anchor, Anchor] }[] = []
  const eased = strokes.map((stroke, si) => {
    if (!bent[si]) return stroke
    const pts = stroke.points
    const n = pts.length
    const corner = pts[n - 2]
    const end = pts[n - 1]
    const dx = corner.x - end.x
    if (dx <= GENTLE_BEND) return stroke
    const keep = Math.max(dx * factor, factor * FULL_BEND) / dx
    if (keep >= 1 - 1e-9) return stroke
    const nextEnd: Anchor = { ...end, x: corner.x - dx * keep, handleIn: scaleX(end.handleIn, corner.x, keep) }
    if (!end.handleIn) delete nextEnd.handleIn
    const nextCorner: Anchor = { ...corner }
    if (corner.handleOut) nextCorner.handleOut = scaleX(corner.handleOut, corner.x, keep)
    pairs.push({ before: [corner, end], after: [nextCorner, nextEnd] })
    return { ...stroke, points: [...pts.slice(0, n - 2), nextCorner, nextEnd] }
  })

  // 내림에 붙은 끝 옮기기(ㅋ 가운데 가로획). 내림 중심선에서 0.04 안쪽이면 붙은 것으로 본다.
  return eased.map((stroke, si) => {
    if (bent[si]) return stroke
    let moved = false
    const points = stroke.points.map((p, pi) => {
      if (pi !== 0 && pi !== stroke.points.length - 1) return p
      for (const { before, after } of pairs) {
        const x0 = segmentXAt(before[0], before[1], p.y)
        const x1 = segmentXAt(after[0], after[1], p.y)
        if (x0 === null || x1 === null || Math.abs(p.x - x0) > 0.04) continue
        moved = true
        const dx = x1 - x0
        const q: Anchor = { ...p, x: p.x + dx }
        if (p.handleIn) q.handleIn = { ...p.handleIn, x: p.handleIn.x + dx }
        if (p.handleOut) q.handleOut = { ...p.handleOut, x: p.handleOut.x + dx }
        return q
      }
      return p
    })
    return moved ? { ...stroke, points } : stroke
  })
}
