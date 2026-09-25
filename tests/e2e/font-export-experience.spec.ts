import { expect, test, type Page } from '@playwright/test'

/**
 * 추출 대기와 완료 페이지. 폰트 탭에서 추출하면 대기 층(퍼센트 · 내 획 템플릿) → 완료 페이지(진짜 폰트 템플릿 · 다시 받기).
 * 다른 탭에서 끝나면 화면은 안 바뀌고 토스트 링크만.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

async function startExport(page: Page, name: string): Promise<void> {
  await page.getByTestId('font-workspace').getByRole('button', { name: /OTF/ }).click()
  await page.getByTestId('font-export-name').fill(name)
  await page.getByTestId('font-export-confirm').click()
}

test('폰트 탭: 대기 층에 퍼센트가 오르고, 끝나면 완료 페이지가 진짜 폰트로 템플릿을 그린다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/workspace/font')
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await startExport(page, '대기체')

  const overlay = page.getByTestId('font-export-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay.getByTestId('subtitle-template')).toHaveAttribute('data-mode', 'engine')
  const percent = overlay.getByTestId('font-export-percent')
  const first = Number(await percent.textContent())
  await expect.poll(async () => Number(await percent.textContent()), { timeout: 120_000 }).toBeGreaterThan(first)

  expect((await downloadPromise).suggestedFilename()).toBe('대기체.otf')
  await expect(page).toHaveURL(/\/workspace\/font\/export$/, { timeout: 60_000 })
  const done = page.getByTestId('font-export-done')
  await expect(done).toBeVisible()
  await expect(done.getByRole('heading', { level: 1 })).toHaveText('진짜 폰트가 됐어요')
  await expect(done).toHaveAttribute('data-font-loaded', 'true', { timeout: 20_000 })
  await expect(done.getByTestId('subtitle-template')).toHaveAttribute('data-mode', 'font')
  // 브라우저에 등록된 이름은 버전이 붙는다.
  expect(await page.evaluate(() => document.fonts.check("16px '대기체-1.001'") || [...document.fonts].some((face) => face.family.startsWith('대기체-')))).toBe(true)
  await expect(done).toContainText('1.00')
  await expect(done).toContainText('iPhone')

  // 다시 받기 = 같은 파일.
  const again = page.waitForEvent('download')
  await done.getByTestId('font-export-redownload').click()
  expect((await again).suggestedFilename()).toBe('대기체.otf')

  // 머리 `‹ 폰트`로 돌아가고, 새로고침하면 파일이 메모리에 없어 폰트 탭으로 넘어간다.
  await page.getByTestId('workspace-back').click()
  await expect(page).toHaveURL(/\/workspace\/font$/)
  await page.goto('/workspace/font/export')
  await expect(page).toHaveURL(/\/workspace\/font$/)
})

test('자소 탭에서 끝나면 화면은 안 바뀌고 토스트의 완료 페이지 보기로 간다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/workspace/font')
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await startExport(page, '토스트체')
  await expect(page.getByTestId('font-export-overlay')).toBeVisible()
  await page.getByTestId('workspace-tabs').getByRole('link', { name: '자소' }).click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByTestId('font-export-overlay')).toHaveCount(0)

  await downloadPromise
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  const toast = page.getByTestId('save-toast')
  await expect(toast).toContainText('OTF가 나왔어요')
  await toast.getByRole('button', { name: '완료 페이지 보기' }).click()
  await expect(page).toHaveURL(/\/workspace\/font\/export$/)
  await expect(page.getByTestId('font-export-done')).toBeVisible()
})
