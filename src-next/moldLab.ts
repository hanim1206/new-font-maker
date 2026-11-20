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
