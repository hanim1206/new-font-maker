import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const GRID2_KEY = 'font-maker-grid-system-2-lab-v1'

async function resetGridWriteCount(page: Page) {
  await page.evaluate(() => { (window as unknown as { __grid2WriteCount: number }).__grid2WriteCount = 0 })
}

async function gridWriteCount(page: Page) {
  return page.evaluate(() => (window as unknown as { __grid2WriteCount: number }).__grid2WriteCount)
}

async function restoreCellTouchingCurve(page: Page, cornerLabel: string | null) {
  const match = cornerLabel?.match(/(\d+)-(\d+)$/)
  if (!match) throw new Error('곡률 모서리 좌표를 읽지 못했습니다.')
  const xIndex = Number(match[1]) - 1
  const yIndex = Number(match[2]) - 1
  for (const row of [yIndex, yIndex + 1]) {
    for (const column of [xIndex, xIndex + 1]) {
      if (row < 1 || column < 1) continue
      const cell = page.getByRole('button', { name: `${row}행 ${column}열 비우기`, exact: true })
      if (await cell.count() === 0) continue
      await cell.click()
      await expect(cell).toHaveAttribute('aria-label', `${row}행 ${column}열 비우기`)
      return
    }
  }
  throw new Error('곡률 모서리와 맞닿은 점유 칸을 찾지 못했습니다.')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    if (sessionStorage.getItem('grid-system-2-lab-initialized') !== 'true') {
      localStorage.clear()
      sessionStorage.setItem('grid-system-2-lab-initialized', 'true')
    }
    const originalSetItem = Storage.prototype.setItem
    ;(window as unknown as { __grid2WriteCount: number }).__grid2WriteCount = 0
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === storageKey) (window as unknown as { __grid2WriteCount: number }).__grid2WriteCount += 1
      originalSetItem.call(this, key, value)
    }
  }, { storageKey: GRID2_KEY })
  await page.goto('/grid-lab')
})

test('채우기·레일·곡률 제스처는 놓을 때 한 번 저장하고 취소하면 완전히 롤백한다', async ({ page }) => {
  const shape = page.locator('[data-grid2-shape="ㄱ"]').first()
  const initialPath = await shape.getAttribute('d')
  const initialRaw = await page.evaluate((key) => localStorage.getItem(key), GRID2_KEY)
  const fillStart = page.getByRole('button', { name: '2행 1열 채우기', exact: true })
  const fillEnd = page.getByRole('button', { name: '2행 3열 채우기', exact: true })
  const fillStartCell = page.locator('[data-grid2-cell="1-0"]')
  const fillStartBox = await fillStart.boundingBox()
  const fillEndBox = await fillEnd.boundingBox()
  if (!fillStartBox || !fillEndBox) throw new Error('채우기 드래그 칸을 찾지 못했습니다.')

  await resetGridWriteCount(page)
  await page.mouse.move(fillStartBox.x + fillStartBox.width / 2, fillStartBox.y + fillStartBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(fillEndBox.x + fillEndBox.width / 2, fillEndBox.y + fillEndBox.height / 2, { steps: 6 })
  await fillStartCell.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })
  await page.mouse.up()
  await expect(shape).toHaveAttribute('d', initialPath ?? '')
  await expect(page.locator('main')).toHaveAttribute('data-grid2-history-count', '0')
  expect(await gridWriteCount(page)).toBe(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), GRID2_KEY)).toBe(initialRaw)

  await page.mouse.move(fillStartBox.x + fillStartBox.width / 2, fillStartBox.y + fillStartBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(fillEndBox.x + fillEndBox.width / 2, fillEndBox.y + fillEndBox.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await gridWriteCount(page)).toBe(1)
  await expect(page.locator('main')).toHaveAttribute('data-grid2-history-count', '1')
  await page.getByRole('button', { name: '실행 취소' }).click()
  await expect(shape).toHaveAttribute('d', initialPath ?? '')

  await page.getByRole('radio', { name: '레일', exact: true }).click()
  const rail = page.getByRole('slider', { name: '세로 레일 1', exact: true })
  const railBefore = await rail.getAttribute('aria-valuenow')
  const railBox = await rail.boundingBox()
  if (!railBox) throw new Error('레일 위치를 찾지 못했습니다.')
  const rawBeforeRail = await page.evaluate((key) => localStorage.getItem(key), GRID2_KEY)
  await resetGridWriteCount(page)
  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(railBox.x + railBox.width / 2 + 30, railBox.y + railBox.height / 2, { steps: 5 })
  await rail.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })
  await page.mouse.up()
  await expect(rail).toHaveAttribute('aria-valuenow', railBefore ?? '')
  expect(await gridWriteCount(page)).toBe(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), GRID2_KEY)).toBe(rawBeforeRail)

  await page.getByRole('radio', { name: '곡률', exact: true }).click()
  await page.getByRole('button', { name: /곡률 모서리/ }).first().click()
  const curvePlane = page.locator('[data-grid2-curve-plane="active"]')
  const curvePlaneBox = await curvePlane.boundingBox()
  if (!curvePlaneBox) throw new Error('곡률 조절 영역을 찾지 못했습니다.')
  await page.mouse.move(curvePlaneBox.x + 8, curvePlaneBox.y + 8)
  await page.mouse.down()
  await page.mouse.move(curvePlaneBox.x + curvePlaneBox.width - 8, curvePlaneBox.y + curvePlaneBox.height - 8, { steps: 4 })
  await curvePlane.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })
  await page.mouse.up()
  await expect(page.locator('[data-grid2-curve-preview="active"]')).toHaveCount(0)
  expect(await gridWriteCount(page)).toBe(0)
})

