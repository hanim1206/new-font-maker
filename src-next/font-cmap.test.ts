import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'

const COMPATIBILITY_JAMO_START = 0x3131
const COMPATIBILITY_JAMO_END = 0x3163
const HANGUL_SYLLABLE_START = 0xac00
const HANGUL_SYLLABLE_END = 0xd7a3
const storageValues = new Map<string, string>()

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
  })
})

afterAll(() => vi.unstubAllGlobals())

interface SfntTable {
  offset: number
  length: number
}

interface Format4Subtable {
  view: DataView
  table: SfntTable
  offset: number
  length: number
  segCount: number
  endCodesOffset: number
  startCodesOffset: number
  idDeltasOffset: number
  idRangeOffsetsOffset: number
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function findSfntTable(view: DataView, tag: string): SfntTable {
  const numTables = view.getUint16(4)
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16
    if (readTag(view, recordOffset) === tag) {
      return {
        offset: view.getUint32(recordOffset + 8),
        length: view.getUint32(recordOffset + 12),
      }
    }
  }
  throw new Error(`${tag} 테이블을 찾을 수 없습니다.`)
}

function readWindowsFormat4(buffer: ArrayBuffer): Format4Subtable {
  const view = new DataView(buffer)
  const cmap = findSfntTable(view, 'cmap')
  const numSubtables = view.getUint16(cmap.offset + 2)

  for (let index = 0; index < numSubtables; index += 1) {
    const recordOffset = cmap.offset + 4 + index * 8
    const platformId = view.getUint16(recordOffset)
    const encodingId = view.getUint16(recordOffset + 2)
    const subtableOffset = cmap.offset + view.getUint32(recordOffset + 4)
    if (platformId !== 3 || encodingId !== 1 || view.getUint16(subtableOffset) !== 4) continue

    const length = view.getUint16(subtableOffset + 2)
    const segCount = view.getUint16(subtableOffset + 6) / 2
    const endCodesOffset = subtableOffset + 14
    const startCodesOffset = endCodesOffset + segCount * 2 + 2
    const idDeltasOffset = startCodesOffset + segCount * 2
    const idRangeOffsetsOffset = idDeltasOffset + segCount * 2

    return {
      view,
      table: cmap,
      offset: subtableOffset,
      length,
      segCount,
      endCodesOffset,
      startCodesOffset,
      idDeltasOffset,
      idRangeOffsetsOffset,
    }
  }

  throw new Error('Windows Unicode BMP format 4 cmap을 찾을 수 없습니다.')
}

function readFormat4Segments(format4: Format4Subtable): Array<{ start: number; end: number }> {
  return Array.from({ length: format4.segCount }, (_, index) => ({
    start: format4.view.getUint16(format4.startCodesOffset + index * 2),
    end: format4.view.getUint16(format4.endCodesOffset + index * 2),
  }))
}

function lookupFormat4(format4: Format4Subtable, codePoint: number): number {
  const { view } = format4
  for (let index = 0; index < format4.segCount; index += 1) {
    const end = view.getUint16(format4.endCodesOffset + index * 2)
    if (codePoint > end) continue

    const start = view.getUint16(format4.startCodesOffset + index * 2)
    if (codePoint < start) return 0

    const delta = view.getInt16(format4.idDeltasOffset + index * 2)
    const rangeOffsetAddress = format4.idRangeOffsetsOffset + index * 2
    const rangeOffset = view.getUint16(rangeOffsetAddress)
    if (rangeOffset === 0) return (codePoint + delta) & 0xffff

    const glyphAddress = rangeOffsetAddress + rangeOffset + (codePoint - start) * 2
    const glyphId = view.getUint16(glyphAddress)
    return glyphId === 0 ? 0 : (glyphId + delta) & 0xffff
  }
  return 0
}

