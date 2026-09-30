import { expect, test, type Page } from '@playwright/test'

/**
 * 랩 왼쪽의 앱 편집기에서 획 하나를 휜다 — 획을 두 번 눌러 점을 펼치고, 마지막 점을 곡선화(이미 휘었으면 그대로)한 뒤 그 들어오는 핸들을 트랙패드로 끈다.
 * 저장을 눌러야 반영 고르기가 뜬다.
 */
async function bend(page: Page, strokeId: string, dx: number, dy = 0) {
  const editor = page.getByTestId('lab-stroke-editor').getByRole('region', { name: /완성 글자 편집/ })
  const hit = editor.locator(`svg [data-editor-hit="stroke"][data-stroke-id="${strokeId}"]`)
  await expect(hit).toHaveCount(1)
  for (let tap = 0; tap < 2; tap += 1) {
    await hit.dispatchEvent('pointerdown')
    await hit.dispatchEvent('pointerup')
  }
  const pointHits = editor.locator('svg [data-editor-point="hit"]')
  await expect(pointHits.first()).toBeVisible()
  await pointHits.last().dispatchEvent('pointerdown')
  await pointHits.last().dispatchEvent('pointerup')
  // 이미 휜 점이면 단추가 `직선화`다 — 그대로 핸들을 잡는다.
  const tools = page.getByTestId('lab-stroke-editor')
  await expect(tools.getByRole('button', { name: /^(곡선화|직선화)$/ })).toBeVisible()
  if (await tools.getByRole('button', { name: '곡선화' }).count()) await tools.getByRole('button', { name: '곡선화' }).click()
  const handleHit = editor.locator('svg [data-editor-handle-hit="in"]')
  await expect(handleHit).toHaveCount(1)
  await handleHit.dispatchEvent('pointerdown')
  await handleHit.dispatchEvent('pointerup')
  const trackpad = page.getByTestId('lab-stroke-editor').getByTestId('jamo-stroke-trackpad')
  await trackpad.scrollIntoViewIfNeeded()
  const pad = (await trackpad.boundingBox())!
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2)
  await page.mouse.down()
  await page.mouse.move(pad.x + pad.width / 2 + dx, pad.y + pad.height / 2 + dy, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('stem-rail-apply')).toHaveCount(0)
  await page.getByTestId('save').click()
  await expect(page.getByTestId('stem-rail-apply')).toBeVisible()
}
const openCard = (page: Page, role: string, char: string) => card(page, role, char).locator('button[aria-pressed]').click()
const card = (page: Page, role: string, char: string) => page.getByTestId('siblings').locator(`[data-role="${role}"] article[data-char="${char}"]`)
/** 전파 창의 카드(홀자 하나). 앱 획 편집의 `전파`와 같은 창이다. */
const shapeCard = (page: Page, char: string) => page.getByTestId('stem-rail-apply').locator(`button[data-kind="shape"][data-char="${char}"]`)
const apply = (page: Page) => page.getByTestId('stem-rail-apply-go').click()

