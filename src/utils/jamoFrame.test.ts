import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { componentProtrusion, fitNotoComponent } from '../services/notoComponentFit'
import type { ComponentFaces, ComponentFitInput } from '../services/notoComponentFit'
import type { JamoData, MedialFamily, Part } from '../types'
import { frameOf, withFrameFrom, withoutFrame } from './jamoFrame'

/** 여섯 칸에서 나올 법한 상자 꼴: 넓은 것 · 좁고 긴 것 · 납작한 것. */
const FACES: ComponentFaces[] = [
  { left: 0.08, right: 0.56, top: 0.1, bottom: 0.62 },
  { left: 0.1, right: 0.9, top: 0.08, bottom: 0.36 },
  { left: 0.62, right: 0.9, top: 0.06, bottom: 0.94 },
  { left: 0.14, right: 0.86, top: 0.6, bottom: 0.92 },
]
const FAMILIES: (MedialFamily | null)[] = ['right', 'bottom', 'mixed']

type Case = { jamo: JamoData; part: Part; channel?: ComponentFitInput['channel'] }
const allCases = (): Case[] => {
  const maps = baseJamos as unknown as Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
  const cases: Case[] = []
  for (const jamo of Object.values(maps.choseong)) cases.push({ jamo, part: 'CH' })
  for (const jamo of Object.values(maps.jongseong)) cases.push({ jamo, part: 'JO' })
  for (const jamo of Object.values(maps.jungseong)) {
    if (jamo.horizontalStrokes?.length || jamo.verticalStrokes?.length) {
      if (jamo.horizontalStrokes?.length) cases.push({ jamo, part: 'JU_H', channel: 'horizontalStrokes' })
      if (jamo.verticalStrokes?.length) cases.push({ jamo, part: 'JU_V', channel: 'verticalStrokes' })
    } else cases.push({ jamo, part: 'JU' })
  }
  return cases
}
const fit = (item: Case, jamo: JamoData, faces: ComponentFaces, family: MedialFamily | null = 'right') =>
  fitNotoComponent({ part: item.part, jamo, channel: item.channel, family: item.part === 'CH' || item.part === 'JO' ? family : null, faces, glyphId: 'frame-test' })

describe('자소 기준 틀', () => {
  it('굳히는 순간에는 어느 자모 · 어느 상자 · 어느 계열에서도 상자가 안 바뀐다', () => {
    const cases = allCases()
    expect(cases.length).toBeGreaterThan(60)
    let compared = 0
    for (const item of cases) for (const faces of FACES) for (const family of FAMILIES) {
      const plain = fit(item, item.jamo, faces, family)
      const framed = fit(item, { ...item.jamo, frame: frameOf(item.jamo) }, faces, family)
      expect(framed.ok, `${item.jamo.char} ${item.part}`).toBe(plain.ok)
      if (!plain.ok || !framed.ok) continue
      expect(framed.fit.box, `${item.jamo.char} ${item.part}`).toEqual(plain.fit.box)
      compared += 1
    }
    expect(compared).toBeGreaterThan(500)
  })

  it('틀이 있으면 획 하나를 틀 밖으로 옮겨도 상자와 나머지 획이 제자리다. 틀이 없으면 자소 전체가 다시 줄어든다', () => {
    const maps = baseJamos as unknown as Record<'choseong', Record<string, JamoData>>
    const giyeok = maps.choseong['ㄱ']
    const faces = FACES[0]
    const before = fit({ jamo: giyeok, part: 'CH' }, giyeok, faces)
    if (!before.ok) throw new Error(before.message)

    // ㄱ의 마지막 점(세로 획 끝)을 아래로 0.3 민다.
    const moved = structuredClone(giyeok)
    const stroke = moved.strokes![0]
    stroke.points[stroke.points.length - 1].y += 0.3

    const loose = fit({ jamo: moved, part: 'CH' }, moved, faces)
    const held = fit({ jamo: moved, part: 'CH' }, withFrameFrom(moved, giyeok), faces)
    if (!loose.ok || !held.ok) throw new Error('fit 실패')
    expect(loose.fit.box.height).toBeLessThan(before.fit.box.height - 1e-6)
    expect(held.fit.box).toEqual(before.fit.box)

    const protrusion = componentProtrusion({ jamo: withFrameFrom(moved, giyeok), family: 'right' }, held.fit.box)
    expect(protrusion?.bottom).toBeCloseTo(0.3 * held.fit.box.height, 9)
    expect(protrusion?.top).toBe(0)
    expect(protrusion?.left).toBe(0)
    expect(protrusion?.right).toBe(0)
    expect(componentProtrusion({ jamo: moved, family: 'right' }, held.fit.box)).toBeNull()
  })

  it('틀은 처음 한 번만 굳고, 지우면 다시 꽉 찬다', () => {
    const maps = baseJamos as unknown as Record<'choseong', Record<string, JamoData>>
    const nieun = maps.choseong['ㄴ']
    const first = withFrameFrom(structuredClone(nieun), nieun)
    const edited = structuredClone(first)
    edited.strokes![0].points[0].y -= 0.2
    // 두 번째 편집: 이미 틀이 있으니 그대로 둔다(고친 획으로 다시 굳지 않는다).
    expect(withFrameFrom(edited, edited).frame).toEqual(first.frame)
    expect(withoutFrame(edited).frame).toBeUndefined()
    expect(first.frame?.strokes).toEqual(nieun.strokes)
    expect(first.frame?.strokes).not.toBe(nieun.strokes)
  })
})
