import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import type { BoxConfig, DecomposedSyllable, JamoData, LayoutType, Part, StrokeDataV2 } from '../src/types'

/**
 * 빚기 시험판의 계산. 학습에서는 글자 하나가 아니라 "갈래" 단위로 만진다(고양이 추천안, `학습-단계-뼈대-2026-11-20.md` 21:42 절).
 * 범위는 세 층: 전체 → 짜임(레이아웃) → 갈래(홀자 가지 갈래). 메뉴로 고르지 않고 글자의 어디를 잡았는지로 정한다.
 * - 홀자를 잡으면 홀자 갈래(세로 오른가지 · 왼가지 · 두 기둥 · 가지 없음, 가로 위가지 · 아래가지 · 없음). 손잡이는 첫닿자와 홀자 사이 틈.
 * - 첫닿자를 잡으면 그 짜임의 첫닿자 크기. 안쪽 모서리(홀자 쪽)는 그대로 두고 바깥으로 키운다 — 틈을 지킨다.
 * - 받침을 잡으면 그 짜임의 받침 위 틈. 받침은 누르지 않고 밑선도 그대로, 윗부분(첫닿자 · 홀자)만 옮긴다.
 * 값은 고딕 86개 분포(거북이 `layout-band-out.json`, 굵기에 맞춘 선 + 잔차 5 · 50 · 95%)에서 왔다. 좁게 · 보통 · 넓게 = 5 · 50 · 95%(안전선 안).
 * 끌어서 다듬을 때 넘지 못하는 벽(한계선)은 틈 −35%(하니무스 한계선 답: −30% 괜찮다 · −40% 어색), 넓은 쪽은 같은 폭으로 둔 임시값.
 * 갈래별 측정은 거북이가 진행 중이라, 직접 잰 값이 없는 갈래는 가까운 갈래 값을 빌려 쓰고 `source: 'borrowed'`로 표시한다.
 * 저장하지 않고 제품 값도 안 바꾼다. 단위는 글자 높이 비율(울타리 실험지와 같은 어림).
 */

export type GroupId =
  | 'v-right' | 'v-left' | 'v-double' | 'v-none'
  | 'h-up' | 'h-down' | 'h-none'
  | 'mixed'
  | 'ch-vertical' | 'ch-horizontal' | 'ch-mixed'
  | 'jo-vertical' | 'jo-horizontal' | 'jo-mixed'

export type Layer = '짜임' | '갈래'
export type Handle = 'gapX' | 'gapY' | 'chSize' | 'finalGap'
/** measured: 이 갈래를 직접 잰 값 · borrowed: 가까운 갈래 값을 빌린 임시값 · guess: 측정 없이 둔 임시값 · none: 손잡이 없음 */
export type ValueSource = 'measured' | 'borrowed' | 'guess' | 'none'
export type Preset = 'narrow' | 'normal' | 'wide'
export type Stance = 'vertical' | 'horizontal' | 'mixed'

export interface Range {
  /** 지금 엔진(노토 모델 배치)의 값. 이 값이면 아무것도 안 옮긴다. */
  engine: number
  presets: Record<Preset, number>
  /** 안전선(폰트 90%가 있는 폭). 프리셋은 이 안. */
  safe: [number, number]
  /** 한계선. 끌어도 이 밖으로는 안 나간다. */
  wall: [number, number]
}

export interface GroupInfo {
  id: GroupId
  layer: Layer
  /** 짜임 이름(세로 · 가로 · 섞임) */
  stance: Stance
  name: string
  /** 갈래에 드는 자모(보이는 이름) */
  members: string
  handle: Handle | null
  handleName: string
  source: ValueSource
  /** 값이 어디서 왔는지 한 줄 */
  note: string
  range: Range | null
  presetNames: Record<Preset, string>
}

const ENGINE_THICK = 0.0654
/** 굵기에 맞춘 선(a + b × 굵기)과 잔차 5 · 50 · 95%. 고딕 86개. */
const fit = (a: number, b: number, residuals: [number, number, number]) => {
  const center = a + b * ENGINE_THICK
  return { center, p5: center + residuals[0], p50: center + residuals[1], p95: center + residuals[2] }
}
/** 첫닿자 ↔ 세로홀자 기둥 틈(니 미 기 이). 엔진 0.192. */
const GAP_COL = fit(0.2862, -1.3517, [-0.0091, -0.0006, 0.0212])
/** 첫닿자 ↔ 가로홀자 보 틈(그 느 므). 엔진 0.224. */
const GAP_ROW = fit(0.3120, -1.1182, [-0.0110, -0.0039, 0.0191])
/** 홀자 ↔ 받침 틈(는). 엔진 0.122. */
const GAP_FIN = fit(0.1914, -0.8551, [-0.0143, -0.0002, 0.0257])

/** 한계선: 가운데에서 ±35%(좁은 쪽은 하니무스 한계선 답, 넓은 쪽은 같은 폭으로 둔 임시값). */
const WALL_SHARE = 0.35
function gapRange(engine: number, band: ReturnType<typeof fit>): Range {
  return {
    engine,
    presets: { narrow: band.p5, normal: band.p50, wide: band.p95 },
    safe: [band.p5, band.p95],
    wall: [band.center * (1 - WALL_SHARE), band.center * (1 + WALL_SHARE)],
  }
}
const COL = gapRange(0.192, GAP_COL)
const ROW = gapRange(0.224, GAP_ROW)
const FIN = gapRange(0.1215, GAP_FIN)
/** 첫닿자 크기(배율). 측정 없음 — 임시값. */
const CH_SIZE: Range = { engine: 1, presets: { narrow: 0.94, normal: 1, wide: 1.06 }, safe: [0.94, 1.06], wall: [0.86, 1.14] }

const GAP_NAMES: Record<Preset, string> = { narrow: '좁게', normal: '보통', wide: '넓게' }
const SIZE_NAMES: Record<Preset, string> = { narrow: '작게', normal: '보통', wide: '크게' }

const STANCE_NAME: Record<Stance, string> = { vertical: '세로', horizontal: '가로', mixed: '섞임' }

const vowel = (id: GroupId, stance: Stance, name: string, members: string, source: ValueSource, note: string): GroupInfo => ({
  id, layer: '갈래', stance, name, members,
  handle: stance === 'vertical' ? 'gapX' : 'gapY',
  handleName: '첫닿자와 홀자 사이 틈',
  source, note,
  range: stance === 'vertical' ? COL : ROW,
  presetNames: GAP_NAMES,
})

export const GROUPS: Record<GroupId, GroupInfo> = {
  'v-right': vowel('v-right', 'vertical', '세로홀자 · 오른가지', 'ㅏ ㅑ', 'borrowed', 'ㅣ 틈 측정을 빌림(가지가 바깥이라 틈은 같다고 봄)'),
  'v-left': vowel('v-left', 'vertical', '세로홀자 · 왼가지', 'ㅓ ㅕ', 'borrowed', 'ㅣ 틈 측정을 빌림 — 왼가지 갈래 측정 대기'),
  'v-double': vowel('v-double', 'vertical', '세로홀자 · 두 기둥', 'ㅐ ㅒ ㅔ ㅖ', 'borrowed', 'ㅣ 틈 측정을 빌림 — 두 기둥 갈래 측정 대기'),
  'v-none': vowel('v-none', 'vertical', '세로홀자 · 가지 없음', 'ㅣ', 'measured', '고딕 86개 니 미 기 이에서 잼'),
  'h-up': vowel('h-up', 'horizontal', '가로홀자 · 위가지', 'ㅗ ㅛ', 'borrowed', 'ㅡ 틈 측정을 빌림 — 위가지 갈래 측정 대기'),
  'h-down': vowel('h-down', 'horizontal', '가로홀자 · 아래가지', 'ㅜ ㅠ', 'borrowed', 'ㅡ 틈 측정을 빌림(가지가 아래라 틈은 같다고 봄)'),
  'h-none': vowel('h-none', 'horizontal', '가로홀자 · 가지 없음', 'ㅡ', 'measured', '고딕 86개 그 느 므에서 잼'),
  mixed: {
    id: 'mixed', layer: '갈래', stance: 'mixed', name: '섞임홀자', members: 'ㅘ ㅝ ㅢ …',
    handle: null, handleName: '', source: 'none', note: '값이 갈리는지 아직 안 잼 — 손잡이 없음', range: null, presetNames: GAP_NAMES,
  },
  'ch-vertical': chGroup('vertical'),
  'ch-horizontal': chGroup('horizontal'),
  'ch-mixed': chGroup('mixed'),
  'jo-vertical': joGroup('vertical'),
  'jo-horizontal': joGroup('horizontal'),
  'jo-mixed': joGroup('mixed'),
}

export const stanceName = (stance: Stance) => `${STANCE_NAME[stance]} 짜임`

function chGroup(stance: Stance): GroupInfo {
  return {
    id: `ch-${stance}` as GroupId, layer: '짜임', stance, name: `${STANCE_NAME[stance]} 짜임 · 첫닿자`, members: '첫닿자 전부',
    handle: 'chSize', handleName: '첫닿자 크기', source: 'guess', note: '측정 없음 — 임시값(±6%, 벽 ±14%)', range: CH_SIZE, presetNames: SIZE_NAMES,
  }
}
function joGroup(stance: Stance): GroupInfo {
  return {
    id: `jo-${stance}` as GroupId, layer: '짜임', stance, name: `${STANCE_NAME[stance]} 짜임 · 받침`, members: '받침 전부',
    handle: 'finalGap', handleName: '받침 위 틈(받침은 안 누름)',
    source: stance === 'horizontal' ? 'measured' : 'borrowed',
    note: stance === 'horizontal' ? '고딕 86개 는에서 잼' : '가로 짜임(는) 측정을 빌림 — 갈래 측정 대기',
    range: FIN, presetNames: GAP_NAMES,
  }
}

const VOWEL_GROUP: Record<string, GroupId> = {
  'ㅏ': 'v-right', 'ㅑ': 'v-right', 'ㅓ': 'v-left', 'ㅕ': 'v-left',
  'ㅐ': 'v-double', 'ㅒ': 'v-double', 'ㅔ': 'v-double', 'ㅖ': 'v-double', 'ㅣ': 'v-none',
  'ㅗ': 'h-up', 'ㅛ': 'h-up', 'ㅜ': 'h-down', 'ㅠ': 'h-down', 'ㅡ': 'h-none',
  'ㅘ': 'mixed', 'ㅙ': 'mixed', 'ㅚ': 'mixed', 'ㅝ': 'mixed', 'ㅞ': 'mixed', 'ㅟ': 'mixed', 'ㅢ': 'mixed',
}
export const vowelGroupOf = (vowelChar: string | undefined): GroupId | undefined => vowelChar ? VOWEL_GROUP[vowelChar] : undefined

export function stanceOf(layout: LayoutType): Stance | undefined {
  if (layout.startsWith('choseong-jungseong-vertical')) return 'vertical'
  if (layout.startsWith('choseong-jungseong-horizontal')) return 'horizontal'
  if (layout.startsWith('choseong-jungseong-mixed')) return 'mixed'
  return undefined
}
const hasFinal = (layout: LayoutType) => layout.endsWith('-jongseong')

/** 잡은 부위 → 갈래. 홀자는 홀자 갈래, 첫닿자 · 받침은 짜임 층. */
export function groupOfPart(part: Part, layout: LayoutType, vowelChar: string | undefined): GroupId | undefined {
  const stance = stanceOf(layout)
  if (!stance) return undefined
  if (part === 'CH') return `ch-${stance}` as GroupId
  if (part === 'JO') return hasFinal(layout) ? `jo-${stance}` as GroupId : undefined
  return vowelGroupOf(vowelChar)
}

/** 이 글자에 듣는 갈래들(홀자 갈래 · 첫닿자 짜임 · 받침 짜임). */
export function groupsOfSyllable(layout: LayoutType, vowelChar: string | undefined): GroupId[] {
  const stance = stanceOf(layout)
  if (!stance) return []
  const out: GroupId[] = []
  const vg = vowelGroupOf(vowelChar)
  if (vg) out.push(vg)
  out.push(`ch-${stance}` as GroupId)
  if (hasFinal(layout)) out.push(`jo-${stance}` as GroupId)
  return out
}

export const clampToWall = (range: Range, value: number) => Math.max(range.wall[0], Math.min(range.wall[1], value))
export const inSafe = (range: Range, value: number) => value >= range.safe[0] - 1e-9 && value <= range.safe[1] + 1e-9

/** 사용자가 정한 값(갈래 → 값). 없으면 엔진 그대로. */
export type MoldValues = Partial<Record<GroupId, number>>

