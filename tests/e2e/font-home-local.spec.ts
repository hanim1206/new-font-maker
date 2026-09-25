import { expect, test } from '@playwright/test'

/**
 * 게이트가 꺼진 개발 서버의 `내 폰트`(`/fonts`). 계정 대신 이 기기 목록(localStorage)으로 같은 화면이 뜬다.
 * 편집 주소로 바로 들어오면 지금 사본이 첫 폰트가 되고, 셸 머리 `‹ 내 폰트`로 돌아와 새로 만들고 열고 이름 바꾼다.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('편집 주소로 들어오면 첫 폰트가 생기고, 내 폰트에서 새로 만들고 열고 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
  // 자동으로 만들어진 첫 폰트의 이름이 머리에 뜬다.
  await expect(page.locator('header strong').first()).toHaveText('내 폰트')

  await page.getByTestId('workspace-font-home').click()
  await expect(page).toHaveURL(/\/fonts$/)
  const home = page.getByTestId('font-home')
  await expect(home).toBeVisible()
  await expect(page.getByTestId('font-home-item')).toHaveCount(1)
  await expect(page.getByTestId('font-home-count')).toHaveText('1 / 3')
  await expect(page.getByTestId('font-home-local')).toBeVisible()
  await expect(home.getByRole('button', { name: '로그아웃' })).toHaveCount(0)

  // 새 폰트 만들기 → 편집 화면 → 돌아오면 둘. 이름은 `내 폰트 2`.
  await page.getByTestId('font-home-create').click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.locator('header strong').first()).toHaveText('내 폰트 2')
  await page.getByTestId('workspace-font-home').click()
  await expect(page.getByTestId('font-home-item')).toHaveCount(2)

  // 첫 폰트를 열면 그 이름으로 열린다.
  await page.getByTestId('font-home-item').filter({ hasText: /^내 폰트지금 연 폰트|내 폰트오늘|내 폰트$/ }).first().getByRole('button').first().click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.locator('header strong').first()).toHaveText(/^내 폰트/)
})

test('/fonts로 바로 열어도 목록이 뜨고 한도 3에서 새로 만들기가 꺼진다', async ({ page }) => {
  await page.goto('/fonts')
  await expect(page.getByTestId('font-home')).toBeVisible()
  for (let n = 0; n < 3; n += 1) {
    const count = await page.getByTestId('font-home-item').count()
    if (count >= 3) break
    await page.getByTestId('font-home-create').click()
    await expect(page).toHaveURL(/\/workspace\/jamo$/)
    await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('workspace-font-home').click()
    await expect(page).toHaveURL(/\/fonts$/)
  }
  await expect(page.getByTestId('font-home-item')).toHaveCount(3)
  await expect(page.getByTestId('font-home-create')).toBeDisabled()
})
