import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/rule-lab')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('ㄱ부터 ㄹ까지 형태 예절과 적용 범위를 검토하고 저장한다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '형태 규칙 실험실' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'ㄱ' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('형태 규칙 입력').getByText('오른쪽 · 0°', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '끝점 선택' }).click()
  await expect(page.getByLabel('형태 규칙 입력').getByText('아래쪽 · 90°', { exact: true })).toBeVisible()

  await page.getByLabel('ㄱ 끝 형태의 예절').fill('끝을 짧게 맺는다')
  await page.getByLabel('ㄱ 끝 적용 범위').selectOption('같은 끝 형태')
  await page.getByLabel('범위 조건 선택 사항').fill('초성에서만')
  await expect(page.locator('pre')).toContainText('"etiquette": "끝을 짧게 맺는다"')
  await expect(page.locator('pre')).toContainText('"scope": "같은 끝 형태"')

  await page.reload()
  await page.getByRole('button', { name: '끝점 선택' }).click()
  await expect(page.getByLabel('ㄱ 끝 형태의 예절')).toHaveValue('끝을 짧게 맺는다')
  await expect(page.getByLabel('ㄱ 끝 적용 범위')).toHaveValue('같은 끝 형태')

  for (const jamo of ['ㄴ', 'ㄷ', 'ㄹ']) {
    await page.getByRole('tab', { name: jamo }).click()
    await expect(page.getByRole('tab', { name: jamo })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('img', { name: `${jamo} 시작점과 끝점 선택` })).toBeVisible()
  }
})

test('작은 모바일 화면에서 가로 넘침이 생기지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 667 })
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(0)
})
