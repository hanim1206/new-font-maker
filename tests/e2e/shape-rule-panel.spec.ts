import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/calibration')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

async function selectFirstStroke(page: import('@playwright/test').Page) {
  const focusSvg = page.getByRole('region', { name: /완성 글자 편집/ }).locator('svg')
  const stroke = focusSvg.locator('[data-editor-hit="stroke"]').first()
  await stroke.dispatchEvent('pointerdown', { pointerId: 1, button: 0 })
  await stroke.dispatchEvent('pointerdown', { pointerId: 2, button: 0 })
}

test('실제 편집 자모의 획을 읽고 자동 메타데이터와 예절을 표시한다', async ({ page }) => {
  await expect(page.getByRole('button', { name: '선택 자모 형태 규칙' })).toBeDisabled()
  await selectFirstStroke(page)
  await page.getByRole('button', { name: '선택 자모 형태 규칙' }).click()

  const panel = page.getByRole('dialog', { name: /형태 규칙/ })
  await expect(panel.getByText('현재 에디터 데이터')).toBeVisible()
  await expect(panel.getByRole('img', { name: /실제 편집 데이터/ })).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: '순서' })).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: '연결' })).toBeVisible()
  await expect(panel.getByRole('img', { name: /실제 편집 데이터/ }).locator('path[data-active="true"]')).toHaveCount(1)
  const pathCount = await panel.getByRole('img', { name: /실제 편집 데이터/ }).locator('path').count()
  if (pathCount > 1) await expect(panel.getByRole('img', { name: /실제 편집 데이터/ }).locator('path[data-muted="true"]')).toHaveCount(pathCount - 1)

  await expect(panel.getByLabel('선택 획 자동 메타데이터')).toContainText('1번째 획')
  await expect(panel.getByLabel('선택 획 자동 메타데이터')).toContainText('열린 경로')
  await panel.getByRole('button', { name: '원형 부리', exact: true }).click()
  await expect(panel.getByRole('slider', { name: '부리 크기' })).toBeVisible()
  await expect(panel.getByRole('img', { name: /실제 편집 데이터/ }).locator('path[class*="buriPreview"]')).toHaveCount(1)
  await expect(panel.getByRole('slider', { name: '부리 각도' })).toHaveCount(0)
  await panel.getByRole('button', { name: '각진 부리', exact: true }).click()
  await panel.getByRole('slider', { name: '부리 크기' }).fill('1.5')
  await panel.getByRole('button', { name: '1번째 획 끝점 선택' }).click()
  await expect(panel.getByRole('button', { name: '원형 부리', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '사각 부리', exact: true }).click()
  await panel.getByRole('button', { name: '1번째 획 시작점 선택' }).click()
  await panel.getByLabel('획 1 시작 형태의 예절').fill('첫부분을 반듯하게 둔다')
  await panel.getByRole('button', { name: '완료' }).click()

  await page.reload()
  await selectFirstStroke(page)
  await page.getByRole('button', { name: '선택 자모 형태 규칙' }).click()
  await expect(page.getByRole('dialog', { name: /형태 규칙/ }).getByRole('button', { name: '각진 부리', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog', { name: /형태 규칙/ }).getByRole('slider', { name: '부리 크기' })).toHaveValue('1.5')
  await expect(page.getByRole('dialog', { name: /형태 규칙/ }).getByLabel('획 1 시작 형태의 예절')).toHaveValue('첫부분을 반듯하게 둔다')
})
