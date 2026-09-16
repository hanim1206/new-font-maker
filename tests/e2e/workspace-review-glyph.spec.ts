import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** 검수 글자 화면: 수치 패널은 없고, 잡은 rail의 이 레이아웃(같은 문맥) 카드가 늘 떠 있다. 기준선을 옮기면 배치 Δ는 카드에, 형태 Δ는 '이 자모로 올리기'로 같은 자모 카드에 얹힌다. */

/** 유니코드 음절의 홀자 번호(ㅏ=0 … ㅣ=20). */
const medialIndexOf = (name: string) => Math.floor(((name.codePointAt(0)! - 0xac00) % 588) / 28)
/** 받침 번호(0 = 없음). */
const finalIndexOf = (name: string) => (name.codePointAt(0)! - 0xac00) % 28
/** 세로 홀자 계열(ㅏㅐㅑㅒㅓㅔㅕㅖㅣ) + 받침 있음 = 멈과 같은 문맥. */
const sameContextAs멈 = (name: string) => [0, 1, 2, 3, 4, 5, 6, 7, 20].includes(medialIndexOf(name)) && finalIndexOf(name) > 0

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

/** 캔버스 손잡이를 키보드로 골라 rail을 선택한다. 칩 줄도 자 도구도 없다. 초점은 손잡이에 남아 방향키로 옮긴다. */
async function selectRail(page: Page, label: string) {
  const handle = page.getByTestId('review-canvas').getByRole('button', { name: `${label} 선택` })
  await handle.focus()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
}
const resetButton = (page: Page) => page.getByTestId('review-reset')

