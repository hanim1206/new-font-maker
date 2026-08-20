import { expect, test } from '@playwright/test'

test('동의 ㅗ는 ㄷ의 실제 하단 잉크를 관통하지 않는다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('동')

  const paths = page.getByRole('button', { name: /^동 편집/ }).locator('svg path')
  await expect(paths).toHaveCount(4)

  const [choseong, jungseongVertical] = await Promise.all([
    paths.nth(0).evaluate((node) => {
      const box = (node as SVGGraphicsElement).getBoundingClientRect()
      return { bottom: box.bottom }
    }),
    paths.nth(1).evaluate((node) => {
      const box = (node as SVGGraphicsElement).getBoundingClientRect()
      return { top: box.top }
    }),
  ])

  expect(jungseongVertical.top).toBeGreaterThanOrEqual(choseong.bottom - 0.5)
})
