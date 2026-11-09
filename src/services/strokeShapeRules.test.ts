import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { JamoData } from '../types'
import { decomposeSyllable } from '../utils/hangulUtils'
import { applyStrokeShapeRules, BOTTOM_KICK_SHAPES, GIYEOK_SWEEP_SHAPES, kickStroke, STROKE_SHAPES_OFF, sweepStroke, sweepXAt } from './strokeShapeRules'

const maps = baseJamos as unknown as { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }
const syllableOf = (char: string) => decomposeSyllable(char, maps.choseong, maps.jungseong, maps.jongseong)
const ON = { giyeokSweep: true, bottomKick: true }

describe('획 꼴 규칙 — ㄱ 삐침', () => {
  it('오른홀자 옆 ㄱ은 꺾임에서 왼쪽 아래로 휘어 내린다', () => {
    const drawn = applyStrokeShapeRules(syllableOf('가'), ON)
    const [head, corner, tail] = drawn.choseong!.strokes![0].points
    expect(head).toEqual({ x: 0, y: 0 })
    expect(corner.x).toBeCloseTo(0.976)
    expect(corner.handleOut).toBeDefined()
    expect(tail.x).toBeLessThan(0.1)
    expect(tail.handleIn).toBeDefined()
  })

  it('저장 꼴은 그대로 두고, 바꾸기 전 획을 틀로 굳혀 상자 맞춤이 안 바뀐다', () => {
    const before = JSON.stringify(maps.choseong['ㄱ'])
    const drawn = applyStrokeShapeRules(syllableOf('거'), ON)
    expect(JSON.stringify(maps.choseong['ㄱ'])).toBe(before)
    expect(drawn.choseong!.frame?.strokes).toEqual(maps.choseong['ㄱ'].strokes)
  })

  it('끄거나 아래홀자 · 다른 닿자면 음절을 그대로 돌려준다', () => {
    for (const [char, params] of [['가', STROKE_SHAPES_OFF], ['고', ON], ['구', ON], ['마', ON], ['노', ON]] as const) {
      const syllable = syllableOf(char)
      expect(applyStrokeShapeRules(syllable, params)).toBe(syllable)
    }
  })

  it('ㅋ 가운데 가로줄기는 휜 세로줄기에 닿는 자리에서 멈춘다', () => {
    const drawn = applyStrokeShapeRules(syllableOf('카'), ON)
    const [stem, bar] = drawn.choseong!.strokes!
    const end = bar.points[1]
    expect(end.x).toBeLessThan(0.965)
    expect(end.x).toBeCloseTo(sweepXAt(stem, end.y)!, 6)
  })

  it('ㄲ은 두 ㄱ이 다 휜다', () => {
    const drawn = applyStrokeShapeRules(syllableOf('까'), ON)
    expect(drawn.choseong!.strokes!.every((stroke) => stroke.points[2].handleIn)).toBe(true)
  })

  it('사용자가 고친 꼴(손잡이가 있거나 점이 셋이 아닌 획)은 건드리지 않는다', () => {
    const stroke = maps.choseong['ㄱ'].strokes![0]
    expect(sweepStroke({ ...stroke, points: [...stroke.points, { x: 0.5, y: 1 }] }, GIYEOK_SWEEP_SHAPES['ㄱ-1'])).toBeNull()
    expect(sweepStroke({ ...stroke, points: [stroke.points[0], { ...stroke.points[1], handleOut: { x: 1, y: 0.2 } }, stroke.points[2]] }, GIYEOK_SWEEP_SHAPES['ㄱ-1'])).toBeNull()
  })
})

describe('획 꼴 규칙 — 맨 아래 가로줄기 치킴', () => {
  it('ㅏ 옆 ㄹ은 마지막 토막만 오른쪽으로 빼고 끝을 올린다', () => {
    const before = maps.choseong['ㄹ'].strokes![0].points
    const after = applyStrokeShapeRules(syllableOf('라'), ON).choseong!.strokes![0].points
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
    const end = after[after.length - 1]
    expect(end.x).toBeCloseTo(BOTTOM_KICK_SHAPES['ㄹ-1'].reach)
    expect(end.y).toBeCloseTo(1 - BOTTOM_KICK_SHAPES['ㄹ-1'].rise)
    expect(end.handleIn?.y).toBeCloseTo(1)
  })

  it('왼가지 홀자(ㅓ ㅕ) 옆에서는 덜 빼고, ㄴ은 치키지 않는다', () => {
    const right = applyStrokeShapeRules(syllableOf('라'), ON).choseong!.strokes![0].points.at(-1)!
    const left = applyStrokeShapeRules(syllableOf('러'), ON).choseong!.strokes![0].points.at(-1)!
    expect(left.x).toBeLessThan(right.x)
    expect(left.x).toBeGreaterThan(1)
    expect(applyStrokeShapeRules(syllableOf('너'), ON).choseong!.strokes).toEqual(maps.choseong['ㄴ'].strokes)
  })

  it('받침 ㄵ의 ㄴ은 ㅈ 쪽으로 끝을 올리고, 홑받침 ㄴ은 그대로다', () => {
    const nj = applyStrokeShapeRules(syllableOf('앉'), ON).jongseong!.strokes!.find((stroke) => stroke.id === 'ㄵ종-1')!
    const before = maps.jongseong['ㄵ'].strokes!.find((stroke) => stroke.id === 'ㄵ종-1')!
    expect(nj.points.at(-1)!.y).toBeLessThan(before.points.at(-1)!.y)
    expect(applyStrokeShapeRules(syllableOf('안'), ON).jongseong).toBe(syllableOf('안').jongseong ?? null)
  })

  it('ㄸ은 오른 ㄷ만, ㅍ은 아래 가로줄기만 바뀐다', () => {
    const ddi = applyStrokeShapeRules(syllableOf('따'), ON).choseong!.strokes!
    expect(ddi.find((stroke) => stroke.id === 'ㄸ-1')).toEqual(maps.choseong['ㄸ'].strokes!.find((stroke) => stroke.id === 'ㄸ-1'))
    expect(ddi.find((stroke) => stroke.id === 'ㄸ-4')!.points.at(-1)!.handleIn).toBeDefined()
    const pi = applyStrokeShapeRules(syllableOf('파'), ON).choseong!.strokes!
    expect(pi.filter((stroke) => stroke.points.some((point) => point.handleIn)).map((stroke) => stroke.id)).toEqual(['ㅍ-2'])
  })

  it('세로로 끝나는 획이나 손잡이가 있는 획은 건드리지 않는다', () => {
    const stroke = maps.choseong['ㄱ'].strokes![0]
    expect(kickStroke(stroke, BOTTOM_KICK_SHAPES['ㄹ-1'])).toBeNull()
  })
})
