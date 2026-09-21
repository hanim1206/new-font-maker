import { expect, test } from '@playwright/test'

test('앱을 열면 자소 탭이 처음이고 글자 쿼리는 그대로 넘어간다', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByRole('region', { name: /레이아웃 수정/ })).toBeVisible()

  await page.goto('/?char=간')
  await expect(page).toHaveURL(/\/workspace\/jamo\?char=%EA%B0%84$/)
})

test('셸 없는 옛 문장 보정은 /calibration에 남지만 셸에서 그리로 가는 링크는 없다', async ({ page }) => {
  await page.goto('/calibration')
  await expect(page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '자소 원형 새 화면 검토' })).toBeVisible()

  await page.goto('/workspace/jamo')
  await expect(page.locator('a[href="/calibration"], a[href="/"]')).toHaveCount(0)
})
