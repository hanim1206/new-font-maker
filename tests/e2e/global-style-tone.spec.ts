import { expect, test } from '@playwright/test'

/** 글로벌 스타일 `굵기 · 기울기` 탭: 끄는 동안은 미리보기, 손을 떼면 적용, 되돌리기에 들어간다. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

const storedTone = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const style = JSON.parse(localStorage.getItem('font-maker-global-style') ?? '{}').state?.style
  return [style?.weight, style?.slant]
})

test('굵기 700 · 기울기 12°를 주면 글자는 굵어지고 기울지만 눈금과 부품 상자는 곧게 남는다', async ({ page }) => {
  await page.goto(`/workspace/jamo?mode=stroke&char=${encodeURIComponent('한')}`)
  const svg = page.getByTestId('focus-canvas').locator('svg')
  await expect(svg).toBeVisible()

  await page.getByRole('button', { name: '주 메뉴' }).click()
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const panel = page.getByRole('region', { name: '글로벌 스타일 설정' })
  await panel.getByRole('tab', { name: /굵기 · 기울기/ }).click()

  // 끄는 동안은 저장소를 안 건드린다. 손을 떼면 적용된다.
  const weight = panel.getByTestId('style-weight')
  await weight.fill('700')
  expect(await storedTone(page)).toEqual([400, 0])
  await weight.dispatchEvent('pointerup')
  const slant = panel.getByTestId('style-slant')
  await slant.fill('12')
  await slant.dispatchEvent('pointerup')
  expect(await storedTone(page)).toEqual([700, 12])

  // 잉크 · 핸들 묶음만 기운다. 눈금 · 글자몸 · 부품 상자는 그 묶음 밖(곧은 깔개)이다.
  const layers = await svg.evaluate((element) => {
    const skew = [...element.querySelectorAll('g')].find((group) => (group.getAttribute('transform') ?? '').includes('skewX(-12)'))
    const inside = (selector: string) => { const target = element.querySelector(selector); return !!(skew && target && skew.contains(target)) }
    return { skewed: !!skew, grid: inside('[data-testid="jamo-grid"]'), body: inside('[data-testid="jamo-design-body"]'), hit: inside('[data-editor-hit="stroke"]') }
  })
  expect(layers).toEqual({ skewed: true, grid: false, body: false, hit: true })

  // 되돌리기 두 번이면 기본값이다.
  await panel.getByRole('button', { name: '글로벌 스타일 설정 닫기' }).click()
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  expect(await storedTone(page)).toEqual([400, 0])
})

test('기울어진 글자에서 점을 세로로 끌어도 점이 손가락 아래에 있다', async ({ page }) => {
  await page.goto(`/workspace/jamo?mode=stroke&char=${encodeURIComponent('한')}`)
  await expect(page.getByTestId('focus-canvas').locator('svg')).toBeVisible()
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('font-maker-global-style') ?? '{}')
    raw.state.style.slant = 12
    localStorage.setItem('font-maker-global-style', JSON.stringify(raw))
  })
  await page.reload()
  const svg = page.getByTestId('focus-canvas').locator('svg')
  const strokeHit = svg.locator('[data-editor-hit="stroke"]').first()
  await strokeHit.dispatchEvent('pointerdown', { pointerId: 1, button: 0 })
  await strokeHit.dispatchEvent('pointerdown', { pointerId: 2, button: 0 })
  const point = svg.locator('[data-editor-point="hit"]').last()
  const box = await point.boundingBox()
  if (!box) throw new Error('점 핸들이 없습니다.')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 10, { steps: 3 })
  await page.mouse.move(x, y - 40, { steps: 6 })
  const active = await svg.locator('[data-editor-point="visible"]').last().boundingBox()
  await page.mouse.up()
  if (!active) throw new Error('끄는 점이 없습니다.')
  // 역보정이 없으면 tan(12°) × 40px ≈ 8.5px 옆으로 밀린다.
  expect(Math.abs(active.x + active.width / 2 - x)).toBeLessThan(2)
})
