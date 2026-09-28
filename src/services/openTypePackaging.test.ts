import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { createFontIdentity } from './fontIdentity'
import {
  buildNameTable,
  finalizeOpenTypePackaging,
  nameRecordsOf,
  readCmapRecords,
  readSfnt,
  withUnicodePlatformCmap,
  writeSfnt,
} from './openTypePackaging'
import type { OpenTypeNaming } from './openTypePackaging'
import { validateOpenTypeForIOS } from './openTypeValidation'

function box(x: number, y: number, size: number) {
  const path = new opentype.Path()
  path.moveTo(x, y)
  path.lineTo(x + size, y)
  path.lineTo(x + size, y + size)
  path.lineTo(x, y + size)
  path.close()
  return path
}

/** opentype.js가 있는 그대로 내는 작은 폰트: .notdef · space · 가 · 힣 · ㄱ. */
function rawFont(): ArrayBuffer {
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 1000, path: box(50, 0, 700) }),
    new opentype.Glyph({ name: 'space', unicode: 0x20, advanceWidth: 220, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'uniAC00', unicode: 0xac00, advanceWidth: 920, path: box(100, -100, 800) }),
    new opentype.Glyph({ name: 'uniD7A3', unicode: 0xd7a3, advanceWidth: 920, path: box(100, 0, 700) }),
    new opentype.Glyph({ name: 'uni3131', unicode: 0x3131, advanceWidth: 920, path: box(100, 0, 500) }),
  ]
  const font = new opentype.Font({
    familyName: 'Kkubulche', styleName: 'Regular', unitsPerEm: 1000, ascender: 1160, descender: -288, glyphs,
    tables: { os2: { sTypoAscender: 880, sTypoDescender: -120, usWinAscent: 1160, usWinDescent: 288 } },
  })
  // 실제 파이프라인(`applyEnglishFontNames`)처럼 CFF FontName의 출처를 맞춘다.
  for (const platform of ['unicode', 'macintosh', 'windows'] as const) {
    (font.names[platform] as Record<string, Record<string, string>>).postScriptName = { en: `${(font.names[platform] as Record<string, Record<string, string>>).fontFamily.en.replace(/\s/g, '')}-Regular` }
  }
  return font.toArrayBuffer() as ArrayBuffer
}

const NAMING: OpenTypeNaming = {
  copyright: 'Copyright (c) 2026',
  familyName: 'Kkubulche',
  subfamilyName: 'Regular',
  uniqueId: '1.003;FTMK;Kkubulche-Regular',
  fullName: 'Kkubulche Regular',
  version: 'Version 1.003',
  postScriptName: 'Kkubulche-Regular',
  localized: [{ windowsLanguageId: 0x0412, familyName: '꾸불체', fullName: '꾸불체 Regular' }],
}

interface ParsedName { platformId: number; encodingId: number; languageId: number; nameId: number; text: string }

function parseNames(name: Uint8Array): ParsedName[] {
  const view = new DataView(name.buffer, name.byteOffset, name.byteLength)
  const count = view.getUint16(2)
  const stringOffset = view.getUint16(4)
  return Array.from({ length: count }, (_, index) => {
    const at = 6 + index * 12
    const platformId = view.getUint16(at)
    const length = view.getUint16(at + 8)
    const offset = stringOffset + view.getUint16(at + 10)
    const bytes = name.subarray(offset, offset + length)
    const text = platformId === 1
      ? Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
      : Array.from({ length: length / 2 }, (__, unit) => String.fromCharCode((bytes[unit * 2] << 8) | bytes[unit * 2 + 1])).join('')
    return { platformId, encodingId: view.getUint16(at + 2), languageId: view.getUint16(at + 4), nameId: view.getUint16(at + 6), text }
  })
}

describe('sfnt 컨테이너', () => {
  it('읽고 다시 쓰면 표 내용이 같고 체크섬이 맞는다', () => {
    const raw = rawFont()
    const first = readSfnt(raw)
    const rewritten = writeSfnt(first)
    const second = readSfnt(rewritten)
    expect(second.sfntVersion).toBe(first.sfntVersion)
    expect(second.tables.map((table) => table.tag)).toEqual([...first.tables.map((table) => table.tag)].sort())
    for (const table of first.tables) {
      const written = second.tables.find((item) => item.tag === table.tag)!.data
      if (table.tag === 'head') {
        // checkSumAdjustment(8~11)만 다시 계산된다.
        expect(written.subarray(12)).toEqual(table.data.subarray(12))
        expect(written.subarray(0, 8)).toEqual(table.data.subarray(0, 8))
        continue
      }
      expect(written).toEqual(table.data)
    }
    const report = validateOpenTypeForIOS(rewritten)
    expect(report.issues.map((issue) => issue.code)).not.toContain('head.checksum')
    expect(() => opentype.parse(rewritten)).not.toThrow()
  })
})

describe('cmap Unicode 플랫폼 레코드', () => {
  it('(3,1)과 같은 서브테이블을 가리키는 (0,3)을 더한다 — 매핑 출처가 하나다', () => {
    const cmap = readSfnt(rawFont()).tables.find((table) => table.tag === 'cmap')!.data
    expect(readCmapRecords(cmap).map((record) => [record.platformId, record.encodingId])).toEqual([[3, 1]])

    const withUnicode = withUnicodePlatformCmap(cmap)
    const records = readCmapRecords(withUnicode)
    expect(records.map((record) => [record.platformId, record.encodingId])).toEqual([[0, 3], [3, 1]])
    expect(records[0].offset).toBe(records[1].offset)
    // 서브테이블 바이트는 원본과 같다.
    const original = readCmapRecords(cmap)[0].offset
    const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
    const length = view.getUint16(original + 2)
    expect(withUnicode.subarray(records[0].offset, records[0].offset + length)).toEqual(cmap.subarray(original, original + length))
    // 이미 있으면 그대로.
    expect(withUnicodePlatformCmap(withUnicode)).toBe(withUnicode)
  })

  it('Windows cmap이 없으면 만들지 않고 멈춘다', () => {
    const empty = new Uint8Array([0, 0, 0, 0])
    expect(() => withUnicodePlatformCmap(empty)).toThrow(/Windows Unicode cmap/)
  })
})

