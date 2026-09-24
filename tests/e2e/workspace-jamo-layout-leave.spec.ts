import { expect, test, type Page } from '@playwright/test'

/**
 * 보선 이동은 저장 버튼을 눌러야 남는다. 저장 안 한 채 떠나려 하면 먼저 묻는다.
 * 획 편집은 옮긴 보선을 저장해야 갈 수 있다(묻는 창 없이 켜진 상자를 눌러도 안 간다).
 */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

async function dragRail(page: Page) {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const handle = canvas.locator('[data-rail-handle="c0:left"]')
  await expect(handle).toBeAttached()
  const box = (await canvas.boundingBox())!
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.03), y, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('review-reset')).toContainText('1개 변경')
}

test('보선을 옮긴 채로는 획 편집에 못 가고, 저장하면 켜진 상자를 눌러 간다', async ({ page }) => {
  await dragRail(page)
  // 옮긴 보선이 있는 동안 켜진 상자는 획 편집 입구가 아니다.
  const chip = page.getByTestId('review-canvas').locator('[data-edit-part]').first()
  await expect(chip).toHaveCount(0)
  // 켜진 상자를 다시 눌러도 안 간다.
  const active = page.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][aria-pressed="true"]').first()
  await active.dispatchEvent('click')
  await expect(page.getByTestId('jamo-stroke-tools')).toHaveCount(0)
  // 저장하면 풀린다.
  await page.getByTestId('review-propagation-apply').click()
  await expect(page.getByTestId('review-reset')).toHaveCount(0)
  await chip.dispatchEvent('click')
  await expect(page.getByTestId('jamo-stroke-tools')).toBeVisible()
})

test('보선을 옮긴 채 다른 글자를 누르면 묻고, 바깥을 누르면 그대로 · 버리면 글자가 바뀐다', async ({ page }) => {
  await dragRail(page)
  const sentence = page.getByRole('region', { name: '보정 문장' })
  const otherLabel = await sentence.locator('button[aria-label$=" 편집"]:not([aria-current="true"])').first().getAttribute('aria-label')
  const other = sentence.getByRole('button', { name: otherLabel!, exact: true }).first()
  await other.click()
  await expect(page.getByTestId('layout-leave-dialog')).toBeVisible()
  // 취소 버튼은 없다. 바깥을 누르면 닫히고 편집은 남는다.
  await page.getByTestId('layout-leave-backdrop').click({ position: { x: 20, y: 20 } })
  await expect(page.getByTestId('layout-leave-dialog')).toHaveCount(0)
  await expect(page.getByTestId('review-reset')).toContainText('1개 변경')
  await expect(sentence.getByRole('button', { name: '멈 편집' })).toHaveAttribute('aria-current', 'true')

  await other.click()
  await page.getByTestId('layout-leave-discard').click()
  await expect(other).toHaveAttribute('aria-current', 'true')
  await expect(page.getByTestId('review-reset')).toHaveCount(0)
})

test('보선을 옮긴 채 새로고침하면 브라우저가 확인을 묻는다', async ({ page }) => {
  await dragRail(page)
  const asked = new Promise<string>((resolve) => page.once('dialog', (dialog) => { resolve(dialog.type()); void dialog.dismiss() }))
  void page.reload().catch(() => {})
  expect(await asked).toBe('beforeunload')
})
