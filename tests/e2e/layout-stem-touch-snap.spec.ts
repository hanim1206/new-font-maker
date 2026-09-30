import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** 캔버스 em 좌표 → 화면 px. */
async function screenOf(page: Page, x: number, y: number) {
  return page.getByTestId('review-canvas').evaluate((svg, [x, y]) => {
    const matrix = (svg as SVGSVGElement).getScreenCTM()!
    const point = new DOMPoint(x, y).matrixTransform(matrix)
    return { x: point.x, y: point.y }
  }, [x, y] as const)
}

const railX = (page: Page, id: string) => page.locator(`[data-rail-handle="${id}"]`).evaluate((el) => Number(el.getAttribute('x1')))

/** 세로 보선을 잡고 `to`(em)까지 조금씩 끈다. 걸림 칩이 뜬 걸음마다 보선 자리를 적는다. */
async function sweep(page: Page, id: string, to: number) {
  const from = await railX(page, id)
  const start = await screenOf(page, from, 0.5)
  const end = await screenOf(page, to, 0.5)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const seen: { at: number; chip: string | null }[] = []
  for (let step = 1; step <= 80; step += 1) {
    await page.mouse.move(start.x + (end.x - start.x) * step / 80, start.y)
    const chip = page.getByTestId('review-touch-chip')
    seen.push({ at: await railX(page, id), chip: await chip.isVisible() ? await chip.textContent() : null })
  }
  return { from, seen }
}

test('첫닿자 오른변을 끌다 홀자 가로 줄기의 비어 있는 중심선 끝에 닿으면 걸리고 딱 붙음이 뜬다(기둥 쪽 끝은 안 걸린다)', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%96%B4')
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-rail-handle="c0:right"]')).toBeAttached()
  const { from, seen } = await sweep(page, 'c0:right', 0.9)
  await page.mouse.up()
  const touched = seen.filter((item) => item.chip)
  expect(touched.length).toBeGreaterThan(0)
  expect(touched.every((item) => item.chip === '첫닿자 오른변 · ㅓ 가로 줄기 끝 딱 붙음')).toBe(true)
  // 곁줄기 왼끝 하나에서만 걸린다. 기둥에 묻힌 오른끝은 아니다.
  expect(new Set(touched.map((item) => item.at.toFixed(4))).size).toBe(1)
  expect(Math.abs(touched[0].at - from)).toBeLessThan(0.03)
})

test('획 편집에서 곁줄기 끝점을 끌다 첫닿자 오른변에 중심선이 닿으면 딱 붙음이 뜬다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%96%B4&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  // 다른 획을 거쳐 곁줄기를 두 번 눌러 점을 펼친다.
  for (const id of ['ㅓ-1', 'ㅓ-2', 'ㅓ-2']) {
    const hit = page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`)
    await hit.dispatchEvent('pointerdown')
    await hit.dispatchEvent('pointerup')
  }
  const points = page.locator('[data-editor-point="hit"]')
  await expect(points.first()).toBeAttached()
  const boxes = await points.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })))
  const leftEnd = boxes.reduce((best, point) => point.x < best.x ? point : best)
  await page.mouse.move(leftEnd.x, leftEnd.y)
  await page.mouse.down()
  const chip = page.getByTestId('stroke-snap-chip')
  let text: string | null = null
  // 오른쪽으로 떼었다가(처음 자리 반경 밖) 천천히 돌아온다.
  for (const dx of [...Array.from({ length: 12 }, (_, index) => (index + 1) * 4), ...Array.from({ length: 16 }, (_, index) => 44 - index * 4)]) {
    await page.mouse.move(leftEnd.x + dx, leftEnd.y)
    if (await chip.isVisible() && (await chip.textContent())?.includes('딱 붙음')) { text = await chip.textContent(); break }
  }
  await page.mouse.up()
  expect(text).toContain('첫닿자 오른변에 딱 붙음')
})
