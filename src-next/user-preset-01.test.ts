import { describe, expect, it } from 'vitest'
import { USER_PRESET_01_JAMOS, USER_PRESET_01_LAYOUT_PROFILE } from './userPreset01'

describe('사용자 프리셋 01', () => {
  it('레이아웃 보정값을 5 unit 그리드에 맞춘다', () => {
    for (const layout of Object.values(USER_PRESET_01_LAYOUT_PROFILE)) {
      for (const part of Object.values(layout ?? {})) {
        for (const value of Object.values(part)) {
          expect(Math.round(value * 200)).toBeCloseTo(value * 200)
        }
      }
    }
  })

  it('초성 ㅇ과 종성 ㅎ의 원형 중심과 핸들을 대칭으로 정돈한다', () => {
    const initialCircle = USER_PRESET_01_JAMOS.choseong['ㅇ'].strokes?.[0]
    const finalCircle = USER_PRESET_01_JAMOS.jongseong['ㅎ'].strokes?.find((stroke) => stroke.id === 'ㅎ종-circle')

    expect(initialCircle?.points[0].x).toBe(initialCircle?.points[2].x)
    expect(initialCircle?.points[1].y).toBe(initialCircle?.points[3].y)
    expect(finalCircle?.points[0].x).toBe(finalCircle?.points[2].x)
    expect(finalCircle?.points[1].y).toBe(finalCircle?.points[3].y)
    expect(finalCircle?.points[1].x).toBeCloseTo(1 - (finalCircle?.points[3].x ?? 0))
  })

  it('곡선 끝획은 슬롯 밖으로 과도하게 돌출되지 않는다', () => {
    const initialRieul = USER_PRESET_01_JAMOS.choseong['ㄹ'].strokes?.[0]
    const finalRieul = USER_PRESET_01_JAMOS.jongseong['ㄹ'].strokes?.[0]

    expect(initialRieul?.points.at(-1)?.x).toBeLessThanOrEqual(1.15)
    expect(finalRieul?.points.at(-1)?.x).toBeLessThanOrEqual(1.15)
  })
})