function makeFullHangulFont(): ArrayBuffer {
  const glyphs = [
    new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: 1000,
      path: new opentype.Path(),
    }),
    new opentype.Glyph({
      name: 'space',
      unicode: 0x20,
      advanceWidth: 500,
      path: new opentype.Path(),
    }),
  ]

  for (let codePoint = COMPATIBILITY_JAMO_START; codePoint <= COMPATIBILITY_JAMO_END; codePoint += 1) {
    glyphs.push(new opentype.Glyph({
      name: `uni${codePoint.toString(16).toUpperCase()}`,
      unicode: codePoint,
      advanceWidth: 850,
      path: new opentype.Path(),
    }))
  }
  for (let codePoint = HANGUL_SYLLABLE_START; codePoint <= HANGUL_SYLLABLE_END; codePoint += 1) {
    glyphs.push(new opentype.Glyph({
      name: `uni${codePoint.toString(16).toUpperCase()}`,
      unicode: codePoint,
      advanceWidth: 850,
      path: new opentype.Path(),
    }))
  }

  const font = new opentype.Font({
    familyName: 'CmapRegression',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 880,
    descender: -120,
    glyphs,
  })
  return font.toArrayBuffer() as ArrayBuffer
}

describe('한글 OTF cmap 회귀', () => {
  let buffer: ArrayBuffer

  beforeAll(() => {
    buffer = makeFullHangulFont()
  }, 30_000)

  it('전체 한글 매핑을 uint16 길이 안의 연속 segment로 기록한다', () => {
    const format4 = readWindowsFormat4(buffer)

    expect(format4.length).toBe(48)
    expect(format4.segCount).toBe(4)
    expect(format4.length).toBeGreaterThanOrEqual(16 + format4.segCount * 8)
    expect(format4.offset + format4.length).toBeLessThanOrEqual(format4.table.offset + format4.table.length)
    expect(format4.view.getUint16(format4.endCodesOffset + format4.segCount * 2)).toBe(0)
    expect(readFormat4Segments(format4)).toEqual([
      { start: 0x20, end: 0x20 },
      { start: COMPATIBILITY_JAMO_START, end: COMPATIBILITY_JAMO_END },
      { start: HANGUL_SYLLABLE_START, end: HANGUL_SYLLABLE_END },
      { start: 0xffff, end: 0xffff },
    ])
    for (let index = 0; index < format4.segCount; index += 1) {
      expect(format4.view.getUint16(format4.idRangeOffsetsOffset + index * 2)).toBe(0)
    }
  })

  it('한글 코드포인트를 의도한 글리프 ID로 왕복 매핑한다', () => {
    const format4 = readWindowsFormat4(buffer)
    const expectedMappings = [
      [0x20, 1],
      [COMPATIBILITY_JAMO_START, 2],
      [COMPATIBILITY_JAMO_END, 52],
      [HANGUL_SYLLABLE_START, 53],
      [HANGUL_SYLLABLE_END, 11224],
    ] as const

    for (const [codePoint, glyphIndex] of expectedMappings) {
      expect(lookupFormat4(format4, codePoint)).toBe(glyphIndex)
    }

    const parsed = opentype.parse(buffer)
    expect(parsed.glyphs.length).toBe(11225)
    expect(parsed.charToGlyphIndex(' ')).toBe(1)
    expect(parsed.charToGlyphIndex('ㄱ')).toBe(2)
    expect(parsed.charToGlyphIndex('ㅣ')).toBe(52)
    expect(parsed.charToGlyphIndex('가')).toBe(53)
    expect(parsed.charToGlyphIndex('힣')).toBe(11224)
  })

  it('병합할 수 없는 format 4 구간이 용량을 넘으면 출력을 중단한다', async () => {
    const { assertCmapFormat4Capacity } = await import('../src/services/fontGenerator')
    const maximumMappings = Array.from({ length: 8_188 }, (_, index) => ({
      codePoint: index * 2 + 1,
      glyphIndex: index + 1,
    }))
    const overflowingMappings = [
      ...maximumMappings,
      { codePoint: maximumMappings.length * 2 + 1, glyphIndex: maximumMappings.length + 1 },
    ]

    expect(() => assertCmapFormat4Capacity(maximumMappings)).not.toThrow()
    expect(() => assertCmapFormat4Capacity(overflowingMappings)).toThrow(/format 4 용량/)
    expect(() => assertCmapFormat4Capacity([{ codePoint: Number.NaN, glyphIndex: 1 }])).toThrow(/정수 Unicode/)
    expect(() => assertCmapFormat4Capacity([{ codePoint: -1, glyphIndex: 1 }])).toThrow(/범위를 벗어났습니다/)
    expect(() => assertCmapFormat4Capacity([
      { codePoint: 0x41, glyphIndex: 1 },
      { codePoint: 0x41, glyphIndex: 2 },
    ])).toThrow(/중복된 Unicode/)
  })
})
