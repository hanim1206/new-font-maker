import type { BoxConfig, LayoutType, Part } from '../src/types'

/**
 * 울타리 자동 보정(실험실 첫 판)의 계산. 글자 하나의 배치 값 넷이 울타리 밖이면 부위 상자를 움직여 울타리 끝까지 당긴다.
 * 값 넷: 받침 밑선 · 획 사이 틈 · 받침 유무 윗선 차이 · 무게중심. 울타리는 고딕 86개가 지키는 폭(거북이 `layout-band-out.json`, 가운데 90%).
 *
 * 재는 법 — 고정 자리가 아니라 **기준 글자와의 차이**를 잰다. 기준 글자는 같은 글자를 기본 획 + 지금 보선(배치 규칙)으로 푼 것이다.
 * 그래서 보선을 옮기면 기준도 따라 움직이고, 울타리는 그 둘레의 폭으로 남는다.
 * 값 = 엔진이 기준 상태에서 잰 값(`engine`) + (지금 − 기준). 엔진 기준값이 이미 울타리 밖인 값(무게중심 · 가로 틈)은 긋기 전에도 당긴다.
 *
 * 선은 둘이다(하니무스 2026-11-20): 안전선 = 폰트 90% 폭(자동 보정이 당기는 자리), 한계선 = 눈에 어색해지는 선(조작을 막는 자리).
 * 한계선 값은 하니무스 한 사람 답으로 채운 가설이다(거북이 범위표). 비어 있는 값은 당기지 않는다.
 * 단위는 글자 몸 높이 비율. 저장하지 않고 제품 값도 안 바꾼다.
 */

export type FenceValue = 'clearance' | 'finalBottom' | 'gap' | 'topLine' | 'centroid'
export type FenceLine = 'safe' | 'limit'
export interface Band { lo: number; hi: number }

type FinalLayout = 'choseong-jungseong-vertical-jongseong' | 'choseong-jungseong-horizontal-jongseong' | 'choseong-jungseong-mixed-jongseong'

/** 선 하나의 울타리. 비어 있는 값은 아직 정하지 않은 것 — 당기지 않는다. */
export interface FenceBands {
  /** 받침 밑선 흩어짐(표준편차)의 위 끝 */
  finalBottomSd?: number
  /** 윗선 차(가로 무받침 − 가로 받침) */
  topLine?: Band
  /** 틈의 잔차 폭: 기대 틈(굵기에 따른 직선)에서 벗어나도 되는 만큼. 세로 틈 = 첫닿 ↔ 세로홀자, 가로 틈 = 첫닿 ↔ 가로홀자. */
  gapCol?: Band
  gapRow?: Band
  /** 세로 틈의 아래 끝을 기대 틈의 비율로 줄 때(0.7 = 기대 틈의 70%). 있으면 `gapCol.lo` 대신 쓴다 — 굵기가 달라져도 따라간다. */
  gapColFloor?: number
  /** 받침 글자의 위아래 무게중심 */
  centroid?: Partial<Record<FinalLayout, Band>>
  /** 자소 사이 잉크 틈이 기준 글자의 틈에서 줄어도 되는 비율(0.7 = 기준의 70%까지). 넘으면 그은 휨을 줄인다. */
  clearanceFloor?: number
}

export interface FencePreset {
  name: string
  /** 엔진이 기준 상태(기본 획 · 기본 보선)에서 잰 값. 거북이 `engine-out.json`. */
  engine: {
    body: number
    thick: number
    finalBottomSd: number
    topLine: number
    gapCol: number
    gapRow: number
    centroid: Record<FinalLayout, number>
  }
  /** 기대 틈 = at0 + slope × 굵기(몸 높이 비율) */
  gapLine: { col: { at0: number; slope: number }; row: { at0: number; slope: number } }
  lines: Record<FenceLine, FenceBands>
}