test('수치 패널은 없고, 편집 전에도 이 레이아웃 카드가 Δ 없이 떠 있다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-canvas')).toBeVisible()
  await expect(page.getByTestId('review-numbers')).toHaveCount(0)
  // 모델이 오면 첫 rail이 잡히고, 같은 문맥(세로 홀자+받침) 카드 8장이 Δ 없이 뜬다. 범위 칩은 이 레이아웃·전체 둘, 이 자모는 없다.
  const propagation = page.getByTestId('review-propagation')
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8, { timeout: 20_000 })
  await expect(propagation).toContainText('기준선을 옮기면 Δ가 얹힙니다')
  await expect(propagation.getByRole('button', { name: '이 레이아웃', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(propagation.getByRole('button', { name: '전체', exact: true })).toBeEnabled()
  await expect(propagation.getByRole('button', { name: '이 자모', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  await expect.poll(() => cards.first().getAttribute('data-touched')).toBeNull()
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every(sameContextAs멈)).toBe(true)
  expect(new Set(names.map(medialIndexOf)).size).toBeGreaterThan(1)
})

test('중심 rail(배치)을 옮기면 이 레이아웃 카드 8장에 Δ가 얹히고 전체로 넓힐 수 있다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(resetButton(page)).toContainText('1개 변경')

  const propagation = page.getByTestId('review-propagation')
  await expect(propagation).toContainText('배치 Δ')
  await expect(propagation.getByTestId('review-propagation-deltas')).toContainText('바깥기둥 중심')
  await expect(page.getByTestId('review-propagation-shape')).toHaveCount(0)
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toHaveAttribute('data-mode', 'layout')
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 기본 범위 = 이 레이아웃: 세로 홀자+받침 글자만, 홀자는 섞인다.
  await expect(propagation.getByRole('button', { name: '이 레이아웃', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(propagation).toContainText('홀자 계열·받침 유무가 같은 글자')
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every(sameContextAs멈)).toBe(true)
  expect(new Set(names.map(medialIndexOf)).size).toBeGreaterThan(1)
  const firstBatch = await cards.allInnerTexts()

  await page.getByTestId('review-propagation-next').click()
  await expect.poll(async () => (await cards.allInnerTexts()).join()).not.toBe(firstBatch.join())

  await propagation.getByRole('button', { name: '전체', exact: true }).click()
  await expect(cards).toHaveCount(8)
  await expect.poll(async () => (await cards.locator('figcaption b').allInnerTexts()).some((name) => !sameContextAs멈(name))).toBe(true)

  // 복원해도 카드는 그대로, Δ만 빠진다.
  await resetButton(page).click()
  await expect(cards).toHaveCount(8)
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  await expect.poll(() => cards.first().getAttribute('data-touched')).toBeNull()
})

test('시작 rail(형태)을 옮기면 카드에 Δ가 안 얹히고 이 자모로 올리기가 나오고, 누르면 같은 자모 카드에 형태 Δ가 얹힌다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectRail(page, '보 시작')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(resetButton(page)).toContainText('1개 변경')

  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toHaveAttribute('data-mode', 'layout')
  await expect.poll(() => cards.first().getAttribute('data-touched')).toBeNull()
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  const shape = page.getByTestId('review-propagation-shape')
  await expect(shape.getByTestId('review-propagation-shape-deltas')).toContainText('보 시작')
  await shape.getByTestId('review-propagation-promote').click()
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toHaveAttribute('data-mode', 'shape')
  await expect(page.getByTestId('review-propagation').getByRole('button', { name: '이 레이아웃', exact: true })).toBeDisabled()
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 형태는 자모 몫 → 카드가 같은 홀자 ㅓ 글자로 바뀐다.
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every((name) => medialIndexOf(name) === 4)).toBe(true)
})

/** 캔버스에서 기준선을 손으로 끌면 모델 자리 → 다른 기준선 → 격자 순으로 걸린다. 방향키엔 안 걸린다. */
test('기준선 드래그는 모델 자리와 격자에 탁 걸리고 방향키는 안 걸린다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectRail(page, '바깥기둥 중심')
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const handle = canvas.locator('[data-rail-handle][aria-pressed="true"]')
  const snap = page.getByTestId('review-snap')
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  // 세로 rail 손잡이는 위쪽 여백에서 잡는다. 캔버스 가운데는 가로 rail 손잡이가 덮고 있다.
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height

  // 멀리 끌었다가 모델 자리 근처(+2u)로 돌아오면 모델에 붙는다.
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.06), y, { steps: 6 })
  await expect(page.getByTestId('review-delta-label')).toHaveCount(1)
  await page.mouse.move(pxOf(x1 + 0.002), y, { steps: 4 })
  // 모델에 붙으면 Δ 0 → 수치 없음, 캔버스 위 스냅 표지만.
  await expect(snap).toHaveText('탁 · 모델')
  await expect(page.getByTestId('review-delta-label')).toHaveCount(0)
  // 모델(≈0.75)에서 멀어져 격자 13/16(0.8125)이나 그 옆 기준선에 걸린다.
  await page.mouse.move(pxOf(0.815), y, { steps: 8 })
  await page.mouse.up()
  await expect(snap).toBeVisible()
  expect(['grid', 'rail']).toContain(await snap.getAttribute('data-kind'))

  // 방향키 1u 이동은 스냅을 푼다.
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await expect(snap).toHaveCount(0)
})

/** 기준값에서 옮긴 만큼 캔버스에 띠와 수치가 칠해지고, 복원하면 사라진다. */
test('기준선을 옮기면 변화 띠와 Δ 수치가 보이고 복원하면 사라진다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  await expect(resetButton(page)).toBeDisabled()
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)
  await expect(page.getByTestId('review-delta-label')).toHaveText('+20u')
  // 다른 rail을 고르면 띠는 그 rail 것만. 안 옮긴 rail이면 띠 없음, 수치는 작게 남는다.
  await selectRail(page, '보 중심')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  await expect(page.getByTestId('review-delta-label')).toHaveAttribute('data-active', 'false')
  await selectRail(page, '바깥기둥 중심')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)
  await resetButton(page).click()
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  await expect(resetButton(page)).toBeDisabled()
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
  // 상자도 켠 부품만 진하다.
  await expect(canvas.locator('[data-testid="review-fit-box"][data-kind="component"]').first()).toHaveAttribute('data-active', 'true')
  await expect(canvas.locator('[data-testid="review-fit-box"][data-kind="medial"]').first()).toHaveAttribute('data-active', 'false')
})
