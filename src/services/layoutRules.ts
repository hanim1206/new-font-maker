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

export type LayoutRuleId = 'faces' | 'pillar' | 'finalTop' | 'gap'
/** 적용 순서: 상자를 잉크 바깥면으로 읽기 → 홀자 기둥 높이 → 받침 윗면 여백 → 획 사이 최소 틈. */
export const LAYOUT_RULE_ORDER: readonly LayoutRuleId[] = ['faces', 'pillar', 'finalTop', 'gap']
export const LAYOUT_RULE_LABEL: Record<LayoutRuleId, string> = {
  faces: '상자를 잉크 바깥면으로 읽기',
  pillar: '홀자 기둥 높이 고정',
  finalTop: '받침 윗면 여백',
  gap: '획 사이 최소 틈',
}

export interface LayoutRuleParams {
  rules: Record<LayoutRuleId, boolean>
  /** 최소 틈 = 양쪽 줄기 두께 평균 × k. 10-02 관측값 0.25에서 출발. */
  k: number
  /** 받침 윗면 여백 = 두께 × m. 홀자 기둥 아래 끝도 받침 윗면에서 이만큼 띈다. */
  m: number
}

export const DEFAULT_LAYOUT_RULE_PARAMS: LayoutRuleParams = {
  rules: { faces: true, pillar: true, finalTop: true, gap: true },
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
  if (!params.rules.finalTop || !ch) return jo.bounds.top
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
}): LayoutRuleResult {
  const { body, params, measure } = input
  const boxes: RuleBoxes = {}
  for (const part of RULE_PARTS) if (input.boxes[part]) boxes[part] = clone(input.boxes[part]!)
  const steps: LayoutRuleStep[] = []

  for (const rule of LAYOUT_RULE_ORDER) {
    if (!params.rules[rule]) continue
    const ink = measure(boxes)
    if (rule === 'faces') {
      steps.push(...applyFaces(boxes, ink))
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
