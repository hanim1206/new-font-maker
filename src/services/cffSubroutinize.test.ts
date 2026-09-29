// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { compactGlyphForCff, replaceCffCharStrings } from './cffCharStrings'
import { expandSubroutines, specializeCharString, subroutinizeCharStrings } from './cffSubroutinize'
import { subroutinizeForExport } from './cffSubroutinizeRunner'

type Glyph = InstanceType<typeof opentype.Glyph>

/** 같은 조각(네모 · 계단 · 곡선)이 자리만 바꿔 되풀이되는 글리프들. 가로 · 세로 · 사선 · 곡선 · 빈 글리프를 섞는다. */
function makeGlyphs(): Glyph[] {
  const glyphs: Glyph[] = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new opentype.Path() }),
  ]
  for (let i = 0; i < 40; i += 1) {
    const path = new opentype.Path()
    const ox = (i % 7) * 37
    const oy = (i % 5) * 53
    // 네모(가로 · 세로선)
    path.moveTo(100 + ox, 100 + oy); path.lineTo(400 + ox, 100 + oy); path.lineTo(400 + ox, 180 + oy); path.lineTo(100 + ox, 180 + oy); path.close()
    // 계단(사선 섞임)
    path.moveTo(500, 200 + oy)
    for (let k = 0; k < 12; k += 1) path.lineTo(500 + (k + 1) * 13, 200 + oy + ((k % 3) - 1) * 7)
    path.lineTo(520, 600); path.close()
    // 곡선
    if (i % 3 === 0) { path.moveTo(200, 700); path.curveTo(260, 800, 340, 800, 400, 700); path.quadraticCurveTo(300, 650, 200, 700); path.close() }
    // 글자마다 다른 조각
    path.moveTo(50 + i, 900); path.lineTo(60 + 2 * i, 950 - i); path.lineTo(40, 960); path.close()
    glyphs.push(new opentype.Glyph({ name: `g${i}`, unicode: 0xac00 + i, advanceWidth: 1000, path }))
  }
  return glyphs
}

function build(glyphs: Glyph[]): ArrayBuffer {
  const font = new opentype.Font({ familyName: 'Test', styleName: 'Regular', unitsPerEm: 1000, ascender: 880, descender: -120, glyphs })
  font.createdTimestamp = 0
  return font.toArrayBuffer() as ArrayBuffer
}

/** 파일을 opentype.js로 다시 읽어 글리프마다 (폭, 절대 좌표 명령)을 뽑는다. */
function outlines(buffer: ArrayBuffer): Array<{ advanceWidth: number; commands: unknown[] }> {
  const font = opentype.parse(buffer)
  const result = []
  for (let i = 0; i < font.glyphs.length; i += 1) {
    const glyph = font.glyphs.get(i)
    result.push({ advanceWidth: glyph.advanceWidth, commands: glyph.path.commands })
  }
  return result
}

function exportPair() {
  const glyphs = makeGlyphs()
  const charStrings = glyphs.map((glyph) => compactGlyphForCff(glyph).charString)
  const plain = replaceCffCharStrings(build(glyphs), charStrings)
  const { charStrings: packed, globalSubrs } = subroutinizeCharStrings(charStrings)
  const subroutinized = replaceCffCharStrings(build(glyphs), packed, globalSubrs)
  return { plain, subroutinized, globalSubrs }
}

describe('CFF 전역 서브루틴', () => {
  it('서브루틴을 붙여도 다시 읽은 윤곽 · 폭이 같고 파일은 작아진다', () => {
    const { plain, subroutinized, globalSubrs } = exportPair()
    expect(globalSubrs.length).toBeGreaterThan(0)
    expect(outlines(subroutinized)).toEqual(outlines(plain))
    expect(subroutinized.byteLength).toBeLessThan(plain.byteLength)
  })

  it('가로 · 세로선은 hlineto · vlineto로, 첫 moveto 앞 폭은 그대로 둔다', () => {
    const path = new opentype.Path()
    path.moveTo(0, 100); path.lineTo(300, 100); path.lineTo(300, 400); path.lineTo(0, 400); path.close()
    const glyph = new opentype.Glyph({ name: 'box', advanceWidth: 920, path })
    const program = specializeCharString(compactGlyphForCff(glyph).charString)
    // 920 0 100 → 920 100 vmoveto, 300 300 -300 hlineto (가로 · 세로 · 가로 번갈이)
    expect(program).toEqual([920, 100, 1_000_004, 300, 300, -300, 1_000_006])
  })

  it('서브루틴이 서브루틴을 불러도(중첩) 풀린다', () => {
    const glyphs = makeGlyphs()
    const charStrings = glyphs.map((glyph) => compactGlyphForCff(glyph).charString)
    const { charStrings: packed, globalSubrs } = subroutinizeCharStrings(charStrings)
    // 몸통을 풀어 바뀌면 그 안에서 다른 서브루틴을 부른 것이다.
    const nested = globalSubrs.filter((body) => {
      const inner = body.subarray(0, body.length - 1)
      return expandSubroutines(inner, globalSubrs).length !== inner.length
    })
    expect(nested.length).toBeGreaterThan(0)
    for (const bytes of packed) expect(() => expandSubroutines(bytes, globalSubrs)).not.toThrow()
  })

  it('모르는 CharString(5바이트 수)이면 서브루틴 없이 원래 바이트를 돌려준다', async () => {
    const path = new opentype.Path()
    path.moveTo(0, 0); path.lineTo(40000, 20); path.close()
    const charStrings = [compactGlyphForCff(new opentype.Glyph({ name: 'far', advanceWidth: 1000, path })).charString]
    expect(() => subroutinizeCharStrings(charStrings)).toThrow()
    const result = await subroutinizeForExport(charStrings)
    expect(result.globalSubrs).toEqual([])
    expect(result.charStrings).toEqual(charStrings)
  })
})
