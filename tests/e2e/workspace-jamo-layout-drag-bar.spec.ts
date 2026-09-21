import { expect, test } from '@playwright/test'

/**
 * 하단 바는 보선을 끄는 동안 잡을 때 상태로 얼어 있고, 손을 떼면 바뀐다.
 * 캔버스 · 닿는 글자 줄은 끄는 동안에도 실시간이다.
 */
test('하단 바는 보선을 끄는 동안 안 바뀌고 손을 떼면 적용 버튼이 된다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const handle = canvas.locator('[data-rail-handle="c0:left"]')
  await expect(handle).toBeAttached()
  const box = (await canvas.boundingBox())!
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  // 세로 보선 손잡이는 위쪽 여백에서 잡는다.
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  const bar = page.getByTestId('jamo-stroke-cta-bar')
  const apply = page.getByTestId('review-propagation-apply')
  const reset = page.getByTestId('review-reset')

  await expect(page.getByTestId('jamo-stroke-cta')).toBeVisible()
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.03), y, { steps: 6 })
  // 끄는 중: 캔버스의 Δ 수치는 실시간, 하단 바는 그대로 `획 고치기`.
  await expect(page.getByTestId('review-delta-label')).toHaveCount(1)
  await expect(bar).toHaveAttribute('data-held', 'true')
  await expect(page.getByTestId('jamo-stroke-cta')).toBeVisible()
  await expect(apply).toHaveCount(0)
  await expect(reset).toHaveCount(0)

  await page.mouse.up()
  await expect(bar).not.toHaveAttribute('data-held', 'true')
  await expect(apply).toBeVisible()
  await expect(reset).toContainText('1개 변경')

  // 이미 Δ가 있는 채로 다시 끌면 끄는 동안에도 적용 버튼은 그대로 서 있다.
  const x2 = Number(await handle.getAttribute('x1'))
  await page.mouse.move(pxOf(x2), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x2 + 0.01), y, { steps: 3 })
  await expect(apply).toBeVisible()
  await page.mouse.up()
  await expect(apply).toBeVisible()
})
