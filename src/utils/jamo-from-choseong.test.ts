import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { CLUSTER_SPLIT, DOUBLE_SPLIT, borrowFromChoseong, canBorrowFromChoseong, clusterFromChoseong, doubleFromSingle, jongseongFromChoseong, matchesChoseong } from './jamoFromChoseong'

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
    expect(matchesChoseong({ 'ㄱ': choseong }, jongseong)).toBe(false)
    const copied = jongseongFromChoseong(choseong, jongseong)
    expect(matchesChoseong({ 'ㄱ': choseong }, copied)).toBe(true)
    const edited = { ...copied, strokes: [stroke('ㄱ종-1', 0.3)] }
    expect(matchesChoseong({ 'ㄱ': choseong }, edited)).toBe(false)
  })
})

describe('겹받침을 초성 둘로', () => {
  const front: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [{ id: 'ㄱ-1', points: [{ x: 0, y: 0 }, { x: 1, y: 0, handleOut: { x: 0.5, y: 0.2 } }, { x: 1, y: 1 }], closed: false, thickness: 0.07 }] }
  const back: JamoData = { char: 'ㅅ', type: 'choseong', strokes: [stroke('ㅅ-left', 0.5), stroke('ㅅ-right', 1)] }
  const cluster: JamoData = { char: 'ㄳ', type: 'jongseong', strokes: [stroke('ㄳ종-1', 0.2)] }

  it('앞 초성은 왼쪽 구간, 뒤 초성은 오른쪽 구간에 x만 눌러 넣고 id를 받침 꼴로 이어 붙인다', () => {
    const next = clusterFromChoseong(front, back, cluster)
    expect(next.strokes!.map((s) => s.id)).toEqual(['ㄳ종-1', 'ㄳ종-2', 'ㄳ종-3'])
    const { from, to } = CLUSTER_SPLIT.front
    expect(next.strokes![0].points.map((p) => p.x)).toEqual([from, to, to])
    expect(next.strokes![0].points.map((p) => p.y)).toEqual([0, 0, 1])
    expect(next.strokes![0].points[1].handleOut).toEqual({ x: from + 0.5 * (to - from), y: 0.2 })
    expect(next.strokes![1].points[0].x).toBeCloseTo(CLUSTER_SPLIT.back.from + 0.5 * (CLUSTER_SPLIT.back.to - CLUSTER_SPLIT.back.from))
    expect(next.strokes![2].points[0].x).toBe(CLUSTER_SPLIT.back.to)
    expect(next.strokes![0].thickness).toBe(0.07)
  })

  it('한쪽에만 틀이 있으면 틀 없는 쪽은 그 획을 틀 자리에 넣는다', () => {
    const framed: JamoData = { ...front, frame: { strokes: [stroke('f', 0.5)] } }
    const next = clusterFromChoseong(framed, back, cluster)
    expect(next.frame!.strokes!.map((s) => s.id)).toEqual(['ㄳ종-1', 'ㄳ종-2', 'ㄳ종-3'])
    expect(next.frame!.strokes![0].points[0].x).toBeCloseTo(0.5 * CLUSTER_SPLIT.front.to)
    expect(next.frame!.strokes![2].points[0].x).toBe(CLUSTER_SPLIT.back.to)
    expect(clusterFromChoseong(front, back, cluster).frame).toBeUndefined()
  })

  it('앞 · 뒤 초성이 둘 다 있어야 가져올 수 있고, 가져온 뒤엔 초성 모양으로 본다', () => {
    expect(canBorrowFromChoseong({ 'ㄱ': front }, 'ㄳ')).toBe(false)
    expect(canBorrowFromChoseong({ 'ㄱ': front, 'ㅅ': back }, 'ㄳ')).toBe(true)
    expect(canBorrowFromChoseong({ 'ㄱ': front, 'ㅅ': back }, 'ㄲ')).toBe(false)
    expect(borrowFromChoseong({ 'ㄱ': front }, cluster)).toBeNull()
    const choseongJamos = { 'ㄱ': front, 'ㅅ': back }
    expect(matchesChoseong(choseongJamos, cluster)).toBe(false)
    const copied = borrowFromChoseong(choseongJamos, cluster)!
    expect(copied).toEqual(clusterFromChoseong(front, back, cluster))
    expect(matchesChoseong(choseongJamos, copied)).toBe(true)
  })

  it('초성 원본을 건드리지 않는다', () => {
    clusterFromChoseong(front, back, cluster).strokes![0].points[1].handleOut!.x = 0.99
    expect(front.strokes![0].points[1].handleOut).toEqual({ x: 0.5, y: 0.2 })
  })
})

describe('쌍자음 초성을 홑자음 둘로', () => {
  const single: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [stroke('ㄱ-1', 0), stroke('ㄱ-2', 1)], frame: { strokes: [stroke('ㄱ-1', 0.5)] } }
  const double: JamoData = { char: 'ㄲ', type: 'choseong', strokes: [stroke('ㄲ-1', 0.1), stroke('ㄲ-3', 0.7)], contextualInkSafety: { origin: {}, minimumGap: 0.01 } }

  it('홑자음 획을 앞 · 뒤 구간에 x만 눌러 두 번 넣고, id는 초성 꼴로 이어 붙인다', () => {
    const next = doubleFromSingle(single, double)!
    const { front, back } = DOUBLE_SPLIT['ㄲ']
    expect(next.type).toBe('choseong')
    expect(next.strokes!.map((s) => s.id)).toEqual(['ㄲ-1', 'ㄲ-2', 'ㄲ-3', 'ㄲ-4'])
    expect(next.strokes!.map((s) => s.points[0].x)).toEqual([front.from, front.to, back.from, back.to])
    expect(next.strokes!.every((s) => s.thickness === 0.07)).toBe(true)
    expect(next.frame!.strokes!.map((s) => s.id)).toEqual(['ㄲ-1', 'ㄲ-2'])
    expect(next.contextualInkSafety).toBeUndefined()
  })

  it('짝이 아닌 홑자음이나 쌍자음이 아닌 자소는 null', () => {
    expect(doubleFromSingle({ ...single, char: 'ㄷ' }, double)).toBeNull()
    expect(doubleFromSingle(single, { ...double, char: 'ㄱ' })).toBeNull()
  })

  it('홑자음 원본을 건드리지 않는다', () => {
    const before = structuredClone(single)
    doubleFromSingle(single, double)
    expect(single).toEqual(before)
  })
})
