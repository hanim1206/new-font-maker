import { expect, test, type Locator, type Page } from '@playwright/test'
import { inkOfLocator } from './ink'

/**
 * 글로벌 스타일(굵기)을 바꾸면 글자를 그리는 화면 전부가 같이 바뀌는지 픽셀로 본다.
 * 다른 스펙은 저장값과 DOM만 봐서 "스타일은 저장됐는데 어느 한 화면은 옛 모양"을 못 잡는다(10-07 점검 때 만든 스모크).
 * 보는 곳: 대시보드 문장 · 자소 카드 · 레이아웃 카드, 자소 탭 레이아웃 캔버스, 획 편집 캔버스, 검수 칸.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { if (!localStorage.getItem('font-maker-sample-sentence')) localStorage.setItem('font-maker-sample-sentence', '별을 노래하는 마음으로') })
})

const setWeight = (page: Page, weight: number) => page.evaluate((weight) => {
  const raw = JSON.parse(localStorage.getItem('font-maker-global-style') ?? '{"state":{"style":{}},"version":1}')
  raw.state.style.weight = weight
  localStorage.setItem('font-maker-global-style', JSON.stringify(raw))
}, weight)

const SURFACES: { name: string; url: string; target: (page: Page) => Locator }[] = [
  { name: '대시보드 문장', url: '/dashboard', target: (page) => page.getByTestId('dashboard-sentence') },
  { name: '대시보드 자소 카드', url: '/dashboard', target: (page) => page.getByRole('button', { name: 'ㄱ 도마에 올리기' }).first() },
  { name: '대시보드 레이아웃 카드', url: '/dashboard', target: (page) => page.getByRole('button', { name: /^\S 레이아웃$/ }).first() },
  { name: '자소 탭 레이아웃 캔버스', url: `/workspace/jamo?char=${encodeURIComponent('별')}`, target: (page) => page.getByTestId('review-canvas') },
  { name: '획 편집 캔버스', url: `/workspace/jamo?char=${encodeURIComponent('별')}&mode=stroke`, target: (page) => page.getByTestId('focus-canvas') },
  { name: '검수 칸', url: '/workspace/review', target: (page) => page.getByTestId('corpus-cell').first() },
]

async function measure(page: Page): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const surface of SURFACES) {
    await page.goto(surface.url)
    const target = surface.target(page)
    await expect(target).toBeVisible({ timeout: 60_000 })
    await target.scrollIntoViewIfNeeded()
    // 잉크가 실제로 그려질 때까지 — 빈 화면을 재면 0이라 400 ↔ 900 차이가 없어 보인다.
    await expect.poll(async () => (await inkOfLocator(page, target)).count, { timeout: 30_000 }).toBeGreaterThan(20)
    // 한 프레임 뒤 다시 재서 그리는 중간을 피한다.
    await page.waitForTimeout(300)
    result[surface.name] = (await inkOfLocator(page, target)).count
  }
  return result
}

test('굵기를 900으로 바꾸면 대시보드 · 레이아웃 캔버스 · 획 편집 캔버스 · 검수 칸의 잉크가 전부 굵어진다', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/dashboard')
  await expect(page.getByTestId('dashboard-sentence')).toBeVisible({ timeout: 60_000 })
  await setWeight(page, 400)
  const thin = await measure(page)
  await setWeight(page, 900)
  const thick = await measure(page)
  for (const surface of SURFACES) {
    // 900은 400의 두 배 넘게 굵다(노토 아홉 굵기 곡선). 검수 칸처럼 안 바뀌는 글자(노토 견줌)가 같이 든 곳도 있어 1.25배로 본다 — 안 바뀌면 1.0.
    expect(thick[surface.name] / thin[surface.name], `${surface.name}: 400 → ${thin[surface.name]}px, 900 → ${thick[surface.name]}px`).toBeGreaterThan(1.25)
  }
})
