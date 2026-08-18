import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/editor-v2')
})

test('적용 문맥은 스와이퍼가 아닌 자소 기본형에서만 보여준다', async ({ page }) => {
  await expect(page.getByRole('region', { name: '초성 ㄱ 적용 문맥' })).toHaveCount(0)
  await page.getByRole('button', { name: 'ㄱ ㄱ-1 획 선택' }).focus()
  await page.keyboard.press('Enter')
  const contexts = page.getByRole('region', { name: 'ㄱ 레이아웃별 적용 미리보기' })
  await expect(contexts).toBeVisible()
  await expect(contexts.locator('article')).toHaveCount(7)
})

test('빠른 자소 탐색은 숨겨진 상태를 유지한다', async ({ page }) => {
  const activeCard = page.getByLabel('현재 글자 곰')
  const box = await activeCard.boundingBox()
  if (!box) throw new Error('활성 글자 카드의 위치를 찾지 못했습니다.')

  const start = { x: box.x + 20, y: box.y + 20 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.waitForTimeout(420)
  await page.mouse.up()

  await expect(page.getByRole('dialog', { name: '초성 빠른 선택' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '곰 편집' })).toBeVisible()
})
