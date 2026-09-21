import { expect, test, type Page } from '@playwright/test'

/** 글로벌 스타일: 머리에 늘 보이는 입구, 문장 아래를 다 쓰는 화면, 탭 넷(글자 네모꼴 · 획 스타일 · 굵기 · 부리). */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

const storedStyle = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('font-maker-global-style') ?? '{}').state?.style)
const setStoredStyle = (page: Page, patch: Record<string, unknown>) => page.evaluate((patch) => {
  const raw = JSON.parse(localStorage.getItem('font-maker-global-style') ?? '{}')
  Object.assign(raw.state.style, patch)
  localStorage.setItem('font-maker-global-style', JSON.stringify(raw))
}, patch)

test('레이아웃 모드에서도 머리의 입구로 열리고, 닫으면 레이아웃으로 돌아온다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('한')}`)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const panel = page.getByRole('region', { name: '글로벌 스타일 설정' })
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await expect(panel.getByRole('tablist', { name: '글로벌 스타일 항목' }).getByRole('tab')).toHaveText(['글자 네모꼴', '획 스타일', '굵기', '부리'])

  // 하단에 붙은 작은 패널이 아니라 캔버스 아래 남은 높이를 다 쓴다.
  const box = await panel.boundingBox()
  expect(box && box.y + box.height).toBeGreaterThan(830)

  // 획 모양: 네모형 붓촉과 레거시 스냅 획은 고르기에 없다.
  await panel.getByRole('tab', { name: '획 스타일' }).click()
  await expect(panel.getByRole('radio', { name: '납작형', exact: true })).toBeVisible()
  await expect(panel.getByRole('radio', { name: '네모형', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('radio', { name: '레거시 스냅 획', exact: true })).toHaveCount(0)

  await panel.getByRole('button', { name: '글로벌 스타일 설정 닫기' }).click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('굵기는 100 단위로만 멈추고, 끄는 동안은 미리보기 · 손을 떼면 적용 · 되돌리기에 들어간다', async ({ page }) => {
  await page.goto(`/workspace/jamo?mode=stroke&char=${encodeURIComponent('한')}`)
  await expect(page.getByTestId('focus-canvas').locator('svg')).toBeVisible()
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const panel = page.getByRole('region', { name: '글로벌 스타일 설정' })
  await panel.getByRole('tab', { name: '굵기' }).click()

  // 기울기는 지금 내놓지 않는다.
  await expect(panel.getByTestId('style-slant')).toHaveCount(0)
  const weight = panel.getByTestId('style-weight')
  await expect(weight).toHaveAttribute('step', '100')
  await weight.fill('700')
  expect((await storedStyle(page)).weight).toBe(400)
  await weight.dispatchEvent('pointerup')
  expect((await storedStyle(page)).weight).toBe(700)

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  expect((await storedStyle(page)).weight).toBe(400)
})

test('부리를 그림 버튼에서 고르면 문장 글자에 바로 얹히고 되돌리기에 들어간다', async ({ page }) => {
  await page.goto(`/workspace/jamo?mode=stroke&char=${encodeURIComponent('한')}`)
  const sentence = page.getByRole('region', { name: '보정 문장' })
  await expect(sentence).toBeVisible()
  await expect(sentence.locator('[data-stem-beak]')).toHaveCount(0)

  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const panel = page.getByRole('region', { name: '글로벌 스타일 설정' })
  await panel.getByRole('tab', { name: '부리' }).click()
  await panel.getByRole('radio', { name: '각진 부리' }).click()
  await expect(sentence.locator('[data-stem-beak]').first()).toBeVisible()
  expect((await storedStyle(page)).stemBeak).toMatchObject({ enabled: true, shape: 'angled' })

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(sentence.locator('[data-stem-beak]')).toHaveCount(0)
})

test('스타일을 열면 캔버스가 비키고 문장 줄이 한 줄 그대로 크게 자란다', async ({ page }) => {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent('한')}`)
  const sentence = page.getByRole('region', { name: '보정 문장' })
  const glyph = sentence.getByRole('button', { name: /^한 편집/ }).locator('svg')
  const small = await glyph.boundingBox()
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await expect(sentence).toHaveAttribute('data-grown', 'true')
  await expect(page.getByTestId('focus-canvas')).toHaveCount(0)
  await expect.poll(async () => (await glyph.boundingBox())?.height ?? 0).toBeGreaterThan(130)
  expect(small?.height ?? 0).toBeLessThan(30)
  // 한 줄이다: 줄 높이가 글자 하나 남짓.
  expect((await sentence.boundingBox())?.height ?? 0).toBeLessThan(210)

  await page.getByRole('button', { name: '글로벌 스타일 설정 닫기' }).click()
  await expect.poll(async () => (await glyph.boundingBox())?.height ?? 0).toBeLessThan(30)
})

test('기울어진 글자: 잉크 · 핸들만 기울고 눈금은 곧으며, 점을 세로로 끌어도 손가락 아래에 있다', async ({ page }) => {
  await page.goto(`/workspace/jamo?mode=stroke&char=${encodeURIComponent('한')}`)
  await expect(page.getByTestId('focus-canvas').locator('svg')).toBeVisible()
  await setStoredStyle(page, { slant: 12 })
  await page.reload()
  const svg = page.getByTestId('focus-canvas').locator('svg')
  await expect(svg).toBeVisible()

  const layers = await svg.evaluate((element) => {
    const skew = [...element.querySelectorAll('g')].find((group) => (group.getAttribute('transform') ?? '').includes('skewX(-12)'))
    const inside = (selector: string) => { const target = element.querySelector(selector); return !!(skew && target && skew.contains(target)) }
    return { skewed: !!skew, grid: inside('[data-testid="jamo-grid"]'), body: inside('[data-testid="jamo-design-body"]'), hit: inside('[data-editor-hit="stroke"]') }
  })
  expect(layers).toEqual({ skewed: true, grid: false, body: false, hit: true })

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
