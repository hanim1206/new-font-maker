import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { placeStemStroke } from '../services/stemBend'
import { medialBoxEmOf } from '../services/stemMaster'
import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { withThinStemInEm, withThinStemsInEm } from './thinStemMigration'

const baseJungseong = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const HEIGHT = medialBoxEmOf('ㅗ', 'strokes', 'open').height
/** 화면의 ㅡ · ㅢ 가로부 칸: 높이 1e-6. */
const boxOf = (char: string, channel: 'strokes' | 'horizontalStrokes'): BoxConfig => ({ x: 0.1, y: 0.8, width: medialBoxEmOf(char, channel, 'open').width, height: 1e-6 })
const emOf = (placed: { box: BoxConfig }, point: { x: number; y: number }) => ({ x: placed.box.x + point.x * placed.box.width, y: placed.box.y + point.y * placed.box.height })

describe('높이 0인 칸의 예전 보 기울기', () => {
  it('백만 배로 저장된 ㅢ · ㅡ 보 끝점을 같은 em의 넓힌 칸 비율로 옮겨 적고, 다시 돌려도 같다', () => {
    for (const [char, channel] of [['ㅢ', 'horizontalStrokes'], ['ㅡ', 'strokes']] as const) {
      const jamo = structuredClone(baseJungseong[char])
      // 예전 저장: 0.02em 올린 끝점 = 0.5 − 0.02 / 1e-6.
      jamo[channel]![0].points[1].y = 0.5 - 0.02 / 1e-6
      const fixed = withThinStemInEm(jamo)
      expect((fixed[channel]![0].points[1].y - 0.5) * HEIGHT, char).toBeCloseTo(-0.02, 9)
      expect(fixed[channel]![0].points[0]).toEqual(jamo[channel]![0].points[0])
      expect(withThinStemInEm(fixed), char).toBe(fixed)
    }
  })

  it('기본 홀자 · 새 방식으로 기울인 보 · 두꺼운 칸의 보는 그대로 둔다', () => {
    expect(withThinStemsInEm(baseJungseong)).toBe(baseJungseong)
    const tilted = structuredClone(baseJungseong['ㅡ'])
    tilted.strokes![0].points[1].y = 0.5 - 0.02 / HEIGHT
    expect(withThinStemInEm(tilted)).toBe(tilted)
    const thick = structuredClone(baseJungseong['ㅗ'])
    thick.strokes!.find((stroke) => stroke.id === 'ㅗ-2')!.points[1].y = -20000
    expect(withThinStemInEm(thick)).toBe(thick)
  })

  // 베타 폰트(희다멘튼체)에 실제로 저장돼 있던 값. 끝을 올리고 끝점 핸들로 끝만 휘어 올린 보다.
  it('핸들이 달린 예전 보는 예전 화면 그대로 — 끝은 올라가고, 핸들은 시작점 높이에 남아 끝에서만 휘어 오른다', () => {
    const cases = [
      ['ㅡ', 'strokes', [{ x: 0, y: 0.5 }, { x: 1.0466840953956145, y: -84363.13636363637, handleIn: { x: 0.7408710057584151, y: -53885.0386597145 } }]],
      ['ㅢ', 'horizontalStrokes', [{ x: 0.04, y: 0.5 }, { x: 1.2197564813018074, y: -115972.9195, handleIn: { x: 0.6419289911859274, y: -52204.861864392755 } }]],
    ] as const
    for (const [char, channel, points] of cases) {
      const jamo = structuredClone(baseJungseong[char])
      const stored: StrokeDataV2 = { ...jamo[channel]![0], points: structuredClone(points) as unknown as StrokeDataV2['points'] }
      const legacy: JamoData = { ...jamo, [channel]: [stored] }
      const fixed = withThinStemInEm(legacy)
      const stroke = fixed[channel]![0]
      // 저장값이 사람 손으로 만들 수 있는 크기로 돌아온다.
      for (const point of stroke.points) for (const item of [point, point.handleIn, point.handleOut]) if (item) expect(Math.abs(item.y - 0.5), char).toBeLessThan(2)
      // 화면에 놓으면: 끝점은 예전처럼 (저장 차이 × 1e-6)em 올라가 있다.
      const box = boxOf(char, channel)
      const placed = placeStemStroke(fixed, stroke, box)
      const start = emOf(placed, placed.stroke.points[0])
      const end = emOf(placed, placed.stroke.points[1])
      const handle = emOf(placed, placed.stroke.points[1].handleIn!)
      const rise = (points[1].y - 0.5) * 1e-6
      expect(end.y - start.y, char).toBeCloseTo(rise, 6)
      expect(end.x - start.x, char).toBeCloseTo((points[1].x - points[0].x) * box.width, 6)
      // 핸들은 시작점 높이 가까이에 남는다(끝점을 잇는 직선 위가 아니다 — 따로 줄이면 여기로 와서 휨이 사라졌다).
      expect(Math.abs(handle.y - start.y), char).toBeLessThan(Math.abs(rise) * 0.2)
      expect(handle.x, char).toBeGreaterThan(start.x)
      expect(handle.x, char).toBeLessThan(end.x)
      expect(withThinStemInEm(fixed), char).toBe(fixed)
    }
    // ㅡ는 예전 놓기 식을 손으로 푼 값과 맞춘다: 핸들은 축의 64% 자리, 시작점 높이.
    const eu = withThinStemInEm({ ...baseJungseong['ㅡ'], strokes: [{ ...baseJungseong['ㅡ'].strokes![0], points: structuredClone(cases[0][2]) as unknown as StrokeDataV2['points'] }] })
    const placed = placeStemStroke(eu, eu.strokes![0], boxOf('ㅡ', 'strokes'))
    const origin = emOf(placed, placed.stroke.points[0])
    const handle = emOf(placed, placed.stroke.points[1].handleIn!)
    expect(handle.x - origin.x).toBeCloseTo(0.5068, 3)
    expect(handle.y - origin.y).toBeCloseTo(0, 3)
  })
})
