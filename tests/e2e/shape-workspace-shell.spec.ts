import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const resetMarker = 'shape-workspace-e2e-storage-reset'
    if (sessionStorage.getItem(resetMarker) === null) {
      localStorage.clear()
      sessionStorage.setItem(resetMarker, 'done')
    }
  })
})

test('옛 화면 주소(현황 · 원형 · 조합별 결과)는 자소 탭으로 넘어가고 잘못된 workspace 경로는 숨기지 않는다', async ({ page }) => {
  for (const path of ['/workspace/jamos', '/workspace/jamo/master', '/workspace/jamo/result?char=가']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/workspace\/jamo$/)
  }

  await page.goto('/workspace/not-a-screen')
  await expect(page.getByRole('heading', { name: '작업 화면을 찾을 수 없어요' })).toBeVisible()
  await expect(page.getByText('잘못된 주소를 문장 보정 화면으로 숨기지 않았습니다.')).toBeVisible()
  await expect(page.getByRole('link', { name: '자소 탭으로 이동' })).toHaveAttribute('href', '/workspace/jamo')
})

test('뼈대 탭은 없고 옛 뼈대 주소는 자소 탭으로 넘어간다', async ({ page }) => {
  await page.goto('/workspace/skeleton')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await page.getByRole('button', { name: '주 메뉴' }).click()
  const nav = page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })
  await expect(nav.getByRole('link', { name: '자소' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link')).toHaveText(['자소', '검수'])
  await expect(nav.getByText('뼈대')).toHaveCount(0)
})

test('하단 내비는 없고 검수는 머리 메뉴로 가며, 메뉴의 OTF 추출은 폰트 이름을 물은 뒤 그 이름의 OTF를 받는다', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/workspace/jamo')
  const more = page.getByRole('button', { name: '주 메뉴' })
  const nav = page.getByRole('navigation', { name: '프로젝트 주 내비게이션' })
  // 닫힌 메뉴 안에만 있으므로 화면 아래를 차지하지 않는다.
  await expect(nav).toBeHidden()

  // OTF 추출 → 이름 창. 취소하면 아무 일도 없다.
  const dialog = page.getByTestId('font-export-dialog')
  const exportButton = page.getByTestId('workspace-more-menu').getByRole('button', { name: /OTF/ })
  await more.click()
  await exportButton.click()
  await expect(page.getByTestId('font-export-name')).toHaveValue('FontMaker')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(dialog).toHaveCount(0)

  // 이름을 넣고 추출하면 파일 이름이 그 이름이고, 다음에 열 때 기억한다.
  await more.click()
  await exportButton.click()
  await page.getByTestId('font-export-name').fill('한임체')
  const downloadPromise = page.waitForEvent('download', { timeout: 170_000 })
  await page.getByTestId('font-export-confirm').click()
  await expect(dialog).toHaveCount(0)
  expect((await downloadPromise).suggestedFilename()).toBe('한임체.otf')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('font-export-family-name-v1'))).toBe('한임체')

  await more.click()
  await nav.getByRole('link', { name: '검수' }).click()
  await expect(page).toHaveURL(/\/workspace\/review$/)
})
