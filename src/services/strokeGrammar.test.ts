import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import grammar from '../data/strokeGrammar.json'
import type { JamoData, StrokeDataV2 } from '../types'
import { describeJamoStrokes, grammarOf, type JamoType, type StemName, type StrokeDescription } from './strokeGrammar'

const TYPES: readonly JamoType[] = ['choseong', 'jungseong', 'jongseong']
const presets = baseJamos as unknown as Record<JamoType, Record<string, JamoData>>
const preset = (type: JamoType, char: string): JamoData => structuredClone(presets[type][char])
const byId = (list: StrokeDescription[]) => Object.fromEntries(list.map((item) => [item.strokeId, item]))
const names = (list: StrokeDescription[]) => Object.fromEntries(list.map((item) => [item.strokeId, item.name]))
const shapes = (item: StrokeDescription) => item.segments.map(({ shape }) => shape)

describe('획 문법 G0 대표', () => {
  it('ㅏ — 기둥과 곁줄기, 곁줄기는 머리가 기둥에 닿고 맺음이 열려 있다', () => {
    const strokes = byId(describeJamoStrokes(preset('jungseong', 'ㅏ')))
    expect(strokes['ㅏ-1']).toMatchObject({ bound: true, name: 'gidung', corners: [] })
    expect(shapes(strokes['ㅏ-1'])).toEqual(['serojulgi'])
    expect(strokes['ㅏ-1'].head).toMatchObject({ y: 0, open: true })
    expect(strokes['ㅏ-2']).toMatchObject({ name: 'gyeotjulgi' })
    expect(shapes(strokes['ㅏ-2'])).toEqual(['garojulgi'])
    expect(strokes['ㅏ-2'].head?.open).toBe(false)
    expect(strokes['ㅏ-2'].tail?.open).toBe(true)
  })

  it('ㄱ — 이름 없는 기본 줄기, 마디 둘과 꺾임 하나, 두 끝이 열려 있다', () => {
    const [stroke] = describeJamoStrokes(preset('choseong', 'ㄱ'))
    expect(stroke).toMatchObject({ strokeId: 'ㄱ-1', bound: true, name: null })
    expect(shapes(stroke)).toEqual(['garojulgi', 'serojulgi'])
    expect(stroke.corners).toHaveLength(1)
    expect(stroke.corners[0].turn).toBeCloseTo(90, 0)
    expect(stroke.head).toMatchObject({ point: 0, open: true })
    expect(stroke.tail).toMatchObject({ point: 2, open: true })
  })

  it('ㅎ — 꼭지 · 가로줄기 · 둥근줄기', () => {
    const strokes = byId(describeJamoStrokes(preset('choseong', 'ㅎ')))
    expect(strokes['ㅎ-1']).toMatchObject({ name: 'kkokji' })
    expect(strokes['ㅎ-1'].tail?.open).toBe(false)
    expect(strokes['ㅎ-2'].name).toBeNull()
    expect(shapes(strokes['ㅎ-2'])).toEqual(['garojulgi'])
    expect(shapes(strokes['ㅎ-circle'])).toEqual(['dunggeunjulgi'])
    expect(strokes['ㅎ-circle']).toMatchObject({ head: null, tail: null, corners: [] })
  })

  it('ㅘ — 가로부는 짧은기둥과 보, 세로부는 기둥과 곁줄기', () => {
    const list = describeJamoStrokes(preset('jungseong', 'ㅘ'))
    expect(names(list)).toEqual({ 'ㅘ-1': 'jjalbeungidung', 'ㅘ-2': 'bo', 'ㅘ-3': 'gidung', 'ㅘ-4': 'gyeotjulgi' })
    expect(list.map(({ channel }) => channel)).toEqual(['horizontalStrokes', 'horizontalStrokes', 'verticalStrokes', 'verticalStrokes'])
  })
})

