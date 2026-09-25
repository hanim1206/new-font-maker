import { expect, test } from '@playwright/test'

// 보선 끌기 배율(`GlyphLayoutEditor` RAIL_DRAG_GAIN). 손은 옮길 em의 1/배율만큼 간다.
const DRAG_GAIN = 0.7

/**
 * 상시 저장: 보선을 끄는 동안은 미리보기(캔버스 · 닿는 글자 줄은 실시간), 손을 떼는 순간 켠 옵션에 저장된다.
 * 하단 바 · 복원 · 저장 버튼은 없다. 되돌리기는 셸 머리.
 */
test('보선을 끄는 동안은 저장하지 않고, 손을 떼면 켠 옵션에 저장된다', async ({ page }) => {
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
  const stored = page.locator('[data-testid="layout-override-card"][data-stored="true"]')
  const undo = page.getByRole('button', { name: '형태 편집 실행 취소' })

  await expect(page.getByTestId('jamo-stroke-cta-bar')).toHaveCount(0)
  await expect(stored).toHaveCount(0)
  await expect(undo).toBeDisabled()
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.03 / DRAG_GAIN), y, { steps: 6 })
  // 끄는 중: 캔버스의 Δ 수치는 실시간, 저장은 아직.
  await expect(page.getByTestId('review-delta-label')).toHaveCount(1)
  await expect(stored).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await page.mouse.up()
  // 놓는 순간 저장 · 기록 한 줄. 세션 편집은 비고 하단 바는 없다.
  await expect(stored).toHaveCount(1)
  await expect(undo).toBeEnabled()
  await expect(page.getByTestId('jamo-stroke-cta-bar')).toHaveCount(0)
  await expect(page.getByTestId('review-reset')).toHaveCount(0)

  // 되돌리면 저장이 빠진다.
  await undo.click()
  await expect(stored).toHaveCount(0)
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
  await page.mouse.move(pxOf(x1) - 300 / DRAG_GAIN, y, { steps: 12 })
  expect(Number(await handle.getAttribute('x1'))).toBeCloseTo(0, 3)
  await page.mouse.move(pxOf(x1) + 600 / DRAG_GAIN, y, { steps: 24 })
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
  await page.mouse.move(pxOf(x1 + 0.06 / DRAG_GAIN), y, { steps: 6 })
  await expect(rail).toHaveAttribute('data-dragging', 'true')
  expect(await width()).toBeLessThan(0.006)
  // 모델 자리로 돌아오면 걸린다. 선 색은 안 바뀌고 여전히 얇다(번쩍임을 뺐다).
  await page.mouse.move(pxOf(x1 + 0.002 / DRAG_GAIN), y, { steps: 4 })
  await expect(rail).toHaveAttribute('data-snapped', 'true')
  await expect(line).toHaveAttribute('stroke', partColor!)
  expect(await width()).toBeLessThan(0.006)

  // 모델 자리에서 떼면 Δ가 없어 띠도 없다. 벌려 놓고 뗀다.
  await page.mouse.move(pxOf(x1 + 0.05 / DRAG_GAIN), y, { steps: 4 })
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
  await page.mouse.move(pxOf(x1 + 0.05 / DRAG_GAIN), y, { steps: 6 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-held', 'c0:left')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)

  // 첫 탭: 선택만 풀린다. 부품은 그대로 첫닿자, 굵은 보선이 빠진다. 변화 띠는 이 영역에서 옮긴 것이라 남는다.
  await medial.click()
  await expect(canvas).not.toHaveAttribute('data-held')
  await expect(initial).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas.locator('[data-rail][data-selected]')).toHaveCount(0)
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)
  // 옮긴 값은 그대로 남아 있다.
  await expect(page.locator('[data-testid="layout-override-card"][data-stored="true"]').first()).toBeVisible()

  // 둘째 탭부터 평소대로 그 영역이 켜진다.
  await medial.click()
  await expect(medial).toHaveAttribute('aria-pressed', 'true')
})

test('켠 영역의 보선을 옮긴 뒤 같은 영역의 다른 보선은 바로 잡아 옮긴다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  const drag = async (id: string) => {
    const handle = canvas.locator(`[data-rail-handle="${id}"]`)
    const x1 = Number(await handle.getAttribute('x1'))
    await page.mouse.move(pxOf(x1), y)
    await page.mouse.down()
    await page.mouse.move(pxOf(x1 + 0.05 / DRAG_GAIN), y, { steps: 6 })
    await page.mouse.up()
    return { before: x1, after: Number(await handle.getAttribute('x1')) }
  }
  await drag('c0:left')
  await expect(canvas).toHaveAttribute('data-held', 'c0:left')
  const right = await drag('c0:right')
  expect(right.after - right.before).toBeGreaterThan(0.03)
  await expect(canvas).toHaveAttribute('data-held', 'c0:right')
  // 변화 띠는 선택한 보선 하나가 아니라 이 영역에서 옮긴 보선 전부.
  await expect(page.getByTestId('review-delta-band')).toHaveCount(2)
})

test('보선을 처음 자리로 되돌려 켜진 상자 위에서 손을 떼도 획 편집으로 가지 않는다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const handle = canvas.locator('[data-rail-handle="c0:left"]')
  const x1 = Number(await handle.getAttribute('x1'))
  const box = (await canvas.boundingBox())!
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height
  const initial = canvas.locator('[data-testid="review-part-hit"][data-part="CH"]')
  const strokeTools = page.getByTestId('jamo-stroke-tools')

  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.05 / DRAG_GAIN), y, { steps: 6 })
  await page.mouse.move(pxOf(x1 + 0.002 / DRAG_GAIN), y, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('review-delta-label')).toHaveCount(0)
  // 터치 브라우저는 끌기를 끝낸 클릭을 손 밑 상자로 보낸다. 그 클릭은 먹는다.
  await initial.dispatchEvent('click')
  await expect(strokeTools).toHaveCount(0)
  // 다음 탭은 선택만 풀고, 그다음 탭에 획 편집으로 간다.
  await initial.click()
  await expect(strokeTools).toHaveCount(0)
  await initial.click()
  await expect(strokeTools).toBeVisible()
})
