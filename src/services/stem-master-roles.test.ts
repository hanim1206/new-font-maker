import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { JamoData } from '../types'
import { applyMaster, axisReversed, boundStrokesOf, JAMO_CHANNELS, masterNameOf, masterOf, stemReferenceBox, type StemMaster, type StemMasters } from './stemMaster'

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

  it('짧은기둥의 축은 보에 닿는 끝 → 빈 끝이다: 같은 마스터면 솟음 · 내림이 보를 사이에 두고 거울 — 빈 끝이 같은 쪽(오른 · 왼)으로 휜다', () => {
    expect(axisReversed(jung['ㅗ'], jung['ㅗ'].strokes!, jung['ㅗ'].strokes!.find((item) => item.id === 'ㅗ-1')!)).toBe(true)
    expect(axisReversed(jung['ㅜ'], jung['ㅜ'].strokes!, jung['ㅜ'].strokes!.find((item) => item.id === 'ㅜ-2')!)).toBe(false)
    const masters = { jjalbeungidung: bend('jjalbeungidung') }
    const freeEndBend = (char: string, id: string) => {
      const next = applyMaster(jung[char], {}, masters)!
      const stroke = next.strokes!.find((item) => item.id === id)!
      const box = stemReferenceBox(char, 'strokes', stroke)
      // 빈 끝 쪽 핸들(마스터 t 0.7)의 x 휨(em)과, 그 핸들이 보에서 떨어진 정도(축 비율).
      const handle = stroke.points.flatMap((point) => [point.handleIn, point.handleOut]).find(Boolean)!
      const [start, end] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
      const joint = char === 'ㅗ' ? end : start
      return { x: (handle.x - joint.x) * box.width, along: Math.abs(handle.y - joint.y) / Math.abs(end.y - start.y) }
    }
    const up = freeEndBend('ㅗ', 'ㅗ-1')
    const down = freeEndBend('ㅜ', 'ㅜ-2')
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

  it('곁줄기의 축은 기둥에 닿는 끝 → 빈 끝이다: 같은 마스터면 ㅏ와 ㅓ가 기둥을 사이에 두고 거울 — 빈 끝이 같은 쪽(위 · 아래)으로 휜다', () => {
    const reversed = (char: string, id: string) => axisReversed(jung[char], jung[char][channelOf(jung[char], id)]!, jung[char][channelOf(jung[char], id)]!.find((item) => item.id === id)!)
    expect([reversed('ㅏ', 'ㅏ-2'), reversed('ㅘ', 'ㅘ-4'), reversed('ㅓ', 'ㅓ-2'), reversed('ㅔ', 'ㅔ-2'), reversed('ㅝ', 'ㅝ-4')]).toEqual([false, false, true, true, true])
    const masters = { gyeotjulgi: bend('gyeotjulgi') }
    const freeEnd = (char: string, id: string) => {
      const next = applyMaster(jung[char], {}, masters)!
      const stroke = next.strokes!.find((item) => item.id === id)!
      const box = stemReferenceBox(char, 'strokes', stroke)
      const handle = stroke.points.flatMap((point) => [point.handleIn, point.handleOut]).find(Boolean)!
      const [start, end] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
      const joint = char === 'ㅓ' ? end : start
      return { y: (handle.y - joint.y) * box.height, along: Math.abs(handle.x - joint.x) / Math.abs(end.x - start.x) }
    }
    const right = freeEnd('ㅏ', 'ㅏ-2')
    const left = freeEnd('ㅓ', 'ㅓ-2')
    expect(right.along).toBeCloseTo(0.7, 9)
    expect(left.along).toBeCloseTo(0.7, 9)
    expect(Math.abs(right.y)).toBeCloseTo(0.03, 9)
    expect(right.y).toBeCloseTo(left.y, 9)
  })
})