/** 고딕 프리셋. 폰트 폭은 고딕 86개의 5~95%. */
export const GOTHIC_FENCE: FencePreset = {
  name: '고딕',
  engine: {
    body: 0.905,
    thick: 0.0654,
    finalBottomSd: 0.008,
    topLine: 0.057,
    gapCol: 0.192,
    gapRow: 0.224,
    centroid: {
      'choseong-jungseong-vertical-jongseong': 0.522,
      'choseong-jungseong-horizontal-jongseong': 0.514,
      'choseong-jungseong-mixed-jongseong': 0.503,
    },
  },
  gapLine: { col: { at0: 0.286, slope: -1.35 }, row: { at0: 0.312, slope: -1.118 } },
  lines: {
    safe: {
      // 자소 사이 틈은 폰트에서 잰 안전선이 아직 없다. 한계선(기대 틈의 70%)을 빌려 쓴다 — 그은 모양을 되도록 살리려고.
      clearanceFloor: 0.7,
      finalBottomSd: 0.013,
      topLine: { lo: 0.039, hi: 0.058 },
      gapCol: { lo: -0.009, hi: 0.021 },
      gapRow: { lo: -0.011, hi: 0.019 },
      centroid: {
        'choseong-jungseong-vertical-jongseong': { lo: 0.491, hi: 0.508 },
        'choseong-jungseong-horizontal-jongseong': { lo: 0.5, hi: 0.514 },
        'choseong-jungseong-mixed-jongseong': { lo: 0.484, hi: 0.504 },
      },
    },
    // 한계선(가설): 거북이 범위표 "안전선과 한계선"(2026-11-20) — 하니무스 한 사람이 마지막으로 "괜찮다"고 한 값. 답이 더 모이면 바뀐다.
    limit: {
      // 받침 밑선은 안전선 끝이 곧 한계다(두 배 자리에서 어색).
      finalBottomSd: 0.013,
      // 좁은 쪽 1.2%까지. 넓은 쪽은 안 물어봐서 임시로 안전선 끝.
      topLine: { lo: 0.012, hi: 0.058 },
      // 세로 틈: 굵기에서 기대하는 틈의 70%까지 좁혀도 된다. 벌리는 쪽은 안 물어봐서 안전선 끝. 가로 틈은 아직 없다.
      gapCol: { lo: -0.059, hi: 0.021 },
      gapColFloor: 0.7,
      clearanceFloor: 0.7,
      // 받침 글자 무게중심: 울타리 가운데에서 아래로 세로 3.4 · 가로 2.8 · 섞임 4.0%p. 위쪽은 임시로 같은 폭.
      centroid: {
        'choseong-jungseong-vertical-jongseong': { lo: 0.4655, hi: 0.5335 },
        'choseong-jungseong-horizontal-jongseong': { lo: 0.479, hi: 0.535 },
        'choseong-jungseong-mixed-jongseong': { lo: 0.454, hi: 0.534 },
      },
    },
  },
}

// ── 재기 ──

type Pt = { x: number; y: number }
/** 재는 데 쓰는 중심선 조각 하나. 획 좌표(칸 안 0–1)와 그 칸. */
export interface MeasuredStroke {
  part: Part
  box: Readonly<BoxConfig>
  points: readonly (Pt & { handleIn?: Pt; handleOut?: Pt })[]
  closed: boolean
  /** 잉크 굵기(em). 자소 사이 틈을 잴 때만 쓴다. */
  thickness?: number
}

interface Group { minX: number; maxX: number; minY: number; maxY: number; length: number; sumY: number }
const emptyGroup = (): Group => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, length: 0, sumY: 0 })

export interface GlyphMeasure {
  /** 글자 잉크의 윗선(중심선 기준, em) */
  top: number
  /** 위아래 무게중심(중심선 길이로 무게를 단 평균, em) */
  cy: number
  /** 첫닿 ↔ 홀자 틈(중심선 사이). 세로 = 홀자 왼쪽 − 첫닿 오른쪽, 가로 = 홀자 위 − 첫닿 아래. */
  gapCol?: number
  gapRow?: number
  /** 윗부분(첫닿 + 홀자) · 받침의 잉크 덩이 */
  upper: Group
  final?: Group
}

const CURVE_STEPS = 8

function flatten(stroke: MeasuredStroke): Pt[] {
  const { points, closed, box } = stroke
  const at = (p: Pt): Pt => ({ x: box.x + p.x * box.width, y: box.y + p.y * box.height })
  const out: Pt[] = []
  const count = closed ? points.length : points.length - 1
  if (points.length) out.push(at(points[0]))
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if (!a.handleOut && !b.handleIn) { out.push(at(b)); continue }
    const c1 = a.handleOut ?? a, c2 = b.handleIn ?? b
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS, u = 1 - t
      out.push(at({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      }))
    }
  }
  return out
}

