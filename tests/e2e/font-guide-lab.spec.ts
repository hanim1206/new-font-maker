import { devices, expect, test, type Page } from '@playwright/test'

const LAB_URL = '/font-guide-lab?font=ibm-plex-sans-kr'
const DISPLAY = {
  unitsPerEm: 1000, baselineY: 880, viewBox: [-120, -120, 1240, 1240], xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)', inkAutofit: false, individualCentering: false, advanceNormalization: false,
} as const
const fonts = [
  { id: 'noto-sans-kr', family: 'Noto Sans KR', fileName: 'noto.ttf', fileSha256: '1'.padStart(64, '0'), source: 'https://example.invalid/noto', license: 'OFL', weight: 400, axes: {} },
  { id: 'ibm-plex-sans-kr', family: 'IBM Plex Sans KR', fileName: 'ibm.ttf', fileSha256: '2'.padStart(64, '0'), source: 'https://example.invalid/ibm', license: 'OFL', weight: 400, axes: {} },
] as const

function outlineResponse(text: string, fontIds: readonly string[]) {
  return {
    schema: 'reference-outline-response-v1', apiVersion: 'reference.v1', text, display: DISPLAY,
    samples: fontIds.map((fontId) => ({
      fontId,
      glyphs: Array.from(text).map((character, index) => ({
        character, codepoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`, missing: false,
        glyphName: `${fontId}-${index}`, path: 'M60 0H760V840H60Z', pathSha256: `${index + 1}`.padStart(64, '0'),
        unitsPerEm: 1000, advance: 1, bounds: [0.06, 0, 0.76, 0.84],
      })),
    })),
  }
}

async function installApiFixture(page: Page, requests: Array<{ text: string; fontIds: string[] }>) {
  await page.route('**/api/reference/v1/fonts', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', json: { schema: 'reference-font-catalog-response-v1', apiVersion: 'reference.v1', display: DISPLAY, fonts } })
  })
  await page.route('**/api/reference/v1/outlines', async (route) => {
    const body = route.request().postDataJSON() as { text: string; fontIds: string[] }
    requests.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', json: outlineResponse(body.text, body.fontIds) })
  })
}

test.describe('Font Guide Lab', () => {
  test.use({
    userAgent: devices['Desktop Chrome'].userAgent, viewport: { width: 1280, height: 900 }, screen: { width: 1280, height: 900 },
    deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor, isMobile: devices['Desktop Chrome'].isMobile, hasTouch: devices['Desktop Chrome'].hasTouch,
  })

  test('폰트별 기준선 세트를 조율하고 저장한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(LAB_URL)

    await expect(page.getByTestId('font-guide-lab')).toBeVisible()
    await expect(page.getByRole('button', { name: 'IBM Plex Sans KR' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => requests).toEqual([{ text: '가각고곡과광', fontIds: ['ibm-plex-sans-kr'] }])
    await expect(page.getByTestId('font-guide-pair')).toHaveCount(3)
    await expect(page.getByTestId('font-guide-pair').first()).toHaveAttribute('aria-label', '가로 첫닿자 ↔ 오른쪽 홀자 · 받침')
    await expect(page.getByTestId('font-guide-case')).toHaveCount(6)
    await expect(page.getByTestId('font-guide-glyph')).toHaveCount(6)
    await expect(page.locator('[data-guide-id="initialTop"]')).toHaveCount(6)
    await expect(page.locator('[data-guide-id="finalTop"]')).toHaveCount(3)
    await expect(page.locator('[data-guide-id="finalBottom"]')).toHaveCount(3)
    await expect(page.locator('[data-guide-id="pillarX"]')).toHaveCount(4)
    await expect(page.getByRole('spinbutton', { name: '받침윗선' })).toHaveCount(0)
    await page.getByRole('button', { name: '기준선값 추출' }).click()
    await expect(page.getByTestId('guide-export')).toContainText('"font"')
    await expect(page.getByTestId('guide-export')).toContainText('"initial-horizontal"')
    await page.getByRole('button', { name: '추출값 복사' }).click()
    await expect(page.getByText('추출값을 클립보드에 복사했습니다.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"initial-horizontal"')

    const initialTop = page.getByRole('spinbutton', { name: '첫닿윗선' })
    await initialTop.focus()
    await initialTop.fill('91')
    await expect(initialTop).toHaveValue('91')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('reference-font-guide-calibrations-v1'))).toContain('"overrides":{"ㄱ":{"initial-horizontal":{"initialTop":91')

    const initialBottom = page.getByRole('spinbutton', { name: '첫닿밑선' })
    await initialBottom.fill('800')
    await initialBottom.press('Enter')
    await expect(initialBottom).toHaveValue('800')
    await expect(page.getByTestId('guide-source')).toHaveText('개별 조율됨')
    await page.getByRole('button', { name: '현재 ㄱ 6문맥을 기준값으로 적용' }).click()
    await expect(page.getByTestId('guide-source')).toHaveText('기준값 사용 중')

    await page.getByRole('button', { name: '각 사례 기준선 선택' }).click()
    await expect(page.getByRole('spinbutton', { name: '첫닿윗선' })).toHaveValue('90')
    await expect(page.getByRole('spinbutton', { name: '받침윗선' })).toHaveValue('650')

    const draggableInitialTop = page.locator('[data-guide-id="initialTop"]').first()
    const lineBox = await draggableInitialTop.boundingBox()
    expect(lineBox).not.toBeNull()
    if (!lineBox) throw new Error('첫닿윗선 드래그 영역이 필요합니다.')
    await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + 28)
    await page.mouse.up()
    await expect(page.getByRole('spinbutton', { name: '첫닿윗선' })).not.toHaveValue('91')
    await expect(page.getByText('IBM Plex Sans KR · ㄱ · 가로 첫닿자 개별값을 저장했습니다.')).toBeVisible()

    await page.getByRole('button', { name: 'ㄴ' }).click()
    await expect.poll(() => requests.length).toBe(2)
    await expect.poll(() => requests[1]).toEqual({ text: '나낙노녹놔놩', fontIds: ['ibm-plex-sans-kr'] })
    await expect(page.getByTestId('font-guide-case').first()).toHaveAttribute('data-glyph', '나')
    await expect(page.getByRole('spinbutton', { name: '첫닿윗선' })).toHaveValue('91')
    await expect(page.getByTestId('guide-source')).toHaveText('기준값 사용 중')
    await page.getByRole('spinbutton', { name: '첫닿윗선' }).fill('120')
    await page.getByRole('spinbutton', { name: '첫닿윗선' }).press('Enter')
    await expect(page.getByTestId('guide-source')).toHaveText('개별 조율됨')

    await page.getByRole('button', { name: 'Noto Sans KR' }).click()
    await expect.poll(() => requests.length).toBe(3)
    await expect(page.getByRole('spinbutton', { name: '첫닿윗선' })).toHaveValue('90')
  })
})
