import { describe, expect, it } from 'vitest'
import basePresets from '../src/data/basePresets.json'
import type { LayoutSchema } from '../src/types'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { USER_PRESET_01_LAYOUT_PROFILE } from './userPreset01'

const schemas = basePresets.schemas as unknown as Record<string, LayoutSchema>

function horizontalJongSchema(): LayoutSchema {
  return {
    ...structuredClone(schemas['choseong-jungseong-horizontal-jongseong']),
    userPartOverrides: structuredClone(
      USER_PRESET_01_LAYOUT_PROFILE['choseong-jungseong-horizontal-jongseong'],
    ),
  }
}

describe('닫힌 초성 아래의 ㅗ·ㅛ 배치', () => {
  it.each(['ㅗ', 'ㅛ'])('%s가 ㄷ의 하단 획을 관통하지 않는다', (jungseong) => {
    const boxes = calculateBoxes(horizontalJongSchema(), { cho: 'ㄷ', jung: jungseong, jong: 'ㅇ' })
    const choseong = boxes.CH!
    const jung = boxes.JU!

    expect(jung.y).toBeGreaterThanOrEqual(choseong.y + choseong.height + .07)
  })

  it('동에서도 ㅗ와 ㄷ의 가로 프리셋 폭을 바꾸지 않는다', () => {
    const closed = calculateBoxes(horizontalJongSchema(), { cho: 'ㄷ', jung: 'ㅗ', jong: 'ㅇ' })
    const open = calculateBoxes(horizontalJongSchema(), { cho: 'ㄱ', jung: 'ㅗ', jong: 'ㅇ' })

    expect(closed.JU!.width).toBeCloseTo(open.JU!.width)
    expect(closed.CH!.width).toBeCloseTo(open.CH!.width)
  })

  it('열린 초성 ㄱ에서는 ㅗ의 기존 돌출을 유지한다', () => {
    const boxes = calculateBoxes(horizontalJongSchema(), { cho: 'ㄱ', jung: 'ㅗ', jong: 'ㅇ' })

    expect(boxes.JU!.width).toBeGreaterThan(boxes.CH!.width)
  })

  it('아랫획만 있는 ㄹ은 닫힌 몸체로 분류하지 않아 로의 중성 폭을 유지한다', () => {
    const boxes = calculateBoxes(horizontalJongSchema(), { cho: 'ㄹ', jung: 'ㅗ', jong: '' })

    expect(boxes.JU!.width).toBeGreaterThan(boxes.CH!.width)
  })

  it('닫힌 초성이어도 ㅜ의 기존 폭은 바꾸지 않는다', () => {
    const boxes = calculateBoxes(horizontalJongSchema(), { cho: 'ㄷ', jung: 'ㅜ', jong: 'ㅇ' })

    expect(boxes.JU!.width).toBeGreaterThan(boxes.CH!.width)
  })
})
