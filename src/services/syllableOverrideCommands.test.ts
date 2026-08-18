import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { decomposeSyllableWithOverrides } from '../utils/hangulUtils'
import { applyRelativeJamoScale, DEFAULT_JAMO_TRANSFORM, getSyllableTransform, isDefaultJamoTransform, previewJamoTransform, resetJamoTransformPosition, resetJamoTransformScale, resetSyllableTransform, setSyllableTransform } from './syllableOverrideCommands'

const jamo: JamoData = {
  char: 'ㄱ',
  type: 'choseong',
  strokes: [{ id: 's1', points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }], closed: false, thickness: 0.08 }],
}
const maps = { choseong: { 'ㄱ': jamo }, jungseong: { 'ㅏ': { char: 'ㅏ', type: 'jungseong' as const } }, jongseong: {} }

describe('syllableOverrideCommands', () => {
  it('특정 음절과 파트에 변환 보정을 추가하고 초기화한다', () => {
    const transform = { translateX: 0.1, translateY: -0.05, scaleX: 1.2, scaleY: 0.9 }
    const changed = setSyllableTransform(jamo, '가', 'CH', transform, maps)
    expect(getSyllableTransform(changed, '가', 'CH')).toEqual(transform)
    expect(changed.overrides?.[0].conditionGroups[0]).toContainEqual({ type: 'jungseongIs', jamo: 'ㅏ' })
    expect(getSyllableTransform(resetSyllableTransform(changed, '가', 'CH'), '가', 'CH')).toEqual(DEFAULT_JAMO_TRANSFORM)
  })

  it('미리보기에서 중심 기준 비율과 이동을 적용한다', () => {
    const preview = previewJamoTransform(jamo, { translateX: 0.1, translateY: 0.2, scaleX: 2, scaleY: 1 })
    expect(preview.strokes?.[0].points[0].x).toBeCloseTo(0)
    expect(preview.strokes?.[0].points[0].y).toBeCloseTo(0.5)
    expect(preview.strokes?.[0].points[1].x).toBeCloseTo(1.2)
    expect(preview.strokes?.[0].points[1].y).toBeCloseTo(0.5)
  })

  it('연속 비율 편집은 100%가 아닌 직전 저장 크기에서 이어진다', () => {
    const first = applyRelativeJamoScale(DEFAULT_JAMO_TRANSFORM, { x: 0.8, y: 1 })
    const second = applyRelativeJamoScale(first, { x: 0.8, y: 1 })
    expect(first.scaleX).toBe(0.8)
    expect(second.scaleX).toBe(0.64)
    expect(second.scaleY).toBe(1)
  })

  it('위치와 비율을 서로 영향 없이 초기화한다', () => {
    const changed = { translateX: 0.2, translateY: -0.1, scaleX: 0.8, scaleY: 1.1 }
    expect(resetJamoTransformPosition(changed)).toEqual({ translateX: 0, translateY: 0, scaleX: 0.8, scaleY: 1.1 })
    expect(resetJamoTransformScale(changed)).toEqual({ translateX: 0.2, translateY: -0.1, scaleX: 1, scaleY: 1 })
    expect(isDefaultJamoTransform(DEFAULT_JAMO_TRANSFORM)).toBe(true)
  })

  it('특정 글자 보정은 같은 자소를 쓰는 다른 글자에 퍼지지 않는다', () => {
    const vowel: JamoData = {
      char: 'ㅜ',
      type: 'jungseong',
      strokes: [{ id: 'v1', points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], closed: false, thickness: 0.08 }],
    }
    const contextMaps = {
      choseong: {
        'ㅌ': { char: 'ㅌ', type: 'choseong' as const },
        'ㄷ': { char: 'ㄷ', type: 'choseong' as const },
      },
      jungseong: { 'ㅜ': vowel },
      jongseong: { 'ㄹ': { char: 'ㄹ', type: 'jongseong' as const } },
    }
    const changed = setSyllableTransform(vowel, '툴', 'JU', { translateX: 0.1, translateY: 0, scaleX: 0.8, scaleY: 1 }, contextMaps)
    const changedMaps = { ...contextMaps, jungseong: { 'ㅜ': changed } }
    const tool = decomposeSyllableWithOverrides('툴', changedMaps.choseong, changedMaps.jungseong, changedMaps.jongseong)
    const dool = decomposeSyllableWithOverrides('둘', changedMaps.choseong, changedMaps.jungseong, changedMaps.jongseong)
    expect(tool.jungseong?.strokes?.[0].points[0].x).not.toBe(0.2)
    expect(dool.jungseong?.strokes?.[0].points[0].x).toBe(0.2)
  })
})
