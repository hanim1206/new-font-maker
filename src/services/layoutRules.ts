import type { BoxConfig, Padding } from '../types'
import { BRANCH_INSET_BY_PAIR, CHO_RIGHT_BY_JUNG, CHO_RIGHT_BY_PAIR, JONG_RIGHT_BY_CHO } from './layoutRuleResiduals'
import type { JamoShapeFeatures } from './jamoShapeFeatures'
import { choBottomNoFinal } from './layoutRuleFormulas'
import { BRANCH_INSET_BY_CHO, BRANCH_INSET_BY_JUNG, CHO_GAP, CHO_TARGET, CHO_TOP_BY_JONG, CHO_TOP_BY_JUNG, JONG_GAP_OFFSET, JONG_LEFT_BY_JUNG, JONG_RIGHT_BY_JUNG, JONG_TARGET, JONG_TOP_BY_CHO, JUNG_TARGET, PILLAR_BOTTOM_NO_FINAL } from './layoutRuleTargets'

/**
 * 배치 규칙 — 노토 변화량 모델 대신, 자모의 실제 잉크를 보고 상자를 움직이는 규칙 셋.
 * 출발은 Split + Padding 스키마 상자이고, 규칙은 글자 몸 안에서만 움직인다. 한계에 닿으면 멈추고 표시한다.
 * 실험실(`/layout-rules`)이 노토와 견줘 채점한다. 플랜: docs/plans/2026-11-08_배치-규칙-역추론-실험.md
 *
 * 규칙은 잉크를 직접 재지 않는다. `measure`가 상자를 받아 부품별 잉크 바깥면과 줄기 두께를 돌려주고, 규칙은 그 값으로만 움직인다.
 * 그래서 함수는 순수하고 단위 테스트는 가짜 자로 잰다.
 */

export type RulePart = 'CH' | 'JU' | 'JO'
export const RULE_PARTS: readonly RulePart[] = ['CH', 'JU', 'JO']

/** 잉크 바깥면(em, 0~1, y는 아래로). */
export interface InkBounds { left: number; right: number; top: number; bottom: number }
/** 한 부품의 잉크. 두께는 줄기 두께(em). */
export interface RulePartInk { bounds: InkBounds; thickness: number }
export type RuleBoxes = Partial<Record<RulePart, BoxConfig>>
export type RuleInk = Partial<Record<RulePart, RulePartInk>>
/** 상자를 주면 그 자리에 그린 잉크를 재서 돌려주는 자. */
export type RuleMeasure = (boxes: RuleBoxes) => RuleInk

/** 글자 몸. 규칙은 이 밖으로 못 나간다. */
export interface RuleBody { left: number; right: number; top: number; bottom: number }

export type LayoutRuleId = 'faces' | 'choTable' | 'jungTable' | 'jongTable' | 'choBottom' | 'pillar' | 'gap'
/**
 * 적용 순서: 상자를 잉크 바깥면으로 읽기 → 첫닿자 표 → 홀자 표 → 받침 표 → 첫닿자 아래는 받침 윗면에서 → 홀자 기둥 위아래 → 획 사이 최소 틈.
 * 1차(박스 일치)는 자모별 표가 네 변을 정하고, 관계 규칙 둘(첫닿자 아래 · 기둥 끝)이 받침 윗면에 기대어 움직인다.
 */
export const LAYOUT_RULE_ORDER: readonly LayoutRuleId[] = ['faces', 'choTable', 'jungTable', 'jongTable', 'choBottom', 'pillar', 'gap']
export const LAYOUT_RULE_LABEL: Record<LayoutRuleId, string> = {
  faces: '상자를 잉크 바깥면으로 읽기',
  choTable: '첫닿자 표 — 왼 · 오른 · 위',
  jungTable: '홀자 표 — 왼 · 오른',
  jongTable: '받침 표 — 네 변',
  choBottom: '첫닿자 아래 = 받침 윗면 − 틈',
  pillar: '홀자 기둥 — 몸 위에서 받침 윗면 옆까지',
  gap: '획 사이 최소 틈',
}

/** 글자의 자모. 표 규칙(첫닿자 · 홀자 · 받침)이 쓴다. 없으면 그 규칙들은 건너뛴다. */
export interface RuleJamo { cho: string; jung: string; jong: string }

