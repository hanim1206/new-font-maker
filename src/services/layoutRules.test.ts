import { BRANCH_INSET_BY_PAIR, CHO_RIGHT_BY_JUNG, JONG_RIGHT_BY_CHO } from './layoutRuleResiduals'
import { describe, expect, it } from 'vitest'
import type { BoxConfig } from '../types'
import { applyLayoutRules, bodyOfPadding, DEFAULT_LAYOUT_RULE_PARAMS, fitBoxToVerticalInk, RULE_REFERENCE_BODY } from './layoutRules'
import { BRANCH_INSET_BY_CHO, BRANCH_INSET_BY_JUNG, CHO_GAP, CHO_TARGET, CHO_TOP_BY_JONG, CHO_TOP_BY_JUNG, JONG_GAP_OFFSET, JONG_RIGHT_BY_JUNG, JONG_TARGET, JONG_TOP_BY_CHO, JUNG_TARGET, PILLAR_BOTTOM_NO_FINAL } from './layoutRuleTargets'
import type { LayoutRuleParams, RuleBoxes, RuleInk, RuleMeasure } from './layoutRules'

/**
 * 가짜 자: 잉크는 상자 안쪽 두께 반만큼 들어온 네모, 줄기 두께는 부품마다 고정.
 * 규칙은 이 값만 보고 움직이므로 실제 획 없이 규칙의 산수만 검사한다.
 */
const THICK = 0.1
const measureInset: RuleMeasure = (boxes) => {
  const ink: RuleInk = {}
  for (const part of ['CH', 'JU', 'JO'] as const) {
    const box = boxes[part]
    if (!box) continue
    ink[part] = { bounds: { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height }, thickness: THICK }
  }
  return ink
}

const BODY = bodyOfPadding({ top: 0.05, bottom: 0.05, left: 0.075, right: 0.075 })
const START: RuleBoxes = {
  CH: { x: 0.1, y: 0.1, width: 0.4, height: 0.35 },
  JU: { x: 0.6, y: 0.2, width: 0.3, height: 0.5 },
  JO: { x: 0.15, y: 0.6, width: 0.7, height: 0.3 },
}
const off = (params: LayoutRuleParams = DEFAULT_LAYOUT_RULE_PARAMS): LayoutRuleParams => ({ ...params, rules: { faces: false, choTable: false, jungTable: false, jongTable: false, choBottom: false, pillar: false, gap: false } })
const only = (rule: keyof LayoutRuleParams['rules'], extra: Partial<LayoutRuleParams> = {}): LayoutRuleParams => ({ ...DEFAULT_LAYOUT_RULE_PARAMS, ...extra, rules: { ...off().rules, [rule]: true } })
const bottomOf = (box: BoxConfig) => box.y + box.height
const rightOf = (box: BoxConfig) => box.x + box.width

