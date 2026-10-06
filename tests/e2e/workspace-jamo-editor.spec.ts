import { expect, test } from '@playwright/test'

/** 자소 탭(/workspace/jamo)에 문장 획 편집 캔버스가 셸 안에서 동작하는지 본다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // 편집기 문장은 대시보드 예시 문장을 따른다. 이 파일의 글자 기대는 `별을 노래하는 마음으로`에 맞춰 있어 그 문장으로 고정한다.
  await page.addInitScript(() => { if (!localStorage.getItem('font-maker-sample-sentence')) localStorage.setItem('font-maker-sample-sentence', '별을 노래하는 마음으로') })
})

test('자소 탭 획 편집은 셸 안에서 문장·캔버스·도구 줄을 보여주고 획을 선택한다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')

  // 하단 탭은 없다. 화면 이동은 머리 `‹` → 대시보드.
  await expect(page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })).toHaveCount(0)
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
  // 하단 `완료` 줄은 없다. 레이아웃으로 돌아가는 문은 머리 `‹`.
  await expect(page.getByTestId('jamo-stroke-done')).toHaveCount(0)

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

  // 머리 `‹`로 레이아웃에 돌아오면 문장 줄이 다시 내려오고, 거기서 다른 글자를 고르면 그 글자의 레이아웃이다.
  await page.getByTestId('workspace-back').click()
  await page.getByRole('region', { name: '보정 문장' }).getByRole('button', { name: '별 편집' }).click()
  await expect(page.getByRole('region', { name: '별 레이아웃 수정' })).toBeVisible()
})

test('검수 격자에서 글자를 열면 자소 탭 레이아웃 모드로 그 글자가 열리고, 획 고치기를 누르면 같은 글자 획 편집이다', async ({ page }) => {
  await page.goto('/workspace/review?char=%EC%97%BC')
  await page.locator(`[data-testid="corpus-cell"][data-codepoint="${'염'.codePointAt(0)}"]`).click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
  // 문장에 없던 글자라 문장 앞에 붙는다.
  await expect(page.getByRole('region', { name: '보정 문장' }).getByRole('button', { name: '염 편집' })).toHaveAttribute('aria-current', 'true')
  // 첫닿자 획 편집은 단독 칸(ㅇ)으로 먼저 열리고, `닿는 글자` 줄 맨 앞(단독 칸 다음)에 들고 온 음절이 선다.
  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  await expect(page.getByRole('region', { name: 'ㅇ 완성 글자 편집' })).toBeVisible()
  await page.getByTestId('touched-glyph-row').locator('[data-testid="review-propagation-card"][data-char="염"] button').click()
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

  // 단추가 한 줄 늘어도 도구 줄이 화면 안에 들어온다.
  const tools = await page.getByTestId('jamo-stroke-tools').boundingBox()
  const bottom = page.viewportSize()?.height ?? 0
  expect(tools && tools.y + tools.height <= bottom + 1).toBe(true)
  await page.screenshot({ path: 'test-results/stroke-add-circle.png' })
})

test('획 편집 `복사`한 획은 다른 자소에 `붙여넣기`로 같은 자리에 들어간다 (ㅁ → ㅣ)', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%AF%B8&mode=stroke')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  const tools = page.getByRole('toolbar', { name: '획 편집 도구' })
  const strokes = editor.locator('svg [data-editor-hit="stroke"]')
  const selected = editor.locator('svg [data-editor-hit="stroke"][data-selected="true"]')
  await expect(strokes.first()).toBeVisible()
  const before = await strokes.count()

  // 복사한 게 없으면 붙여넣기 단추가 없다.
  await expect(page.getByTestId('jamo-stroke-paste')).toHaveCount(0)
  // 첫 획은 ㅁ, 마지막 획은 ㅣ.
  const pick = async (index: number) => {
    const hit = strokes.nth(index)
    for (let tries = 0; tries < 4 && await hit.getAttribute('data-selected') !== 'true'; tries += 1) await hit.dispatchEvent('pointerdown')
    await expect(hit).toHaveAttribute('data-selected', 'true')
  }
  await pick(0)
  await tools.getByRole('button', { name: '획 복사' }).click()
  await pick(before - 1)
  await page.getByTestId('jamo-stroke-paste').click()
  await expect(strokes).toHaveCount(before + 1)
  await expect(selected).toHaveCount(1)
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()
  await page.screenshot({ path: 'test-results/stroke-copy-paste.png' })
})

test('획을 안 잡고 자소만 잠긴 채 `복사`하면 그 자소 획이 다 담기고, `붙여넣기`는 한꺼번에 비켜 더한다 (빱의 받침 ㅂ)', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%B9%B1&mode=stroke&part=JO')
  const canvas = page.getByTestId('focus-canvas')
  await expect(canvas).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  const tools = page.getByRole('toolbar', { name: '획 편집 도구' })
  const strokes = editor.locator('svg [data-editor-hit="stroke"]')
  const selected = editor.locator('svg [data-editor-hit="stroke"][data-selected="true"]')
  await expect(strokes.first()).toBeVisible()
  // 잠긴 동안 눌리는 획은 받침 ㅂ 것뿐이다.
  const before = await strokes.count()
  expect(before).toBeGreaterThan(1)

  // 획을 잡으면 획 하나 복사, 빈 곳으로 풀면 자소 통째 복사.
  await expect(tools.getByRole('button', { name: 'ㅂ 획 모두 복사' })).toHaveCount(0)
  await canvas.dispatchEvent('pointerdown')
  await expect(selected).toHaveCount(0)
  await tools.getByRole('button', { name: 'ㅂ 획 모두 복사' }).click()
  await tools.getByRole('button', { name: '획 붙여넣기' }).click()
  // 원래 획은 그대로 두고 ㅂ 획 전부가 더해진다. 같은 자리라 겹치지 않게 비켜 놓는다.
  await expect(strokes).toHaveCount(before * 2)
  await expect(selected).toHaveCount(0)
  const paths = await strokes.evaluateAll((items) => items.map((item) => item.getAttribute('d')))
  expect(new Set(paths).size).toBe(before * 2)
  await page.screenshot({ path: 'test-results/stroke-copy-whole-jamo.png' })
  // 되돌리기 한 번이면 한꺼번에 빠진다.
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(strokes).toHaveCount(before)
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

test('획 편집 `사각`은 닫힌 네 점 획을 넣고, 같은 자소에 `복사` → `붙여넣기`하면 조금 비켜 하나 더 만든다', async ({ page }) => {
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

  // 획을 잡으면 복사가 있고, 점에만 쓰는 곡선 · 끊기는 없다.
  await expect(tools.getByRole('button', { name: '획 복사' })).toBeVisible()
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

  await tools.getByRole('button', { name: '획 복사' }).click()
  await tools.getByRole('button', { name: '획 붙여넣기' }).click()
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

  await tools.getByRole('button', { name: '획 복사' }).click()
  await tools.getByRole('button', { name: '획 붙여넣기' }).click()
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

test('획 편집 `펜`은 도구 줄을 그대로 둔 채 켜지고, 그은 획은 손을 떼면 새 획으로 저장되고, `비우기`는 기존 획만 지운다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=stroke&part=CH')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  const undo = page.getByRole('button', { name: '형태 편집 실행 취소' })
  // 긋는 자리는 지금 ㄱ이 놓인 자리로 잰다.
  const box = (await editor.locator('svg [data-stroke-id="ㄱ-1"]').first().boundingBox())!
  // 펜은 `추가`를 열면 선 · 원 · 사각 옆에 있다. 켜도 도구 줄은 그대로고 `펜`만 눌린 표시가 된다.
  await page.getByRole('button', { name: '획 추가' }).click()
  const pen = page.getByTestId('jamo-stroke-pen')
  await pen.click()
  await expect(page.getByTestId('pen-layer')).toBeVisible()
  await expect(pen).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('toolbar', { name: '획 편집 도구' })).toBeVisible()
  await expect(page.getByTestId('jamo-stroke-fit')).toBeVisible()
  // 펜이 켜진 동안은 늘 긋는다 — 획 눌림 영역이 없다.
  await expect(editor.locator('svg [data-editor-hit="stroke"]')).toHaveCount(0)

  // 기존 ㄱ 안쪽에 작은 ㄱ 꼴 한 획.
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y })
  const draw = async () => {
    const start = at(.25, .35)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (const [x, y] of [[.4, .35], [.55, .34], [.7, .34], [.71, .5], [.71, .65], [.71, .8]]) {
      const point = at(x, y)
      await page.mouse.move(point.x, point.y, { steps: 4 })
    }
    // 긋는 중에도 저장될 굵기로 바로 보인다.
    await expect(page.getByTestId('pen-live')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.getByTestId('pen-live')).toHaveCount(0)
  }
  await expect(undo).toBeDisabled()
  await draw()
  // 손을 떼면 바로 저장된다. ㄱ 역할 자리는 차 있으니 새 획은 자유 획이고, 이번에 그은 획만 제 색으로 덧그려진다.
  await expect(undo).toBeEnabled()
  await expect(page.getByTestId('pen-fresh')).toHaveCount(1)
  // 닿자는 인식 상태를 안 띄운다 — 역할이 있든 없든 결과가 같다.
  await expect(page.getByTestId('jamo-pen-status')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/pen-added.png' })

  // `비우기`는 펜이 켜진 동안 옅은 기존 획만 지운다. 그은 획이 남아 빈 ㄱ 역할을 받고, 펜은 켜진 채다.
  await page.getByTestId('jamo-stroke-clear').click()
  await expect(page.getByTestId('pen-fresh')).toHaveCount(1)
  await expect(page.getByTestId('jamo-stroke-clear')).toBeDisabled()
  await expect(page.getByTestId('pen-layer')).toBeVisible()
  await undo.click()
  await expect(page.getByTestId('jamo-stroke-clear')).toBeEnabled()

  // 무르기는 되돌리기로. 펜은 켜진 채다.
  await undo.click()
  await expect(undo).toBeDisabled()
  await expect(page.getByTestId('pen-fresh')).toHaveCount(0)
  await expect(page.getByTestId('pen-layer')).toBeVisible()

  // 다시 긋고 `펜`을 누르면 꺼진다. 기존 획과 새 획이 둘 다 잡히는 획으로 남는다.
  await draw()
  await pen.click()
  await expect(page.getByTestId('pen-layer')).toHaveCount(0)
  await expect(editor.locator('svg [data-stroke-id="ㄱ-1"]')).not.toHaveCount(0)
  await expect(editor.locator('svg [data-stroke-id="pen-ㄱ-1"]')).not.toHaveCount(0)
})

test('획을 세로부 칸에만 둔 ㅒ · ㅖ도 획 편집에서 획을 고른다', async ({ page }) => {
  // 베타 제보(09-28): ㅒ · ㅖ는 그려지는데 획 편집에서 누를 획이 없었다. 둘만 획을 `verticalStrokes`에 둔다.
  for (const char of ['얘', '예']) {
    await page.goto(`/workspace/jamo?char=${encodeURIComponent(char)}&mode=stroke&part=JU`)
    const editor = page.getByRole('region', { name: /완성 글자 편집/ })
    await expect(editor).toBeVisible()
    // 홀자가 잠긴 채 열린다. 눌리는 획은 홀자 네 획.
    const strokes = editor.locator('svg [data-editor-hit="stroke"]')
    await expect(strokes, char).toHaveCount(4)
    const hit = strokes.last()
    for (let tries = 0; tries < 4 && await hit.getAttribute('data-selected') !== 'true'; tries += 1) await hit.dispatchEvent('pointerdown')
    await expect(hit, char).toHaveAttribute('data-selected', 'true')
    // 트랙패드로 옮기면 저장된다(실행 취소가 켜진다).
    const pad = await page.getByTestId('jamo-stroke-trackpad').boundingBox()
    await page.mouse.move(pad!.x + 100, pad!.y + pad!.height / 2)
    await page.mouse.down()
    await page.mouse.move(pad!.x + 130, pad!.y + pad!.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()
  }
})

test('트랙패드 왼쪽 크기 막대를 올리면 고른 자소가 통째로 커지고, 손을 떼면 손잡이가 가운데로 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  const focusSvg = editor.locator('svg')
  const strokeHit = focusSvg.locator('[data-editor-hit="stroke"]').first()
  await strokeHit.dispatchEvent('pointerdown')
  await strokeHit.dispatchEvent('pointerdown')
  await expect(focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)

  const slider = page.getByTestId('jamo-scale-slider')
  await expect(slider).toBeVisible()
  await expect(slider).toHaveAttribute('aria-disabled', 'false')
  // 중심선 크기(getBBox)로 잰다. 화면 상자는 겨냥용 굵기가 얹혀 비율이 흐려진다.
  const centerlines = () => focusSvg.locator('[data-editor-hit="stroke"]').evaluateAll((elements) => elements.map((element) => {
    const box = (element as SVGGraphicsElement).getBBox()
    return { width: box.width, height: box.height }
  }))
  const before = await centerlines()
  const track = await slider.boundingBox()
  expect(track).toBeTruthy()

  // 가운데에서 위로 끝까지 = 130%. 끄는 동안 배율이 보인다.
  await page.mouse.move(track!.x + track!.width / 2, track!.y + track!.height / 2)
  await page.mouse.down()
  await page.mouse.move(track!.x + track!.width / 2, track!.y - 20, { steps: 8 })
  await expect(slider).toHaveAttribute('aria-valuenow', '130')
  await expect(slider.locator('output')).toHaveText('130%')
  await page.mouse.up()

  // 놓으면 저장되고(실행 취소 켜짐) 손잡이는 가운데(100%)로 돌아온다.
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  // 고른 자소(첫 자소의 두 획)는 1.3배, 다른 자소 획은 그대로. 굵기는 안 바뀐다.
  const after = await centerlines()
  expect(after[0].width).toBeCloseTo(before[0].width * 1.3, 1)
  expect(after[0].height).toBeCloseTo(before[0].height * 1.3, 1)
  expect(after.slice(2)).toEqual(before.slice(2))
})

test('자소를 두 손가락으로 통째로 키워도 획이 글자 칸 밖으로 나가지 않고, 가로 · 세로 같은 비율로 멈춘다', async ({ page }) => {
  test.setTimeout(120_000)
  for (const [syllable, part] of [['오', 'CH'], ['한', 'JO']] as const) {
    await page.goto(`/workspace/jamo?char=${encodeURIComponent(syllable)}&mode=stroke&part=${part}`)
    const strokes = page.locator('[data-editor-hit="stroke"]')
    await expect(strokes.first()).toBeAttached({ timeout: 60_000 })
    // 첫닿자는 단독 칸으로 열린다. 줄에서 그 음절을 눌러 글자 안에서 본다.
    if (part === 'CH') await page.locator(`[data-testid="review-propagation-card"][data-char="${syllable}"] [data-testid="review-propagation-open"]`).first().click()
    await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
    const box = () => strokes.first().evaluate((element) => { const b = (element as SVGGraphicsElement).getBBox(); return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height, width: b.width, height: b.height } })
    const before = await box()
    // 빈 곳을 눌러 선택을 풀면 잠긴 자소 전체가 잡힌다.
    const canvas = (await page.getByTestId('focus-canvas').boundingBox())!
    await page.touchscreen.tap(canvas.x + 6, canvas.y + 6)
    const pad = page.locator('[role="group"][aria-label*="트랙패드"]')
    await expect(pad).toHaveAttribute('data-whole', 'true')
    // 조절판에서 두 손가락을 크게 벌린다(두 배까지 요청).
    const area = (await pad.boundingBox())!
    const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    const client = await page.context().newCDPSession(page)
    const fingers = (gap: number) => [{ x: center.x - gap, y: center.y, id: 1 }, { x: center.x + gap, y: center.y, id: 2 }]
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(30) })
    for (let step = 1; step <= 10; step += 1) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(30 + 12 * step) })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => (await box()).width, { message: syllable }).toBeGreaterThan(before.width * 1.05)
    const after = await box()
    // 글자 칸은 0–100, 중심선은 두께 절반(3.5) 안쪽까지. 전에는 위아래로 칸 밖(−5 · 101.6)까지 나갔다.
    expect(after.left, syllable).toBeGreaterThanOrEqual(3.5 - 0.01)
    expect(after.right, syllable).toBeLessThanOrEqual(96.5 + 0.01)
    expect(after.top, syllable).toBeGreaterThanOrEqual(3.5 - 0.01)
    expect(after.bottom, syllable).toBeLessThanOrEqual(96.5 + 0.01)
    expect(after.width / before.width, syllable).toBeCloseTo(after.height / before.height, 2)
  }
})

test('캔버스에서 획 · 점을 멀리 끌어도 글자 칸 밖으로 나가지 않는다 — 얇은 칸의 ㅡ · ㅣ와 곡선 핸들까지', async ({ page }) => {
  test.setTimeout(120_000)
  const open = async (syllable: string, part: string, inSyllable = false) => {
    await page.goto(`/workspace/jamo?char=${encodeURIComponent(syllable)}&mode=stroke&part=${part}`)
    await expect(page.locator('[data-editor-hit="stroke"]').first()).toBeAttached({ timeout: 60_000 })
    if (inSyllable) await page.locator(`[data-testid="review-propagation-card"][data-char="${syllable}"] [data-testid="review-propagation-open"]`).first().click()
    await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  }
  const boxOf = (id: string) => page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`).evaluate((element) => { const b = (element as SVGGraphicsElement).getBBox(); return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height } })
  const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let step = 1; step <= 8; step += 1) await page.mouse.move(from.x + dx * step / 8, from.y + dy * step / 8)
    await page.mouse.up()
  }
  const centerOf = async (selector: string, nth = 0) => { const b = (await page.locator(selector).nth(nth).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  // 글자 칸은 0–100. 두께는 획 방향과 직각으로만 퍼지니, 그 축만 두께 절반(3.5) 안쪽이고 진행 방향은 칸 끝(0 · 100)까지 간다.
  const inside = (box: { left: number; right: number; top: number; bottom: number }, label: string, margin = { x: 3.5, y: 3.5 }) => {
    expect(box.left, label).toBeGreaterThanOrEqual(margin.x - 0.01)
    expect(box.right, label).toBeLessThanOrEqual(100 - margin.x + 0.01)
    expect(box.top, label).toBeGreaterThanOrEqual(margin.y - 0.01)
    expect(box.bottom, label).toBeLessThanOrEqual(100 - margin.y + 0.01)
  }

  // 얇은 칸의 줄기: 저장 좌표가 넓힌 칸 비율이라 한계도 그 칸에서 재야 멈춘다(전에는 위로 −25, 왼쪽으로 −16까지 나갔다).
  // ㅡ는 가로가 진행 방향(가로 여유 0), ㅣ는 세로가 진행 방향(세로 여유 0).
  for (const [syllable, id, margin] of [['으', 'ㅡ-1', { x: 0, y: 3.5 }], ['이', 'ㅣ-1', { x: 3.5, y: 0 }]] as const) {
    await open(syllable, 'JU')
    const before = await boxOf(id)
    await drag(await centerOf(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`), -260, -300)
    await expect.poll(async () => JSON.stringify(await boxOf(id)), { message: syllable }).not.toBe(JSON.stringify(before))
    inside(await boxOf(id), `${syllable} ↖`, margin)
    await drag(await centerOf(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`), 500, 600)
    inside(await boxOf(id), `${syllable} ↘`, margin)
    // 진행 방향으로는 두께 여유 없이 칸 끝(0 · 100) 가까이 닿는다 — 굵은 굵기에서 노토가 잉크를 두는 자리까지 편집하는 길.
    // ㅡ의 가로 끝자리는 보선(fit rail)이 쥐고 있어 획 편집에서 안 움직인다. 그래서 ㅣ의 세로로만 본다.
    // 대각으로 끌면 다른 자소와의 간격 붙잡기가 두 축을 같이 멈추니, 진행 축만 두 번 끌어서 본다.
    if (id === 'ㅣ-1') {
      for (let pull = 0; pull < 2; pull += 1) await drag(await centerOf(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`), 0, -320)
      expect((await boxOf(id)).top, `${syllable} 칸 머리`).toBeLessThanOrEqual(1)
      for (let pull = 0; pull < 3; pull += 1) await drag(await centerOf(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`), 0, 320)
      const nearEnd = await boxOf(id)
      expect(nearEnd.bottom, `${syllable} 칸 끝`).toBeGreaterThanOrEqual(99)
      inside(nearEnd, `${syllable} 칸 끝 뒤`, margin)
    }
  }

  // 곡선의 점을 구석으로 끌면 딸려 가는 핸들이 칸 끝에서 멈춘다. 핸들이 칸 밖으로 나가면 캔버스에 가려져 못 잡는다.
  await open('오', 'CH', true)
  const hit = page.locator('[data-editor-hit="stroke"][data-stroke-id="ㅇ-circle"]')
  for (let tap = 0; tap < 2; tap += 1) { await hit.dispatchEvent('pointerdown'); await hit.dispatchEvent('pointerup') }
  const points = page.locator('[data-editor-point="hit"]')
  await expect(points).toHaveCount(4)
  const corner = await centerOf('[data-editor-point="hit"]', 3)
  await page.mouse.click(corner.x, corner.y)
  await expect(page.locator('[data-editor-handle-hit]')).toHaveCount(2)
  await drag(corner, 300, -400)
  const handles = await page.locator('[data-editor-handle-hit]').evaluateAll((elements) => elements.map((element) => ({ x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')) })))
  expect(handles).toHaveLength(2)
  for (const handle of handles) inside({ left: handle.x, right: handle.x, top: handle.y, bottom: handle.y }, '핸들')
  inside(await boxOf('ㅇ-circle'), 'ㅇ 잉크')
})

test('캔버스 `크게`를 켜면 조절판 · `닿는 글자` 줄이 비키고 캔버스가 남은 자리를 채운다. 켠 채 끈 획은 저장되고, 끄면 처음 크기로 돌아온다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('이')}&mode=stroke&part=JU`)
  const stroke = page.locator('[data-editor-hit="stroke"][data-stroke-id="ㅣ-1"]')
  await expect(stroke).toBeAttached({ timeout: 60_000 })
  const canvas = page.getByTestId('focus-canvas')
  await expect(canvas).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const toggle = page.getByTestId('canvas-big-toggle')
  const small = (await canvas.boundingBox())!
  await expect(page.getByTestId('jamo-stroke-trackpad')).toBeVisible()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  // 조절판은 안 그리지만 도구 줄은 남는다 — 캔버스 아래 가로 한 줄, 화면 안.
  await expect(page.getByTestId('jamo-stroke-trackpad')).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '획 편집 도구' })).toBeVisible()
  const big = (await canvas.boundingBox())!
  expect(big.width).toBeGreaterThan(small.width)
  // 세로로 긴 화면에선 정사각형을 풀고 높이까지 채운다.
  expect(big.height).toBeGreaterThan(big.width)
  const slot = (await page.getByTestId('jamo-stroke-tool-slot').boundingBox())!
  expect(slot.y).toBeGreaterThanOrEqual(big.y + big.height)
  expect(slot.y + slot.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1)
  const overflow = await page.evaluate(() => ({ horizontal: document.documentElement.scrollWidth - window.innerWidth, vertical: document.documentElement.scrollHeight - window.innerHeight }))
  expect(overflow.horizontal).toBeLessThanOrEqual(0)
  expect(overflow.vertical).toBeLessThanOrEqual(0)

  // 켠 채 캔버스에서 획을 끌면 옮겨지고 바로 저장된다.
  const xOf = () => stroke.evaluate((element) => (element as SVGGraphicsElement).getBBox().x)
  const beforeX = await xOf()
  const at = (await stroke.boundingBox())!
  const from = { x: at.x + at.width / 2, y: at.y + at.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(from.x - 60 * step / 8, from.y)
  await page.mouse.up()
  await expect.poll(xOf).toBeLessThan(beforeX)
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

  // 끄면 조절판이 돌아오고 캔버스는 처음 크기 · 정사각형이다.
  await toggle.click()
  await expect(page.getByTestId('jamo-stroke-trackpad')).toBeVisible()
  const back = (await canvas.boundingBox())!
  expect(Math.round(back.width)).toBe(Math.round(small.width))
  expect(Math.round(back.height)).toBe(Math.round(small.height))

  // 켠 채 머리 `‹`로 레이아웃에 나가면 꺼지고, 셸은 다시 480 기둥이다.
  await page.setViewportSize({ width: 820, height: 1180 })
  await toggle.click()
  await expect.poll(async () => (await page.locator('main > div').first().boundingBox())!.width).toBe(820)
  await page.getByTestId('workspace-back').click()
  await expect(page.getByTestId('canvas-big-toggle')).toHaveCount(0)
  await expect.poll(async () => (await page.locator('main > div').first().boundingBox())!.width).toBe(480)
})
