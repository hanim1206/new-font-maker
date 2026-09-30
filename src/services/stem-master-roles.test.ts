import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { JamoData } from '../types'
import { applyMaster, boundStrokesOf, JAMO_CHANNELS, masterFromStroke, masterNameOf, masterOf, stemReferenceBox, type StemMaster, type StemMasters } from './stemMaster'

const jung = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const bend = (name: StemMaster['name'], o = 0.03): StemMaster => ({ name, points: [{ t: 0, o: 0 }, { t: 1, o: 0, handleIn: { t: 0.7, o } }] })
const channelOf = (jamo: JamoData, id: string) => JAMO_CHANNELS.find((channel) => jamo[channel]?.some((stroke) => stroke.id === id))!
const nameOf = (char: string, id: string) => masterNameOf(jung[char], jung[char][channelOf(jung[char], id)]!, id)
const curvedAfter = (masters: StemMasters, char: string, id: string) => {
  const next = applyMaster(jung[char], {}, masters) ?? jung[char]
  return next[channelOf(next, id)]!.find((stroke) => stroke.id === id)!.points.some((point) => point.handleIn || point.handleOut)
}

describe('줄기 역할 갈래', () => {
  it('짧은기둥은 솟음 · 내림 × 하나 · 둘 × 단일 · 섞임, 보는 솟음 · 내림 · 없음 × 단일 · 섞임으로 나뉜다', () => {
    expect([nameOf('ㅗ', 'ㅗ-1'), nameOf('ㅛ', 'ㅛ-1'), nameOf('ㅛ', 'ㅛ-2'), nameOf('ㅘ', 'ㅘ-1')]).toEqual(['jjalbeungidung.up.one.single', 'jjalbeungidung.up.pair.single', 'jjalbeungidung.up.pair.single', 'jjalbeungidung.up.one.mixed'])
    expect([nameOf('ㅜ', 'ㅜ-2'), nameOf('ㅠ', 'ㅠ-2'), nameOf('ㅝ', 'ㅝ-2'), nameOf('ㅟ', 'ㅟ-2')]).toEqual(['jjalbeungidung.down.one.single', 'jjalbeungidung.down.pair.single', 'jjalbeungidung.down.one.mixed', 'jjalbeungidung.down.one.mixed'])
    expect({
      ㅗ: nameOf('ㅗ', 'ㅗ-2'), ㅘ: nameOf('ㅘ', 'ㅘ-2'), ㅚ: nameOf('ㅚ', 'ㅚ-2'), ㅜ: nameOf('ㅜ', 'ㅜ-1'),
      ㅝ: nameOf('ㅝ', 'ㅝ-1'), ㅟ: nameOf('ㅟ', 'ㅟ-1'), ㅡ: nameOf('ㅡ', 'ㅡ-1'), ㅢ: nameOf('ㅢ', 'ㅢ-1'),
    }).toEqual({ ㅗ: 'bo.up.single', ㅘ: 'bo.up.mixed', ㅚ: 'bo.up.mixed', ㅜ: 'bo.down.single', ㅝ: 'bo.down.mixed', ㅟ: 'bo.down.mixed', ㅡ: 'bo.none.single', ㅢ: 'bo.none.mixed' })
  })

  it('갈래 마스터가 없으면 부모를 거슬러 따른다(bo.up.mixed → bo.up → bo)', () => {
    const bo = bend('bo')
    expect(masterOf({ bo }, 'bo.up.mixed').points).toEqual(bo.points)
    const up = bend('bo.up', -0.02)
    expect(masterOf({ bo, 'bo.up': up }, 'bo.up.mixed').points).toEqual(up.points)
    expect(masterOf({ bo, 'bo.up': up }, 'bo.down.mixed').points).toEqual(bo.points)
  })

  it('보.솟음만 그리면 ㅗ ㅛ ㅘ ㅙ ㅚ의 보만 휘고, 보를 그리면 나머지 보가 따라온다', () => {
    const only = { 'bo.up': bend('bo.up') }
    expect(['ㅗ-2', 'ㅛ-3', 'ㅘ-2', 'ㅙ-2', 'ㅚ-2'].map((id) => curvedAfter(only, id.split('-')[0], id))).toEqual([true, true, true, true, true])
    expect(['ㅜ-1', 'ㅠ-1', 'ㅝ-1', 'ㅡ-1', 'ㅢ-1'].map((id) => curvedAfter(only, id.split('-')[0], id))).toEqual([false, false, false, false, false])
    const both = { ...only, bo: bend('bo', -0.02) }
    expect(['ㅜ-1', 'ㅝ-1', 'ㅡ-1', 'ㅢ-1'].map((id) => curvedAfter(both, id.split('-')[0], id))).toEqual([true, true, true, true])
    // ㅗ의 보는 보.솟음을 따른다(보가 아니라).
    const o = applyMaster(jung['ㅗ'], {}, both)!
    expect(boundStrokesOf(o, both).find((item) => item.stroke.id === 'ㅗ-2')!.follows).toBe(true)
  })

  it('짧은기둥은 그려진 방향 그대로 놓는다: 같은 마스터면 ㅗ · ㅜ가 같은 쪽으로 같은 자리에서 휜다(거울 아님)', () => {
    const masters = { jjalbeungidung: bend('jjalbeungidung') }
    const bendOf = (char: string, id: string) => {
      const next = applyMaster(jung[char], {}, masters)!
      const stroke = next.strokes!.find((item) => item.id === id)!
      const box = stemReferenceBox(char, 'strokes', stroke)
      const handle = stroke.points.flatMap((point) => [point.handleIn, point.handleOut]).find(Boolean)!
      const [start, end] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
      // 시작점(그려진 방향의 처음)에서 잰 x 휨(em)과 축 비율.
      return { x: (handle.x - start.x) * box.width, along: Math.abs(handle.y - start.y) / Math.abs(end.y - start.y) }
    }
    const up = bendOf('ㅗ', 'ㅗ-1')
    const down = bendOf('ㅜ', 'ㅜ-2')
    expect(up.along).toBeCloseTo(0.7, 9)
    expect(down.along).toBeCloseTo(0.7, 9)
    expect(Math.abs(up.x)).toBeCloseTo(0.03, 9)
    expect(up.x).toBeCloseTo(down.x, 9)
  })

  it('곁줄기는 오른 · 왼 × 하나 · 둘 위 · 둘 아래 × 단일 · 섞임으로 나뉜다', () => {
    expect({
      ㅏ: nameOf('ㅏ', 'ㅏ-2'), ㅘ: nameOf('ㅘ', 'ㅘ-4'), ㅑ위: nameOf('ㅑ', 'ㅑ-2'), ㅑ아래: nameOf('ㅑ', 'ㅑ-3'),
      ㅓ: nameOf('ㅓ', 'ㅓ-2'), ㅔ: nameOf('ㅔ', 'ㅔ-2'), ㅝ: nameOf('ㅝ', 'ㅝ-4'), ㅞ: nameOf('ㅞ', 'ㅞ-4'),
      ㅕ위: nameOf('ㅕ', 'ㅕ-2'), ㅕ아래: nameOf('ㅕ', 'ㅕ-3'), ㅖ위: nameOf('ㅖ', 'ㅖ-2'), ㅖ아래: nameOf('ㅖ', 'ㅖ-3'),
    }).toEqual({
      ㅏ: 'gyeotjulgi.right.one.single', ㅘ: 'gyeotjulgi.right.one.mixed', ㅑ위: 'gyeotjulgi.right.upper.single', ㅑ아래: 'gyeotjulgi.right.lower.single',
      ㅓ: 'gyeotjulgi.left.one.single', ㅔ: 'gyeotjulgi.left.one.single', ㅝ: 'gyeotjulgi.left.one.mixed', ㅞ: 'gyeotjulgi.left.one.mixed',
      ㅕ위: 'gyeotjulgi.left.upper.single', ㅕ아래: 'gyeotjulgi.left.lower.single', ㅖ위: 'gyeotjulgi.left.upper.single', ㅖ아래: 'gyeotjulgi.left.lower.single',
    })
    // 둘의 위만 그리면 ㅑ ㅕ ㅖ의 위 곁줄기만 휜다.
    const upperOnly = { 'gyeotjulgi.right.upper': bend('gyeotjulgi.right.upper'), 'gyeotjulgi.left.upper': bend('gyeotjulgi.left.upper') }
    expect(['ㅑ-2', 'ㅕ-2', 'ㅖ-2'].map((id) => curvedAfter(upperOnly, id.split('-')[0], id))).toEqual([true, true, true])
    expect(['ㅑ-3', 'ㅕ-3', 'ㅖ-3', 'ㅏ-2', 'ㅓ-2'].map((id) => curvedAfter(upperOnly, id.split('-')[0], id))).toEqual([false, false, false, false, false])
  })

  it('곁줄기도 그려진 방향 그대로: 같은 마스터면 ㅏ와 ㅓ가 같은 쪽 · 같은 자리에서 휜다(거울 아님)', () => {
    const masters = { gyeotjulgi: bend('gyeotjulgi') }
    const bendOf = (char: string, id: string) => {
      const next = applyMaster(jung[char], {}, masters)!
      const stroke = next.strokes!.find((item) => item.id === id)!
      const box = stemReferenceBox(char, 'strokes', stroke)
      const handle = stroke.points.flatMap((point) => [point.handleIn, point.handleOut]).find(Boolean)!
      const [start, end] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
      return { y: (handle.y - start.y) * box.height, along: Math.abs(handle.x - start.x) / Math.abs(end.x - start.x) }
    }
    const right = bendOf('ㅏ', 'ㅏ-2')
    const left = bendOf('ㅓ', 'ㅓ-2')
    expect(right.along).toBeCloseTo(0.7, 9)
    expect(left.along).toBeCloseTo(0.7, 9)
    expect(Math.abs(right.y)).toBeCloseTo(0.03, 9)
    expect(right.y).toBeCloseTo(left.y, 9)
  })
})

