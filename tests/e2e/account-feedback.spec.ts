import { expect, test } from '@playwright/test'

/**
 * 계정 페이지와 한임에게 의견(게이트 꺼진 개발 서버 — 의견은 이 기기 localStorage).
 * 아바타 → 계정 페이지 → 의견 쓰기 → 보낸 목록 → 대화. 한임 답은 서버(관리자 API)라 여기선 저장소에 직접 넣어 빨간 점만 본다.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

test('아바타를 누르면 계정 페이지, 거기서 의견을 보내면 보낸 목록 · 대화에 뜬다', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByTestId('dashboard-account').click({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByTestId('account-page')).toContainText('베타 참여자')
  await expect(page.getByTestId('account-font-count')).toHaveText('1 / 3개')

  await page.getByTestId('account-feedback').click()
  await expect(page).toHaveURL(/\/account\/feedback$/)
  await expect(page.getByTestId('feedback-send')).toBeDisabled()
  await page.getByTestId('feedback-draft').fill('꽤 첫 ㄱ이 ㅗ랑 부딪혀요')
  await page.getByTestId('feedback-send').click()
  await expect(page.getByTestId('feedback-draft')).toHaveValue('')
  await expect(page.getByTestId('feedback-thread')).toHaveCount(1)
  await expect(page.getByTestId('feedback-thread')).toContainText('보냈어요')

  // 보낸 자리는 계정 페이지 앞 화면(대시보드)이다.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('font-maker-local-feedback-v1') ?? '[]'))
  expect(stored[0].context.path).toBe('/dashboard')

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
