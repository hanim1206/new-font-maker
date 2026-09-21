import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type Download } from '@playwright/test'
// opentype.js는 이 저장소에서 별도 타입 선언 없이 사용한다.
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import opentype from 'opentype.js'

// 붓촉 3종(납작·네모·절단)을 실제 OTF로 고정한다. 상자는 화면과 같은 칸 해석에서 온다.
// 기준을 새로 뜰 때만 `UPDATE_NONROUND_OTF_BASELINE=1`로 돌린다.
const FIXTURE = fileURLToPath(new URL('../fixtures/nonround-otf-glyphs-v1.json', import.meta.url))
const UPDATE = process.env.UPDATE_NONROUND_OTF_BASELINE === '1'

const STYLES = {
  ellipse: {
    slant: 0,
    weight: 400,
    letterSpacing: 0,
    linecap: 'round',
    linejoin: 'round',
    brush: { tip: 'ellipse', aspectRatio: 0.5, angle: 0 },
    strokeStyle: { mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.5, angle: 0 } },
  },
  rectangle: {
    slant: 0,
    weight: 400,
    letterSpacing: 0,
    linecap: 'round',
    linejoin: 'round',
    brush: { tip: 'rectangle', aspectRatio: 0.5, angle: 0 },
    strokeStyle: { mode: 'brush', brush: { tip: 'rectangle', aspectRatio: 0.5, angle: 0 } },
  },
  angledArea: {
    slant: 0,
    weight: 400,
    letterSpacing: 0,
    linecap: 'round',
    linejoin: 'round',
    brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
    strokeStyle: { mode: 'angled-area', cutAngle: 35, cornerRadius: 0.2 },
  },
} as const

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
  glyphs: { length: number }
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

async function collectStyleBaseline(browser: Browser, style: typeof STYLES[keyof typeof STYLES]) {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.addInitScript((initialStyle) => {
      localStorage.clear()
      localStorage.setItem('font-maker-global-style', JSON.stringify({
        state: { style: initialStyle, exclusions: [] },
        version: 0,
      }))
    }, style)
    await page.goto('/calibration')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '현재 작업을 OTF로 추출' }).click()
    await page.getByTestId('font-export-confirm').click()
    const download = await downloadPromise
    const bytes = await downloadBytes(download)
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const font = opentype.parse(arrayBuffer) as OpenTypeFont
    const glyph = font.charToGlyph('곽')
    const bbox = glyph.getBoundingBox()
    const commands = glyph.path.commands.map(canonicalCommand)
    return {
      font: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender,
        glyphCount: font.glyphs.length,
      },
      glyph: {
        unicode: glyph.unicode,
        advanceWidth: glyph.advanceWidth,
        bbox: {
          x1: canonicalNumber(bbox.x1),
          y1: canonicalNumber(bbox.y1),
          x2: canonicalNumber(bbox.x2),
          y2: canonicalNumber(bbox.y2),
        },
        commandCount: commands.length,
        commandsSha256: createHash('sha256').update(JSON.stringify(commands)).digest('hex'),
      },
    }
  } finally {
    await context.close()
  }
}

test('납작형·네모형·절단형 실제 OTF의 곽 윤곽을 exact 기준으로 유지한다', async ({ browser }) => {
  test.setTimeout(900_000)
  const actual: Record<string, Awaited<ReturnType<typeof collectStyleBaseline>>> = {}
  // 모델 상자 추출은 글자마다 획을 칸에 맞추느라 한 번에 20초쯤 쓴다. 셋을 동시에 돌리면 CPU를 서로 뺏어 더 느리다.
  for (const [name, style] of Object.entries(STYLES)) actual[name] = await collectStyleBaseline(browser, style)
  if (UPDATE || !existsSync(FIXTURE)) writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`)
  expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')))
})
