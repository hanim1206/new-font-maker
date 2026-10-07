import { expect, test, type Locator, type Page } from '@playwright/test'
import { inkOf, pointOn } from './ink'

// 획을 끄는 동안 화면의 잉크가 실제로 따라 움직이는지 픽셀로 본다. 다른 스펙은 손을 뗀 뒤의 DOM만 봐서, 끄는 동안 안 보이는 버그를 못 잡는다.
// (10-06: 가른 벌(홀자별 첫닿자)에서 끌면 끄는 동안 안 움직이고, 뗄 때 벌이 기본 모양으로 덮였다.)

/** 획을 눌러 그대로 왼쪽으로 끈다(먼저 톡 눌러 잡으면 다시 누를 때 점이 잡힌다). 손을 떼기 전의 잉크와 뗀 뒤의 잉크를 돌려준다. */
async function dragLeft(page: Page, hit: Locator) {
  const before = await inkOf(page)
  const grab = await pointOn(hit)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(grab.x - 36 * step / 10, grab.y)
  await expect.poll(async () => (await inkOf(page)).x, { timeout: 15_000 }).toBeLessThan(before.x - 8)
  const during = await inkOf(page)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()
  const after = await inkOf(page)
  return { before, during, after }
}

// 자리마다 한 번씩: 자소 단독 · 받침. 홀자 줄기와 가른 벌은 아래에서 따로 본다(스모크에 든다).
for (const [name, url] of [['자소 단독 ㄱ', `/workspace/jamo?char=${encodeURIComponent('가')}&mode=stroke&part=CH`], ['받침 ㅇ', `/workspace/jamo?char=${encodeURIComponent('강')}&mode=stroke&part=JO`]] as const) {
  test(`${name}: 획을 끌면 끄는 동안 잉크가 따라 움직인다`, async ({ page }) => {
    await page.goto(url)
    const hit = page.locator('svg [data-editor-hit="stroke"]').first()
    await expect(hit).toBeAttached({ timeout: 60_000 })
    const { during, after } = await dragLeft(page, hit)
    expect(Math.abs(after.x - during.x)).toBeLessThan(6)
  })
}

test('홀자와 함께 그려진 글자에서 홀자 줄기를 끌면 끄는 동안 잉크가 따라 움직인다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('가')}&mode=stroke&part=JU`)
  const hit = page.locator('svg [data-editor-hit="stroke"][data-stroke-id="ㅏ-1"]')
  await expect(hit).toBeAttached({ timeout: 60_000 })
  const { during, after } = await dragLeft(page, hit)
  expect(Math.abs(after.x - during.x)).toBeLessThan(6)
})

test('가른 벌(세로홀자 첫닿자)에서 획을 끌면 끄는 동안 잉크가 따라 움직이고, 벌에 따로 준 굵기가 기본으로 덮이지 않는다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('가')}&mode=stroke&part=CH`)
  await expect(page.locator('svg [data-editor-hit="stroke"]').first()).toBeAttached({ timeout: 60_000 })
  // `닿는 글자` 줄에서 `가`를 고르고, 획에 처음 손대면 뜨는 트리의 연결 토글을 끄고 적용해 세로홀자 벌을 가른다.
  await page.locator('[data-testid="review-propagation-card"][data-char="가"] button').first().click()
  const hit = page.locator('svg [data-editor-hit="stroke"]').first()
  await hit.dispatchEvent('pointerdown')
  await page.getByTestId('variant-gate-toggle').click()
  await page.getByTestId('variant-gate-apply').click()
  await expect(page.getByTestId('variant-gate')).toHaveCount(0, { timeout: 10_000 })
  // 벌의 굵기를 기본과 다르게 준다(자소가 통째로 골라진 채).
  await page.getByTestId('jamo-stroke-style').click()
  await page.getByTestId('jamo-stroke-thickness').fill('150')
  await expect(page.getByTestId('jamo-stroke-thickness-value')).toHaveText('150%')
  await page.getByTestId('jamo-stroke-style').click()
  const thick = await inkOf(page)

  const { during, after } = await dragLeft(page, hit)
  expect(Math.abs(after.x - during.x)).toBeLessThan(6)
  // 굵기가 기본(100%)으로 돌아가면 잉크가 3분의 1쯤 준다.
  expect(after.count).toBeGreaterThan(thick.count * 0.9)
  await page.getByTestId('jamo-stroke-style').click()
  await expect(page.getByTestId('jamo-stroke-thickness-value')).toHaveText('150%')
})
