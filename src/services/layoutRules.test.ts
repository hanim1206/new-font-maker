import { describe, expect, it } from 'vitest'
import type { BoxConfig } from '../types'
import { applyLayoutRules, bodyOfPadding, CHO_SHAPE_TARGET, DEFAULT_LAYOUT_RULE_PARAMS, fitBoxToVerticalInk, JONG_SHAPE_TOP, JONG_TOP_OVERRIDE, RULE_REFERENCE_BODY, STEM_COLUMN_TARGET, TWO_STEM_CHO_SCALE } from './layoutRules'
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
const off = (params: LayoutRuleParams = DEFAULT_LAYOUT_RULE_PARAMS): LayoutRuleParams => ({ ...params, rules: { faces: false, choShape: false, stemColumn: false, finalTop: false, jongShape: false, pillar: false, pillarReach: false, gap: false } })
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

  it('규칙 2 · 받침이 있으면 기둥 아래는 받침 윗면에서 두께 × m만큼 위', () => {
    const params = { ...only('pillar'), m: 0.5 }
    params.rules.finalTop = true
    const result = applyLayoutRules({ boxes: START, body: BODY, params, measure: measureInset })
    // 받침 윗면 목표 = 첫닿자 아래(.45) + .1 × .5 = .5, 기둥 아래 = .5 − .05 = .45
    expect(bottomOf(result.boxes.JU!)).toBeCloseTo(0.45)
    expect(result.boxes.JU!.y).toBeCloseTo(BODY.top)
  })

  it('규칙 3 · 받침 윗면 = 첫닿자 아래 + 두께 × m, 아래 끝은 그대로', () => {
    const result = applyLayoutRules({ boxes: START, body: BODY, params: only('finalTop', { m: 0.6 }), measure: measureInset })
    expect(result.boxes.JO!.y).toBeCloseTo(0.45 + 0.06)
    expect(bottomOf(result.boxes.JO!)).toBeCloseTo(bottomOf(START.JO!))
    expect(result.limited).toBe(false)
  })

  it('규칙 3 · 받침이 너무 낮아지면 최소 높이에서 멈추고 표시한다', () => {
    const boxes: RuleBoxes = { ...START, CH: { x: 0.1, y: 0.1, width: 0.4, height: 0.75 } }
    const result = applyLayoutRules({ boxes, body: BODY, params: only('finalTop'), measure: measureInset })
    expect(result.limited).toBe(true)
    expect(result.boxes.JO!.height).toBeCloseTo(0.08)
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

  it('순서는 받침 윗면 → 기둥 → 틈이고 규칙마다 다시 잰다(자모가 없으면 모양별 규칙은 건너뛴다)', () => {
    const seen: string[] = []
    const measure: RuleMeasure = (boxes) => { seen.push(Object.keys(boxes).sort().join('')); return measureInset(boxes) }
    const params = { ...DEFAULT_LAYOUT_RULE_PARAMS, rules: { ...DEFAULT_LAYOUT_RULE_PARAMS.rules, gap: true } }
    const result = applyLayoutRules({ boxes: START, body: BODY, params, measure })
    expect(seen).toHaveLength(4)
    const rules = result.steps.map((step) => step.rule)
    expect(rules.indexOf('finalTop')).toBeLessThan(rules.indexOf('pillar'))
    expect(rules).not.toContain('choShape')
    expect(rules.lastIndexOf('pillar')).toBeLessThan(rules.indexOf('gap') === -1 ? rules.length : rules.indexOf('gap'))
    expect(result.boxes.JU!.y).toBeCloseTo(BODY.top)
  })

  describe('모양별 규칙(노토 몸통에서 잰 목표)', () => {
    const REF = RULE_REFERENCE_BODY
    const run = (rule: keyof LayoutRuleParams['rules'], jamo: { cho: string; jung: string; jong: string }) =>
      applyLayoutRules({ boxes: START, body: REF, params: only(rule), measure: measureInset, jamo })

    it('규칙 A · 네모 첫닿자는 폭 .412, 꼭지 첫닿자는 윗면 .055', () => {
      const square = run('choShape', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.CH!
      expect(square.width).toBeCloseTo(CHO_SHAPE_TARGET.square.width)
      expect(square.x).toBeCloseTo(CHO_SHAPE_TARGET.square.left)
      expect(square.y).toBeCloseTo(CHO_SHAPE_TARGET.square.top)
      expect(run('choShape', { cho: 'ㅎ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.CH!.y).toBeCloseTo(0.055)
    })

    it('규칙 A · 두 기둥 홀자 옆에서는 첫닿자 폭이 준다 · 꼬리 첫닿자는 더 내려온다', () => {
      expect(run('choShape', { cho: 'ㅁ', jung: 'ㅐ', jong: 'ㄴ' }).boxes.CH!.width).toBeCloseTo(CHO_SHAPE_TARGET.square.width * TWO_STEM_CHO_SCALE)
      const tail = run('choShape', { cho: 'ㄱ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.CH!
      expect(bottomOf(tail)).toBeCloseTo(CHO_SHAPE_TARGET.square.bottom + 0.04)
    })

    it('규칙 A · 받침이 없으면 아랫면은 그대로', () => {
      const boxes = { CH: START.CH!, JU: START.JU! }
      const result = applyLayoutRules({ boxes, body: REF, params: only('choShape'), measure: measureInset, jamo: { cho: 'ㅁ', jung: 'ㅏ', jong: '' } })
      expect(bottomOf(result.boxes.CH!)).toBeCloseTo(bottomOf(START.CH!))
    })

    it('규칙 B · ㅣ는 오른면이 기둥 줄(.779)에 서고 폭은 그대로, ㅔ는 왼가지까지 맞춘다', () => {
      const i = run('stemColumn', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄴ' }).boxes.JU!
      expect(rightOf(i)).toBeCloseTo(STEM_COLUMN_TARGET['ㅣ'].right)
      expect(i.width).toBeCloseTo(START.JU!.width)
      const e = run('stemColumn', { cho: 'ㅁ', jung: 'ㅔ', jong: 'ㄴ' }).boxes.JU!
      expect(e.x).toBeCloseTo(STEM_COLUMN_TARGET['ㅔ'].left!)
      expect(rightOf(e)).toBeCloseTo(STEM_COLUMN_TARGET['ㅔ'].right)
    })

    it('규칙 C · 받침 윗면은 모양 갈래를 따른다(ㄴ .654 · ㄹ .577 · ㅎ .54)', () => {
      expect(run('jongShape', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄴ' }).boxes.JO!.y).toBeCloseTo(JONG_TOP_OVERRIDE['ㄴ'])
      expect(run('jongShape', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄹ' }).boxes.JO!.y).toBeCloseTo(JONG_SHAPE_TOP.stacked)
      expect(run('jongShape', { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㅎ' }).boxes.JO!.y).toBeCloseTo(JONG_SHAPE_TOP.dot)
    })

    it('규칙 D · 받침 ㄴ이면 기둥이 받침 윗면 아래로 내려오고, ㄱ이면 안 움직인다', () => {
      const reach = run('pillarReach', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄴ' }).boxes.JU!
      expect(bottomOf(reach)).toBeCloseTo(START.JO!.y + 0.067)
      expect(reach.y).toBeCloseTo(START.JU!.y)
      expect(run('pillarReach', { cho: 'ㅁ', jung: 'ㅣ', jong: 'ㄱ' }).steps).toEqual([])
    })

    it('다른 글자 몸에서는 몸 안의 같은 비율 자리로 옮긴다', () => {
      const result = applyLayoutRules({ boxes: START, body: BODY, params: only('jongShape'), measure: measureInset, jamo: { cho: 'ㅁ', jung: 'ㅏ', jong: 'ㄹ' } })
      const ratio = (JONG_SHAPE_TOP.stacked - REF.top) / (REF.bottom - REF.top)
      expect(result.boxes.JO!.y).toBeCloseTo(BODY.top + ratio * (BODY.bottom - BODY.top))
    })
  })
})
