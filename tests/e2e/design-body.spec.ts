import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  // 편집기 문장은 대시보드 예시 문장을 따른다. 이 파일의 글자 기대는 `별을 노래하는 마음으로`에 맞춰 있어 그 문장으로 고정한다.
  await page.addInitScript(() => localStorage.setItem('font-maker-sample-sentence', '별을 노래하는 마음으로'))
  await page.goto('/calibration')
})

test('폰트 전체와 현재 레이아웃의 네모꼴을 따로 조절한다', async ({ page }) => {
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const settings = page.getByRole('tabpanel', { name: '글자 네모꼴 설정' })
  await expect(settings).toBeVisible()
  await expect(settings.getByText('Font Space 1000은 고정됩니다')).toBeVisible()

  const sentenceButton = page.getByRole('button', { name: /^별 편집/ })
  const sentenceGlyph = sentenceButton.locator('svg')
  const beforePreview = await sentenceGlyph.innerHTML()
  const beforeAdvance = await sentenceButton.boundingBox()
  const width = settings.locator('label').filter({ hasText: '가로' }).locator('input')
  await expect(width).toHaveValue('840')
  await width.fill('900')
  await expect(settings.getByText('900', { exact: true })).toBeVisible()
  await expect.poll(() => sentenceGlyph.innerHTML()).not.toBe(beforePreview)
  await expect.poll(async () => (await sentenceButton.boundingBox())?.width ?? 0).toBeGreaterThan(beforeAdvance?.width ?? 0)

  await settings.getByRole('tab', { name: '현재 레이아웃' }).click()
  await expect(settings.getByText('초성·세로중성·종성만 별도 적용')).toBeVisible()
  await settings.locator('label').filter({ hasText: '세로' }).locator('input').fill('800')
  await expect(settings.getByText('800', { exact: true })).toBeVisible()

  await settings.getByRole('button', { name: '폰트 전체 설정 따르기' }).click()
  await expect(settings.locator('label').filter({ hasText: '가로' }).locator('input')).toHaveValue('900')
  await expect(settings.locator('label').filter({ hasText: '세로' }).locator('input')).toHaveValue('910')

  await settings.getByRole('tab', { name: '폰트 전체' }).click()
  await settings.getByRole('button', { name: '기본 840 × 910으로 되돌리기' }).click()
  await expect(settings.locator('label').filter({ hasText: '가로' }).locator('input')).toHaveValue('840')
  await expect(settings.locator('label').filter({ hasText: '세로' }).locator('input')).toHaveValue('910')
})
