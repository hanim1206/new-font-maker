import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { finalizeOpenTypePackaging, readSfnt, writeSfnt } from './openTypePackaging'
import type { OpenTypeNaming } from './openTypePackaging'
import { summarizeValidation, validateOpenTypeForIOS } from './openTypeValidation'

function box(x: number, y: number, size: number) {
  const path = new opentype.Path()
  path.moveTo(x, y)
  path.lineTo(x + size, y)
  path.lineTo(x + size, y + size)
  path.lineTo(x, y + size)
  path.close()
  return path
}

function rawFont(options: { familyName?: string; koreanFamily?: string; weightClass?: number } = {}): ArrayBuffer {
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 1000, path: box(50, 0, 700) }),
    new opentype.Glyph({ name: 'space', unicode: 0x20, advanceWidth: 220, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'uniAC00', unicode: 0xac00, advanceWidth: 920, path: box(100, -100, 800) }),
    new opentype.Glyph({ name: 'A', unicode: 0x41, advanceWidth: 600, path: box(50, 0, 500) }),
  ]
  const font = new opentype.Font({
    familyName: options.familyName ?? 'FontMaker-A56BE5CB', styleName: 'Regular', unitsPerEm: 1000, ascender: 1160, descender: -288, glyphs,
    weightClass: options.weightClass,
    tables: { os2: { sTypoAscender: 880, sTypoDescender: -120, usWinAscent: 1160, usWinDescent: 288 } },
  })
  if (options.koreanFamily) {
    for (const platform of ['unicode', 'windows'] as const) {
      const names = font.names[platform] as Record<string, Record<string, string>>
      names.fontFamily.ko = options.koreanFamily
    }
  }
  // 실제 파이프라인(`applyEnglishFontNames`)처럼 CFF FontName의 출처를 맞춘다.
  for (const platform of ['unicode', 'macintosh', 'windows'] as const) {
    (font.names[platform] as Record<string, Record<string, string>>).postScriptName = { en: `${(font.names[platform] as Record<string, Record<string, string>>).fontFamily.en.replace(/\s/g, '')}-Regular` }
  }
  return font.toArrayBuffer() as ArrayBuffer
}

const NAMING: OpenTypeNaming = {
  familyName: 'Kkubulche', subfamilyName: 'Regular', uniqueId: '1.000;FTMK;Kkubulche-Regular',
  fullName: 'Kkubulche Regular', version: 'Version 1.000', postScriptName: 'Kkubulche-Regular',
  localized: [{ windowsLanguageId: 0x0412, familyName: '꾸불체', fullName: '꾸불체 Regular' }],
}

const codes = (buffer: ArrayBuffer, severity?: 'error' | 'warning' | 'info') =>
  validateOpenTypeForIOS(buffer).issues.filter((issue) => !severity || issue.severity === severity).map((issue) => issue.code)

describe('validateOpenTypeForIOS', () => {
  it('opentype.js 원본 출력의 문제를 짚는다: Unicode cmap 없음 · platform 0 languageID 규격 밖', () => {
    const report = validateOpenTypeForIOS(rawFont({ koreanFamily: '꾸불체' }))
    expect(report.cmap.unicodePlatform).toBe(false)
    expect(report.cmap.windowsPlatform).toBe(true)
    expect(report.cmap.mappingsAgree).toBeNull()
    expect(report.tables).toContain('ltag')
    expect(codes(rawFont({ koreanFamily: '꾸불체' }), 'warning')).toEqual(expect.arrayContaining(['cmap.unicode-missing', 'name.unicode-language']))
    expect(report.names.windows.family).toBe('FontMaker-A56BE5CB')
    expect(report.names.localized['0x0412']?.family).toBe('꾸불체')
  })

  it('다시 묶은 폰트는 오류가 없고 cmap 두 플랫폼이 같은 매핑이다', () => {
    const packaged = finalizeOpenTypePackaging(rawFont({ familyName: 'Kkubulche' }), { naming: NAMING, macStyle: { bold: false, italic: false } })
    const report = validateOpenTypeForIOS(packaged)
    expect(report.ok).toBe(true)
    expect(report.issues.filter((issue) => issue.severity !== 'info')).toEqual([])
    expect(report.cmap).toEqual({ unicodePlatform: true, windowsPlatform: true, mappingsAgree: true, hangulSyllables: 1, compatibilityJamo: 0, ascii: 2, space: true })
    expect(report.names.windows).toMatchObject({ family: 'Kkubulche', subfamily: 'Regular', fullName: 'Kkubulche Regular', postScriptName: 'Kkubulche-Regular' })
    expect(report.names.macintosh.postScriptName).toBe('Kkubulche-Regular')
    expect(report.names.localized).toEqual({ '0x0412': { family: '꾸불체', fullName: '꾸불체 Regular' } })
    expect(report.cff).toMatchObject({ fontName: 'Kkubulche-Regular', fullName: 'Kkubulche Regular', familyName: 'Kkubulche', weight: 'Regular', charStringCount: 4 })
    expect(report.metrics).toMatchObject({
      unitsPerEm: 1000, hhea: { ascender: 1160, descender: -288, lineGap: 0 }, typo: { ascender: 880, descender: -120, lineGap: 0 },
      win: { ascent: 1160, descent: 288 }, fsSelection: 0x40, macStyle: 0, italicAngle: 0,
    })
    expect(report.missingTables).toEqual([])
    expect(summarizeValidation(report)).toContain('오류 0')
  })

  it('name ID 6와 CFF FontName이 어긋나면 오류, ID 4가 ID 1 + 2와 다르면 경고', () => {
    const packaged = finalizeOpenTypePackaging(rawFont({ familyName: 'Kkubulche' }), {
      naming: { ...NAMING, postScriptName: 'Other-Regular', fullName: 'Something Else' },
    })
    expect(codes(packaged, 'error')).toContain('cff.fontname-mismatch')
    expect(codes(packaged, 'warning')).toEqual(expect.arrayContaining(['name.full-inconsistent', 'cff.fullname-mismatch']))
  })

  it('PostScript 이름에 공백이나 한글이 있으면 오류', () => {
    const packaged = finalizeOpenTypePackaging(rawFont({ familyName: 'Kkubulche' }), { naming: { ...NAMING, postScriptName: '꾸불체 Regular' } })
    expect(codes(packaged, 'error')).toContain('name.postscript-invalid')
  })

  it('스타일 비트가 이름과 어긋나면 경고: Regular인데 macStyle bold', () => {
    const packaged = finalizeOpenTypePackaging(rawFont({ familyName: 'Kkubulche' }), { naming: NAMING, macStyle: { bold: true, italic: false } })
    expect(codes(packaged, 'warning')).toContain('style.bold-mismatch')
    expect(validateOpenTypeForIOS(packaged).ok).toBe(true)
  })

  it('필수 표가 빠지면 오류로 알린다', () => {
    const file = readSfnt(finalizeOpenTypePackaging(rawFont({ familyName: 'Kkubulche' }), { naming: NAMING }))
    const withoutOs2 = writeSfnt({ ...file, tables: file.tables.filter((table) => table.tag !== 'OS/2') })
    const report = validateOpenTypeForIOS(withoutOs2)
    expect(report.ok).toBe(false)
    expect(report.missingTables).toEqual(['OS/2'])
    expect(codes(withoutOs2, 'error')).toContain('table.missing')
  })

  it('깨진 버퍼는 던지지 않고 오류를 돌려준다', () => {
    const report = validateOpenTypeForIOS(new ArrayBuffer(4))
    expect(report.ok).toBe(false)
    expect(report.issues[0].code).toBe('sfnt.unreadable')
  })
})
