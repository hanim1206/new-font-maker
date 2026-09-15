import { expect, test, type Page } from '@playwright/test'

const LAB_URL = '/medial-guide-lab?font=noto-sans-kr'
const DISPLAY = {
  unitsPerEm: 1000, baselineY: 880, viewBox: [-120, -120, 1240, 1240], xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)', inkAutofit: false, individualCentering: false, advanceNormalization: false,
} as const
const font = { id: 'noto-sans-kr', family: 'Noto Sans KR', fileName: 'noto.ttf', fileSha256: '1'.padStart(64, '0'), source: 'https://example.invalid/noto', license: 'OFL', weight: 400, axes: {} }

function outlineResponse(text: string) {
  return {
    schema: 'reference-outline-response-v1', apiVersion: 'reference.v1', text, display: DISPLAY,
    samples: [{ fontId: font.id, glyphs: Array.from(text).map((character, index) => ({
      character, codepoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`, missing: false,
      glyphName: `glyph-${index}`, path: 'M60 0H760V840H60Z', pathSha256: `${index + 1}`.padStart(64, '0'), unitsPerEm: 1000, advance: 1, bounds: [0.06, 0, 0.76, 0.84],
    })) }],
  }
}

async function installApiFixture(page: Page, requests: string[]) {
  await page.route('**/api/reference/v1/fonts', (route) => route.fulfill({ status: 200, contentType: 'application/json', json: { schema: 'reference-font-catalog-response-v1', apiVersion: 'reference.v1', display: DISPLAY, fonts: [font] } }))
  await page.route('**/api/reference/v1/outlines', (route) => {
    const body = route.request().postDataJSON() as { text: string }
    requests.push(body.text)
    return route.fulfill({ status: 200, contentType: 'application/json', json: outlineResponse(body.text) })
  })
}

test('기존 홀자 경로는 통합 기준선 랩으로 보낸다', async ({ page }) => {
  const requests: string[] = []
  await installApiFixture(page, requests)
  await page.goto(LAB_URL)

  await expect(page).toHaveURL(/\/font-guide-lab\?font=noto-sans-kr&section=initial/)
  await expect(page.getByTestId('font-guide-lab')).toBeVisible()
  await expect.poll(() => requests).toEqual(['가각고곡과곽'])
  await expect(page.getByTestId('font-guide-case')).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'ㅏ', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '받침' })).toHaveCount(0)
})
