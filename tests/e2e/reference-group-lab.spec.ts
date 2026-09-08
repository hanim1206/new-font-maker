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

  test('선택 닿자의 4개 위치 변형만 비교하고 없는 위치를 남긴다', async ({ page }) => {
    const requests: string[] = []
    await installApiFixture(page, requests)
    await page.goto(LAB_URL)

    await expect(page.getByTestId('reference-group-lab')).toBeVisible()
    await expect.poll(() => requests.length).toBe(4)
    await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(17)
    await expect(page.locator('article[data-active]')).toHaveCount(5)
    await expect(page.locator('[data-font-id="noto-sans-kr"]')).toHaveCount(4)
    await expect(page.locator('[data-glyph="막"]')).toHaveCount(1)
    await expect(page.locator('[data-glyph="뫅"]')).toHaveCount(1)
    await expect(page.getByText('홀자 쪽 세로획이 바로 서고, 아래·왼쪽 열린 공간이 받침 쪽으로 이어지는 비대칭 L자.')).toBeVisible()
    await expect(page.getByText('홀자와 마주 보는 아래 면이 열린 형태.')).toBeVisible()
    await expect(page.getByText('홀자와 마주 보는 윗면이 홀자 아래 공간을 비교적 막거나 경계 짓는 형태.')).toHaveCount(2)

    await page.getByRole('button', { name: 'IBM Plex Sans KR' }).click()
    await expect(page.getByRole('button', { name: 'IBM Plex Sans KR' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-font-id="ibm-plex-sans-kr"]')).toHaveCount(4)

    await page.getByRole('button', { name: 'ㄺ', exact: true }).click()
    await expect.poll(() => requests.length).toBe(7)
    await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(30)
    await expect(page.locator('article[data-active]')).toHaveCount(3)
    await expect(page.getByText('해당 위치 없음')).toHaveCount(2)

    await page.getByRole('button', { name: 'ㄱ', exact: true }).click()
    await expect.poll(() => requests.length).toBe(7)
    await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(17)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.getByRole('button', { name: '그룹 2: ㄴ, ㄷ, ㅁ, ㅅ, ㅇ. ㄴ 선택' }).click()
    await expect(page.getByRole('button', { name: 'ㄴ', exact: true })).toHaveClass(/activeChip/)
    await expect.poll(() => requests.length).toBe(11)
    await expect(page.getByText('아래 가로획이 홀자 위를 수평으로 닫는 형태. 위아래 사이 빈 공간과 무게가 그룹 1과 다르다.')).toBeVisible()
    await expect(page.getByText('홀자와 마주 보는 윗면이 크게 열린 형태. 홀자 아래 빈 공간이 안쪽까지 이어진다.')).toHaveCount(2)
  })
})