describe('name 표', () => {
  it('영문은 (1,0,0) · (3,1,0x409), 한국어는 (3,1,0x412) ID 1 · 4. platform 0 · ID 16 · 17은 없다', () => {
    const records = nameRecordsOf(NAMING)
    const parsed = parseNames(buildNameTable(records))
    expect(parsed).toHaveLength(records.length)
    expect(parsed.filter((record) => record.platformId === 0)).toEqual([])
    expect(parsed.filter((record) => record.nameId >= 16)).toEqual([])
    const pick = (platformId: number, languageId: number, nameId: number) =>
      parsed.find((record) => record.platformId === platformId && record.languageId === languageId && record.nameId === nameId)?.text
    for (const [nameId, text] of [[1, 'Kkubulche'], [2, 'Regular'], [4, 'Kkubulche Regular'], [6, 'Kkubulche-Regular'], [3, '1.003;FTMK;Kkubulche-Regular'], [5, 'Version 1.003']] as const) {
      expect(pick(1, 0, nameId)).toBe(text)
      expect(pick(3, 0x0409, nameId)).toBe(text)
    }
    expect(pick(3, 0x0412, 1)).toBe('꾸불체')
    expect(pick(3, 0x0412, 4)).toBe('꾸불체 Regular')
    expect(pick(3, 0x0412, 6)).toBeUndefined()
    // 정렬: platform → encoding → language → nameID.
    const keys = parsed.map((record) => [record.platformId, record.encodingId, record.languageId, record.nameId].join('/'))
    expect(keys).toEqual([...keys].sort((a, b) => {
      const [pa, ea, la, na] = a.split('/').map(Number)
      const [pb, eb, lb, nb] = b.split('/').map(Number)
      return pa - pb || ea - eb || la - lb || na - nb
    }))
  })

  it('Macintosh 레코드에 한글을 넣으면 멈춘다', () => {
    expect(() => buildNameTable([{ platformId: 1, encodingId: 0, languageId: 0, nameId: 1, text: '꾸불체' }])).toThrow(/ASCII/)
  })
})

describe('finalizeOpenTypePackaging', () => {
  it('cmap · name · head.macStyle · fontRevision만 바꾸고 나머지 표는 바이트 그대로다. ltag는 버린다', () => {
    const raw = rawFont()
    const packaged = finalizeOpenTypePackaging(raw, { naming: NAMING, macStyle: { bold: false, italic: false }, revision: 3 })
    const before = readSfnt(raw)
    const after = readSfnt(packaged)
    expect(after.tables.map((table) => table.tag)).not.toContain('ltag')
    for (const table of before.tables) {
      if (['cmap', 'name', 'head', 'hhea', 'ltag'].includes(table.tag)) continue
      expect(after.tables.find((item) => item.tag === table.tag)?.data, table.tag).toEqual(table.data)
    }
    // hhea는 advanceWidthMax(.notdef 1000 포함)만 다르다.
    const hheaBefore = before.tables.find((table) => table.tag === 'hhea')!.data
    const hheaAfter = after.tables.find((table) => table.tag === 'hhea')!.data
    expect(new DataView(hheaBefore.buffer, hheaBefore.byteOffset).getUint16(10)).toBe(920)
    expect(new DataView(hheaAfter.buffer, hheaAfter.byteOffset).getUint16(10)).toBe(1000)
    expect(hheaAfter.subarray(12)).toEqual(hheaBefore.subarray(12))
    const head = after.tables.find((table) => table.tag === 'head')!
    const view = new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength)
    expect(view.getInt32(4) / 65536).toBeCloseTo(1.003, 3)
    expect(view.getUint16(44)).toBe(0)

    const parsed = opentype.parse(packaged)
    expect(parsed.tables.hhea.advanceWidthMax).toBe(1000)
    expect(parsed.charToGlyphIndex('가')).toBe(2)
    expect(parsed.charToGlyphIndex('힣')).toBe(3)
    expect(parsed.charToGlyphIndex('ㄱ')).toBe(4)
    expect(parsed.names.windows.fontFamily).toMatchObject({ en: 'Kkubulche', ko: '꾸불체' })
    expect(parsed.names.windows.postScriptName.en).toBe('Kkubulche-Regular')

    const report = validateOpenTypeForIOS(packaged)
    expect(report.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(report.cmap).toMatchObject({ unicodePlatform: true, windowsPlatform: true, mappingsAgree: true, space: true })
  })

  it('Bold 스타일이면 head.macStyle bold 비트를 켠다', () => {
    const identity = createFontIdentity('꾸불체', 'Bold')
    const packaged = finalizeOpenTypePackaging(rawFont(), {
      naming: { ...NAMING, subfamilyName: identity.styleName, fullName: identity.fullName, postScriptName: identity.postScriptName },
      macStyle: { bold: true, italic: false },
    })
    const head = readSfnt(packaged).tables.find((table) => table.tag === 'head')!
    expect(new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength).getUint16(44)).toBe(1)
  })
})
