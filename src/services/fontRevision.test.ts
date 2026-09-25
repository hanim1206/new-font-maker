import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { fontVersionText, setHeadFontRevision } from './fontRevision'

describe('추출 버전', () => {
  it('n번째 추출은 1.00n', () => {
    expect(fontVersionText(0)).toBe('1.000')
    expect(fontVersionText(3)).toBe('1.003')
    expect(fontVersionText(1000)).toBe('2.000')
    expect(fontVersionText(-1)).toBe('1.000')
  })

  it('head.fontRevision을 고치고 체크섬을 다시 맞춘다', () => {
    const font = new opentype.Font({
      familyName: 'Test', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200,
      glyphs: [new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() })],
    })
    const buffer = font.toArrayBuffer() as ArrayBuffer
    setHeadFontRevision(buffer, 7)
    expect(opentype.parse(buffer).tables.head.fontRevision).toBe(1.007)
    const view = new DataView(buffer)
    let sum = 0
    for (let at = 0; at + 4 <= buffer.byteLength; at += 4) sum = (sum + view.getUint32(at)) >>> 0
    expect(sum).toBe(0xb1b0afba)
  })
})

