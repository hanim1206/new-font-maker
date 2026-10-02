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

// 스타일 화면에서 추출 단추를 뺐다(2026-09-27). 대시보드 다운로드를 대기 층 · 완료 페이지로 잇는 다음 단계에서 그쪽 입구로 되살린다.
test.fixme('폰트 탭: 대기 층에 퍼센트가 오르고, 끝나면 완료 페이지가 진짜 폰트로 템플릿을 그린다', async ({ page }) => {
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
  await expect(done.getByRole('heading', { level: 1 })).toHaveText('대기체')
  await expect(done).toHaveAttribute('data-font-loaded', 'true', { timeout: 20_000 })
  // 브라우저에 등록된 이름은 버전이 붙는다.
  expect(await page.evaluate(() => document.fonts.check("16px '대기체-1.001'") || [...document.fonts].some((face) => face.family.startsWith('대기체-')))).toBe(true)
  await expect(done).toContainText('1.00')

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

test.fixme('자소 화면에서 끝나면 화면은 안 바뀌고 토스트의 완료 페이지 보기로 간다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/workspace/font')
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await startExport(page, '토스트체')
  await expect(page.getByTestId('font-export-overlay')).toBeVisible()
  // 대기 층은 내용만 덮는다. 머리 `‹`로 대시보드에 나가 레이아웃으로 들어간다.
  await page.getByTestId('workspace-font-home').click()
  await page.getByTestId('dashboard-layout').click()
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

test('대시보드 카드에서 받으면 완료 페이지로 가고, ‹ 내 폰트로 대시보드에 돌아온다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/dashboard')
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await page.getByTestId('dashboard-font-download').click()
  await page.getByTestId('dashboard-font-download-name').fill('카드체')
  await page.getByTestId('dashboard-font-download-confirm').click()
  await expect(page.getByTestId('dashboard-font-download')).toBeDisabled()

  expect((await downloadPromise).suggestedFilename()).toBe('카드체.otf')
  await expect(page).toHaveURL(/\/workspace\/font\/export$/, { timeout: 60_000 })
  await expect(page.getByTestId('font-export-done')).toBeVisible()
  // 폰트 탭이 아니라 대시보드에서 왔으니 머리 `‹`는 내 폰트로.
  const back = page.getByTestId('workspace-back')
  await expect(back).toHaveAttribute('aria-label', '내 폰트(으)로')
  await back.click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('완료 페이지의 한임에게 자랑하기는 제보 판을 잘했어요 · 문구로 연다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/dashboard')
  // 주사위로 바꾼 카드 문장이 완료 페이지에 그대로 온다.
  await page.getByRole('button', { name: '예시 문장 바꾸기' }).click()
  // 문장 카드가 `section`으로 바뀌어(19516b8) 옛 `article p[aria-label]` 셀렉터가 낡았다. 라벨 뒤 안내 꼬리는 뗀다.
  const sentenceLabel = await page.getByTestId('dashboard-sentence').getAttribute('aria-label')
  const sentence = sentenceLabel?.split(' — ')[0] ?? ''
  expect(sentence).not.toBe('포도밭에 햇살이 쏟아졌다')
  expect(sentence.length).toBeGreaterThan(0)
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await page.getByTestId('dashboard-font-download').click()
  await page.getByTestId('dashboard-font-download-name').fill('자랑체')
  await page.getByTestId('dashboard-font-download-confirm').click()
  await downloadPromise
  const done = page.getByTestId('font-export-done')
  await expect(done).toBeVisible({ timeout: 60_000 })
  await expect(done.getByRole('heading', { level: 1 })).toHaveText('자랑체')
  await expect(done).toHaveAttribute('data-font-loaded', 'true', { timeout: 20_000 })
  await expect(done).toContainText(sentence!)

  await done.getByTestId('font-export-brag').click()
  await expect(page.getByTestId('report-sheet')).toBeVisible()
  await expect(page.getByTestId('report-tag-praise')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('report-draft')).toHaveValue(/^자랑체 1\.\d+ 만들었어요!$/)
})
