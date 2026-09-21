import { expect, test, type Download } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../../src/data/legacyCalibrationLayoutProfileV1'
// opentype.js는 이 저장소에서 별도 타입 선언 없이 사용한다.
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import opentype from 'opentype.js'

const baseline = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/legacy-otf-glyphs-v1.json', import.meta.url)), 'utf8'))

const REPRESENTATIVE_GLYPHS = ['ㄱ', '가', '고', '과', '각', '곡', '곽', 'ㅇ', 'ㅁ', 'ㅂ', 'ㅎ', 'ㅙ'] as const

interface OpenTypeCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

interface OpenTypeGlyph {
  unicode?: number
  advanceWidth: number
  path: { commands: OpenTypeCommand[] }
  getBoundingBox: () => { x1: number; y1: number; x2: number; y2: number }
}

interface OpenTypeFont {
  unitsPerEm: number
  ascender: number
  descender: number
  glyphs: { length: number; get: (index: number) => OpenTypeGlyph }
  charToGlyph: (char: string) => OpenTypeGlyph
}

function canonicalNumber(value: number): number {
  const rounded = Number(value.toFixed(6))
  return Object.is(rounded, -0) ? 0 : rounded
}

function canonicalCommand(command: OpenTypeCommand): Record<string, string | number> {
  const result: Record<string, string | number> = { type: command.type }
  for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2'] as const) {
    const value = command[key]
    if (typeof value === 'number') result[key] = canonicalNumber(value)
  }
  return result
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function collectBaseline(font: OpenTypeFont) {
  const glyphs = Object.fromEntries(REPRESENTATIVE_GLYPHS.map((char) => {
    const glyph = font.charToGlyph(char)
    const bbox = glyph.getBoundingBox()
    return [char, {
      unicode: glyph.unicode,
      advanceWidth: glyph.advanceWidth,
      bbox: {
        x1: canonicalNumber(bbox.x1),
        y1: canonicalNumber(bbox.y1),
        x2: canonicalNumber(bbox.x2),
        y2: canonicalNumber(bbox.y2),
      },
      commands: glyph.path.commands.map(canonicalCommand),
    }]
  }))

  return {
    font: {
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
      glyphCount: font.glyphs.length,
      notdefAdvanceWidth: font.glyphs.get(0).advanceWidth,
      spaceAdvanceWidth: font.charToGlyph(' ').advanceWidth,
    },
    glyphs,
  }
}

test('기존 선 전용 OTF의 대표 글리프 윤곽과 메트릭을 유지한다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/calibration')

  const expectedLayoutTypes = Object.keys(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)
  const persistedOverrides = await page.evaluate((layoutTypes) => {
    const raw = localStorage.getItem('font-maker-layout-schemas')
    if (!raw) throw new Error('canonical layout 저장값이 없습니다.')
    const envelope = JSON.parse(raw) as {
      state?: { layoutSchemas?: Record<string, { userPartOverrides?: unknown }> }
    }
    const schemas = envelope.state?.layoutSchemas
    if (!schemas) throw new Error('canonical layoutSchemas가 없습니다.')
    return Object.fromEntries(layoutTypes.map((layoutType) => [
      layoutType,
      schemas[layoutType]?.userPartOverrides,
    ]))
  }, expectedLayoutTypes)
  expect(persistedOverrides).toEqual(LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '현재 작업을 OTF로 추출' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.otf$/i)

  const bytes = await downloadBytes(download)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const font = opentype.parse(arrayBuffer) as OpenTypeFont
  const actual = collectBaseline(font)

  expect(actual).toEqual(baseline)
  await expect(page.getByRole('button', { name: 'OTF 추출 완료' })).toBeVisible()
})