const UPPER: readonly Part[] = ['CH', 'JU', 'JU_H', 'JU_V']
const move = (box: BoxConfig | undefined, dx: number, dy: number): BoxConfig | undefined => box && { ...box, x: box.x + dx, y: box.y + dy }

/**
 * 풀린 부위 상자에 이 글자의 갈래 값들을 입힌다. 순서: 첫닿자 크기 → 홀자 틈 → 받침 위 틈.
 * - 틈: 첫닿자를 (엔진 − 목표)만큼 홀자 쪽으로(세로 짜임은 가로, 가로 짜임은 세로). 섞임은 손잡이 없음.
 * - 첫닿자 크기: 홀자 쪽 모서리를 두고 바깥으로 키운다(세로 짜임은 오른쪽 모서리 · 세로 가운데, 가로 짜임은 아래 모서리 · 가로 가운데, 섞임은 오른쪽 아래 모서리).
 * - 받침 위 틈: 받침은 그대로, 윗부분 전부를 (엔진 − 목표)만큼 아래로.
 */
export function moldBoxes(boxes: Partial<Record<Part, BoxConfig>>, layout: LayoutType, vowelChar: string | undefined, values: MoldValues): Partial<Record<Part, BoxConfig>> {
  const stance = stanceOf(layout)
  if (!stance) return boxes
  const out = { ...boxes }

  const size = values[`ch-${stance}` as GroupId]
  if (size !== undefined && out.CH) {
    const box = out.CH
    const s = clampToWall(CH_SIZE, size)
    const width = box.width * s
    const height = box.height * s
    const x = stance === 'horizontal' ? box.x + (box.width - width) / 2 : box.x + box.width - width
    const y = stance === 'vertical' ? box.y + (box.height - height) / 2 : box.y + box.height - height
    out.CH = { ...box, x, y, width, height }
  }

  const vg = vowelGroupOf(vowelChar)
  const gap = vg ? values[vg] : undefined
  const vowelRange = vg ? GROUPS[vg].range : null
  if (gap !== undefined && vowelRange && vg && out.CH) {
    const d = vowelRange.engine - clampToWall(vowelRange, gap)
    out.CH = GROUPS[vg].handle === 'gapX' ? move(out.CH, d, 0) : move(out.CH, 0, d)
  }

  const fin = hasFinal(layout) ? values[`jo-${stance}` as GroupId] : undefined
  if (fin !== undefined) {
    const d = FIN.engine - clampToWall(FIN, fin)
    for (const part of UPPER) if (out[part]) out[part] = move(out[part], 0, d)
  }
  return out
}

/** 잡은 자리(글자 칸 0–1)에서 가장 가까운 부위. 상자 안이면 거리 0, 겹치면 작은 상자. */
export function partAt(boxes: Partial<Record<Part, BoxConfig>>, x: number, y: number, present: Partial<Record<Part, boolean>>): Part | undefined {
  let best: { part: Part; distance: number; area: number } | undefined
  for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) {
    if (!box || !present[part]) continue
    const dx = Math.max(box.x - x, 0, x - (box.x + box.width))
    const dy = Math.max(box.y - y, 0, y - (box.y + box.height))
    const distance = Math.hypot(dx, dy)
    const area = box.width * box.height
    if (!best || distance < best.distance - 1e-9 || (Math.abs(distance - best.distance) < 1e-9 && area < best.area)) best = { part, distance, area }
  }
  return best?.part
}

/** 끌기: 손가락 1px당 값. 판 너비 전체를 끌면 한계선 끝에서 끝까지. */
export function dragValue(range: Range, start: number, deltaPx: number, widthPx: number): number {
  return clampToWall(range, start + (deltaPx / Math.max(1, widthPx)) * (range.wall[1] - range.wall[0]))
}

/** 값 → 띠 위 자리(0–1, 한계선 끝에서 끝). */
export const positionOf = (range: Range, value: number) => (value - range.wall[0]) / (range.wall[1] - range.wall[0])

/** 지금 값에 가장 가까운 프리셋(같으면 그 이름, 아니면 undefined = 다듬은 값). */
export function presetOf(range: Range, value: number | undefined): Preset | undefined {
  if (value === undefined) return undefined
  return (Object.keys(range.presets) as Preset[]).find((key) => Math.abs(range.presets[key] - value) < 1e-6)
}

/** 값 → 보이는 말. 틈은 보통에서 몇 %, 크기는 몇 %. */
export function valueText(group: GroupInfo, value: number | undefined): string {
  const range = group.range
  if (!range) return '—'
  const v = value ?? range.engine
  const base = range.presets.normal
  const pct = Math.round((v / base - 1) * 100)
  return `보통${pct === 0 ? '' : pct > 0 ? ` +${pct}%` : ` ${pct}%`}`
}

// ===== 큰 빚기: 글줄 전체를 바꾸는 손잡이 셋(크기 · 틀 · 숨) =====
// 고양이 추천(뼈대 문서 22:01 절, 하니무스 "여기서 얹어봐" 22:07): 긋기 뒤 내 선 위에서, 폭은 안전선이 아니라 한계선 가까이까지.
// 큰 손잡이 셋은 폰트에서 잰 폭이 아직 없어 모두 임시값이다. 띠의 가운데 칸(보통 폭)도 임시로 둔 폭이다.

export type BigKey = 'size' | 'frame' | 'breath'
export interface BigInfo {
  key: BigKey
  name: string
  /** 띠 왼쪽 끝 · 오른쪽 끝의 말 */
  left: string
  right: string
  what: string
  range: Range
}

export const BIG: readonly BigInfo[] = [
  {
    key: 'size', name: '크기', left: '닿자 작게', right: '닿자 크게', what: '첫닿자를 키우면 받침은 그만큼 작아져요. 받침 밑선은 그대로예요.',
    range: { engine: 1, presets: { narrow: 0.92, normal: 1, wide: 1.08 }, safe: [0.95, 1.05], wall: [0.8, 1.2] },
  },
  {
    key: 'frame', name: '틀', left: '길쭉하게', right: '납작하게', what: '글자의 가로 폭을 줄이거나 늘려요. 네모꼴이 길쭉해지거나 납작해져요.',
    range: { engine: 1, presets: { narrow: 0.88, normal: 1, wide: 1.08 }, safe: [0.95, 1.04], wall: [0.78, 1.16] },
  },
  {
    key: 'breath', name: '숨', left: '진하게', right: '성기게', what: '진하게 하면 획이 굵고 글자가 붙어요. 성기게 하면 가늘고 사이가 벌어져요.',
    range: { engine: 0, presets: { narrow: -0.5, normal: 0, wide: 0.5 }, safe: [-0.2, 0.2], wall: [-1, 1] },
  },
]
export const bigInfo = (key: BigKey) => BIG.find((info) => info.key === key)!

export type BigValues = Partial<Record<BigKey, number>>

/** 숨 → 굵기 배율 · 자간(글자 크기 비율). 왼쪽 끝 −1 = 굵기 ×1.45 · 자간 −4%, 오른쪽 끝 +1 = 굵기 ×0.7 · 자간 +14%. */
export function breathOf(value: number | undefined): { weight: number; tracking: number } {
  const v = Math.max(-1, Math.min(1, value ?? 0))
  return { weight: v < 0 ? 1 - v * 0.45 : 1 - v * 0.3, tracking: v < 0 ? v * 0.04 : v * 0.14 }
}

/** 굵기(100–900)에 배율을 곱한다. */
export const scaledWeight = (weight: number, scale: number) => Math.max(100, Math.min(900, Math.round(weight * scale)))

/**
 * 큰 빚기를 상자에 입힌다(갈래 값보다 먼저 — 갈래는 그 위의 더 다듬기).
 * - 크기 s: 첫닿자는 가운데를 두고 ×s, 받침은 밑선 · 가로 가운데를 두고 ×(2 − s).
 * - 틀 w: 모든 상자를 글자 가운데(x 0.5)를 두고 가로로 ×w.
 */
export function bigBoxes(boxes: Partial<Record<Part, BoxConfig>>, big: BigValues): Partial<Record<Part, BoxConfig>> {
  const out = { ...boxes }
  const s = big.size === undefined ? 1 : clampToWall(bigInfo('size').range, big.size)
  if (s !== 1) {
    if (out.CH) {
      const box = out.CH
      out.CH = { ...box, x: box.x + box.width * (1 - s) / 2, y: box.y + box.height * (1 - s) / 2, width: box.width * s, height: box.height * s }
    }
    if (out.JO) {
      const box = out.JO
      const t = 2 - s
      out.JO = { ...box, x: box.x + box.width * (1 - t) / 2, y: box.y + box.height * (1 - t), width: box.width * t, height: box.height * t }
    }
  }
  const w = big.frame === undefined ? 1 : clampToWall(bigInfo('frame').range, big.frame)
  if (w !== 1) {
    for (const part of Object.keys(out) as Part[]) {
      const box = out[part]
      if (box) out[part] = { ...box, x: 0.5 + (box.x - 0.5) * w, width: box.width * w }
    }
  }
  return out
}

/** 큰 빚기 값 → 보이는 말. */
export function bigText(info: BigInfo, value: number | undefined, weightCap = Infinity): string {
  if (value === undefined || Math.abs(value - info.range.engine) < 1e-6) return '처음 그대로'
  if (info.key === 'breath') {
    const { weight, tracking } = breathOf(value)
    return `굵기 ×${Math.min(weight, weightCap).toFixed(2)} · 자간 ${tracking >= 0 ? '+' : ''}${Math.round(tracking * 100)}%`
  }
  const pct = Math.round((value - 1) * 100)
  return info.key === 'size' ? `첫닿자 ${pct > 0 ? '+' : ''}${pct}% · 받침 ${pct > 0 ? '' : '+'}${-pct}%` : `가로 ${pct > 0 ? '+' : ''}${pct}%`
}

// ===== 획 사이 최소 틈 (하니무스 22:20 "ㄹ 뭉쳐진 거 최소 틈은 있어야지") =====
// 숨을 진하게 하거나 크기 · 틀로 칸을 좁히면 ㄹ 같은 자소의 획이 붙는다. 거북이 기준(틈은 굵기선의 70%가 한계)을 바닥으로 건다:
// 폰트도 굵어지면 틈이 준다(거북이 굵기선: 틈 = a − b × 굵기, b는 0.5~1.1, 가운데 0.9쯤). 그래서 바닥은 "그 굵기에서 기대하는 틈의 70%"다:
// 지금 틈 ≥ 0.7 × (처음 틈 − b × 늘어난 두께). 처음 = 같은 획 · 빚기 전 상자 · 처음 굵기.

export const GAP_FLOOR = 0.7
/** 굵기선 기울기(굵기가 늘면 기대 틈이 주는 몫). 거북이 자소별 표의 가운데쯤 — 자소별로 나누기 전 임시. */
export const GAP_SLOPE = 0.9
/** 어떤 경우에도 남기는 틈(두께의 몫). 엔진의 최소 틈과 같다. */
export const MIN_GAP_OF_THICKNESS = 0.25

export interface GapStroke {
  points: readonly { x: number; y: number; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } }[]
  closed: boolean
  box: { x: number; y: number; width: number; height: number }
  /** 굵기 배율 1일 때 두께(글자 칸 단위) */
  thickness: number
  /** 어느 자소의 획인가. 같은 자소 안의 틈만 센다(자소 사이 틈은 울타리 보정이 맡는다). */
  part?: string
}

type Pt = { x: number; y: number }
const CURVE_STEPS = 6
function flattenStroke(stroke: GapStroke): Pt[] {
  const { points, closed, box } = stroke
  const at = (p: Pt): Pt => ({ x: box.x + p.x * box.width, y: box.y + p.y * box.height })
  const out: Pt[] = []
  if (!points.length) return out
  out.push(at(points[0]))
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if (!a.handleOut && !b.handleIn) { out.push(at(b)); continue }
    const c1 = a.handleOut ?? a, c2 = b.handleIn ?? b
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS, u = 1 - t
      out.push(at({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y }))
    }
  }
  return out
}

function pointSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
function segSeg(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b))
}

interface Seg { stroke: number; part?: string; a: Pt; b: Pt; arc: number; len: number }
function segmentsOf(strokes: readonly GapStroke[]): Seg[] {
  const out: Seg[] = []
  strokes.forEach((stroke, index) => {
    const line = flattenStroke(stroke)
    let arc = 0
    for (let i = 1; i < line.length; i++) {
      const len = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y)
      out.push({ stroke: index, part: stroke.part, a: line[i - 1], b: line[i], arc, len })
      arc += len
    }
  })
  return out
}

