import { expect, test } from '@playwright/test'

/** 굵기 보정 실험실(`/weight-lab`): 세 칸이 같은 글자를 그리고, 굵기 막대가 앱 배율과 노토 배율을 같이 바꾼다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/weight-lab')
})

test('세 칸과 측정표가 뜨고 굵기 막대가 배율을 바꾼다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '굵기 보정 실험실' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '마' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('weight-lab-weight')).toHaveText('900')

  const naive = page.getByTestId('weight-lab-glyph-naive')
  const corrected = page.getByTestId('weight-lab-glyph-corrected')
  await expect(naive.locator('svg path').first()).toBeVisible()
  await expect(corrected.locator('svg path').first()).toBeVisible()
  await expect(page.getByTestId('weight-lab-ghost')).toBeVisible()

  // 900: 옛 직선은 2.2, 노토 곡선(지금 앱)은 그보다 얇다. 오차는 +.
  await expect(naive).toHaveAttribute('data-multiplier', '2.200')
  const corrected900 = Number(await corrected.getAttribute('data-multiplier'))
  expect(corrected900).toBeGreaterThan(1.5)
  expect(corrected900).toBeLessThan(2.2)
  await expect(page.getByTestId('weight-lab-error')).toContainText('%')

  // 400: 둘 다 1.000, 오차 0%.
  await page.getByLabel('굵기').fill('400')
  await expect(page.getByTestId('weight-lab-weight')).toHaveText('400')
  await expect(naive).toHaveAttribute('data-multiplier', '1.000')
  await expect(corrected).toHaveAttribute('data-multiplier', '1.000')
  await expect(page.getByTestId('weight-lab-error')).toHaveText('0%')

  // 글자를 바꾸면 고스트도 그 글자로.
  await page.getByRole('tab', { name: '호' }).click()
  await expect(page.getByRole('img', { name: '호 노토 400' })).toBeVisible()
})
