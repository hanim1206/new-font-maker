import type { DeepReadonly, JamoData, StrokeDataV2 } from '../types'

/**
 * 자모 생김새 특징(배치 규칙 "표를 공식으로"). 자모 획을 작은 격자에 그려 띠마다 잉크가 있는 줄의 비율 등으로 뽑는다.
 * 표에 자모별로 외운 값 대신, 이 특징으로 자리를 설명하는 공식을 만든다(`layoutRuleFormulas.ts`).
 * 모두 자모 틀(0~1) 기준이라 사용자가 획을 고쳐도 다시 뽑을 수 있다.
 */
export interface JamoShapeFeatures {
  /** 윗띠에 좁은 잉크(꼭지)가 있고 바로 아래 띠가 넓은가 — ㅊ ㅎ. */
  topDot: boolean
  /** 윗띠에 잉크가 있는 세로줄 비율(가로줄기가 위에 있으면 1). */
  topFlat: number
  /** 아래띠에 잉크가 있는 세로줄 비율(바닥이 평평하면 1, 뾰족 · 둥글면 작다). */
  bottomFlat: number
  /** 왼띠 · 오른띠에 잉크가 있는 가로줄 비율(세로줄기가 그 변에 있으면 1). */
  leftClosed: number
  rightClosed: number
  /** 오른쪽 띠(잉크 폭의 오른쪽 25%)에 잉크가 처음 나오는 높이(잉크 높이 대비). 0 = 맨 위부터 막힘(ㄱ ㅁ ㄷ), 1에 가까울수록 오른쪽 위가 빈다(ㄴ 0.94 · ㅅ 0.66). */
  rightTop: number
  /** 가로줄기 층 수: 틀 가운데(15~85%) 세로줄마다 위에서 아래로 잉크를 몇 번 지나는지 세어 80번째 백분위. ㄱ ㄴ 1 · ㄷ ㅁ ㅂ 2 · ㄹ ㅌ 3. */
  layers: number
  /** 사선 다리: 열린 획이 틀 아래 귀퉁이(왼쪽 · 오른쪽 25% 안)에서 비스듬히 바깥으로 내려가며 끝나는가 — ㅅ ㅈ ㅊ의 삐침 · 내림. */
  legLeft: boolean
  legRight: boolean
  /** 닫힌 획(동그라미)이 있는가. */
  ring: boolean
  /** 굽은 닫힌 획(동그라미 ㅇ, ㅎ의 ㅇ)이 있는가. 곧은 닫힌 획(ㅁ)은 아니다. */
  round: boolean
  /** 잉크 넓이(틀 넓이 대비). */
  area: number
  /** 잉크 무게중심(틀 기준). */
  centerX: number
  centerY: number
}

const N = 64
const BAND = 0.16

type Pt = { x: number; y: number }
type Anchor = Pt & { handleIn?: Pt; handleOut?: Pt }

function raster(strokes: readonly DeepReadonly<StrokeDataV2>[]): Uint8Array {
  const grid = new Uint8Array(N * N)
  const paint = (x: number, y: number, r: number) => {
    const R = Math.ceil(r * N), cx = Math.round(x * N), cy = Math.round(y * N)
    for (let j = -R; j <= R; j += 1) for (let i = -R; i <= R; i += 1) {
      const px = cx + i, py = cy + j
      if (px >= 0 && py >= 0 && px < N && py < N && i * i + j * j <= R * R) grid[py * N + px] = 1
    }
  }
  for (const stroke of strokes) {
    const points = stroke.points as readonly Anchor[]
    const r = (stroke.thickness ?? 0.07) / 2
    const count = points.length
    for (let k = 0; k < (stroke.closed ? count : count - 1); k += 1) {
      const a = points[k], b = points[(k + 1) % count]
      const c1 = a.handleOut ?? a, c2 = b.handleIn ?? b
      for (let t = 0; t <= 1; t += 0.02) {
        const u = 1 - t
        paint(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y, r)
      }
    }
  }
  return grid
}