/**
 * 획 사이 최소 틈을 지키며 쓸 수 있는 가장 큰 굵기 배율(`weightMultiplier`).
 * 처음(`reference`, 굵기 배율 `baseMultiplier`)과 지금(`current`)은 같은 획을 같은 순서로 가진다(빚기는 상자만 바꾼다).
 * - 처음부터 붙어 있거나 거의 붙은 짝(틈이 두께의 0.6배 아래)은 원래 이어 그린 것이라 안 센다.
 * - 한 획 안의 두 토막은 획을 따라 잰 거리가 둘 사이 거리보다 넉넉히 멀 때만 센다(ㄹ의 위 · 가운데 가로처럼 접혀 마주 보는 곳).
 * - 처음 틈이 글자 칸의 1/4보다 넓은 짝은 붙을 일이 없어 안 센다.
 * - 자소가 다른 짝(첫닿자 ↔ 홀자 가지 끝 등)은 안 센다. 폰트도 원래 붙여 그리기도 하고, 자소 사이 틈은 울타리 보정의 일이다.
 * 지킬 틈이 없으면 Infinity.
 */
export function gapCapMultiplier(reference: readonly GapStroke[], current: readonly GapStroke[], baseMultiplier: number, floor = GAP_FLOOR, slope = GAP_SLOPE): number {
  const ref = segmentsOf(reference)
  const cur = segmentsOf(current)
  if (ref.length !== cur.length) return Infinity
  // 서로 닿는 두 획(ㅅ 두 다리, ㅎ 꼭지 등)의 닿는 곳. 닿는 곳 가까이의 쐐기 틈은 굵어지면 원래 메워진다 — 거기서 멀리 떨어진 마주 봄만 센다.
  const contacts = new Map<string, Pt[]>()
  for (let i = 0; i < ref.length; i++) {
    for (let j = i + 1; j < ref.length; j++) {
      const ri = ref[i], rj = ref[j]
      if (ri.stroke === rj.stroke || ri.part !== rj.part) continue
      const half = (reference[ri.stroke].thickness + reference[rj.stroke].thickness) / 2
      if (segSeg(ri.a, ri.b, rj.a, rj.b) > half * baseMultiplier) continue
      const key = `${Math.min(ri.stroke, rj.stroke)}-${Math.max(ri.stroke, rj.stroke)}`
      const list = contacts.get(key) ?? []
      list.push({ x: (ri.a.x + ri.b.x + rj.a.x + rj.b.x) / 4, y: (ri.a.y + ri.b.y + rj.a.y + rj.b.y) / 4 })
      contacts.set(key, list)
    }
  }
  let cap = Infinity
  for (let i = 0; i < ref.length; i++) {
    for (let j = i + 1; j < ref.length; j++) {
      const ri = ref[i], rj = ref[j]
      if (ri.part !== rj.part) continue
      const half = (reference[ri.stroke].thickness + reference[rj.stroke].thickness) / 2
      if (half <= 0) continue
      const dRef = segSeg(ri.a, ri.b, rj.a, rj.b)
      const gapRef = dRef - half * baseMultiplier
      // 처음부터 두께의 0.6배도 안 떨어진 짝(ㅎ 꼭지 아래처럼 거의 붙여 그린 곳)은 원래 붙여 보이는 자리라 안 센다.
      if (gapRef < half * baseMultiplier * 0.6 || gapRef > 0.25) continue
      if (ri.stroke === rj.stroke) {
        const along = Math.abs(rj.arc - ri.arc) - (rj.arc > ri.arc ? ri.len : rj.len)
        if (along < 2 * dRef + half * baseMultiplier * 2) continue
      } else {
        const touch = contacts.get(`${Math.min(ri.stroke, rj.stroke)}-${Math.max(ri.stroke, rj.stroke)}`)
        if (touch && touch.some((point) => Math.min(pointSeg(point, ri.a, ri.b), pointSeg(point, rj.a, rj.b)) < 2 * dRef + half * baseMultiplier * 2)) continue
      }
      const dCur = segSeg(cur[i].a, cur[i].b, cur[j].a, cur[j].b)
      // ① 굵기선 바닥: d − m·h ≥ floor × (g0 − slope × (m − m0)·h). g0 = 빚은 상자에서 처음 굵기일 때 틈 — 칸을 줄였으면 기대 틈도 같이 준다.
      const g0 = dCur - half * baseMultiplier
      const byLine = (dCur - floor * (g0 + slope * baseMultiplier * half)) / (half * (1 - floor * slope))
      // ② 절대 바닥: 틈 ≥ 두께 × 0.25(엔진의 최소 틈). 칸이 너무 좁아져 처음 굵기로도 붙으면 여기서 가늘어진다.
      const byFloor = dCur / (half * (1 + MIN_GAP_OF_THICKNESS))
      cap = Math.min(cap, Math.max(Math.min(byLine, byFloor), 0))
    }
  }
  return cap
}

// ── 심즈처럼 빚기(2026-11-20 하니무스 "일단 가보자고") ──
// 글자에서 부위(첫닿자 · 홀자 · 받침)를 콕 눌러 고르고, 어디서든 여덟 방향으로 끈다.
// 칸 편집은 짜임마다 "칸 네 선을 얼마나 옮겼나"로 두어, 같은 짜임의 다른 글자에도 같은 만큼 옮긴다.
// 획(굵기 · 또렷↔흐물)과 전체(폭 · 자간)는 글자 위에 잡을 데가 없어 단추로 고른다.

export type SimsPart = 'CH' | 'JU' | 'JO'
export type Region = SimsPart | 'STROKE' | 'WHOLE'
/** 칸 네 선의 이동량(글자 단위): 왼선 · 오른선 · 윗선 · 밑선. */
export type PartEdit = readonly [number, number, number, number]
/** 편집 열쇠: 부위 셋 + 섞임홀자의 가로 · 세로 쪽(보선 끌기에서 따로 움직인다). */
export type EditPart = SimsPart | 'JU_H' | 'JU_V'
export type PartEdits = Partial<Record<EditPart, PartEdit>>
export type LayoutEdits = Partial<Record<LayoutType, PartEdits>>
/** 획 · 전체 값. 폭 · 키 · 크기는 글자 가운데를 두고 늘이고 줄인다. */
/**
 * 전체 값. 도트판 인상 잡기(하니무스 2026-11-21)가 다섯 값을 더 쓴다:
 * jamo = 닿자(첫닿자 · 받침) 크기 배율(제 칸 가운데를 붙든 채 가로세로 같이), center = 무게중심(+ 위로, 글자 단위),
 * balloon = 풍선 닿자의 획 사이 최소 틈(em, 사용자가 고름),
 * round = 끝 · 모서리 둥글기(0~1, 붓 둥글기), contrast = 획 대비(0~1, + 는 세로 굵게 · 가로 가늘게).
 */
export interface Look { weight?: number; soft?: number; frame?: number; tracking?: number; size?: number; height?: number; jamo?: number; center?: number; round?: number; contrast?: number; balloon?: number; open?: number; branch?: number; serif?: number; nib?: number; jag?: number }
export type Dir = 'up' | 'down' | 'left' | 'right' | 'ul' | 'ur' | 'dl' | 'dr'
export interface RegionLabels { name: string; up: string; down: string; left: string; right: string }

/**
 * 획 · 전체 값의 한계선.
 * 굵기는 기본 굵기(400)에 곱하는 비율이라 엔진이 그리는 100~900 전체(두께 ×0.40~1.95)가 들어오게 0.25~2.25(다람쥐 검수 2026-11-21 "굵기 폭 넓히기").
 * 크기 · 키 · 폭은 글자 가운데를 두고 늘이고 줄인다. 값은 아직 임시다.
 */
// 인상 잡기 값은 넓게(하니무스 2026-11-21 "더 다이나믹한 스펙트럼으로, 과하면 그때 다듬기"). 굵기는 이미 엔진 끝(100~900)까지.
// center는 첫닿자 칸 키에 대한 비율(허리선이 첫닿자 키의 몇 할만큼 오르나). open은 받침 없는 글자의 키(1이 네모).
// 판 양 끝 = 가장 멀리 간 목표 폰트(거북이 방향안 3차, 하니무스 2026-11-21 승인). 값은 노토(엔진)에 곱하는 배율이고, 칸 10은 폰트 가운데다(`DOT_SCALE`).
// center는 허리선(-1 아래 ~ +1 위, 짜임마다 폭이 다르다 `centerLift`). nib는 붓촉(빗금 굵기 차), jag는 글자마다 윗선 들쭉날쭉(표준편차 ÷ 키).
export const LOOK_WALL = { weight: [0.25, 2.25], soft: [0, 1], frame: [0.84, 1.24], tracking: [-0.08, 0.2], size: [0.83, 1.105], height: [0.6, 1.3], jamo: [0.55, 1.37], center: [-1, 1], round: [0, 1], contrast: [-0.38, 0.97], balloon: [0.01, 0.08], open: [0.45, 1], branch: [0.3, 1.6], serif: [0, 1], nib: [-0.08, 0.19], jag: [0.027, 0.09] } as const
export const LOOK_ENGINE = { weight: 1, soft: 0, frame: 1, tracking: 0, size: 1, height: 1, jamo: 1, center: 0, round: 0, contrast: 0, balloon: 0.04, open: 1, branch: 1, serif: 0, nib: 0, jag: 0.027 } as const
const clampLook = (key: keyof typeof LOOK_WALL, value: number) => Math.max(LOOK_WALL[key][0], Math.min(LOOK_WALL[key][1], value))
export const lookOf = (look: Look, key: keyof Look) => look[key] ?? LOOK_ENGINE[key]

export const simsPartOf = (part: Part): SimsPart => (part === 'JU_H' || part === 'JU_V' ? 'JU' : part)
const isVertical = (layout: LayoutType) => layout.includes('jungseong-vertical')

export function regionLabels(region: Region, layout: LayoutType): RegionLabels {
  if (region === 'CH') return { name: '첫닿자', up: '키 크게', down: '키 작게', left: '좁게', right: '넓게' }
  if (region === 'JO') return { name: '받침', up: '키 크게', down: '키 작게', left: '좁게', right: '넓게' }
  if (region === 'JU') return isVertical(layout)
    ? { name: '홀자', up: '길게', down: '짧게', left: '기둥 왼쪽으로', right: '기둥 오른쪽으로' }
    : { name: '홀자', up: '보 위로', down: '보 아래로', left: '짧게', right: '길게' }
  if (region === 'STROKE') return { name: '획', up: '굵게', down: '가늘게', left: '또렷하게', right: '흐물하게' }
  // 키 · 폭 · 크기는 네모꼴 손잡이로 끈다. 네모꼴 밖에서 좌우로 끌면 자간.
  return { name: '글자 전체', up: '', down: '', left: '자간 좁게', right: '자간 넓게' }
}

/** 끈 방향(화면 px, 아래가 +) → 여덟 방향 중 가까운 것. */
export function dirOf(dx: number, dy: number): Dir {
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  const map: Record<string, Dir> = { 0: 'right', 1: 'dr', 2: 'down', 3: 'dl', 4: 'left', '-4': 'left', '-3': 'ul', '-2': 'up', '-1': 'ur' }
  return map[String(sector)]
}

export type Rect = [number, number, number, number] // x0 y0 x1 y1
const rectOf = (box: BoxConfig): Rect => [box.x, box.y, box.x + box.width, box.y + box.height]
const boxOfRect = (base: BoxConfig, [x0, y0, x1, y1]: Rect): BoxConfig => ({ ...base, x: x0, y: y0, width: x1 - x0, height: y1 - y0 })

/** 이 칸이 받는 편집: 홀자 전체(JU) 편집 + 섞임홀자 쪽(JU_H · JU_V) 편집을 더한다. */
export function editOf(edits: PartEdits | undefined, part: Part): PartEdit | undefined {
  if (!edits) return undefined
  const whole = edits[simsPartOf(part)]
  const own = part === 'JU_H' || part === 'JU_V' ? edits[part] : undefined
  if (!whole || !own) return own ?? whole
  return [whole[0] + own[0], whole[1] + own[1], whole[2] + own[2], whole[3] + own[3]]
}

