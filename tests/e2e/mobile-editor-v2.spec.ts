import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/editor-v2')
})

test('획 이동을 한 번 저장하고 과거 상태로 복원한다', async ({ page }) => {
  const stroke = page.getByRole('button', { name: 'ㄱ ㄱ-1 획 선택' })
  await expect(page.getByRole('heading', { name: '곰 편집' })).toBeVisible()
  const strokeBox = await stroke.boundingBox()
  if (!strokeBox) throw new Error('선택할 획의 위치를 찾지 못했습니다.')
  const strokeTap = { x: strokeBox.x + strokeBox.width / 2, y: strokeBox.y + 3 }
  await page.touchscreen.tap(strokeTap.x, strokeTap.y)
  await expect(page.getByText('선택된 획 ㄱ-1')).toBeVisible()

  const trackpad = page.getByRole('group', { name: '선택한 획을 상하좌우로 움직이는 트랙패드' })
  await trackpad.scrollIntoViewIfNeeded()
  const box = await trackpad.boundingBox()
  if (!box) throw new Error('트랙패드 위치를 찾지 못했습니다.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 32, box.y + box.height / 2 - 18, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByText('저장됨')).toBeVisible()

  await page.getByRole('button', { name: '편집 히스토리' }).click()
  await expect(page.getByRole('heading', { name: '편집 히스토리' })).toBeVisible()
  await expect(page.getByText(/ㄱ 획 · 왼쪽/)).toBeVisible()
  await page.getByRole('button', { name: /ㄱ 획 · 왼쪽/ }).click()
  await expect(page.getByRole('heading', { name: '변경 비교' })).toBeVisible()
  await page.getByRole('button', { name: '변경 전으로 복원' }).click()
  await expect(page.getByRole('heading', { name: '곰 편집' })).toBeVisible()

  await page.getByRole('button', { name: '편집 히스토리' }).click()
  await expect(page.getByText('과거 상태 복원')).toBeVisible()
})

test('키보드와 44px 터치 대상으로 같은 편집 흐름에 접근한다', async ({ page }) => {
  const stroke = page.getByRole('button', { name: 'ㄱ ㄱ-1 획 선택' })
  await stroke.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('선택된 획 ㄱ-1')).toBeVisible()

  const trackpad = page.getByRole('group', { name: '선택한 획을 상하좌우로 움직이는 트랙패드' })
  await trackpad.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('저장됨')).toBeVisible()

  for (const buttonName of ['뒤로', '편집 히스토리', '마지막 편집 실행 취소', '정밀']) {
    const box = await page.getByRole('button', { name: buttonName }).boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasHorizontalOverflow).toBe(false)
})

test('자동 저장된 마지막 편집을 트랙패드에서 즉시 취소한다', async ({ page }) => {
  const stroke = page.getByRole('button', { name: 'ㄱ ㄱ-1 획 선택' })
  await stroke.focus()
  await page.keyboard.press('Enter')
  const trackpad = page.getByRole('group', { name: '선택한 획을 상하좌우로 움직이는 트랙패드' })
  await trackpad.focus()
  await page.keyboard.press('ArrowLeft')

  const undo = page.getByRole('button', { name: '마지막 편집 실행 취소' })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(undo).toBeDisabled()

  await page.getByRole('button', { name: '편집 히스토리' }).click()
  await expect(page.getByText('실행 취소', { exact: true })).toBeVisible()
})

test('다른 자소의 끝선에 가까워지면 스마트 안내선을 알린다', async ({ page }) => {
  const stroke = page.getByRole('button', { name: 'ㄱ ㄱ-1 획 선택' })
  const strokeBox = await stroke.boundingBox()
  if (!strokeBox) throw new Error('선택할 획의 위치를 찾지 못했습니다.')
  await page.touchscreen.tap(strokeBox.x + strokeBox.width / 2, strokeBox.y + 3)

  const trackpad = page.getByRole('group', { name: '선택한 획을 상하좌우로 움직이는 트랙패드' })
  await trackpad.scrollIntoViewIfNeeded()
  const box = await trackpad.boundingBox()
  if (!box) throw new Error('트랙패드 위치를 찾지 못했습니다.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 8, box.y + box.height / 2, { steps: 2 })
  await expect(page.getByRole('status').filter({ hasText: '맞춤' })).toBeVisible()
  await page.mouse.up()
})
