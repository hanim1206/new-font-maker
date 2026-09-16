import { expect, test } from '@playwright/test'

/** 자소 탭(/workspace/jamo)에 문장 획 편집 캔버스가 셸 안에서 동작하는지 본다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('자소 탭은 셸 안에서 문장·캔버스·트랙패드를 보여주고 획을 선택한다', async ({ page }) => {
  await page.goto('/workspace/jamo')

  const nav = page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })
  await expect(nav.getByRole('link', { name: '자소' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: '보정 문장' })).toBeVisible()
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  await expect(page.getByRole('group', { name: '선택한 글자 형태를 조절하는 트랙패드' })).toBeVisible()

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
  const trackpadBox = await page.getByRole('group', { name: '선택한 글자 형태를 조절하는 트랙패드' }).boundingBox()
  const navBox = await nav.boundingBox()
  expect(trackpadBox && navBox && trackpadBox.y + trackpadBox.height <= navBox.y + 1).toBe(true)

  // 획 두 번 눌러 선택(첫 클릭 = 부품, 둘째 = 획).
  const focusSvg = editor.locator('svg')
  const strokeHit = focusSvg.locator('[data-editor-hit="stroke"]').first()
  await strokeHit.dispatchEvent('pointerdown')
  await strokeHit.dispatchEvent('pointerdown')
  await expect(focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)

  // 문장에서 다른 글자를 고르면 캔버스가 바뀐다.
  await page.getByRole('region', { name: '보정 문장' }).getByRole('button', { name: '별 편집' }).click()
  await expect(page.getByRole('region', { name: '별 완성 글자 편집' })).toBeVisible()
})