/** 짜임 편집을 칸에 입힌다. 섞임홀자의 JU_H · JU_V는 홀자 편집을 같이 받는다. 너무 얇아지면 가운데로 모은다(처음부터 선 하나인 칸은 그대로). */
export function applyPartEdits(boxes: Partial<Record<Part, BoxConfig>>, edits: PartEdits | undefined): Partial<Record<Part, BoxConfig>> {
  if (!edits) return boxes
  const out: Partial<Record<Part, BoxConfig>> = { ...boxes }
  for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) {
    const edit = box && editOf(edits, part)
    if (!edit) continue
    let [x0, y0, x1, y1] = rectOf(box)
    x0 += edit[0]; x1 += edit[1]; y0 += edit[2]; y1 += edit[3]
    if (x1 - x0 < 0.03 && box.width >= 0.03) { const c = (x0 + x1) / 2; x0 = c - 0.015; x1 = c + 0.015 }
    if (y1 - y0 < 0.03 && box.height >= 0.03) { const c = (y0 + y1) / 2; y0 = c - 0.015; y1 = c + 0.015 }
    out[part] = boxOfRect(box, [x0, y0, x1, y1])
  }
  return out
}

/** 처음 칸 → 지금 칸의 편집값. */
export function editsBetween(origin: Partial<Record<SimsPart, BoxConfig>>, next: Partial<Record<SimsPart, BoxConfig>>): Partial<Record<SimsPart, PartEdit>> {
  const out: Partial<Record<SimsPart, PartEdit>> = {}
  for (const part of Object.keys(next) as SimsPart[]) {
    const a = origin[part], b = next[part]
    if (!a || !b) continue
    const [ax0, ay0, ax1, ay1] = rectOf(a), [bx0, by0, bx1, by1] = rectOf(b)
    out[part] = [bx0 - ax0, bx1 - ax1, by0 - ay0, by1 - ay1]
  }
  return out
}

/** 섞임홀자는 JU_H · JU_V를 묶은 한 칸으로 본다. */
export function simsBoxes(boxes: Partial<Record<Part, BoxConfig>>): Partial<Record<SimsPart, BoxConfig>> {
  const out: Partial<Record<SimsPart, BoxConfig>> = {}
  if (boxes.CH) out.CH = boxes.CH
  if (boxes.JO) out.JO = boxes.JO
  const ju = [boxes.JU, boxes.JU_H, boxes.JU_V].filter((box): box is BoxConfig => !!box)
  if (ju.length) {
    const x0 = Math.min(...ju.map((b) => b.x)), y0 = Math.min(...ju.map((b) => b.y))
    const x1 = Math.max(...ju.map((b) => b.x + b.width)), y1 = Math.max(...ju.map((b) => b.y + b.height))
    out.JU = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }
  return out
}

const SIMS_LO = 0.02, SIMS_HI = 0.98
/**
 * 이웃 자소 벽: 밀려서 짜부되는 이웃은 처음 크기의 이 비율 아래로 안 줄어든다. 그보다 더 밀면 칸째로 밀려나고, 글자 끝에 닿으면 잡은 칸이 멈춘다.
 * 근거는 거북이 「자소별 틈과 크기」(고딕 86벌): 자소 높이 · 너비의 5% 끝이 가운데 값의 0.87~0.93배. 고딕만 잰 값이라 손글씨 · 제목체 몫을 더 남겨 0.7로 둔다(임시).
 */
export const NEIGHBOR_FLOOR = 0.7
/** 잡은 칸 스스로는 처음 크기의 이 범위 안에서만 바뀐다. */
export const OWN_RANGE = [0.5, 1.6] as const
const MIN_SIDE = 0.03

interface Neighbor { part: SimsPart; side: 'l' | 'r' | 't' | 'b'; gap: number }
function neighborsOf(boxes: Partial<Record<SimsPart, BoxConfig>>, grabbed: SimsPart): Neighbor[] {
  const p = boxes[grabbed]
  if (!p) return []
  const out: Neighbor[] = []
  for (const [part, q] of Object.entries(boxes) as [SimsPart, BoxConfig][]) {
    if (part === grabbed || !q) continue
    if (q.x >= p.x + p.width - 0.02) out.push({ part, side: 'r', gap: q.x - (p.x + p.width) })
    else if (q.x + q.width <= p.x + 0.02) out.push({ part, side: 'l', gap: p.x - (q.x + q.width) })
    else if (q.y >= p.y + p.height - 0.02) out.push({ part, side: 'b', gap: q.y - (p.y + p.height) })
    else if (q.y + q.height <= p.y + 0.02) out.push({ part, side: 't', gap: p.y - (q.y + q.height) })
  }
  return out
}

/** 이웃이 짜부될 수 있는 가장 작은 크기: 처음의 `NEIGHBOR_FLOOR`배. 이미 그보다 작으면 지금 크기. */
const floorOf = (now: number, first: number) => Math.min(now, Math.max(MIN_SIDE, first * NEIGHBOR_FLOOR))

/**
 * 잡은 칸의 새 자리(`rect`)를 이웃과 글자 끝에 맞춰 정하고, 이웃을 짜부하거나 민다.
 * `follow`: 이웃의 가까운 선이 멀어질 때도 따라온다(심즈 끌기 — 사이를 지킨다). 손잡이 끌기는 닿을 때만 민다.
 * `keepX` · `keepY`: 칸을 통째로 옮기는 중이면 크기를 지킨 채 멈춘다(한 변만 막혀 칸이 납작해지지 않게).
 */
function settle(start: Partial<Record<SimsPart, BoxConfig>>, origin: Partial<Record<SimsPart, BoxConfig>>, grabbed: SimsPart, rect: Rect, keepX: boolean, keepY: boolean, follow: boolean): Partial<Record<SimsPart, BoxConfig>> {
  const s = start[grabbed]!
  let [x0, y0, x1, y1] = rect
  const w = x1 - x0, h = y1 - y0
  const neighbors = neighborsOf(start, grabbed)
  const sizes = (n: Neighbor) => { const q = start[n.part]!, o = origin[n.part] ?? q; return { q, mw: floorOf(q.width, o.width), mh: floorOf(q.height, o.height) } }
  for (const n of neighbors) {
    const { q, mw, mh } = sizes(n)
    if (n.side === 'r') { const lim = Math.max(q.x + q.width, SIMS_HI) - mw - n.gap; if (x1 > lim) { x1 = lim; if (keepX) x0 = x1 - w } }
    if (n.side === 'l') { const lim = Math.min(q.x, SIMS_LO) + mw + n.gap; if (x0 < lim) { x0 = lim; if (keepX) x1 = x0 + w } }
    if (n.side === 'b') { const lim = Math.max(q.y + q.height, SIMS_HI) - mh - n.gap; if (y1 > lim) { y1 = lim; if (keepY) y0 = y1 - h } }
    if (n.side === 't') { const lim = Math.min(q.y, SIMS_LO) + mh + n.gap; if (y0 < lim) { y0 = lim; if (keepY) y1 = y0 + h } }
  }
  if (x0 < SIMS_LO) { x0 = SIMS_LO; if (keepX) x1 = x0 + w }
  if (x1 > SIMS_HI) { x1 = SIMS_HI; if (keepX) x0 = x1 - w }
  if (y0 < SIMS_LO) { y0 = SIMS_LO; if (keepY) y1 = y0 + h }
  if (y1 > SIMS_HI) { y1 = SIMS_HI; if (keepY) y0 = y1 - h }
  if (x1 - x0 < MIN_SIDE) x1 = x0 + MIN_SIDE
  if (y1 - y0 < MIN_SIDE) y1 = y0 + MIN_SIDE
  const out: Partial<Record<SimsPart, BoxConfig>> = { ...start, [grabbed]: boxOfRect(s, [x0, y0, x1, y1]) }
  for (const n of neighbors) {
    const { q, mw, mh } = sizes(n)
    let [qx0, qy0, qx1, qy1] = rectOf(q)
    // 가까운 선만 따라 밀려 짜부된다. 벽(처음의 0.7배)에 닿으면 먼 선도 같이 밀려 칸째로 옮겨진다.
    if (n.side === 'r' && (follow || x1 + n.gap > qx0)) { qx0 = x1 + n.gap; qx1 = Math.max(qx1, qx0 + mw) }
    if (n.side === 'l' && (follow || x0 - n.gap < qx1)) { qx1 = x0 - n.gap; qx0 = Math.min(qx0, qx1 - mw) }
    if (n.side === 'b' && (follow || y1 + n.gap > qy0)) { qy0 = y1 + n.gap; qy1 = Math.max(qy1, qy0 + mh) }
    if (n.side === 't' && (follow || y0 - n.gap < qy1)) { qy1 = y0 - n.gap; qy0 = Math.min(qy0, qy1 - mh) }
    out[n.part] = boxOfRect(q, [qx0, qy0, qx1, qy1])
  }
  return out
}

/** 잡은 칸 스스로의 크기를 처음의 0.5~1.6배 안으로. `anchor`는 그대로 둘 쪽(가운데 · 앞 · 뒤). */
function ownClamp(lo: number, hi: number, first: number, anchor: 'center' | 'start' | 'end'): [number, number] {
  const size = Math.max(first * OWN_RANGE[0], Math.min(first * OWN_RANGE[1], hi - lo))
  if (anchor === 'start') return [lo, lo + size]
  if (anchor === 'end') return [hi - size, hi]
  const c = (lo + hi) / 2
  return [c - size / 2, c + size / 2]
}

/**
 * 부위를 여덟 방향으로 끈 결과 칸(심즈 방식). du · dv는 글자 단위(위로 끌면 dv < 0).
 * 잡은 칸이 자라면 맞닿은 칸의 가까운 선이 따라 밀리고 먼 선은 그대로라 짜부된다. 벽까지 짜부되면 칸째로 밀려난다.
 * 홀자 기둥 · 보를 옮기는 방향은 크기를 지킨 채 옮기다 이웃 벽에서 멈춘다.
 */
export function dragPart(start: Partial<Record<SimsPart, BoxConfig>>, origin: Partial<Record<SimsPart, BoxConfig>>, grabbed: SimsPart, du: number, dv: number, layout: LayoutType): Partial<Record<SimsPart, BoxConfig>> {
  const s = start[grabbed], o = origin[grabbed]
  if (!s || !o) return start
  let [x0, y0, x1, y1] = rectOf(s)
  const grow = -dv
  let keepX = false, keepY = false
  if (grabbed === 'CH') { y1 += grow; x0 -= du / 2; x1 += du / 2;[y0, y1] = ownClamp(y0, y1, o.height, 'start') }
  else if (grabbed === 'JO') { y0 -= grow; x0 -= du / 2; x1 += du / 2;[y0, y1] = ownClamp(y0, y1, o.height, 'end') }
  else if (isVertical(layout)) { y0 -= grow / 2; y1 += grow / 2; x0 += du; x1 += du; keepX = true;[y0, y1] = ownClamp(y0, y1, o.height, 'center') }
  else { y0 -= grow; y1 -= grow; x0 -= du / 2; x1 += du / 2; keepY = true;[y0, y1] = ownClamp(y0, y1, o.height, 'center') }
  if (!keepX) [x0, x1] = ownClamp(x0, x1, o.width, 'center')
  return settle(start, origin, grabbed, [x0, y0, x1, y1], keepX, keepY, true)
}

/** 칸 상자 손잡이: 네 변 하나씩, 또는 가운데(통째로 옮기기). */
export type BoxGrip = 'l' | 'r' | 't' | 'b' | 'move'

/** 고른 칸의 변 하나를 끌거나 칸을 통째로 옮긴 결과(기존 한글칸글 상자 조절처럼). du · dv는 글자 단위. */
export function dragGrip(start: Partial<Record<SimsPart, BoxConfig>>, origin: Partial<Record<SimsPart, BoxConfig>>, grabbed: SimsPart, grip: BoxGrip, du: number, dv: number): Partial<Record<SimsPart, BoxConfig>> {
  const s = start[grabbed], o = origin[grabbed]
  if (!s || !o) return start
  let [x0, y0, x1, y1] = rectOf(s)
  if (grip === 'move') return settle(start, origin, grabbed, [x0 + du, y0 + dv, x1 + du, y1 + dv], true, true, false)
  if (grip === 'l') [x0, x1] = ownClamp(x0 + du, x1, o.width, 'end')
  if (grip === 'r') [x0, x1] = ownClamp(x0, x1 + du, o.width, 'start')
  if (grip === 't') [y0, y1] = ownClamp(y0 + dv, y1, o.height, 'end')
  if (grip === 'b') [y0, y1] = ownClamp(y0, y1 + dv, o.height, 'start')
  return settle(start, origin, grabbed, [x0, y0, x1, y1], false, false, false)
}

