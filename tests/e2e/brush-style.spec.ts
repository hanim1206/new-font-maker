import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('원형·납작형·네모형 붓촉을 전역 미리보기와 이력에 적용한다', async ({ page }) => {
  const focusSvg = page.getByRole('region', { name: /완성 글자 편집/ }).locator('svg')
  const strokeHit = focusSvg.locator('[data-editor-hit="stroke"]').first()
  await strokeHit.dispatchEvent('pointerdown', { pointerId: 1, button: 0 })
  await strokeHit.dispatchEvent('pointerdown', { pointerId: 2, button: 0 })
  await expect(focusSvg.locator('[data-editor-point="visible"]').first()).toBeVisible()
  await expect(focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const globalSettings = page.getByRole('region', { name: '글로벌 스타일 설정' })
  await globalSettings.getByRole('tab', { name: /획 스타일/ }).click()
  const drawer = globalSettings.getByRole('tabpanel', { name: '획 스타일' })
  await expect(drawer).toBeVisible()
  await expect(globalSettings.getByText('글자 전체 인상 설정')).toBeVisible()
  await expect(focusSvg.locator('[data-editor-point]')).toHaveCount(0)
  await expect(focusSvg.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(0)
  await expect(drawer.getByRole('radio', { name: '원형', exact: true })).toHaveAttribute('aria-checked', 'true')
  const roundMarkup = await focusSvg.innerHTML()

  await drawer.getByRole('radio', { name: '납작형', exact: true }).click()
  await expect(drawer.getByRole('slider', { name: '붓촉 납작함' })).toBeVisible()
  await expect.poll(() => focusSvg.innerHTML()).not.toBe(roundMarkup)

  const flatness = drawer.getByRole('slider', { name: '붓촉 납작함' })
  await flatness.fill('70')
  await flatness.dispatchEvent('pointerup', { pointerId: 1 })
  await expect(flatness).toHaveValue('70')

  const angle = drawer.getByRole('slider', { name: '붓촉 각도' })
  const box = await angle.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.72, box!.y + box!.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(angle).not.toHaveAttribute('aria-valuenow', '0')
  const angleValue = await angle.getAttribute('aria-valuenow')

  await drawer.getByRole('radio', { name: '네모형', exact: true }).click()
  await expect(drawer.getByRole('radio', { name: '네모형', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(angle).toHaveAttribute('aria-valuenow', angleValue!)
  await expect(flatness).toHaveValue('70')

  await page.getByRole('button', { name: '마지막 편집 되돌리기' }).click()
  await expect(drawer.getByRole('radio', { name: '납작형', exact: true })).toHaveAttribute('aria-checked', 'true')

  await page.reload()
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await page.getByRole('region', { name: '글로벌 스타일 설정' }).getByRole('tab', { name: /획 스타일/ }).click()
  await expect(page.getByRole('tabpanel', { name: '획 스타일' }).getByRole('radio', { name: '납작형', exact: true })).toHaveAttribute('aria-checked', 'true')
})

test('작은 모바일 화면에서도 획 스타일 조절판이 페이지를 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 667 })
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await page.getByRole('tab', { name: /획 스타일/ }).click()
  await page.getByRole('radio', { name: '네모형', exact: true }).click()
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.horizontal).toBeLessThanOrEqual(0)
  expect(overflow.vertical).toBeLessThanOrEqual(0)
})

test('네모형 붓촉을 적용한 OTF를 끝까지 생성한다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await page.getByRole('tab', { name: /획 스타일/ }).click()
  await page.getByRole('radio', { name: '네모형', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '현재 작업을 OTF로 추출' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.otf$/i)
  await expect(page.getByRole('button', { name: 'OTF 추출 완료' })).toBeVisible()
})
