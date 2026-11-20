import type { BoxConfig, LayoutType, Part } from '../src/types'

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
export interface Look { weight?: number; soft?: number; frame?: number; tracking?: number; size?: number; height?: number }
export type Dir = 'up' | 'down' | 'left' | 'right' | 'ul' | 'ur' | 'dl' | 'dr'
export interface RegionLabels { name: string; up: string; down: string; left: string; right: string }

/**
 * 획 · 전체 값의 한계선.
 * 굵기는 기본 굵기(400)에 곱하는 비율이라 엔진이 그리는 100~900 전체(두께 ×0.40~1.95)가 들어오게 0.25~2.25(다람쥐 검수 2026-11-21 "굵기 폭 넓히기").
 * 크기 · 키 · 폭은 글자 가운데를 두고 늘이고 줄인다. 값은 아직 임시다.
 */
export const LOOK_WALL = { weight: [0.25, 2.25], soft: [0, 1], frame: [0.7, 1.25], tracking: [-0.08, 0.2], size: [0.6, 1.15], height: [0.7, 1.15] } as const
const LOOK_ENGINE = { weight: 1, soft: 0, frame: 1, tracking: 0, size: 1, height: 1 } as const
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

/** 전체 값(폭 · 키 · 크기)을 칸에 입힌다. 모두 글자 가운데(0.5, 0.5)를 두고 늘이고 줄인다. */
export function lookBoxes(boxes: Partial<Record<Part, BoxConfig>>, look: Look): Partial<Record<Part, BoxConfig>> {
  const sx = lookOf(look, 'frame') * lookOf(look, 'size'), sy = lookOf(look, 'height') * lookOf(look, 'size')
  if (sx === 1 && sy === 1) return boxes
  const out: Partial<Record<Part, BoxConfig>> = {}
  for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) {
    if (box) out[part] = { ...box, x: 0.5 + (box.x - 0.5) * sx, y: 0.5 + (box.y - 0.5) * sy, width: box.width * sx, height: box.height * sy }
  }
  return out
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
export function seamRange(seam: Seam, origin: Partial<Record<Part, BoxConfig>>, now: Partial<Record<Part, BoxConfig>>): [number, number] {
  let lo = -Infinity, hi = Infinity
  for (const part of seam.a) {
    const o = sizeOn(origin[part]!, seam.axis), c = sizeOn(now[part]!, seam.axis)
    if (o < 0.03) continue
    lo = Math.max(lo, NEIGHBOR_FLOOR * o - c); hi = Math.min(hi, OWN_RANGE[1] * o - c)
  }
  for (const part of seam.b) {
    const o = sizeOn(origin[part]!, seam.axis), c = sizeOn(now[part]!, seam.axis)
    if (o < 0.03) continue
    lo = Math.max(lo, c - OWN_RANGE[1] * o); hi = Math.min(hi, c - NEIGHBOR_FLOOR * o)
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
/** 보선을 d(글자 단위)만큼 민 편집. 범위 밖이면 범위 끝까지. */
export function dragSeam(seam: Seam, origin: Partial<Record<Part, BoxConfig>>, start: PartEdits, d: number): { edits: PartEdits; clamped: boolean } {
  const [lo, hi] = seamRange(seam, origin, applyPartEdits(origin, start))
  const used = Math.max(lo, Math.min(hi, d))
  let edits = start
  for (const part of seam.a) edits = addEdit(edits, part, seam.axis === 'v' ? 1 : 3, used)
  for (const part of seam.b) edits = addEdit(edits, part, seam.axis === 'v' ? 0 : 2, used)
  return { edits, clamped: Math.abs(used - d) > 1e-9 }
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
