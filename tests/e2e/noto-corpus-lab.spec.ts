import { expect, test } from '@playwright/test'

const reviewStorageKey = 'noto-corpus-local-reviews-v1'
const appStorageKey = 'font-maker-layout-schemas'
const appStorageSentinel = 'corpus-lab-must-not-touch-app-state'
const corpusEndpoint = /\/api\/noto-corpus$/
const glyphSvg = 'svg[aria-label$="실제 Noto 윤곽과 추출 기준선"]'

test.describe('실제 Noto corpus 검수판', () => {
  test.describe.configure({ mode: 'parallel' })
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    }, { key: appStorageKey, value: appStorageSentinel })
  })

  test('전체와 무받침 분모를 구분하고 실제 보고서 집계를 표시한다', async ({ page, request }) => {
    const response = await request.get('/api/noto-corpus')
    expect(response.ok()).toBeTruthy()
    const snapshot = await response.json()
    expect(snapshot.schema).toBe('noto-corpus-dashboard-v1')
    expect(snapshot.rows.length).toBeGreaterThanOrEqual(399)
    expect(snapshot.warnings).toEqual([])

    await page.goto('/noto-corpus-lab')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('어디까지 확인했나')
    await expect(page.getByText(new RegExp(`${snapshot.rows.length.toLocaleString('en-US')}\\s*/\\s*11,172`)).first()).toBeVisible()
    await page.getByText('무받침 399자', { exact: true }).click()
    await expect(page.getByText(/399\s*\/\s*399/).first()).toBeVisible()
    await expect(page.getByRole('region', { name: '역할별 추출 범위' }).getByText(/^399\s*\/\s*399$/)).toHaveCount(3)
    await expect(page.getByText('검수 버전 키가 없습니다. 배치를 한 번 갱신하세요.')).toHaveCount(0)
    await expect(page.getByText('기준선 맞음', { exact: true }).first()).toBeEnabled()
  })

  test('기준선 토글은 Noto 원본 윤곽을 바꾸지 않는다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await page.getByText('고', { exact: true }).first().click()
    const svg = page.locator(glyphSvg)
    await expect(svg).toHaveAttribute('aria-label', '고 실제 Noto 윤곽과 추출 기준선')
    const originalPaths = await svg.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
    expect(originalPaths.length).toBeGreaterThan(0)
    const guideCount = await svg.locator('rect, line').count()
    await page.getByText('기준선 숨기기', { exact: true }).click()
    expect(await svg.locator('rect, line').count()).toBeLessThan(guideCount)
    expect(await svg.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(originalPaths)
    await expect(page.getByText('기준선 맞음', { exact: true }).first()).toBeDisabled()
  })

  test('자모별 검수 저장과 취소는 격리되고 새 추출 버전에는 승인을 상속하지 않는다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await expect(page.locator(glyphSvg)).toBeVisible()
    await page.getByLabel('첫닿자 검수 메모', { exact: true }).fill('회귀 테스트: 첫닿자 확인')
    await page.getByText('기준선 맞음', { exact: true }).nth(0).click()
    await page.getByLabel('홀자 검수 메모', { exact: true }).fill('회귀 테스트: 홀자 확인')
    await page.getByText('기준선 맞음', { exact: true }).nth(1).click()
    await expect(page.getByText(/1\s*\/\s*11,172/).first()).toBeVisible()
    await page.reload()
    await expect(page.getByText(/1\s*\/\s*11,172/).first()).toBeVisible()
    expect(await page.evaluate(key => localStorage.getItem(key), appStorageKey)).toBe(appStorageSentinel)

    await page.getByText('검수 취소', { exact: true }).nth(0).click()
    await expect(page.getByText(/0\s*\/\s*11,172/).first()).toBeVisible()
    await page.getByText('기준선 맞음', { exact: true }).nth(0).click()
    const saved = await page.evaluate(key => localStorage.getItem(key), reviewStorageKey)
    expect(saved).not.toBeNull()

    await page.route(corpusEndpoint, async route => {
      const response = await route.fetch()
      const snapshot = await response.json()
      for (const row of snapshot.rows) {
        if (row.stages.initial.reviewKey) row.stages.initial.reviewKey += ':changed-observation'
      }
      await route.fulfill({ response, json: snapshot })
    })
    await page.reload()
    await expect(page.getByText(/0\s*\/\s*11,172/).first()).toBeVisible()
    expect(await page.evaluate(key => localStorage.getItem(key), reviewStorageKey)).toBe(saved)
  })

  test('전체 개발 단계 진척 패널이 실제 수치를 표시한다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    const panel = page.getByTestId('corpus-stage-progress')
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId('stage-extraction')).toContainText('11,172자 시도')
    await expect(panel.getByTestId('stage-extraction').locator('progress')).toHaveCount(1)
    await expect(panel.getByTestId('stage-analysis')).toContainText('편집 규칙 변환은 미완료')
    await expect(panel.getByTestId('stage-generation')).toContainText(/승인 입력 (57자만 마스터 결속|artifact 기록 없음)/)
    await expect(panel.getByTestId('stage-editing')).toContainText('편집 저장과 프리셋 적용 미구현')
    await expect(panel.getByTestId('stage-otf')).toContainText('미착수')
  })

  test('확장 받침 문맥의 첫닿자 후보와 분리 포기를 구분한다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('간')
    await page.getByTestId('corpus-character').click()
    const initial = page.getByTestId('corpus-review-initial')
    await expect(initial.getByText('필수값 후보', { exact: true })).toBeVisible()
    await expect(initial.getByText('기준선 맞음', { exact: true })).toBeEnabled()
    await expect(page.getByTestId('corpus-guide-initial')).toBeVisible()
    await page.getByPlaceholder('예: 가고과너').fill('갛')
    await page.getByTestId('corpus-character').click()
    await expect(initial.getByText('자동 포기', { exact: true })).toBeVisible()
    await expect(initial.getByText(/분리 증명이 부족해 자동 포기/)).toBeVisible()
    await expect(initial.getByText('기준선 맞음', { exact: true })).toBeDisabled()
  })

  test('미추출 글자는 레거시 자모로 대신 그리지 않는다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await expect(page.locator(glyphSvg)).toBeVisible()
    await page.getByRole('combobox', { name: '상태', exact: true }).selectOption({ label: '아직 미추출' })
    await page.getByText('갹', { exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: '갹' })).toBeVisible()
    await expect(page.locator(glyphSvg)).toHaveCount(0)
    await expect(page.getByText('기준선 맞음', { exact: true }).first()).toBeDisabled()
  })

  test('너의 첫닿자와 홀자 기준선을 함께 표시한다', async ({ page }, testInfo) => {
    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('너')
    await page.getByTestId('corpus-character').click()
    await expect(page.locator(glyphSvg)).toHaveAttribute('aria-label', '너 실제 Noto 윤곽과 추출 기준선')
    const medial = page.getByTestId('corpus-review-medial')
    await expect(medial.getByText('필수값 후보', { exact: true })).toBeVisible()
    await expect(medial.getByText('기준선 맞음', { exact: true })).toBeEnabled()
    await expect(page.getByTestId('corpus-review-initial').getByText('기준선 맞음', { exact: true })).toBeEnabled()
    await expect(page.getByTestId('corpus-guide-initial')).toBeVisible()
    expect(await page.locator(glyphSvg).locator('line').count()).toBeGreaterThanOrEqual(2)
    await page.getByTestId('corpus-inspector').screenshot({ path: testInfo.outputPath('neo-guides.png') })
  })

  test('뼤의 실제 홀자 윗보와 첫닿자 두 몸체를 함께 표시한다', async ({ page }, testInfo) => {
    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('뼤')
    await page.getByTestId('corpus-character').click()
    await expect(page.locator(glyphSvg)).toHaveAttribute('aria-label', '뼤 실제 Noto 윤곽과 추출 기준선')
    await expect(page.getByTestId('corpus-guide-initial')).toBeVisible()
    await expect(page.getByTestId('corpus-review-initial').getByText('기준선 맞음', { exact: true })).toBeEnabled()
    await expect(page.getByTestId('corpus-review-medial').getByText('기준선 맞음', { exact: true })).toBeEnabled()
    await expect(page.getByTestId('corpus-guide-medial').locator('title').filter({ hasText: 'upperBeam · 0.27424' })).toHaveCount(1)
    await page.getByTestId('corpus-inspector').screenshot({ path: testInfo.outputPath('bbyae-guides.png') })
  })

  test('역할 충돌 응답은 여전히 기준선 맞음 승인을 차단한다', async ({ page }) => {
    await page.route(`**/api/noto-corpus/glyph/${'뼤'.codePointAt(0)}`, async route => {
      const response = await route.fetch()
      const detail = await response.json()
      detail.row.stages.initial.status = 'abstained'
      detail.row.stages.initial.reasonCodes = ['medial-anchor-role-conflict']
      detail.row.stages.initial.measurements = null
      await route.fulfill({ response, json: detail })
    })
    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('뼤')
    await page.getByTestId('corpus-character').click()
    await expect(page.getByText('홀자 후보와 첫닿자 구조의 역할이 충돌합니다. 기준선 맞음 승인을 차단했습니다.')).toBeVisible()
    await expect(page.getByTestId('corpus-review-initial').getByText('기준선 맞음', { exact: true })).toBeDisabled()
    await expect(page.getByTestId('corpus-review-medial').getByText('기준선 맞음', { exact: true })).toBeDisabled()
    await expect(page.getByTestId('corpus-review-medial').getByText('문제 있음', { exact: true })).toBeEnabled()
  })

  test('API 실패 시 오류를 표시하고 원본 없는 글자를 그리지 않는다', async ({ page }) => {
    await page.route(corpusEndpoint, route => route.fulfill({ status: 503, json: { error: '회귀 테스트: 보고서 접근 실패' } }))
    await page.goto('/noto-corpus-lab')
    await expect(page.getByText(/보고서 접근 실패/)).toBeVisible()
    await expect(page.locator(glyphSvg)).toHaveCount(0)
  })
})

test.describe('모바일 corpus 검수판', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('가로 넘침 없이 집계와 선택 글자를 확인한다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('어디까지 확인했나')
    await page.getByText('무받침 399자', { exact: true }).click()
    await expect(page.getByText(/399\s*\/\s*399/).first()).toBeVisible()
    await page.locator(glyphSvg).scrollIntoViewIfNeeded()
    await expect(page.locator(glyphSvg)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  })
})