/** 누른 자리(글자 단위)가 칸 상자의 어느 손잡이인가. `tol`은 손가락 폭(글자 단위). 가운데 손잡이 → 변 → 칸 안 순서. 밖이면 undefined. */
export function gripAt(box: BoxConfig, x: number, y: number, tol: number): BoxGrip | undefined {
  const [x0, y0, x1, y1] = rectOf(box)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  if (Math.hypot(x - cx, y - cy) < tol * 0.8) return 'move'
  const inX = x > x0 - tol && x < x1 + tol, inY = y > y0 - tol && y < y1 + tol
  if (!inX || !inY) return undefined
  const d = { l: Math.abs(x - x0), r: Math.abs(x - x1), t: Math.abs(y - y0), b: Math.abs(y - y1) }
  const near = (Object.entries(d) as [BoxGrip, number][]).filter(([, v]) => v < tol).sort((a, b) => a[1] - b[1])[0]
  if (near) return near[0]
  return x > x0 && x < x1 && y > y0 && y < y1 ? 'move' : undefined
}

/**
 * 무게중심 = 허리선(거북이 방향안 4차, 하니무스 2026-11-21): 첫닿자 밑 · 곁줄기 · 보 높이가 같이 오르내린다. 바깥 틀은 그대로.
 * 폭은 실제 폰트 범위에서 짜임마다 따로(첫닿자 밑, 글자 키 대비): 받침 없음 위로 0.12 · 아래로 0.23(궁서 0.65 ~ Gugi 1.00),
 * 받침 있음 위로 0.03 · 아래로 0.035(받침 위 끝은 거의 고정이라 좁다). `center` −1 ~ +1, + 는 위로. 돌려주는 값은 칸 단위(+ 위로).
 */
const CENTER_BAR_DOWN = 0.06
export const CENTER_SHARE = { open: { up: 0.12, down: 0.23 }, closed: { up: 0.03, down: 0.035 } } as const
/**
 * 가로 · 섞임 짜임은 보가 첫닿자 밑을 따라 내려가므로, 보가 글자 칸 밑(0.98)에 닿으면 더 안 내려간다(첫닿자만 길어져 보를 덮지 않게).
 * 받침 없는 세로 짜임만 첫닿자 밑이 글자 밑까지 간다(Gugi · 나눔펜).
 */
function centerLiftRoom(lift: number, boxes: Partial<Record<Part, BoxConfig>>, layout?: LayoutType): number {
  if (lift >= 0 || !layout || isVertical(layout)) return lift
  const bar = boxes.JU_H ?? boxes.JU
  return bar ? Math.max(lift, -Math.max(0, 0.98 - bar.y - bar.height)) : lift
}
export function centerLift(look: Look, boxes: Partial<Record<Part, BoxConfig>>, layout?: LayoutType): number {
  const c = lookOf(look, 'center')
  if (c === 0 || !layout) return 0
  const list = Object.values(boxes).filter((box): box is BoxConfig => !!box)
  if (!list.length) return 0
  const span = Math.max(...list.map((b) => b.y + b.height)) - Math.min(...list.map((b) => b.y))
  const share = CENTER_SHARE[layout.includes('jongseong') ? 'closed' : 'open']
  // 아래로 23%는 받침 없는 세로 짜임에서 잰 값이다. 가로 · 섞임 짜임은 보가 받쳐 첫닿자가 덜 내려간다(재지 않은 임시값 6%, 「의」에서 ㅇ이 ㅡ에 닿지 않는 데까지).
  const down = isVertical(layout) ? share.down : Math.min(share.down, CENTER_BAR_DOWN)
  return c * (c > 0 ? share.up : down) * span
}

/** 전체 값(폭 · 키 · 크기)을 칸에 입힌다. 모두 글자 가운데(0.5, 0.5)를 두고 늘이고 줄인다. */
/**
 * 밀림 공식(거북이 2026-11-21, 고딕 86벌, https://claude.ai/artifact/A7iQiyksvaw9WX4jYsFF5Z).
 * 닿자가 커지면 늘어난 몫의 1/4은 바깥으로, 3/4은 안쪽(홀자 쪽)으로 가서 틈이 받는다. 홀자는 늘어난 몫의 0.1만 밀린다.
 * 받침이 커져 윗변이 오르면 첫닿자 밑(가로 짜임의 보도)은 그 0.665배, 세로홀자 기둥 밑은 1.0배 따라 오른다.
 * 줄어들 때는 같은 비율로 거꾸로. 틈이 한계까지 줄면 이웃을 다 민다는 부분은 추정이라 넣지 않았다(풍선 닿자가 틈에서 멈춘다).
 */
export const PUSH = { inner: 0.75, vowel: 0.1, finalCh: 0.665, finalStem: 1 } as const
export type Side = 'l' | 'r' | 't' | 'b'
/** 닿자의 안쪽 변(홀자 · 받침 쪽). 그 축에서는 늘어난 몫의 3/4이 이쪽으로 간다. 안쪽 변이 없는 축은 반반. */
export function innerSides(part: 'CH' | 'JO', layout: LayoutType): Side[] {
  if (part === 'JO') return ['t']
  const final = layout.includes('jongseong')
  if (layout.includes('jungseong-mixed')) return ['r', 'b']
  if (isVertical(layout)) return final ? ['r', 'b'] : ['r']
  return ['b']
}
/** 축마다 안쪽 변이 가져가는 몫(0.5면 가운데를 붙든 것). */
export function sideShare(inner: readonly Side[], side: Side): number {
  const opposite: Record<Side, Side> = { l: 'r', r: 'l', t: 'b', b: 't' }
  if (inner.includes(side)) return PUSH.inner
  if (inner.includes(opposite[side])) return 1 - PUSH.inner
  return 0.5
}
function pushJamo(boxes: Partial<Record<Part, BoxConfig>>, k: number, layout?: LayoutType): Partial<Record<Part, BoxConfig>> {
  const out = { ...boxes }
  // 짜임을 모르면 제 칸 가운데를 붙든 채(이웃은 그대로).
  if (!layout) { for (const part of ['CH', 'JO'] as const) { const b = boxes[part]; if (b) out[part] = { ...b, x: b.x - b.width * (k - 1) / 2, y: b.y - b.height * (k - 1) / 2, width: b.width * k, height: b.height * k } } return out }
  const vertical = isVertical(layout), mixed = layout.includes('jungseong-mixed')
  for (const part of ['CH', 'JO'] as const) {
    const box = boxes[part]
    if (!box) continue
    const inner = innerSides(part, layout)
    const dw = box.width * (k - 1), dh = box.height * (k - 1)
    out[part] = { ...box, x: box.x - dw * sideShare(inner, 'l'), y: box.y - dh * sideShare(inner, 't'), width: box.width + dw, height: box.height + dh }
    if (part === 'CH') {
      // 홀자는 0.1만 밀린다(먼 변은 그대로).
      const side = mixed ? out.JU_V : vertical ? out.JU : undefined
      if (side && inner.includes('r')) { const m = dw * PUSH.vowel, next = { ...side, x: side.x + m, width: Math.max(0.01, side.width - m) }; if (mixed) out.JU_V = next; else out.JU = next }
      const bar = mixed ? out.JU_H : !vertical ? out.JU : undefined
      if (bar && inner.includes('b')) { const m = dh * PUSH.vowel; if (mixed) out.JU_H = { ...bar, y: bar.y + m }; else out.JU = { ...bar, y: bar.y + m } }
    } else {
      const rise = dh * sideShare(inner, 't')
      const ch = out.CH
      if (ch) out.CH = { ...ch, height: Math.max(0.03, ch.height - rise * PUSH.finalCh) }
      const stem = mixed ? out.JU_V : vertical ? out.JU : undefined
      if (stem) { const next = { ...stem, height: Math.max(0.03, stem.height - rise * PUSH.finalStem) }; if (mixed) out.JU_V = next; else out.JU = next }
      const bar = mixed ? out.JU_H : !vertical ? out.JU : undefined
      if (bar) { const next = { ...bar, y: bar.y - rise * PUSH.finalCh }; if (mixed) out.JU_H = next; else out.JU = next }
    }
  }
  return out
}

/**
 * 닿자 크기 · 무게중심을 칸에 입힌다.
 * 닿자 크기: 첫닿자 · 받침 칸을 제 가운데를 붙든 채 가로세로 같이 키우고 줄인다(1 = 엔진 그대로, 칸에 꽉).
 * 무게중심(거북이 A안, 하니무스 2026-11-21): 틀(기둥 위 · 아래 끝)은 그대로 두고 안쪽 허리선만 옮긴다.
 * 칸에서는 첫닿자 칸 밑변과, 가로홀자(ㅗ · ㅜ · ㅡ, 섞임의 가로 쪽)의 칸을 같이 올리고 내린다. ㅏ · ㅓ 곁줄기 높이는 획에서 옮긴다(`waistSyllable`).
 * `center` + 는 허리가 위로(무게중심 높음).
 */
export function impressBoxes(boxes: Partial<Record<Part, BoxConfig>>, look: Look, layout?: LayoutType): Partial<Record<Part, BoxConfig>> {
  const k = lookOf(look, 'jamo')
  const lift = centerLiftRoom(centerLift(look, boxes, layout), boxes, layout)
  if (k === 1 && lift === 0) return boxes
  const out: Partial<Record<Part, BoxConfig>> = {}
  const pushed = k === 1 ? boxes : pushJamo(boxes, k, layout)
  for (const [part, box] of Object.entries(pushed) as [Part, BoxConfig][]) {
    if (!box) continue
    let next = box
    if (lift !== 0 && layout) {
      const horizontalVowel = !isVertical(layout) && !layout.includes('jungseong-mixed')
      // 첫닿자: 윗변은 그대로, 밑변만 허리선을 따라.
      if (part === 'CH') next = { ...next, height: Math.max(0.05, next.height - lift) }
      // 보(가로홀자)는 칸째 허리선을 따라.
      if ((part === 'JU' && horizontalVowel) || part === 'JU_H') next = { ...next, y: Math.max(0.02, Math.min(0.98 - next.height, next.y - lift)) }
      // 섞임홀자의 세로 쪽은 보에 붙어 있다: 밑은 두고 윗변만 보를 따라.
      // (ㅢ처럼 세로 쪽이 보보다 위에서 시작하면 그대로.)
      if (part === 'JU_V' && boxes.JU_H && next.y >= boxes.JU_H.y - 1e-6 && next.height + lift > 0.05) next = { ...next, y: next.y - lift, height: next.height + lift }
    }
    out[part] = next
  }
  return out
}

/** 획 하나가 가로(두 끝 높이가 같다)인가. */
const isLevel = (stroke: StrokeDataV2) => stroke.points.length >= 2 && !stroke.closed && stroke.points.every((p) => Math.abs(p.y - stroke.points[0].y) < 1e-3)
/**
 * 무게중심(거북이 A안)의 곁줄기: 세로홀자(ㅏ · ㅓ · ㅐ …, 섞임의 세로 쪽)의 가로 곁줄기를 허리선을 따라 옮긴다. 기둥은 그대로.
 * `lift`는 글자 단위(+ 위로), `box`는 그 홀자 칸(칸 안 좌표로 바꾸는 데 쓴다).
 */
export function waistSyllable(syllable: DecomposedSyllable, lift: number, boxes: Partial<Record<Part, BoxConfig>>): DecomposedSyllable {
  const ju = syllable.jungseong
  if (!ju || lift === 0) return syllable
  const mixed = syllable.layoutType.includes('jungseong-mixed')
  if (!mixed && !isVertical(syllable.layoutType)) return syllable
  const box = boxes[mixed ? 'JU_V' : 'JU']
  if (!box || box.height < 0.05) return syllable
  const dy = -lift / box.height
  const move = (strokes?: StrokeDataV2[]) => strokes?.map((stroke) => isLevel(stroke)
    ? { ...stroke, points: stroke.points.map((p) => { const y = Math.max(0.04, Math.min(0.96, p.y + dy)), d = y - p.y; return { ...p, y, ...(p.handleIn ? { handleIn: { ...p.handleIn, y: p.handleIn.y + d } } : {}), ...(p.handleOut ? { handleOut: { ...p.handleOut, y: p.handleOut.y + d } } : {}) } }) }
    : stroke)
  const next: JamoData = mixed ? { ...ju, verticalStrokes: move(ju.verticalStrokes) } : { ...ju, strokes: move(ju.strokes) }
  return { ...syllable, jungseong: next }
}

