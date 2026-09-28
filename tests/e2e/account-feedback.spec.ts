import { expect, test } from '@playwright/test'

/**
 * 계정 페이지와 한임에게 의견(게이트 꺼진 개발 서버 — 의견은 이 기기 localStorage).
 * 머리 제보 단추 → 판에서 보내기 → 계정 페이지 → 내가 보낸 의견(목록만) → 대화. 한임 답은 서버(관리자 API)라 여기선 저장소에 직접 넣어 빨간 점만 본다.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('머리 제보 단추로 보내면 내가 보낸 의견 · 대화에 뜬다', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByTestId('report-open').click({ timeout: 20_000 })
  const sheet = page.getByTestId('report-sheet')
  await expect(sheet.getByTestId('report-context')).toContainText('대시보드')
  await expect(page.getByTestId('report-send')).toBeDisabled()
  await page.getByTestId('report-tag-odd').click()
  await expect(sheet.getByTestId('report-context')).toContainText('이상해 보여요')
  await page.getByTestId('report-draft').fill('꽤 첫 ㄱ이 ㅗ랑 부딪혀요')
  await page.getByTestId('report-send').click()
  await expect(sheet).toContainText('보냈어요')

  // 보낸 자리: 누른 화면 · 화면 이름 · 폰트 id · 갈래.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('font-maker-local-feedback-v1') ?? '[]'))
  expect(stored[0].context).toMatchObject({ path: '/dashboard', screen: '대시보드', tag: 'odd' })
  expect(stored[0].context.fontId).toEqual(expect.any(String))

  await sheet.getByRole('button', { name: '닫기' }).click()
  await page.getByTestId('dashboard-account').click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByTestId('account-page')).toContainText('베타 참여자')
  await expect(page.getByTestId('account-font-count')).toHaveText('1 / 3개')

  await page.getByTestId('account-feedback').click()
  await expect(page).toHaveURL(/\/account\/feedback$/)
  await expect(page.getByTestId('feedback-page')).toContainText('내가 보낸 의견')
  await expect(page.getByTestId('feedback-page').locator('textarea')).toHaveCount(0)
  await expect(page.getByTestId('feedback-thread')).toHaveCount(1)
  await expect(page.getByTestId('feedback-thread')).toContainText('대시보드 · 보냈어요')

  await page.getByTestId('feedback-thread').click()
  await expect(page.getByTestId('feedback-thread-page')).toContainText('꽤 첫 ㄱ이 ㅗ랑 부딪혀요')
  await page.getByTestId('feedback-reply-draft').fill('꽈도 그래요')
  await page.getByRole('button', { name: '보내기' }).click()
  await expect(page.getByTestId('feedback-thread-page')).toContainText('꽈도 그래요')
})

test('안 본 한임 답이 있으면 아바타 · 계정 행에 빨간 점, 대화를 열면 사라진다', async ({ page }) => {
  await page.goto('/dashboard')
  await page.evaluate(() => {
    const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
    localStorage.setItem('font-maker-local-feedback-v1', JSON.stringify([
      { id: 't1', threadId: 't1', author: 'friend', body: '폰트 받기가 오래 걸려요', context: null, createdAt: at(60), readAt: null },
      { id: 't2', threadId: 't1', author: 'hanim', body: '고쳐 볼게요!', context: null, createdAt: at(5), readAt: null },
    ]))
  })
  await page.reload()
  await expect(page.getByTestId('dashboard-account').getByLabel('새 답장')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('dashboard-account').click()
  await expect(page.getByTestId('account-feedback').getByLabel('새 답장')).toBeVisible()
  await page.getByTestId('account-feedback').click()
  await expect(page.getByTestId('feedback-thread')).toContainText('답장 왔어요')
  await page.getByTestId('feedback-thread').click()
  await expect(page.getByTestId('feedback-thread-page')).toContainText('고쳐 볼게요!')
  await page.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByTestId('feedback-thread')).toContainText('답장 있어요')
  await page.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByTestId('account-feedback').getByLabel('새 답장')).toHaveCount(0)
})