export function shapeFeaturesOfStrokes(strokes: readonly DeepReadonly<StrokeDataV2>[]): JamoShapeFeatures {
  const grid = raster(strokes)
  const at = (x: number, y: number) => grid[Math.min(N - 1, Math.floor(y * N)) * N + Math.min(N - 1, Math.floor(x * N))]
  const rowsWith = (x0: number, x1: number) => { let c = 0; for (let y = 0; y < 1; y += 1 / N) { let hit = 0; for (let x = x0; x < x1; x += 1 / N) hit |= at(x, y); c += hit } return c / N }
  const colsWith = (y0: number, y1: number) => { let c = 0; for (let x = 0; x < 1; x += 1 / N) { let hit = 0; for (let y = y0; y < y1; y += 1 / N) hit |= at(x, y); c += hit } return c / N }
  let area = 0, sumX = 0, sumY = 0
  for (let i = 0; i < N * N; i += 1) if (grid[i]) { area += 1; sumY += Math.floor(i / N); sumX += i % N }
  const topFlat = colsWith(0, BAND)
  let x0 = N, x1 = -1, y0 = N, y1 = -1
  for (let i = 0; i < N * N; i += 1) if (grid[i]) { const x = i % N, y = Math.floor(i / N); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  let rightTop = 1
  if (x1 >= 0) {
    const from = Math.round(x1 - (x1 - x0 + 1) * 0.25)
    for (let y = y0; y <= y1 && rightTop === 1; y += 1) for (let x = from; x <= x1; x += 1) if (grid[y * N + x]) { rightTop = (y - y0) / (y1 - y0 + 1); break }
  }
  const secondWidth = colsWith(BAND, BAND * 2)
  const runs: number[] = []
  for (let x = Math.floor(N * 0.15); x < Math.ceil(N * 0.85); x += 1) { let count = 0, prev = 0; for (let y = 0; y < N; y += 1) { const v = grid[y * N + x]; if (v && !prev) count += 1; prev = v } runs.push(count) }
  runs.sort((a, b) => a - b)
  const layers = runs[Math.floor(runs.length * 0.8)] ?? 0
  let legLeft = false, legRight = false
  for (const stroke of strokes) {
    if (stroke.closed || stroke.points.length < 2) continue
    const points = stroke.points as readonly Anchor[]
    const b = points[points.length - 1], a = points[points.length - 2]
    const c = b.handleIn ?? a.handleOut ?? a
    const dx = b.x - c.x, dy = b.y - c.y
    if (b.y < 0.8 || dy < 0.05 || Math.abs(dx) < 0.25 * dy) continue
    if (dx < 0 && b.x < 0.25) legLeft = true
    if (dx > 0 && b.x > 0.75) legRight = true
  }
  return {
    legLeft,
    legRight,
    topDot: topFlat < 0.35 && secondWidth > 0.7,
    topFlat,
    bottomFlat: colsWith(1 - BAND, 1),
    leftClosed: rowsWith(0, BAND),
    rightClosed: rowsWith(1 - BAND, 1),
    rightTop,
    layers,
    ring: strokes.some((stroke) => stroke.closed),
    round: strokes.some((stroke) => stroke.closed && stroke.points.some((pt) => !!pt.handleIn || !!pt.handleOut)),
    area: area / (N * N),
    centerX: area ? sumX / area / N : 0.5,
    centerY: area ? sumY / area / N : 0.5,
  }
}

const cache = new WeakMap<object, JamoShapeFeatures>()

/** 자모의 기본 획(틀이 있으면 틀)에서 특징을 뽑는다. 같은 자모 객체면 다시 계산하지 않는다. */
export function shapeFeaturesOf(jamo: DeepReadonly<JamoData>): JamoShapeFeatures | null {
  const strokes = jamo.frame?.strokes ?? jamo.strokes
  if (!strokes || strokes.length === 0) return null
  const hit = cache.get(jamo as object)
  if (hit) return hit
  const features = shapeFeaturesOfStrokes(strokes)
  cache.set(jamo as object, features)
  return features
}
