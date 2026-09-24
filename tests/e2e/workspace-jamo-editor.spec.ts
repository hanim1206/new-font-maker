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
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
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
  const add = page.getByRole('toolbar', { name: '획 편집 도구' }).getByRole('button', { name: '획 추가' })
  const circle = page.getByTestId('jamo-stroke-add-circle')
  // 획을 고르기 전에는 넣을 자모가 없어 꺼져 있다.
  await expect(add).toBeDisabled()

  const focusSvg = editor.locator('svg')
  const strokes = focusSvg.locator('[data-editor-hit="stroke"]')
  const strokeHit = strokes.first()
  await strokeHit.dispatchEvent('pointerdown')
  await strokeHit.dispatchEvent('pointerdown')
  const before = await strokes.count()

  // `추가`를 누르면 선 · 원 · 사각이 아래로 펼쳐지고, 고르면 접힌다.
  await add.click()
  await expect(add).toHaveAttribute('aria-expanded', 'true')
  await circle.click()
  await expect(circle).toBeHidden()
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

test('ㅇ처럼 이미 꽉 찬 원이 있으면 `원`은 가운데로 작게 넣어 겹치지 않는다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%97%BC&mode=stroke')
  const editor = page.getByRole('region', { name: '염 완성 글자 편집' })
  await expect(editor).toBeVisible({ timeout: 20_000 })
  const focusSvg = editor.locator('svg')
  const strokeHit = focusSvg.locator('[data-editor-hit="stroke"]').first()
  await strokeHit.dispatchEvent('pointerdown')
  await strokeHit.dispatchEvent('pointerdown')
  const selected = focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')
  const original = await selected.boundingBox()

  await page.getByRole('button', { name: '획 추가' }).click()
  await page.getByTestId('jamo-stroke-add-circle').click()
  await expect(selected).toHaveCount(1)
  const added = await selected.boundingBox()
  expect(original && added && added.width < original.width * .9 && added.height < original.height * .9).toBe(true)
  await page.screenshot({ path: 'test-results/stroke-add-circle-ieung.png' })
})

test('획 편집 `사각`은 닫힌 네 점 획을 넣고, `복제`는 고른 획을 조금 비켜 하나 더 만든다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  const tools = page.getByRole('toolbar', { name: '획 편집 도구' })
  const focusSvg = editor.locator('svg')
  const strokes = focusSvg.locator('[data-editor-hit="stroke"]')
  const selected = focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')
  await strokes.first().dispatchEvent('pointerdown')
  await strokes.first().dispatchEvent('pointerdown')
  const before = await strokes.count()

  // 획을 잡으면 복제가 있고, 점에만 쓰는 곡선 · 끊기는 없다.
  await expect(tools.getByRole('button', { name: '획 복제' })).toBeVisible()
  await expect(tools.getByRole('button', { name: '곡선화' })).toHaveCount(0)
  await expect(tools.getByRole('button', { name: '선 끊기' })).toHaveCount(0)

  // 펼쳐도 `추가`는 제자리다. 도구 칸이 스크롤되어 위로 밀리지 않는다.
  const addButton = tools.getByRole('button', { name: '획 추가' })
  const addBefore = await addButton.boundingBox()
  await addButton.click()
  await expect(page.getByTestId('jamo-stroke-add-square')).toBeVisible()
  await page.waitForTimeout(400)
  expect((await addButton.boundingBox())?.y).toBe(addBefore?.y)
  await page.screenshot({ path: 'test-results/stroke-add-menu-open.png' })
  await page.getByTestId('jamo-stroke-add-square').click()
  await expect(strokes).toHaveCount(before + 1)
  await expect(selected).toHaveCount(1)
  const square = await selected.boundingBox()

  await tools.getByRole('button', { name: '획 복제' }).click()
  await expect(strokes).toHaveCount(before + 2)
  const copy = await selected.boundingBox()
  expect(square && copy && Math.abs(copy.width - square.width) < 2 && copy.x > square.x && copy.y > square.y).toBe(true)
  await page.screenshot({ path: 'test-results/stroke-add-square-duplicate.png' })
})

test('획 편집 `초기화`는 한 번 묻고 고친 자소를 프리셋으로 되돌리고, 되돌리기 한 번이면 고친 모양이 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  const tools = page.getByRole('toolbar', { name: '획 편집 도구' })
  const reset = page.getByTestId('jamo-stroke-reset')
  const strokes = editor.locator('svg [data-editor-hit="stroke"]')
  await strokes.first().dispatchEvent('pointerdown')
  await strokes.first().dispatchEvent('pointerdown')
  const before = await strokes.count()
  // 손대기 전에는 프리셋 그대로라 꺼져 있다.
  await expect(reset).toBeDisabled()

  await tools.getByRole('button', { name: '획 복제' }).click()
  await expect(strokes).toHaveCount(before + 1)
  await expect(reset).toBeEnabled()
  // 누르면 먼저 묻는다. 취소하면 그대로다.
  const confirm = page.getByTestId('jamo-stroke-reset-confirm')
  await reset.click()
  await expect(confirm).toContainText('폰트 프리셋으로 되돌릴까요?')
  await page.screenshot({ path: 'test-results/stroke-reset-confirm.png' })
  await confirm.getByRole('button', { name: '취소' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(strokes).toHaveCount(before + 1)
  await reset.click()
  await page.getByTestId('jamo-stroke-reset-ok').click()
  await expect(confirm).toHaveCount(0)
  await expect(strokes).toHaveCount(before)
  await expect(reset).toBeDisabled()
  await expect(editor.locator('svg [data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(strokes).toHaveCount(before + 1)
})
