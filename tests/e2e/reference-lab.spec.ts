import { devices, expect, test, type Page } from '@playwright/test'

const LAB_URL = '/reference-lab'
const FONT_IDS = [
  'noto-sans-kr',
  'ibm-plex-sans-kr',
  'nanum-gothic',
  'dotum',
  'gowun-dodum',
  'black-han-sans',
] as const
const FAMILIES = [
  'Noto Sans KR',
  'IBM Plex Sans KR',
  'Nanum Gothic',
  'Dotum',
  'Gowun Dodum',
  'Black Han Sans',
] as const
const DISPLAY = {
  unitsPerEm: 1000,
  baselineY: 880,
  viewBox: [-120, -120, 1240, 1240],
  xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)',
  inkAutofit: false,
  individualCentering: false,
  advanceNormalization: false,
} as const

const fonts = FONT_IDS.map((id, index) => ({
  id,
  family: FAMILIES[index],
  fileName: `${id}.ttf`,
  fileSha256: `${index + 1}`.padStart(64, '0'),
  source: `https://example.invalid/fonts/${id}`,
  license: 'SIL Open Font License 1.1',
  weight: 400,
  axes: {},
}))

declare global {
  interface Window {
    __referenceLabStorageProbe?: {
      before: string
      calls: Array<{ op: string; key?: string }>
    }
  }
}

function normalizedCharacters(text: string): string[] {
  return Array.from(text.normalize('NFC'))
}

function outlineResponse(text: string) {
  const characters = normalizedCharacters(text)
  return {
    schema: 'reference-outline-response-v1',
    apiVersion: 'reference.v1',
    text: characters.join(''),
    display: DISPLAY,
    samples: FONT_IDS.map((fontId, fontIndex) => {
      const unitsPerEm = fontIndex === 1 ? 2048 : 1000
      return {
        fontId,
        glyphs: characters.map((character, glyphIndex) => {
          const left = Math.round(unitsPerEm * (0.06 + fontIndex * 0.005))
          const right = Math.round(unitsPerEm * (0.78 + glyphIndex * 0.025))
          const bottom = Math.round(unitsPerEm * -0.04)
          const top = Math.round(unitsPerEm * (0.84 + fontIndex * 0.005))
          const path = `M${left} ${bottom}H${right}V${top}H${left}Z`
          return {
            character,
            codepoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
            missing: false,
            glyphName: `fixture-${fontIndex}-${glyphIndex}`,
            path,
            pathSha256: `${fontIndex + 1}${glyphIndex + 1}`.padStart(64, '0'),
            unitsPerEm,
            advance: 0.9 + fontIndex * 0.01 + glyphIndex * 0.001,
            bounds: [left / unitsPerEm, bottom / unitsPerEm, right / unitsPerEm, top / unitsPerEm],
          }
        }),
      }
    }),
  }
}

async function installStorageProbe(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('reference-lab-sentinel', 'unchanged')
    const snapshot = () => JSON.stringify(Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
        .sort().map((key) => [key, localStorage.getItem(key)]),
    ))
    const before = snapshot()
    const calls: Array<{ op: string; key?: string }> = []
    const setItem = Storage.prototype.setItem
    const removeItem = Storage.prototype.removeItem
    const clear = Storage.prototype.clear
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage) calls.push({ op: 'setItem', key })
      return setItem.call(this, key, value)
    }
    Storage.prototype.removeItem = function (key: string) {
      if (this === window.localStorage) calls.push({ op: 'removeItem', key })
      return removeItem.call(this, key)
    }
    Storage.prototype.clear = function () {
      if (this === window.localStorage) calls.push({ op: 'clear' })
      return clear.call(this)
    }
    window.__referenceLabStorageProbe = { before, calls }
  })
}

async function storageSnapshot(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify(Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
      .sort().map((key) => [key, localStorage.getItem(key)]),
  )))
}

async function expectNoStorageWrites(page: Page) {
  expect(await page.evaluate(() => window.__referenceLabStorageProbe?.calls ?? null)).toEqual([])
  expect(await storageSnapshot(page)).toBe(await page.evaluate(() => window.__referenceLabStorageProbe?.before))
}

async function installApiFixture(page: Page, outlineRequests: Array<{ text: string; fontIds?: string[] }>) {
  await page.route('**/api/reference/v1/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        schema: 'reference-lab-health-v1',
        apiVersion: 'reference.v1',
        status: 'ok',
        fontCount: 6,
        runtime: { diskWrites: false, fontCacheEntries: 0, glyphCacheEntries: 0 },
      },
    })
  })
  await page.route('**/api/reference/v1/fonts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        schema: 'reference-font-catalog-response-v1',
        apiVersion: 'reference.v1',
        display: DISPLAY,
        fonts,
      },
    })
  })
  await page.route('**/api/reference/v1/outlines', async (route) => {
    const body = route.request().postDataJSON() as { text: string; fontIds?: string[] }
    outlineRequests.push(body)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: outlineResponse(body.text),
    })
  })
}