/**
 * 표의 목표값은 노토 몸통(왼 .05 · 오른 .89 · 위 .05 · 아래 .96)에서 잰 잉크 바깥면(em)이다. 다른 글자 몸에서는 몸 안의 비율로 옮겨 쓴다.
 * 값은 `layoutRuleTargets.ts`(지금 모델이 기본 획으로 그린 잉크의 자모별 가운데값, 4788자).
 */
export const RULE_REFERENCE_BODY: RuleBody = { left: 0.05, right: 0.89, top: 0.05, bottom: 0.96 }
export const DOUBLE_CONSONANTS: ReadonlySet<string> = new Set(['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'])
export const TWO_STEM_VOWELS: ReadonlySet<string> = new Set(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ'])
/** 왼가지가 있는 홀자. 왼면이 첫닿자 오른면에 기대어 정해진다. */
export const LEFT_BRANCH_VOWELS: ReadonlySet<string> = new Set(['ㅓ', 'ㅕ', 'ㅔ', 'ㅖ'])

export interface LayoutRuleParams {
  rules: Record<LayoutRuleId, boolean>
  /** 최소 틈 = 양쪽 줄기 두께 평균 × k. 10-02 관측값 0.25에서 출발. */
  k: number
  /** 표에 없는 첫닿자일 때 첫닿자 아래 = 받침 윗면 − 두께 × m. */
  m: number
  /** 표 대신 공식(G0): 공식이 표와 같은 점수를 낸 열(첫닿자 아래, 받침 없음)을 자모 생김새에서 낸다. 특징이 없으면 표로 간다. */
  formulas: boolean
}

/** 공식에 쓰는 자모 생김새 특징. */
export interface RuleFeatures { cho?: JamoShapeFeatures | null; jong?: JamoShapeFeatures | null }

export const DEFAULT_LAYOUT_RULE_PARAMS: LayoutRuleParams = {
  rules: { faces: true, choTable: true, jungTable: true, jongTable: true, choBottom: true, pillar: true, gap: false },
  k: 0.25,
  m: 0.6,
  formulas: false,
}

export interface LayoutRuleStep {
  rule: LayoutRuleId
  part: RulePart
  before: BoxConfig
  after: BoxConfig
  /** 글자 몸이나 최소 높이에 막혀 목표까지 못 갔다. */
  limited: boolean
  note: string
}

export interface LayoutRuleResult {
  boxes: RuleBoxes
  steps: LayoutRuleStep[]
  limited: boolean
}

const EPSILON = 1e-9
/** 받침 · 홀자가 이보다 낮아지게는 안 줄인다(em). */
const MIN_PART_HEIGHT = 0.08

/** Split + Padding 스키마의 여백 → 글자 몸. */
export function bodyOfPadding(padding: Padding | undefined): RuleBody {
  const p = padding ?? { top: 0, bottom: 0, left: 0, right: 0 }
  return { left: p.left, right: 1 - p.right, top: p.top, bottom: 1 - p.bottom }
}

const clone = (box: BoxConfig): BoxConfig => ({ ...box })
const shifted = (box: BoxConfig, dx: number, dy: number): BoxConfig => ({ ...box, x: box.x + dx, y: box.y + dy })
const shiftedBounds = (bounds: InkBounds, dx: number, dy: number): InkBounds => ({ left: bounds.left + dx, right: bounds.right + dx, top: bounds.top + dy, bottom: bounds.bottom + dy })

/**
 * 잉크의 위 · 아래 끝이 목표 자리에 오도록 상자를 세로로 옮기고 늘인다.
 * 잉크가 상자에 선형으로 따라온다고 보고 계산한다(획 두께는 안 변하므로 조금 어긋날 수 있다 — 다음 규칙이 다시 잰다).
 */
export function fitBoxToVerticalInk(box: BoxConfig, ink: InkBounds, target: { top: number; bottom: number }): BoxConfig {
  const inkHeight = ink.bottom - ink.top
  if (inkHeight < EPSILON) return shifted(box, 0, target.top - ink.top)
  const scale = (target.bottom - target.top) / inkHeight
  return { ...box, y: target.top - (ink.top - box.y) * scale, height: box.height * scale }
}

/** 이동량을 글자 몸 안으로 자른다. 잘렸으면 limited. */
function clampShift(bounds: InkBounds, body: RuleBody, dx: number, dy: number): { dx: number; dy: number; limited: boolean } {
  let limited = false
  let x = dx
  let y = dy
  if (bounds.left + x < body.left - EPSILON) { x = body.left - bounds.left; limited = true }
  if (bounds.right + x > body.right + EPSILON) { x = body.right - bounds.right; limited = true }
  if (bounds.top + y < body.top - EPSILON) { y = body.top - bounds.top; limited = true }
  if (bounds.bottom + y > body.bottom + EPSILON) { y = body.bottom - bounds.bottom; limited = true }
  return { dx: x, dy: y, limited }
}

const meanThickness = (a: RulePartInk, b: RulePartInk) => (a.thickness + b.thickness) / 2
const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPSILON
const fixed = (value: number) => value.toFixed(3)

/** 잉크의 왼 · 오른 끝이 목표 자리에 오도록 상자를 가로로 옮기고 늘인다. */
export function fitBoxToHorizontalInk(box: BoxConfig, ink: InkBounds, target: { left: number; right: number }): BoxConfig {
  const inkWidth = ink.right - ink.left
  if (inkWidth < EPSILON) return shifted(box, target.left - ink.left, 0)
  const scale = (target.right - target.left) / inkWidth
  return { ...box, x: target.left - (ink.left - box.x) * scale, width: box.width * scale }
}

/** 잉크의 네 바깥면이 목표 네모에 오도록 상자를 옮기고 늘인다(두 축). */
export function fitBoxToInk(box: BoxConfig, ink: InkBounds, target: InkBounds): BoxConfig {
  return fitBoxToHorizontalInk(fitBoxToVerticalInk(box, ink, target), ink, target)
}

/**
 * 규칙 0 · 상자를 잉크 바깥면으로 읽기 — Split + Padding 상자는 중심선 상자라 잉크가 반 두께만큼 밖으로 나온다.
 * 노토 모델 상자(잉크 바깥면에서 안으로 들인 것)와 같은 뜻이 되도록, 잉크 바깥면이 스키마 상자 네 변에 오게 맞춘다.
 * 홀자는 세로만 맞추고 가로는 오른면만 맞춘다(기둥이 오른쪽에 서고 곁줄기 길이는 늘이지 않는다).
 */
function applyFaces(boxes: RuleBoxes, ink: RuleInk): LayoutRuleStep[] {
  const steps: LayoutRuleStep[] = []
  for (const part of RULE_PARTS) {
    const box = boxes[part]
    const measured = ink[part]
    if (!box || !measured) continue
    const target: InkBounds = { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height }
    const after = part === 'JU'
      ? shifted(fitBoxToVerticalInk(box, measured.bounds, target), target.right - measured.bounds.right, 0)
      : fitBoxToInk(box, measured.bounds, target)
    steps.push({ rule: 'faces', part, before: clone(box), after, limited: false, note: `잉크 ${fixed(measured.bounds.left)}~${fixed(measured.bounds.right)} × ${fixed(measured.bounds.top)}~${fixed(measured.bounds.bottom)} → 상자 변` })
    boxes[part] = after
  }
  return steps
}

/** 노토 몸통 기준 em 값을 이 글자 몸의 같은 비율 자리로 옮긴다. */
const atX = (body: RuleBody, value: number) => body.left + (value - RULE_REFERENCE_BODY.left) / (RULE_REFERENCE_BODY.right - RULE_REFERENCE_BODY.left) * (body.right - body.left)
const atY = (body: RuleBody, value: number) => body.top + (value - RULE_REFERENCE_BODY.top) / (RULE_REFERENCE_BODY.bottom - RULE_REFERENCE_BODY.top) * (body.bottom - body.top)
const scaleY = (body: RuleBody) => (body.bottom - body.top) / (RULE_REFERENCE_BODY.bottom - RULE_REFERENCE_BODY.top)
const scaleX = (body: RuleBody) => (body.right - body.left) / (RULE_REFERENCE_BODY.right - RULE_REFERENCE_BODY.left)

/**
 * 규칙 A · 첫닿자 표 — 왼 · 오른 · 위는 첫닿자별 표. 윗면에는 받침별 치우침(낮은 ㄴ 받침이면 첫닿자가 내려온다)과 홀자별 잔차를 더한다.
 * 기둥이 둘인 홀자(ㅐ ㅒ ㅔ ㅖ) 옆에서는 폭이 표의 비율로 준다(왼면 기준).
 * 아래는 받침이 있으면 그대로 두고(규칙 D가 받침 윗면에서 정한다), 없으면 표의 받침 없는 아래.
 */
function applyChoTable(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo, formula: JamoShapeFeatures | null): LayoutRuleStep | null {
  const box = boxes.CH
  const ch = ink.CH
  const target = CHO_TARGET[jamo.cho]
  if (!box || !ch || !target) return null
  const twoStem = TWO_STEM_VOWELS.has(jamo.jung)
  const twoStemScale = target.twoStemScale
  const width = (target.right - target.left) * (twoStem ? twoStemScale : 1)
  const byJong = jamo.jong ? (CHO_TOP_BY_JONG[jamo.jong] ?? 0) : 0
  const top = target.top + byJong + (CHO_TOP_BY_JUNG[jamo.jung] ?? 0)
  const widen = (CHO_RIGHT_BY_JUNG[jamo.jung] ?? 0) + (CHO_RIGHT_BY_PAIR[jamo.cho + jamo.jung] ?? 0)
  const bottomNoFinal = formula ? choBottomNoFinal(formula) : target.bottomNoFinal
  const goal: InkBounds = { left: atX(body, target.left), right: atX(body, target.left + width + widen), top: atY(body, top), bottom: ink.JO ? ch.bounds.bottom : atY(body, bottomNoFinal) }
  const after = fitBoxToInk(box, ch.bounds, goal)
  return { rule: 'choTable', part: 'CH', before: clone(box), after, limited: false, note: `${jamo.cho}${formula ? ' · 공식' : ''}${twoStem ? ' · 두 기둥 옆 ×' + fixed(twoStemScale) : ''} — 가로 ${fixed(goal.left)}~${fixed(goal.right)}, 윗면 ${fixed(ch.bounds.top)} → ${fixed(goal.top)}` }
}

/**
 * 규칙 B · 홀자 표 — 오른면은 홀자별 표. 왼면은 둘로 갈린다:
 * 왼가지 홀자(ㅓ ㅕ ㅔ ㅖ)는 첫닿자 오른면 + 첫닿자별 파고듦(오른쪽이 열린 ㄴ은 깊이, 닫힌 ㄹ은 틈을 두고) + 홀자별 잔차.
 * 나머지(ㅏ ㅑ ㅐ ㅒ ㅣ)는 홀자별 표, 첫닿자가 쌍자음이면 쌍자음 옆 값. ㅔ ㅖ는 왼 기둥이 밀린 만큼의 일정 비율로 기둥도 따라간다. 세로는 그대로.
 */
function applyJungTable(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo): LayoutRuleStep | null {
  const box = boxes.JU
  const ju = ink.JU
  const target = JUNG_TARGET[jamo.jung]
  if (!box || !ju || !target) return null
  const double = DOUBLE_CONSONANTS.has(jamo.cho)
  const inset = LEFT_BRANCH_VOWELS.has(jamo.jung) && ink.CH ? BRANCH_INSET_BY_CHO[jamo.cho] : undefined
  const left = inset !== undefined && ink.CH
    ? ink.CH.bounds.right + scaleX(body) * (inset + (BRANCH_INSET_BY_JUNG[jamo.jung] ?? 0) + (BRANCH_INSET_BY_PAIR[jamo.cho + jamo.jung] ?? 0))
    : atX(body, double ? target.leftNextToDouble : target.left)
  // 왼가지 두 기둥 홀자(ㅔ ㅖ)는 왼 기둥이 밀리면 기둥도 그 비율만큼 같이 밀린다(모델에서 잰 기울기).
  const follows = inset !== undefined && TWO_STEM_VOWELS.has(jamo.jung) ? target.rightFollowsLeft : 0
  const right = atX(body, target.right) + follows * (left - atX(body, target.left))
  const after = fitBoxToHorizontalInk(box, ju.bounds, { left, right })
  const how = inset !== undefined ? `왼가지 — 첫닿자 오른면 ${fixed(ink.CH!.bounds.right)} ${inset < 0 ? '−' : '+'} ${fixed(Math.abs(inset))}` : double ? '쌍자음 옆' : '표'
  return { rule: 'jungTable', part: 'JU', before: clone(box), after, limited: false, note: `${jamo.jung} · ${how} — 가로 ${fixed(ju.bounds.left)}~${fixed(ju.bounds.right)} → ${fixed(left)}~${fixed(right)}` }
}

/** 규칙 C · 받침 표 — 네 변은 받침별 표. 왼 · 오른은 홀자별 치우침(ㅏ ㅑ 옆은 안쪽, ㅐ ㅔ 옆은 바깥), 윗면은 첫닿자별 치우침(키 큰 ㅎ이 받침을 아래로 민다)을 더한다. */
function applyJongTable(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo): LayoutRuleStep | null {
  const box = boxes.JO
  const jo = ink.JO
  const target = JONG_TARGET[jamo.jong]
  if (!box || !jo || !target) return null
  const goal: InkBounds = {
    left: atX(body, target.left + (JONG_LEFT_BY_JUNG[jamo.jung] ?? 0)),
    right: atX(body, target.right + (JONG_RIGHT_BY_JUNG[jamo.jung] ?? 0) + (JONG_RIGHT_BY_CHO[jamo.cho] ?? 0)),
    top: atY(body, target.top + (JONG_TOP_BY_CHO[jamo.cho] ?? 0)),
    bottom: atY(body, target.bottom),
  }
  const after = fitBoxToInk(box, jo.bounds, goal)
  return { rule: 'jongTable', part: 'JO', before: clone(box), after, limited: false, note: `${jamo.jong} — 윗면 ${fixed(jo.bounds.top)} → ${fixed(goal.top)}, 가로 ${fixed(goal.left)}~${fixed(goal.right)}` }
}

/** 규칙 D · 첫닿자 아래 = 받침 윗면 − 두께 × 틈. 틈은 첫닿자별 표(꼬리 있는 ㄱ ㅋ은 작고 네모난 ㅁ ㄴ은 크다) + 받침별 잔차(ㅎ ㅀ ㅊ처럼 꼭지가 솟은 받침은 음수). 표에 없으면 m. 받침이 없으면 건너뛴다. */
function applyChoBottom(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, params: LayoutRuleParams, jamo: RuleJamo | undefined): LayoutRuleStep | null {
  const box = boxes.CH
  const ch = ink.CH
  const jo = ink.JO
  if (!box || !ch || !jo) return null
  const baseGap = jamo ? CHO_GAP[jamo.cho] : undefined
  const gap = baseGap !== undefined ? baseGap + (JONG_GAP_OFFSET[jamo!.jong] ?? 0) : params.m
  let bottom = jo.bounds.top - meanThickness(ch, jo) * gap
  let limited = false
  if (bottom - ch.bounds.top < MIN_PART_HEIGHT) { bottom = ch.bounds.top + MIN_PART_HEIGHT; limited = true }
  if (bottom > body.bottom) { bottom = body.bottom; limited = true }
  const after = fitBoxToVerticalInk(box, ch.bounds, { top: ch.bounds.top, bottom })
  return { rule: 'choBottom', part: 'CH', before: clone(box), after, limited, note: `첫닿자 아래 ${fixed(ch.bounds.bottom)} → ${fixed(bottom)} (받침 윗면 ${fixed(jo.bounds.top)} − 두께 × ${fixed(gap)})` }
}

/**
 * 규칙 E · 홀자 기둥 — 위는 글자 몸 위. 아래는 받침이 있으면 받침 윗면 + 받침별 내려옴(표, 오른 위가 빈 ㄴ ㅅ은 아래로, 보통은 조금 위),
 * 없으면 표의 받침 없는 기둥 아래. 표에 없는 받침이면 받침 윗면 − 두께 × m.
 */
function applyPillar(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, params: LayoutRuleParams, jamo: RuleJamo | undefined): LayoutRuleStep | null {
  const box = boxes.JU
  const ju = ink.JU
  if (!box || !ju) return null
  const jo = ink.JO
  let bottom: number
  let source: string
  if (!jo) { bottom = jamo ? atY(body, PILLAR_BOTTOM_NO_FINAL) : body.bottom; source = '받침 없음' }
  else {
    const reach = jamo ? JONG_TARGET[jamo.jong]?.pillarReach : undefined
    bottom = reach !== undefined ? jo.bounds.top + reach * scaleY(body) : jo.bounds.top - meanThickness(ju, jo) * params.m
    source = reach !== undefined ? `받침 윗면 ${reach >= 0 ? '+' : ''}${fixed(reach)}` : `받침 윗면 − 두께 × ${fixed(params.m)}`
  }
  let limited = false
  if (bottom > body.bottom) { bottom = body.bottom; limited = true }
  if (bottom - body.top < MIN_PART_HEIGHT) { bottom = body.top + MIN_PART_HEIGHT; limited = true }
  const after = fitBoxToVerticalInk(box, ju.bounds, { top: body.top, bottom })
  return { rule: 'pillar', part: 'JU', before: clone(box), after, limited, note: `기둥 ${fixed(ju.bounds.top)}~${fixed(ju.bounds.bottom)} → ${fixed(body.top)}~${fixed(bottom)} (${source})` }
}

interface GapPair { a: RulePart; b: RulePart; axis: 'x' | 'y' }
/** 첫닿자–홀자는 가로 틈, 첫닿자–받침 · 홀자–받침은 세로 틈. 수직 방향으로 겹칠 때만 틈을 잰다. */
const GAP_PAIRS: readonly GapPair[] = [
  { a: 'CH', b: 'JU', axis: 'x' },
  { a: 'CH', b: 'JO', axis: 'y' },
  { a: 'JU', b: 'JO', axis: 'y' },
]

/** 규칙 1 · 획 사이 최소 틈 — 두 부품 잉크 사이가 두께 × k보다 좁으면 반반 밀어 벌린다. 한쪽이 몸에 막히면 남은 몫을 다른 쪽이 진다. */
function applyGap(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, params: LayoutRuleParams): LayoutRuleStep[] {
  const steps: LayoutRuleStep[] = []
  const bounds: Partial<Record<RulePart, InkBounds>> = {}
  for (const part of RULE_PARTS) if (ink[part]) bounds[part] = { ...ink[part]!.bounds }

  for (const { a, b, axis } of GAP_PAIRS) {
    const boxA = boxes[a]
    const boxB = boxes[b]
    const inkA = ink[a]
    const inkB = ink[b]
    const bA = bounds[a]
    const bB = bounds[b]
    if (!boxA || !boxB || !inkA || !inkB || !bA || !bB) continue
    const crossOverlap = axis === 'x' ? overlaps(bA.top, bA.bottom, bB.top, bB.bottom) : overlaps(bA.left, bA.right, bB.left, bB.right)
    if (!crossOverlap) continue
    const gap = axis === 'x' ? bB.left - bA.right : bB.top - bA.bottom
    const minGap = meanThickness(inkA, inkB) * params.k
    if (gap >= minGap - EPSILON) continue
    const need = minGap - gap
    const half = need / 2
    // a는 음의 방향, b는 양의 방향으로 반씩. 막힌 쪽 몫은 다른 쪽에 얹는다.
    const moveA = clampShift(bA, body, axis === 'x' ? -half : 0, axis === 'y' ? -half : 0)
    const gotA = axis === 'x' ? -moveA.dx : -moveA.dy
    const moveB = clampShift(bB, body, axis === 'x' ? need - gotA : 0, axis === 'y' ? need - gotA : 0)
    const gotB = axis === 'x' ? moveB.dx : moveB.dy
    let finalA = moveA
    if (gotB < need - gotA - EPSILON) {
      // b도 막혔으면 a가 더 물러난다.
      finalA = clampShift(bA, body, axis === 'x' ? -(need - gotB) : 0, axis === 'y' ? -(need - gotB) : 0)
    }
    const limited = finalA.limited && moveB.limited
    const label = `${a}–${b} 틈 ${fixed(gap)} → 최소 ${fixed(minGap)}`
    if (Math.abs(finalA.dx) > EPSILON || Math.abs(finalA.dy) > EPSILON) {
      const after = shifted(boxA, finalA.dx, finalA.dy)
      steps.push({ rule: 'gap', part: a, before: clone(boxA), after, limited, note: label })
      boxes[a] = after
      bounds[a] = shiftedBounds(bA, finalA.dx, finalA.dy)
    }
    if (Math.abs(moveB.dx) > EPSILON || Math.abs(moveB.dy) > EPSILON) {
      const after = shifted(boxB, moveB.dx, moveB.dy)
      steps.push({ rule: 'gap', part: b, before: clone(boxB), after, limited, note: label })
      boxes[b] = after
      bounds[b] = shiftedBounds(bB, moveB.dx, moveB.dy)
    }
    if (limited) {
      steps.push({ rule: 'gap', part: b, before: clone(boxB), after: clone(boxes[b]!), limited: true, note: `${label} — 글자 몸에 막힘` })
    }
  }
  return steps
}

/**
 * 규칙을 순서대로 먹인다. 규칙마다 상자를 다시 재서(`measure`) 앞 규칙이 옮긴 결과 위에서 움직인다.
 * 꺼진 규칙은 건너뛴다. 모든 규칙이 꺼져 있으면 출발 상자 그대로다.
 */
/** 다시 맞추기 횟수와 멈출 변화량(em). */
const REFIT_ROUNDS = 4
const REFIT_EPSILON = 0.0005
const boxShift = (a: BoxConfig, b: BoxConfig) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height))

