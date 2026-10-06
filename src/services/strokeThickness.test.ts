import { describe, expect, it } from 'vitest'
import { PEN_DEFAULT_THICKNESS } from './penJamo'
import { baseStrokeThickness, isBaseThickness, STROKE_THICKNESS_PERCENT, thicknessAtPercent, thicknessPercent } from './strokeThickness'

describe('획마다 굵기', () => {
  const preset = [{ id: 'ㄱ-1', thickness: 0.07 }, { id: 'ㄱ-2', thickness: 0.05 }]

  it('기본 굵기는 프리셋의 같은 획 값이고, 프리셋에 없는 획은 펜 기본값이다', () => {
    expect(baseStrokeThickness(preset, 'ㄱ-2')).toBe(0.05)
    expect(baseStrokeThickness(preset, 'pen-1')).toBe(PEN_DEFAULT_THICKNESS)
  })

  it('%는 그 획의 기본 굵기에 대한 값이다', () => {
    expect(thicknessPercent(0.07, 0.07)).toBe(100)
    expect(thicknessPercent(0.084, 0.07)).toBe(120)
    expect(thicknessPercent(0.03, 0.05)).toBe(60)
  })

  it('막대의 %를 저장 굵기로 되돌리면 같은 %가 읽힌다', () => {
    for (let percent = STROKE_THICKNESS_PERCENT.min; percent <= STROKE_THICKNESS_PERCENT.max; percent += STROKE_THICKNESS_PERCENT.step) {
      expect(thicknessPercent(thicknessAtPercent(percent, 0.07), 0.07)).toBe(percent)
    }
  })

  it('100%는 기본 굵기 그대로다(곱셈 꼬리 없이)', () => {
    expect(thicknessAtPercent(100, 0.07)).toBe(0.07)
    expect(isBaseThickness(thicknessAtPercent(100, 0.07), 0.07)).toBe(true)
    expect(isBaseThickness(thicknessAtPercent(105, 0.07), 0.07)).toBe(false)
  })

  it('범위 밖 요청은 끝에서 멈춘다', () => {
    expect(thicknessAtPercent(10, 0.07)).toBeCloseTo(0.035)
    expect(thicknessAtPercent(400, 0.07)).toBeCloseTo(0.14)
  })

  it('막대 범위 밖의 옛 저장값도 %로 그대로 읽는다', () => {
    expect(thicknessPercent(0.21, 0.07)).toBe(300)
  })
})
