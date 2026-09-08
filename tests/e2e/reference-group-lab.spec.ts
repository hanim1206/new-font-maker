import { devices, expect, test, type Page } from '@playwright/test'

const LAB_URL = '/reference-group-lab'
const FONT_IDS = ['noto-sans-kr', 'ibm-plex-sans-kr'] as const
const DISPLAY = {
  unitsPerEm: 1000, baselineY: 880, viewBox: [-120, -120, 1240, 1240], xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)', inkAutofit: false, individualCentering: false, advanceNormalization: false,
} as const

const fonts = FONT_IDS.map((id, index) => ({
  id, family: index === 0 ? 'Noto Sans KR' : 'IBM Plex Sans KR', fileName: `${id}.ttf`, fileSha256: `${index + 1}`.padStart(64, '0'),
  source: `https://example.invalid/fonts/${id}`, license: 'SIL Open Font License 1.1', weight: 400, axes: {},
}))

function outlineResponse(text: string) {
  return {
    schema: 'reference-outline-response-v1', apiVersion: 'reference.v1', text, display: DISPLAY,
    samples: FONT_IDS.map((fontId, fontIndex) => ({
      fontId,
      glyphs: Array.from(text).map((character, glyphIndex) => ({
        character, codepoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`, missing: false,
        glyphName: `fixture-${fontIndex}-${glyphIndex}`, path: 'M60 0H760V840H60Z', pathSha256: `${fontIndex + 1}${glyphIndex + 1}`.padStart(64, '0'),
        unitsPerEm: 1000, advance: 1, bounds: [0.06, 0, 0.76, 0.84],
      })),
    })),
  }
}

async function installApiFixture(page: Page, requests: string[]) {
  await page.route('**/api/reference/v1/fonts', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', json: { schema: 'reference-font-catalog-response-v1', apiVersion: 'reference.v1', display: DISPLAY, fonts } })
  })
  await page.route('**/api/reference/v1/outlines', async (route) => {
    const body = route.request().postDataJSON() as { text: string }
    requests.push(body.text)
    await route.fulfill({ status: 200, contentType: 'application/json', json: outlineResponse(body.text) })
  })
}

test.describe('Reference Group Lab', () => {
  test.use({
    userAgent: devices['Desktop Chrome'].userAgent, viewport: { width: 1280, height: 900 }, screen: { width: 1280, height: 900 },
    deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor, isMobile: devices['Desktop Chrome'].isMobile, hasTouch: devices['Desktop Chrome'].hasTouch,
  })

  test('선택 닿자의 무받침·받침 위치 변형을 비교하고 없는 위치를 남긴다', async ({ page }) => {
    const requests: string[] = []
    await installApiFixture(page, requests)
    await page.goto(LAB_URL)

    await expect(page.getByTestId('reference-group-lab')).toBeVisible()
    await expect(page.getByRole('link', { name: '기준선 조율 랩 열기' })).toHaveAttribute('href', '/font-guide-lab?font=noto-sans-kr')
    await expect.poll(() => requests.length).toBe(6)
    await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(20)
    await expect(page.locator('article[data-active]')).toHaveCount(7)
    await expect(page.locator('[data-font-id="noto-sans-kr"]')).toHaveCount(6)
    await expect(page.locator('[data-glyph="가"]')).toHaveCount(1)
    await expect(page.locator('[data-glyph="고"]')).toHaveCount(1)
    await expect(page.locator('[data-glyph="막"]')).toHaveCount(1)
    await expect(page.locator('[data-glyph="뫅"]')).toHaveCount(1)
    await expect(page.getByText('기본형')).toHaveCount(0)
    await expect(page.getByText('분류 근거')).toHaveCount(0)
    await expect(page.getByText('이용제가 닿자의 면적·시각 공간·홀자와의 상대 위치로 단순화한 비교용 그룹이다. 홀자의 세부 형태와 닿자 끝맺음은 이 표만으로 설명되지 않으며, 실제 조합에서 별도 검증이 필요하다.')).toHaveCount(6)
    await expect(page.getByText('분류 메모', { exact: true })).toHaveCount(6)
    const horizontalInitial = page.getByRole('region', { name: '가로모임꼴 · 첫닿자', exact: true })
    const tableBox = await horizontalInitial.getByLabel('가로모임꼴 · 첫닿자 전체 닿자 그룹표').boundingBox()
    const railBox = await horizontalInitial.getByLabel('가로모임꼴 · 첫닿자 그룹 예시').boundingBox()
    expect(tableBox?.y).toBeLessThan(railBox?.y ?? 0)
    await page.getByRole('button', { name: 'IBM Plex Sans KR' }).click()
    await expect(page.getByRole('button', { name: 'IBM Plex Sans KR' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-font-id="ibm-plex-sans-kr"]')).toHaveCount(6)

    await page.getByRole('button', { name: 'ㄺ', exact: true }).click()
    await expect.poll(() => requests.length).toBe(9)
    await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(30)
    await expect(page.locator('article[data-active]')).toHaveCount(3)
    await expect(page.getByText('해당 위치 없음')).toHaveCount(4)

    await page.getByRole('button', { name: 'ㄱ', exact: true }).click()
    await expect.poll(() => requests.length).toBe(9)
    await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(20)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.getByRole('region', { name: '가로모임꼴 받친글자 · 첫닿자', exact: true })
      .getByRole('button', { name: '그룹 2: ㄴ, ㄷ, ㅁ, ㅅ, ㅇ. ㄴ 선택' }).click()
    await expect(page.getByRole('button', { name: 'ㄴ', exact: true })).toHaveClass(/activeChip/)
    await expect.poll(() => requests.length).toBe(15)

    await page.getByRole('button', { name: 'ㅈ', exact: true }).click()
    await expect.poll(() => requests.length).toBe(21)
    await expect(page.getByText('단일 기준 아님')).toHaveCount(0)
  })
})
