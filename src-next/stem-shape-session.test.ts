import { describe, expect, it } from 'vitest'
import { useJamoStore } from '../src/stores/jamoStore'
import { boundStrokesOf } from '../src/services/stemMaster'
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
