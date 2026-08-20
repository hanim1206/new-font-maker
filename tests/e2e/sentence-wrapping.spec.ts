import { expect, test } from '@playwright/test'

test('예시 문장은 글자가 아니라 어절 단위로 줄바꿈한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('그곳이 차마 꿈엔들 잊힐리야')

  const positions = await Promise.all(['잊', '힐', '리', '야'].map(async (char) => {
    const box = await page.getByRole('button', { name: new RegExp(`^${char} 편집`) }).boundingBox()
    if (!box) throw new Error(`${char} 글자의 위치를 찾지 못했습니다.`)
    return Math.round(box.y)
  }))
  expect(new Set(positions).size).toBe(1)
})
