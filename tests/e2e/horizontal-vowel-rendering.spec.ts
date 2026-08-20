import { expect, test } from '@playwright/test'

test('운의 ㅜ 가로획은 글자 폭 경계에서도 유지된다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('스치운다.')

  const paths = page.getByRole('button', { name: /^운 편집/ }).locator('svg path')
  await expect(paths).toHaveCount(4)
  const horizontalWidth = await paths.nth(1).evaluate((node) => (node as SVGGraphicsElement).getBBox().width)
  expect(horizontalWidth).toBeGreaterThan(60)
})
