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
    await page.getByPlaceholder('예: 가고과너').fill('고')
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
    await page.getByText('기준선 맞음', { exact: true }).nth(0).click()
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
    // 갛: 접촉 성분 fallback 이후 받침 흡수 없이 후보다.
    await page.getByPlaceholder('예: 가고과너').fill('갛')
    await page.getByTestId('corpus-character').click()
    await expect(initial.getByText('필수값 후보', { exact: true })).toBeVisible()
    // 넖: ㅓ 팔이 탐색 영역 밖이라 홀자가 일부 누락으로 남고 승인이 차단된다.
    await page.getByPlaceholder('예: 가고과너').fill('넖')
    await page.getByTestId('corpus-character').click()
    const medial = page.getByTestId('corpus-review-medial')
    await expect(medial.getByText('일부 누락', { exact: true })).toBeVisible()
    await expect(medial.getByText('기준선 맞음', { exact: true })).toBeDisabled()
  })

  test('변화량 모델 예측 첫닿밑선을 실측과 겹쳐 보여준다', async ({ page, request }) => {
    const codepoint = '간'.codePointAt(0)!
    const detail = await (await request.get(`/api/noto-corpus/glyph/${codepoint}`)).json()
    const prediction = detail.model.find((item: { target: string }) => item.target === 'initial.roleFaces.bottom')
    expect(prediction).toBeTruthy()

    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('간')
    await page.getByTestId('corpus-character').click()
    const panel = page.getByTestId('corpus-model-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('첫닿밑선', { exact: false })).toBeVisible()
    await expect(panel.getByText(/잔차/)).toBeVisible()
    // 첫닿자(초성) 기준선이 켜져 있으면 예측 점선이 캔버스에 그려진다.
    await expect(page.getByTestId('corpus-model-initial-bottom')).toHaveCount(1)
    // 큰 잔차 글자는 예외로 표시하고 실측을 덮지 않는다.
    await page.getByPlaceholder('예: 가고과너').fill('걫')
    await page.getByTestId('corpus-character').click()
    await expect(page.getByTestId('corpus-model-initial.roleFaces.bottom')).toHaveAttribute('data-exception', 'true')
    await expect(panel.getByText(/실측 보존/)).toBeVisible()
  })

  test('미추출 글자는 레거시 자모로 대신 그리지 않는다', async ({ page }) => {
    // 전수 배치 이후 실제 미추출 글자가 없으므로, 갹을 미추출 상태로 모킹해
    // 레거시 대체 렌더링 금지 규칙을 계속 검증한다.
    const target = '갹'.codePointAt(0)!
    await page.route('**/api/noto-corpus', async (route) => {
      const response = await route.fetch()
      const snapshot = await response.json()
      snapshot.rows = snapshot.rows.filter((row: { identity: { codepoint: number } }) => row.identity.codepoint !== target)
      await route.fulfill({ json: snapshot })
    })
    await page.route(`**/api/noto-corpus/glyph/${target}`, async (route) => {
      await route.fulfill({ json: {
        schema: 'noto-corpus-detail-v1',
        identity: { character: '갹', codepoint: target, initialJamo: 'ㄱ', medialJamo: 'ㅑ', finalJamo: null, contextId: 'right' },
        font: { id: 'noto-sans-kr', fileSha256: '0'.repeat(64), axes: {}, unitsPerEm: 1000 },
        row: { identity: { character: '갹', codepoint: target, initialJamo: 'ㄱ', medialJamo: 'ㅑ', finalJamo: null, contextId: 'right' }, stages: Object.fromEntries(['outline', 'medial', 'initial', 'final'].map((stage) => [stage, { status: 'unprocessed', reasonCodes: [] }])) },
        stages: { outline: null, medial: null, initial: null, final: null },
        model: [],
      } })
    })
    await page.goto('/noto-corpus-lab')
    await expect(page.locator(glyphSvg)).toBeVisible()
    await page.getByRole('combobox', { name: '상태 강조', exact: true }).selectOption({ label: '아직 미추출' })
    await page.getByText('갹', { exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: '갹' })).toBeVisible()
    await expect(page.locator(glyphSvg)).toHaveCount(0)
    await expect(page.getByText('기준선 맞음', { exact: true }).first()).toBeDisabled()
  })

  test('글자 격자는 시트·축 배치·방향키로 전체 조합을 오간다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    const cells = page.getByTestId('corpus-cell')
    const current = page.locator('[data-testid="corpus-cell"][aria-pressed="true"]')
    const heading = (character: string) => page.getByRole('heading', { level: 2 }).filter({ hasText: character })
    await expect(cells).toHaveCount(588)
    await expect(page.getByRole('group', { name: '첫닿자 시트' }).getByRole('button')).toHaveCount(19)
    await current.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await expect(heading('객')).toBeVisible()
    await expect(current).toBeFocused()
    await page.keyboard.press(']')
    await expect(heading('깩')).toBeVisible()
    await expect(cells.first()).toHaveText('까')
    await page.getByRole('button', { name: '크게 · 자모 점' }).click()
    await expect(current.locator('i')).toHaveCount(3)
    await page.getByRole('combobox', { name: '축 배치' }).selectOption({ label: '행 첫닿자 × 열 받침 · 시트 홀자' })
    await expect(cells).toHaveCount(19 * 28)
    await expect(current).toHaveText('깩')
    await page.getByText('무받침 399자', { exact: true }).click()
    await expect(cells).toHaveCount(399)
    await expect(current).toHaveText('깨')
    await expect(page.getByRole('combobox', { name: '축 배치' })).toHaveCount(0)
  })

  test('기준선은 기본으로 캔버스를 가로지르는 선이고 박스로 바꿀 수 있다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    await page.getByPlaceholder('예: 가고과너').fill('강')
    await page.getByTestId('corpus-character').click()
    await expect(page.locator(glyphSvg)).toHaveAttribute('aria-label', '강 실제 Noto 윤곽과 추출 기준선')
    const initialLines = page.getByTestId('corpus-guide-initial').locator('line')
    await expect(initialLines).toHaveCount(4)
    const spansCanvas = await initialLines.evaluateAll(lines => lines.every(line => {
      const [x1, x2, y1, y2] = ['x1', 'x2', 'y1', 'y2'].map(key => Number(line.getAttribute(key)))
      return (x1 === x2 && y1 < 0 && y2 > 1) || (y1 === y2 && x1 < 0 && x2 > 1)
    }))
    expect(spansCanvas).toBe(true)
    await expect(page.locator(glyphSvg).locator('[data-grid]')).toHaveCount(2)
    await page.getByRole('button', { name: '박스', exact: true }).click()
    await expect(page.locator('rect[data-testid="corpus-guide-initial"]')).toHaveCount(1)
    await expect(page.locator('rect[data-testid="corpus-guide-final"]')).toHaveCount(1)
    await expect(page.getByPlaceholder('검수 메모 (선택)')).toHaveCount(0)
  })

  test('상태 강조는 칸을 숨기지 않고 흐리게만 한다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    const cells = page.getByTestId('corpus-cell')
    await expect(cells).toHaveCount(588)
    await expect(page.locator('[data-testid="corpus-cell"][data-dimmed="true"]')).toHaveCount(0)
    await page.getByRole('combobox', { name: '상태 강조', exact: true }).selectOption({ label: '아직 미추출' })
    await expect(cells).toHaveCount(588)
    const unprocessed = await page.locator('[data-testid="corpus-cell"][data-status="unprocessed"]').count()
    await expect(page.locator('[data-testid="corpus-cell"][data-dimmed="false"]')).toHaveCount(unprocessed)
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
