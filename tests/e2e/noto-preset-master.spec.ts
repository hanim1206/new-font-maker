import { expect, test } from '@playwright/test'

test.describe('기존 corpus 페이지의 승인 마스터 편집', () => {
  test.describe.configure({ mode: 'parallel' })
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false })

  test('가·고·과와 다른 승인 첫닿자에서도 생성 비교를 제공한다', async ({ page }, testInfo) => {
    await page.goto('/noto-corpus-lab')
    for (const character of ['가', '고', '과', '꽈', '뽜', '화']) {
      await page.getByPlaceholder('예: 가고과너').fill(character)
      await page.getByTestId('corpus-character').click()
      await expect(page.getByTestId('preset-connection-status')).toHaveText('승인 입력 연결됨')
      await expect(page.getByTestId('preset-master-canvas')).toHaveAttribute('aria-label', `${character} 기준선 결속 마스터`)
      await expect(page.getByTestId('noto-preset-inspector')).toContainText('연결 대상 57자')
      await expect(page.getByTestId('preset-edit-status')).toContainText('변경 없음')
    }
    await page.getByTestId('noto-preset-inspector').screenshot({ path: testInfo.outputPath('approved-master.png') })
  })

  test('기준선 편집은 생성본만 바꾸며 원본과 검수 저장값을 보존한다', async ({ page }, testInfo) => {
    await page.goto('/noto-corpus-lab')
    const ink = page.getByTestId('preset-master-ink')
    await expect(ink).toBeVisible()
    const before = await ink.getAttribute('d')
    const source = await page.getByTestId('preset-source-ink').getAttribute('d')
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    const control = page.getByRole('spinbutton', { name: '기준선 위치 수치' })
    await control.fill(String(Number(await control.inputValue()) - 25))
    await expect(ink).not.toHaveAttribute('d', before!)
    await expect(page.getByTestId('preset-source-ink')).toHaveAttribute('d', source!)
    await expect(page.getByTestId('preset-edit-status')).toContainText('1개 기준선 변경')
    await page.getByLabel('수정 전 겹쳐보기').check()
    await expect(page.getByTestId('preset-before-overlay')).toBeVisible()
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(storage)
    await page.getByTestId('noto-preset-inspector').screenshot({ path: testInfo.outputPath('edited-master.png') })
    await page.getByRole('button', { name: '승인 원본으로 복원' }).click()
    await expect(ink).toHaveAttribute('d', before!)
    await page.getByRole('combobox', { name: '편집 기준선' }).selectOption('JU:outerPillar')
    await control.fill(String(Number(await control.inputValue()) + 15))
    await expect(ink).not.toHaveAttribute('d', before!)
  })

  test('자동 후보에는 생성 마스터를 대신 그리지 않는다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('너')
    await page.getByTestId('corpus-character').click()
    await expect(page.getByTestId('preset-connection-status')).toHaveText('생성 연결 대기')
    await expect(page.getByTestId('noto-preset-inspector')).toContainText('승인 당시 입력 묶음에 없는 글자')
    await expect(page.getByTestId('preset-master-canvas')).toHaveCount(0)
    await expect(page.getByTestId('corpus-outline')).toBeVisible()
  })

  test('문제 표시는 생성 연결을 차단하고 취소하면 복구한다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await expect(page.getByTestId('preset-master-canvas')).toBeVisible()
    const review = page.getByTestId('corpus-review-initial')
    await review.getByText('문제 있음', { exact: true }).click()
    await expect(page.getByTestId('preset-master-canvas')).toHaveCount(0)
    await expect(page.getByTestId('noto-preset-inspector')).toContainText('문제 표시')
    await review.getByText('검수 취소', { exact: true }).click()
    await expect(page.getByTestId('preset-master-canvas')).toBeVisible()
  })

  test('가이드 토글과 글자 전환이 원본·편집 상태를 섞지 않는다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await expect(page.getByTestId('preset-master-ink')).toBeVisible()
    const before = await page.getByTestId('preset-master-ink').getAttribute('d')
    await page.getByRole('button', { name: '기준선 숨기기' }).click()
    await expect(page.getByTestId('preset-master-guides')).toHaveCount(0)
    await expect(page.getByTestId('preset-master-ink')).toHaveAttribute('d', before!)
    await page.getByRole('spinbutton', { name: '기준선 위치 수치' }).fill('500')
    await page.getByPlaceholder('예: 가고과너').fill('고')
    await page.getByTestId('corpus-character').click()
    await expect(page.getByTestId('preset-master-canvas')).toHaveAttribute('aria-label', '고 기준선 결속 마스터')
    await expect(page.getByTestId('preset-edit-status')).toContainText('변경 없음')
  })

  test('관측 수치가 달라지면 과거 승인 원본으로 조용히 대체하지 않는다', async ({ page }) => {
    await page.route('**/api/noto-corpus/glyph/44032', async route => {
      const response = await route.fetch()
      const value = await response.json()
      value.stages.initial.measurements.selectionArea.width += .02
      await route.fulfill({ response, json: value })
    })
    await page.goto('/noto-corpus-lab')
    await expect(page.getByTestId('noto-preset-inspector')).toContainText('측정값이 승인 당시 입력과 다릅니다')
    await expect(page.getByTestId('preset-master-canvas')).toHaveCount(0)
  })
})

test.describe('모바일 승인 마스터 비교', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('390px에서 비교와 기준선 조절이 가능하다', async ({ page }, testInfo) => {
    await page.goto('/noto-corpus-lab')
    const panel = page.getByTestId('noto-preset-inspector')
    await panel.scrollIntoViewIfNeeded()
    await expect(page.getByTestId('preset-master-canvas')).toBeVisible()
    await page.getByRole('combobox', { name: '편집 기준선' }).selectOption('JU:primaryBeam')
    await page.getByRole('spinbutton', { name: '기준선 위치 수치' }).fill('430')
    await expect(page.getByTestId('preset-edit-status')).toContainText('1개 기준선 변경')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await panel.screenshot({ path: testInfo.outputPath('mobile-master.png') })
  })
})
