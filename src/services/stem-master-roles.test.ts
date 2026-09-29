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
  it('짧은기둥은 솟음 · 내림, 보는 솟음 · 내림 · 홀로 × 섞임으로 나뉜다', () => {
    expect([nameOf('ㅗ', 'ㅗ-1'), nameOf('ㅛ', 'ㅛ-1'), nameOf('ㅛ', 'ㅛ-2'), nameOf('ㅘ', 'ㅘ-1')]).toEqual(Array(4).fill('jjalbeungidung.up'))
    expect([nameOf('ㅜ', 'ㅜ-2'), nameOf('ㅠ', 'ㅠ-2'), nameOf('ㅝ', 'ㅝ-2'), nameOf('ㅟ', 'ㅟ-2')]).toEqual(Array(4).fill('jjalbeungidung.down'))
    expect({
      ㅗ: nameOf('ㅗ', 'ㅗ-2'), ㅘ: nameOf('ㅘ', 'ㅘ-2'), ㅚ: nameOf('ㅚ', 'ㅚ-2'), ㅜ: nameOf('ㅜ', 'ㅜ-1'),
      ㅝ: nameOf('ㅝ', 'ㅝ-1'), ㅟ: nameOf('ㅟ', 'ㅟ-1'), ㅡ: nameOf('ㅡ', 'ㅡ-1'), ㅢ: nameOf('ㅢ', 'ㅢ-1'),
    }).toEqual({ ㅗ: 'bo.up', ㅘ: 'bo.up.mixed', ㅚ: 'bo.up.mixed', ㅜ: 'bo.down', ㅝ: 'bo.down.mixed', ㅟ: 'bo.down.mixed', ㅡ: 'bo.none', ㅢ: 'bo.none.mixed' })
  })

  it('갈래 마스터가 없으면 부모를 거슬러 따른다(보.솟음.섞임 → 보.솟음 → 보)', () => {
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

  it('짧은기둥의 축은 보에 닿는 끝 → 빈 끝이다: 같은 마스터면 솟음 · 내림의 빈 끝 쪽 휨이 같은 크기로 보를 사이에 두고 거울처럼 온다', () => {
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
    expect(up.x).toBeCloseTo(-down.x, 9)
  })
})
