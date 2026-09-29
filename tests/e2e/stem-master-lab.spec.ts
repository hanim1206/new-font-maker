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

  // 남은 것: 자소 편집에서 획을 통째로 옮기면 끝점과 핸들이 같이 가서 여전히 `따름`이다(맞는 성질). 풀리게 하려면 점 하나만 옮겨야 하는데
  // 점 펼치기(`pointsOpen`) 조작을 e2e에서 아직 못 잡았다. 그 뒤 `다시 따르기`까지 잇는다.
  test.fixme('G1: 안쪽 기둥은 따로 그리면 갈라지고, 자소 편집에서 만진 획은 풀려서 남으며, 다시 따르기로 붙는다', async ({ page }) => {
    await page.goto('/stem-master-lab')
    const siblings = page.getByTestId('siblings')
    const bend = async (dx: number) => {
      const handle = page.getByTestId('master-canvas-open').getByTestId('master-handle-handleOut')
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 6 })
      await page.mouse.up()
    }
    // 기둥을 휘면 ㅐ의 안쪽 기둥도 같이 휜다(따로 그리기 전).
    await bend(30)
    await page.getByRole('radio', { name: /기둥\.안쪽/ }).click()
    const ae = siblings.locator('article[data-char="ㅐ"]')
    await expect(ae).toHaveAttribute('data-curved', 'true')
    await expect(ae).toHaveAttribute('data-follow', 'true')
    // 안쪽 기둥을 따로(반대로) 그리면 갈라진다 — 기둥 쪽 ㅐ-3은 그대로.
    await bend(-40)
    await expect(ae).toHaveAttribute('data-follow', 'true')
    await expect(page.getByRole('button', { name: '기둥을 따르게' })).toBeEnabled()
    await page.getByRole('radio', { name: /^기둥$|^기둥 ●$/ }).click()
    await expect(siblings.locator('article[data-char="ㅐ"]')).toHaveAttribute('data-follow', 'true')

    // 자소 편집(아 · 중성)에서 ㅏ-1 기둥을 트랙패드로 옮긴다 → 풀림.
    await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
    const editor = page.getByRole('region', { name: /완성 글자 편집/ })
    const hit = editor.locator('svg [data-editor-hit="stroke"][data-stroke-id="ㅏ-1"]')
    await hit.dispatchEvent('pointerdown')
    await hit.dispatchEvent('pointerdown')
    await expect(editor.locator('svg [data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)
    const pad = (await page.getByTestId('jamo-stroke-trackpad').boundingBox())!
    await page.mouse.move(pad.x + 100, pad.y + pad.height / 2)
    await page.mouse.down()
    await page.mouse.move(pad.x + 130, pad.y + pad.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

    await page.goto('/stem-master-lab')
    const a = page.getByTestId('siblings').locator('article[data-char="ㅏ"]')
    await expect(a).toHaveAttribute('data-follow', 'false')
    await expect(page.getByTestId('siblings').locator('article[data-char="ㅕ"]')).toHaveAttribute('data-follow', 'true')
    // 마스터를 다시 바꿔도 풀린 ㅏ는 그대로.
    await bend(-10)
    await expect(a).toHaveAttribute('data-follow', 'false')
    await a.getByRole('button', { name: '다시 따르기' }).click()
    await expect(a).toHaveAttribute('data-follow', 'true')
  })
})
