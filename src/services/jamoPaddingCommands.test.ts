import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { moveJamoPadding } from './jamoPaddingCommands'

const giyeok: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [], padding: { top: 0, bottom: 0, left: 0, right: 0 } }

describe('자소 기본형 패딩 이동', () => {
  it('오른쪽 이동을 자소의 좌우 패딩에 반대로 기록한다', () => {
    const result = moveJamoPadding(giyeok, { x: 0.1, y: 0 })
    expect(result.jamo.padding).toEqual({ top: 0, bottom: 0, left: 0.1, right: -0.1 })
    expect(result.delta.x).toBeCloseTo(0.1)
  })

  it('혼합중성의 개별 패딩도 함께 이동한다', () => {
    const mixed: JamoData = { char: 'ㅘ', type: 'jungseong', horizontalStrokes: [], verticalStrokes: [], horizontalPadding: { ...giyeok.padding! }, verticalPadding: { ...giyeok.padding! } }
    const result = moveJamoPadding(mixed, { x: 0, y: -0.1 })
    expect(result.jamo.horizontalPadding?.top).toBeCloseTo(-0.1)
    expect(result.jamo.verticalPadding?.bottom).toBeCloseTo(0.1)
  })
})
