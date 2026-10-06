import { existsSync } from 'node:fs'
import { expect, test, webkit, type Page } from '@playwright/test'
import { inkOf } from './ink'

// 사파리 엔진(WebKit)으로 실제로 그려진 픽셀을 본다. 다른 스펙은 크롬으로 DOM만 봐서, DOM은 멀쩡한데 사파리만 안 그리는 버그를 못 잡는다.
// (10-06: 통째 선택 테두리 필터의 범위가 사파리 한계를 넘어 `크게`에서 획이 통째로 사라졌다.)
test.use({ browserName: 'webkit', channel: '' })
test.skip(() => !existsSync(webkit.executablePath()), 'WebKit이 안 깔린 곳에서는 건너뛴다(`npx playwright install webkit`).')

const inkShare = async (page: Page) => (await inkOf(page)).share

for (const [name, size] of [['폰', { width: 390, height: 664 }], ['아이패드', { width: 820, height: 1180 }]] as const) {
  test(`사파리 ${name}: 획 편집 첫 화면(통째 선택)에서 \`크게\`를 켜고 꺼도 획이 그려져 있다`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto(`/workspace/jamo?char=${encodeURIComponent('가')}&mode=stroke&part=CH`)
    await expect(page.locator('svg [data-editor-hit="stroke"]').first()).toBeAttached({ timeout: 60_000 })
    // 첫 화면은 자소가 통째로 골라져 테두리 필터가 걸려 있다.
    // 느린 기기 · 다른 테스트와 겹쳐 돌 때를 대비해 넉넉히 기다린다.
    await expect(page.getByTestId('whole-jamo-outline')).toBeAttached({ timeout: 20_000 })
    await expect.poll(() => inkShare(page), { timeout: 20_000 }).toBeGreaterThan(3)
    const toggle = page.getByTestId('canvas-big-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => inkShare(page), { timeout: 20_000 }).toBeGreaterThan(3)
    await toggle.click()
    await expect.poll(() => inkShare(page), { timeout: 20_000 }).toBeGreaterThan(3)
  })
}
