import { describe, expect, it } from 'vitest'
import type { BoxConfig, DecomposedSyllable, JamoData, Part } from '../src/types'
import { findMaximumSafeEditFactor, getMinimumInterComponentInkGap, preservesMinimumInkGap } from './inkGapGuard'

const choseong: JamoData = {
  char: 'ㄱ',
  type: 'choseong',
  strokes: [{
    id: 'ch',
    points: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
    closed: false,
    thickness: 0.05,
  }],
}

function makeJungseong(x: number): JamoData {
  return {
    char: 'ㅏ',
    type: 'jungseong',
    strokes: [{
      id: 'ju',
      points: [{ x, y: 0 }, { x, y: 1 }],
      closed: false,
      thickness: 0.05,
    }],
  }
}

function makeSyllable(jungseong: JamoData): DecomposedSyllable {
  return {
    char: '가',
    choseong,
    jungseong,
    jongseong: null,
    layoutType: 'choseong-jungseong-vertical',
  }
}

const boxes: Partial<Record<Part, BoxConfig>> = {
  CH: { x: 0, y: 0, width: 0.4, height: 1 },
  JU: { x: 0.6, y: 0, width: 0.4, height: 1 },
}

describe('컴포넌트 간 Ink Gap Guard', () => {
  it('슬롯이 아니라 실제 획 두께를 포함한 잉크 간격을 계산한다', () => {
    expect(getMinimumInterComponentInkGap(makeSyllable(makeJungseong(0)), boxes, 'JU')).toBeCloseTo(0.15)
    expect(preservesMinimumInkGap(makeSyllable(makeJungseong(0)), boxes, 'JU', 0.1)).toBe(true)
  })

  it('다른 컴포넌트의 잉크와 겹치는 후보를 거부한다', () => {
    expect(getMinimumInterComponentInkGap(makeSyllable(makeJungseong(-0.5)), boxes, 'JU')).toBeLessThan(0)
    expect(preservesMinimumInkGap(makeSyllable(makeJungseong(-0.5)), boxes, 'JU', 0.1)).toBe(false)
  })

  it('요청 이동 중 최소 간격을 지키는 가장 먼 지점을 찾는다', () => {
    const factor = findMaximumSafeEditFactor((candidate) => preservesMinimumInkGap(
      makeSyllable(makeJungseong(-0.5 * candidate)),
      boxes,
      'JU',
      0.1,
    ))
    expect(factor).toBeGreaterThan(0.24)
    expect(factor).toBeLessThan(0.26)
  })

  it('같은 컴포넌트 내부에서 만나는 획은 충돌로 취급하지 않는다', () => {
    const medial = makeJungseong(0)
    medial.strokes!.push({
      id: 'ju-cross',
      points: [{ x: 0, y: 0.5 }, { x: 0.2, y: 0.5 }],
      closed: false,
      thickness: 0.05,
    })
    expect(getMinimumInterComponentInkGap(makeSyllable(medial), boxes, 'JU')).toBeCloseTo(0.15)
  })
})