async function expectComparisonGrid(page: Page, characters: readonly string[]) {
  const rows = page.getByTestId('font-row')
  await expect(rows).toHaveCount(FONT_IDS.length)
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-font-id')))).toEqual(FONT_IDS)

  const cells = page.getByTestId('glyph-cell')
  await expect(cells).toHaveCount(FONT_IDS.length * characters.length)
  const expectedPairs = FONT_IDS.flatMap((fontId) => characters.map((glyph) => `${fontId}:${glyph}`)).sort()
  expect(await cells.evaluateAll((nodes) => nodes.map((node) => (
    `${node.getAttribute('data-font-id')}:${node.getAttribute('data-glyph')}`
  )).sort())).toEqual(expectedPairs)

  const svgs = page.getByTestId('glyph-svg')
  await expect(svgs).toHaveCount(FONT_IDS.length * characters.length)
  expect(await svgs.evaluateAll((nodes) => nodes.every((node) => (
    node.getAttribute('viewBox') === '-120 -120 1240 1240'
      && node.getAttribute('data-coordinate-frame') === 'shared-baseline'
      && node.getAttribute('data-ink-autofit') === 'false'
      && node.getAttribute('data-individual-centering') === 'false'
      && node.getAttribute('data-advance-normalization') === 'false'
  )))).toBe(true)

  const baselines = svgs.locator('[data-guide="baseline"]')
  await expect(baselines).toHaveCount(FONT_IDS.length * characters.length)
  expect(await baselines.evaluateAll((nodes) => nodes.every((node) => (
    node.getAttribute('y1') === '880' && node.getAttribute('y2') === '880'
  )))).toBe(true)
  const expectedGlyphCount = FONT_IDS.length * characters.length
  expect(await svgs.locator('path').evaluateAll((paths, expectedCount) => (
    paths.length === expectedCount
      && paths.every((path) => (path.getAttribute('d') ?? '').trim().length > 0)
  ), expectedGlyphCount)).toBe(true)

  const projected = svgs.locator('[data-font-projection="upm-to-shared-baseline"]')
  await expect(projected).toHaveCount(FONT_IDS.length * characters.length)
  expect(await projected.evaluateAll((nodes) => nodes.every((node) => {
    const svg = node.closest('svg')
    const unitsPerEm = Number(svg?.getAttribute('data-units-per-em'))
    const scale = 1000 / unitsPerEm
    const matrix = (node as SVGGraphicsElement).transform.baseVal.consolidate()?.matrix
    if (!matrix) return false
    const close = (left: number, right: number) => Math.abs(left - right) < 1e-6
    return close(matrix.a, scale)
      && close(matrix.b, 0)
      && close(matrix.c, 0)
      && close(matrix.d, -scale)
      && close(matrix.e, 0)
      && close(matrix.f, 880)
  }))).toBe(true)

  expect(await cells.evaluateAll((nodes) => nodes.every((node) => {
    const advance = Number(node.getAttribute('data-advance'))
    return Number.isFinite(advance) && advance > 0
  }))).toBe(true)
}

test.describe('Reference Lab R0 desktop', () => {
  test.use({
    userAgent: devices['Desktop Chrome'].userAgent,
    viewport: { width: 1280, height: 900 },
    screen: { width: 1280, height: 900 },
    deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor,
    isMobile: devices['Desktop Chrome'].isMobile,
    hasTouch: devices['Desktop Chrome'].hasTouch,
  })

  test('입력한 글자를 6종 원본 좌표 윤곽으로 비교하고 저장하지 않는다', async ({ page }) => {
    const requests: string[] = []
    const outlineRequests: Array<{ text: string; fontIds?: string[] }> = []
    page.on('request', (request) => requests.push(request.url()))
    await installStorageProbe(page)
    await installApiFixture(page, outlineRequests)

    const response = await page.goto(LAB_URL)
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('reference-lab')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /폰트 레퍼런스 랩/ })).toBeVisible()
    const input = page.getByTestId('reference-input')
    const initialText = await input.inputValue()
    expect(normalizedCharacters(initialText).length).toBeGreaterThan(0)

    await input.fill('가각')
    await page.getByTestId('compare-button').click()
    await expect(input).toHaveValue('가각')
    await expect.poll(() => outlineRequests.at(-1)?.text).toBe('가각')
    await expectComparisonGrid(page, ['가', '각'])

    await expect(page.getByRole('button', {
      name: /측정|후보|프리셋.*반영|제품.*반영|저장/,
    })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expectNoStorageWrites(page)

    const origin = new URL(response!.url()).origin
    expect(requests.every((url) => new URL(url).origin === origin)).toBe(true)
    expect(requests.some((url) => new URL(url).pathname === '/api/reference/v1/fonts')).toBe(true)
    expect(requests.some((url) => new URL(url).pathname === '/api/reference/v1/outlines')).toBe(true)

    await page.reload()
    await expect(page.getByTestId('reference-lab')).toBeVisible()
    await expect(input).toHaveValue(initialText)
    await expectNoStorageWrites(page)
  })
})

test.describe('Reference Lab R0 mobile', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
    isMobile: devices['iPhone 13'].isMobile,
    hasTouch: devices['iPhone 13'].hasTouch,
  })

  test('390px에서 비교판을 페이지 가로 넘침 없이 확인한다', async ({ page }) => {
    const outlineRequests: Array<{ text: string; fontIds?: string[] }> = []
    await installStorageProbe(page)
    await installApiFixture(page, outlineRequests)
    await page.goto(LAB_URL)

    await page.getByTestId('reference-input').fill('가각')
    await page.getByTestId('reference-input').press('Enter')
    await expect.poll(() => outlineRequests.at(-1)?.text).toBe('가각')
    await expectComparisonGrid(page, ['가', '각'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expectNoStorageWrites(page)
  })
})
