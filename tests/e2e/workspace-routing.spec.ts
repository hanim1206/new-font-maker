import { expect, test, type Page } from '@playwright/test'

/**
 * 얇은 라우터: 자소 ↔ 검수를 오갈 때 앱을 새로 불러오지 않는다.
 * 그래서 되돌리기 기록이 남고, 브라우저 뒤로 가기도 화면만 바꾼다.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

const storedStyle = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('font-maker-global-style') ?? '{}').state?.style)
// 새로고침이 있었는지 보는 표식. 페이지가 다시 뜨면 사라진다.
const mark = (page: Page) => page.evaluate(() => { (window as unknown as { __routeMark?: number }).__routeMark = 1 })
const marked = (page: Page) => page.evaluate(() => (window as unknown as { __routeMark?: number }).__routeMark === 1)

/** 하단 탭으로 화면을 옮긴다. */
async function openMenuAndGo(page: Page, name: string): Promise<void> {
  await page.getByTestId('workspace-tabs').getByRole('link', { name }).click()
}

test('자소 → 검수 → 자소를 오가도 되돌리기 기록이 남는다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('한')}`)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await mark(page)

  // 기록 한 줄: 폰트 탭에서 둥글기 60.
  await openMenuAndGo(page, '폰트')
  const panel = page.getByRole('region', { name: '글로벌 스타일 설정' })
  await panel.getByRole('tab', { name: '획 스타일' }).click()
  const roundness = panel.getByTestId('style-roundness')
  await roundness.fill('60')
  await roundness.dispatchEvent('pointerup', { pointerId: 1 })
  expect(await storedStyle(page)).toMatchObject({ strokeStyle: { roundness: 0.6 } })
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

  // 검수로. 주소는 바뀌고 페이지는 그대로다.
  await openMenuAndGo(page, '검수')
  await expect(page).toHaveURL(/\/workspace\/review$/)
  await expect(page.getByTestId('workspace-tabs').getByRole('link', { name: '검수' })).toHaveAttribute('aria-current', 'page')
  expect(await marked(page)).toBe(true)

  // 다시 자소로. 되돌리기가 살아 있고, 누르면 둥글기가 0으로 돌아온다.
  await openMenuAndGo(page, '자소')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  expect(await marked(page)).toBe(true)
  const undo = page.getByRole('button', { name: '형태 편집 실행 취소' })
  await expect(undo).toBeEnabled()
  await undo.click()
  expect((await storedStyle(page)).strokeStyle).not.toHaveProperty('roundness')
  await expect(undo).toBeDisabled()
})

test('브라우저 뒤로 가기는 화면만 바꾸고, 검수 칸은 그 글자의 자소 탭을 연다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await mark(page)

  await openMenuAndGo(page, '검수')
  await expect(page).toHaveURL(/\/workspace\/review$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  expect(await marked(page)).toBe(true)

  // 검수 칸을 열면 `?char=`로 들어와 그 글자가 잡히고, 주소의 쿼리는 열린 뒤 지워진다.
  await openMenuAndGo(page, '검수')
  await page.getByRole('button', { name: '각 열기' }).click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByRole('region', { name: '각 레이아웃 수정' })).toBeVisible()
  expect(await marked(page)).toBe(true)
})

test('보선을 옮긴 채 검수로 가면 저장을 묻고, 저장하지 않고 계속하면 검수로 간다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('한')}`)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await mark(page)

  // 홀자 상자를 켜고 바깥기둥 중심 보선을 방향키로 옮긴다. 하단 바가 선다.
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const medial = page.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][data-part^="JU"]').first()
  if ((await medial.getAttribute('aria-pressed')) !== 'true') await medial.dispatchEvent('pointerdown')
  await expect(medial).toHaveAttribute('aria-pressed', 'true')
  const handle = page.getByTestId('review-canvas').getByRole('button', { name: '바깥기둥 중심 선택' })
  await handle.focus()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('jamo-stroke-cta-bar')).toBeVisible()

  await openMenuAndGo(page, '검수')
  const dialog = page.getByTestId('layout-leave-dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await dialog.getByTestId('layout-leave-discard').click()
  await expect(page).toHaveURL(/\/workspace\/review$/)
  expect(await marked(page)).toBe(true)
})
