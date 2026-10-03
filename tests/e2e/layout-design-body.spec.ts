import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * 네모꼴을 바꾼 폰트에서 레이아웃 편집이 문장 줄과 같은 글자를 보인다(플랜 `2026-10-01_네모꼴-열기` 1단계).
 * 보선 · Δ는 기준 틀 em으로 저장되고, 캔버스 그림과 손가락 자리만 사용자 네모꼴로 옮겨진다.
 */

/** 옛 단독 화면의 두 막대로 폰트 전체 네모꼴을 정한다. 제품 화면의 네모꼴 탭은 아직 잠겨 있다. */
async function setBody(page: Page, width: number, height: number) {
  await page.goto('/calibration')
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  const settings = page.getByRole('tabpanel', { name: '글자 네모꼴 설정' })
  await settings.locator('label').filter({ hasText: '가로' }).locator('input').fill(String(width))
  await settings.locator('label').filter({ hasText: '세로' }).locator('input').fill(String(height))
  await expect(settings.locator('label').filter({ hasText: '가로' }).locator('input')).toHaveValue(String(width))
}

async function openLayout(page: Page, char: string) {
  await page.goto(`/workspace/jamo?char=${encodeURIComponent(char)}`)
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-rail-handle="c0:right"]')).toBeAttached()
}

/** 캔버스 잉크(닿자 + 홀자)의 좌우 끝(em). */
const inkSpan = (page: Page) => page.locator('[data-testid="review-component-ink"], [data-testid="review-fit-ink"]').evaluateAll((paths) => {
  let left = Infinity
  let right = -Infinity
  for (const path of paths) {
    const box = (path as SVGGraphicsElement).getBBox()
    left = Math.min(left, box.x)
    right = Math.max(right, box.x + box.width)
  }
  return { left, right }
})
const railX = (page: Page, id: string) => page.locator(`[data-rail-handle="${id}"]`).evaluate((el) => Number(el.getAttribute('x1')))
/** 저장된 Δ 가운데 첫닿자 오른변 값(em)을 1000u로. 아직 없으면 0. */
const storedRightDelta = (page: Page) => page.evaluate(() => {
  const rules = JSON.parse(localStorage.getItem('noto-layout-delta-v1') ?? '{}').state?.rules ?? {}
  const values = Object.values(rules as Record<string, { faces?: { CH?: { right?: number } } }>).map((rule) => rule.faces?.CH?.right ?? 0)
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 1000)
})

test('네모꼴 가로 600: 캔버스 글자와 보선이 사용자 네모꼴 안에 서고, 닿는 글자 카드도 같이 좁다', async ({ page }) => {
  await openLayout(page, '한')
  const wide = await inkSpan(page)
  const wideRail = await railX(page, 'c0:left')

  await setBody(page, 600, 910)
  await openLayout(page, '한')
  const narrow = await inkSpan(page)
  // 사용자 네모꼴은 왼 125 ~ 오른 725. 잉크가 그 안에 들고(변을 먼저 옮기고 두께를 다듬어서 안 넘친다), 폭이 600/840만큼 줄었다.
  expect(narrow.left).toBeGreaterThan(0.123)
  expect(narrow.right).toBeLessThan(0.727)
  expect((narrow.right - narrow.left) / (wide.right - wide.left)).toBeCloseTo(600 / 840, 1)
  // 첫닿자 왼변 보선도 같은 식으로 옮겨진다: 125 + (기준 자리 − 50) × 600/840.
  expect(await railX(page, 'c0:left')).toBeCloseTo(0.125 + (wideRail - 0.05) * 600 / 840, 3)
  // 닿는 글자 카드의 잉크도 좁은 네모꼴 안.
  const card = await page.getByTestId('review-propagation-card').first().locator('svg path[fill="#111"]').evaluateAll((paths) => Math.max(...paths.map((path) => { const box = (path as SVGGraphicsElement).getBBox(); return box.x + box.width })))
  expect(card).toBeLessThan(0.727)
  // 홀자 기둥의 중심 보선은 좁아진 기둥 한가운데에 선다 — 두께는 안 줄어서 칸 변과 다르게 옮겨진다. ㅏ의 기둥은 홀자 칸 왼쪽 끝에 선다.
  await page.locator('[data-testid="review-part-hit"][data-part="JU"]').first().dispatchEvent('pointerdown')
  const pillarRail = await page.locator('[data-rail="0:center-x"] line').first().evaluate((el) => Number(el.getAttribute('x1')))
  const medialLeft = await page.getByTestId('review-fit-ink').first().evaluate((path) => (path as SVGGraphicsElement).getBBox().x)
  // 자동 보정으로 기둥이 얇아져 있다(배율 = √(600/840)). 반 두께 35u × 배율.
  expect(Math.abs(pillarRail - (medialLeft + 0.035 * Math.sqrt(600 / 840)))).toBeLessThan(0.008)
})

test('네모꼴 가로 600: 방향키 한 번은 화면의 1u이고, 저장되는 Δ는 기준 틀 em이다', async ({ page }) => {
  await setBody(page, 600, 910)
  await openLayout(page, '한')
  const before = await railX(page, 'c0:right')
  await page.locator('[data-rail-handle="c0:right"]').focus()
  for (let step = 0; step < 10; step += 1) await page.keyboard.press('ArrowLeft')
  // 화면에서 10u 갔다.
  await expect.poll(async () => Math.round((await railX(page, 'c0:right') - before) * 1000)).toBe(-10)
  await expect(page.getByTestId('review-delta-label').filter({ hasText: '-10u' })).toBeVisible()
  // 저장은 기준 틀 em: 10u ÷ (600/840) = 14u.
  await expect.poll(async () => await storedRightDelta(page)).toBe(-14)
})

test('네모꼴 가로 600: 자동 보정으로 세로줄기만 얇아지고, 끄면 원래 두께다', async ({ page }) => {
  await setBody(page, 600, 910)
  await page.goto('/design-body-lab')
  // 속공간 진행 지도가 아직 안 본 질문을 팝업으로 띄우면 덮인다. 닫고 간다.
  await expect(page.getByTestId('counter-map')).toBeVisible()
  const popup = page.getByTestId('counter-question-popup')
  if (await popup.count()) await popup.getByRole('button', { name: '닫기' }).click()
  // 네모꼴 열기 확인 화면은 접혀 있다(속공간 진행 지도 아래). 위 지도가 그리는 동안 높이가 흔들려 누르기가 빗나가므로 직접 편다.
  await page.getByTestId('body-lab-past').evaluate((details) => { (details as HTMLDetailsElement).open = true })
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 60_000 })
  // 레이아웃 편집을 `이`로 연다. ㅣ 기둥의 잉크 폭이 곧 세로줄기 두께다.
  await page.getByRole('textbox', { name: '문장' }).fill('이')
  await page.getByRole('button', { name: '이 열기' }).first().click()
  const pillar = () => page.getByTestId('review-fit-ink').first().evaluate((path) => (path as SVGGraphicsElement).getBBox().width)
  await expect.poll(pillar).toBeGreaterThan(0)
  const thin = await pillar()
  // 스위치를 끄면 원래 두께로 돌아온다. 배율은 √(600/840).
  await page.getByTestId('body-lab-auto').uncheck()
  await expect.poll(async () => thin / await pillar()).toBeCloseTo(Math.sqrt(600 / 840), 2)
  await page.getByTestId('body-lab-auto').check()
  await expect.poll(pillar).toBeCloseTo(thin, 4)
})
