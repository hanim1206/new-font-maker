import { describe, expect, it } from 'vitest'
import { getBaseJamo } from '../stores/jamoStore'
import {
  cutFamilyStroke, emptyFamilyEdits, familyDeltas, familyStrokes, findFamilyLinks, linkOf, moveFamilyPoint,
  presetConsonantStrokes, relinkFamilyStroke, withFamilyDeltas,
} from './jamoFamily'

const presets = presetConsonantStrokes((ch) => getBaseJamo('choseong', ch))
const links = findFamilyLinks(presets)
const first = (ch: string) => presets[ch][0]

describe('닿자 가족 이어 두기', () => {
  it('ㅋ의 ㄱ 획은 ㄱ을 가리킨다', () => {
    const ids = Object.values(links['ㅋ']).flat().filter(Boolean).map((l) => l!.parent)
    expect(ids).toContain('ㄱ')
  })

  it('ㅁ · ㅂ · ㅍ은 따로 시작하고 ㅃ만 ㅂ을 잇는다', () => {
    const parents = (ch: string) => new Set(Object.values(links[ch] ?? {}).flat().filter(Boolean).map((l) => l!.parent))
    expect(parents('ㅂ').size).toBe(0)
    expect(parents('ㅍ').size).toBe(0)
    expect([...parents('ㅃ')]).toEqual(['ㅂ'])
  })

  it('ㅉ의 짧은 오른 내림도 끝점까지 ㅈ을 잇는다', () => {
    expect(links['ㅉ']['ㅉ-2r'].every((l) => l?.parent === 'ㅈ' && l.stroke === 'ㅈ-right')).toBe(true)
  })

  it('ㅊ 꼭지는 ㅎ 꼭지에서 온다', () => {
    const dot = links['ㅊ']['ㅊ-dot']?.filter(Boolean) ?? []
    expect(dot.length).toBeGreaterThan(0)
    expect(dot.every((l) => l!.parent === 'ㅎ')).toBe(true)
  })

  it('ㄱ을 옮기면 ㅋ과 ㄲ이 따라온다', () => {
    const s = first('ㄱ')
    const edits = moveFamilyPoint(links, emptyFamilyEdits(), 'ㄱ', s.id, 0, { x: 0.05, y: 0 })
    const changed = (ch: string) => familyStrokes(presets, links, edits, ch)
      .some((t, i) => t.points.some((p, j) => p.x !== presets[ch][i].points[j].x))
    expect(changed('ㅋ')).toBe(true)
    expect(changed('ㄲ')).toBe(true)
    expect(changed('ㅁ')).toBe(false)
  })

  it('이어받은 점은 못 옮기고, 끊으면 옮길 수 있고, 다시 이으면 앞을 따른다', () => {
    const [stroke, pts] = Object.entries(links['ㅋ']).find(([, p]) => p.some(Boolean))!
    const i = pts.findIndex(Boolean)
    let edits = emptyFamilyEdits()
    expect(moveFamilyPoint(links, edits, 'ㅋ', stroke, i, { x: 0.1, y: 0 })).toBe(edits)
    edits = cutFamilyStroke(presets, links, edits, 'ㅋ', stroke)
    expect(linkOf(links, edits, 'ㅋ', stroke, i)).toBeNull()
    edits = moveFamilyPoint(links, edits, 'ㅋ', stroke, i, { x: 0.1, y: 0 })
    const x = (e: typeof edits) => familyStrokes(presets, links, e, 'ㅋ').find((t) => t.id === stroke)!.points[i].x
    const base = presets['ㅋ'].find((t) => t.id === stroke)!.points[i].x
    expect(x(edits)).toBeCloseTo(base + 0.1)
    edits = relinkFamilyStroke(edits, 'ㅋ', stroke)
    expect(x(edits)).toBeCloseTo(base)
  })

  it('고친 꼴은 첫닿자와 받침 자모에 같이 들어가고, 틀은 프리셋으로 굳는다', () => {
    const s = first('ㄱ')
    const edits = moveFamilyPoint(links, emptyFamilyEdits(), 'ㄱ', s.id, 0, { x: 0.05, y: 0 })
    expect(familyDeltas(presets, links, emptyFamilyEdits(), 'ㅋ')).toBeNull()
    const d = familyDeltas(presets, links, edits, 'ㅋ')!
    const jong = getBaseJamo('jongseong', 'ㅋ')!
    const out = withFamilyDeltas(jong, d)
    expect(out.frame?.strokes?.[0].points[0].x).toBe(jong.strokes![0].points[0].x)
    expect(out.strokes!.some((t, i) => t.points.some((p, j) => p.x !== jong.strokes![i].points[j].x))).toBe(true)
  })
})
