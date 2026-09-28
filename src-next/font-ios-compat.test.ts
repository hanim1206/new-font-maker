import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { isValidPostScriptName } from '../src/services/fontIdentity'
import { readCmapRecords, readSfnt } from '../src/services/openTypePackaging'
import { validateOpenTypeForIOS } from '../src/services/openTypeValidation'
import type { OpenTypeValidationReport } from '../src/services/openTypeValidation'
import type { FontGeneratorResult, LatinGlyphSource } from '../src/services/fontGenerator'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * iOS · 카카오톡 호환 회귀. 실제 추출 파이프라인(`generateFontBuffer`)으로 만든 전체 폰트를 다시 열어 본다.
 * 기준선(수정 전 opentype.js 원본 출력): 글리프 11,225 · 한글 음절 11,172 · 호환 자모 51 · ASCII는 공백 하나.
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const BASELINE = { glyphCount: 11225, hangulSyllables: 11172, compatibilityJamo: 51 } as const
const SAMPLE = ['가', '나', '다', '한', '꾸', '불', '체'] as const

interface OpenTypeFont {
  glyphs: { length: number }
  charToGlyphIndex(char: string): number
  charToGlyph(char: string): { name: string; unicode: number; advanceWidth: number; path: { commands: unknown[] } }
  names: Record<'unicode' | 'macintosh' | 'windows', Record<string, Record<string, string>>>
  tables: { hhea: { advanceWidthMax: number }; os2: { fsSelection: number; usWeightClass: number }; head: { macStyle: number; fontRevision: number } }
}

function squareContour(size: number) {
  return [
    { x: 50, y: 0, onCurve: true }, { x: 50 + size, y: 0, onCurve: true },
    { x: 50 + size, y: size, onCurve: true }, { x: 50, y: size, onCurve: true },
  ]
}

/** compatibility 모드 시험용: `!` `0` `A` 세 글자만 준다. 나머지는 null — 자리 채우기를 지어내지 않는지 본다. */
const THREE_LATIN: LatinGlyphSource = {
  glyphFor: (codePoint) => [0x21, 0x30, 0x41].includes(codePoint) ? { advanceWidth: 600, contours: [squareContour(500)] } : null,
}

