import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2 } from '../types'
import { withUniqueStrokeIdsInFontData, withUniqueStrokeIdsInMap } from './strokeIdRepair'

const stroke = (id: string, x: number): StrokeDataV2 => ({ id, points: [{ x, y: 0 }, { x, y: 1 }], closed: false, thickness: .07 })
const ids = (strokes?: StrokeDataV2[]) => strokes?.map((item) => item.id)

describe('withUniqueStrokeIdsInMap', () => {
  it('옛 끊기로 겹친 획 id를 기본 획 · 계열 변형 · 틀에서 같은 규칙으로 고친다', () => {
    const broken: JamoData = {
      char: 'ㅁ',
      type: 'choseong',
      strokes: [stroke('ㅁ-1', 0), stroke('ㅁ-1-b', .5), stroke('ㅁ-1-b', 1)],
      contextStrokes: { bottom: [stroke('x', 0), stroke('x', 1)] },
      frame: { strokes: [stroke('ㅁ-1', 0), stroke('ㅁ-1-b', .5), stroke('ㅁ-1-b', 1)] },
    }
    const ok: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [stroke('ㄱ-1', 0)] }
    const map = { 'ㅁ': broken, 'ㄱ': ok }
    const fixed = withUniqueStrokeIdsInMap(map)
    expect(ids(fixed['ㅁ'].strokes)).toEqual(['ㅁ-1', 'ㅁ-1-b', 'ㅁ-1-b-2'])
    expect(ids(fixed['ㅁ'].contextStrokes?.bottom)).toEqual(['x', 'x-2'])
    expect(ids(fixed['ㅁ'].frame?.strokes)).toEqual(['ㅁ-1', 'ㅁ-1-b', 'ㅁ-1-b-2'])
    // 획 모양은 그대로다.
    expect(fixed['ㅁ'].strokes![2].points).toEqual(broken.strokes![2].points)
    // 멀쩡한 자모와 고칠 것이 없는 지도는 같은 객체 그대로.
    expect(fixed['ㄱ']).toBe(ok)
    expect(withUniqueStrokeIdsInMap(fixed)).toBe(fixed)
  })

  it('섞임홀자의 가로부 · 세로부는 한 자모로 함께 센다', () => {
    const mixed: JamoData = { char: 'ㅘ', type: 'jungseong', horizontalStrokes: [stroke('s', 0)], verticalStrokes: [stroke('s', 1)] }
    const fixed = withUniqueStrokeIdsInMap({ 'ㅘ': mixed })['ㅘ']
    expect(ids(fixed.horizontalStrokes)).toEqual(['s'])
    expect(ids(fixed.verticalStrokes)).toEqual(['s-2'])
  })
})

describe('withUniqueStrokeIdsInFontData', () => {
  it('저장 꼴 세 지도의 겹친 획 id를 고치고, 고칠 것이 없으면 같은 값을 돌려준다', () => {
    const jamo: JamoData = { char: 'ㅁ', type: 'choseong', strokes: [stroke('a', 0), stroke('a', 1)] }
    const font = { version: '1.5.0', jamoData: { choseong: { 'ㅁ': jamo }, jungseong: {}, jongseong: {} } }
    const fixed = withUniqueStrokeIdsInFontData(font) as typeof font
    expect(ids(fixed.jamoData.choseong['ㅁ'].strokes)).toEqual(['a', 'a-2'])
    expect(font.jamoData.choseong['ㅁ'].strokes!.map((item) => item.id)).toEqual(['a', 'a'])
    expect(withUniqueStrokeIdsInFontData(fixed)).toBe(fixed)
    expect(withUniqueStrokeIdsInFontData(null)).toBe(null)
  })
})
