import { expect, test } from '@playwright/test'

test.describe('획 문법 랩', () => {
  test('낱자 67개를 줄기 이름별로 그리고 프리셋에는 자유 획이 없다', async ({ page }) => {
    await page.goto('/stroke-grammar-lab')
    await expect(page.getByTestId('stroke-grammar-lab')).toBeVisible()
    await expect(page.locator('article[data-jamo]')).toHaveCount(67)
    await expect(page.locator('g[data-bound="false"]')).toHaveCount(0)

    const a = page.locator('article[data-jamo="ㅏ"][data-jamo-type="jungseong"]')
    await expect(a.locator('g[data-stroke-id="ㅏ-1"]')).toHaveAttribute('data-stem-name', 'gidung')
    await expect(a.locator('g[data-stroke-id="ㅏ-2"]')).toHaveAttribute('data-stem-name', 'gyeotjulgi')
    await expect(a.getByText('곁줄기')).toBeVisible()
    await expect(a.locator('g[data-stroke-id="ㅏ-2"] circle[data-marker="head"]')).toHaveAttribute('data-open', 'false')
    await expect(a.locator('g[data-stroke-id="ㅏ-2"] circle[data-marker="tail"]')).toHaveAttribute('data-open', 'true')

    const giyeok = page.locator('article[data-jamo="ㄱ"][data-jamo-type="choseong"]')
    await expect(giyeok.locator('rect[data-marker="corner"]')).toHaveCount(1)
    await expect(giyeok.getByText('이름 없음')).toBeVisible()
  })

  test('360 너비에서 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/stroke-grammar-lab')
    await expect(page.getByTestId('stroke-grammar-lab')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
