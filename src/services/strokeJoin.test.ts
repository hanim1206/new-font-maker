import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2, StrokeRenderStyle } from '../types'
import { countOwnJoins, DEFAULT_MITER_LIMIT, effectiveJoinOf, miterAngleOf, miterLimitOf, miterLimitOfAngle, withoutOwnJoins } from './strokeJoin'

const brush = (extra: Partial<Extract<StrokeRenderStyle, { mode: 'brush' }>> = {}): StrokeRenderStyle => ({ mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 }, ...extra })
const stroke = (id: string, linejoin?: StrokeDataV2['linejoin']): StrokeDataV2 => ({ id, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false, thickness: .07, ...(linejoin ? { linejoin } : {}) })

describe('꺾임 한 입구 — 종류는 획 > 전역, 뾰족 한계는 전역 하나', () => {
  it('뾰족 한계: 없으면 1.64, 있으면 그 값, 1~4로 잘린다', () => {
    expect(miterLimitOf(undefined)).toBe(DEFAULT_MITER_LIMIT)
    expect(miterLimitOf(brush())).toBe(DEFAULT_MITER_LIMIT)
    expect(miterLimitOf(brush({ miterLimit: 3 }))).toBe(3)
    expect(miterLimitOf(brush({ miterLimit: 10 }))).toBe(4)
    expect(miterLimitOf({ mode: 'angled-area', cutAngle: 35, cornerRadius: .2 })).toBe(DEFAULT_MITER_LIMIT)
  })

  it('뾰족 한계 ↔ 안쪽 각: 1.64는 75도, 75도는 1.64 근처, 30~150도 안에서 되돌아온다', () => {
    expect(miterAngleOf(DEFAULT_MITER_LIMIT)).toBe(75)
    expect(miterLimitOfAngle(75)).toBeCloseTo(1.643, 3)
    for (const angle of [30, 45, 75, 90, 120, 150]) expect(miterAngleOf(miterLimitOfAngle(angle))).toBe(angle)
    expect(miterLimitOfAngle(10)).toBe(miterLimitOfAngle(30))
  })

  it('실효 꺾임: 획별 값 > 전역 > 뾰족', () => {
    const global = { linejoin: 'bevel' as const, strokeStyle: brush({ miterLimit: 2 }) }
    expect(effectiveJoinOf(stroke('a', 'round'), global)).toEqual({ linejoin: 'round', miterLimit: 2 })
    expect(effectiveJoinOf(stroke('a'), global)).toEqual({ linejoin: 'bevel', miterLimit: 2 })
    expect(effectiveJoinOf(stroke('a'), undefined)).toEqual({ linejoin: 'miter', miterLimit: DEFAULT_MITER_LIMIT })
  })
})

describe('꺾임을 따로 정한 획 세기 · 풀기', () => {
  const jamo: JamoData = {
    char: 'ㅘ', type: 'jungseong',
    horizontalStrokes: [stroke('h1', 'round'), stroke('h2')],
    verticalStrokes: [stroke('v1', 'bevel')],
    contextStrokes: { vertical: [stroke('c1', 'miter')] },
  } as JamoData

  it('세 묶음과 문맥 변형까지 센다', () => {
    expect(countOwnJoins(jamo)).toBe(3)
    expect(countOwnJoins({ strokes: [stroke('a')] })).toBe(0)
  })

  it('풀기는 획별 값만 지우고 나머지는 그대로, 지울 것이 없으면 같은 객체', () => {
    const released = withoutOwnJoins(jamo)
    expect(countOwnJoins(released)).toBe(0)
    expect(released.horizontalStrokes?.map((s) => s.id)).toEqual(['h1', 'h2'])
    expect(released.horizontalStrokes?.[1]).toBe(jamo.horizontalStrokes?.[1])
    expect(released.contextStrokes?.vertical?.[0].id).toBe('c1')
    expect(jamo.horizontalStrokes?.[0].linejoin).toBe('round')
    const plain = { strokes: [stroke('a')] }
    expect(withoutOwnJoins(plain)).toBe(plain)
  })
})