test('손상되거나 미래 버전인 Grid v1 저장값은 화면 진입만으로 덮어쓰지 않는다', async ({ page }) => {
  const malformed = '{"version":99,"future":true}'
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: GRID2_KEY, raw: malformed })
  await resetGridWriteCount(page)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('저장 데이터 확인 필요')
  await page.waitForTimeout(450)
  expect(await gridWriteCount(page)).toBe(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), GRID2_KEY)).toBe(malformed)
})

test('칸 점유·부분 곡률·외곽 사선화를 실행 취소와 함께 편집한다', async ({ page }) => {
  const shape = page.locator('[data-grid2-shape="ㄱ"]').first()
  const initialPath = await shape.getAttribute('d')

  const fillStart = page.getByRole('button', { name: '2행 1열 채우기', exact: true })
  const fillEnd = page.getByRole('button', { name: '2행 3열 채우기', exact: true })
  const fillStartBox = await fillStart.boundingBox()
  const fillEndBox = await fillEnd.boundingBox()
  if (!fillStartBox || !fillEndBox) throw new Error('채우기 드래그 칸을 찾지 못했습니다.')
  await page.mouse.move(fillStartBox.x + fillStartBox.width / 2, fillStartBox.y + fillStartBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(fillEndBox.x + fillEndBox.width / 2, fillEndBox.y + fillEndBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => shape.getAttribute('d')).not.toBe(initialPath)
  await expect(page.getByRole('button', { name: '2행 1열 비우기', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '2행 2열 비우기', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '2행 3열 비우기', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '실행 취소' }).click()
  await expect(shape).toHaveAttribute('d', initialPath ?? '')
  await expect(page.getByRole('button', { name: '2행 2열 채우기', exact: true })).toBeVisible()

  await page.getByRole('radio', { name: '곡률', exact: true }).click()
  const curveCorner = page.getByRole('button', { name: /곡률 모서리/ }).first()
  const curveCornerLabel = await curveCorner.getAttribute('aria-label')
  const curveHoverPreview = curveCorner.locator('xpath=..').locator('[data-grid2-curve-area-preview="candidate"]')
  await expect(curveHoverPreview).toHaveCSS('opacity', '0')
  await curveCorner.hover()
  await expect(curveHoverPreview).toHaveCSS('opacity', '1')
  await curveCorner.click()
  await expect(page.locator('[data-grid2-curve-preview="active"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /곡률 시작점/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /곡률 끝점/ })).toHaveCount(0)
  const curvePlane = page.locator('[data-grid2-curve-plane="active"]')
  const curvePlaneBox = await curvePlane.boundingBox()
  if (!curvePlaneBox) throw new Error('곡률 범위 조절 영역을 찾지 못했습니다.')
  const curveHandle = page.locator('[data-grid2-curve-handle="active"]')
  const readHandlePosition = async () => `${await curveHandle.getAttribute('cx')},${await curveHandle.getAttribute('cy')}`
  const handleBefore = await readHandlePosition()
  const curveHandleBox = await curveHandle.boundingBox()
  if (!curveHandleBox) throw new Error('곡률 범위 핸들을 찾지 못했습니다.')
  const handleCenter = { x: curveHandleBox.x + curveHandleBox.width / 2, y: curveHandleBox.y + curveHandleBox.height / 2 }
  const planeCorners = [
    { x: curvePlaneBox.x + 8, y: curvePlaneBox.y + 8 },
    { x: curvePlaneBox.x + curvePlaneBox.width - 8, y: curvePlaneBox.y + 8 },
    { x: curvePlaneBox.x + 8, y: curvePlaneBox.y + curvePlaneBox.height - 8 },
    { x: curvePlaneBox.x + curvePlaneBox.width - 8, y: curvePlaneBox.y + curvePlaneBox.height - 8 },
  ].sort((a, b) => Math.hypot(b.x - handleCenter.x, b.y - handleCenter.y) - Math.hypot(a.x - handleCenter.x, a.y - handleCenter.y))
  await page.mouse.move(planeCorners[0].x, planeCorners[0].y)
  await expect.poll(readHandlePosition).not.toBe(handleBefore)
  const handleAtStart = await readHandlePosition()
  await page.mouse.down()
  await page.mouse.move(planeCorners.at(-1)!.x, planeCorners.at(-1)!.y, { steps: 5 })
  await expect.poll(readHandlePosition).not.toBe(handleAtStart)
  await page.mouse.up()
  await expect.poll(() => shape.getAttribute('d')).toContain(' Q ')
  await expect(page.getByText('1개 모서리', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: '채우기', exact: true }).click()
  await restoreCellTouchingCurve(page, curveCornerLabel)
  await expect(page.getByText('직각', { exact: true })).toBeVisible()
  await expect.poll(() => shape.getAttribute('d')).not.toContain(' Q ')

  await page.getByRole('radio', { name: '사선', exact: true }).click()
  await expect(page.getByRole('radio', { name: '절단', exact: true })).toHaveCount(0)
  const diagonalCorner = page.getByRole('button', { name: /사선 모서리/ }).first()
  const diagonalHoverPreview = diagonalCorner.locator('xpath=..').locator('[data-grid2-diagonal-area-preview="candidate"]')
  await expect(diagonalHoverPreview).toHaveCSS('opacity', '0')
  await diagonalCorner.hover()
  await expect(diagonalHoverPreview).toHaveCSS('opacity', '1')
  const beforeDiagonal = await shape.getAttribute('d')
  const diagonalCornerBox = await diagonalCorner.boundingBox()
  if (!diagonalCornerBox) throw new Error('사선 모서리를 찾지 못했습니다.')
  await page.mouse.move(diagonalCornerBox.x + diagonalCornerBox.width / 2, diagonalCornerBox.y + diagonalCornerBox.height / 2)
  await page.mouse.down()
  const diagonalPlane = page.locator('[data-grid2-diagonal-plane="active"]')
  const diagonalPlaneBox = await diagonalPlane.boundingBox()
  if (!diagonalPlaneBox) throw new Error('사선 범위 조절 영역을 찾지 못했습니다.')
  await page.mouse.move(diagonalPlaneBox.x + diagonalPlaneBox.width / 2, diagonalPlaneBox.y + diagonalPlaneBox.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => shape.getAttribute('d')).not.toBe(beforeDiagonal)
  await expect(page.getByText('1개 외곽', { exact: true })).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-grid2-history-count', '3')
  await expect(page.locator('[data-grid2-cut-stamp-preview]')).toHaveCount(0)
  await page.getByRole('button', { name: '실행 취소' }).click()
  await expect(page.getByText('없음', { exact: true })).toBeVisible()
})

test('사선 도구와 자모 탭을 오가면 진행 중인 외곽 선택을 초기화한다', async ({ page }) => {
  await page.getByRole('radio', { name: '사선', exact: true }).click()
  await page.getByRole('button', { name: /사선 모서리/ }).first().click()
  await expect(page.getByText('쐐기 면 안을 끌거나 눌러 교체할 외곽 구간을 정하세요.', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: '채우기', exact: true }).click()
  await page.getByRole('radio', { name: '사선', exact: true }).click()
  await expect(page.getByText('사선으로 바꿀 볼록한 외곽 모서리를 고르세요.', { exact: true })).toBeVisible()
  await expect(page.locator('[data-grid2-diagonal-preview="active"]')).toHaveCount(0)

  await page.getByRole('button', { name: /사선 모서리/ }).first().click()
  await page.getByRole('navigation', { name: '실험 자모' }).getByRole('button', { name: 'ㄴ', exact: true }).click()
  await expect(page.getByText('사선으로 바꿀 볼록한 외곽 모서리를 고르세요.', { exact: true })).toBeVisible()
})

test('수치 입력과 스냅으로 공통 레일을 움직이고 복원한다', async ({ page }) => {
  await page.getByRole('navigation', { name: '실험 자모' }).getByRole('button', { name: 'ㄴ', exact: true }).click()
  await page.getByRole('radio', { name: '레일', exact: true }).click()
  const selectedShape = page.locator('[data-grid2-shape="ㄴ"]').first()
  const liveShape = page.locator('[data-grid2-shape="ㅁ"]').first()
  const selectedBefore = await selectedShape.getAttribute('d')
  const liveBefore = await liveShape.getAttribute('d')
  const canvas = await page.getByRole('application', { name: 'ㄴ 형태 그리드' }).boundingBox()
  if (!canvas) throw new Error('형태 그리드 캔버스를 찾지 못했습니다.')
  const rail = page.getByRole('slider', { name: '세로 레일 1', exact: true })
  const railBefore = Number(await rail.getAttribute('aria-valuenow'))
  const startX = canvas.x + canvas.width * railBefore / 1000
  const centerY = canvas.y + canvas.height * 0.3

  await page.mouse.move(startX, centerY)
  await page.mouse.down()
  await page.mouse.move(startX + 24, centerY, { steps: 5 })
  await page.mouse.up()
  const draggedValue = Number(await rail.getAttribute('aria-valuenow'))
  expect(draggedValue).not.toBe(railBefore)
  expect(draggedValue % 25).toBe(0)

  const position = page.getByRole('spinbutton', { name: '선택 레일 위치', exact: true })

  await position.fill('276')
  await position.press('Enter')
  await expect(position).toHaveValue('275')
  await expect.poll(() => selectedShape.getAttribute('d')).not.toBe(selectedBefore)
  await expect.poll(() => liveShape.getAttribute('d')).not.toBe(liveBefore)

  await page.reload()
  await page.getByRole('radio', { name: '레일', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '선택 레일 위치', exact: true })).toHaveValue('275')
  await expect(page.locator('input[type="range"]')).toHaveCount(0)
})

test('가로·세로 레일을 추가하고 선택 레일을 삭제한다', async ({ page }) => {
  await page.getByRole('radio', { name: '레일', exact: true }).click()
  const shape = page.locator('[data-grid2-shape="ㄱ"]').first()
  const before = await shape.getAttribute('d')

  await page.getByRole('button', { name: '세로선 추가', exact: true }).click()
  await expect(page.getByText('7 × 6칸', { exact: true })).toBeVisible()
  await expect(shape).toHaveAttribute('d', before ?? '')
  await page.getByRole('button', { name: '선 삭제', exact: true }).click()
  await expect(page.getByText('6 × 6칸', { exact: true })).toBeVisible()
  await expect(shape).toHaveAttribute('d', before ?? '')

  await page.getByRole('button', { name: '가로선 추가', exact: true }).click()
  await expect(page.getByText('6 × 7칸', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '전체 초기화', exact: true }).click()
  await expect(page.getByText('6 × 6칸', { exact: true })).toBeVisible()
})

test('390px 모바일 화면에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileFillStart = page.getByRole('button', { name: '2행 1열 채우기', exact: true })
  const mobileFillEnd = page.getByRole('button', { name: '2행 3열 채우기', exact: true })
  const mobileFillStartBox = await mobileFillStart.boundingBox()
  const mobileFillEndBox = await mobileFillEnd.boundingBox()
  if (!mobileFillStartBox || !mobileFillEndBox) throw new Error('모바일 채우기 드래그 칸을 찾지 못했습니다.')
  await page.mouse.move(mobileFillStartBox.x + mobileFillStartBox.width / 2, mobileFillStartBox.y + mobileFillStartBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(mobileFillEndBox.x + mobileFillEndBox.width / 2, mobileFillEndBox.y + mobileFillEndBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: '2행 2열 비우기', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '실행 취소' }).click()
  await page.getByRole('radio', { name: '곡률', exact: true }).click()
  const mobileCurveCorner = page.getByRole('button', { name: /곡률 모서리/ }).first()
  const mobileCurveCornerLabel = await mobileCurveCorner.getAttribute('aria-label')
  const mobileCornerBox = await mobileCurveCorner.boundingBox()
  if (!mobileCornerBox) throw new Error('모바일 곡률 모서리를 찾지 못했습니다.')
  await mobileCurveCorner.click()
  const mobileHandleBox = await page.locator('[data-grid2-curve-handle="active"]').boundingBox()
  if (!mobileHandleBox) throw new Error('모바일 곡률 핸들을 찾지 못했습니다.')
  const mobileCellCenter = {
    x: (mobileCornerBox.x + mobileCornerBox.width / 2 + mobileHandleBox.x + mobileHandleBox.width / 2) / 2,
    y: (mobileCornerBox.y + mobileCornerBox.height / 2 + mobileHandleBox.y + mobileHandleBox.height / 2) / 2,
  }
  expect(Math.hypot(mobileCellCenter.x - (mobileHandleBox.x + mobileHandleBox.width / 2), mobileCellCenter.y - (mobileHandleBox.y + mobileHandleBox.height / 2))).toBeGreaterThan(8)
  await page.mouse.click(mobileCellCenter.x, mobileCellCenter.y)
  await expect(page.getByText('1개 모서리', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: '채우기', exact: true }).click()
  await restoreCellTouchingCurve(page, mobileCurveCornerLabel)
  await expect(page.getByText('직각', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: '사선', exact: true }).click()
  await page.getByRole('button', { name: /사선 모서리/ }).first().click()
  const mobileDiagonalPlaneBox = await page.locator('[data-grid2-diagonal-plane="active"]').boundingBox()
  if (!mobileDiagonalPlaneBox) throw new Error('모바일 사선 범위 영역을 찾지 못했습니다.')
  await page.mouse.click(mobileDiagonalPlaneBox.x + mobileDiagonalPlaneBox.width / 2, mobileDiagonalPlaneBox.y + mobileDiagonalPlaneBox.height / 2)
  await expect(page.getByText('1개 외곽', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(page.getByRole('button', { name: '전체 초기화', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '공통 그리드 미리보기' })).toBeVisible()
})