/** 받침 없는 글자의 키(탈네모): 받침 없는 짜임은 글자 윗변을 두고 세로로 `open`배. */
function openBoxes(boxes: Partial<Record<Part, BoxConfig>>, open: number, layout?: LayoutType): Partial<Record<Part, BoxConfig>> {
  if (open === 1 || !layout || layout.includes('jongseong')) return boxes
  const top = Math.min(...Object.values(boxes).filter((box): box is BoxConfig => !!box).map((box) => box.y))
  const out: Partial<Record<Part, BoxConfig>> = {}
  for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) if (box) out[part] = { ...box, y: top + (box.y - top) * open, height: box.height * open }
  return out
}

/**
 * 전체 값이 칸을 글자 칸보다 크게 키우면, 비율은 두고 통째로 줄여 넣는다. 엔진은 잉크를 가로 0~1에서 자르므로 넘치면 획끼리 가로지른다.
 * 벽은 칸 끝(0 ~ 1, 거북이 방향안: 개구 1.00 em)이고, 칸 끝에서 획 두께 반만큼 안쪽이다.
 */
const HALF_THICK = 0.033
/** 전체 값(비율 · 크기)으로 실제 쓰는 가로 · 세로 배율. 칸이 글자 칸을 넘치면 같이 줄인다. 크기가 키를, 비율이 폭을 정한다. */
export function lookScale(boxes: Partial<Record<Part, BoxConfig>>, look: Look): { sx: number; sy: number } {
  const sx = lookOf(look, 'frame') * lookOf(look, 'size'), sy = lookOf(look, 'height') * lookOf(look, 'size')
  const list = Object.values(boxes).filter((box): box is BoxConfig => !!box)
  if (!list.length) return { sx, sy }
  const far = (lo: number, hi: number) => Math.max(0.5 - lo, hi - 0.5)
  const fx = far(Math.min(...list.map((b) => b.x)), Math.max(...list.map((b) => b.x + b.width)))
  const fy = far(Math.min(...list.map((b) => b.y)), Math.max(...list.map((b) => b.y + b.height)))
  const room = 0.5 - HALF_THICK * Math.min(lookOf(look, 'weight'), 2.25)
  const fit = Math.min(1, fx * sx > room ? room / (fx * sx) : 1, fy * sy > room ? room / (fy * sy) : 1)
  return { sx: sx * fit, sy: sy * fit }
}

/** 무게중심 허리선이 실제로 오르는 만큼(칸 단위, + 위로). 곁줄기도 첫닿자 밑과 같은 만큼. */
export function waistLift(look: Look, boxes: Partial<Record<Part, BoxConfig>>, layout?: LayoutType): number {
  return centerLiftRoom(centerLift(look, boxes, layout), boxes, layout)
}

/** 획 고치기 도우미: 자모의 모든 획 묶음(strokes · 가로 · 세로)에 같은 바꾸기를 건다. 섞임홀자는 가로 · 세로 묶음을 따로 받는다. */
function mapGroups(jamo: JamoData, fn: (strokes: StrokeDataV2[]) => StrokeDataV2[]): JamoData {
  return {
    ...jamo, strokes: jamo.strokes && fn(jamo.strokes), horizontalStrokes: jamo.horizontalStrokes && fn(jamo.horizontalStrokes), verticalStrokes: jamo.verticalStrokes && fn(jamo.verticalStrokes),
    contextStrokes: jamo.contextStrokes && Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, strokes]) => [family, strokes && fn(strokes)])),
  }
}
/** 곧은 획(점이 몇 개든 한 줄 위, 손잡이 없음). 두 끝은 처음 · 마지막 점. */
const straight = (stroke: StrokeDataV2) => {
  const ps = stroke.points
  if (stroke.closed || ps.length < 2 || ps.some((p) => p.handleIn || p.handleOut)) return false
  const a = ps[0], b = ps[ps.length - 1], len = Math.hypot(b.x - a.x, b.y - a.y)
  return len > 1e-6 && ps.every((p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len < 0.02)
}
const endsOf = (stroke: StrokeDataV2) => [stroke.points[0], stroke.points[stroke.points.length - 1]] as const
const lengthOf = (stroke: StrokeDataV2) => { const [a, b] = endsOf(stroke); return Math.hypot(b.x - a.x, b.y - a.y) }

/**
 * 곁줄기 길이(다람쥐 세 번째 맞추기 5번: Gugi의 점 같은 곁줄기). 홀자 묶음마다 가장 긴 곧은 획을 기둥(보)으로 보고,
 * 나머지 곧은 획은 기둥에 붙은 끝을 두고 `k`배로 늘이거나 줄인다. 칸 안 좌표라 칸 밖으로 조금 나갈 수 있다.
 */
export function branchSyllable(syllable: DecomposedSyllable, k: number): DecomposedSyllable {
  const ju = syllable.jungseong
  if (!ju || k === 1) return syllable
  const fix = (strokes: StrokeDataV2[]) => {
    const lines = strokes.filter(straight)
    if (lines.length < 2) return strokes
    const stem = lines.reduce((a, b) => (lengthOf(b) > lengthOf(a) ? b : a))
    const [s0, s1] = endsOf(stem)
    const toStem = (p: { x: number; y: number }) => {
      const dx = s1.x - s0.x, dy = s1.y - s0.y, t = Math.max(0, Math.min(1, ((p.x - s0.x) * dx + (p.y - s0.y) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(p.x - (s0.x + dx * t), p.y - (s0.y + dy * t))
    }
    return strokes.map((stroke) => {
      if (stroke === stem || !straight(stroke)) return stroke
      const [a, b] = endsOf(stroke)
      const near = toStem(a) <= toStem(b) ? a : b
      return { ...stroke, points: stroke.points.map((p) => (p === near ? p : { ...p, x: near.x + (p.x - near.x) * k, y: near.y + (p.y - near.y) * k })) }
    })
  }
  return { ...syllable, jungseong: mapGroups(ju, fix) }
}

/** 0~1 사이 같은 수를 늘 같게(글자 · 획 이름으로 씨앗). 손글씨 흔들림이 다시 그릴 때마다 바뀌지 않게. */
function seeded(text: string): () => number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000 }
}

/**
 * 부리 흉내(다람쥐 6번, 엔진에 부리 값이 없어 획을 덧댄다). 세로로 곧은 획은 윗끝에 왼쪽 아래로 짧은 삐침을,
 * 가로로 곧은 획은 오른끝에 아래로 짧은 맺음을 단다. `amount` 0~1, 1이면 길이가 글자의 6%.
 */
export function serifSyllable(syllable: DecomposedSyllable, amount: number, boxes: Partial<Record<Part, BoxConfig>>): DecomposedSyllable {
  if (amount <= 0) return syllable
  const len = 0.06 * amount
  const add = (jamo: JamoData | null, part: Part): JamoData | null => {
    if (!jamo) return jamo
    const box = boxes[part] ?? (part === 'JU' ? boxes.JU_V ?? boxes.JU_H : undefined)
    if (!box) return jamo
    const ux = len / Math.max(box.width, 0.05), uy = len / Math.max(box.height, 0.05)
    return mapGroups(jamo, (strokes) => {
      const extra: StrokeDataV2[] = []
      for (const stroke of strokes) {
        // 흔든 획(손잡이 있음)에도 붙도록 두 끝만 본다. 닫힌 획(ㅇ)과 기운 획(ㅅ)은 빼고.
        if (stroke.closed || stroke.points.length < 2) continue
        const [a, b] = endsOf(stroke)
        const thin = stroke.thickness * 0.9
        // 세로 · 가로는 칸 좌표가 아니라 글자에서 보이는 기울기로 가른다.
        const wx = Math.abs(b.x - a.x) * box.width, wy = Math.abs(b.y - a.y) * box.height
        if (wy > wx * 3) {
          // 기둥 윗끝 왼쪽에 솟은 부리: 윗끝 조금 아래에서 왼쪽 위로.
          const top = a.y <= b.y ? a : b
          extra.push({ id: `${stroke.id}~serif`, closed: false, thickness: thin, points: [{ x: top.x, y: top.y + uy * 0.4 }, { x: top.x - ux * 0.7, y: top.y - uy * 0.1 }] })
        } else if (wx > wy * 3) {
          // 가로줄기 오른끝 맺음: 아래로 짧게.
          const right = a.x >= b.x ? a : b
          extra.push({ id: `${stroke.id}~serif`, closed: false, thickness: thin, points: [{ x: right.x - ux * 0.15, y: right.y }, { x: right.x, y: right.y + uy * 0.6 }] })
        }
      }
      return extra.length ? [...strokes, ...extra] : strokes
    })
  }
  return { ...syllable, choseong: add(syllable.choseong, 'CH'), jungseong: add(syllable.jungseong, 'JU'), jongseong: add(syllable.jongseong, 'JO') }
}

/**
 * 글자마다 윗선 들쭉날쭉(거북이 방향안 3차, 하니무스 2026-11-21 승인). 손글씨체 넷(개구 · 나눔펜 · 하이멜로디 · Stylish)이 이것 없이는 안 나온다.
 * `jag`는 윗선이 글자마다 흩어지는 정도(표준편차 ÷ 키). 노토가 이미 가진 0.027보다 더한 만큼만 글자 이름 씨앗으로 윗변을 올리고 내린다.
 * 밑변은 그대로(밑선 들쭉날쭉은 탈네모가 맡는다), 글자 칸을 넘지 않는다.
 */
export function jagBoxes(boxes: Partial<Record<Part, BoxConfig>>, jag: number, char?: string): Partial<Record<Part, BoxConfig>> {
  const extra = Math.sqrt(Math.max(0, jag * jag - LOOK_ENGINE.jag ** 2))
  if (!char || extra < 1e-4) return boxes
  const list = Object.values(boxes).filter((box): box is BoxConfig => !!box)
  if (!list.length) return boxes
  const top = Math.min(...list.map((b) => b.y)), bottom = Math.max(...list.map((b) => b.y + b.height)), span = bottom - top
  if (span < 0.1) return boxes
  // 고른 분포(−√3 ~ √3)는 표준편차가 1이다.
  const u = (seeded(`${char}:jag`)() * 2 - 1) * Math.sqrt(3)
  const nextTop = Math.max(HALF_THICK, Math.min(top + span * 0.4, top - u * extra * span))
  const k = (bottom - nextTop) / span
  const out: Partial<Record<Part, BoxConfig>> = {}
  for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) if (box) out[part] = { ...box, y: bottom - (bottom - box.y) * k, height: box.height * k }
  return out
}

export function lookBoxes(boxes: Partial<Record<Part, BoxConfig>>, look: Look, layout?: LayoutType, char?: string): Partial<Record<Part, BoxConfig>> {
  boxes = openBoxes(impressBoxes(boxes, look, layout), lookOf(look, 'open'), layout)
  const { sx, sy } = lookScale(boxes, look)
  if (sx !== 1 || sy !== 1) {
    const out: Partial<Record<Part, BoxConfig>> = {}
    for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) {
      if (box) out[part] = { ...box, x: 0.5 + (box.x - 0.5) * sx, y: 0.5 + (box.y - 0.5) * sy, width: box.width * sx, height: box.height * sy }
    }
    boxes = out
  }
  return jagBoxes(boxes, lookOf(look, 'jag'), char)
}

/** 네모꼴(글자 몸)을 전체 값대로 옮긴 사각형. `body`는 처음 네모꼴 [x0, y0, x1, y1]. */
export function lookRect(body: Rect, look: Look): Rect {
  const sx = lookOf(look, 'frame') * lookOf(look, 'size'), sy = lookOf(look, 'height') * lookOf(look, 'size')
  return [0.5 + (body[0] - 0.5) * sx, 0.5 + (body[1] - 0.5) * sy, 0.5 + (body[2] - 0.5) * sx, 0.5 + (body[3] - 0.5) * sy]
}

/** 네모꼴 손잡이: 네 변과 네 모서리. 위 · 아래 변은 키, 왼 · 오른 변은 폭, 모서리는 크기. */
export type WholeGrip = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br'

/** 누른 자리가 네모꼴의 어느 손잡이인가. 모서리 먼저. */
export function wholeGripAt(rect: Rect, x: number, y: number, tol: number): WholeGrip | undefined {
  const [x0, y0, x1, y1] = rect
  const nx = Math.abs(x - x0) < tol ? 'l' : Math.abs(x - x1) < tol ? 'r' : ''
  const ny = Math.abs(y - y0) < tol ? 't' : Math.abs(y - y1) < tol ? 'b' : ''
  if (nx && ny) return `${ny}${nx}` as WholeGrip
  if (nx && y > y0 && y < y1) return nx as WholeGrip
  if (ny && x > x0 && x < x1) return ny as WholeGrip
  return undefined
}

