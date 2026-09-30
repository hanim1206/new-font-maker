import { describe, expect, it } from 'vitest'
import { useJamoStore } from '../src/stores/jamoStore'
import { applyMaster, boundStrokesOf, masterFromStroke } from '../src/services/stemMaster'
import type { JamoData } from '../src/types'
import { askEntries, defaultPicked, keyOf, lockedKeys, pickedMasters, shapeAskForStroke, slotFacetOf, slotOf, spreadableStem } from './stemShapeSession'

/** 전파 물음 — 잡은 획 하나가 기준, 기본 켜짐은 이 줄기 전부(안 · 바깥, 단일 · 섞임). 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md */
const base = useJamoStore.getState().jungseong
const idOf = (char: string, leaf: string) => boundStrokesOf(base[char], {}).find((item) => item.name === leaf)!
/** 그 획의 첫 점에 핸들을 달아 휜다. */
function bend(jungseong: Record<string, JamoData>, char: string, leaf: string, amount: number): Record<string, JamoData> {
  const { channel, stroke } = idOf(char, leaf)
  const jamo = jungseong[char]
  const next = { ...stroke, points: stroke.points.map((point, index) => index === 0 ? { ...point, handleOut: { x: point.x + amount, y: point.y + 0.1 } } : point) }
  return { ...jungseong, [char]: { ...jamo, [channel]: jamo[channel]!.map((item) => item.id === stroke.id ? next : item) } }
}
const key = (char: string, leaf: string) => `${char}:${idOf(char, leaf).stroke.id}`
const INNER = 'gidung.inner.single'
const OUTER = 'gidung.outer.single'

