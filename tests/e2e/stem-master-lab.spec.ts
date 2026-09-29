import { expect, test } from '@playwright/test'

test.describe('홀자 줄기 마스터 랩', () => {
  test('기둥 마스터의 핸들을 끌면 형제 기둥이 전부 휘고, 곧게 하면 돌아온다', async ({ page }) => {
    await page.goto('/stem-master-lab')
    await expect(page.getByTestId('stem-master-lab')).toBeVisible()
    const siblings = page.getByTestId('siblings').locator('[data-role="gidung"]')
    await expect(siblings.locator('article[data-char="ㅏ"]')).toHaveAttribute('data-curved', 'false')
    await expect(siblings.locator('article[data-char="ㅘ"]')).toHaveAttribute('data-follow', 'true')
    await expect(siblings.locator('article[data-char="ㅣ"]')).toHaveAttribute('data-follow', 'true')

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

    for (const char of ['ㅣ', 'ㅚ', 'ㅢ']) await expect(siblings.locator(`article[data-char="${char}"]`), char).toHaveAttribute('data-curved', 'true')

    await page.getByRole('button', { name: '고른 갈래 곧게' }).click()
    await expect(siblings.locator('article[data-char="ㅏ"]')).toHaveAttribute('data-curved', 'false')
    await expect(canvas.getByTestId('master-stroke')).toHaveAttribute('data-curved', 'false')
  })

  test('G1: 안쪽 기둥은 따로 그리면 갈라지고, 자소 편집에서 점 하나를 만진 획은 풀려서 남으며, 다시 따르기로 붙는다', async ({ page }) => {
    await page.goto('/stem-master-lab')
    const bend = async (dx: number) => {
      const handle = page.getByTestId('master-canvas-open').getByTestId('master-handle-handleOut')
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 6 })
      await page.mouse.up()
    }
    // 기둥을 휘면(갈래 둘 다 고른 채) ㅐ의 안쪽 기둥도 같이 휜다.
    await bend(30)
    const inner = page.getByTestId('siblings').locator('[data-role="gidung.inner"] article[data-char="ㅐ"]')
    const outer = page.getByTestId('siblings').locator('[data-role="gidung"] article[data-char="ㅐ"]')
    await expect(inner).toHaveAttribute('data-curved', 'true')
    await expect(inner).toHaveAttribute('data-follow', 'true')
    // 바깥 기둥 갈래를 빼면 바깥은 기본 획(곧게)으로, 안쪽은 휜 채 남는다. 안쪽만 반대로 그리면 갈라진다.
    await page.getByRole('checkbox', { name: /기둥\.바깥/ }).click()
    await expect(outer).toHaveAttribute('data-picked', 'false')
    await expect(outer).toHaveAttribute('data-curved', 'false')
    await expect(inner).toHaveAttribute('data-curved', 'true')
    await bend(-40)
    await expect(inner).toHaveAttribute('data-follow', 'true')
    await expect(outer).toHaveAttribute('data-follow', 'true')
    await expect(outer).toHaveAttribute('data-curved', 'false')
    // 카드를 눌러 다시 고르면 지금 모양이 바깥에도 적용된다.
    await outer.getByRole('button', { name: /고르기/ }).click()
    await expect(outer).toHaveAttribute('data-picked', 'true')
    await expect(outer).toHaveAttribute('data-curved', 'true')

    // 자소 편집(아 · 중성)에서 ㅏ-1 기둥의 점 하나만 옮긴다 → 풀림. 획을 통째로 옮기면 끝점과 핸들이 같이 가서 여전히 따름이다.
    await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
    const editor = page.getByRole('region', { name: /완성 글자 편집/ })
    const hit = editor.locator('svg [data-editor-hit="stroke"][data-stroke-id="ㅏ-1"]')
    await expect(hit).toBeVisible()
    // 피그마식: 누르면 획, 한 번 더(끌지 않고 떼면) 점이 펼쳐진다.
    for (let tap = 0; tap < 2; tap += 1) {
      await hit.dispatchEvent('pointerdown')
      await hit.dispatchEvent('pointerup')
    }
    await expect(hit).toHaveAttribute('data-selected', 'true')
    const pointHits = editor.locator('svg [data-editor-point="hit"]')
    await expect(pointHits.first()).toBeVisible()
    await pointHits.last().dispatchEvent('pointerdown')
    await expect(page.getByRole('group', { name: /트랙패드/ })).toHaveAttribute('aria-disabled', 'false')
    const pad = (await page.getByTestId('jamo-stroke-trackpad').boundingBox())!
    await page.mouse.move(pad.x + 100, pad.y + pad.height / 2)
    await page.mouse.down()
    await page.mouse.move(pad.x + 130, pad.y + pad.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

    await page.goto('/stem-master-lab')
    const a = page.getByTestId('siblings').locator('[data-role="gidung"] article[data-char="ㅏ"]')
    await expect(a).toHaveAttribute('data-follow', 'false')
    await expect(page.getByTestId('siblings').locator('[data-role="gidung"] article[data-char="ㅕ"]')).toHaveAttribute('data-follow', 'true')
    // 마스터를 다시 바꿔도 풀린 ㅏ는 그대로고, 형제는 따라간다.
    await bend(-10)
    await expect(a).toHaveAttribute('data-follow', 'false')
    await expect(page.getByTestId('siblings').locator('[data-role="gidung"] article[data-char="ㅕ"]')).toHaveAttribute('data-follow', 'true')
    await a.getByRole('button', { name: '다시 따르기' }).click()
    await expect(a).toHaveAttribute('data-follow', 'true')
  })

  test('보는 갈래 여섯으로 나뉘고, 보.솟음만 고르고 그리면 ㅗ ㅛ의 보만 휜다', async ({ page }) => {
    await page.goto('/stem-master-lab')
    await page.getByTestId('reset-all').click()
    await page.getByRole('radio', { name: /^보/ }).click()
    const groups = page.getByTestId('siblings').locator('[data-role]')
    await expect(groups).toHaveCount(6)
    for (const role of ['bo.up.mixed', 'bo.down', 'bo.down.mixed', 'bo.none', 'bo.none.mixed']) await page.locator(`[data-role="${role}"] [role="checkbox"]`).click()
    const handle = page.getByTestId('master-canvas-open').getByTestId('master-handle-handleOut')
    await handle.scrollIntoViewIfNeeded()
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 6 })
    await page.mouse.up()
    for (const char of ['ㅗ', 'ㅛ']) await expect(page.locator(`[data-role="bo.up"] article[data-char="${char}"]`), char).toHaveAttribute('data-curved', 'true')
    for (const [role, char] of [['bo.up.mixed', 'ㅘ'], ['bo.down', 'ㅜ'], ['bo.none', 'ㅡ']]) await expect(page.locator(`[data-role="${role}"] article[data-char="${char}"]`), char).toHaveAttribute('data-curved', 'false')
    // 체크하면 지금 모양이 그 갈래에 적용되고, 해제하면 기본 획(곧게)으로 돌아간다.
    const hanging = page.locator('[data-role="bo.down"] article[data-char="ㅜ"]')
    await page.locator('[data-role="bo.down"] [role="checkbox"]').click()
    await expect(hanging).toHaveAttribute('data-curved', 'true')
    await page.locator('[data-role="bo.down"] [role="checkbox"]').click()
    await expect(hanging).toHaveAttribute('data-curved', 'false')
    await expect(page.locator('[data-role="bo.up"] article[data-char="ㅗ"]')).toHaveAttribute('data-curved', 'true')
    await page.getByTestId('reset-all').click()
  })
})
