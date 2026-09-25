import { expect, test } from '@playwright/test'

/** 편집 단축키(피드백 31): ⌘Z · ⇧⌘Z · Ctrl+Z · Ctrl+Y는 머리 단추와 같고, Delete는 `삭제`, Esc는 빈 곳 누르기와 같다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('획을 Delete로 지우고, ⌘Z로 되돌리고, ⇧⌘Z로 다시 지우고, Ctrl+Z로 또 되돌린다. Esc는 선택을 푼다', async ({ page }) => {
  await page.goto('/workspace/jamo?mode=stroke')
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible({ timeout: 20_000 })
  const svg = editor.locator('svg')
  const strokes = svg.locator('[data-editor-hit="stroke"]')
  const selected = svg.locator('[data-editor-hit="stroke"][data-selected="true"]')
  const undo = page.getByRole('button', { name: '형태 편집 실행 취소' })

  // 획 두 번 눌러 선택(첫 = 부품, 둘째 = 획).
  const hit = strokes.first()
  await hit.dispatchEvent('pointerdown')
  await hit.dispatchEvent('pointerdown')
  await expect(selected).toHaveCount(1)
  const count = await strokes.count()

  await page.keyboard.press('Delete')
  await expect(strokes).toHaveCount(count - 1)
  await expect(undo).toBeEnabled()

  await page.keyboard.press('Meta+z')
  await expect(strokes).toHaveCount(count)
  await expect(undo).toBeDisabled()

  await page.keyboard.press('Meta+Shift+z')
  await expect(strokes).toHaveCount(count - 1)
  await page.keyboard.press('Control+z')
  await expect(strokes).toHaveCount(count)
  await page.keyboard.press('Control+y')
  await expect(strokes).toHaveCount(count - 1)
  await page.keyboard.press('Control+z')
  await expect(strokes).toHaveCount(count)

  // Esc = 빈 곳 누르기.
  await strokes.first().dispatchEvent('pointerdown')
  await strokes.first().dispatchEvent('pointerdown')
  await expect(selected).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(selected).toHaveCount(0)
  // 고른 게 없으면 Delete는 아무것도 지우지 않는다.
  await page.keyboard.press('Delete')
  await expect(strokes).toHaveCount(count)
})

test.describe('문장 입력란', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('단축키는 입력칸 것(⌘A 범위가 문장 줄에 칠해진다), 복사 · 붙여넣기 단추, 붙인 것은 ⌘Z로 되돌린다', async ({ page }) => {
    await page.goto('/workspace/jamo')
    await expect(page.getByRole('region', { name: /레이아웃 수정/ })).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('sentence-sheet-toggle').click()
    const input = page.getByRole('textbox', { name: '문장 입력' })
    const sentence = await input.inputValue()
    // 폰 흉내라 펼쳐도 자판을 안 연다. 글자를 누르면 입력칸에 커서가 간다.
    await page.locator('section[aria-label="보정 문장"] [data-char-index]').first().click()
    await expect(input).toBeFocused()

    await page.keyboard.press('Meta+a')
    await expect(page.locator('[data-sheet-selected]')).toHaveCount([...sentence].length)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-sheet-selected]')).toHaveCount(0)

    await page.getByTestId('sentence-sheet-copy').click()
    await expect(page.getByTestId('sentence-sheet-copy')).toHaveAttribute('aria-label', '복사함')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sentence)

    await page.evaluate(() => navigator.clipboard.writeText('붙인'))
    await page.getByTestId('sentence-sheet-paste').click()
    await expect(input).toHaveValue(`${sentence}붙인`)
    // 입력칸 안이면 ⌘Z는 셸의 형태 되돌리기가 아니라 글자 되돌리기.
    await page.keyboard.press('Meta+z')
    await expect(input).toHaveValue(sentence)
    await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeDisabled()
  })
})