describe('전파 물음', () => {
  it('ㅔ 안 기둥을 고치면 자리 질문은 `side`, 기본 켜짐은 안 · 바깥 기둥 전부', () => {
    const jungseong = bend(base, 'ㅔ', INNER, 0.05)
    const ask = shapeAskForStroke(jungseong, {}, 'ㅔ', idOf('ㅔ', INNER).stroke.id)!
    expect(ask.sections).toHaveLength(1)
    expect(ask.sections[0].leaf).toBe(INNER)
    expect(ask.sections[0].editedKey).toBe(key('ㅔ', INNER))
    const entries = askEntries(ask)
    expect(slotFacetOf(entries)).toBe('side')
    const picked = defaultPicked(ask)
    expect(entries.every((entry) => picked.has(keyOf(entry)))).toBe(true)
    const onChars = [...new Set(entries.map((entry) => entry.char))]
    expect(onChars).toHaveLength(16)
    expect(entries.filter((entry) => slotOf(entry, 'side') === 'inner').map((entry) => entry.char).sort()).toEqual(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ', 'ㅙ', 'ㅞ'].sort())
    expect(lockedKeys(ask).has(key('ㅔ', INNER))).toBe(true)
  })

  it('ㅏ 바깥 기둥을 고치면 16자가 안 · 바깥 다 켜져 모든 갈래에 같은 모양이 적히고, 안 기둥을 빼면 바깥 갈래만 남는다', () => {
    const jungseong = bend(base, 'ㅏ', OUTER, 0.05)
    const ask = shapeAskForStroke(jungseong, {}, 'ㅏ', idOf('ㅏ', OUTER).stroke.id)!
    const entries = askEntries(ask)
    const picked = defaultPicked(ask)
    expect(new Set(entries.filter((entry) => picked.has(keyOf(entry))).map((entry) => entry.char)).size).toBe(16)
    expect(pickedMasters(ask, picked).map((master) => master.name)).toContain(INNER)
    const outerOnly = new Set([...picked].filter((key) => !entries.some((entry) => keyOf(entry) === key && entry.name.startsWith('gidung.inner'))))
    expect(pickedMasters(ask, outerOnly).map((master) => master.name).sort()).toEqual(['gidung.outer.mixed', 'gidung.outer.single'])
  })

  it('자리 질문은 기둥의 바깥 · 안뿐 — 곁줄기 둘짜리(ㅑ)는 같이 가니 자리가 없고, 보 · 걸침도 없다', () => {
    const gyeot = shapeAskForStroke(base, {}, 'ㅑ', idOf('ㅑ', 'gyeotjulgi.right.upper.single').stroke.id)!
    expect(slotFacetOf(askEntries(gyeot))).toBeNull()
    const yo = shapeAskForStroke(base, {}, 'ㅛ', idOf('ㅛ', 'jjalbeungidung.up.pair.single').stroke.id)!
    expect(slotFacetOf(askEntries(yo))).toBeNull()
    const bo = shapeAskForStroke(base, {}, 'ㅗ', idOf('ㅗ', 'bo.up.single').stroke.id)!
    expect(slotFacetOf(askEntries(bo))).toBeNull()
  })
})

describe('전파 단추 조건', () => {
  it('이름 있는 홀자 줄기면 기본 폰트에서도, 휜 획에서도 뜬다 — 곧은 기둥으로 이미 고친 형제를 되돌릴 수 있다', () => {
    const { stroke } = idOf('ㅏ', OUTER)
    expect(spreadableStem(base, 'ㅏ', stroke.id)).toBe(true)
    expect(spreadableStem(bend(base, 'ㅏ', OUTER, 0.05), 'ㅏ', stroke.id)).toBe(true)
    expect(spreadableStem(bend(base, 'ㅓ', OUTER, 0.05), 'ㅏ', stroke.id)).toBe(true)
  })

  it('이름 없는 획엔 안 뜬다', () => {
    expect(spreadableStem(base, 'ㅏ', 'no-such-stroke')).toBe(false)
  })
})

describe('기울기 = 모양', () => {
  it('기본 홀자의 이름 있는 줄기는 곧은 마스터를 전부 따른다(줄기 방향 축으로 바꿔도)', () => {
    for (const jamo of Object.values(base)) expect(boundStrokesOf(jamo, {}).every((item) => item.follows)).toBe(true)
  })

  it('ㅏ 곁줄기 끝을 올리면 ㅑ · ㅓ도 같은 방향으로 기운다 — 시작점은 그대로, 끝점이 위로', () => {
    const { channel, stroke } = idOf('ㅏ', 'gyeotjulgi.right.one.single')
    const lifted = { ...stroke, points: stroke.points.map((point, index) => index === stroke.points.length - 1 ? { ...point, y: point.y - 0.1 } : point) }
    const a = { ...base['ㅏ'], [channel]: base['ㅏ'][channel]!.map((item) => item.id === stroke.id ? lifted : item) }
    const master = masterFromStroke(a, channel, stroke.id)!
    expect(master.points[master.points.length - 1].o).toBeGreaterThan(0)
    const masters = Object.fromEntries(['gyeotjulgi.right.upper.single', 'gyeotjulgi.left.one.single'].map((name) => [name, { ...master, name }]))
    const ya = applyMaster(base['ㅑ'], {}, masters)!
    const eo = applyMaster(base['ㅓ'], {}, masters)!
    const yaUpper = ya.strokes!.find((item) => item.id === idOf('ㅑ', 'gyeotjulgi.right.upper.single').stroke.id)!
    const yaBefore = idOf('ㅑ', 'gyeotjulgi.right.upper.single').stroke
    // ㅑ 위 곁줄기: 붙은 끝(시작) 그대로, 빈 끝(끝) 위로.
    expect(yaUpper.points[0]).toEqual(yaBefore.points[0])
    expect(yaUpper.points[1].y).toBeLessThan(yaBefore.points[1].y)
    // ㅓ 곁줄기도 그려진 방향(왼 → 오른) 그대로 — 시작점(빈 끝) 그대로, 끝점(기둥 쪽)이 위로. 거울이 아니라 같은 방향.
    const eoStroke = eo.strokes!.find((item) => item.id === idOf('ㅓ', 'gyeotjulgi.left.one.single').stroke.id)!
    const eoBefore = idOf('ㅓ', 'gyeotjulgi.left.one.single').stroke
    expect(eoStroke.points[0]).toEqual(eoBefore.points[0])
    expect(eoStroke.points[1].y).toBeLessThan(eoBefore.points[1].y)
    // 받은 획은 새 마스터를 따른다.
    expect(boundStrokesOf(eo, masters).find((item) => item.stroke.id === eoStroke.id)!.follows).toBe(true)
  })
})

describe('자리만 옮긴 획', () => {
  it('획을 통째로 옮기기만 하면 모양은 그대로다 — 전파는 뜨지만 읽은 마스터가 곧은 마스터와 같아 형제는 안 바뀐다', () => {
    const { channel, stroke } = idOf('ㅏ', 'gyeotjulgi.right.one.single')
    const moved = { ...stroke, points: stroke.points.map((point) => ({ ...point, y: point.y - 0.1 })) }
    const a = { ...base['ㅏ'], [channel]: base['ㅏ'][channel]!.map((item) => item.id === stroke.id ? moved : item) }
    expect(spreadableStem({ ...base, ㅏ: a }, 'ㅏ', stroke.id)).toBe(true)
    const master = masterFromStroke(a, channel, stroke.id)!
    expect(applyMaster(base['ㅓ'], {}, { gyeotjulgi: { ...master, name: 'gyeotjulgi' } })).toBeNull()
  })
})

describe('걸침 기울기', () => {
  it('ㅐ 걸침 끝을 올리면 ㅒ · ㅙ 걸침도 같은 방향으로 기운다', () => {
    const LEAF = 'geolchim'
    const { channel, stroke } = idOf('ㅐ', LEAF)
    const lifted = { ...stroke, points: stroke.points.map((point, index) => index === stroke.points.length - 1 ? { ...point, y: point.y - 0.05 } : point) }
    const ae = { ...base['ㅐ'], [channel]: base['ㅐ'][channel]!.map((item) => item.id === stroke.id ? lifted : item) }
    const master = masterFromStroke(ae, channel, stroke.id)!
    expect(master.points[master.points.length - 1].o).toBeGreaterThan(0)
    for (const char of ['ㅒ', 'ㅙ']) {
      const target = boundStrokesOf(base[char], {}).find((item) => item.name === LEAF)!
      const next = applyMaster(base[char], {}, { [LEAF]: master })!
      const after = next[target.channel]!.find((item) => item.id === target.stroke.id)!
      expect(after.points[0], char).toEqual(target.stroke.points[0])
      expect(after.points[1].y, char).toBeLessThan(target.stroke.points[1].y)
    }
  })
})