function addTo(group: Group, line: readonly Pt[]) {
  line.forEach((p, i) => {
    group.minX = Math.min(group.minX, p.x); group.maxX = Math.max(group.maxX, p.x)
    group.minY = Math.min(group.minY, p.y); group.maxY = Math.max(group.maxY, p.y)
    if (i === 0) return
    const q = line[i - 1], length = Math.hypot(p.x - q.x, p.y - q.y)
    group.length += length
    group.sumY += length * (p.y + q.y) / 2
  })
}

/** 풀린 중심선들 → 글자 하나의 배치 값. 굵기는 지금과 기준이 같아 차이에서 지워지므로 중심선만 본다. */
export function measureGlyph(strokes: readonly MeasuredStroke[]): GlyphMeasure | null {
  const groups = { CH: emptyGroup(), JU: emptyGroup(), JO: emptyGroup() }
  for (const stroke of strokes) addTo(groups[stroke.part === 'CH' ? 'CH' : stroke.part === 'JO' ? 'JO' : 'JU'], flatten(stroke))
  const { CH, JU, JO } = groups
  const upper = emptyGroup()
  for (const group of [CH, JU]) {
    upper.minX = Math.min(upper.minX, group.minX); upper.maxX = Math.max(upper.maxX, group.maxX)
    upper.minY = Math.min(upper.minY, group.minY); upper.maxY = Math.max(upper.maxY, group.maxY)
    upper.length += group.length; upper.sumY += group.sumY
  }
  const total = upper.length + JO.length
  if (total <= 0) return null
  const both = CH.length > 0 && JU.length > 0
  return {
    top: Math.min(upper.minY, JO.minY),
    cy: (upper.sumY + JO.sumY) / total,
    ...(both ? { gapCol: JU.minX - CH.maxX, gapRow: JU.minY - CH.maxY } : {}),
    upper,
    ...(JO.length > 0 ? { final: JO } : {}),
  }
}

// ── 자소 사이 틈(획끼리 닿음) ──

export type PartPair = 'CH-JU' | 'JU-JO' | 'CH-JO'
/** 자소 둘 사이의 가장 좁은 잉크 틈(em). 0 아래면 겹친 것. */
export type Clearances = Partial<Record<PartPair, number>>

function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}
const side = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return 0
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b))
}

/** 자소 쌍마다 가장 좁은 잉크 틈 = 중심선 사이 거리 − 두 획 굵기의 반씩. 같은 자소 안의 획은 일부러 이어지니 보지 않는다. */
export function partClearances(strokes: readonly MeasuredStroke[]): Clearances {
  const lines = strokes.map((stroke) => ({ group: stroke.part === 'CH' ? 'CH' : stroke.part === 'JO' ? 'JO' : 'JU', line: flatten(stroke), half: (stroke.thickness ?? 0) / 2 }))
  const out: Clearances = {}
  for (const [first, second] of [['CH', 'JU'], ['JU', 'JO'], ['CH', 'JO']] as const) {
    let best = Infinity
    for (const a of lines) {
      if (a.group !== first) continue
      for (const b of lines) {
        if (b.group !== second) continue
        for (let i = 1; i < a.line.length; i++) for (let j = 1; j < b.line.length; j++) {
          best = Math.min(best, segmentDistance(a.line[i - 1], a.line[i], b.line[j - 1], b.line[j]) - a.half - b.half)
        }
      }
    }
    if (best < Infinity) out[`${first}-${second}` as PartPair] = best
  }
  return out
}

/** 이보다 좁은 기준 틈은 처음부터 붙여 그린 자리로 보고 견주지 않는다(em). */
const MIN_REFERENCE_CLEARANCE = 0.01

/** 지금 틈 ÷ 기준 틈의 가장 작은 값. 1이면 기준과 같고, 0 아래면 획이 겹쳤다. 견줄 쌍이 없으면 1. */
export function clearanceRatio(now: Clearances, reference: Clearances): number {
  let worst = Infinity
  for (const pair of Object.keys(reference) as PartPair[]) {
    const base = reference[pair], gap = now[pair]
    if (base === undefined || gap === undefined || base < MIN_REFERENCE_CLEARANCE) continue
    worst = Math.min(worst, gap / base)
  }
  return worst === Infinity ? 1 : worst
}

/**
 * 틈이 모자랄 때 줄여 보는 단계(앞이 그은 그대로). 먼저 휨만 줄이고 기울기는 남긴다 — 기울여 그은 선이 수평 · 수직으로 눕지 않게.
 * 휨을 다 펴도 닿을 때만 기울기를 줄인다.
 */