/** 네모꼴 손잡이를 끈 결과. 가운데를 두고 늘이므로 변이 du만큼 가면 반폭이 du만큼 는다. */
export function dragWhole(start: Look, body: Rect, grip: WholeGrip, du: number, dv: number): Look {
  const r = lookRect(body, start)
  const halfW = (r[2] - r[0]) / 2, halfH = (r[3] - r[1]) / 2
  const wx = grip.includes('l') ? -du : grip.includes('r') ? du : 0
  const wy = grip.includes('t') ? -dv : grip.includes('b') ? dv : 0
  if (grip.length === 2) {
    // 모서리: 크기. 가로 · 세로로 간 만큼의 평균.
    const ratio = ((halfW + wx) / halfW + (halfH + wy) / halfH) / 2
    return { ...start, size: clampLook('size', lookOf(start, 'size') * ratio) }
  }
  if (wx) return { ...start, frame: clampLook('frame', lookOf(start, 'frame') * (halfW + wx) / halfW) }
  return { ...start, height: clampLook('height', lookOf(start, 'height') * (halfH + wy) / halfH) }
}

/** 획 · 전체를 끈 결과. du · dv는 글자 단위(위로 끌면 dv < 0). */
export function dragLook(start: Look, region: 'STROKE' | 'WHOLE', du: number, dv: number): Look {
  // 굵기 폭이 넓어져(100~900) 같은 손 거리에 더 많이 바뀐다.
  if (region === 'STROKE') return { ...start, weight: clampLook('weight', lookOf(start, 'weight') * Math.exp(-dv * 2.4)), soft: clampLook('soft', lookOf(start, 'soft') + du * 2.5) }
  // 전체: 네모꼴 밖에서 좌우로 끌면 자간. 키 · 폭 · 크기는 네모꼴 손잡이(`dragWhole`).
  return { ...start, tracking: clampLook('tracking', lookOf(start, 'tracking') + du * 0.3) }
}

/**
 * 실제로 쓰는 굵기 배율. 틈 바닥은 사용자가 굵게 할 때만 멈추는 데 쓴다.
 * 칸을 만지다 칸이 좁아져도 굵기를 몰래 바꾸지 않는다(하니무스 2026-11-20 "굵기 누르지도 않았는데").
 */
export const appliedWeight = (wanted: number, cap: number) => (wanted <= 1 ? wanted : Math.min(wanted, Math.max(1, cap)))


// ── 보선 끌기(A안, 하니무스 2026-11-21 승인) ──
// 부위 사이에 보선 하나를 두고 양쪽 부위가 나눠 쓴다. 선을 밀면 한쪽 부위가 넓어지고 다른 쪽이 좁아져, 둘이 겹칠 일이 없다.

/** 보선 하나: `a` 부위들의 먼 변(오른 · 밑)과 `b` 부위들의 가까운 변(왼 · 위) 사이. */
export interface Seam { axis: 'h' | 'v'; a: readonly Part[]; b: readonly Part[] }

/** 짜임에 맞는 보선들. 섞임홀자는 가로 쪽(JU_H)과 세로 쪽(JU_V)을 따로 본다. */
export function seamsOf(layout: LayoutType, boxes: Partial<Record<Part, BoxConfig>>): Seam[] {
  const has = (part: Part) => !!boxes[part]
  const final = has('JO')
  const out: Seam[] = []
  if (layout.includes('jungseong-mixed')) {
    out.push({ axis: 'v', a: ['CH', 'JU_H'], b: ['JU_V'] })
    out.push({ axis: 'h', a: ['CH'], b: ['JU_H'] })
    if (final) out.push({ axis: 'h', a: ['CH', 'JU_H', 'JU_V'], b: ['JO'] })
  } else if (isVertical(layout)) {
    out.push({ axis: 'v', a: ['CH'], b: ['JU'] })
    if (final) out.push({ axis: 'h', a: ['CH', 'JU'], b: ['JO'] })
  } else {
    out.push({ axis: 'h', a: ['CH'], b: ['JU'] })
    if (final) out.push({ axis: 'h', a: ['JU'], b: ['JO'] })
  }
  return out.filter((seam) => [...seam.a, ...seam.b].every(has))
}

const sizeOn = (box: BoxConfig, axis: 'h' | 'v') => (axis === 'v' ? box.width : box.height)
/** 보선 자리(글자 단위): 양쪽 변의 가운데. */
export function seamPos(seam: Seam, boxes: Partial<Record<Part, BoxConfig>>): number {
  const v = seam.axis === 'v'
  const far = Math.max(...seam.a.map((part) => { const b = boxes[part]!; return v ? b.x + b.width : b.y + b.height }))
  const near = Math.min(...seam.b.map((part) => { const b = boxes[part]!; return v ? b.x : b.y }))
  return (far + near) / 2
}
/** 보선을 더 밀 수 있는 범위 [아래, 위](글자 단위). 양쪽 부위 모두 처음 크기의 0.7~1.6배 안. 처음부터 선 하나인 칸(ㅢ의 ㅡ)은 따지지 않는다. */
export function seamRange(seam: Seam, origin: Partial<Record<Part, BoxConfig>>, now: Partial<Record<Part, BoxConfig>>, floor = NEIGHBOR_FLOOR): [number, number] {
  let lo = -Infinity, hi = Infinity
  for (const part of seam.a) {
    const o = sizeOn(origin[part]!, seam.axis), c = sizeOn(now[part]!, seam.axis)
    if (o < 0.03) continue
    lo = Math.max(lo, floor * o - c); hi = Math.min(hi, OWN_RANGE[1] * o - c)
  }
  for (const part of seam.b) {
    const o = sizeOn(origin[part]!, seam.axis), c = sizeOn(now[part]!, seam.axis)
    if (o < 0.03) continue
    lo = Math.max(lo, c - OWN_RANGE[1] * o); hi = Math.min(hi, c - floor * o)
  }
  return [Math.min(lo, 0), Math.max(hi, 0)]
}
const editKey = (part: Part): EditPart => (part === 'JU_H' || part === 'JU_V' ? part : simsPartOf(part))
const addEdit = (edits: PartEdits, part: Part, index: number, amount: number): PartEdits => {
  const key = editKey(part)
  const next = [...(edits[key] ?? [0, 0, 0, 0])] as [number, number, number, number]
  next[index] += amount
  return { ...edits, [key]: next }
}
/**
 * 벽은 막지 않고 알린다(버전 1 부위 다듬기, 고양이 흐름 다시 보기 v1c-4). 이웃이 처음의 70%(최소 간격)에 닿으면 한 번 붙들고,
 * 그보다 `SEAM_HOLD`만큼 더 끌면 넘어가 `SEAM_HARD_FLOOR`(처음의 45%)까지 간다. 그 밖은 막는다.
 */
export const SEAM_HOLD = 0.06
export const SEAM_HARD_FLOOR = 0.45
export type SeamWall = 'free' | 'held' | 'past' | 'hard'
/** 보선을 d(글자 단위)만큼 민 편집. 최소 간격에서 한 번 붙들고, 더 끌면 넘어간다. */
export function dragSeam(seam: Seam, origin: Partial<Record<Part, BoxConfig>>, start: PartEdits, d: number): { edits: PartEdits; clamped: boolean; wall: SeamWall } {
  const now = applyPartEdits(origin, start)
  const [lo, hi] = seamRange(seam, origin, now)
  const [hardLo, hardHi] = seamRange(seam, origin, now, SEAM_HARD_FLOOR)
  let used = d, wall: SeamWall = 'free'
  if (d > hi) { if (d <= hi + SEAM_HOLD) { used = hi; wall = 'held' } else { used = Math.min(hardHi, d - SEAM_HOLD); wall = used < d - SEAM_HOLD - 1e-9 ? 'hard' : 'past' } }
  else if (d < lo) { if (d >= lo - SEAM_HOLD) { used = lo; wall = 'held' } else { used = Math.max(hardLo, d + SEAM_HOLD); wall = used > d + SEAM_HOLD + 1e-9 ? 'hard' : 'past' } }
  let edits = start
  // 처음부터 선 하나인 칸(ㅣ · ㅡ, 폭 0.03 아래)은 줄일 몫이 없어 칸째로 옮긴다(줄이면 폭이 0 아래로 간다).
  const thin = (part: Part) => sizeOn(origin[part]!, seam.axis) < 0.03
  const lo0 = seam.axis === 'v' ? 0 : 2, hi0 = seam.axis === 'v' ? 1 : 3
  for (const part of seam.a) { edits = addEdit(edits, part, hi0, used); if (thin(part)) edits = addEdit(edits, part, lo0, used) }
  for (const part of seam.b) { edits = addEdit(edits, part, lo0, used); if (thin(part)) edits = addEdit(edits, part, hi0, used) }
  return { edits, clamped: wall === 'hard', wall }
}

/**
 * 부위 칸을 통째로 옮기되 다른 부위와 겹치지 않게 멈춘다(가로 먼저, 다음 세로). 글자 끝(0.02~0.98)도 넘지 않는다.
 * 처음부터 겹쳐 있는 칸(섞임홀자의 첫닿자 ↔ 가로 쪽 등)은 벽으로 치지 않는다.
 */
export function moveApart(boxes: Partial<Record<Part, BoxConfig>>, part: Part, du: number, dv: number): { du: number; dv: number } {
  const p = boxes[part]
  if (!p) return { du: 0, dv: 0 }
  const others = (Object.entries(boxes) as [Part, BoxConfig][]).filter(([key, box]) => key !== part && box && editKey(key) !== editKey(part) && !(part.startsWith('JU') && key.startsWith('JU')))
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6
  const [x0, y0, x1, y1] = rectOf(p)
  let lo = SIMS_LO - x0, hi = SIMS_HI - x1
  for (const [, q] of others) {
    const [qx0, qy0, qx1, qy1] = rectOf(q)
    if (!overlap(y0, y1, qy0, qy1) || overlap(x0, x1, qx0, qx1)) continue
    if (qx0 >= x1) hi = Math.min(hi, qx0 - x1)
    else lo = Math.max(lo, qx1 - x0)
  }
  const u = Math.max(Math.min(lo, 0), Math.min(Math.max(hi, 0), du))
  const nx0 = x0 + u, nx1 = x1 + u
  let vlo = SIMS_LO - y0, vhi = SIMS_HI - y1
  for (const [, q] of others) {
    const [qx0, qy0, qx1, qy1] = rectOf(q)
    if (!overlap(nx0, nx1, qx0, qx1) || overlap(y0, y1, qy0, qy1)) continue
    if (qy0 >= y1) vhi = Math.min(vhi, qy0 - y1)
    else vlo = Math.max(vlo, qy1 - y0)
  }
  const v = Math.max(Math.min(vlo, 0), Math.min(Math.max(vhi, 0), dv))
  return { du: u, dv: v }
}
/** 부위 칸 하나를 옮긴 편집. */
export function movePartEdit(edits: PartEdits, part: Part, du: number, dv: number): PartEdits {
  return addEdit(addEdit(addEdit(addEdit(edits, part, 0, du), part, 1, du), part, 2, dv), part, 3, dv)
}

// ── 도트판 인상 잡기(하니무스 2026-11-21): 판 둘(틀 · 획), 값마다 0~20칸(한 칸 = 5) ──

/**
 * 판 둘(고양이 흐름 다시 보기 · 정할 것 1, 하니무스 2026-11-21 19:18 승인). 버전 1 글로벌 스타일 탭처럼 틀과 획으로 가른다.
 * 틀 판: 크기 · 비율 · 닿자 크기 · 탈네모 · 윗선 들쭉날쭉, 맨 끝에 무게중심. 획 판: 굵기 · 획 대비 · 둥글기 · 붓촉.
 * 폭 · 키는 비율 한 줄(`frame`)로 합쳤다. 크기가 키를, 비율이 폭을 정한다.
 */
export const FRAME_KEYS = ['size', 'frame', 'jamo', 'open', 'jag', 'center'] as const
export const INK_KEYS = ['weight', 'contrast', 'round', 'nib'] as const
export const DOT_KEYS = [...FRAME_KEYS, ...INK_KEYS] as const
export type DotKey = (typeof DOT_KEYS)[number]
export const DOT_ROWS = 20
const half = DOT_ROWS / 2
/**
 * 눈금(거북이 방향안 2·3차): 양 끝 = 가장 멀리 간 목표 폰트, 칸 10 = 폰트 분포 가운데. 노토(엔진)는 줄 위 작은 표시일 뿐 영점이 아니다(R033).
 * 값은 노토에 곱하는 배율로 바꿔 둔다(폰트에서 잰 양 ÷ 노토의 양). 예: 크기 0.75 · 0.92 · 1.00 em ÷ 노토 0.905.
 */
