import { describe, expect, it } from 'vitest'
import baseJamos from '../src/data/baseJamos.json'
import basePresets from '../src/data/basePresets.json'
import type { JamoData, LayoutSchema } from '../src/types'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { pointsToSvgD } from '../src/utils/pathUtils'

const jamos = baseJamos as unknown as {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}

describe('기존 렌더링 계약', () => {
  it('ㅇ의 베지어 핸들을 보존해 직선 다각형으로 만들지 않는다', () => {
    const stroke = jamos.choseong['ㅇ'].strokes?.[0]
    expect(stroke).toBeDefined()
    const path = pointsToSvgD(stroke!.points, stroke!.closed, { x: 0, y: 0, width: 1, height: 1 }, 100)
    expect(path).toMatch(/[CQ]/)
  })

  it('자음과 모음은 슬롯 크기와 무관한 같은 기본 획 두께를 유지한다', () => {
    const consonant = jamos.choseong['ㄱ'].strokes?.[0].thickness
    const vowel = jamos.jungseong['ㅏ'].strokes?.[0].thickness
    const final = jamos.jongseong['ㅇ'].strokes?.[0].thickness
    expect([consonant, vowel, final]).toEqual([0.07, 0.07, 0.07])
  })

  it('자모 마스터에는 조합용 padding을 저장하지 않는다', () => {
    for (const map of [jamos.choseong, jamos.jungseong, jamos.jongseong]) {
      for (const jamo of Object.values(map)) {
        expect(jamo.padding).toBeUndefined()
        expect(jamo.horizontalPadding).toBeUndefined()
        expect(jamo.verticalPadding).toBeUndefined()
      }
    }
  })

  it('혼합중성은 가로부와 세로부를 서로 다른 기존 슬롯에 배치한다', () => {
    const schemas = basePresets.schemas as unknown as Record<string, LayoutSchema>
    const boxes = calculateBoxes(schemas['choseong-jungseong-mixed'])
    expect(boxes.JU_H).toBeDefined()
    expect(boxes.JU_V).toBeDefined()
    expect(boxes.JU_H).not.toEqual(boxes.JU_V)
  })
})
