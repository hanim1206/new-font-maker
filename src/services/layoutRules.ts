import type { BoxConfig, Padding } from '../types'

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

export type LayoutRuleId = 'faces' | 'choShape' | 'stemColumn' | 'finalTop' | 'jongShape' | 'pillar' | 'pillarReach' | 'gap'
/**
 * 적용 순서: 상자를 잉크 바깥면으로 읽기 → 첫닿자 모양별 크기 → 홀자 기둥 줄 → 받침 윗면 여백 → 받침 모양별 높이 → 홀자 기둥 높이 → 받침 오른 위가 비면 기둥이 내려옴 → 획 사이 최소 틈.
 * 받침 모양별 높이가 켜져 있으면 받침 윗면 여백의 결과를 덮어쓴다(기둥 높이는 덮어쓴 받침 윗면을 따른다).
 */
export const LAYOUT_RULE_ORDER: readonly LayoutRuleId[] = ['faces', 'choShape', 'stemColumn', 'finalTop', 'jongShape', 'pillar', 'pillarReach', 'gap']
export const LAYOUT_RULE_LABEL: Record<LayoutRuleId, string> = {
  faces: '상자를 잉크 바깥면으로 읽기',
  choShape: '첫닿자 모양별 크기 · 자리',
  stemColumn: '홀자는 기둥 줄로 세우기',
  finalTop: '받침 윗면 여백',
  jongShape: '받침 모양별 높이 · 폭',
  pillar: '홀자 기둥 높이 고정',
  pillarReach: '받침 오른 위가 비면 기둥이 내려옴',
  gap: '획 사이 최소 틈',
}

/** 글자의 자모. 모양별 규칙(첫닿자 · 홀자 · 받침)이 쓴다. 없으면 그 규칙들은 건너뛴다. */
export interface RuleJamo { cho: string; jung: string; jong: string }

/**
 * 모양별 규칙의 목표값은 노토 몸통(왼 .05 · 오른 .89 · 위 .05 · 아래 .96)에서 잰 잉크 바깥면(em)이다.
 * 다른 글자 몸에서는 몸 안의 비율로 옮겨 쓴다. 값은 채점판 전수 588자에서 지금 모델(노토 xor 0.19)이 그린 잉크의 가운데값.
 */
export const RULE_REFERENCE_BODY: RuleBody = { left: 0.05, right: 0.89, top: 0.05, bottom: 0.96 }

