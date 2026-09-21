import { expect, test } from '@playwright/test'

/** 개발 서버 전용 화면 명세 버튼: 지금 주소의 명세(`docs/specs/화면/`)를 띄우고, 다른 화면을 번호로 가리킨 줄은 그 자리에서 펼친다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('자소 편집에서 버튼을 누르면 그 화면의 명세가 뜨고 다시 누르면 닫힌다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=간')
  const button = page.getByTestId('screen-spec-button')
  await expect(button).toHaveAttribute('data-has-spec', 'true')
  await expect(page.getByTestId('screen-spec-panel')).toHaveCount(0)

  await button.click()
  const panel = page.getByTestId('screen-spec-panel')
  await expect(panel).toContainText('자소편집')
  await expect(panel).toContainText('/workspace/jamo')
  await expect(panel.getByRole('heading', { name: /레이아웃 편집/ })).toBeVisible()
  await expect(panel.getByTestId('screen-spec-feature').filter({ hasText: '6.14' })).toContainText('적용')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('screen-spec-panel')).toHaveCount(0)
})

test('문장 보정 명세는 자소 편집을 가리킨 줄을 펼쳐 보여 준다', async ({ page }) => {
  await page.goto('/calibration')
  await page.getByTestId('screen-spec-button').click()
  const panel = page.getByTestId('screen-spec-panel')
  await expect(panel).toContainText('문장보정')
  const reference = panel.getByTestId('screen-spec-reference').filter({ hasText: '자소편집 3 펼치기' })
  await reference.locator('summary').click()
  await expect(reference).toContainText('3.1')
  await expect(reference).toContainText('글자 고르기')
})

test('열어 둔 상태는 다른 화면으로 가도 이어지고, 명세 없는 주소에서는 전체 화면 목록이 뜬다', async ({ page }) => {
  await page.goto('/workspace/review')
  await page.getByTestId('screen-spec-button').click()
  await expect(page.getByTestId('screen-spec-panel')).toContainText('검수격자')

  await page.goto('/rule-lab')
  const panel = page.getByTestId('screen-spec-panel')
  await expect(panel).toContainText('명세 없음')
  await expect(panel.getByRole('link', { name: /자소편집/ })).toHaveAttribute('href', '/workspace/jamo')
  await expect(page.getByTestId('screen-spec-button')).toHaveAttribute('data-has-spec', 'false')
})
