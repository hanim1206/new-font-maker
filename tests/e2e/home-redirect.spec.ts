import { expect, test } from '@playwright/test'

test('앱을 열면 자소 탭이 처음이고 글자 쿼리는 그대로 넘어간다', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByRole('region', { name: /레이아웃 수정/ })).toBeVisible()

  await page.goto('/?char=간')
  await expect(page).toHaveURL(/\/workspace\/jamo\?char=%EA%B0%84$/)
})

test('셸 없는 옛 문장 보정은 /calibration에 남고 셸의 문장 보정 링크가 그리로 간다', async ({ page }) => {
  await page.goto('/calibration')
  await expect(page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '자소 원형 새 화면 검토' })).toBeVisible()

  await page.goto('/workspace/jamo')
  await page.getByRole('link', { name: '문장 보정으로 돌아가기' }).click()
  await expect(page).toHaveURL(/\/calibration$/)
})
