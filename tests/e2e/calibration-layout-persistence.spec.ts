import { expect, test, type Page } from '@playwright/test'

const LAYOUT_KEY = 'font-maker-layout-schemas'
const CALIBRATION_KEY = 'font-maker-calibration-project'
const LAYOUT_TYPE = 'choseong-jungseong-vertical'

type LayoutStorageState = {
  layoutSchemas: Record<string, {
    splits: unknown
    padding: unknown
    partOverrides?: unknown
    userPartOverrides?: unknown
  }>
}

async function readLayoutState(page: Page): Promise<LayoutStorageState> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) throw new Error(`${key} 저장값이 없습니다.`)
    return (JSON.parse(raw) as { state: LayoutStorageState }).state
  }, LAYOUT_KEY)
}

async function resetLayoutWriteCount(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __layoutStorageWriteCount: number }).__layoutStorageWriteCount = 0
  })
}

async function layoutWriteCount(page: Page): Promise<number> {
  return page.evaluate(() => (
    window as unknown as { __layoutStorageWriteCount: number }
  ).__layoutStorageWriteCount)
}

test('Calibration 레이아웃 제스처를 canonical 저장·Undo·Redo·재접속으로 복원한다', async ({ page }) => {
  await page.addInitScript(({ layoutKey }) => {
    if (sessionStorage.getItem('calibration-layout-persistence-initialized') !== 'true') {
      localStorage.clear()
      sessionStorage.setItem('calibration-layout-persistence-initialized', 'true')
    }
    const originalSetItem = Storage.prototype.setItem
    ;(window as unknown as { __layoutStorageWriteCount: number }).__layoutStorageWriteCount = 0
    Storage.prototype.setItem = function setItem(key: string, value: string): void {
      if (key === layoutKey) {
        ;(window as unknown as { __layoutStorageWriteCount: number }).__layoutStorageWriteCount += 1
      }
      originalSetItem.call(this, key, value)
    }
  }, { layoutKey: LAYOUT_KEY })
  await page.goto('/')
  await page.waitForTimeout(450)
  await resetLayoutWriteCount(page)

  await page.getByRole('button', { name: '보정 문장 직접 입력' }).click()
  await page.getByRole('textbox', { name: '보정 문장 직접 입력' }).fill('에 네')
  const focused = page.getByRole('region', { name: '에 완성 글자 편집' }).locator('svg')
  await focused.locator('path').nth(1).click({ force: true })
  await expect(page.getByText(/중성 영역 · 같은 구조의 글자에 함께 적용/)).toBeVisible()

  const beforeState = await readLayoutState(page)
  const beforeSchema = structuredClone(beforeState.layoutSchemas[LAYOUT_TYPE])
  const trackpad = page.getByRole('group', { name: '선택한 글자 형태를 조절하는 트랙패드' })
  const box = await trackpad.boundingBox()
  if (!box) throw new Error('트랙패드 위치를 찾지 못했습니다.')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, { steps: 5 })
  await trackpad.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })
  await page.mouse.up()
  await page.waitForTimeout(450)
  expect(await layoutWriteCount(page)).toBe(0)
  expect((await readLayoutState(page)).layoutSchemas[LAYOUT_TYPE]).toEqual(beforeSchema)
  await expect(page.getByRole('button', { name: '마지막 편집 되돌리기' })).toBeDisabled()

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()

  await expect.poll(() => layoutWriteCount(page)).toBe(1)
  const afterState = await readLayoutState(page)
  const afterSchema = structuredClone(afterState.layoutSchemas[LAYOUT_TYPE])
  expect(afterSchema.userPartOverrides).not.toEqual(beforeSchema.userPartOverrides)
  expect(afterSchema.splits).toEqual(beforeSchema.splits)
  expect(afterSchema.padding).toEqual(beforeSchema.padding)
  expect(afterSchema.partOverrides).toEqual(beforeSchema.partOverrides)
  const calibrationAfterCommit = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null
  }, CALIBRATION_KEY)
  expect(calibrationAfterCommit).not.toBeNull()
  expect(calibrationAfterCommit).not.toHaveProperty('layoutProfile')

  await resetLayoutWriteCount(page)
  await page.getByRole('button', { name: '마지막 편집 되돌리기' }).click()
  await expect.poll(() => layoutWriteCount(page)).toBe(1)
  const undone = (await readLayoutState(page)).layoutSchemas[LAYOUT_TYPE]
  expect(undone.userPartOverrides).toEqual(beforeSchema.userPartOverrides)
  expect(undone.splits).toEqual(beforeSchema.splits)
  expect(undone.padding).toEqual(beforeSchema.padding)
  expect(undone.partOverrides).toEqual(beforeSchema.partOverrides)

  await resetLayoutWriteCount(page)
  await page.getByRole('button', { name: '되돌린 편집 다시 실행' }).click()
  await expect.poll(() => layoutWriteCount(page)).toBe(1)
  const redone = (await readLayoutState(page)).layoutSchemas[LAYOUT_TYPE]
  expect(redone.userPartOverrides).toEqual(afterSchema.userPartOverrides)
  expect(redone.splits).toEqual(beforeSchema.splits)
  expect(redone.padding).toEqual(beforeSchema.padding)
  expect(redone.partOverrides).toEqual(beforeSchema.partOverrides)

  await page.reload()
  await expect(page.getByRole('button', { name: '마지막 편집 되돌리기' })).toBeDisabled()
  const reloaded = (await readLayoutState(page)).layoutSchemas[LAYOUT_TYPE]
  expect(reloaded.userPartOverrides).toEqual(afterSchema.userPartOverrides)
  const calibrationAfterReload = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null
  }, CALIBRATION_KEY)
  expect(calibrationAfterReload).not.toHaveProperty('layoutProfile')
})
