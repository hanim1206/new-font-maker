import { describe, expect, it } from 'vitest'
import { clampToWall, dragValue, groupOfPart, GROUPS, groupsOfSyllable, inSafe, moldBoxes, partAt, presetOf } from './moldLab'

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
const VERTICAL = { CH: box(0.1, 0.2, 0.4, 0.6), JU: box(0.6, 0.05, 0.3, 0.9) }
const HORIZONTAL_FINAL = { CH: box(0.25, 0.05, 0.5, 0.3), JU: box(0.05, 0.38, 0.9, 0.15), JO: box(0.2, 0.6, 0.6, 0.35) }

describe('빚기 시험판', () => {
  it('잡은 부위로 갈래를 정한다 — 홀자는 홀자 갈래, 첫닿자 · 받침은 짜임', () => {
    expect(groupOfPart('JU', 'choseong-jungseong-vertical', 'ㅏ')).toBe('v-right')
    expect(groupOfPart('JU', 'choseong-jungseong-vertical-jongseong', 'ㅓ')).toBe('v-left')
    expect(groupOfPart('JU', 'choseong-jungseong-horizontal', 'ㅜ')).toBe('h-down')
    expect(groupOfPart('CH', 'choseong-jungseong-horizontal', 'ㅗ')).toBe('ch-horizontal')
    expect(groupOfPart('JO', 'choseong-jungseong-mixed-jongseong', 'ㅘ')).toBe('jo-mixed')
    expect(groupOfPart('JO', 'choseong-jungseong-vertical', 'ㅏ')).toBeUndefined()
    expect(groupsOfSyllable('choseong-jungseong-vertical-jongseong', 'ㅐ')).toEqual(['v-double', 'ch-vertical', 'jo-vertical'])
  })

  it('프리셋 셋은 안전선 안, 벽은 안전선 밖이다', () => {
    for (const info of Object.values(GROUPS)) {
      if (!info.range) continue
      const { presets, wall, safe } = info.range
      expect(presets.narrow).toBeLessThan(presets.normal)
      expect(presets.normal).toBeLessThan(presets.wide)
      for (const value of Object.values(presets)) expect(inSafe(info.range, value)).toBe(true)
      expect(wall[0]).toBeLessThan(safe[0])
      expect(wall[1]).toBeGreaterThan(safe[1])
    }
  })

  it('끌어도 벽 밖으로 안 나간다', () => {
    const range = GROUPS['v-none'].range!
    expect(dragValue(range, range.presets.normal, -10_000, 300)).toBe(range.wall[0])
    expect(dragValue(range, range.presets.normal, 10_000, 300)).toBe(range.wall[1])
    expect(clampToWall(range, 0)).toBe(range.wall[0])
    expect(presetOf(range, range.presets.wide)).toBe('wide')
    expect(presetOf(range, range.presets.wide + 0.001)).toBeUndefined()
  })

  it('세로 갈래 틈을 넓히면 첫닿자만 바깥(왼쪽)으로 간다', () => {
    const range = GROUPS['v-right'].range!
    const out = moldBoxes(VERTICAL, 'choseong-jungseong-vertical', 'ㅏ', { 'v-right': range.engine + 0.02 })
    expect(out.CH!.x).toBeCloseTo(0.08)
    expect(out.JU).toEqual(VERTICAL.JU)
    // 다른 갈래 값은 안 듣는다.
    expect(moldBoxes(VERTICAL, 'choseong-jungseong-vertical', 'ㅏ', { 'v-left': range.engine + 0.02 })).toEqual(VERTICAL)
  })

  it('받침 위 틈은 받침을 그대로 두고 윗부분만 옮긴다', () => {
    const range = GROUPS['jo-horizontal'].range!
    const out = moldBoxes(HORIZONTAL_FINAL, 'choseong-jungseong-horizontal-jongseong', 'ㅗ', { 'jo-horizontal': range.engine - 0.01 })
    expect(out.JO).toEqual(HORIZONTAL_FINAL.JO)
    expect(out.CH!.y).toBeCloseTo(0.06)
    expect(out.JU!.y).toBeCloseTo(0.39)
  })

  it('첫닿자 크기는 홀자 쪽 모서리를 두고 키운다', () => {
    const out = moldBoxes(VERTICAL, 'choseong-jungseong-vertical', 'ㅏ', { 'ch-vertical': 1.1 })
    expect(out.CH!.x + out.CH!.width).toBeCloseTo(0.5)
    expect(out.CH!.width).toBeCloseTo(0.44)
    expect(out.CH!.y + out.CH!.height / 2).toBeCloseTo(0.5)
  })

  it('누른 자리에서 가장 가까운 부위를 고른다', () => {
    const present = { CH: true, JU: true, JO: true }
    expect(partAt(HORIZONTAL_FINAL, 0.5, 0.15, present)).toBe('CH')
    expect(partAt(HORIZONTAL_FINAL, 0.02, 0.45, present)).toBe('JU')
    expect(partAt(HORIZONTAL_FINAL, 0.5, 0.99, present)).toBe('JO')
    expect(partAt(HORIZONTAL_FINAL, 0.5, 0.99, { CH: true, JU: true })).toBe('JU')
  })
})
