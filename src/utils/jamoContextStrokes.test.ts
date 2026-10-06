import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE } from '../stores/globalStyleStore'
import { resolveGlyphInkPrimitives } from '../services/glyphInkResolver'
import { getRenderedStrokeTargets } from '../services/mobileEditorContext'
import type { DecomposedSyllable, JamoData, StrokeDataV2 } from '../types'
import baseJamos from '../data/baseJamos.json'
import { adoptFamilyStrokes, familyOfSyllable, hasFamilyStrokes, medialFamilyOf, mergeFamilyStrokes, splitFamilyStrokes, strokesForFamily, wholeJamoStrokes, writeFamilyStrokes } from './jamoContextStrokes'

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

describe('통째 상자 자소의 획(ㅒ · ㅖ 편집 버그)', () => {
  const box = { x: 0, y: 0, width: 1, height: 1 }
  const verticalOnly = (char: string): JamoData => ({ char, type: 'jungseong', verticalStrokes: [line(`${char}-1`, 0.2), line(`${char}-2`, 0.8)] })

  it('기본 획이 비면 세로부 · 가로부 차례로 읽는다', () => {
    expect(wholeJamoStrokes(jamo('ㅐ', 'jungseong')).map((stroke) => stroke.id)).toEqual(['ㅐ-1'])
    expect(wholeJamoStrokes(verticalOnly('ㅒ')).map((stroke) => stroke.id)).toEqual(['ㅒ-1', 'ㅒ-2'])
    expect(wholeJamoStrokes({ char: 'ㅖ', type: 'jungseong', strokes: [], horizontalStrokes: [line('h', 1)], verticalStrokes: [line('v', 1)] }).map((stroke) => stroke.id)).toEqual(['v', 'h'])
  })

  it('획을 세로부에만 둔 세로홀자도 편집기에서 획을 고를 수 있다', () => {
    const syllable: DecomposedSyllable = { char: '걔', choseong: giyeok, jungseong: verticalOnly('ㅒ'), jongseong: null, layoutType: 'choseong-jungseong-vertical' }
    const targets = getRenderedStrokeTargets(syllable, { CH: box, JU: box }).filter((target) => target.editorPart === 'JU')
    expect(targets.map((target) => target.stroke.id)).toEqual(['ㅒ-1', 'ㅒ-2'])
  })

  it('기본 자모 전부: 누를 수 있는 획 수 = 그려지는 획 수', () => {
    const all = baseJamos as unknown as Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
    const mixed = 'ㅘㅙㅚㅝㅞㅟㅢ'
    for (const [char, medial] of Object.entries(all.jungseong)) {
      if (mixed.includes(char)) continue
      const syllable: DecomposedSyllable = { char: '가', choseong: all.choseong['ㄱ'], jungseong: medial, jongseong: all.jongseong['ㄱ'], layoutType: 'choseong-jungseong-vertical-jongseong' }
      const targets = getRenderedStrokeTargets(syllable, { CH: box, JU: box, JO: box })
      const stored = (medial.strokes?.length || 0) || (medial.verticalStrokes?.length ?? 0) + (medial.horizontalStrokes?.length ?? 0)
      expect(targets.filter((target) => target.editorPart === 'JU').length, char).toBe(stored)
      expect(stored, char).toBeGreaterThan(0)
    }
  })
})

describe('첫닿자 변형 가르기 · 합치기 · 저장', () => {
  const base: JamoData = { char: 'ㅈ', type: 'choseong', strokes: [line('ㅈ-1', 1)] }

  it('가르면 그 계열이 기본 획 복제로 생기고, 합치면 사라진다', () => {
    const split = splitFamilyStrokes(base, 'bottom')
    expect(hasFamilyStrokes(base, 'bottom')).toBe(false)
    expect(hasFamilyStrokes(split, 'bottom')).toBe(true)
    expect(split.contextStrokes!.bottom![0].points[1].x).toBe(1)
    expect(splitFamilyStrokes(split, 'bottom')).toBe(split)
    const merged = mergeFamilyStrokes(split, 'bottom')
    expect(merged.contextStrokes).toBeUndefined()
    expect(mergeFamilyStrokes(base, 'bottom')).toBe(base)
  })

  it('가른 계열에서 고치면 그 변형만 바뀌고 기본 · 다른 변형은 그대로', () => {
    const stored = splitFamilyStrokes(splitFamilyStrokes(base, 'bottom'), 'mixed')
    const view = adoptFamilyStrokes(stored, 'bottom')
    view.strokes![0].points[1].x = 0.3
    const saved = writeFamilyStrokes(stored, view, 'bottom')
    expect(saved.strokes![0].points[1].x).toBe(1)
    expect(saved.contextStrokes!.bottom![0].points[1].x).toBe(0.3)
    expect(saved.contextStrokes!.mixed![0].points[1].x).toBe(1)
    expect(strokesForFamily(saved, 'right')![0].points[1].x).toBe(1)
  })

  it('기본(단독 칸)에서 고치면 안 가른 계열만 따라오고 가른 변형은 남는다', () => {
    const stored = splitFamilyStrokes(base, 'bottom')
    const view = adoptFamilyStrokes(stored, null)
    view.strokes![0].points[1].x = 0.6
    const saved = writeFamilyStrokes(stored, view, null)
    expect(saved.strokes![0].points[1].x).toBe(0.6)
    expect(saved.contextStrokes!.bottom![0].points[1].x).toBe(1)
    expect(strokesForFamily(saved, 'right')![0].points[1].x).toBe(0.6)
    expect(strokesForFamily(saved, 'bottom')![0].points[1].x).toBe(1)
  })

  it('안 가른 계열에서 고치면 예전처럼 기본 획에 쓴다(받침 · 홀자 경로 그대로)', () => {
    const view = adoptFamilyStrokes(base, 'right')
    view.strokes![0].points[1].x = 0.4
    const saved = writeFamilyStrokes(base, view, 'right')
    expect(saved.strokes![0].points[1].x).toBe(0.4)
    expect(saved.contextStrokes).toBeUndefined()
  })

  it('틀은 계열 사본으로 따로 든다 — 변형 편집은 그 계열 틀만, 기본 편집은 변형 틀을 남긴다', () => {
    const stored = splitFamilyStrokes(base, 'bottom')
    const view = adoptFamilyStrokes(stored, 'bottom')
    view.frame = { strokes: [line('ㅈ-1', 0.9)] }
    const saved = writeFamilyStrokes(stored, view, 'bottom')
    expect(saved.frame!.strokes![0].points[1].x).toBe(1)
    expect(saved.frame!.contextStrokes!.bottom![0].points[1].x).toBe(0.9)
    const baseView = adoptFamilyStrokes(saved, null)
    baseView.frame = { strokes: [line('ㅈ-1', 0.5)] }
    const savedBase = writeFamilyStrokes(saved, baseView, null)
    expect(savedBase.frame!.strokes![0].points[1].x).toBe(0.5)
    expect(savedBase.frame!.contextStrokes!.bottom![0].points[1].x).toBe(0.9)
  })
})
