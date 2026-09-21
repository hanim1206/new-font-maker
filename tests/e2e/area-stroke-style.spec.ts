import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/calibration')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await page.getByRole('tab', { name: /획 스타일/ }).click()
})

test('절단형 끝처리의 절단각·곡률을 미리보기와 이력에 적용한다', async ({ page }) => {
  const drawer = page.getByRole('tabpanel', { name: '획 스타일' })
  const focusSvg = page.getByRole('region', { name: /완성 글자 편집/ }).locator('svg')
  const before = await focusSvg.innerHTML()

  await drawer.getByRole('radio', { name: '절단 끝', exact: true }).click()
  await expect(drawer.getByRole('slider', { name: '절단각' })).toHaveAttribute('aria-valuenow', '35')
  const beforeCornerRadius = await focusSvg.innerHTML()
  await drawer.getByRole('slider', { name: '모서리 곡률' }).fill('65')
  await drawer.getByRole('slider', { name: '모서리 곡률' }).dispatchEvent('pointerup', { pointerId: 1 })
  await expect.poll(() => focusSvg.innerHTML()).not.toBe(beforeCornerRadius)
  await expect.poll(() => focusSvg.innerHTML()).not.toBe(before)

  const cutAngle = drawer.getByRole('slider', { name: '절단각' })
  for (let index = 0; index < 35; index += 1) await cutAngle.press('ArrowLeft')
  await expect(cutAngle).not.toHaveAttribute('aria-valuenow', '0')

  await page.getByRole('button', { name: '마지막 편집 되돌리기' }).click()
  await expect(drawer.getByRole('slider', { name: '절단각' })).toBeVisible()
})

test('360×667 화면에서 신규 획 규칙 조절판이 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 667 })
  const drawer = page.getByRole('tabpanel', { name: '획 스타일' })
  await drawer.getByRole('radio', { name: '레거시 스냅 획', exact: true }).click()
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.horizontal).toBeLessThanOrEqual(0)
  expect(overflow.vertical).toBeLessThanOrEqual(0)
})

test('절단형 끝처리로 전체 OTF를 생성하고 다운로드한다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.getByRole('tabpanel', { name: '획 스타일' }).getByRole('radio', { name: '절단 끝', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '현재 작업을 OTF로 추출' }).click()
  await page.getByTestId('font-export-confirm').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.otf$/i)
  await expect(page.getByRole('button', { name: 'OTF 추출 완료' })).toBeVisible()
})

test('레거시 스냅 획을 미리보기·복원·전체 OTF에 적용한다', async ({ page }) => {
  test.setTimeout(240_000)
  const drawer = page.getByRole('tabpanel', { name: '획 스타일' })
  const focusSvg = page.getByRole('region', { name: /완성 글자 편집/ }).locator('svg')
  const before = await focusSvg.innerHTML()
  await drawer.getByRole('radio', { name: '레거시 스냅 획', exact: true }).click()
  await expect(drawer.getByText('25-unit 스냅 · 75-unit 획 · 35° 절단')).toBeVisible()
  await expect(drawer.getByRole('link', { name: '형태 그리드 편집 열기' })).toHaveAttribute('href', '/grid-lab')
  await expect(page.locator('[data-construction-grid="legacy-snapped-centerline"]')).toBeVisible()
  await expect.poll(() => focusSvg.innerHTML()).not.toBe(before)

  await page.reload()
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await page.getByRole('tab', { name: /획 스타일/ }).click()
  await expect(page.getByRole('radio', { name: '레거시 스냅 획', exact: true })).toHaveAttribute('aria-checked', 'true')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '현재 작업을 OTF로 추출' }).click()
  await page.getByTestId('font-export-confirm').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.otf$/i)
  await expect(page.getByRole('button', { name: 'OTF 추출 완료' })).toBeVisible()
})
