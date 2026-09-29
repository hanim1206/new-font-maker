import { expect, test } from '@playwright/test'

test.describe('홀자 줄기 마스터 랩', () => {
  test('기둥 마스터의 핸들을 끌면 형제 기둥이 전부 휘고, 곧게 하면 돌아온다', async ({ page }) => {
    await page.goto('/stem-master-lab')
    await expect(page.getByTestId('stem-master-lab')).toBeVisible()
    const siblings = page.getByTestId('siblings')
    await expect(siblings.locator('article[data-char="ㅏ"]')).toHaveAttribute('data-curved', 'false')
    await expect(siblings.locator('article[data-char="ㅘ"]')).toHaveAttribute('data-follow', 'true')
    await expect(siblings.locator('article[data-char="ㅣ"]')).toHaveAttribute('data-follow', 'blocked')

    const canvas = page.getByTestId('master-canvas-open')
    const handle = canvas.getByTestId('master-handle-handleOut')
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()

    await expect(canvas.getByTestId('master-stroke')).toHaveAttribute('data-curved', 'true')
    for (const char of ['ㅏ', 'ㅕ', 'ㅐ', 'ㅘ']) {
      const card = siblings.locator(`article[data-char="${char}"]`)
      await expect(card, char).toHaveAttribute('data-curved', 'true')
      await expect(card, char).toHaveAttribute('data-follow', 'true')
    }

    await expect(siblings.locator('article[data-char="ㅣ"]')).toHaveAttribute('data-curved', 'false')

    await page.getByRole('button', { name: '곧게' }).click()
    await expect(siblings.locator('article[data-char="ㅏ"]')).toHaveAttribute('data-curved', 'false')
    await expect(canvas.getByTestId('master-stroke')).toHaveAttribute('data-curved', 'false')
  })
})
