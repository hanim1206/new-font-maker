import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

test('관리자 실험실: 목록에서 고르면 관리자 틀 안에 랩이 뜨고, 사이드바로 옮겨 다닌다', async ({ page }) => {
  await page.goto('/admin/labs')
  await expect(page.getByRole('heading', { name: '실험실' })).toBeVisible()
  await expect(page.getByTestId('admin-labs-list').getByRole('link')).toHaveCount(7)
  await page.screenshot({ path: 'test-results/admin-labs-list.png' })

  await page.getByTestId('admin-labs-list').getByRole('link', { name: /굵기 보정/ }).click()
  await expect(page).toHaveURL(/\/admin\/labs\/weight-lab$/)
  await expect(page.getByRole('heading', { name: '굵기 보정' })).toBeVisible()
  const frame = page.getByTestId('admin-lab-frame')
  await expect(frame).toHaveAttribute('src', '/weight-lab')
  await expect(page.frameLocator('[data-testid="admin-lab-frame"]').locator('body')).not.toBeEmpty()

  await page.getByTestId('admin-lab-stroke-grammar-lab').click()
  await expect(page).toHaveURL(/\/admin\/labs\/stroke-grammar-lab$/)
  await expect(frame).toHaveAttribute('src', '/stroke-grammar-lab')
  await expect(page.getByTestId('admin-lab-stroke-grammar-lab')).toHaveAttribute('aria-current', 'page')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/admin-lab-stroke-grammar.png' })

  await page.goBack()
  await expect(page).toHaveURL(/\/admin\/labs\/weight-lab$/)
  await expect(frame).toHaveAttribute('src', '/weight-lab')
})