describe('iOS · 카카오톡 호환 OTF', () => {
  let hangulOnly: FontGeneratorResult
  let compatibility: FontGeneratorResult
  let parsed: OpenTypeFont
  let report: OpenTypeValidationReport

  beforeAll(async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })
    const [generator, exportStore, deltaStore] = await Promise.all([
      import('../src/services/fontGenerator'), import('./fontExportStore'), import('./layoutDeltaStore'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    hangulOnly = await generator.generateFontBuffer({ familyName: '꾸불체', placementOf, revision: 3 })
    compatibility = await generator.generateFontBuffer({ familyName: '꾸불체', placementOf, revision: 3, coverage: { mode: 'compatibility', latinSource: THREE_LATIN } })
    if (!hangulOnly.success || !hangulOnly.bytes) throw new Error(hangulOnly.error)
    parsed = opentype.parse(hangulOnly.bytes) as OpenTypeFont
    report = validateOpenTypeForIOS(hangulOnly.bytes)
  }, 600_000)
  afterAll(() => vi.unstubAllGlobals())

  it('가 · 나 · 다 · 한 · 꾸 · 불 · 체가 제 글리프로 풀린다(이름 · 유니코드 · 윤곽 있음)', () => {
    for (const char of SAMPLE) {
      const code = char.charCodeAt(0)
      const glyph = parsed.charToGlyph(char)
      expect(glyph.name, char).toBe(`uni${code.toString(16).toUpperCase()}`)
      expect(glyph.unicode, char).toBe(code)
      expect(glyph.path.commands.length, char).toBeGreaterThan(3)
      expect(glyph.advanceWidth, char).toBeGreaterThan(0)
      expect(parsed.charToGlyphIndex(char), char).toBeGreaterThan(1)
    }
  })

  it('Unicode 플랫폼 cmap(0,3)과 Windows cmap(3,1)이 같은 서브테이블이라 같은 글리프 ID를 낸다', () => {
    const cmap = readSfnt(hangulOnly.bytes!).tables.find((table) => table.tag === 'cmap')!.data
    const records = readCmapRecords(cmap)
    expect(records.map((record) => [record.platformId, record.encodingId])).toEqual([[0, 3], [3, 1]])
    expect(records[0].offset).toBe(records[1].offset)
    expect(report.cmap.unicodePlatform).toBe(true)
    expect(report.cmap.windowsPlatform).toBe(true)
    expect(report.cmap.mappingsAgree).toBe(true)
  })

  it('name ID 1 · 2 · 4 · 6은 ASCII로 서로 맞고, 한국어 이름은 (3,1,0x412)에만 있다', () => {
    expect(hangulOnly.identity).toEqual({
      asciiFamilyName: 'Kkubulche', styleName: 'Regular', fullName: 'Kkubulche Regular', postScriptName: 'Kkubulche-Regular',
      localizedFamilyName: '꾸불체', localizedFullName: '꾸불체 Regular',
    })
    expect(report.names.windows).toMatchObject({ family: 'Kkubulche', subfamily: 'Regular', fullName: 'Kkubulche Regular', postScriptName: 'Kkubulche-Regular', version: 'Version 1.003' })
    expect(report.names.macintosh.postScriptName).toBe('Kkubulche-Regular')
    expect(report.names.localized).toEqual({ '0x0412': { family: '꾸불체', fullName: '꾸불체 Regular' } })
    expect(isValidPostScriptName(report.names.windows.postScriptName!)).toBe(true)
    expect(report.names.windows.postScriptName).toMatch(/^[A-Za-z0-9-]+$/)
    expect(report.cff).toMatchObject({ fontName: 'Kkubulche-Regular', fullName: 'Kkubulche Regular', familyName: 'Kkubulche', weight: 'Regular', charStringCount: BASELINE.glyphCount })
    expect(report.tables).not.toContain('ltag')
    expect(parsed.names.windows.fontFamily).toEqual({ en: 'Kkubulche', ko: '꾸불체' })
    expect(parsed.names.unicode).toBeUndefined()
  })

  it('폰트 파서로 다시 열리고 글리프 수 · 한글 11,172자 · 자모 51자가 기준선과 같다', () => {
    expect(parsed.glyphs.length).toBe(BASELINE.glyphCount)
    expect(hangulOnly.glyphCount).toBe(BASELINE.glyphCount)
    expect(hangulOnly.skippedChars).toEqual([])
    expect(report.cmap.hangulSyllables).toBe(BASELINE.hangulSyllables)
    expect(report.cmap.compatibilityJamo).toBe(BASELINE.compatibilityJamo)
    expect(report.cmap.space).toBe(true)
    expect(report.cmap.ascii).toBe(1)
    expect(parsed.charToGlyphIndex('가')).toBe(2 + BASELINE.compatibilityJamo)
    expect(parsed.charToGlyphIndex('힣')).toBe(BASELINE.glyphCount - 1)
  })

  it('iOS 검사에 오류 · 경고가 없고 메트릭 · 스타일 비트가 서로 맞는다', () => {
    expect(report.ok).toBe(true)
    expect(report.issues.filter((issue) => issue.severity !== 'info')).toEqual([])
    expect(report.issues.map((issue) => issue.code)).toEqual(['cmap.no-ascii'])
    expect(report.missingTables).toEqual([])
    expect(report.metrics).toMatchObject({
      unitsPerEm: 1000, hhea: { ascender: 1160, descender: -288, lineGap: 0 }, typo: { ascender: 880, descender: -120, lineGap: 0 },
      fsSelection: 0x40, macStyle: 0, usWeightClass: 400, italicAngle: 0, advanceWidthMax: 1000,
    })
    expect(report.metrics.win!.ascent).toBeGreaterThanOrEqual(1160)
    expect(report.metrics.win!.descent).toBeGreaterThanOrEqual(288)
    expect(parsed.tables.head.fontRevision).toBeCloseTo(1.003, 3)
    expect(hangulOnly.validation).toEqual(report)
    expect(hangulOnly.fileName).toBe('꾸불체.otf')
  })

  it('compatibility 모드: 출처가 준 ASCII만 들어가고 한글 범위는 그대로다', () => {
    if (!compatibility.success || !compatibility.bytes) throw new Error(compatibility.error)
    const compatParsed = opentype.parse(compatibility.bytes) as OpenTypeFont
    const compatReport = validateOpenTypeForIOS(compatibility.bytes)
    expect(compatibility.latinCoverage).toEqual({ requested: 94, provided: 3, missing: expect.any(Array) })
    expect(compatibility.latinCoverage!.missing).toHaveLength(94 - 3)
    expect(compatibility.latinCoverage!.missing).not.toContain(0x41)
    expect(compatParsed.glyphs.length).toBe(BASELINE.glyphCount + 3)
    expect(['!', '0', 'A'].map((char) => compatParsed.charToGlyphIndex(char))).toEqual([2, 3, 4])
    expect(compatParsed.charToGlyph('A').name).toBe('uni0041')
    expect(compatParsed.charToGlyphIndex('B')).toBe(0)
    expect(compatParsed.charToGlyphIndex('ㄱ')).toBe(5)
    expect(compatParsed.charToGlyphIndex('가')).toBe(5 + BASELINE.compatibilityJamo)
    expect(compatReport.ok).toBe(true)
    expect(compatReport.cmap).toMatchObject({ mappingsAgree: true, hangulSyllables: BASELINE.hangulSyllables, compatibilityJamo: BASELINE.compatibilityJamo, ascii: 4 })
    expect(compatReport.names.windows.postScriptName).toBe('Kkubulche-Regular')
  })
})
