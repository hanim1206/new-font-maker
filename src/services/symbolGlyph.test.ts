import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { NotoLatinData } from './notoLatinSource'
import type { Contour } from './strokeToOutline'
import type { GlobalStyle } from '../stores/globalStyleStore'

const DATA = JSON.parse(readFileSync(fileURLToPath(new URL('../data/notoLatin.v1.json', import.meta.url)), 'utf8')) as NotoLatinData

let symbolGlyph: typeof import('./symbolGlyph')
let seeds: typeof import('../data/symbolSeeds')
let notoLatin: typeof import('./notoLatinSource')
let baseStyle: GlobalStyle

beforeAll(async () => {
  const memory = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  })
  symbolGlyph = await import('./symbolGlyph')
  seeds = await import('../data/symbolSeeds')
  notoLatin = await import('./notoLatinSource')
  baseStyle = (await import('../stores/globalStyleStore')).useGlobalStyleStore.getState().style
})

function bounds(contours: Contour[]) {
  const points = contours.flat()
  return {
    x1: Math.min(...points.map((point) => point.x)),
    x2: Math.max(...points.map((point) => point.x)),
    y1: Math.min(...points.map((point) => point.y)),
    y2: Math.max(...points.map((point) => point.y)),
  }
}

describe('획으로 만든 숫자 · 기호', () => {
  it('씨앗 0 · 1 · ? · ,는 400에서 노토 잉크 상자와 30 단위 안으로 맞는다', () => {
    for (const char of ['0', '1', '?', ',']) {
      const mine = symbolGlyph.symbolContoursOf(seeds.symbolSeedOf(char), DATA, { ...baseStyle, weight: 400 })
      const noto = notoLatin.notoLatinSourceOf(DATA, { ...baseStyle, weight: 400 }).glyphFor(char.codePointAt(0)!)!
      expect(mine.advanceWidth, char).toBe(noto.advanceWidth)
      const a = bounds(mine.contours)
      const b = bounds(noto.contours)
      for (const key of ['x1', 'x2', 'y1', 'y2'] as const) expect(Math.abs(a[key] - b[key]), `${char} ${key}`).toBeLessThanOrEqual(30)
    }
  })

  it('굵기가 오르면 같은 칸에서 잉크가 두꺼워지고, 폭은 노토 그 굵기 폭 + 자간을 따른다', () => {
    const symbol = seeds.symbolSeedOf('0')
    const light = symbolGlyph.symbolContoursOf(symbol, DATA, { ...baseStyle, weight: 100 })
    const bold = symbolGlyph.symbolContoursOf(symbol, DATA, { ...baseStyle, weight: 600, letterSpacing: 0.05 })
    expect(bounds(bold.contours).x2 - bounds(bold.contours).x1).toBeGreaterThan(bounds(light.contours).x2 - bounds(light.contours).x1)
    expect(bold.advanceWidth).toBe(DATA.weights['600']['48'].advanceWidth + 50)
  })

  it('추출 출처는 획이 있으면 획, 없으면 노토', () => {
    const source = symbolGlyph.symbolLatinSourceOf(DATA, baseStyle, { '1': seeds.symbolSeedOf('1') })
    const noto = notoLatin.notoLatinSourceOf(DATA, baseStyle)
    expect(source.glyphFor(0x31)!.contours).not.toEqual(noto.glyphFor(0x31)!.contours)
    expect(source.glyphFor(0x32)).toEqual(noto.glyphFor(0x32))
  })

  it('빈 획이면 빈 글자(폭은 그대로)', () => {
    const empty = symbolGlyph.symbolContoursOf({ char: '0', strokes: [] }, DATA, baseStyle)
    expect(empty.contours).toEqual([])
    expect(empty.advanceWidth).toBe(DATA.weights['400']['48'].advanceWidth)
  })
})
