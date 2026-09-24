import { expect, test } from '@playwright/test'

/** 자소 탭(/workspace/jamo)에 문장 획 편집 캔버스가 셸 안에서 동작하는지 본다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('자소 탭 획 편집은 셸 안에서 문장·캔버스·도구 줄을 보여주고 획을 선택한다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')

  // 하단 내비는 없다. 화면 이동은 머리 `…` 메뉴 안에 있다.
  await page.getByRole('button', { name: '주 메뉴' }).click()
  const nav = page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })
  await expect(nav.getByRole('link', { name: '자소' })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')
  // 획 편집에서는 문장 줄이 위로 접히고 `닿는 글자` 줄만 남는다.
  await expect(page.locator('section[aria-label="보정 문장"]')).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByRole('region', { name: '보정 문장' })).toHaveCount(0)
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  // 옮기기는 캔버스에서 직접 하고, 아래 도구 줄에 섬세한 편집용 트랙패드가 늘 함께 있다.
  await expect(page.getByTestId('jamo-stroke-tools')).toBeVisible()
  await expect(page.getByTestId('jamo-stroke-trackpad')).toBeVisible()

  // 실행취소·다시실행은 셸 머리에만 있다.
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '마지막 편집 되돌리기' })).toHaveCount(0)

  // 화면이 세로로 넘치지 않는다.
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.horizontal).toBeLessThanOrEqual(0)
  expect(overflow.vertical).toBeLessThanOrEqual(0)
  const trackpadBox = await page.getByTestId('jamo-stroke-tools').boundingBox()
  const bottom = page.viewportSize()?.height ?? 0
  expect(trackpadBox && trackpadBox.y + trackpadBox.height <= bottom + 1).toBe(true)
  // 도구 줄 아래 `완료`도 화면 안에 들어온다(하단 내비가 없어 바닥이 곧 화면 끝이다).
  const doneBox = await page.getByTestId('jamo-stroke-done').boundingBox()
  expect(doneBox && trackpadBox && doneBox.y >= trackpadBox.y + trackpadBox.height - 1 && doneBox.y + doneBox.height <= bottom + 1).toBe(true)

  // 획 두 번 눌러 선택(첫 클릭 = 부품, 둘째 = 획).
  const focusSvg = editor.locator('svg')
  const strokeHit = focusSvg.locator('[data-editor-hit="stroke"]').first()
  await strokeHit.dispatchEvent('pointerdown')
  await strokeHit.dispatchEvent('pointerdown')
  await expect(focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)

  // 트랙패드로 끌면 고른 획이 옮겨지고 바로 저장된다(실행 취소가 켜진다).
  const pad = await page.getByTestId('jamo-stroke-trackpad').boundingBox()
  expect(pad).not.toBeNull()
  await page.mouse.move(pad!.x + 100, pad!.y + pad!.height / 2)
  await page.mouse.down()
  await page.mouse.move(pad!.x + 130, pad!.y + pad!.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

  // `완료`로 레이아웃에 돌아오면 문장 줄이 다시 내려오고, 거기서 다른 글자를 고르면 그 글자의 레이아웃이다.
  await page.getByTestId('jamo-stroke-done').click()
  await page.getByRole('region', { name: '보정 문장' }).getByRole('button', { name: '별 편집' }).click()
  await expect(page.getByRole('region', { name: '별 레이아웃 수정' })).toBeVisible()
})

test('검수 격자에서 글자를 열면 자소 탭 레이아웃 모드로 그 글자가 열리고, 획 고치기를 누르면 같은 글자 획 편집이다', async ({ page }) => {
  await page.goto('/workspace/review?char=%EC%97%BC')
  await page.getByTestId('review-pick').click()
  await expect(page).toHaveURL(/\/workspace\/jamo\?char=%EC%97%BC&mode=layout&solo=1$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
  // 문장에 없던 글자라 문장 앞에 붙는다.
  await expect(page.getByRole('region', { name: '보정 문장' }).getByRole('button', { name: '염 편집' })).toHaveAttribute('aria-current', 'true')
  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  await expect(page.getByRole('region', { name: '염 완성 글자 편집' })).toBeVisible()
})

test('획 편집 `원` 버튼은 지금 자모 상자에 닫힌 타원 획을 하나 넣고 그 획을 고른다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  const circle = page.getByTestId('jamo-stroke-add-circle')
  // 획을 고르기 전에는 넣을 자모가 없어 꺼져 있다.
  await expect(circle).toBeDisabled()

  const focusSvg = editor.locator('svg')
  const strokes = focusSvg.locator('[data-editor-hit="stroke"]')
  const strokeHit = strokes.first()
  await strokeHit.dispatchEvent('pointerdown')
  await strokeHit.dispatchEvent('pointerdown')
  const before = await strokes.count()

  await expect(circle).toBeEnabled()
  await circle.click()
  await expect(strokes).toHaveCount(before + 1)
  await expect(focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

  // 단추가 한 줄 늘어도 도구 줄과 `완료`가 화면 안에 들어온다.
  const tools = await page.getByTestId('jamo-stroke-tools').boundingBox()
  const done = await page.getByTestId('jamo-stroke-done').boundingBox()
  const bottom = page.viewportSize()?.height ?? 0
  expect(tools && done && done.y >= tools.y + tools.height - 1 && done.y + done.height <= bottom + 1).toBe(true)
  await page.screenshot({ path: 'test-results/stroke-add-circle.png' })
})