describe('고친 획 → 마스터', () => {
  const near = (a: StemMaster, b: StemMaster) => {
    expect(a.points.length).toBe(b.points.length)
    a.points.forEach((point, index) => {
      const other = b.points[index]
      for (const key of ['handleIn', 'handleOut'] as const) {
        expect(Boolean(point[key])).toBe(Boolean(other[key]))
        if (point[key]) {
          expect(point[key]!.t).toBeCloseTo(other[key]!.t, 6)
          expect(point[key]!.o).toBeCloseTo(other[key]!.o, 6)
        }
      }
    })
  }
  it('마스터를 놓은 획을 다시 읽으면 같은 마스터다 — 기둥 · 곁줄기 · 짧은기둥 · ㅣ', () => {
    for (const [char, id] of [['ㅏ', 'ㅏ-1'], ['ㅓ', 'ㅓ-2'], ['ㅗ', 'ㅗ-1'], ['ㅣ', 'ㅣ-1']] as const) {
      const name = nameOf(char, id)!
      const master = { ...bend(name), points: [{ t: 0, o: 0, handleOut: { t: 0.3, o: -0.01 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: 0.03 } }] }
      const next = applyMaster(jung[char], {}, { [name]: master })!
      near(masterFromStroke(next, channelOf(next, id), id)!, master)
    }
  })
  it('이름 없는 획은 null', () => {
    expect(masterFromStroke(jung['ㅏ'], 'strokes', '없음')).toBeNull()
  })
})
