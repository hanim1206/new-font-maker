import { expect, test, type Page } from '@playwright/test'

/** 캔버스 핸들을 끌어 줄기를 고친다(놓으면 반영 질문이 뜬다). */
async function bend(page: Page, dx: number, dy = 0, key: 'handleOut' | 'handleIn' = 'handleOut') {
  const handle = page.getByTestId('master-canvas-open').getByTestId(`master-handle-${key}`)
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('apply-questions')).toBeVisible()
}
const card = (page: Page, role: string, char: string) => page.getByTestId('siblings').locator(`[data-role="${role}"] article[data-char="${char}"]`)
const option = (page: Page, facet: string, value: string) => page.getByTestId('apply-questions').locator(`[data-facet="${facet}"] [data-option="${value}"]`)

test.describe('홀자 줄기 마스터 랩', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/stem-master-lab')
    await page.getByTestId('reset-all').click()
  })

  test('기둥을 고치면 반영 질문이 뜨고, 전부 반영하면 형제 기둥이 다 휘며, 곧게 고쳐 반영하면 돌아온다', async ({ page }) => {
    await expect(card(page, 'gidung.outer.single', 'ㅏ')).toHaveAttribute('data-curved', 'false')
    await bend(page, 30)
    // 반영 전에는 안 바뀐다.
    await expect(card(page, 'gidung.outer.single', 'ㅏ')).toHaveAttribute('data-curved', 'false')
    await expect(page.getByTestId('apply-count')).toHaveText('16')
    await page.getByTestId('apply').click()
    for (const [role, char] of [['gidung.outer.single', 'ㅏ'], ['gidung.outer.single', 'ㅕ'], ['gidung.outer.single', 'ㅣ'], ['gidung.inner.single', 'ㅐ'], ['gidung.outer.mixed', 'ㅘ'], ['gidung.outer.mixed', 'ㅢ']]) {
      await expect(card(page, role, char), `${role} ${char}`).toHaveAttribute('data-curved', 'true')
      await expect(card(page, role, char), `${role} ${char}`).toHaveAttribute('data-follow', 'true')
    }
    await page.getByRole('button', { name: '곧게 고치기' }).click()
    await page.getByTestId('apply').click()
    await expect(card(page, 'gidung.outer.single', 'ㅏ')).toHaveAttribute('data-curved', 'false')
    await expect(card(page, 'gidung.inner.single', 'ㅐ')).toHaveAttribute('data-curved', 'false')
  })

  test('G1: 안 기둥만 골라 반영하면 바깥은 그대로, 자소 편집에서 점 하나를 만진 획은 풀려서 남으며, 다시 따르기로 붙는다', async ({ page }) => {
    await bend(page, 30)
    await page.getByTestId('apply').click()
    const inner = card(page, 'gidung.inner.single', 'ㅐ')
    const outer = card(page, 'gidung.outer.single', 'ㅐ')
    await expect(inner).toHaveAttribute('data-curved', 'true')
    // 다시 고쳐서 `바깥`을 빼고 반영 → 안 기둥만 바뀌고 바깥은 앞의 모양으로 남는다(둘 다 따름).
    await bend(page, -60)
    await option(page, 'side', 'outer').click()
    await expect(option(page, 'side', 'outer')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('apply-count')).toHaveText('6')
    await page.getByTestId('apply').click()
    await expect(inner).toHaveAttribute('data-follow', 'true')
    await expect(outer).toHaveAttribute('data-follow', 'true')
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
    const a = card(page, 'gidung.outer.single', 'ㅏ')
    await expect(a).toHaveAttribute('data-follow', 'false')
    await expect(card(page, 'gidung.outer.single', 'ㅕ')).toHaveAttribute('data-follow', 'true')
    // 마스터를 다시 바꿔도 풀린 ㅏ는 그대로고, 형제는 따라간다.
    await page.getByTestId('siblings').locator('[data-role="gidung.outer.single"] article[data-char="ㅕ"] button[aria-pressed]').click()
    await bend(page, -10)
    await page.getByTestId('apply').click()
    await expect(a).toHaveAttribute('data-follow', 'false')
    await expect(card(page, 'gidung.outer.single', 'ㅕ')).toHaveAttribute('data-follow', 'true')
    await a.getByRole('button', { name: '다시 따르기' }).click()
    await expect(a).toHaveAttribute('data-follow', 'true')
  })

  test('보를 고치고 질문으로 좁힌다: 솟음 받침 · 단일만 고르면 ㅗ ㅛ의 보만 휘고, 뒤 질문 카드는 앞 답 안에서 다시 센다', async ({ page }) => {
    await page.getByRole('radio', { name: /^보/ }).click()
    await bend(page, 0, -30)
    await expect(page.getByTestId('apply-count')).toHaveText('12')
    await option(page, 'role', 'down').click()
    await option(page, 'role', 'none').click()
    // 앞 답(솟음 받침) 안에서: 단일 ㅗ ㅛ, 섞임 ㅘ ㅙ ㅚ.
    await expect(option(page, 'kind', 'single').locator('small')).toHaveText('2')
    await expect(option(page, 'kind', 'mixed').locator('small')).toHaveText('3')
    await option(page, 'kind', 'mixed').click()
    await expect(page.getByTestId('apply-count')).toHaveText('2')
    await page.getByTestId('apply').click()
    for (const char of ['ㅗ', 'ㅛ']) await expect(card(page, 'bo.up.single', char), char).toHaveAttribute('data-curved', 'true')
    for (const [role, char] of [['bo.up.mixed', 'ㅘ'], ['bo.down.single', 'ㅜ'], ['bo.none.single', 'ㅡ']]) await expect(card(page, role, char), char).toHaveAttribute('data-curved', 'false')
  })
})