export const BEND_LEVELS: readonly { bend: number; tilt: number }[] = [
  { bend: 1, tilt: 1 }, { bend: 0.66, tilt: 1 }, { bend: 0.33, tilt: 1 }, { bend: 0, tilt: 1 }, { bend: 0, tilt: 0.5 }, { bend: 0, tilt: 0 },
]

/**
 * 휨 단계마다의 틈 비율(`ratios[i]`는 `BEND_LEVELS[i]`로 그렸을 때) → 고를 단계와 기록.
 * 앞에서부터 처음으로 울타리 안인 단계를 고른다. 다 밖이면 틈이 가장 넓은 단계.
 */
export function pickBend(ratioAt: (level: number) => number, floor: number | undefined): { level: number; pull: FencePull | null } {
  if (floor === undefined) return { level: 0, pull: null }
  const band = { lo: floor, hi: Infinity }
  const before = ratioAt(0)
  if (before >= floor) return { level: 0, pull: { value: 'clearance', before, after: before, band, pulled: 0, left: 0 } }
  let best = 0, bestRatio = before
  for (let level = 1; level < BEND_LEVELS.length; level++) {
    const ratio = ratioAt(level)
    if (ratio > bestRatio) { best = level; bestRatio = ratio }
    if (ratio >= floor) break
  }
  // 당긴 양은 줄인 휨의 몫(−0.5 = 휨을 반으로). 기울기까지 줄였으면 −1 아래로 센다.
  return { level: best, pull: { value: 'clearance', before, after: bestRatio, band, pulled: BEND_LEVELS[best].bend - 1 - (1 - BEND_LEVELS[best].tilt), left: bestRatio >= floor ? 0 : floor - bestRatio } }
}

// ── 당기기 ──

export interface FencePull {
  value: FenceValue
  /** 당기기 전 · 뒤의 값과 울타리(몸 높이 비율) */
  before: number
  after: number
  band: Band
  /** 당긴 양(after − before). 0이면 울타리 안이라 그대로 두었거나, 밖인데 못 당긴 것. */
  pulled: number
  /** 당기고도 울타리까지 남은 거리. 다른 값(윗선 · 밑선)에 묶여 더 못 당긴 만큼 — 배치 규칙이 고칠 몫이다. */
  left: number
}

export interface FenceMoves {
  /** 받침을 위아래로(em) */
  finalDy: number
  /** 첫닿을 옮긴다(em) — 틈 */
  initialDx: number
  initialDy: number
  /** 윗부분(첫닿 + 홀자)을 위아래로(em) — 윗선 차 · 무게중심 */
  upperDy: number
}

export interface FenceCorrection { moves: FenceMoves; pulls: FencePull[] }

const clampTo = (value: number, band: Band) => Math.max(band.lo, Math.min(band.hi, value))
const isFinalLayout = (layout: LayoutType): layout is FinalLayout => layout.endsWith('-jongseong')
const EPS = 1e-6
/** 받침 글자의 윗선이 몸 위 끝에서 내려와도 되는 만큼(세로 · 섞임 + 받침, 고딕 윗선 0~0.009 · 엔진 0.003). 위로는 못 올린다 — 몸 밖이다. */
const TOP_SLACK_DOWN = 0.006

/** 굵기에서 기대하는 틈(몸 높이 비율). */
export const expectedGap = (preset: FencePreset, axis: 'col' | 'row', thick = preset.engine.thick) => preset.gapLine[axis].at0 + preset.gapLine[axis].slope * thick

/** 받침 밑선 하나가 기준에서 벗어나도 되는 만큼: 엔진 흩어짐 위에 더해도 울타리 끝을 안 넘는 흔들림. */
export const finalBottomTolerance = (preset: FencePreset, line: FenceLine): number | undefined => {
  const end = preset.lines[line].finalBottomSd
  return end === undefined ? undefined : Math.sqrt(Math.max(0, end ** 2 - preset.engine.finalBottomSd ** 2))
}

/**
 * 글자 하나를 울타리 안으로 당긴다. `now`는 지금 그려질 글자, `reference`는 같은 글자의 기준(기본 획 + 지금 보선).
 * 순서는 세게 묶는 것부터: 받침 밑선 → 틈 → 윗선 차 → 무게중심. 뒤의 것은 앞에서 옮긴 것을 넣고 재고, 앞의 것을 깨지 않는 만큼만 당긴다.
 */