export type ChoShapeClass = 'square' | 'open' | 'dot' | 'double'
export const CHO_SHAPE_CLASS: Record<string, ChoShapeClass> = {
  ㄱ: 'square', ㄷ: 'square', ㄹ: 'square', ㅁ: 'square', ㅂ: 'square', ㅋ: 'square', ㅌ: 'square',
  ㄴ: 'open', ㅅ: 'open', ㅇ: 'open', ㅈ: 'open', ㅍ: 'open',
  ㅊ: 'dot', ㅎ: 'dot',
  ㄲ: 'double', ㄸ: 'double', ㅃ: 'double', ㅆ: 'double', ㅉ: 'double',
}
export const CHO_SHAPE_LABEL: Record<ChoShapeClass, string> = {
  square: '네모 · 꺾임(ㄱ ㄷ ㄹ ㅁ ㅂ ㅋ ㅌ)',
  open: '열린 꼴(ㄴ ㅅ ㅇ ㅈ ㅍ)',
  dot: '꼭지(ㅊ ㅎ)',
  double: '쌍자음(ㄲ ㄸ ㅃ ㅆ ㅉ)',
}
/** 첫닿자 잉크 목표(노토 몸통 기준 em): 왼면 · 폭 · 윗면 · 아랫면. 오른홀자 하나짜리 옆에서 잰 값. */
export const CHO_SHAPE_TARGET: Record<ChoShapeClass, { left: number; width: number; top: number; bottom: number }> = {
  square: { left: 0.093, width: 0.412, top: 0.107, bottom: 0.522 },
  open: { left: 0.068, width: 0.481, top: 0.105, bottom: 0.52 },
  dot: { left: 0.054, width: 0.522, top: 0.055, bottom: 0.57 },
  double: { left: 0.066, width: 0.544, top: 0.108, bottom: 0.53 },
}
/** 아래로 꼬리 · 삐침이 내려오는 첫닿자는 아랫면이 이만큼 더 내려온다(ㄱ .564 · ㅋ .593 · ㅅ .559 · ㅈ .563). */
export const CHO_TAIL = new Set(['ㄱ', 'ㅋ', 'ㅅ', 'ㅈ'])
export const CHO_TAIL_DROP = 0.04
/** 기둥이 둘인 홀자(ㅐ ㅒ ㅔ ㅖ) 옆에서는 첫닿자 폭이 이 비율로 준다(네 갈래 모두 0.84~0.86). */
export const TWO_STEM_VOWELS = new Set(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ'])
export const TWO_STEM_CHO_SCALE = 0.85

/** 홀자 잉크 가로 목표(노토 몸통 기준 em). width가 없으면 폭은 두고 옮기기만 한다(ㅏ ㅑ ㅣ — 폭이 획 두께와 가지로 정해진다). */
export const STEM_COLUMN_TARGET: Record<string, { right: number; left?: number }> = {
  ㅏ: { right: 0.88 }, ㅑ: { right: 0.88 },
  ㅣ: { right: 0.779 },
  ㅓ: { right: 0.79, left: 0.522 }, ㅕ: { right: 0.79, left: 0.522 },
  ㅐ: { right: 0.814, left: 0.537 }, ㅒ: { right: 0.814, left: 0.537 },
  ㅔ: { right: 0.813, left: 0.432 }, ㅖ: { right: 0.813, left: 0.432 },
}

export type JongShapeClass = 'flat' | 'stacked' | 'dot'
/** 받침 윗면을 정하는 갈래. 납작(가로획 하나 · 닫힌 네모) · 층진 꼴(ㄹ ㅂ ㅌ과 그 겹받침) · 꼭지(ㅎ ㅊ과 그 겹받침). */
export const JONG_SHAPE_CLASS: Record<string, JongShapeClass> = {
  ㄱ: 'flat', ㄲ: 'flat', ㄳ: 'flat', ㄴ: 'flat', ㄵ: 'flat', ㄷ: 'flat', ㅁ: 'flat', ㅅ: 'flat', ㅆ: 'flat', ㅇ: 'flat', ㅈ: 'flat', ㅋ: 'flat', ㅍ: 'flat',
  ㄹ: 'stacked', ㄺ: 'stacked', ㄻ: 'stacked', ㄼ: 'stacked', ㄽ: 'stacked', ㄾ: 'stacked', ㄿ: 'stacked', ㅂ: 'stacked', ㅄ: 'stacked', ㅌ: 'stacked', ㄶ: 'stacked',
  ㅎ: 'dot', ㅀ: 'dot', ㅊ: 'dot',
}
export const JONG_SHAPE_LABEL: Record<JongShapeClass, string> = {
  flat: '납작(ㄱ ㄴ ㄷ ㅁ ㅅ ㅇ ㅈ ㅋ ㅍ · ㄲ ㅆ ㄳ ㄵ)',
  stacked: '층진 꼴(ㄹ ㅂ ㅌ · ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅄ ㄶ)',
  dot: '꼭지(ㅎ ㅊ ㅀ)',
}
/** 받침 잉크 윗면 목표(노토 몸통 기준 em). 아랫면은 모두 .955. ㄴ만 한 번 더 낮다(.654). */
export const JONG_SHAPE_TOP: Record<JongShapeClass, number> = { flat: 0.625, stacked: 0.577, dot: 0.54 }
export const JONG_TOP_OVERRIDE: Record<string, number> = { ㄴ: 0.654 }
export const JONG_BOTTOM = 0.955
/** 받침 잉크 가로 목표. 넓은 받침(사선이 있는 ㅅ ㅆ ㅈ ㅊ과 겹받침)은 양옆이 더 벌어진다. ㄱ ㅋ은 내리긋는 획이 오른쪽에 있어 오른면이 안쪽이다. */
export const JONG_WIDE = new Set(['ㅅ', 'ㅆ', 'ㅈ', 'ㅊ', 'ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ'])
export const JONG_HORIZONTAL: Record<'narrow' | 'wide' | 'hook', { left: number; right: number }> = {
  narrow: { left: 0.195, right: 0.818 },
  wide: { left: 0.15, right: 0.856 },
  hook: { left: 0.16, right: 0.76 },
}
export const JONG_HOOK = new Set(['ㄱ', 'ㄲ', 'ㅋ'])

/**
 * 홀자 기둥 아래 끝이 받침 윗면보다 얼마나 아래로 내려오는가(노토 몸통 기준 em, + = 아래).
 * 보통 받침은 기둥이 받침 윗면 .04 위에서 끝나지만(규칙 2), 오른 위가 빈 받침(ㄴ · ㅅ)은 그 빈자리로 기둥이 내려오고
 * 꼭지가 가운데 있는 받침(ㅎ · ㅊ)은 꼭지 옆으로 조금 내려온다. ㄴ 위 기둥 끝 .721은 홀자 아홉 모두 .715~.723.
 */
export const PILLAR_REACH: Record<string, number> = { ㄴ: 0.067, ㅅ: 0.05, ㅊ: 0.025, ㅎ: 0.021 }

export interface LayoutRuleParams {
  rules: Record<LayoutRuleId, boolean>
  /** 최소 틈 = 양쪽 줄기 두께 평균 × k. 10-02 관측값 0.25에서 출발. */
  k: number
  /** 받침 윗면 여백 = 두께 × m. 홀자 기둥 아래 끝도 받침 윗면에서 이만큼 띈다. */
  m: number
}

export const DEFAULT_LAYOUT_RULE_PARAMS: LayoutRuleParams = {
  rules: { faces: true, choShape: true, stemColumn: true, finalTop: true, jongShape: true, pillar: true, pillarReach: true, gap: false },
  k: 0.25,
  m: 0.6,
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

/** 받침 윗면 목표. 첫닿자 아래 + 두께 × m. 규칙 3이 꺼져 있으면 지금 받침 잉크 윗면 그대로. */
function finalTopTarget(ink: RuleInk, params: LayoutRuleParams): number | null {
  const jo = ink.JO
  if (!jo) return null
  const ch = ink.CH
  if (params.rules.jongShape || !params.rules.finalTop || !ch) return jo.bounds.top
  return ch.bounds.bottom + meanThickness(ch, jo) * params.m
}

/** 잉크의 네 바깥면이 목표 네모에 오도록 상자를 옮기고 늘인다(두 축). */
export function fitBoxToInk(box: BoxConfig, ink: InkBounds, target: InkBounds): BoxConfig {
  const vertical = fitBoxToVerticalInk(box, ink, target)
  const inkWidth = ink.right - ink.left
  if (inkWidth < EPSILON) return shifted(vertical, target.left - ink.left, 0)
  const scale = (target.right - target.left) / inkWidth
  return { ...vertical, x: target.left - (ink.left - box.x) * scale, width: box.width * scale }
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

/** 규칙 2 · 홀자 기둥 높이 고정 — 위는 글자 몸 위, 아래는 글자 몸 아래(받침이 있으면 받침 윗면에서 여백만큼 위). */
function applyPillar(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, params: LayoutRuleParams): LayoutRuleStep | null {
  const box = boxes.JU
  const ju = ink.JU
  if (!box || !ju) return null
  const joTop = finalTopTarget(ink, params)
  let bottom = joTop === null ? body.bottom : joTop - (ink.JO ? meanThickness(ju, ink.JO) : ju.thickness) * params.m
  let limited = false
  if (bottom > body.bottom) { bottom = body.bottom; limited = true }
  if (bottom - body.top < MIN_PART_HEIGHT) { bottom = body.top + MIN_PART_HEIGHT; limited = true }
  const after = fitBoxToVerticalInk(box, ju.bounds, { top: body.top, bottom })
  return { rule: 'pillar', part: 'JU', before: clone(box), after, limited, note: `기둥 ${fixed(ju.bounds.top)}~${fixed(ju.bounds.bottom)} → ${fixed(body.top)}~${fixed(bottom)}` }
}

/** 규칙 3 · 받침 윗면 여백 — 받침 잉크 윗면 = 첫닿자 아래 + 두께 × m. 아래 끝은 그대로 둔다(글자 몸 안). */
function applyFinalTop(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, params: LayoutRuleParams): LayoutRuleStep | null {
  const box = boxes.JO
  const jo = ink.JO
  const ch = ink.CH
  if (!box || !jo || !ch) return null
  const bottom = Math.min(jo.bounds.bottom, body.bottom)
  let top = ch.bounds.bottom + meanThickness(ch, jo) * params.m
  let limited = false
  if (bottom - top < MIN_PART_HEIGHT) { top = bottom - MIN_PART_HEIGHT; limited = true }
  if (top < body.top) { top = body.top; limited = true }
  const after = fitBoxToVerticalInk(box, jo.bounds, { top, bottom })
  return { rule: 'finalTop', part: 'JO', before: clone(box), after, limited, note: `받침 윗면 ${fixed(jo.bounds.top)} → ${fixed(top)}` }
}

/** 노토 몸통 기준 em 값을 이 글자 몸의 같은 비율 자리로 옮긴다. */
const atX = (body: RuleBody, value: number) => body.left + (value - RULE_REFERENCE_BODY.left) / (RULE_REFERENCE_BODY.right - RULE_REFERENCE_BODY.left) * (body.right - body.left)
const atY = (body: RuleBody, value: number) => body.top + (value - RULE_REFERENCE_BODY.top) / (RULE_REFERENCE_BODY.bottom - RULE_REFERENCE_BODY.top) * (body.bottom - body.top)

/**
 * 규칙 A · 첫닿자 모양별 크기 · 자리 — 노토는 네모난 첫닿자(ㅁ ㄷ ㅌ …)를 작게(폭 .41), 열린 꼴(ㅅ ㅇ ㅈ …)은 크게(.48) 그린다.
 * 꼭지 있는 ㅊ ㅎ는 몸통 윗선(.105) 위 여백까지 쓰고, 꼬리가 내려오는 ㄱ ㅋ ㅅ ㅈ는 아랫면이 .04 더 내려온다.
 * 기둥이 둘인 홀자(ㅐ ㅒ ㅔ ㅖ) 옆에서는 폭이 0.85배로 준다. 받침이 없으면 아랫면은 두고 위 · 가로만 맞춘다.
 */
function applyChoShape(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo): LayoutRuleStep | null {
  const box = boxes.CH
  const ch = ink.CH
  const shape = CHO_SHAPE_CLASS[jamo.cho]
  if (!box || !ch || !shape) return null
  const target = CHO_SHAPE_TARGET[shape]
  const width = target.width * (TWO_STEM_VOWELS.has(jamo.jung) ? TWO_STEM_CHO_SCALE : 1)
  const bottom = ink.JO ? atY(body, target.bottom + (CHO_TAIL.has(jamo.cho) ? CHO_TAIL_DROP : 0)) : ch.bounds.bottom
  const goal: InkBounds = { left: atX(body, target.left), right: atX(body, target.left + width), top: atY(body, target.top), bottom }
  const after = fitBoxToInk(box, ch.bounds, goal)
  return { rule: 'choShape', part: 'CH', before: clone(box), after, limited: false, note: `${CHO_SHAPE_LABEL[shape].split('(')[0]}${TWO_STEM_VOWELS.has(jamo.jung) ? ' · 두 기둥 옆 ×' + TWO_STEM_CHO_SCALE : ''} — 폭 ${fixed(ch.bounds.right - ch.bounds.left)} → ${fixed(goal.right - goal.left)}, 윗면 ${fixed(ch.bounds.top)} → ${fixed(goal.top)}` }
}

/**
 * 규칙 B · 홀자는 기둥 줄로 세우기 — 노토는 홀자 기둥을 거의 같은 세로줄(.67~.78)에 두고 가지를 양쪽으로 뻗는다.
 * 그래서 오른가지가 없는 ㅣ ㅓ ㅕ는 잉크 오른면이 몸 오른끝보다 .10 안쪽이다. 왼가지가 있는 ㅓ ㅕ ㅐ ㅒ ㅔ ㅖ는 왼면도 맞춘다.
 */
function applyStemColumn(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo): LayoutRuleStep | null {
  const box = boxes.JU
  const ju = ink.JU
  const target = STEM_COLUMN_TARGET[jamo.jung]
  if (!box || !ju || !target) return null
  const right = atX(body, target.right)
  let after: BoxConfig
  if (target.left === undefined) after = shifted(box, right - ju.bounds.right, 0)
  else {
    const left = atX(body, target.left)
    const scale = (right - left) / Math.max(EPSILON, ju.bounds.right - ju.bounds.left)
    after = { ...box, x: left - (ju.bounds.left - box.x) * scale, width: box.width * scale }
  }
  return { rule: 'stemColumn', part: 'JU', before: clone(box), after, limited: false, note: `${jamo.jung} 잉크 ${fixed(ju.bounds.left)}~${fixed(ju.bounds.right)} → ${target.left === undefined ? '오른면 ' : fixed(atX(body, target.left)) + '~'}${fixed(right)}` }
}

/**
 * 규칙 C · 받침 모양별 높이 · 폭 — 노토 받침 윗면은 납작한 받침 .625(ㄴ은 .654), 층진 꼴(ㄹ ㅂ ㅌ) .577, 꼭지(ㅎ ㅊ) .54.
 * 아랫면은 모두 .955. 가로는 보통 .195~.818, 넓은 받침(사선 · 겹받침) .15~.856, ㄱ ㅋ은 .16~.76.
 */
function applyJongShape(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo): LayoutRuleStep | null {
  const box = boxes.JO
  const jo = ink.JO
  const shape = JONG_SHAPE_CLASS[jamo.jong]
  if (!box || !jo || !shape) return null
  const horizontal = JONG_HORIZONTAL[JONG_HOOK.has(jamo.jong) ? 'hook' : JONG_WIDE.has(jamo.jong) ? 'wide' : 'narrow']
  const goal: InkBounds = {
    left: atX(body, horizontal.left), right: atX(body, horizontal.right),
    top: atY(body, JONG_TOP_OVERRIDE[jamo.jong] ?? JONG_SHAPE_TOP[shape]), bottom: atY(body, JONG_BOTTOM),
  }
  const after = fitBoxToInk(box, jo.bounds, goal)
  return { rule: 'jongShape', part: 'JO', before: clone(box), after, limited: false, note: `${JONG_SHAPE_LABEL[shape].split('(')[0]} — 윗면 ${fixed(jo.bounds.top)} → ${fixed(goal.top)}, 가로 ${fixed(goal.left)}~${fixed(goal.right)}` }
}

/** 규칙 D · 받침 오른 위가 비면 기둥이 내려옴 — 기둥 아래 끝 = 받침 잉크 윗면 + 내려옴(`PILLAR_REACH`). 위 끝은 그대로. */
function applyPillarReach(boxes: RuleBoxes, ink: RuleInk, body: RuleBody, jamo: RuleJamo): LayoutRuleStep | null {
  const box = boxes.JU
  const ju = ink.JU
  const jo = ink.JO
  const reach = PILLAR_REACH[jamo.jong]
  if (!box || !ju || !jo || reach === undefined) return null
  const scale = (body.bottom - body.top) / (RULE_REFERENCE_BODY.bottom - RULE_REFERENCE_BODY.top)
  const bottom = Math.min(body.bottom, jo.bounds.top + reach * scale)
  const after = fitBoxToVerticalInk(box, ju.bounds, { top: ju.bounds.top, bottom })
  return { rule: 'pillarReach', part: 'JU', before: clone(box), after, limited: false, note: `받침 ${jamo.jong} — 기둥 끝 ${fixed(ju.bounds.bottom)} → ${fixed(bottom)}(받침 윗면 ${reach >= 0 ? '+' : ''}${fixed(reach * scale)})` }
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
export function applyLayoutRules(input: {
  boxes: RuleBoxes
  body: RuleBody
  params: LayoutRuleParams
  measure: RuleMeasure
  /** 모양별 규칙(첫닿자 · 홀자 기둥 줄 · 받침)에 쓴다. 없으면 그 규칙들은 건너뛴다. */
  jamo?: RuleJamo
}): LayoutRuleResult {
  const { body, params, measure, jamo } = input
  const boxes: RuleBoxes = {}
  for (const part of RULE_PARTS) if (input.boxes[part]) boxes[part] = clone(input.boxes[part]!)
  const steps: LayoutRuleStep[] = []

  for (const rule of LAYOUT_RULE_ORDER) {
    if (!params.rules[rule]) continue
    if ((rule === 'choShape' || rule === 'stemColumn' || rule === 'jongShape' || rule === 'pillarReach') && !jamo) continue
    const ink = measure(boxes)
    if (rule === 'faces') {
      steps.push(...applyFaces(boxes, ink))
    } else if (rule === 'choShape' || rule === 'stemColumn' || rule === 'jongShape' || rule === 'pillarReach') {
      const step = rule === 'choShape' ? applyChoShape(boxes, ink, body, jamo!)
        : rule === 'stemColumn' ? applyStemColumn(boxes, ink, body, jamo!)
          : rule === 'jongShape' ? applyJongShape(boxes, ink, body, jamo!)
            : applyPillarReach(boxes, ink, body, jamo!)
      if (step) { boxes[step.part] = step.after; steps.push(step) }
    } else if (rule === 'pillar') {
      const step = applyPillar(boxes, ink, body, params)
      if (step) { boxes.JU = step.after; steps.push(step) }
    } else if (rule === 'finalTop') {
      const step = applyFinalTop(boxes, ink, body, params)
      if (step) { boxes.JO = step.after; steps.push(step) }
    } else {
      steps.push(...applyGap(boxes, ink, body, params))
    }
  }

  return { boxes, steps, limited: steps.some((step) => step.limited) }
}
