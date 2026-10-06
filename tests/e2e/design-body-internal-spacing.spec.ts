import { expect, test } from '@playwright/test'

test('에의 ㅔ 가로점은 네모꼴 축소 비율을 따라 유지된다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/calibration')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('에')

  const glyphButton = page.getByRole('button', { name: /^에 편집/ })
  const horizontalArm = glyphButton.locator('svg path').nth(2)
  // 기본 네모꼴은 획을 선(stroke)으로, 바꾼 네모꼴은 면(fill)으로 그린다. Playwright `boundingBox`는 선 두께를 사방에 더해
  // 기본 쪽 가로점만 길게 잡으니(.275 대 .196), 두 경우 모두 잉크 길이와 같은 기하 경계(getBoundingClientRect)로 잰다.
  const ratio = async () => {
    const [glyphBox, armWidth] = await Promise.all([glyphButton.boundingBox(), horizontalArm.evaluate((path) => path.getBoundingClientRect().width)])
    if (!glyphBox || !armWidth) throw new Error('에 또는 ㅔ 가로점의 화면 경계를 찾지 못했습니다.')
    return armWidth / glyphBox.width
  }
  // 문장을 바꾸면 글자도 300ms쯤 뒤 한 번 더 그려진다. 부하가 크면 더 늦어 첫 값을 바로 재면 그 사이 값이 잡힌다 — 두 번 연달아 같을 때까지 기다린다.
  // 그 사이 값은 .12쯤이라 다 그려진 값(.2쯤)과 갈린다 — .15를 넘고 두 번 연달아 같을 때까지 기다린다.
  let last = Number.NaN
  await expect.poll(async () => { const now = await ratio(); const same = now > .15 && Math.abs(now - last) < 1e-6; last = now; return same }, { intervals: [400] }).toBe(true)
  const before = last
  const glyphWidth = (await glyphButton.boundingBox())?.width ?? 0

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const settings = page.getByRole('tabpanel', { name: '글자 네모꼴 설정' })
  await settings.locator('label').filter({ hasText: '가로' }).locator('input').fill('600')
  // 칸 폭이 먼저 줄고, 획은 300ms쯤 뒤 한 번 더 그려져야 자리를 잡는다. 바로 재면 그 사이 값(.12)이 잡힌다.
  await expect.poll(async () => (await glyphButton.boundingBox())?.width ?? 0).toBeLessThan(glyphWidth * .8)
  await expect.poll(ratio, { timeout: 15_000 }).toBeCloseTo(before, 1)
  expect(await ratio()).toBeGreaterThan(.15)
})

// 2026-10-02 `a4b2ddc`부터 문장 줄은 추출 폰트와 같은 값으로 그린다. 공백은 220 고정이고 몸통을 따르지 않는다(`fontMetrics.ts`). 글자 칸만 몸통 폭에 비례해 줄어든다.
test('글로벌 가로폭을 줄이면 글자 칸은 줄고 띄어쓰기는 220 그대로다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/calibration')
  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('가 나')

  const space = page.getByLabel('공백')
  const glyph = page.getByRole('button', { name: /^가 편집/ })
  const before = await space.boundingBox()
  const glyphBefore = await glyph.boundingBox()
  if (!before || !glyphBefore) throw new Error('공백 또는 가의 화면 경계를 찾지 못했습니다.')

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const settings = page.getByRole('tabpanel', { name: '글자 네모꼴 설정' })
  await settings.locator('label').filter({ hasText: '가로' }).locator('input').fill('595')
  await expect.poll(async () => ((await glyph.boundingBox())?.width ?? 0) / glyphBefore.width).toBeCloseTo(595 / 840, 1)
  const after = await space.boundingBox()
  if (!after) throw new Error('변경된 공백의 화면 경계를 찾지 못했습니다.')

  expect(after.width / before.width).toBeCloseTo(1, 2)
})