describe('획 문법 G1 홀드아웃', () => {
  it('ㅐ — 기둥 둘 사이의 걸침은 두 끝이 다 닿아 있다', () => {
    const strokes = byId(describeJamoStrokes(preset('jungseong', 'ㅐ')))
    expect(names(Object.values(strokes))).toEqual({ 'ㅐ-1': 'gidung', 'ㅐ-2': 'geolchim', 'ㅐ-3': 'gidung' })
    expect(strokes['ㅐ-2'].head?.open).toBe(false)
    expect(strokes['ㅐ-2'].tail?.open).toBe(false)
  })

  it('ㅛ — 짧은기둥 둘과 보', () => {
    expect(names(describeJamoStrokes(preset('jungseong', 'ㅛ')))).toEqual({ 'ㅛ-1': 'jjalbeungidung', 'ㅛ-2': 'jjalbeungidung', 'ㅛ-3': 'bo' })
  })

  it('ㅊ — 꼭지, 삐침과 내림', () => {
    const strokes = byId(describeJamoStrokes(preset('choseong', 'ㅊ')))
    expect(strokes['ㅊ-dot'].name).toBe('kkokji')
    expect(shapes(strokes['ㅊ-left'])).toEqual(['ppichim'])
    expect(shapes(strokes['ㅊ-right'])).toEqual(['naerim'])
  })

  it('ㅆ — 폭이 좁아 선 빗금도 삐침 · 내림으로 읽는다', () => {
    const strokes = byId(describeJamoStrokes(preset('choseong', 'ㅆ')))
    expect(['ㅆ-1l', 'ㅆ-1r', 'ㅆ-2l', 'ㅆ-2r'].map((id) => shapes(strokes[id])[0])).toEqual(['ppichim', 'naerim', 'ppichim', 'naerim'])
  })

  it('ㅋ · ㅌ — 덧줄기', () => {
    expect(names(describeJamoStrokes(preset('choseong', 'ㅋ')))['ㅋ-3']).toBe('deotjulgi')
    expect(names(describeJamoStrokes(preset('choseong', 'ㅌ')))['ㅌ-4']).toBe('deotjulgi')
  })

  it('ㅁ — 꺾임 넷, 마디 넷, 열린 끝이 없다', () => {
    const [stroke] = describeJamoStrokes(preset('choseong', 'ㅁ'))
    expect(stroke.corners).toHaveLength(4)
    expect(shapes(stroke)).toEqual(['garojulgi', 'serojulgi', 'garojulgi', 'serojulgi'])
    expect(stroke).toMatchObject({ head: null, tail: null })
  })

  it('ㅇ — 둥근줄기', () => {
    const [stroke] = describeJamoStrokes(preset('choseong', 'ㅇ'))
    expect(shapes(stroke)).toEqual(['dunggeunjulgi'])
  })

  it('겹받침 ㄺ — 두 획 모두 귀속, ㄹ 쪽은 마디 다섯', () => {
    const strokes = byId(describeJamoStrokes(preset('jongseong', 'ㄺ')))
    expect(Object.values(strokes).every(({ bound }) => bound)).toBe(true)
    expect(strokes['ㄺ종-1'].segments).toHaveLength(5)
    expect(strokes['ㄺ종-1'].corners).toHaveLength(4)
  })

  it('새로 그린 획은 자유 획이고 모양만 가진다', () => {
    const jamo = preset('jungseong', 'ㅏ')
    const added: StrokeDataV2 = { id: 'stroke-1790000000000', points: [{ x: 0.3, y: 0.2 }, { x: 0.8, y: 0.9 }], closed: false, thickness: 0.07 }
    jamo.strokes = [...(jamo.strokes as StrokeDataV2[]), added]
    const stroke = byId(describeJamoStrokes(jamo))[added.id]
    expect(stroke).toMatchObject({ bound: false, name: null })
    expect(shapes(stroke)).toEqual(['naerim'])
  })

  it('귀속이 이긴다 — 기둥을 45° 눕혀도 이름은 기둥이고 모양만 바뀐다', () => {
    const jamo = preset('jungseong', 'ㅣ')
    const pillar = (jamo.strokes as StrokeDataV2[])[0]
    pillar.points = [{ x: 1, y: 0 }, { x: 0, y: 1 }]
    const [stroke] = describeJamoStrokes(jamo)
    expect(stroke).toMatchObject({ bound: true, name: 'gidung' })
    expect(shapes(stroke)).toEqual(['ppichim'])
  })

  it('귀속 풀기 — 풀어 둔 id는 자유 획으로 본다', () => {
    const [stroke] = describeJamoStrokes(preset('jungseong', 'ㅣ'), { released: new Set(['ㅣ-1']) })
    expect(stroke).toMatchObject({ bound: false, name: null })
  })

  it('획을 지우면 그 자리는 비고 남은 획은 그대로 귀속이다', () => {
    const jamo = preset('jungseong', 'ㅏ')
    jamo.strokes = (jamo.strokes as StrokeDataV2[]).filter(({ id }) => id !== 'ㅏ-2')
    expect(names(describeJamoStrokes(jamo))).toEqual({ 'ㅏ-1': 'gidung' })
    expect(Object.keys(grammarOf('jungseong', 'ㅏ'))).toEqual(['ㅏ-1', 'ㅏ-2'])
  })
})

describe('획 문법 G2 전수', () => {
  const allJamos = TYPES.flatMap((type) => Object.keys(presets[type]).map((char) => [type, char] as const))

  it('낱자 67개', () => {
    expect(allJamos).toHaveLength(19 + 21 + 27)
  })

  it('표의 id와 프리셋 획 id가 빠짐 · 남음 없이 맞는다', () => {
    const table = grammar as unknown as Record<JamoType, Record<string, Record<string, StemName | null>>>
    for (const type of TYPES) expect(Object.keys(table[type]).sort()).toEqual(Object.keys(presets[type]).sort())
    for (const [type, char] of allJamos) {
      const described = describeJamoStrokes(preset(type, char))
      expect(described.map(({ strokeId }) => strokeId).sort(), `${type} ${char}`).toEqual(Object.keys(grammarOf(type, char)).sort())
      expect(described.every(({ bound }) => bound), `${type} ${char}`).toBe(true)
    }
  })

  it('문맥 계열 변형(contextStrokes)이 있으면 id가 기본 획과 같다', () => {
    for (const [type, char] of allJamos) {
      const jamo = presets[type][char]
      const base = ((jamo.strokes ?? []) as StrokeDataV2[]).map(({ id }) => id)
      for (const variant of Object.values(jamo.contextStrokes ?? {})) expect((variant ?? []).map(({ id }) => id), `${type} ${char}`).toEqual(base)
    }
  })

  it('손으로 적은 이름과 계산한 모양이 프리셋에서 어긋나지 않는다', () => {
    const vertical: readonly StemName[] = ['gidung', 'jjalbeungidung', 'kkokji']
    const horizontal: readonly StemName[] = ['bo', 'gyeotjulgi', 'geolchim', 'deotjulgi']
    for (const [type, char] of allJamos) {
      for (const stroke of describeJamoStrokes(preset(type, char))) {
        if (!stroke.name) continue
        const expected = vertical.includes(stroke.name) ? 'serojulgi' : horizontal.includes(stroke.name) ? 'garojulgi' : null
        expect(shapes(stroke), `${char} ${stroke.strokeId}`).toEqual([expected])
      }
    }
  })
})
