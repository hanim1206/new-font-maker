import { describe, expect, it } from 'vitest'
import basePresets from '../src/data/basePresets.json'
import type { LayoutSchema } from '../src/types'
import { calculateBoxes } from '../src/utils/layoutCalculator'

describe('Design Body 내부 레이아웃 비례 변환', () => {
  it('가로폭을 줄이면 세로중성 슬롯과 내부 여백도 같은 비율로 줄인다', () => {
    const schema = structuredClone((basePresets.schemas as Record<string, LayoutSchema>)['choseong-jungseong-vertical'])
    const base = calculateBoxes({
      ...schema,
      designBodyPadding: { top: .075, right: .075, bottom: .075, left: .075 },
    })
    const narrow = calculateBoxes({
      ...schema,
      designBodyPadding: { top: .075, right: .2, bottom: .075, left: .2 },
    })
    const expectedScale = .6 / .85

    expect(narrow.CH!.width / base.CH!.width).toBeCloseTo(expectedScale)
    expect(narrow.JU!.width / base.JU!.width).toBeCloseTo(expectedScale)
    expect((narrow.JU!.x - .2) / (base.JU!.x - .075)).toBeCloseTo(expectedScale)
  })
})