export function applyLayoutRules(input: {
  boxes: RuleBoxes
  body: RuleBody
  params: LayoutRuleParams
  measure: RuleMeasure
  /** 표 규칙(첫닿자 · 홀자 · 받침)과 받침별 틈 · 내려옴에 쓴다. 없으면 표 규칙은 건너뛰고 m으로 간다. */
  jamo?: RuleJamo
  /** 자모 생김새 특징. `params.formulas`가 켜져 있고 첫닿자 특징이 있으면 공식이 통과한 열(첫닿자 아래)은 표 대신 공식으로 낸다. */
  features?: RuleFeatures
}): LayoutRuleResult {
  const { body, params, measure, jamo } = input
  const choFormula = params.formulas ? input.features?.cho ?? null : null
  const boxes: RuleBoxes = {}
  for (const part of RULE_PARTS) if (input.boxes[part]) boxes[part] = clone(input.boxes[part]!)
  const steps: LayoutRuleStep[] = []

  const apply = (rule: LayoutRuleId, ink: RuleInk): LayoutRuleStep | null => {
    if (rule === 'choTable') return applyChoTable(boxes, ink, body, jamo!, choFormula)
    if (rule === 'jungTable') return applyJungTable(boxes, ink, body, jamo!)
    if (rule === 'jongTable') return applyJongTable(boxes, ink, body, jamo!)
    if (rule === 'choBottom') return applyChoBottom(boxes, ink, body, params, jamo)
    if (rule === 'pillar') return applyPillar(boxes, ink, body, params, jamo)
    return null
  }
  for (const rule of LAYOUT_RULE_ORDER) {
    if (!params.rules[rule]) continue
    if ((rule === 'choTable' || rule === 'jungTable' || rule === 'jongTable') && !jamo) continue
    if (rule === 'faces') { steps.push(...applyFaces(boxes, measure(boxes))); continue }
    if (rule === 'gap') { steps.push(...applyGap(boxes, measure(boxes), body, params)); continue }
    // 상자를 늘여도 획 두께는 그대로라 잉크는 상자에 비례해 늘지 않는다. 한 번 맞춘 뒤 다시 재서, 목표에 닿을 때까지(최대 REFIT_ROUNDS번) 다시 맞춘다.
    let first: LayoutRuleStep | null = null
    let last: LayoutRuleStep | null = null
    for (let round = 0; round < REFIT_ROUNDS; round += 1) {
      const step = apply(rule, measure(boxes))
      if (!step) break
      first ??= step
      last = step
      boxes[step.part] = step.after
      if (boxShift(step.before, step.after) < REFIT_EPSILON) break
    }
    if (first && last) steps.push({ ...first, after: last.after, limited: last.limited })
  }

  return { boxes, steps, limited: steps.some((step) => step.limited) }
}
