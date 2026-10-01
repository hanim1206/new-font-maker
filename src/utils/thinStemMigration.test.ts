import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { medialBoxEmOf } from '../services/stemMaster'
import type { JamoData } from '../types'
import { withThinStemInEm, withThinStemsInEm } from './thinStemMigration'

const baseJungseong = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const HEIGHT = medialBoxEmOf('ㅗ', 'strokes', 'open').height

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
})
