import { expect, test } from '@playwright/test'

test('에에서 조절한 중성 레이아웃을 네의 예시 글자에도 전파한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('에 네')

  const relatedGlyph = page.getByRole('button', { name: /^네 편집/ }).locator('svg')
  const before = await relatedGlyph.innerHTML()
  const focused = page.getByRole('region', { name: '에 완성 글자 편집' }).locator('svg')
  await focused.locator('path').nth(1).click({ force: true })
  await expect(page.getByText(/중성 영역 · 같은 구조의 글자에 함께 적용/)).toBeVisible()

  const trackpad = page.getByRole('group', { name: '선택한 글자 형태를 조절하는 트랙패드' })
  const box = await trackpad.boundingBox()
  if (!box) throw new Error('트랙패드 위치를 찾지 못했습니다.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()

  await expect.poll(() => relatedGlyph.innerHTML()).not.toBe(before)
})
