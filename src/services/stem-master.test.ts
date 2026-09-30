import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2 } from '../types'
import { applyMaster, boundStrokesOf, followsInJamo, followsMaster, instanceOf, masterNameOf, masterOf, medialBoxEmOf, refollow, stemReferenceBox, straightMaster, thinBox, type StemMaster } from './stemMaster'

const line = (id: string, from: [number, number], to: [number, number]): StrokeDataV2 => ({ id, points: [{ x: from[0], y: from[1] }, { x: to[0], y: to[1] }], closed: false, thickness: 0.07 })
const bent: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] }
const SQUARE = { width: 1, height: 1 }

describe('마스터 → 인스턴스', () => {
  it('곧은 마스터는 획을 그대로 둔다', () => {
    const stroke = line('ㅣ-1', [0, 0], [0, 1])
    expect(instanceOf(stroke, straightMaster('gidung'), SQUARE).points).toEqual(stroke.points)
    expect(followsMaster(stroke, straightMaster('gidung'), SQUARE)).toBe(true)
  })

  it('휜 마스터는 끝점을 두고 사이 핸들만 오프셋만큼 옮긴다 — 위→아래 기둥은 +o가 오른쪽', () => {
    const next = instanceOf(line('ㅣ-1', [0.5, 0], [0.5, 1]), bent, SQUARE)
    expect(next.points[0]).toMatchObject({ x: 0.5, y: 0 })
    expect(next.points[1]).toMatchObject({ x: 0.5, y: 1 })
    expect(next.points[0].handleOut!.x).toBeCloseTo(0.53)
    expect(next.points[0].handleOut!.y).toBeCloseTo(0.4)
    expect(next.points[1].handleIn!.x).toBeCloseTo(0.49)
  })

  it('오프셋은 상자가 아니라 글자 폭 기준이라 좁은 상자에서 상자 좌표로는 더 크게 휜다', () => {
    const wide = instanceOf(line('a', [0, 0], [0, 1]), bent, { width: 0.2, height: 0.9 })
    const narrow = instanceOf(line('a', [0, 0], [0, 1]), bent, { width: 0.1, height: 0.9 })
    expect(wide.points[0].handleOut!.x).toBeCloseTo(0.15)
    expect(narrow.points[0].handleOut!.x).toBeCloseTo(0.3)
  })

  it('가로줄기는 수직이 y다 — 왼→오른 보는 +o가 위', () => {
    const next = instanceOf(line('ㅡ-1', [0, 0.5], [1, 0.5]), { ...bent, name: 'bo' }, { width: 0.75, height: 0.2 })
    expect(next.points[0].handleOut!.y).toBeCloseTo(0.5 - 0.03 / 0.2)
    expect(next.points[0].handleOut!.x).toBeCloseTo(0.4)
  })

  it('따름 판정: 인스턴스와 같으면 따르고, 점을 옮기면 풀린다', () => {
    const stroke = instanceOf(line('a', [0, 0], [0, 1]), bent, SQUARE)
    expect(followsMaster(stroke, bent, SQUARE)).toBe(true)
    expect(followsMaster(stroke, straightMaster('gidung'), SQUARE)).toBe(false)
    const moved = { ...stroke, points: [stroke.points[0], { ...stroke.points[1], handleIn: { x: 0.2, y: 0.7 } }] }
    expect(followsMaster(moved, bent, SQUARE)).toBe(false)
  })
})

