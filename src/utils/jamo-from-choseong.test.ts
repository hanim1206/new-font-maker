import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { jongseongFromChoseong, matchesChoseong } from './jamoFromChoseong'

const stroke = (id: string, x: number) => ({ id, points: [{ x, y: 0 }, { x, y: 1 }], closed: false, thickness: 0.07 })

describe('받침을 초성 모양으로', () => {
  it('초성 기본 획을 받침 id로 복사하고 문맥 변형은 버린다', () => {
    const choseong: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [stroke('ㄱ-1', 0.2)], contextStrokes: { bottom: [stroke('ㄱ-1', 0.9)] } }
    const jongseong: JamoData = { char: 'ㄱ', type: 'jongseong', strokes: [stroke('ㄱ종-1', 0.5), stroke('ㄱ종-2', 0.6)], contextualInkSafety: { origin: {}, minimumGap: 0.01 } }
    const next = jongseongFromChoseong(choseong, jongseong)
    expect(next.type).toBe('jongseong')
    expect(next.strokes).toEqual([stroke('ㄱ종-1', 0.2)])
    expect(next.contextStrokes).toBeUndefined()
    expect(next.contextualInkSafety).toBeUndefined()
  })

  it('틀은 초성 것을 따르고, 받침 변형 카드는 남긴다', () => {
    const override = { id: 'o1', condition: { type: 'jungseong' as const, values: ['ㅗ'] }, strokes: [stroke('x', 0.1)] }
    const choseong: JamoData = { char: 'ㄴ', type: 'choseong', strokes: [stroke('a', 0.3)], frame: { strokes: [stroke('a', 0.4)], contextStrokes: { right: [] } } }
    const jongseong = { char: 'ㄴ', type: 'jongseong', strokes: [stroke('b', 0.5)], frame: { strokes: [stroke('b', 0.1)] }, overrides: [override] } as unknown as JamoData
    const next = jongseongFromChoseong(choseong, jongseong)
    expect(next.frame).toEqual({ strokes: [stroke('ㄴ종-1', 0.4)] })
    expect(next.overrides).toEqual([override])
  })

  it('초성에 틀이 없으면 받침의 옛 틀도 지운다', () => {
    const choseong: JamoData = { char: 'ㅁ', type: 'choseong', strokes: [stroke('a', 0.3)] }
    const jongseong: JamoData = { char: 'ㅁ', type: 'jongseong', strokes: [stroke('b', 0.5)], frame: { strokes: [stroke('b', 0.1)] } }
    expect(jongseongFromChoseong(choseong, jongseong).frame).toBeUndefined()
  })

  it('초성 원본을 건드리지 않는다', () => {
    const choseong: JamoData = { char: 'ㄷ', type: 'choseong', strokes: [stroke('a', 0.3)] }
    const next = jongseongFromChoseong(choseong, { char: 'ㄷ', type: 'jongseong', strokes: [] })
    next.strokes![0].points[0].x = 0.99
    expect(choseong.strokes![0].points[0].x).toBe(0.3)
    expect(choseong.strokes![0].id).toBe('a')
  })

  it('복사한 뒤엔 초성 모양으로 보고, 받침을 고치면 아니다', () => {
    const choseong: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [stroke('ㄱ-1', 0.2)], frame: { strokes: [stroke('ㄱ-1', 0.1)] } }
    const jongseong: JamoData = { char: 'ㄱ', type: 'jongseong', strokes: [stroke('ㄱ종-1', 0.5)] }
    expect(matchesChoseong(choseong, jongseong)).toBe(false)
    const copied = jongseongFromChoseong(choseong, jongseong)
    expect(matchesChoseong(choseong, copied)).toBe(true)
    const edited = { ...copied, strokes: [stroke('ㄱ종-1', 0.3)] }
    expect(matchesChoseong(choseong, edited)).toBe(false)
  })
})
