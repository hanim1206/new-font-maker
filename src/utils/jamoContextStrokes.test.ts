import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE } from '../stores/globalStyleStore'
import { resolveGlyphInkPrimitives } from '../services/glyphInkResolver'
import { getRenderedStrokeTargets } from '../services/mobileEditorContext'
import type { DecomposedSyllable, JamoData, StrokeDataV2 } from '../types'
import { adoptFamilyStrokes, familyOfSyllable, medialFamilyOf, strokesForFamily } from './jamoContextStrokes'

const line = (id: string, x2: number): StrokeDataV2 => ({ id, points: [{ x: 0, y: 0 }, { x: x2, y: 1 }], closed: false, thickness: 0.07 })
const giyeok: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [line('ㄱ-1', 1)], contextStrokes: { bottom: [line('ㄱ-1', 0.3)] } }
const jamo = (char: string, type: JamoData['type']): JamoData => ({ char, type, strokes: [line(`${char}-1`, 1)] })
const syllableOf = (medial: string, layoutType: DecomposedSyllable['layoutType']): DecomposedSyllable => ({ char: 'x', choseong: giyeok, jungseong: jamo(medial, 'jungseong'), jongseong: null, layoutType })

describe('문맥 계열별 획 변형', () => {
  it('홀자 계열을 가른다', () => {
    expect(medialFamilyOf('ㅏ')).toBe('right')
    expect(medialFamilyOf('ㅗ')).toBe('bottom')
    expect(medialFamilyOf('ㅘ')).toBe('mixed')
    expect(medialFamilyOf(null)).toBeNull()
  })

  it('변형이 있는 계열만 변형을 주고 나머지는 기본 획', () => {
    expect(strokesForFamily(giyeok, 'bottom')![0].points[1].x).toBe(0.3)
    expect(strokesForFamily(giyeok, 'right')![0].points[1].x).toBe(1)
    expect(strokesForFamily(giyeok, null)![0].points[1].x).toBe(1)
  })

  it('편집용 채택은 현재 계열 변형을 기본 획으로 올리고 변형 목록을 지운다', () => {
    const adopted = adoptFamilyStrokes(giyeok, 'bottom')
    expect(adopted.strokes![0].points[1].x).toBe(0.3)
    expect(adopted.contextStrokes).toBeUndefined()
    expect(giyeok.contextStrokes?.bottom).toBeDefined()
    expect(adoptFamilyStrokes(giyeok, 'right').strokes![0].points[1].x).toBe(1)
  })

  it('잉크 리졸버와 편집 겨냥이 같은 변형을 쓴다', () => {
    const box = { CH: { x: 0, y: 0, width: 0.5, height: 0.5 }, JU: { x: 0.5, y: 0, width: 0.5, height: 1 } }
    const bottom = syllableOf('ㅗ', 'choseong-jungseong-horizontal')
    const right = syllableOf('ㅏ', 'choseong-jungseong-vertical')
    expect(familyOfSyllable(bottom)).toBe('bottom')
    const inkBottom = resolveGlyphInkPrimitives({ syllable: bottom, placement: { kind: 'boxes', boxes: box }, weightMultiplier: 1, globalLinecap: DEFAULT_STYLE.linecap, globalLinejoin: DEFAULT_STYLE.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const inkRight = resolveGlyphInkPrimitives({ syllable: right, placement: { kind: 'boxes', boxes: box }, weightMultiplier: 1, globalLinecap: DEFAULT_STYLE.linecap, globalLinejoin: DEFAULT_STYLE.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    expect(inkBottom.primitives.find((p) => p.source.part === 'CH')!.stroke.points[1].x).toBe(0.3)
    expect(inkRight.primitives.find((p) => p.source.part === 'CH')!.stroke.points[1].x).toBe(1)
    const targets = getRenderedStrokeTargets(bottom, box).filter((t) => t.renderPart === 'CH')
    expect(targets[0].stroke.points[1].x).toBe(0.3)
    expect(targets[0].jamo.contextStrokes).toBeUndefined()
  })
})