export function correctGlyph(input: { layout: LayoutType; now: GlyphMeasure; reference: GlyphMeasure; preset?: FencePreset; line?: FenceLine; body?: number; thick?: number }): FenceCorrection {
  const { layout, now, reference } = input
  const preset = input.preset ?? GOTHIC_FENCE
  const bands = preset.lines[input.line ?? 'safe']
  const body = input.body ?? preset.engine.body
  const moves: FenceMoves = { finalDy: 0, initialDx: 0, initialDy: 0, upperDy: 0 }
  const pulls: FencePull[] = []
  const pull = (value: FenceValue, before: number, band: Band) => {
    const after = clampTo(before, band)
    pulls.push({ value, before, after, band, pulled: Math.abs(after - before) < EPS ? 0 : after - before, left: 0 })
    return after - before
  }

  // 받침 밑선: 기준 밑선에서 벗어난 만큼.
  const tolerance = finalBottomTolerance(preset, input.line ?? 'safe')
  if (now.final && reference.final && tolerance !== undefined) {
    const off = (now.final.maxY - reference.final.maxY) / body
    moves.finalDy = pull('finalBottom', off, { lo: -tolerance, hi: tolerance }) * body
  }

  // 틈: 받침 없는 세로 · 가로 짜임(폰트에서 잰 자리와 같다).
  const axis = layout === 'choseong-jungseong-vertical' ? 'col' : layout === 'choseong-jungseong-horizontal' ? 'row' : null
  const gapBand = axis === 'col' ? bands.gapCol : axis === 'row' ? bands.gapRow : undefined
  const gapNow = axis === 'col' ? now.gapCol : now.gapRow, gapRef = axis === 'col' ? reference.gapCol : reference.gapRow
  if (axis && gapBand && gapNow !== undefined && gapRef !== undefined) {
    const expected = expectedGap(preset, axis, input.thick)
    const value = (axis === 'col' ? preset.engine.gapCol : preset.engine.gapRow) + (gapNow - gapRef) / body
    const lo = axis === 'col' && bands.gapColFloor !== undefined ? expected * bands.gapColFloor : expected + gapBand.lo
    const moved = pull('gap', value, { lo, hi: expected + gapBand.hi }) * body
    // 틈을 벌리려면 첫닿을 홀자 반대쪽으로.
    if (axis === 'col') moves.initialDx = -moved
    else moves.initialDy = -moved
  }

  // 윗선 차: 가로 + 받침 글자가 받침 없는 글자보다 올라간 만큼. 윗선이 내려가면 값이 준다.
  // `up` · `down`은 그 뒤에도 윗부분을 더 옮길 수 있는 여유(em) — 무게중심이 쓴다.
  let up = 0, down = TOP_SLACK_DOWN * body
  if (layout === 'choseong-jungseong-horizontal-jongseong' && bands.topLine) {
    const value = preset.engine.topLine - (now.top - reference.top) / body
    const moved = pull('topLine', value, bands.topLine)
    moves.upperDy = -moved * body
    up = (bands.topLine.hi - (value + moved)) * body
    down = ((value + moved) - bands.topLine.lo) * body
  }

  // 무게중심: 받침 글자. 받침 밑선은 가장 세게 묶였으니 윗부분만, 윗선이 허락하는 만큼 옮긴다.
  // (윗부분과 받침의 경계를 옮기는 건 듣지 않는다 — 늘어난 쪽 획이 길어져 무게가 따라가 버린다.)
  const centroidBand = isFinalLayout(layout) ? bands.centroid?.[layout] : undefined
  if (isFinalLayout(layout) && centroidBand && now.final) {
    const total = now.upper.length + now.final.length
    const share = now.upper.length / total
    const moved = now.cy + (moves.finalDy * now.final.length + moves.upperDy * now.upper.length) / total
    const value = preset.engine.centroid[layout] + (moved - reference.cy) / body
    const wanted = clampTo(value, centroidBand) - value
    const dy = share > EPS ? Math.max(-up, Math.min(down, wanted * body / share)) : 0
    const reached = dy * share / body
    pulls.push({ value: 'centroid', before: value, after: value + reached, band: centroidBand, pulled: Math.abs(reached) < EPS ? 0 : reached, left: Math.abs(wanted - reached) < EPS ? 0 : Math.abs(wanted - reached) })
    moves.upperDy += dy
  }

  return { moves, pulls }
}

type Boxes = Readonly<Partial<Record<Part, BoxConfig>>>
const UPPER_PARTS: readonly Part[] = ['CH', 'JU', 'JU_H', 'JU_V']

