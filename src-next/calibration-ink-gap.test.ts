import { describe, expect, it } from 'vitest'
import type { DecomposedSyllable, JamoData, LayoutSchema } from '../src/types'
import {
  findJamoInkGapViolation,
  findLayoutInkGapViolation,
  type CalibrationInkGapContext,
} from './calibrationInkGap'

const choseong: JamoData = {
  char: 'ㄱ',
  type: 'choseong',
  strokes: [{ id: 'ch', points: [{ x: 0.2, y: 0 }, { x: 0.2, y: 0.5 }], closed: false, thickness: 0.02 }],
}

const jongseong: JamoData = {
  char: 'ㄴ',
  type: 'jongseong',
  strokes: [{ id: 'jo', points: [{ x: 0.6, y: 0 }, { x: 0.9, y: 0 }], closed: false, thickness: 0.02 }],
}

function medial(char: string, endY: number, x = 0.5): JamoData {
  return {
    char,
    type: 'jungseong',
    strokes: [{ id: `ju-${char}`, points: [{ x, y: 0 }, { x, y: endY }], closed: false, thickness: 0.02 }],
  }
}

const noFinalSchema: LayoutSchema = {
  id: 'choseong-jungseong-vertical',
  slots: ['CH', 'JU'],
  splits: [{ axis: 'x', value: 0.5 }],
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
}

const withFinalSchema: LayoutSchema = {
  id: 'choseong-jungseong-vertical-jongseong',
  slots: ['CH', 'JU', 'JO'],
  splits: [{ axis: 'x', value: 0.5 }, { axis: 'y', value: 0.6 }],
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
}

function syllable(char: string, jungseong: JamoData, schema: LayoutSchema, final: JamoData | null): DecomposedSyllable {
  return { char, choseong, jungseong, jongseong: final, layoutType: schema.id }
}

describe('보정 문장 전체 Ink Gap 전파 검증', () => {
  it('선택 글자가 안전해도 같은 자모를 쓰는 다른 글자의 위반에서 제한한다', () => {
    const baseMedial = medial('ㅏ', 0.5)
    const contexts: CalibrationInkGapContext[] = [
      { id: 'first', char: '가', syllable: syllable('가', baseMedial, noFinalSchema, null), schema: noFinalSchema },
      { id: 'second', char: '간', syllable: syllable('간', baseMedial, withFinalSchema, jongseong), schema: withFinalSchema },
    ]

    expect(findJamoInkGapViolation(contexts, medial('ㅏ', 1), baseMedial, 'JU', 0.05)).toEqual({ id: 'second', char: '간' })
  })

  it('편집 자모가 쓰이지 않은 글자는 전파 검사에서 제외한다', () => {
    const contexts: CalibrationInkGapContext[] = [{
      id: 'unrelated',
      char: '건',
      syllable: syllable('건', medial('ㅓ', 1), withFinalSchema, jongseong),
      schema: withFinalSchema,
    }]

    expect(findJamoInkGapViolation(contexts, medial('ㅏ', 1), medial('ㅏ', 0.5), 'JU', 0.05)).toBeNull()
  })

  it('같은 레이아웃의 문맥별 배치까지 계산해 첫 위반 글자를 돌려준다', () => {
    const verticalI = medial('ㅣ', 0.8, 0.2)
    const verticalEo = medial('ㅓ', 0.8, 0.2)
    const contexts: CalibrationInkGapContext[] = [
      { id: 'safe', char: '기', syllable: syllable('기', verticalI, noFinalSchema, null), schema: noFinalSchema },
      { id: 'limited', char: '거', syllable: syllable('거', verticalEo, noFinalSchema, null), schema: noFinalSchema },
    ]
    const candidate: LayoutSchema = {
      ...noFinalSchema,
      partOverridesByJungseong: { 'ㅓ': { JU: { top: 0, right: 0, bottom: 0, left: -0.625 } } },
    }

    expect(findLayoutInkGapViolation(contexts, candidate, noFinalSchema, 'JU', 0.05)).toEqual({ id: 'limited', char: '거' })
  })

  it('이미 간격을 어긴 상태에서는 더 벌어지는 탈출 이동을 허용한다', () => {
    const stuck = medial('ㅏ', 0.9)
    const contexts: CalibrationInkGapContext[] = [{
      id: 'stuck',
      char: '간',
      syllable: syllable('간', stuck, withFinalSchema, jongseong),
      schema: withFinalSchema,
    }]

    expect(findJamoInkGapViolation(contexts, medial('ㅏ', 0.85), stuck, 'JU', 0.05)).toBeNull()
    expect(findJamoInkGapViolation(contexts, medial('ㅏ', 0.95), stuck, 'JU', 0.05)).toEqual({ id: 'stuck', char: '간' })
  })
})