describe('이름과 표', () => {
  const ae: JamoData = { char: 'ㅐ', type: 'jungseong', strokes: [line('ㅐ-1', [0, 0], [0, 1]), line('ㅐ-2', [0, 0.5], [1, 0.5]), line('ㅐ-3', [1, 0], [1, 1])] }
  const a: JamoData = { char: 'ㅏ', type: 'jungseong', strokes: [line('ㅏ-1', [0, 0], [0, 1]), line('ㅏ-2', [0, 0.5], [1, 0.5])] }

  it('기둥이 둘이면 왼쪽이 안 기둥, 하나면 바깥 기둥(갈래 이름 = 줄기 · 질문 답)', () => {
    expect(masterNameOf(ae, ae.strokes!, 'ㅐ-1')).toBe('gidung.inner.single')
    expect(masterNameOf(ae, ae.strokes!, 'ㅐ-3')).toBe('gidung.outer.single')
    expect(masterNameOf(ae, ae.strokes!, 'ㅐ-2')).toBe('geolchim')
    expect(masterNameOf(a, a.strokes!, 'ㅏ-1')).toBe('gidung.outer.single')
    expect(masterNameOf(a, a.strokes!, 'stroke-123')).toBeNull()
  })

  it('기둥.안쪽 마스터가 없으면 기둥을 따르고, 있으면 제 것', () => {
    expect(masterOf({ gidung: bent }, 'gidung.inner').points).toEqual(bent.points)
    const inner: StemMaster = { name: 'gidung.inner', points: [{ t: 0, o: 0 }, { t: 1, o: 0 }] }
    expect(masterOf({ gidung: bent, 'gidung.inner': inner }, 'gidung.inner')).toBe(inner)
    expect(masterOf({}, 'bo')).toEqual(straightMaster('bo'))
  })

  it('칸 표: 받침 없음 · 있음 · 평균, 두께 0인 변은 바닥값', () => {
    expect(medialBoxEmOf('ㅏ', 'strokes', 'open').height).toBeGreaterThan(medialBoxEmOf('ㅏ', 'strokes', 'closed').height)
    const mean = medialBoxEmOf('ㅏ', 'strokes')
    expect(mean.width).toBeCloseTo((medialBoxEmOf('ㅏ', 'strokes', 'open').width + medialBoxEmOf('ㅏ', 'strokes', 'closed').width) / 2)
    expect(medialBoxEmOf('ㅡ', 'strokes').height).toBeGreaterThan(0)
    expect(medialBoxEmOf('ㅘ', 'verticalStrokes').width).toBeLessThan(medialBoxEmOf('ㅘ', 'horizontalStrokes').width)
    expect(medialBoxEmOf('없음', 'strokes')).toEqual({ width: 1, height: 1 })
  })

  it('귀속 획 목록과 따름', () => {
    const bound = boundStrokesOf(ae, {})
    expect(bound.map((item) => [item.stroke.id, item.name, item.follows])).toEqual([['ㅐ-1', 'gidung.inner.single', true], ['ㅐ-2', 'geolchim', true], ['ㅐ-3', 'gidung.outer.single', true]])
  })

  it('상자가 두께보다 얇은 채널(ㅣ · ㅡ · ㅢ)도 따른다 — 휠 방향의 변만 ㅏ 칸 폭 · ㅗ 칸 높이를 빌린다', () => {
    const i: JamoData = { char: 'ㅣ', type: 'jungseong', strokes: [line('ㅣ-1', [0.5, 0], [0.5, 1])] }
    const eu: JamoData = { char: 'ㅡ', type: 'jungseong', strokes: [line('ㅡ-1', [0, 0.5], [1, 0.5])] }
    const ui: JamoData = { char: 'ㅢ', type: 'jungseong', horizontalStrokes: [line('ㅢ-1', [0, 0.5], [1, 0.5])], verticalStrokes: [line('ㅢ-2', [0.5, 0], [0.5, 1])] }
    expect(thinBox(i.strokes![0], medialBoxEmOf('ㅣ', 'strokes'))).toBe(true)
    expect(thinBox(line('ㅏ-1', [0, 0], [0, 1]), medialBoxEmOf('ㅏ', 'strokes'))).toBe(false)
    const iReference = stemReferenceBox('ㅣ', 'strokes', i.strokes![0])
    expect(iReference.width).toBeCloseTo(medialBoxEmOf('ㅏ', 'strokes', 'open').width)
    expect(iReference.height).toBeCloseTo(medialBoxEmOf('ㅣ', 'strokes', 'open').height)
    expect(stemReferenceBox('ㅡ', 'strokes', eu.strokes![0]).height).toBeCloseTo(medialBoxEmOf('ㅗ', 'strokes', 'open').height)
    expect(boundStrokesOf(i, {}).map((item) => [item.blocked, item.follows])).toEqual([[false, true]])
    const bentI = applyMaster(i, {}, { gidung: bent })!
    // 휨 0.03em = ㅏ 칸 폭 비율로 적힌다.
    expect(bentI.strokes![0].points[0].handleOut!.x - 0.5).toBeCloseTo(0.03 / iReference.width)
    expect(boundStrokesOf(bentI, { gidung: bent })[0].follows).toBe(true)
    expect(applyMaster(eu, {}, { bo: bent })).not.toBeNull()
    expect(applyMaster(ui, {}, { gidung: bent, bo: bent })!.verticalStrokes![0].points[0].handleOut).toBeDefined()
  })
})