/** 당긴 양을 부위 상자에 옮긴다. */
export function movedBoxes(boxes: Boxes, moves: FenceMoves): Partial<Record<Part, BoxConfig>> {
  const out: Partial<Record<Part, BoxConfig>> = { ...boxes }
  for (const part of UPPER_PARTS) {
    const box = out[part]
    if (box) out[part] = { ...box, x: box.x + (part === 'CH' ? moves.initialDx : 0), y: box.y + moves.upperDy + (part === 'CH' ? moves.initialDy : 0) }
  }
  if (out.JO) out.JO = { ...out.JO, y: out.JO.y + moves.finalDy }
  return out
}

// ── 일부러 흔들기(보정이 당기는 걸 보려고) ──

export type ShakeLevel = 0 | 1 | 2
/** 받침 밑선을 흔드는 무늬(글자 순서대로). */
const JITTER = [1, -1, 1, 1, -1, -1, 1, -1, -1, 1, 1, -1]

/** 흔드는 세기: 조금은 울타리를 막 넘는 만큼, 많이는 그 세 배(폰에서도 눈에 보이게). */
const SHAKE_AMOUNT: Record<ShakeLevel, number> = { 0: 0, 1: 1, 2: 3 }

/** 배치를 일부러 울타리 밖으로 민다(em). 1은 조금, 2는 많이. 받침은 위아래로 들쭉날쭉, 첫닿은 홀자 쪽으로, 가로 + 받침 글자의 윗부분은 아래로. */
export function shakenBoxes(boxes: Boxes, layout: LayoutType, index: number, level: ShakeLevel): Partial<Record<Part, BoxConfig>> {
  const out: Partial<Record<Part, BoxConfig>> = { ...boxes }
  if (level === 0) return out
  const move = (part: Part, dx: number, dy: number) => { const box = out[part]; if (box) out[part] = { ...box, x: box.x + dx, y: box.y + dy } }
  const amount = SHAKE_AMOUNT[level]
  if (isFinalLayout(layout)) move('JO', 0, 0.012 * amount * JITTER[index % JITTER.length])
  if (layout === 'choseong-jungseong-vertical') move('CH', 0.02 * amount, 0)
  if (layout === 'choseong-jungseong-horizontal') move('CH', 0, 0.02 * amount)
  if (layout === 'choseong-jungseong-horizontal-jongseong') for (const part of UPPER_PARTS) move(part, 0, 0.015 * amount)
  return out
}

// ── 화면에 보일 말 ──

export const FENCE_NAMES: Record<FenceValue, string> = { clearance: '획끼리 닿음', finalBottom: '받침 밑선', gap: '획 사이 틈', topLine: '받침 유무 윗선 차이', centroid: '무게중심' }
export const FENCE_ORDER: readonly FenceValue[] = ['clearance', 'finalBottom', 'gap', 'topLine', 'centroid']

/** 당긴 방향을 쉬운 말로. */
export function pullWord(value: FenceValue, pulled: number): string {
  if (value === 'clearance') return '휨 줄임'
  if (value === 'finalBottom') return pulled < 0 ? '올림' : '내림'
  if (value === 'gap') return pulled > 0 ? '벌림' : '좁힘'
  if (value === 'topLine') return pulled > 0 ? '윗부분 올림' : '윗부분 내림'
  return pulled < 0 ? '위로' : '아래로'
}

/** `stuck` · `left`: 울타리 밖인데 다 못 당긴 글자 수와 가장 크게 남은 거리. */
export interface FenceSummaryRow { value: FenceValue; checked: number; count: number; max: number; word: string; stuck: number; left: number }

/** 글줄 전체의 당긴 기록 → 값마다 한 줄(잰 글자 수 · 당긴 글자 수 · 가장 크게 당긴 양). */
export function summarize(all: readonly (readonly FencePull[])[]): FenceSummaryRow[] {
  return FENCE_ORDER.map((value) => {
    const pulls = all.flatMap((list) => list.filter((item) => item.value === value))
    const moved = pulls.filter((item) => item.pulled !== 0)
    const biggest = moved.reduce<FencePull | null>((best, item) => (!best || Math.abs(item.pulled) > Math.abs(best.pulled) ? item : best), null)
    const stuck = pulls.filter((item) => item.left > 0)
    return { value, checked: pulls.length, count: moved.length, max: biggest ? Math.abs(biggest.pulled) : 0, word: biggest ? pullWord(value, biggest.pulled) : '', stuck: stuck.length, left: Math.max(0, ...stuck.map((item) => item.left)) }
  })
}
