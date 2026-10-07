import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ASCII_PRINTABLE_CODE_POINTS } from './fontGenerator'
import { nearestNotoLatinWeight, notoLatinSourceOf, quadraticContourOf } from './notoLatinSource'
import type { NotoLatinData } from './notoLatinSource'

const DATA = JSON.parse(readFileSync(fileURLToPath(new URL('../data/notoLatin.v1.json', import.meta.url)), 'utf8')) as NotoLatinData
const identity = (x: number, y: number) => ({ x, y })

describe('노토 숫자 · 기호 출처', () => {
  it('굵기 100~900 아홉 개에 띄어쓰기 뺀 ASCII 94자가 다 있다', () => {
    expect(Object.keys(DATA.weights).sort()).toEqual(['100', '200', '300', '400', '500', '600', '700', '800', '900'])
    for (const glyphs of Object.values(DATA.weights)) {
      expect(Object.keys(glyphs).map(Number).sort((a, b) => a - b)).toEqual([...ASCII_PRINTABLE_CODE_POINTS])
    }
  })

  it('연달은 off-curve 사이에 가운데 on-curve를 넣는다', () => {
    const contour = quadraticContourOf([[0, 0, 1], [10, 0, 0], [20, 10, 0], [20, 20, 1]], identity)
    expect(contour).toEqual([
      { x: 0, y: 0, onCurve: true },
      { x: 10, y: 0, onCurve: false },
      { x: 15, y: 5, onCurve: true },
      { x: 20, y: 10, onCurve: false },
      { x: 20, y: 20, onCurve: true },
    ])
  })

  it('on-curve가 없는 윤곽(원)도 점마다 사이 점을 넣어 닫는다', () => {
    const contour = quadraticContourOf([[0, 10, 0], [10, 0, 0], [0, -10, 0], [-10, 0, 0]], identity)
    expect(contour.filter((point) => point.onCurve)).toHaveLength(4)
    expect(contour[0]).toEqual({ x: -5, y: 5, onCurve: true })
  })

  it('가장 가까운 굵기를 고른다', () => {
    expect(nearestNotoLatinWeight(DATA, 400)).toBe('400')
    expect(nearestNotoLatinWeight(DATA, 640)).toBe('600')
    expect(nearestNotoLatinWeight(DATA, 50)).toBe('100')
  })

  it('굵기가 올라가면 0의 폭이 넓어지고, 자간만큼 오른쪽이 늘어난다', () => {
    const zero = 0x30
    const regular = notoLatinSourceOf(DATA, { weight: 400, slant: 0, letterSpacing: 0 }).glyphFor(zero)!
    const bold = notoLatinSourceOf(DATA, { weight: 700, slant: 0, letterSpacing: 0 }).glyphFor(zero)!
    const spaced = notoLatinSourceOf(DATA, { weight: 400, slant: 0, letterSpacing: 0.1 }).glyphFor(zero)!
    expect(regular.advanceWidth).toBe(DATA.weights['400']['48'].advanceWidth)
    expect(bold.advanceWidth).toBeGreaterThan(regular.advanceWidth)
    expect(spaced.advanceWidth).toBe(regular.advanceWidth + 100)
    expect(spaced.contours).toEqual(regular.contours)
    expect(notoLatinSourceOf(DATA, { weight: 400, slant: 0, letterSpacing: 0 }).glyphFor(0x20)).toBeNull()
  })

  it('기울기는 한글과 같은 축(y 380)으로 민다', () => {
    const upright = notoLatinSourceOf(DATA, { weight: 400, slant: 0, letterSpacing: 0 }).glyphFor(0x48)!
    const slanted = notoLatinSourceOf(DATA, { weight: 400, slant: 10, letterSpacing: 0 }).glyphFor(0x48)!
    const tangent = Math.tan(10 * Math.PI / 180)
    upright.contours.flat().forEach((point, index) => {
      const moved = slanted.contours.flat()[index]
      expect(moved.y).toBe(point.y)
      expect(Math.abs(moved.x - (point.x + (point.y - 380) * tangent))).toBeLessThanOrEqual(1)
    })
  })
})
