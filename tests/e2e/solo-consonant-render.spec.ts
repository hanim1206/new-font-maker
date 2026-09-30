import { expect, test } from '@playwright/test'

/** 문장에 홑자모(첫닿자 하나 `ㄱ`)가 들어와도 편집기가 그려진다. 전에는 코퍼스 신원을 만들다 던져서 오류 화면이 떴다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('`ㄱ`을 들고 들어오면 오류 화면 없이 문장 줄과 캔버스가 뜨고, ㄱ 글자에 획이 그려진다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%E3%84%B1')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('문제가 생겼어요')).toHaveCount(0)
  await expect(page.getByTestId('focus-canvas')).toBeVisible()
  const solo = page.getByRole('button', { name: /^ㄱ / }).first()
  await expect(solo).toBeVisible()
  await expect(solo.locator('svg path').first()).toBeVisible()
})
