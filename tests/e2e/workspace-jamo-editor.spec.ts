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
  await expect(page.getByRole('region', { name: '보정 문장' })).toBeVisible()
  const editor = page.getByRole('region', { name: /완성 글자 편집/ })
  await expect(editor).toBeVisible()
  // 셸 안에는 조절판이 없다. 옮기기는 캔버스에서 직접 하고 아래에는 도구 줄이 온다.
  await expect(page.getByRole('group', { name: '선택한 글자 형태를 조절하는 트랙패드' })).toHaveCount(0)
  await expect(page.getByTestId('jamo-stroke-tools')).toBeVisible()

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

  // 문장에서 다른 글자를 고르면 그 글자의 레이아웃(기본 상태)으로 돌아간다.
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
  await page.getByTestId('jamo-stroke-cta').click()
  await expect(page.getByRole('region', { name: '염 완성 글자 편집' })).toBeVisible()
})