describe('마스터 바꾸기와 다시 따르기', () => {
  const ae: JamoData = { char: 'ㅐ', type: 'jungseong', strokes: [line('ㅐ-1', [0, 0], [0, 1]), line('ㅐ-2', [0, 0.5], [1, 0.5]), line('ㅐ-3', [1, 0], [1, 1])] }

  it('기둥을 휘면 따르던 기둥 둘이 같이 휘고 걸침은 그대로', () => {
    const next = applyMaster(ae, {}, { gidung: bent })!
    expect(next).not.toBeNull()
    expect(next.strokes![0].points[0].handleOut).toBeDefined()
    expect(next.strokes![2].points[0].handleOut).toBeDefined()
    expect(next.strokes![1]).toBe(ae.strokes![1])
    expect(boundStrokesOf(next, { gidung: bent }).every((item) => item.follows)).toBe(true)
  })

  it('풀린 획은 마스터를 다시 바꿔도 그대로이고, 다시 따르기로 붙는다', () => {
    const curved = applyMaster(ae, {}, { gidung: bent })!
    const released = { ...curved, strokes: curved.strokes!.map((stroke, index) => index === 2 ? { ...stroke, points: [{ x: 1, y: 0 }, { x: 0.9, y: 1 }] } : stroke) }
    const flatter: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.01 } }, { t: 1, o: 0 }] }
    const next = applyMaster(released, { gidung: bent }, { gidung: flatter })!
    expect(next.strokes![0].points[0].handleOut!.x).toBeCloseTo(0.01 / medialBoxEmOf('ㅐ', 'strokes', 'open').width)
    expect(next.strokes![2]).toBe(released.strokes![2])
    const back = refollow(next, { gidung: flatter }, 'strokes', 'ㅐ-3')!
    expect(followsMaster(back.strokes![2], flatter, medialBoxEmOf('ㅐ', 'strokes', 'open'))).toBe(true)
    expect(refollow(back, { gidung: flatter }, 'strokes', 'ㅐ-3')).toBeNull()
  })

  it('바뀐 획이 없으면 null', () => {
    expect(applyMaster(ae, {}, {})).toBeNull()
    expect(applyMaster(ae, {}, { bo: bent })).toBeNull()
  })
})

