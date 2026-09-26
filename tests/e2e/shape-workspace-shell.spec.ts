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

test('옛 뼈대 주소는 자소 화면으로 넘어간다', async ({ page }) => {
  await page.goto('/workspace/skeleton')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('머리는 `‹`(화살표만) · 폰트 이름 · 되돌리기고 햄버거는 없다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await expect(page.getByRole('button', { name: '주 메뉴' })).toHaveCount(0)
  await expect(page.getByTestId('workspace-font-home')).toHaveAttribute('aria-label', '내 폰트로')
  await expect(page.getByTestId('workspace-font-home')).toHaveText('')
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeVisible()
  // 하단 탭은 없다 — 화면 사이 이동은 대시보드가 한다.
  await expect(page.getByTestId('workspace-tabs')).toHaveCount(0)
})

test('폰트 화면의 OTF 추출은 폰트 이름을 물은 뒤 그 이름의 OTF를 받는다', async ({ page }) => {
  test.setTimeout(180_000)
  // 폰트 화면 입구는 대시보드 `스타일`.
  await page.goto('/dashboard')
  await page.getByTestId('dashboard-style').click()
  await expect(page).toHaveURL(/\/workspace\/font$/)
  // 게이트가 꺼진 dev는 이 기기 폰트 `내 폰트`가 자동으로 만들어져 열린다.
  await expect(page.getByTestId('font-workspace').getByRole('heading', { level: 1 })).toHaveText('내 폰트')

  // OTF 추출 → 이름 창. 취소하면 아무 일도 없다.
  const dialog = page.getByTestId('font-export-dialog')
  const exportButton = page.getByTestId('font-workspace').getByRole('button', { name: /OTF/ })
  await exportButton.click()
  await expect(page.getByTestId('font-export-name')).toHaveValue('내 폰트')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(dialog).toHaveCount(0)

  // 이름을 넣고 추출하면 파일 이름이 그 이름이고, 다음에 열 때 기억한다. 도는 동안 대기 층, 끝나면 완료 페이지.
  await exportButton.click()
  await page.getByTestId('font-export-name').fill('한임체')
  const downloadPromise = page.waitForEvent('download', { timeout: 170_000 })
  await page.getByTestId('font-export-confirm').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('font-export-overlay')).toBeVisible()
  expect((await downloadPromise).suggestedFilename()).toBe('한임체.otf')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('font-export-family-name-v1'))).toBe('한임체')
  await expect(page).toHaveURL(/\/workspace\/font\/export$/)
  await expect(page.getByTestId('font-export-done')).toBeVisible()

  // 완료 페이지의 `‹`는 폰트 화면으로, 거기 `‹`는 대시보드로.
  await page.getByTestId('workspace-back').click()
  await expect(page).toHaveURL(/\/workspace\/font$/)
  await page.getByTestId('workspace-font-home').click()
  await expect(page).toHaveURL(/\/dashboard$/)
})
