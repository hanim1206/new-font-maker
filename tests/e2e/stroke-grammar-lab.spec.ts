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

  test('부리를 켜고 모양을 고르면 표본 글자와 낱자 카드에 한 번에 반영되고, 끄면 사라진다', async ({ page }) => {
    await page.goto('/stroke-grammar-lab')
    const samples = page.getByTestId('stem-beak-samples')
    await expect(samples.locator('svg')).toHaveCount(14)
    await expect(page.locator('[data-stem-beak]')).toHaveCount(0)
    await expect(page.locator('polygon[data-marker="beak"]')).toHaveCount(0)

    await page.locator('button[data-beak-shape="round"]').click()
    await expect(page.getByLabel('부리 켜기')).toBeChecked()
    await expect(page.locator('button[data-beak-shape="round"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('부리 각도')).toBeDisabled()
    const beakCount = await samples.locator('[data-stem-beak]').count()
    expect(beakCount).toBeGreaterThan(14)
    // ㅂ 카드: 획 하나 안의 두 세로 마디에 부리 자리 둘. ㄱ 카드: 없음.
    await expect(page.locator('article[data-jamo="ㅂ"][data-jamo-type="choseong"] polygon[data-marker="beak"]')).toHaveCount(2)
    await expect(page.locator('article[data-jamo="ㄱ"][data-jamo-type="choseong"] polygon[data-marker="beak"]')).toHaveCount(0)

    const roundPath = await samples.locator('[data-stem-beak]').first().getAttribute('d')
    await page.locator('button[data-beak-shape="angled"]').click()
    await expect(page.getByLabel('부리 각도')).toBeEnabled()
    await expect(samples.locator('[data-stem-beak]')).toHaveCount(beakCount)
    expect(await samples.locator('[data-stem-beak]').first().getAttribute('d')).not.toBe(roundPath)

    await page.getByLabel('부리 켜기').uncheck()
    await expect(page.locator('[data-stem-beak]')).toHaveCount(0)
  })

  test('360 너비에서 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/stroke-grammar-lab')
    await expect(page.getByTestId('stroke-grammar-lab')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
