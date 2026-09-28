import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('처음 들어온 사람 안내 — 여섯 장을 넘기고 시작하면 다시 안 뜬다', async ({ page }) => {
  await page.goto('/dashboard')
  await page.evaluate(() => localStorage.setItem('hfm-beta-guide', 'pending'))
  await page.reload()
  const guide = page.getByTestId('beta-guide')
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('heading')).toHaveText('대시보드')
  for (let i = 0; i < 5; i++) await page.getByTestId('beta-guide-next').click()
  await expect(guide.getByRole('heading')).toHaveText('다운로드 · 제보')
  await page.getByTestId('beta-guide-next').click()
  await expect(guide).toBeHidden()
  await page.reload()
  await expect(page.getByTestId('dashboard-font-switcher')).toBeVisible()
  await expect(guide).toHaveCount(0)
})

test('첫 장 건너뛰기로 닫는다', async ({ page }) => {
  await page.goto('/dashboard?guide')
  await page.getByTestId('beta-guide-skip').click()
  await expect(page.getByTestId('beta-guide')).toBeHidden()
})

test('제보 판의 둘러보기로 다시 연다', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByTestId('report-open').click()
  await page.getByTestId('report-guide').click()
  await expect(page.getByTestId('report-sheet')).toHaveCount(0)
  await expect(page.getByTestId('beta-guide')).toBeVisible()
  await page.getByTestId('beta-guide-skip').click()
  await expect(page.getByTestId('beta-guide')).toBeHidden()
})
