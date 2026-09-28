// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { compactGlyphForCff, replaceCffCharStrings } from './cffCharStrings'
import { readSfnt } from './openTypePackaging'

/** 직선 · 2차 · 3차 곡선 · 큰 좌표(2바이트 · 3바이트 수)를 섞은 글리프들. 빈 글리프도 하나. */
function makeGlyphs(): Array<InstanceType<typeof opentype.Glyph>> {
  const notdef = new opentype.Path()
  notdef.moveTo(50, 0); notdef.lineTo(450, 0); notdef.lineTo(450, 800); notdef.lineTo(50, 800); notdef.close()
  const curvy = new opentype.Path()
  curvy.moveTo(10.4, -120.6)
  curvy.quadraticCurveTo(300.2, 900.7, 600.5, -50.1)
  curvy.curveTo(700, 100, 1500.3, -1200.8, 40000, 20)
  curvy.lineTo(-40000, -33000)
  curvy.close()
  curvy.moveTo(200, 200); curvy.lineTo(210, 205); curvy.close()
  return [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdef }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'uniAC00', unicode: 0xac00, advanceWidth: 1000, path: curvy }),
  ]
}

function build(glyphs: Array<InstanceType<typeof opentype.Glyph>>): ArrayBuffer {
  const font = new opentype.Font({ familyName: 'Test', styleName: 'Regular', unitsPerEm: 1000, ascender: 880, descender: -120, glyphs })
  font.createdTimestamp = 0
  return font.toArrayBuffer() as ArrayBuffer
}

/** head의 checkSumAdjustment(8) · created(20) · modified(28)는 시각에 따라 달라지므로 뺀다. */
function comparableTables(buffer: ArrayBuffer): Record<string, number[]> {
  return Object.fromEntries(readSfnt(buffer).tables.map((table) => {
    const bytes = [...table.data]
    if (table.tag === 'head') bytes.fill(0, 8, 12).fill(0, 20, 36)
    return [table.tag, bytes]
  }))
}

describe('CFF CharStrings 직접 쓰기', () => {
  it('굳혀서 갈아 끼운 파일이 opentype.js가 통째로 만든 파일과 표마다 같다', () => {
    const expected = build(makeGlyphs())
    const glyphs = makeGlyphs()
    const compacted = glyphs.map((glyph) => compactGlyphForCff(glyph))
    const actual = replaceCffCharStrings(build(glyphs), compacted.map((entry) => entry.charString))
    expect(comparableTables(actual)).toEqual(comparableTables(expected))
  })

  it('대역 윤곽은 두 점뿐이고, 잉크 상자는 진짜 곡선 기준으로 남는다', () => {
    const [, space, curvy] = makeGlyphs()
    const box = curvy.getBoundingBox()
    const metrics = curvy.getMetrics()
    const compact = compactGlyphForCff(curvy)
    expect(curvy.path.commands).toHaveLength(2)
    expect(curvy.getMetrics()).toEqual(metrics)
    expect(compact.inkBox).toEqual({ y1: box.y1, y2: box.y2 })
    expect(compactGlyphForCff(space).inkBox).toBeNull()
  })

  it('글리프 수가 다르면 멈춘다', () => {
    const glyphs = makeGlyphs()
    const compacted = glyphs.map((glyph) => compactGlyphForCff(glyph))
    expect(() => replaceCffCharStrings(build(glyphs), compacted.slice(1).map((entry) => entry.charString))).toThrow('CharStrings 수')
  })
})
