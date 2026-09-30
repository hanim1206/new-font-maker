import { describe, expect, it } from 'vitest'
import { useJamoStore } from '../src/stores/jamoStore'
import { applyMaster, boundStrokesOf, masterFromStroke } from '../src/services/stemMaster'
import type { JamoData } from '../src/types'
import { defaultPicked, keyOf, revertedFollowers, shapeAskOf } from './stemShapeSession'

/** 반영 창의 칸 나누기 — 같은 갈래만 기본으로 켜고, 같은 갈래를 여럿 고치면 마지막 획이 기준. 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md */
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

describe('줄기 모양 반영 칸', () => {
  it('ㅔ 안 기둥을 고치면 안 기둥 갈래(ㅐ ㅒ ㅔ ㅖ)만 켜지고, 다른 기둥 갈래는 꺼진 채 같은 칸에 붙는다', () => {
    const ask = shapeAskOf(bend(base, 'ㅔ', INNER, 0.05), base, {})!
    expect(ask.sections).toHaveLength(1)
    const [section] = ask.sections
    expect(section.leaf).toBe(INNER)
    expect(section.editedKey).toBe(key('ㅔ', INNER))
    expect([...new Set(section.entries.map((entry) => entry.char))].sort()).toEqual(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ'])
    expect(section.extras.some((entry) => entry.name === OUTER)).toBe(true)
    const picked = defaultPicked(ask)
    expect(section.entries.every((entry) => picked.has(keyOf(entry)))).toBe(true)
    expect(section.extras.some((entry) => picked.has(keyOf(entry)))).toBe(false)
  })

  it('같은 갈래를 둘 고치면 마지막에 고친 획이 기준', () => {
    const both = bend(bend(base, 'ㅔ', INNER, 0.05), 'ㅖ', INNER, -0.05)
    expect(shapeAskOf(both, base, {}, [key('ㅔ', INNER), key('ㅖ', INNER)])!.sections[0].editedKey).toBe(key('ㅖ', INNER))
    expect(shapeAskOf(both, base, {}, [key('ㅖ', INNER), key('ㅔ', INNER)])!.sections[0].editedKey).toBe(key('ㅔ', INNER))
  })

  it('ㅔ 두 기둥을 다 고치면 칸이 둘이고, 안 고친 갈래는 나중에 고친 칸에만 붙는다', () => {
    const both = bend(bend(base, 'ㅔ', INNER, 0.05), 'ㅔ', OUTER, -0.05)
    const ask = shapeAskOf(both, base, {}, [key('ㅔ', OUTER), key('ㅔ', INNER)])!
    expect(ask.sections.map((section) => section.leaf).sort()).toEqual([INNER, OUTER].sort())
    const inner = ask.sections.find((section) => section.leaf === INNER)!
    const outer = ask.sections.find((section) => section.leaf === OUTER)!
    expect(inner.extras.length).toBeGreaterThan(0)
    expect(outer.extras).toEqual([])
    expect(inner.extras.some((entry) => entry.name === INNER || entry.name === OUTER)).toBe(false)
  })

  it('기준 아닌 고친 획은 켜져 있으면 고치기 전으로 돌리고, 따로면 고친 모양 그대로', () => {
    const both = bend(bend(base, 'ㅔ', INNER, 0.05), 'ㅖ', INNER, -0.05)
    const ask = shapeAskOf(both, base, {}, [key('ㅔ', INNER), key('ㅖ', INNER)])!
    const picked = defaultPicked(ask)
    expect(revertedFollowers(both, base, ask, picked)['ㅔ']).toBeDefined()
    expect(revertedFollowers(both, base, ask, picked)['ㅖ']).toBeUndefined()
    picked.delete(key('ㅔ', INNER))
    expect(revertedFollowers(both, base, ask, picked)).toEqual({})
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
  it('획을 통째로 옮기기만 하면(모양 그대로) 물을 게 없다', () => {
    const { channel, stroke } = idOf('ㅏ', 'gyeotjulgi.right.one.single')
    const moved = { ...stroke, points: stroke.points.map((point) => ({ ...point, y: point.y - 0.1 })) }
    const a = { ...base['ㅏ'], [channel]: base['ㅏ'][channel]!.map((item) => item.id === stroke.id ? moved : item) }
    expect(shapeAskOf({ ...base, 'ㅏ': a }, base, {})).toBeNull()
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