export const DOT_SCALE: Partial<Record<DotKey, readonly [number, number, number]>> = {
  // 굵기(줄기 ÷ 키) 0.042 · 0.075 ÷ 노토 0.072 = 두께 0.58 · 1.04배를 굵기 값(400에 곱하는 비율)으로. 위 끝은 엔진 끝(900).
  // 0.22(가석원)는 안쪽으로 굵어지기가 들어와야 닿는다.
  weight: [weightRatioOfThickness(0.58), weightRatioOfThickness(1.04), LOOK_WALL.weight[1]],
  size: [0.83, 1.02, 1.105],
  // 비율(가로 ÷ 세로) 0.78 · 0.95 · 1.15 ÷ 노토 0.93
  frame: [0.84, 1.02, 1.24],
  // 닿자 크기(ㅇ 높이 ÷ 기둥) 0.40 · 0.64 · 1.00 ÷ 노토 0.73
  jamo: [0.55, 0.88, 1.37],
  center: [-1, 0, 1],
  // 붓촉: ㅅ 왼 ÷ 오른 빗금 1.15 · 1.00 · 0.71
  nib: [-0.08, 0, 0.19],
}
/** 두께 배율(400 대비) → 굵기 값 비율. 굵기 값과 두께는 곧은 비례가 아니다(`weightToMultiplier`). */
function weightRatioOfThickness(t: number): number {
  let lo = 100, hi = 900
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (weightToMultiplier(mid) < t * weightToMultiplier(400)) lo = mid; else hi = mid }
  return lo / 400
}
/** 획 대비는 엔진 값(−1 ~ 1)이 아니라 가로 ÷ 세로 굵기로 눈금을 둔다: 1.46(나눔펜, 가로가 더 굵음) · 0.83(고딕 가운데) · 0.32. */
const CONTRAST_RATIO = [1.46, 0.83, 0.32] as const
/** 가로 ÷ 세로 굵기 → 엔진 대비 값(`contrastWidthOf`의 거꾸로: + 쪽 세로 1 + 0.8c · 가로 1 − 0.45c, − 쪽 ±0.5c). */
export function contrastOfRatio(r: number): number {
  return r <= 1 ? (1 - r) / (0.8 * r + 0.45) : -2 * (r - 1) / (r + 1)
}
const twoSided = (t: number, [lo, mid, hi]: readonly [number, number, number]) => (t <= half ? lo + (mid - lo) * t / half : mid + (hi - mid) * (t - half) / half)
/** 칸 수(0~20) → 값. */
export function dotToLook(key: DotKey, k: number): number {
  const t = Math.max(0, Math.min(DOT_ROWS, k))
  const scale = DOT_SCALE[key]
  if (scale) return twoSided(t, scale)
  if (key === 'contrast') return contrastOfRatio(twoSided(t, CONTRAST_RATIO))
  // 탈네모: 0이 네모(엔진 그대로), 올릴수록 받침 없는 글자가 짧아진다(Dongle 0.48까지).
  if (key === 'open') return 1 - (1 - LOOK_WALL.open[0]) * t / DOT_ROWS
  // 윗선 들쭉날쭉: 0이 노토 그대로(0.027), 끝이 개구(0.090).
  if (key === 'jag') return LOOK_WALL.jag[0] + (LOOK_WALL.jag[1] - LOOK_WALL.jag[0]) * t / DOT_ROWS
  return LOOK_WALL.round[1] * t / DOT_ROWS
}
/** 값 → 칸 수(가장 가까운 칸). */
export function lookToDot(key: DotKey, value: number): number {
  let best = 0, gap = Infinity
  for (let k = 0; k <= DOT_ROWS; k++) { const d = Math.abs(dotToLook(key, k) - value); if (d < gap - 1e-9) { gap = d; best = k } }
  return best
}
export const dotsOf = (look: Look, keys: readonly DotKey[] = DOT_KEYS): number[] => keys.map((key) => lookToDot(key, lookOf(look, key)))
/** 노토(엔진 그대로)가 줄의 어느 칸에 있나. 줄 위에 작은 표시로만 그린다. */
export const notoDot = (key: DotKey) => lookToDot(key, LOOK_ENGINE[key])

/**
 * 붓촉(거북이 방향안 4차: 목표 15개 중 7개에 필요, 획 대비와는 따로 움직인다). 기운 붓으로 쓴 것처럼 오른 내림(↘)은 굵게, 왼 삐침(↙)은 가늘게.
 * 획마다 보이는 방향 φ(글자 단위)의 sin 2φ만큼 굵기를 `1 + nib × sin 2φ`배. 가로 · 세로(sin 2φ = 0)는 그대로라 획 대비와 겹치지 않는다.
 * 엔진의 납작 붓(타원 붓촉)은 둥글기 · 대비와 같이 못 써서, 이 값은 획 굵기로 흉내 낸다.
 */
export function nibSyllable(syllable: DecomposedSyllable, nib: number, boxes: Partial<Record<Part, BoxConfig>>): DecomposedSyllable {
  if (nib === 0) return syllable
  const tilt = (jamo: JamoData | null, part: Part): JamoData | null => {
    if (!jamo) return jamo
    const box = boxes[part] ?? (part === 'JU' ? boxes.JU_V ?? boxes.JU_H : undefined)
    if (!box) return jamo
    return mapGroups(jamo, (strokes) => strokes.map((stroke) => {
      if (stroke.closed || stroke.points.length < 2) return stroke
      let sum = 0, total = 0
      for (let i = 1; i < stroke.points.length; i++) {
        const dx = (stroke.points[i].x - stroke.points[i - 1].x) * box.width, dy = (stroke.points[i].y - stroke.points[i - 1].y) * box.height
        const len = Math.hypot(dx, dy)
        if (len < 1e-6) continue
        sum += 2 * dx * dy / len; total += len // len × sin 2φ
      }
      const f = total > 0 ? 1 + nib * sum / total : 1
      return Math.abs(f - 1) < 1e-4 ? stroke : { ...stroke, thickness: stroke.thickness * f }
    }))
  }
  return { ...syllable, choseong: tilt(syllable.choseong, 'CH'), jungseong: tilt(syllable.jungseong, 'JU'), jongseong: tilt(syllable.jongseong, 'JO') }
}

// ── 풍선 닿자(하니무스 2026-11-21): 닿자가 커지다 옆 획에 닿을 만큼 가까워지면 서로 밀어내 최소 틈을 지킨다 ──

/** 획 사이 최소 틈(em) 고르기. 사용자가 정한다. */
// 눈으로 차이가 보이게 벌린다(다람쥐 세 번째 맞추기: 0.01 · 0.025 · 0.045는 거의 같아 보임).
export const BALLOON_GAPS = { narrow: 0.012, normal: 0.04, wide: 0.08 } as const
export type BalloonGap = keyof typeof BALLOON_GAPS
type PairKey = 'CH-JU' | 'JU-JO' | 'CH-JO'
type Near = { gap: number; dx: number; dy: number }

/** 모든 자소 쌍이 최소 틈을 지키나(풍선 닿자가 막히는 기준). */
export function balloonOk(near: Partial<Record<PairKey, Near>>, target: Partial<Record<PairKey, number>>): boolean {
  return (Object.entries(target) as [PairKey, number][]).every(([pair, want]) => (near[pair]?.gap ?? Infinity) >= want - 0.003)
}

/** 획 하나의 두께 배율 열쇠(부위 + 획 id). */
export const strokeKey = (part: Part, id: string) => `${part}:${id}`
type Thick = number | Partial<Record<Part, number>> | Readonly<Record<string, number>>

/** 풍선 닿자의 획: 첫닿자 · 받침 획 두께를 키운다. 숫자 하나면 둘 다, 부위별(`CH`·`JO`)이면 따로, `strokeKey` 열쇠면 획마다 따로. */
export function inflateSyllable(syllable: DecomposedSyllable, k: Thick): DecomposedSyllable {
  const of = (part: Part, id: string): number => {
    if (typeof k === 'number') return k
    const byStroke = (k as Record<string, number>)[strokeKey(part, id)]
    return byStroke ?? (k as Partial<Record<Part, number>>)[part] ?? 1
  }
  if (typeof k === 'number' ? k === 1 : Object.keys(k).length === 0) return syllable
  const inflate = (jamo: JamoData | null, part: Part): JamoData | null => {
    if (!jamo) return jamo
    const fat = (strokes?: StrokeDataV2[]) => strokes?.map((stroke) => { const f = of(part, stroke.id); return f === 1 ? stroke : { ...stroke, thickness: stroke.thickness * f } })
    return {
    ...jamo,
    strokes: fat(jamo.strokes), horizontalStrokes: fat(jamo.horizontalStrokes), verticalStrokes: fat(jamo.verticalStrokes),
    contextStrokes: jamo.contextStrokes && Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, strokes]) => [family, fat(strokes)])),
    }
  }
  return { ...syllable, choseong: inflate(syllable.choseong, 'CH'), jongseong: inflate(syllable.jongseong, 'JO') }
}

/** 첫닿자 · 받침의 획 id(두께를 획마다 따로 키울 때 쓴다). */
export function balloonStrokeIds(syllable: DecomposedSyllable): Partial<Record<Part, string[]>> {
  const ids = (jamo: JamoData | null) => jamo ? [...new Set([...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? []), ...Object.values(jamo.contextStrokes ?? {}).flat()].map((stroke) => stroke.id))] : []
  return { CH: ids(syllable.choseong), JO: ids(syllable.jongseong) }
}

/** 풍선 닿자 획이 칸보다 얼마나 더 두꺼워지나: 닿자가 k배면 획은 1 + (k − 1) × 이 값. */
export const BALLOON_THICK_GAIN = 2.5

/**
 * 풍선 닿자(하니무스 2026-11-21 "닿자끼리 닿을 만큼 가까워져야 막힌다, 획은 더 두꺼워져도 된다").
 * 첫닿자 · 받침 칸의 네 변과 획 하나하나의 두께를 조금씩(`steps`번) 같이 키운다. 한 걸음 키웠을 때 잉크 사이 최소 틈을 못 지키면
 * 그 변(또는 그 획 두께)만 멈추고 나머지는 계속 부푼다. 보이지 않는 벽은 없다 — 글자 끝도 `ok`가 잉크로 본다.
 * `ok(boxes, thick)`가 틈 검사, thick 열쇠는 `strokeKey`.
 */
export function growSides(boxes: Partial<Record<Part, BoxConfig>>, k: number, strokeIds: Partial<Record<Part, string[]>>, ok: (boxes: Partial<Record<Part, BoxConfig>>, thick: Record<string, number>) => boolean, steps = 8, layout?: LayoutType): { boxes: Partial<Record<Part, BoxConfig>>; thick: Record<string, number> } {
  const out = { ...boxes }
  const thick: Record<string, number> = {}
  if (k <= 1) return { boxes: out, thick }
  const parts = (['CH', 'JO'] as const).filter((part) => out[part])
  const open = new Set<string>()
  for (const part of parts) {
    for (const side of ['l', 'r', 't', 'b']) open.add(part + side)
    for (const id of strokeIds[part] ?? []) { thick[strokeKey(part, id)] = 1; open.add(strokeKey(part, id)) }
  }
  for (let step = 1; step <= steps; step++) {
    const wantThick = 1 + (k - 1) * BALLOON_THICK_GAIN * step / steps
    for (const part of parts) {
      for (const id of strokeIds[part] ?? []) {
        const key = strokeKey(part, id)
        if (!open.has(key)) continue
        const trial = { ...thick, [key]: wantThick }
        if (ok(out, trial)) thick[key] = wantThick
        else open.delete(key)
      }
      const o = boxes[part]!
      // 변마다 몫은 밀림 공식대로(안쪽 3/4 · 바깥 1/4). 짜임을 모르면 반반.
      const inner = layout ? innerSides(part, layout) : []
      for (const side of ['t', 'b', 'l', 'r'] as const) {
        if (!open.has(part + side)) continue
        const share = sideShare(inner, side)
        const dx = o.width * (k - 1) * share / steps, dy = o.height * (k - 1) * share / steps
        const b = out[part]!
        const next = side === 'l' ? { ...b, x: b.x - dx, width: b.width + dx }
          : side === 'r' ? { ...b, width: b.width + dx }
          : side === 't' ? { ...b, y: b.y - dy, height: b.height + dy }
          : { ...b, height: b.height + dy }
        const trial = { ...out, [part]: next }
        if (ok(trial, thick)) out[part] = next
        else open.delete(part + side)
      }
    }
  }
  return { boxes: out, thick }
}
