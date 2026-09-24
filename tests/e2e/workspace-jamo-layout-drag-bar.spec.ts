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

test('보선을 캔버스 밖까지 끌어도 글자 칸(0–1em) 안에서 멈춘다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const handle = canvas.locator('[data-rail-handle="c0:left"]')
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1) - 300, y, { steps: 12 })
  expect(Number(await handle.getAttribute('x1'))).toBeCloseTo(0, 3)
  await page.mouse.move(pxOf(x1) + 600, y, { steps: 24 })
  // 오른쪽으로는 같은 부품의 오른변에 막히거나 칸 끝(1em)에서 멈춘다.
  expect(Number(await handle.getAttribute('x1'))).toBeLessThanOrEqual(1)
  await page.mouse.up()
})

test('보선은 끄는 동안 얇고 걸려도 영역 색 그대로, 손을 떼면 굵어진다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const handle = canvas.locator('[data-rail-handle="c0:left"]')
  const rail = canvas.locator('g[data-rail="c0:left"][data-part]')
  const line = rail.locator('line').nth(1)
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  const width = async () => Number.parseFloat(await line.evaluate((element) => getComputedStyle(element).strokeWidth))
  const partColor = await line.getAttribute('stroke')

  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.06), y, { steps: 6 })
  await expect(rail).toHaveAttribute('data-dragging', 'true')
  expect(await width()).toBeLessThan(0.006)
  // 모델 자리로 돌아오면 걸린다. 선 색은 안 바뀌고 여전히 얇다(번쩍임을 뺐다).
  await page.mouse.move(pxOf(x1 + 0.002), y, { steps: 4 })
  await expect(rail).toHaveAttribute('data-snapped', 'true')
  await expect(line).toHaveAttribute('stroke', partColor!)
  expect(await width()).toBeLessThan(0.006)

  // 모델 자리에서 떼면 Δ가 없어 띠도 없다. 벌려 놓고 뗀다.
  await page.mouse.move(pxOf(x1 + 0.05), y, { steps: 4 })
  await page.mouse.up()
  await expect(rail).not.toHaveAttribute('data-dragging')
  await expect(rail).not.toHaveAttribute('data-snapped')
  await expect(line).toHaveAttribute('stroke', partColor!)
  await expect.poll(width).toBeGreaterThan(0.01)
  // 변화 띠는 첫닿자 상자 높이만큼만. 캔버스 끝까지 가서 받침·홀자 영역을 덮지 않는다.
  const band = page.getByTestId('review-delta-band')
  const boxRect = canvas.locator('[data-testid="review-part-hit"][data-part="CH"]')
  expect(Number(await band.getAttribute('y'))).toBeCloseTo(Number(await boxRect.getAttribute('y')), 6)
  expect(Number(await band.getAttribute('height'))).toBeCloseTo(Number(await boxRect.getAttribute('height')), 6)
})

test('보선이 선택된 채 다른 영역을 누르면 선택만 풀리고, 한 번 더 눌러야 그 영역이 켜진다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const handle = canvas.locator('[data-rail-handle="c0:left"]')
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  const medial = canvas.getByRole('button', { name: '홀자 ㅓ 선택' })
  const initial = canvas.getByRole('button', { name: '첫닿자 ㅁ 선택' })

  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.05), y, { steps: 6 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-held', 'c0:left')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)

  // 첫 탭: 선택만 풀린다. 부품은 그대로 첫닿자, 굵은 보선 · 변화 띠가 빠진다.
  await medial.click()
  await expect(canvas).not.toHaveAttribute('data-held')
  await expect(initial).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas.locator('[data-rail][data-selected]')).toHaveCount(0)
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  // 옮긴 값은 그대로 남아 있다.
  await expect(page.getByTestId('review-reset')).toContainText('1개 변경')

  // 둘째 탭부터 평소대로 그 영역이 켜진다.
  await medial.click()
  await expect(medial).toHaveAttribute('aria-pressed', 'true')
})
