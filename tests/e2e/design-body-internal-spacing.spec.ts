import { expect, test } from '@playwright/test'

test('에의 ㅔ 가로점은 네모꼴 축소 비율을 따라 유지된다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('에')

  const glyphButton = page.getByRole('button', { name: /^에 편집/ })
  const horizontalArm = glyphButton.locator('svg path').nth(2)
  const ratio = async () => {
    const [glyphBox, armBox] = await Promise.all([glyphButton.boundingBox(), horizontalArm.boundingBox()])
    if (!glyphBox || !armBox) throw new Error('에 또는 ㅔ 가로점의 화면 경계를 찾지 못했습니다.')
    return armBox.width / glyphBox.width
  }
  const before = await ratio()

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const settings = page.getByRole('tabpanel', { name: '글자 네모꼴 설정' })
  await settings.locator('label').filter({ hasText: '가로' }).locator('input').fill('600')
  const after = await ratio()

  expect(after).toBeCloseTo(before, 1)
  expect(after).toBeGreaterThan(.2)
})

test('글로벌 가로폭을 줄이면 예시 문장의 띄어쓰기도 함께 줄어든다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('가 나')

  const space = page.getByLabel('공백')
  const before = await space.boundingBox()
  if (!before) throw new Error('공백의 화면 경계를 찾지 못했습니다.')

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const settings = page.getByRole('tabpanel', { name: '글자 네모꼴 설정' })
  await settings.locator('label').filter({ hasText: '가로' }).locator('input').fill('595')
  const after = await space.boundingBox()
  if (!after) throw new Error('변경된 공백의 화면 경계를 찾지 못했습니다.')

  expect(after.width / before.width).toBeCloseTo(.7, 1)
})