describe('배치 규칙', () => {
  it('규칙을 다 끄면 출발 상자 그대로다', () => {
    const result = applyLayoutRules({ boxes: START, body: BODY, params: off(), measure: measureInset })
    expect(result.boxes).toEqual(START)
    expect(result.steps).toEqual([])
    expect(result.limited).toBe(false)
  })

  it('여백 → 글자 몸', () => {
    expect(BODY).toEqual({ left: 0.075, right: 0.925, top: 0.05, bottom: 0.95 })
  })

  it('잉크 위아래를 목표에 맞추도록 상자를 옮기고 늘인다', () => {
    const box: BoxConfig = { x: 0, y: 0.2, width: 0.2, height: 0.4 }
    const fitted = fitBoxToVerticalInk(box, { left: 0, right: 0.2, top: 0.25, bottom: 0.55 }, { top: 0.05, bottom: 0.65 })
    // 잉크 0.25~0.55(높이 .3)가 0.05~0.65(높이 .6)로 → 두 배. 상자 위쪽 여유 .05도 두 배.
    expect(fitted.height).toBeCloseTo(0.8)
    expect(fitted.y).toBeCloseTo(-0.05)
  })

  it('규칙 0 · 잉크가 상자 밖으로 나오면 잉크 바깥면이 상자 변에 오도록 들인다', () => {
    // 잉크가 상자보다 사방 12.5%씩(상자 크기에 비례해) 크게 나오는 자
    const measureOutset: RuleMeasure = (boxes) => {
      const ink: RuleInk = {}
      for (const part of ['CH', 'JU', 'JO'] as const) {
        const box = boxes[part]
        if (box) ink[part] = { bounds: { left: box.x - box.width / 8, right: box.x + box.width * 9 / 8, top: box.y - box.height / 8, bottom: box.y + box.height * 9 / 8 }, thickness: THICK }
      }
      return ink
    }
    const result = applyLayoutRules({ boxes: START, body: BODY, params: only('faces'), measure: measureOutset })
    // 첫닿자 · 받침은 두 축 다: 잉크(상자 × 1.25)가 원래 상자 변에 오므로 상자는 0.8배.
    const ch = result.boxes.CH!
    expect(ch.width).toBeCloseTo(0.32)
    expect(ch.x).toBeCloseTo(0.14)
    expect(ch.height).toBeCloseTo(0.28)
    const after = measureOutset(result.boxes).CH!.bounds
    expect(after).toEqual(expect.objectContaining({ left: expect.closeTo(0.1), right: expect.closeTo(0.5), top: expect.closeTo(0.1), bottom: expect.closeTo(0.45) }))
    // 홀자는 세로만 들이고 가로는 오른면만 맞춘다(폭 그대로).
    const ju = result.boxes.JU!
    expect(ju.width).toBeCloseTo(START.JU!.width)
    expect(ju.height).toBeCloseTo(0.4)
    expect(measureOutset(result.boxes).JU!.bounds.right).toBeCloseTo(0.9)
  })

  it('규칙 2 · 받침 없는 글자의 기둥은 글자 몸 위아래에 닿는다', () => {
    const boxes: RuleBoxes = { CH: START.CH, JU: START.JU }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('pillar'), measure: measureInset })
    expect(result.boxes.JU!.y).toBeCloseTo(BODY.top)
    expect(bottomOf(result.boxes.JU!)).toBeCloseTo(BODY.bottom)
    expect(result.boxes.CH).toEqual(START.CH)
    expect(result.steps.map((step) => step.rule)).toEqual(['pillar'])
  })

  it('규칙 E · 표에 없는 받침이면 기둥 아래는 받침 윗면에서 두께 × m만큼 위', () => {
    const result = applyLayoutRules({ boxes: START, body: BODY, params: { ...only('pillar'), m: 0.5 }, measure: measureInset })
    // 받침 윗면 .6, 기둥 아래 = .6 − .1 × .5 = .55
    expect(bottomOf(result.boxes.JU!)).toBeCloseTo(0.55)
    expect(result.boxes.JU!.y).toBeCloseTo(BODY.top)
  })

  it('규칙 D · 표에 없는 첫닿자면 첫닿자 아래 = 받침 윗면 − 두께 × m, 위는 그대로', () => {
    const result = applyLayoutRules({ boxes: START, body: BODY, params: only('choBottom', { m: 0.6 }), measure: measureInset })
    expect(bottomOf(result.boxes.CH!)).toBeCloseTo(0.6 - 0.06)
    expect(result.boxes.CH!.y).toBeCloseTo(START.CH!.y)
    expect(result.limited).toBe(false)
  })

  it('규칙 D · 첫닿자가 너무 낮아지면 최소 높이에서 멈추고 표시한다', () => {
    const boxes: RuleBoxes = { ...START, JO: { x: 0.15, y: 0.15, width: 0.7, height: 0.75 } }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('choBottom'), measure: measureInset })
    expect(result.limited).toBe(true)
    expect(result.boxes.CH!.height).toBeCloseTo(0.08)
  })

  it('규칙 1 · 좁은 가로 틈을 반반 밀어 벌린다', () => {
    const boxes: RuleBoxes = { CH: { x: 0.1, y: 0.1, width: 0.45, height: 0.4 }, JU: { x: 0.56, y: 0.1, width: 0.3, height: 0.4 } }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('gap', { k: 0.5 }), measure: measureInset })
    // 틈 .01 → 최소 .05, 모자란 .04를 .02씩
    expect(rightOf(result.boxes.CH!)).toBeCloseTo(0.53)
    expect(result.boxes.JU!.x).toBeCloseTo(0.58)
    expect(result.limited).toBe(false)
  })

  it('규칙 1 · 틈이 충분하면 아무것도 안 한다', () => {
    const boxes: RuleBoxes = { ...START, JU: { x: 0.6, y: 0.2, width: 0.3, height: 0.35 } }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('gap', { k: 0.25 }), measure: measureInset })
    expect(result.boxes).toEqual(boxes)
  })

  it('규칙 1 · 한쪽이 글자 몸에 막히면 남은 몫을 다른 쪽이 진다', () => {
    const boxes: RuleBoxes = { CH: { x: 0.075, y: 0.1, width: 0.5, height: 0.4 }, JU: { x: 0.58, y: 0.1, width: 0.3, height: 0.4 } }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('gap', { k: 0.5 }), measure: measureInset })
    // 첫닿자는 이미 몸 왼쪽에 붙어 못 물러난다 → 홀자가 .045 전부 옮긴다.
    expect(result.boxes.CH!.x).toBeCloseTo(0.075)
    expect(result.boxes.JU!.x).toBeCloseTo(0.625)
    expect(result.limited).toBe(false)
  })

  it('규칙 1 · 양쪽 다 막히면 한계에서 멈추고 표시한다', () => {
    const boxes: RuleBoxes = { CH: { x: 0.075, y: 0.1, width: 0.5, height: 0.4 }, JU: { x: 0.58, y: 0.1, width: 0.345, height: 0.4 } }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('gap', { k: 1 }), measure: measureInset })
    expect(result.limited).toBe(true)
    expect(result.boxes.JU!.x).toBeCloseTo(0.58)
  })

  it('순서는 표 → 첫닿자 아래 → 기둥 → 틈이고 규칙마다 다시 잰다(자모가 없으면 표 규칙은 건너뛴다)', () => {
    const seen: string[] = []
    const measure: RuleMeasure = (boxes) => { seen.push(Object.keys(boxes).sort().join('')); return measureInset(boxes) }
    const params = { ...DEFAULT_LAYOUT_RULE_PARAMS, rules: { ...DEFAULT_LAYOUT_RULE_PARAMS.rules, gap: true } }
    const result = applyLayoutRules({ boxes: START, body: BODY, params, measure })
    // faces · choBottom · pillar · gap만 잰다(표 규칙은 자모가 없어 건너뜀). 맞추는 규칙은 다시 재므로 넷 이상.
    expect(seen.length).toBeGreaterThanOrEqual(4)
    const rules = result.steps.map((step) => step.rule)
    expect(rules).not.toContain('choTable')
    expect(rules).not.toContain('jongTable')
    expect(rules.indexOf('choBottom')).toBeLessThan(rules.indexOf('pillar'))
    expect(rules.lastIndexOf('pillar')).toBeLessThan(rules.indexOf('gap') === -1 ? rules.length : rules.indexOf('gap'))
    expect(result.boxes.JU!.y).toBeCloseTo(BODY.top)
  })

  describe('표 규칙(노토 몸통에서 잰 자모별 목표)', () => {
    const REF = RULE_REFERENCE_BODY
    const run = (rule: keyof LayoutRuleParams['rules'], jamo: { cho: string; jung: string; jong: string }, boxes: RuleBoxes = START) =>
      applyLayoutRules({ boxes, body: REF, params: only(rule), measure: measureInset, jamo })

    it('규칙 A · 첫닿자 왼 · 오른 · 위는 표, 받침이 있으면 아래는 그대로', () => {
      const ch = run('choTable', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.CH!
      expect(ch.x).toBeCloseTo(CHO_TARGET['ㅁ'].left)
      expect(rightOf(ch)).toBeCloseTo(CHO_TARGET['ㅁ'].right)
      expect(ch.y).toBeCloseTo(CHO_TARGET['ㅁ'].top + CHO_TOP_BY_JONG['ㄴ'] + CHO_TOP_BY_JUNG['ㅏ'])
      expect(bottomOf(ch)).toBeCloseTo(bottomOf(START.CH!))
    })

    it('규칙 A · 두 기둥 홀자 옆에서는 폭이 표의 비율로 줄고, 받침이 없으면 아래도 표', () => {
      const two = run('choTable', { cho: 'ㅁ', jung: 'ㅐ', jong: 'ㄴ' }).boxes.CH!
      expect(two.width).toBeCloseTo((CHO_TARGET['ㅁ'].right - CHO_TARGET['ㅁ'].left) * CHO_TARGET['ㅁ'].twoStemScale)
      const noFinal = run('choTable', { cho: 'ㅁ', jung: 'ㅏ', jong: '' }, { CH: START.CH!, JU: START.JU! }).boxes.CH!
      expect(bottomOf(noFinal)).toBeCloseTo(CHO_TARGET['ㅁ'].bottomNoFinal)
    })

    it('규칙 B · ㅣ는 표의 왼 · 오른에 서고, 쌍자음 옆이면 왼면이 쌍자음 옆 값', () => {
      const i = run('jungTable', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄴ' }).boxes.JU!
      expect(i.x).toBeCloseTo(JUNG_TARGET['ㅣ'].left)
      expect(rightOf(i)).toBeCloseTo(JUNG_TARGET['ㅣ'].right)
      expect(run('jungTable', { cho: 'ㅆ', jung: 'ㅣ', jong: 'ㄴ' }).boxes.JU!.x).toBeCloseTo(JUNG_TARGET['ㅣ'].leftNextToDouble)
    })

    it('규칙 B · 왼가지 홀자(ㅓ)의 왼면은 첫닿자 오른면 + 첫닿자별 파고듦', () => {
      const eo = run('jungTable', { cho: 'ㄴ', jung: 'ㅓ', jong: 'ㄴ' }).boxes.JU!
      expect(eo.x).toBeCloseTo(rightOf(START.CH!) + BRANCH_INSET_BY_CHO['ㄴ'] + BRANCH_INSET_BY_JUNG['ㅓ'] + BRANCH_INSET_BY_PAIR['ㄴㅓ'])
      expect(rightOf(eo)).toBeCloseTo(JUNG_TARGET['ㅓ'].right)
    })

    it('남은 보정 · 덧셈으로 안 맞는 짝만 예외, ㅣ 옆 첫닿자는 넓게, ㅆ ㅉ 아래 받침은 오른쪽으로', () => {
      expect(BRANCH_INSET_BY_PAIR['ㄷㅕ']).toBeUndefined()
      const de = run('jungTable', { cho: 'ㄷ', jung: 'ㅕ', jong: 'ㄴ' }).boxes.JU!
      expect(de.x).toBeCloseTo(rightOf(START.CH!) + BRANCH_INSET_BY_CHO['ㄷ'] + BRANCH_INSET_BY_JUNG['ㅕ'])
      const wide = run('choTable', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄴ' }).boxes.CH!
      const plain = run('choTable', { cho: 'ㅁ', jung: 'ㅑ', jong: 'ㄴ' }).boxes.CH!
      expect(rightOf(wide) - rightOf(plain)).toBeGreaterThan(CHO_RIGHT_BY_JUNG['ㅣ'] * 0.8)
      const jo = run('jongTable', { cho: 'ㅆ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.JO!
      expect(rightOf(jo)).toBeCloseTo(JONG_TARGET['ㄴ'].right + JONG_RIGHT_BY_JUNG['ㅏ'] + JONG_RIGHT_BY_CHO['ㅆ'])
    })

    it('규칙 C · 받침 네 변은 표, 왼 · 오른은 홀자별 치우침을 더한다', () => {
      const jo = run('jongTable', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.JO!
      expect(jo.y).toBeCloseTo(JONG_TARGET['ㄴ'].top + JONG_TOP_BY_CHO['ㅁ'])
      expect(bottomOf(jo)).toBeCloseTo(JONG_TARGET['ㄴ'].bottom)
      expect(rightOf(jo)).toBeCloseTo(JONG_TARGET['ㄴ'].right + JONG_RIGHT_BY_JUNG['ㅏ'])
    })

    it('규칙 D · 첫닿자 아래 = 받침 윗면 − 두께 × (첫닿자 틈 + 받침 잔차)', () => {
      const ch = run('choBottom', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.CH!
      expect(bottomOf(ch)).toBeCloseTo(START.JO!.y - THICK * (CHO_GAP['ㅁ'] + JONG_GAP_OFFSET['ㄴ']))
    })

    it('규칙 E · 받침 ㄴ이면 기둥이 받침 윗면 아래로 내려오고, ㄱ이면 조금 위에서 멈춘다 · 받침 없으면 표', () => {
      expect(bottomOf(run('pillar', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄴ' }).boxes.JU!)).toBeCloseTo(START.JO!.y + JONG_TARGET['ㄴ'].pillarReach)
      expect(bottomOf(run('pillar', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄱ' }).boxes.JU!)).toBeCloseTo(START.JO!.y + JONG_TARGET['ㄱ'].pillarReach)
      expect(bottomOf(run('pillar', { cho: 'ㅁ', jung: 'ㅣ', jong: '' }, { CH: START.CH!, JU: START.JU! }).boxes.JU!)).toBeCloseTo(PILLAR_BOTTOM_NO_FINAL)
    })

    it('획 두께가 그대로인 잉크도 다시 재서 목표에 닿는다', () => {
      // 잉크 = 상자 ± 0.05(두께 반, 상자를 늘여도 그대로). 한 번 비례로 맞추면 어긋나고, 다시 재면 닿는다.
      const measureFixed: RuleMeasure = (boxes) => {
        const ink: RuleInk = {}
        for (const part of ['CH', 'JU', 'JO'] as const) {
          const box = boxes[part]
          if (box) ink[part] = { bounds: { left: box.x - 0.05, right: box.x + box.width + 0.05, top: box.y - 0.05, bottom: box.y + box.height + 0.05 }, thickness: THICK }
        }
        return ink
      }
      const result = applyLayoutRules({ boxes: START, body: REF, params: only('jongTable'), measure: measureFixed, jamo: { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄴ' } })
      const ink = measureFixed(result.boxes).JO!.bounds
      // 다시 맞추기는 변화가 0.0005 em 아래면 멈춘다 — 목표와 0.002 안이면 닿은 것으로 본다(한 번만 맞추면 0.01 넘게 어긋난다).
      expect(Math.abs(ink.top - (JONG_TARGET['ㄴ'].top + JONG_TOP_BY_CHO['ㅁ']))).toBeLessThan(0.002)
      expect(Math.abs(ink.bottom - JONG_TARGET['ㄴ'].bottom)).toBeLessThan(0.002)
      expect(result.steps).toHaveLength(1)
    })

    it('다른 글자 몸에서는 몸 안의 같은 비율 자리로 옮긴다', () => {
      const result = applyLayoutRules({ boxes: START, body: BODY, params: only('jongTable'), measure: measureInset, jamo: { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄹ' } })
      const ratio = (JONG_TARGET['ㄹ'].top - REF.top) / (REF.bottom - REF.top)
      expect(result.boxes.JO!.y).toBeCloseTo(BODY.top + ratio * (BODY.bottom - BODY.top))
    })
  })
})
