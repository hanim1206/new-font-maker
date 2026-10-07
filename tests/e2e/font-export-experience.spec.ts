import { expect, test, type Page } from '@playwright/test'

/**
 * 추출 대기와 완료 페이지. 입구는 대시보드 폰트 카드의 다운로드뿐이다 — 받는 동안 원 안 퍼센트 → 완료 페이지(진짜 폰트 · 다시 받기).
 * 다른 화면으로 나가 있다가 끝나면 화면은 안 바뀌고 토스트 링크만.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

async function startCardExport(page: Page, name: string): Promise<void> {
  await page.getByTestId('dashboard-font-download').click()
  await page.getByTestId('dashboard-font-download-name').fill(name)
  await page.getByTestId('dashboard-font-download-confirm').click()
}

test('대시보드 카드: 취소하면 아무 일도 없고, 받는 동안 원 안 퍼센트가 오르고, 완료 페이지에서 다시 받는다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/dashboard')
  const button = page.getByTestId('dashboard-font-download')
  const sheet = page.getByRole('dialog', { name: '폰트 다운로드' })

  // 처음엔 폰트 이름이 채워져 있다. 취소하면 시트만 닫히고 추출은 돌지 않는다.
  await button.click()
  await expect(page.getByTestId('dashboard-font-download-name')).toHaveValue('내 폰트')
  await sheet.getByRole('button', { name: '취소' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(button).toHaveAttribute('data-state', 'idle')
  await expect(button).toBeEnabled()

  // 퍼센트는 마지막 조립 단계에서 99에 선다. 부하가 크면 첫 값을 읽을 때 이미 99라 "첫 값보다 오른다"를 기다리면 끝나지 않는다.
  // 그래서 받는 동안 단추에 뜬 퍼센트를 브라우저 안에서 전부 적어 두고, 끝난 뒤 그 기록이 올랐는지 본다.
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="dashboard-font-download"]')!
    const seen: number[] = []
    ;(window as unknown as { __exportPercents: number[] }).__exportPercents = seen
    const record = () => { const value = Number(target.textContent?.replace('%', '')); if (target.textContent?.includes('%') && value !== seen.at(-1)) seen.push(value) }
    new MutationObserver(record).observe(target, { subtree: true, childList: true, characterData: true })
  })
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await startCardExport(page, '대기체')
  await expect(button).toBeDisabled()

  expect((await downloadPromise).suggestedFilename()).toBe('대기체.otf')
  const percents = await page.evaluate(() => (window as unknown as { __exportPercents: number[] }).__exportPercents)
  expect(percents.length).toBeGreaterThan(1)
  expect(percents).toEqual([...percents].sort((a, b) => a - b))
  expect(percents.at(-1)).toBe(99)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('font-export-family-name-v1'))).toBe('대기체')
  await expect(page).toHaveURL(/\/workspace\/font\/export$/, { timeout: 60_000 })
  const done = page.getByTestId('font-export-done')
  await expect(done).toBeVisible()
  await expect(done.getByRole('heading', { level: 1 })).toHaveText('대기체')
  await expect(done).toHaveAttribute('data-font-loaded', 'true', { timeout: 20_000 })

  // 다시 받기 = 같은 파일.
  const again = page.waitForEvent('download')
  await done.getByTestId('font-export-redownload').click()
  expect((await again).suggestedFilename()).toBe('대기체.otf')

  // 새로고침하면 파일이 메모리에 없어 완료 페이지에 머물지 않는다.
  await page.goto('/workspace/font/export')
  await expect(page).toHaveURL(/\/workspace\/font$/)
})

test('대시보드 카드에서 받기 시작하고 레이아웃으로 가면, 끝나도 화면은 그대로이고 토스트의 완료 페이지 보기로 간다', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/dashboard')
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 })
  await startCardExport(page, '토스트체')
  await expect(page.getByTestId('dashboard-font-download')).toBeDisabled()
  await page.getByTestId('dashboard-layout').click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)

  expect((await downloadPromise).suggestedFilename()).toBe('토스트체.otf')
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

test('완료 페이지의 자랑하기는 제보 판을 잘했어요 · 문구로 연다', async ({ page }) => {
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