describe('G1 홀드아웃', () => {
  it('곁줄기 마스터: ㅏ의 긴 곁줄기와 ㅔ의 짧은 곁줄기가 같은 em만큼 휜다', () => {
    const bow: StemMaster = { name: 'gyeotjulgi', points: [{ t: 0, o: 0, handleOut: { t: 0.5, o: 0.02 } }, { t: 1, o: 0 }] }
    const a = instanceOf(line('ㅏ-2', [0, 0.5], [1, 0.5]), bow, medialBoxEmOf('ㅏ', 'strokes', 'open'))
    const e = instanceOf(line('ㅔ-2', [0, 0.5], [0.5, 0.5]), bow, medialBoxEmOf('ㅔ', 'strokes', 'open'))
    const liftEm = (stroke: StrokeDataV2, char: string) => (0.5 - stroke.points[0].handleOut!.y) * medialBoxEmOf(char, 'strokes', 'open').height
    expect(liftEm(a, 'ㅏ')).toBeCloseTo(0.02, 5)
    expect(liftEm(e, 'ㅔ')).toBeCloseTo(0.02, 5)
    // 축 방향 자리는 길이에 비례한다(몸통만 늘이기).
    expect(a.points[0].handleOut!.x).toBeCloseTo(0.5)
    expect(e.points[0].handleOut!.x).toBeCloseTo(0.25)
  })

  it('짧은기둥 마스터: ㅛ의 짧은기둥 둘이 같이 휜다', () => {
    const yo: JamoData = { char: 'ㅛ', type: 'jungseong', strokes: [line('ㅛ-1', [0.3, 0], [0.3, 1]), line('ㅛ-2', [0.7, 0], [0.7, 1]), line('ㅛ-3', [0, 1], [1, 1])] }
    const next = applyMaster(yo, {}, { jjalbeungidung: { ...bent, name: 'jjalbeungidung' } })!
    expect(next.strokes![0].points[0].handleOut).toBeDefined()
    expect(next.strokes![1].points[0].handleOut).toBeDefined()
    expect(next.strokes![2]).toBe(yo.strokes![2])
  })

  it('기둥.안쪽: 따로 그리기 전엔 기둥을 따르고, 따로 그리면 갈라지고, 지우면 다시 기둥', () => {
    const ae: JamoData = { char: 'ㅐ', type: 'jungseong', strokes: [line('ㅐ-1', [0, 0], [0, 1]), line('ㅐ-2', [0, 0.5], [1, 0.5]), line('ㅐ-3', [1, 0], [1, 1])] }
    const withGidung = applyMaster(ae, {}, { gidung: bent })!
    expect(withGidung.strokes![0].points[0].handleOut!.x - 0).toBeCloseTo(withGidung.strokes![2].points[0].handleOut!.x - 1)
    const inner: StemMaster = { name: 'gidung.inner', points: [{ t: 0, o: 0 }, { t: 1, o: 0 }] }
    const split = applyMaster(withGidung, { gidung: bent }, { gidung: bent, 'gidung.inner': inner })!
    expect(split.strokes![0].points[0].handleOut).toBeUndefined()
    expect(split.strokes![2]).toBe(withGidung.strokes![2])
    const merged = applyMaster(split, { gidung: bent, 'gidung.inner': inner }, { gidung: bent })!
    expect(merged.strokes![0].points[0].handleOut).toBeDefined()
    expect(boundStrokesOf(merged, { gidung: bent }).every((item) => item.follows)).toBe(true)
  })

  it('마스터가 하나도 없으면 어떤 홀자도 안 바뀐다', () => {
    const a: JamoData = { char: 'ㅏ', type: 'jungseong', strokes: [line('ㅏ-1', [0, 0], [0, 1]), line('ㅏ-2', [0, 0.5], [1, 0.5])] }
    expect(applyMaster(a, {}, {})).toBeNull()
    expect(boundStrokesOf(a, {}).every((item) => item.follows)).toBe(true)
  })
})

describe('반영 창에서 고른 획', () => {
  it('keep이 있으면 고른 획은 풀렸어도 덮이고, 뺀 획만 지금 모양으로 남는다', () => {
    const ae: JamoData = { type: 'jungseong', char: 'ㅐ', strokes: [line('ㅐ-1', [0, 0], [0, 1]), line('ㅐ-2', [0, 0.5], [0.5, 0.5]), line('ㅐ-3', [0.5, 0], [0.5, 1])] }
    const released = { ...ae, strokes: [{ ...ae.strokes![0], points: [{ x: 0, y: 0 }, { x: 0.1, y: 1 }] }, ae.strokes![1], ae.strokes![2]] }
    // 마스터만 고치면 풀린 안 기둥은 그대로.
    const plain = applyMaster(released, {}, { gidung: bent })!
    expect(plain.strokes![0].points[1]).toEqual({ x: 0.1, y: 1 })
    // 반영 창에서 골랐으면(keep이 빼지 않음) 풀린 획도 덮인다.
    const picked = applyMaster(released, {}, { gidung: bent }, () => false)!
    expect(followsInJamo(picked, 'strokes', picked.strokes![0], bent)).toBe(true)
    expect(followsInJamo(picked, 'strokes', picked.strokes![2], bent)).toBe(true)
    // 뺀 획은 그대로.
    const kept = applyMaster(released, {}, { gidung: bent }, (id) => id === 'ㅐ-1')!
    expect(kept.strokes![0].points[1]).toEqual({ x: 0.1, y: 1 })
    expect(followsInJamo(kept, 'strokes', kept.strokes![2], bent)).toBe(true)
  })
})
