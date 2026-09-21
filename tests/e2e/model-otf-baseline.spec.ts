import { expect, test, type Download } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// opentype.js는 이 저장소에서 별도 타입 선언 없이 사용한다.
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import opentype from 'opentype.js'

// 화면과 같은 상자(Noto 모델 상자 + 레이아웃 Δ)로 뽑은 OTF의 기준. 옛 스키마 기준(`legacy-otf-glyphs-v1.json`)은 동결해 옆에 둔다.
// 기준을 새로 뜰 때만 `UPDATE_MODEL_OTF_BASELINE=1`로 돌린다.
const FIXTURE = fileURLToPath(new URL('../fixtures/model-otf-glyphs-v1.json', import.meta.url))
const UPDATE = process.env.UPDATE_MODEL_OTF_BASELINE === '1'

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

test('모델 상자 OTF의 대표 글리프 윤곽과 메트릭을 유지한다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/calibration')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '현재 작업을 OTF로 추출' }).click()
  await page.getByTestId('font-export-confirm').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.otf$/i)

  const bytes = await downloadBytes(download)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const font = opentype.parse(arrayBuffer) as OpenTypeFont
  const actual = collectBaseline(font)

  if (UPDATE || !existsSync(FIXTURE)) writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`)
  expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')))
  await expect(page.getByRole('button', { name: 'OTF 추출 완료' })).toBeVisible()
})
