import { expect, test } from '@playwright/test'

/** 검수 글자 화면: 수치는 접혀 있고, 기준선을 옮기면 배치 Δ는 층 카드로, 형태 Δ는 '이 자모로 올리기'로 퍼진다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('수치 영역은 접혀 있고 캔버스·범위 칩은 그대로 보인다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-canvas')).toBeVisible()
  const numbers = page.getByTestId('review-numbers')
  await expect(numbers).not.toHaveAttribute('open', '')
  await expect(page.getByTestId('review-values')).toBeHidden()
  await numbers.locator('summary').click()
  await expect(page.getByTestId('review-values')).toBeVisible()
  // 편집 전에는 카드 없음, 범위 칩 잠김. 자모 칩은 없다(배치는 층 속성).
  const propagation = page.getByTestId('review-propagation')
  await expect(propagation).toContainText('기준선을 옮기면 여기 보입니다')
  await expect(propagation.getByRole('button', { name: '이 층' })).toBeDisabled()
  await expect(propagation.getByRole('button', { name: '이 자모' })).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-card')).toHaveCount(0)
})

test('중심 rail(배치)을 옮기면 같은 층 카드 8장에 Δ가 얹히고 범위를 바꿀 수 있다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('group', { name: '편집할 기준선' }).getByRole('button', { name: '바깥기둥 중심' }).click()
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
  const firstBatch = await cards.allInnerTexts()

  await page.getByTestId('review-propagation-next').click()
  await expect.poll(async () => (await cards.allInnerTexts()).join()).not.toBe(firstBatch.join())

  await propagation.getByRole('button', { name: '전체' }).click()
  await expect(cards).toHaveCount(8)

  // 복원하면 카드도 사라진다.
  await page.getByRole('button', { name: '모델 rail로 복원' }).click()
  await expect(cards).toHaveCount(0)
})

test('시작 rail(형태)을 옮기면 층 카드가 아니라 이 자모로 올리기가 나오고, 누르면 같은 홀자 카드가 뜬다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('group', { name: '편집할 기준선' }).getByRole('button', { name: '보 시작' }).click()
  await page.getByTestId('ruler-strip').focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('review-edit-status')).toContainText('1개 변경')

  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(0)
  await expect(page.getByTestId('review-propagation').getByRole('button', { name: '이 층' })).toBeDisabled()
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
  await page.getByRole('group', { name: '편집할 기준선' }).getByRole('button', { name: '바깥기둥 중심' }).click()
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