test.describe('홀자 줄기 마스터 랩', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/stem-master-lab')
    await page.getByTestId('reset-all').click()
  })

  test('기둥을 고치면 바깥 기둥 전부가 켜진 채 뜨고, 둘짜리 카드를 한 번 더 치면 안 기둥도 받으며, 곧게 고쳐 반영하면 돌아온다', async ({ page }) => {
    await expect(card(page, 'gidung.outer.single', 'ㅏ')).toHaveAttribute('data-curved', 'false')
    await bend(page, 'ㅏ-1', 40)
    // 반영 전에는 형제가 안 바뀐다(고친 ㅏ만 바뀌어 있다). 바깥 16자가 켜진 채, ㅐ는 바깥만.
    await expect(card(page, 'gidung.outer.single', 'ㅕ')).toHaveAttribute('data-curved', 'false')
    await expect(page.getByTestId('stem-spread-count')).toHaveText('16')
    await expect(shapeCard(page, 'ㅐ')).toHaveAttribute('data-slots', 'outer')
    await shapeCard(page, 'ㅐ').click()
    await expect(shapeCard(page, 'ㅐ')).toHaveAttribute('data-slots', 'outer inner')
    await apply(page)
    for (const [role, char] of [['gidung.outer.single', 'ㅏ'], ['gidung.outer.single', 'ㅕ'], ['gidung.outer.single', 'ㅣ'], ['gidung.inner.single', 'ㅐ'], ['gidung.outer.mixed', 'ㅘ'], ['gidung.outer.mixed', 'ㅢ']]) {
      await expect(card(page, role, char), `${role} ${char}`).toHaveAttribute('data-curved', 'true')
      await expect(card(page, role, char), `${role} ${char}`).toHaveAttribute('data-follow', 'true')
    }
    await expect(card(page, 'gidung.inner.single', 'ㅔ')).toHaveAttribute('data-curved', 'false')
    await page.getByRole('button', { name: '곧게 고치기' }).click()
    await page.getByTestId('save').click()
    await shapeCard(page, 'ㅐ').click()
    await apply(page)
    await expect(card(page, 'gidung.outer.single', 'ㅏ')).toHaveAttribute('data-curved', 'false')
    await expect(card(page, 'gidung.inner.single', 'ㅐ')).toHaveAttribute('data-curved', 'false')
  })

  test('G1: 안 기둥을 고치면 안 기둥 자리만 켜지고 바깥은 그대로, 자소 편집에서 점 하나를 만진 획은 풀려서 남으며, 다시 따르기로 붙는다', async ({ page }) => {
    await bend(page, 'ㅏ-1', 40)
    await apply(page)
    const inner = card(page, 'gidung.inner.single', 'ㅐ')
    const outer = card(page, 'gidung.outer.single', 'ㅐ')
    await expect(inner).toHaveAttribute('data-curved', 'false')
    await expect(outer).toHaveAttribute('data-curved', 'true')
    // ㅐ의 안 기둥을 고쳐 반영 → 기본은 안 · 바깥 다 켜짐. 바깥을 빼서 안 기둥만 받으면 바깥은 앞의 모양으로 남는다(둘 다 따름).
    await openCard(page, 'gidung.inner.single', 'ㅐ')
    const innerId = (await inner.getAttribute('data-stroke'))!
    await bend(page, innerId, -25)
    await expect(page.getByTestId('stem-spread-count')).toHaveText('16')
    await expect(shapeCard(page, 'ㅐ')).toHaveAttribute('data-slots', 'outer inner')
    await expect(shapeCard(page, 'ㅏ')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('stem-rail-apply').locator('[data-testid="stem-spread-group"][data-group="all"]').getByRole('button', { name: '바깥' }).click()
    await expect(shapeCard(page, 'ㅐ')).toHaveAttribute('data-slots', 'inner')
    await expect(shapeCard(page, 'ㅏ')).toHaveAttribute('aria-pressed', 'false')
    await apply(page)
    await expect(inner).toHaveAttribute('data-curved', 'true')
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
    // 풀린 ㅏ도 반영 창에 `따로 고침`으로 켜져 있다(기본 켜짐). 카드를 빼야 그대로고, 형제는 따라간다.
    await openCard(page, 'gidung.outer.single', 'ㅕ')
    await bend(page, 'ㅕ-1', -20)
    await expect(shapeCard(page, 'ㅏ').getByTestId('stem-spread-released')).toBeVisible()
    await shapeCard(page, 'ㅏ').click()
    await expect(shapeCard(page, 'ㅏ')).toHaveAttribute('aria-pressed', 'false')
    await apply(page)
    await expect(a).toHaveAttribute('data-follow', 'false')
    await expect(card(page, 'gidung.outer.single', 'ㅕ')).toHaveAttribute('data-follow', 'true')
    await a.getByRole('button', { name: '다시 따르기' }).click()
    await expect(a).toHaveAttribute('data-follow', 'true')
  })

  test('보를 고치면 보 전부가 켜진 채 뜨고, ㅛ를 빼면 ㅛ만 풀림으로 남는다', async ({ page }) => {
    await page.getByRole('radio', { name: /^보/ }).click()
    await openCard(page, 'bo.up.single', 'ㅗ')
    await bend(page, 'ㅗ-2', 0, -40)
    // 보는 자리 질문이 없어 자리 토글이 없고, 보를 가진 홀자 전부가 켜진 채다.
    await expect(page.getByTestId('stem-rail-apply').locator('[data-testid="stem-spread-group"] button[aria-pressed]')).toHaveCount(0)
    await expect(page.getByTestId('stem-rail-apply').locator('[data-kind="shape"][aria-pressed="false"]')).toHaveCount(0)
    await shapeCard(page, 'ㅛ').click()
    await expect(shapeCard(page, 'ㅛ')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('stem-shape-apart-toast')).toHaveCount(0)
    await apply(page)
    await expect(card(page, 'bo.up.single', 'ㅗ')).toHaveAttribute('data-curved', 'true')
    await expect(card(page, 'bo.up.single', 'ㅛ')).toHaveAttribute('data-curved', 'false')
    await expect(card(page, 'bo.up.single', 'ㅛ')).toHaveAttribute('data-follow', 'false')
    for (const [role, char] of [['bo.up.mixed', 'ㅘ'], ['bo.down.single', 'ㅜ'], ['bo.none.single', 'ㅡ']]) await expect(card(page, role, char), char).toHaveAttribute('data-curved', 'true')
  })

  test('고친 홀자 카드는 뺄 수 없고 잠긴다 — 다른 홀자를 빼면 그 홀자만 안 바뀐다', async ({ page }) => {
    await bend(page, 'ㅏ-1', 40)
    const edited = shapeCard(page, 'ㅏ')
    await expect(edited).toHaveAttribute('data-locked', 'true')
    // 잠긴 카드는 aria-disabled라 클릭 이벤트를 직접 보낸다.
    await edited.dispatchEvent('click')
    await expect(edited).toHaveAttribute('aria-pressed', 'true')
    await shapeCard(page, 'ㅕ').click()
    await expect(shapeCard(page, 'ㅕ')).toHaveAttribute('aria-pressed', 'false')
    await apply(page)
    await expect(card(page, 'gidung.outer.single', 'ㅏ')).toHaveAttribute('data-curved', 'true')
    await expect(card(page, 'gidung.outer.single', 'ㅕ')).toHaveAttribute('data-curved', 'false')
    await expect(card(page, 'gidung.outer.single', 'ㅕ')).toHaveAttribute('data-follow', 'false')
  })
})
