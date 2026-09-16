import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** 검수 글자 화면: 수치는 접혀 있고, 기준선을 옮기면 배치 Δ는 층 카드로, 형태 Δ는 '이 자모로 올리기'로 퍼진다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

/** 캔버스 손잡이를 키보드로 골라 rail을 선택한다. 칩 줄은 없다. */
async function selectRail(page: Page, label: string) {
  const handle = page.getByTestId('review-canvas').getByRole('button', { name: `${label} 선택` })
  await handle.focus()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
}

test('수치 영역은 접혀 있고 캔버스·범위 칩은 그대로 보인다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-canvas')).toBeVisible()
  const numbers = page.getByTestId('review-numbers')
  await expect(numbers).not.toHaveAttribute('open', '')
  await expect(page.getByTestId('review-values')).toBeHidden()
  await numbers.locator('summary').click()
  await expect(page.getByTestId('review-values')).toBeVisible()
  // 편집 전에는 카드 없음, 범위 칩 잠김.
  const propagation = page.getByTestId('review-propagation')
  await expect(propagation).toContainText('기준선을 옮기면 여기 보입니다')
  await expect(propagation.getByRole('button', { name: '이 자모', exact: true })).toBeDisabled()
  await expect(page.getByTestId('review-propagation-card')).toHaveCount(0)
})

test('중심 rail(배치)을 옮기면 같은 홀자 카드 8장에 Δ가 얹히고 범위를 넓힐 수 있다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectRail(page, '바깥기둥 중심')
  await page.getByTestId('ruler-strip').focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('review-edit-status')).toContainText('1개 변경')

  const propagation = page.getByTestId('review-propagation')
  await expect(propagation).toContainText('배치 Δ')
  await expect(propagation.getByTestId('review-propagation-deltas')).toContainText('바깥기둥 중심')
  await expect(page.getByTestId('review-propagation-shape')).toHaveCount(0)
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toHaveAttribute('data-mode', 'layout')
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 기본 범위 = 이 자모: ㅓ 글자만.
  await expect(propagation.getByRole('button', { name: '이 자모', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every((name) => Math.floor(((name.codePointAt(0)! - 0xac00) % 588) / 28) === 4)).toBe(true)
  const firstBatch = await cards.allInnerTexts()

  await page.getByTestId('review-propagation-next').click()
  await expect.poll(async () => (await cards.allInnerTexts()).join()).not.toBe(firstBatch.join())

  await propagation.getByRole('button', { name: '이 층' }).click()
  await expect(cards).toHaveCount(8)
  await expect.poll(async () => new Set((await cards.locator('figcaption b').allInnerTexts()).map((name) => Math.floor(((name.codePointAt(0)! - 0xac00) % 588) / 28))).size).toBeGreaterThan(1)

  // 복원하면 카드도 사라진다.
  await page.getByRole('button', { name: '모델 rail로 복원' }).click()
  await expect(cards).toHaveCount(0)
})

test('시작 rail(형태)을 옮기면 층 카드가 아니라 이 자모로 올리기가 나오고, 누르면 같은 홀자 카드가 뜬다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectRail(page, '보 시작')
  await page.getByTestId('ruler-strip').focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('review-edit-status')).toContainText('1개 변경')

  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(0)
  await expect(page.getByTestId('review-propagation').getByRole('button', { name: '이 자모', exact: true })).toBeDisabled()
  const shape = page.getByTestId('review-propagation-shape')
  await expect(shape.getByTestId('review-propagation-shape-deltas')).toContainText('보 시작')
  await shape.getByTestId('review-propagation-promote').click()
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toHaveAttribute('data-mode', 'shape')
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 같은 홀자 ㅓ 글자만.
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every((name) => Math.floor(((name.codePointAt(0)! - 0xac00) % 588) / 28) === 4)).toBe(true)
})

/** 캔버스에서 기준선을 손으로 끌면 모델 자리 → 다른 기준선 → 격자 순으로 걸린다. 방향키엔 안 걸린다. */
test('기준선 드래그는 모델 자리와 격자에 탁 걸리고 방향키는 안 걸린다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectRail(page, '바깥기둥 중심')
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const handle = canvas.locator('[data-rail-handle][aria-pressed="true"]')
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  // 세로 rail 손잡이는 위쪽 여백에서 잡는다. 캔버스 가운데는 가로 rail 손잡이가 덮고 있다.
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height

  // 멀리 끌었다가 모델 자리 근처(+2u)로 돌아오면 모델에 붙는다.
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.06), y, { steps: 6 })
  await expect(page.getByTestId('review-rail-value')).not.toContainText(`Δ 0.0`)
  await page.mouse.move(pxOf(x1 + 0.002), y, { steps: 4 })
  await expect(page.getByTestId('review-snap')).toHaveText('탁 · 모델')
  await expect(page.getByTestId('review-rail-value')).toContainText('Δ 0.0')
  // 모델(≈0.75)에서 멀어져 격자 13/16(0.8125)이나 그 옆 기준선에 걸린다.
  await page.mouse.move(pxOf(0.815), y, { steps: 8 })
  await page.mouse.up()
  const snap = page.getByTestId('review-snap')
  await expect(snap).toBeVisible()
  expect(['grid', 'rail']).toContain(await snap.getAttribute('data-kind'))

  // 방향키 1u 이동은 스냅을 푼다.
  await page.getByTestId('ruler-strip').focus()
  await page.keyboard.press('ArrowRight')
  await expect(snap).toHaveCount(0)
})

/** 부품 탭: 켠 부품 rail만 손잡이·제 색, 나머지는 회색으로 죽는다. */
test('부품 탭을 바꾸면 그 부품 rail만 잡히고 칩도 바뀐다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const tabs = page.getByTestId('review-part-tabs')
  await expect(tabs.getByRole('button')).toHaveText(['첫닿자 ㅁ', '홀자 ㅓ', '받침 ㅁ'])
  await expect(tabs.getByRole('button', { name: '홀자 ㅓ' })).toHaveAttribute('aria-pressed', 'true')
  const canvas = page.getByTestId('review-canvas')
  // 홀자 탭: 홀자 rail만 손잡이가 있고, 닿자 rail은 손잡이 없이 회색.
  await expect(canvas.locator('[data-rail-handle]').first()).toBeAttached()
  await expect(canvas.locator('[data-rail-handle^="c"]')).toHaveCount(0)
  await expect(canvas.locator('[data-rail="c0:top"]')).toHaveAttribute('data-active', 'false')
  await expect(page.getByRole('group', { name: '편집할 기준선' })).toHaveCount(0)

  await tabs.getByRole('button', { name: '첫닿자 ㅁ' }).click()
  await expect(canvas.locator('[data-rail-handle^="c0:"]')).toHaveCount(4)
  await expect(canvas.locator('[data-rail-handle]:not([data-rail-handle^="c"])')).toHaveCount(0)
  await expect(canvas.locator('[data-rail="c0:top"]')).toHaveAttribute('data-active', 'true')
  // 자 도구가 첫닿자 첫 rail로 넘어간다.
  await expect(page.getByRole('slider', { name: /첫닿자 .*변 위치/ })).toBeVisible()
  // 상자도 켠 부품만 진하다.
  await expect(canvas.locator('[data-testid="review-fit-box"][data-kind="component"]').first()).toHaveAttribute('data-active', 'true')
  await expect(canvas.locator('[data-testid="review-fit-box"][data-kind="medial"]').first()).toHaveAttribute('data-active', 'false')
})
