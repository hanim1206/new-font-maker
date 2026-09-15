import { devices, expect, test, type Page } from '@playwright/test'

const LAB_URL = '/preset-candidate-lab'
const DISPLAY = {
  unitsPerEm: 1000, baselineY: 880, viewBox: [-120, -120, 1240, 1240], xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)', inkAutofit: false, individualCentering: false, advanceNormalization: false,
} as const
const font = {
  id: 'noto-sans-kr', family: 'Noto Sans KR', fileName: 'NotoSansKR.ttf',
  fileSha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
  source: 'https://example.invalid/noto', license: 'OFL', weight: 400, axes: { wght: 400 },
}

function outlineResponse(text: string) {
  return {
    schema: 'reference-outline-response-v1', apiVersion: 'reference.v1', text, display: DISPLAY,
    samples: [{ fontId: font.id, glyphs: Array.from(text).map((character, index) => ({
      character, codepoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`, missing: false,
      glyphName: `glyph-${index}`, path: 'M90 120H760V800H90Z'.repeat(32), pathSha256: `${index + 1}`.padStart(64, '0'),
      unitsPerEm: 1000, advance: 1, bounds: [90, 120, 760, 800],
    })) }],
  }
}

async function installApiFixture(page: Page, requests: string[]) {
  await page.route('**/api/reference/v1/fonts', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    json: { schema: 'reference-font-catalog-response-v1', apiVersion: 'reference.v1', display: DISPLAY, fonts: [font] },
  }))
  await page.route('**/api/reference/v1/outlines', (route) => {
    const body = route.request().postDataJSON() as { text: string }
    requests.push(body.text)
    return route.fulfill({ status: 200, contentType: 'application/json', json: outlineResponse(body.text) })
  })
}

test.describe('기본 고딕 01 공동 조합 입력 랩', () => {
  test.use({
    userAgent: devices['Desktop Chrome'].userAgent,
    viewport: { width: 1440, height: 1000 },
    screen: { width: 1440, height: 1000 },
    deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor,
    isMobile: devices['Desktop Chrome'].isMobile,
    hasTouch: devices['Desktop Chrome'].hasTouch,
  })

  test('r3을 숨기고 19초성 선택형 42자 입력 보드를 읽기 전용으로 제공한다', async ({ page }) => {
    const requests: string[] = []
    await installApiFixture(page, requests)
    await page.addInitScript(() => localStorage.setItem('preset-candidate-lab-sentinel', 'preserve'))
    await page.goto(LAB_URL)

    const lab = page.getByTestId('preset-candidate-lab')
    await expect(lab).toBeVisible()
    await expect(lab).toHaveAttribute('data-local-storage-policy', 'read-only')
    await expect(lab).toHaveAttribute('data-candidate-revision', 'r4-input')
    await expect(page.getByRole('heading', { name: /기본 고딕 01 공동 조합 입력 r4/ })).toBeVisible()
    await expect(page.getByText('초성 114/114 연결')).toBeVisible()
    await expect(page.getByText('종성 81/81 후보 · 검수 대기')).toBeVisible()
    await expect(page.getByText('r3 폐기', { exact: true })).toBeVisible()
    await expect(page.getByText('Noto 기준선 반영 r3 · 네모 끝')).toHaveCount(0)

    await expect(page.getByRole('button', { name: 'ㄱ', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('preset-composition-target')).toHaveCount(42)
    await expect(page.getByTestId('source-glyph-canvas')).toHaveCount(42)
    await expect(page.getByTestId('current-app-canvas')).toHaveCount(42)
    await expect(page.getByTestId('r4-candidate-canvas')).toHaveCount(42)
    await expect(page.locator('[data-app-glyph-revision="r4-fit"]')).toHaveCount(21)
    await expect(page.locator('[data-app-glyph-revision="r4-pending"]')).toHaveCount(21)
    await expect(page.locator('[data-app-glyph-revision="r4-fit"] svg svg')).toHaveCount(0)
    await expect.poll(() => requests.length).toBe(4)
    const firstCardCanvases = page.locator('[data-character="가"] figure')
    await expect(firstCardCanvases).toHaveCount(3)
    await expect(firstCardCanvases.nth(0)).toContainText('Noto 실제 글자 + 추출/투영 영역')
    await expect(firstCardCanvases.nth(1)).toContainText('기준선 기반 생성 · 직각형')
    await expect(page.locator('[data-input-evidence="confirmed-input"]')).toHaveCount(3)
    await expect(page.locator('[data-guide-master-status="ready-direct-guide-master"]')).toHaveCount(3)
    await expect(page.locator('[data-guide-master-status="ready-projected-guide-master"]')).toHaveCount(18)
    await expect(page.locator('[data-character="게"]')).toHaveAttribute('data-input-evidence', 'projected-input')
    await expect(page.locator('[data-generation-status="guide-generated"]')).toHaveCount(21)
    await expect(page.locator('[data-generation-status="blocked-missing-guide-master"]')).toHaveCount(21)
    await expect(page.getByTestId('guide-generated-glyph')).toHaveCount(21)
    await expect(firstCardCanvases.nth(1)).not.toContainText('RMSE')
    await expect(firstCardCanvases.nth(2)).toContainText('현재 앱 기준값 · 비교용')
    const canvasSizes = await firstCardCanvases.locator(':scope > svg').evaluateAll((canvases) => (
      canvases.map((canvas) => ({ width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height }))
    ))
    expect(new Set(canvasSizes.map(({ width }) => Math.round(width))).size).toBe(1)
    expect(new Set(canvasSizes.map(({ height }) => Math.round(height))).size).toBe(1)
    await expect(page.locator('[data-composition-gate="ready-for-layout-fit"]')).toHaveCount(21)
    await expect(page.locator('[data-composition-gate="blocked-final-visual-review"]')).toHaveCount(21)
    await expect(page.locator('[data-character="가"]')).toContainText('정확 대표 문맥')
    await expect(page.locator('[data-character="개"]')).toContainText('구조 문맥 투영')
    await expect(page.locator('[data-character="각"]')).toContainText('추출 입력 검수 대기')

    const guideToggle = page.getByRole('button', { name: '가이드선 숨기기' })
    await expect(guideToggle).toBeVisible()
    await expect(guideToggle).toHaveAttribute('aria-pressed', 'false')
    expect(await guideToggle.evaluate((button) => getComputedStyle(button).position)).toBe('fixed')
    await page.evaluate(() => window.scrollTo(0, 1200))
    await expect(guideToggle).toBeVisible()
    await expect(page.getByTestId('source-guide-layer')).toHaveCount(42)
    await expect(page.getByTestId('candidate-guide-layer')).toHaveCount(42)
    await guideToggle.click()
    await expect(page.getByRole('button', { name: '가이드선 보이기' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('source-guide-layer')).toHaveCount(0)
    await expect(page.getByTestId('source-observation-layer')).toHaveCount(0)
    await expect(page.getByTestId('candidate-guide-layer')).toHaveCount(0)
    await expect(page.getByTestId('candidate-observation-layer')).toHaveCount(0)
    await expect(page.getByTestId('current-app-canvas').first().locator(':scope > svg > rect')).toHaveCount(2)

    await page.getByRole('button', { name: 'ㅍ', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'ㅍ × 21홀자 × 무받침/ㄱ' })).toBeVisible()
    await expect(page.getByTestId('preset-composition-target')).toHaveCount(42)
    await expect(page.getByTestId('source-glyph-canvas')).toHaveCount(42)
    await expect.poll(() => requests.length).toBe(8)
    await expect(page.locator('[data-character="풔"]')).toContainText('구조 문맥 투영')
    await expect(page.locator('[data-input-evidence="confirmed-input"]')).toHaveCount(0)

    await page.getByRole('button', { name: '무받침 21자' }).click()
    await expect(page.getByTestId('preset-composition-target')).toHaveCount(21)
    await expect(page.locator('[data-composition-gate="blocked-final-visual-review"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'ㄱ받침 21자 · 대기' }).click()
    await expect(page.getByTestId('preset-composition-target')).toHaveCount(21)
    await expect(page.locator('[data-composition-gate="ready-for-layout-fit"]')).toHaveCount(0)

    expect(await page.evaluate(() => localStorage.getItem('preset-candidate-lab-sentinel'))).toBe('preserve')
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['preset-candidate-lab-sentinel'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
