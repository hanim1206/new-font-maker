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
  await expect(page.getByTestId('not-found')).toBeVisible()
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
  await expect(page).toHaveTitle('없는 페이지 · 한글칸글')
  await page.getByRole('button', { name: '내 폰트로 가기' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('옛 뼈대 주소는 자소 화면으로 넘어간다', async ({ page }) => {
  await page.goto('/workspace/skeleton')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('머리는 `‹`(화살표만) · 화면 이름 · 되돌리기고 햄버거는 없다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await expect(page.getByRole('button', { name: '주 메뉴' })).toHaveCount(0)
  await expect(page.getByTestId('workspace-font-home')).toHaveAttribute('aria-label', '내 폰트로')
  await expect(page.getByTestId('workspace-font-home')).toHaveText('')
  await expect(page.getByRole('heading', { name: '레이아웃 편집' })).toBeVisible()
  await expect(page).toHaveTitle('레이아웃 편집 · 한글칸글')
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeVisible()
  // 하단 탭은 없다 — 화면 사이 이동은 대시보드가 한다.
  await expect(page.getByTestId('workspace-tabs')).toHaveCount(0)
})

test('스타일 화면은 대시보드 `스타일`로 들어오고, 머리 `‹ 스타일` 아래 지금 값을 칩으로 보인다', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByTestId('dashboard-style').click()
  await expect(page).toHaveURL(/\/workspace\/font$/)
  await expect(page.getByRole('heading', { level: 2, name: '스타일' })).toBeVisible()
  const summary = page.getByTestId('font-workspace')
  await expect(summary.getByRole('listitem')).toHaveText(['네모꼴 기본', '붓 일반', '굵기 400', '부리 없음'])
  // 추출은 여기서 하지 않는다 — 대시보드 폰트 카드의 다운로드.
  await expect(page.getByRole('button', { name: /OTF/ })).toHaveCount(0)
  await page.getByTestId('workspace-font-home').click()
  await expect(page).toHaveURL(/\/dashboard$/)
})
