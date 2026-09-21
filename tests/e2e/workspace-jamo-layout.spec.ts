import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** 자소 탭 `레이아웃` 모드(옛 검수 글자 화면): 수치 패널은 없고, 잡은 rail의 이 레이아웃(같은 문맥) 카드가 늘 떠 있다. 기준선을 옮기면 배치 Δ는 카드에, 형태 Δ는 '이 자모로 올리기'로 같은 자모 카드에 얹힌다. */

/** 유니코드 음절의 홀자 번호(ㅏ=0 … ㅣ=20). */
const medialIndexOf = (name: string) => Math.floor(((name.codePointAt(0)! - 0xac00) % 588) / 28)
/** 받침 번호(0 = 없음). */
const finalIndexOf = (name: string) => (name.codePointAt(0)! - 0xac00) % 28
/** 세로 홀자 계열(ㅏㅐㅑㅒㅓㅔㅕㅖㅣ) + 받침 있음 = 멈과 같은 문맥. */
const sameContextAs멈 = (name: string) => [0, 1, 2, 3, 4, 5, 6, 7, 20].includes(medialIndexOf(name)) && finalIndexOf(name) > 0

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

/** 캔버스 손잡이를 키보드로 골라 rail을 선택한다. 칩 줄도 자 도구도 없다. 초점은 손잡이에 남아 방향키로 옮긴다. */
async function selectRail(page: Page, label: string) {
  const handle = page.getByTestId('review-canvas').getByRole('button', { name: `${label} 선택` })
  await handle.focus()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
}
const resetButton = (page: Page) => page.getByTestId('review-reset')
/** 캔버스 부품 상자를 눌러 켠다. 이미 켜진 상자는 이벤트를 통과시키므로 건너뛰고, 다른 부품 rail 손잡이가 위에 겹칠 수 있어 pointerdown을 직접 보낸다. */
async function selectPartBox(page: Page, label: string) {
  const hit = page.getByTestId('review-canvas').getByRole('button', { name: `${label} 선택` })
  if ((await hit.getAttribute('aria-pressed')) !== 'true') await hit.dispatchEvent('pointerdown')
  await expect(hit).toHaveAttribute('aria-pressed', 'true')
}
/** 기본은 첫닿자라 홀자 rail을 잡으려면 먼저 홀자 상자를 켠다. 홀자 라벨은 글자마다 달라 부품으로 찾는다. */
async function selectMedialBox(page: Page) {
  const hit = page.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][data-part^="JU"]').first()
  if ((await hit.getAttribute('aria-pressed')) !== 'true') await hit.dispatchEvent('pointerdown')
  await expect(hit).toHaveAttribute('aria-pressed', 'true')
}

test('수치 패널은 없고, 편집 전에도 이 레이아웃 카드가 Δ 없이 떠 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-canvas')).toBeVisible()
  await expect(page.getByTestId('review-numbers')).toHaveCount(0)
  // 모델이 오면 첫 rail이 잡히고, 같은 문맥(세로 홀자+받침) 카드 8장이 Δ 없이 뜬다. 범위 칩은 이 레이아웃(기본)·이 자모만·전체 셋. 자모 고르기는 이 자모만을 눌러야 뜬다.
  const propagation = page.getByTestId('review-propagation')
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8, { timeout: 20_000 })
  await expect(propagation.getByRole('button', { name: '이 레이아웃', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(propagation.getByRole('button', { name: '이 자모만', exact: true })).toBeEnabled()
  await expect(propagation.getByRole('button', { name: '전체', exact: true })).toBeEnabled()
  await expect(page.getByTestId('review-propagation-jamos')).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  await expect.poll(() => cards.first().getAttribute('data-touched')).toBeNull()
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every(sameContextAs멈)).toBe(true)
  expect(new Set(names.map(medialIndexOf)).size).toBeGreaterThan(1)
})

test('중심 rail(배치)을 옮기면 이 레이아웃 카드 8장에 Δ가 얹히고 전체로 넓힐 수 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(resetButton(page)).toContainText('1개 변경')

  const propagation = page.getByTestId('review-propagation')
  await expect(propagation.getByTestId('review-propagation-deltas')).toContainText('바깥기둥 중심')
  await expect(page.getByTestId('review-propagation-shape')).toHaveCount(0)
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 기본 범위 = 이 레이아웃: 세로 홀자+받침 글자만, 홀자는 섞인다.
  await expect(propagation.getByRole('button', { name: '이 레이아웃', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every(sameContextAs멈)).toBe(true)
  expect(new Set(names.map(medialIndexOf)).size).toBeGreaterThan(1)

  // `다른 글자` 버튼은 없다. 카드 줄을 옆으로 밀어 끝에 가까워지면 다음 묶음이 붙는다. 앞 묶음은 그대로 남는다.
  await expect(page.getByTestId('review-propagation-next')).toHaveCount(0)
  await page.getByTestId('review-propagation-cards').evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
  await expect(cards).toHaveCount(16)
  expect((await cards.locator('figcaption b').allInnerTexts()).slice(0, 8)).toEqual(names)

  // 범위를 바꾸면 한 묶음으로 돌아가고 줄은 맨 앞에서 시작한다.
  await propagation.getByRole('button', { name: '전체', exact: true }).click()
  await expect(cards).toHaveCount(8)
  expect(await page.getByTestId('review-propagation-cards').evaluate((el) => el.scrollLeft)).toBe(0)
  await expect.poll(async () => (await cards.locator('figcaption b').allInnerTexts()).some((name) => !sameContextAs멈(name))).toBe(true)

  // 복원해도 카드는 그대로, Δ만 빠진다.
  await resetButton(page).click()
  await expect(cards).toHaveCount(8)
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  await expect.poll(() => cards.first().getAttribute('data-touched')).toBeNull()
})

/** 레이아웃 캔버스의 홀자는 앱 획이다. 앱 획에 안 닿는 시작·끝 rail(획 길이)은 내놓지 않고, 형태 Δ 카드도 없다. 획 길이는 `획 고치기`에서. */
test('레이아웃 캔버스에는 시작·끝 rail 손잡이가 없고 형태 Δ 카드도 없다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  await selectMedialBox(page)
  await expect(canvas.getByRole('button', { name: '바깥기둥 중심 선택' })).toHaveCount(1)
  await expect(canvas.getByRole('button', { name: /(시작|끝) 선택$/ })).toHaveCount(0)
  await expect(canvas.locator('[data-rail$=":outer-top"], [data-rail$=":outer-bottom"]')).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-shape')).toHaveCount(0)
})

/** 캔버스에서 기준선을 손으로 끌면 모델 자리 → 다른 기준선 → 격자 순으로 걸린다. 방향키엔 안 걸린다. */
test('기준선 드래그는 모델 자리와 격자에 탁 걸리고 방향키는 안 걸린다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  const canvas = page.getByTestId('review-canvas')
  const box = (await canvas.boundingBox())!
  const handle = canvas.locator('[data-rail-handle][aria-pressed="true"]')
  const x1 = Number(await handle.getAttribute('x1'))
  const pxOf = (em: number) => box.x + (em + 0.08) / 1.16 * box.width
  // 세로 rail 손잡이는 위쪽 여백에서 잡는다. 캔버스 가운데는 가로 rail 손잡이가 덮고 있다.
  const y = box.y + (-0.045 + 0.08) / 1.16 * box.height

  // 멀리 끌었다가 모델 자리 근처(+2u)로 돌아오면 모델에 붙는다.
  await page.mouse.move(pxOf(x1), y)
  await page.mouse.down()
  await page.mouse.move(pxOf(x1 + 0.06), y, { steps: 6 })
  await expect(page.getByTestId('review-delta-label')).toHaveCount(1)
  await page.mouse.move(pxOf(x1 + 0.002), y, { steps: 4 })
  // 모델에 붙으면 Δ 0 → 수치 없음. 스냅 글자 표지는 없고 캔버스 data-snap에만 남는다.
  await expect(canvas).toHaveAttribute('data-snap', 'model')
  // 모델·격자엔 상대 기준선이 없으니 잡은 기준선이 주황으로 바뀐다.
  await expect(canvas.locator('[data-rail][data-selected="true"]')).toHaveAttribute('data-snapped', 'true')
  await expect(page.getByTestId('review-delta-label')).toHaveCount(0)
  // 모델(≈0.75)에서 멀어져 격자 13/16(0.8125)이나 그 옆 기준선에 걸린다.
  await page.mouse.move(pxOf(0.815), y, { steps: 8 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-snap', /^(grid|rail)$/)

  // 방향키 1u 이동은 스냅을 푼다.
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await expect(canvas).not.toHaveAttribute('data-snap')
  await expect(canvas.locator('[data-rail][data-selected="true"]')).not.toHaveAttribute('data-snapped')
})

/** 기준값에서 옮긴 만큼 캔버스에 띠와 수치가 칠해지고, 복원하면 사라진다. */
test('기준선을 옮기면 변화 띠와 Δ 수치가 보이고 복원하면 사라진다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  await expect(resetButton(page)).toHaveCount(0)
  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)
  await expect(page.getByTestId('review-delta-label')).toHaveText('+20u')
  // 다른 rail을 고르면 띠는 그 rail 것만. 안 옮긴 rail이면 띠 없음, 수치는 작게 남는다.
  await selectRail(page, '홀자 윗변')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  await expect(page.getByTestId('review-delta-label')).toHaveAttribute('data-active', 'false')
  await selectRail(page, '바깥기둥 중심')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)
  await resetButton(page).click()
  await expect(page.getByTestId('review-delta-band')).toHaveCount(0)
  await expect(resetButton(page)).toHaveCount(0)
})

/** 부품 고르기: 탭 없이 캔버스의 부품 상자를 누르면 그 부품 rail만 손잡이·제 색, 나머지는 회색으로 죽는다. */
test('부품 상자를 누르면 그 부품 rail만 잡히고 칩도 바뀐다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('review-part-tabs')).toHaveCount(0)
  const canvas = page.getByTestId('review-canvas')
  const hits = canvas.getByTestId('review-part-hit')
  await expect(hits).toHaveCount(3)
  // 기본은 첫닿자: 첫닿자 rail만 손잡이가 있고, 홀자 rail은 손잡이 없이 회색.
  await expect(hits.and(canvas.locator('[aria-pressed="true"]'))).toHaveAttribute('aria-label', '첫닿자 ㅁ 선택')
  await expect(hits.and(canvas.locator('[aria-pressed="false"]'))).toHaveCount(2)
  await expect(canvas.locator('[data-rail-handle^="c0:"]')).toHaveCount(4)
  await expect(canvas.locator('[data-rail-handle]:not([data-rail-handle^="c"])')).toHaveCount(0)
  await expect(canvas.locator('[data-rail="c0:top"]')).toHaveAttribute('data-active', 'true')
  await expect(page.getByRole('group', { name: '편집할 기준선' })).toHaveCount(0)

  // 상자 안(잉크 위)을 눌러도 부품이 바뀐다. 실제 클릭으로 렌더 순서(잉크 아래에 히트 상자가 묻히지 않는지)까지 확인한다.
  await canvas.getByRole('button', { name: '홀자 ㅓ 선택' }).click()
  await expect(canvas.getByRole('button', { name: '홀자 ㅓ 선택' })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas.getByRole('button', { name: '첫닿자 ㅁ 선택' })).toHaveAttribute('aria-pressed', 'false')
  await expect(canvas.locator('[data-rail-handle]').first()).toBeAttached()
  await expect(canvas.locator('[data-rail-handle^="c"]')).toHaveCount(0)
  await expect(canvas.locator('[data-rail="c0:top"]')).toHaveAttribute('data-active', 'false')
  // 상자도 켠 부품만 진하다.
  await expect(canvas.locator('[data-testid="review-fit-box"][data-kind="medial"]').first()).toHaveAttribute('data-active', 'true')
  await expect(canvas.locator('[data-testid="review-fit-box"][data-kind="component"]').first()).toHaveAttribute('data-active', 'false')
})

test('배치 Δ를 적용하면 저장되어 새로 열어도 rail이 그 자리에 있고, 같은 문맥 글자만 받고, 지우면 돌아온다', async ({ page }) => {
  const KEY = 'noto-layout-delta-v1'
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  const handle = page.getByTestId('review-canvas').locator('[data-rail-handle][aria-pressed="true"]')
  const before = Number(await handle.getAttribute('x1'))
  await page.keyboard.press('Shift+ArrowRight')
  await expect(resetButton(page)).toContainText('1개 변경')
  expect(Number(await handle.getAttribute('x1'))).toBeCloseTo(before + 0.01, 6)

  // 적용 → 저장소에 이 레이아웃(right-final) Δ가 들어가고, 세션 편집은 비워져 Δ 0에서 다시 시작한다. rail 자리는 그대로.
  const propagation = page.getByTestId('review-propagation')
  await page.getByTestId('review-propagation-apply').click()
  await expect(resetButton(page)).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  await expect(propagation.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toBeVisible()
  await expect(page.getByTestId('review-propagation-apply')).toHaveCount(0)
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.layers['right-final'].medial.JU['outerPillar.center']).toBeCloseTo(0.01, 9)
  expect(stored.all).toEqual({})
  await expect.poll(async () => Number(await page.getByTestId('review-canvas').getByRole('button', { name: '바깥기둥 중심 선택' }).getAttribute('x1'))).toBeCloseTo(before + 0.01, 6)

  // 새로 열어도 저장된 Δ가 original에 들어 있다.
  await page.reload()
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectMedialBox(page)
  const reopened = page.getByTestId('review-canvas').getByRole('button', { name: '바깥기둥 중심 선택' })
  await expect.poll(async () => Number(await reopened.getAttribute('x1'))).toBeCloseTo(before + 0.01, 6)
  await expect(resetButton(page)).toHaveCount(0)

  // 다른 문맥(세로 홀자, 받침 없음 = 머)은 안 받는다.
  await page.goto('/workspace/jamo?char=%EB%A8%B8&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toHaveCount(0)

  // 지우면 모델 rail로 돌아온다. 오버라이드 카드의 ×.
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await page.locator('[data-testid="layout-override-card"][data-kind="layer"]').getByTestId('layout-override-remove').click()
  await selectMedialBox(page)
  await expect.poll(async () => Number(await page.getByTestId('review-canvas').getByRole('button', { name: '바깥기둥 중심 선택' }).getAttribute('x1'))).toBeCloseTo(before, 6)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.layers, KEY)).toEqual({})
})

/** ㅓ의 보 중심은 slot 경계를 안 밀어 앱 글자에 안 닿는다. 그런 배치 rail은 보이기만 하고 손잡이가 없다. */
test('옮겨도 글자에 안 닿는 배치 rail은 잠겨 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  await selectMedialBox(page)
  await expect(canvas.locator('[data-locked="true"]')).not.toHaveCount(0)
  await expect(canvas.getByRole('button', { name: '보 중심 선택' })).toHaveCount(0)
  await expect(canvas.getByRole('button', { name: '바깥기둥 중심 선택' })).toHaveCount(1)
})

test('자소 탭은 레이아웃으로 열리고, 기준선을 적용하면 문장 줄 글자가 바뀌고 Undo로 돌아오고, 획 고치기 · 완료로 오간다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88')
  // 세그먼트 전환은 없다. 기본이 레이아웃이다.
  await expect(page.getByTestId('jamo-edit-mode')).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect(page.getByTestId('jamo-toolbar')).toHaveAttribute('data-edit-mode', 'layout')
  const sentenceGlyph = page.getByRole('button', { name: '멈 편집' })
  // 모델 상자로 그려진 뒤의 글자를 기준으로 잡는다.
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const before = await sentenceGlyph.innerHTML()

  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  // 적용 전에는 문장 줄이 그대로다.
  expect(await sentenceGlyph.innerHTML()).toBe(before)
  await page.getByTestId('review-propagation-apply').click()
  await expect.poll(() => sentenceGlyph.innerHTML()).not.toBe(before)

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(() => sentenceGlyph.innerHTML()).toBe(before)
  await expect(page.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toHaveCount(0)
  await page.getByRole('button', { name: '형태 편집 다시 실행' }).click()
  await expect.poll(() => sentenceGlyph.innerHTML()).not.toBe(before)
  await expect(page.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toBeVisible()

  await page.getByTestId('jamo-stroke-cta').click()
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '멈 완성 글자 편집' })).toBeVisible()
  await page.getByTestId('jamo-stroke-done').click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('옛 검수 글자 화면 주소는 같은 글자의 자소 탭 레이아웃 모드로 넘어간다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page).toHaveURL(/\/workspace\/jamo\?char=%EB%A9%88&mode=layout&solo=1$/)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
})

/** 하단 바는 한 칸짜리 상태 기계다. 부품을 켜면 `ㅁ 획 고치기`, 안 끝난 변경이 있으면 비활성, 획 편집에서는 `완료`로 그 부품이 켜진 채 돌아온다. */
test('켠 부품의 획 고치기로 내려가고, 안 끝난 변경이 있으면 막히고, 완료하면 그 부품이 켜진 레이아웃으로 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const cta = page.getByTestId('jamo-stroke-cta')
  const pressedPart = canvas.getByTestId('review-part-hit').and(canvas.locator('[aria-pressed="true"]'))
  // 기본은 첫닿자. 홀자를 켜면 바뀌고, 다시 첫닿자로 돌아온다.
  await expect(cta).toHaveText('ㅁ 획 고치기')
  await canvas.getByRole('button', { name: '홀자 ㅓ 선택' }).click()
  await expect(cta).toHaveText('ㅓ 획 고치기')
  await canvas.getByRole('button', { name: '첫닿자 ㅁ 선택' }).click({ position: { x: 4, y: 4 } })
  await expect(cta).toHaveText('ㅁ 획 고치기')
  await expect(cta).toBeEnabled()

  // 배치 Δ가 생기면 하단 바가 `…에 적용`으로 바뀐다. 획 고치기는 그동안 없다. 복원하면 돌아온다.
  await selectRail(page, '첫닿자 오른변')
  await page.keyboard.press('Shift+ArrowRight')
  const apply = page.getByTestId('review-propagation-apply')
  await expect(apply).toHaveText('이 레이아웃에 적용')
  await expect(cta).toHaveCount(0)
  await page.getByTestId('review-propagation').getByRole('button', { name: '전체', exact: true }).click()
  await expect(apply).toHaveText('전체에 적용')
  await resetButton(page).click()
  await expect(apply).toHaveCount(0)
  await expect(cta).toBeEnabled()

  // 획 편집은 그 자소의 첫 획이 잡힌 채 열려 도구 줄이 바로 켜진다. `눌러 고르세요` 안내도 조절판도 없다 — 옮기기는 캔버스에서 한다.
  const layoutCanvasBox = await canvas.boundingBox()
  await cta.click()
  await expect(page.getByTestId('jamo-toolbar')).toHaveAttribute('data-edit-mode', 'stroke')
  const editor = page.getByRole('region', { name: '멈 완성 글자 편집' })
  await expect(page.getByTestId('jamo-stroke-hint')).toHaveCount(0)
  await expect(page.getByRole('group', { name: '선택한 글자 형태를 조절하는 트랙패드' })).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '획 편집 도구' }).getByRole('button', { name: '선 추가' })).toBeEnabled()
  const strokeHits = editor.locator('svg [data-editor-hit="stroke"]')
  await expect(strokeHits.and(editor.locator('[data-selected="true"]'))).toHaveCount(1)
  // 잠긴 동안 눌리는 획은 첫닿자 ㅁ 것뿐이다. 빈 곳을 눌러도 획은 잡힌 채다.
  const lockedHitCount = await strokeHits.count()
  await page.getByTestId('focus-canvas').dispatchEvent('pointerdown')
  await expect(strokeHits.and(editor.locator('[data-selected="true"]'))).toHaveCount(1)
  // 셸 안 획 캔버스는 레이아웃 캔버스와 같은 자리 · 같은 크기다(왼쪽 세로 표지 + 남은 너비, 최대 330px).
  const focusBox = await page.getByTestId('focus-canvas').boundingBox()
  expect(Math.round(focusBox?.width ?? 0)).toBe(Math.round(layoutCanvasBox?.width ?? 0))
  expect(Math.round(focusBox?.x ?? 0)).toBe(Math.round(layoutCanvasBox?.x ?? 0))
  expect(Math.round(focusBox?.y ?? 0)).toBe(Math.round(layoutCanvasBox?.y ?? 0))
  // 왼쪽 표지는 `기본` + 여섯 칸. 획은 기본 획에 저장되니 켜진 건 `기본`뿐이고, 첫닿자는 여섯 칸 모두에 그려진다.
  const stripCards = page.getByTestId('layout-context-cards').locator('li')
  await expect(stripCards).toHaveCount(7)
  await expect(stripCards.and(page.locator('[data-active]'))).toHaveCount(1)
  await expect(stripCards.first()).toHaveAttribute('data-context', 'base')
  await expect(stripCards.and(page.locator('[data-absent]'))).toHaveCount(0)

  // 완료 → 레이아웃, 첫닿자가 켜진 채.
  await page.getByTestId('jamo-stroke-done').click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect(pressedPart).toHaveAttribute('aria-label', '첫닿자 ㅁ 선택', { timeout: 20_000 })
  await expect(cta).toHaveText('ㅁ 획 고치기')

  // 획 편집 중 문장에서 다른 글자를 고르면 기본 상태(레이아웃)로 돌아간다.
  await cta.click()
  // 받침 ㅁ으로 들어가도 눌리는 획 수는 같다(같은 ㅁ) — 잠금이 자소를 따라간다.
  await canvas.getByRole('button', { name: '받침 ㅁ 선택' }).click({ position: { x: 4, y: 4 } })
  await cta.click()
  await expect(strokeHits).toHaveCount(lockedHitCount)
  // 받침은 받침 있는 세 칸에만 나온다. `완료` 옆 `뒤로`도 레이아웃으로 돌아간다.
  await expect(stripCards.and(page.locator('[data-absent]'))).toHaveCount(3)
  await page.getByTestId('jamo-stroke-back').click()
  await expect(pressedPart).toHaveAttribute('aria-label', '받침 ㅁ 선택', { timeout: 20_000 })
  await canvas.getByRole('button', { name: '첫닿자 ㅁ 선택' }).click({ position: { x: 4, y: 4 } })
  await page.getByRole('button', { name: '별 편집' }).click()
  await expect(page.getByRole('region', { name: '별 레이아웃 수정' })).toBeVisible()
})

test('주소 &mode=stroke&part=JO는 받침이 잡힌 획 편집을 바로 연다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=stroke&part=JO')
  await expect(page.getByRole('region', { name: '멈 완성 글자 편집' })).toBeVisible()
/** 셸 안 획 편집은 조절판 없이 캔버스에서 바로 끈다. 점이 손가락을 따라오고, 한 번 끌기가 기록 한 줄이다. */
test('획 편집은 캔버스에서 꼭짓점을 직접 끌어 옮기고 Undo 한 번에 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81')
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('jamo-stroke-cta').click()
  const corner = page.locator('[data-editor-point="visible"]').nth(1)
  const centerOf = async () => { const box = await corner.boundingBox(); if (!box) throw new Error('꼭짓점이 없다'); return { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
  const start = await centerOf()
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 40, start.y + 20, { steps: 6 })
  // 놓기 전에도 미리보기로 따라온다.
  expect(Math.abs((await centerOf()).x - (start.x - 40))).toBeLessThanOrEqual(6)
  await page.mouse.up()
  const moved = await centerOf()
  expect(Math.abs(moved.x - (start.x - 40))).toBeLessThanOrEqual(6)
  expect(Math.abs(moved.y - (start.y + 20))).toBeLessThanOrEqual(6)

  // 기록은 한 줄. 되돌리면 제자리고, 잠긴 자소의 획이 다시 잡혀 도구 줄이 살아 있다.
  const undoButton = page.getByRole('button', { name: '형태 편집 실행 취소' })
  await undoButton.click()
  await expect(undoButton).toBeDisabled()
  await expect.poll(async () => Math.round((await centerOf()).x)).toBe(Math.round(start.x))
  const tools = page.getByRole('toolbar', { name: '획 편집 도구' })
  await expect(tools.getByRole('button', { name: '선 추가' })).toBeEnabled()

  // 점을 잡으면 삭제 · 곡선이 켜지고, `여러 점`을 켜 두면 누르는 점이 더해진다.
  await corner.dispatchEvent('pointerdown')
  await page.locator('[data-editor-point="hit"]').nth(1).dispatchEvent('pointerdown')
  await expect(tools.getByRole('button', { name: '곡선화' })).toBeEnabled()
  await tools.getByRole('button', { name: '꼭짓점 여러 개 고르기' }).click()
  await page.locator('[data-editor-point="hit"]').nth(2).dispatchEvent('pointerdown')
  await expect(page.getByTestId('jamo-stroke-tools')).toContainText('점 2개 함께')
})

/** `완료`는 고친 채로 나가고, `뒤로`는 이번에 들어와서 고친 획을 되돌리고 나간다. 되돌린 것은 Redo로 살린다. */
test('획 편집의 뒤로는 이번에 고친 획을 되돌리고 레이아웃으로 나간다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88')
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 20_000 })
  const undoButton = page.getByRole('button', { name: '형태 편집 실행 취소' })
  const redoButton = page.getByRole('button', { name: '형태 편집 다시 실행' })
  // 잡힌 획의 중심선. 저장소 문자열은 처음엔 비어 있을 수 있어서 화면에 그려진 획으로 비교한다.
  const selectedStroke = () => page.locator('[data-editor-hit="stroke"][data-selected="true"]').getAttribute('d')

  await page.getByTestId('jamo-stroke-cta').click()
  const before = await selectedStroke()
  expect(before).toBeTruthy()
  // 획을 통째로 옮기면 상자 맞춤이 도로 펴 버릴 수 있어서 꼭짓점을 잡아 옮긴다.
  // 캔버스에서 꼭짓점을 두 번 끌어 기록 두 줄을 만든다.
  const dot = page.locator('[data-editor-point="visible"]').first()
  for (const dx of [30, -18]) {
    const box = await dot.boundingBox()
    if (!box) throw new Error('꼭짓점이 없다')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + 12, { steps: 4 })
    await page.mouse.up()
  }
  await expect(undoButton).toBeEnabled()
  await expect.poll(selectedStroke).not.toBe(before)

  await page.getByTestId('jamo-stroke-back').click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeEnabled()
  // 다시 들어가 보면 획이 들어오기 전 그대로다.
  await page.getByTestId('jamo-stroke-cta').click()
  await expect.poll(selectedStroke).toBe(before)
})

  await expect(page.getByTestId('jamo-stroke-tools')).toBeVisible()
  await expect(page.locator('[data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(1)
  await page.getByTestId('jamo-stroke-done').click()
  await expect(page.getByTestId('review-canvas').getByTestId('review-part-hit').and(page.locator('[aria-pressed="true"]'))).toHaveAttribute('aria-label', '받침 ㅁ 선택', { timeout: 20_000 })
})

/** ㅣ는 획이 하나라 가로로는 크기를 못 바꾼다. 상자 변을 밀면 통째로 옮겨지고, 세로 변은 기둥 길이를 바꾼다. */
test('홀자 상자 변을 옮겨 적용하면 ㅣ 글자도 문장 줄에서 자리가 바뀌고 저장된다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B8%B0&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  await selectMedialBox(page)
  // 홀자 탭에 상자 네 변이 있고, 기둥 중심도 이제 잠기지 않는다.
  for (const side of ['왼변', '오른변', '윗변', '아랫변']) await expect(canvas.getByRole('button', { name: `홀자 ${side} 선택` })).toHaveCount(1)
  await expect(canvas.getByRole('button', { name: '바깥기둥 중심 선택' })).toHaveCount(1)

  const sentenceGlyph = page.getByRole('button', { name: '기 편집' })
  const before = await sentenceGlyph.innerHTML()
  const medialBox = canvas.locator('[data-testid="review-fit-box"][data-kind="medial"] rect')
  const xBefore = Number(await medialBox.getAttribute('x'))
  const widthBefore = Number(await medialBox.getAttribute('width'))
  await selectRail(page, '홀자 왼변')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  // 통째로 20u 왼쪽. 두께(상자 너비)는 그대로.
  await expect.poll(async () => Number(await medialBox.getAttribute('x'))).toBeCloseTo(xBefore - 0.02, 6)
  expect(Number(await medialBox.getAttribute('width'))).toBeCloseTo(widthBefore, 6)
  await expect(page.getByTestId('review-propagation-deltas')).toContainText('홀자 왼변')
  await expect(page.getByTestId('review-propagation-card').first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })

  await page.getByTestId('review-propagation-apply').click()
  await expect.poll(() => sentenceGlyph.innerHTML()).not.toBe(before)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('noto-layout-delta-v1')!).state)
  expect(stored.layers.right.faces.JU.left).toBeCloseTo(-0.02, 9)
  // 적용 뒤에도 상자는 그 자리, 세션 Δ는 0.
  await expect.poll(async () => Number(await medialBox.getAttribute('x'))).toBeCloseTo(xBefore - 0.02, 6)
  await expect(resetButton(page)).toHaveCount(0)
})

test('ㅏ의 홀자 오른변을 밀면 보가 길어지고 기둥 두께는 그대로다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const medialBox = page.getByTestId('review-canvas').locator('[data-testid="review-fit-box"][data-kind="medial"] rect')
  const x = Number(await medialBox.getAttribute('x'))
  const width = Number(await medialBox.getAttribute('width'))
  await selectMedialBox(page)
  await selectRail(page, '홀자 오른변')
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(async () => Number(await medialBox.getAttribute('width'))).toBeCloseTo(width + 0.01, 6)
  expect(Number(await medialBox.getAttribute('x'))).toBeCloseTo(x, 6)
  await expect(resetButton(page)).toContainText('1개 변경')
})

/** 2026-09-21 `이 자모만` 층(G0·G1). 가에서 첫닿자 ㄱ 오른변을 밀어 ㄱ·ㅋ에만 적용하면 같은 문장의 가는 바뀌고 마는 그대로다. 층별로 따로 저장·지우기, Undo/Redo. */
test('이 자모만으로 좁혀 적용하면 같은 레이아웃의 그 자모 글자만 받고, 층마다 따로 지운다', async ({ page }) => {
  const KEY = 'noto-layout-delta-v1'
  // 획 모드에서 모델 상자로 그려진 뒤의 문장 글자를 기준으로 잡고, 그다음 레이아웃 모드로 간다. 문장 = `가 별을 노래하는 마음으로`. 마(ㅁ+ㅏ, 받침 없음)는 가와 같은 레이아웃이라 대조군.
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=stroke')
  const 가 = page.getByRole('button', { name: '가 편집' })
  const 마 = page.getByRole('button', { name: '마 편집' })
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  const 가Before = await 가.innerHTML()
  const 마Before = await 마.innerHTML()
  await page.getByTestId('jamo-stroke-done').click()
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const propagation = page.getByTestId('review-propagation')

  // 첫닿자 ㄱ(기본으로 켜져 있다)을 잡고 오른변을 20u 민다.
  await selectPartBox(page, '첫닿자 ㄱ')
  await selectRail(page, '첫닿자 오른변')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(propagation.getByTestId('review-propagation-deltas')).toContainText('첫닿자 오른변')

  // 이 자모만: 자모 고르기 시트가 뜬다. 잡은 ㄱ은 켜진 채 고정, ㅋ을 더한다. 카드는 같은 문맥에서 첫닿자가 ㄱ·ㅋ인 글자만.
  await propagation.getByRole('button', { name: '이 자모만', exact: true }).click()
  const jamos = page.getByTestId('review-propagation-jamos')
  await expect(jamos).toBeVisible()
  await expect(jamos.locator('[data-jamo="ㄱ"]')).toHaveAttribute('aria-pressed', 'true')
  // 하나뿐일 때는 못 끈다.
  await expect(jamos.locator('[data-jamo="ㄱ"]')).toBeDisabled()
  await expect(jamos.locator('button')).toHaveCount(19)
  await jamos.locator('[data-jamo="ㅋ"]').click()
  await expect(jamos.locator('[data-jamo="ㅋ"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('review-propagation-apply')).toContainText('ㄱ·ㅋ')
  // 완료 = 시트 닫기. 고른 자모는 저장 전에도 띠에 빈 칩으로 보인다.
  await page.getByTestId('review-propagation-jamos-done').click()
  await expect(jamos).toHaveCount(0)
  await expect(page.locator('[data-testid="layout-scope-chip"][data-kind="jamo"][data-selected="true"]')).toHaveCount(2)
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.length).toBeGreaterThan(0)
  expect(names.every((name) => ['ㄱ', 'ㅋ'].includes('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor((name.codePointAt(0)! - 0xac00) / 588)]))).toBe(true)
  expect(names.every((name) => [0, 1, 2, 3, 4, 5, 6, 7, 20].includes(medialIndexOf(name)) && finalIndexOf(name) === 0)).toBe(true)

  // 적용: 자모 층에 ㄱ·ㅋ 키로 따로 저장. 문장의 가는 바뀌고 마는 그대로.
  await page.getByTestId('review-propagation-apply').click()
  await expect(resetButton(page)).toHaveCount(0)
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.jamo.right['CH:ㄱ'].faces.CH.right).toBeCloseTo(0.02, 9)
  expect(stored.jamo.right['CH:ㅋ'].faces.CH.right).toBeCloseTo(0.02, 9)
  expect(stored.layers).toEqual({})
  expect(stored.all).toEqual({})
  await expect.poll(() => 가.innerHTML()).not.toBe(가Before)
  expect(await 마.innerHTML()).toBe(마Before)

  // 범위 띠: 찬 칩은 ㄱ → ㅋ 둘. 이 레이아웃 칩은 비어 있다(층 분리). 요약 줄과 글자 수(right 계열 9홀자 × 첫닿자 하나 = 9자).
  const overrides = page.getByTestId('layout-override-card')
  await expect(overrides).toHaveCount(2)
  await expect(overrides.nth(0)).toHaveAttribute('data-jamo', 'ㄱ')
  await expect(overrides.nth(1)).toHaveAttribute('data-jamo', 'ㅋ')
  await expect(overrides.nth(0)).toContainText('오른변 +20u')
  await expect(overrides.nth(0)).toContainText('9자')
  await expect(page.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toHaveCount(0)
  // 지금 칩(이 자모만 ㄱ·ㅋ)에 맞는 카드 둘이 켜져 있고, 이 레이아웃 칩으로 바꾸면 꺼진다.
  await expect(overrides.locator('[aria-pressed="true"]')).toHaveCount(2)
  await propagation.getByRole('button', { name: '이 레이아웃', exact: true }).click()
  await expect(overrides.locator('[aria-pressed="true"]')).toHaveCount(0)
  // ㅋ 칩을 누르면 범위가 이 자모만, 고른 자모는 ㅋ 하나(시트는 안 뜬다), 표본은 ㅋ 글자만.
  await overrides.nth(1).getByTestId('layout-override-select').click()
  await expect(propagation.getByRole('button', { name: '이 자모만', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('review-propagation-jamos')).toHaveCount(0)
  await expect(overrides.locator('[aria-pressed="true"]')).toHaveCount(1)
  await expect(overrides.nth(1)).toHaveAttribute('data-selected', 'true')
  await expect.poll(async () => (await cards.locator('figcaption b').allInnerTexts()).every((name) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor((name.codePointAt(0)! - 0xac00) / 588)] === 'ㅋ')).toBe(true)

  // Undo → 가가 돌아오고 저장소도 빈다. Redo → 다시.
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(() => 가.innerHTML()).toBe(가Before)
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)).jamo).toEqual({})
  await page.getByRole('button', { name: '형태 편집 다시 실행' }).click()
  await expect.poll(() => 가.innerHTML()).not.toBe(가Before)

  // 지우기: ㄱ 카드의 ×만 누르면 ㄱ 키만 지워지고 ㅋ 키는 남는다. Undo/Redo 뒤에도 목록은 저장소 그대로.
  await expect(page.getByTestId('layout-override-card')).toHaveCount(2)
  await page.locator('[data-testid="layout-override-card"][data-jamo="ㄱ"]').getByTestId('layout-override-remove').click()
  await expect(page.getByTestId('layout-override-card')).toHaveCount(1)
  const cleared = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(cleared.jamo.right['CH:ㄱ']).toBeUndefined()
  expect(cleared.jamo.right['CH:ㅋ'].faces.CH.right).toBeCloseTo(0.02, 9)
  await expect.poll(() => 가.innerHTML()).toBe(가Before)
})

/** 받침 자모 층: 각에서 받침 ㄱ 윗변을 올려 ㄱ 받침에만 적용하면 같은 문맥의 ㄴ 받침 글자는 안 받는다. */
test('받침을 이 자모만으로 적용하면 받침이 그 자모인 글자만 받는다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const propagation = page.getByTestId('review-propagation')
  await canvas.getByRole('button', { name: '받침 ㄱ 선택' }).click({ position: { x: 4, y: 4 } })
  await selectRail(page, '받침 윗변')
  await page.keyboard.press('Shift+ArrowUp')
  await propagation.getByRole('button', { name: '이 자모만', exact: true }).click()
  await expect(page.getByTestId('review-propagation-jamos').locator('button')).toHaveCount(27)
  await page.getByTestId('review-propagation-jamos-done').click()
  const names = await page.getByTestId('review-propagation-card').locator('figcaption b').allInnerTexts()
  expect(names.length).toBeGreaterThan(0)
  expect(names.every((name) => finalIndexOf(name) === 1)).toBe(true)
  await page.getByTestId('review-propagation-apply').click()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('noto-layout-delta-v1')!).state)
  expect(stored.jamo['right-final']['JO:ㄱ'].faces.JO.top).toBeCloseTo(-0.01, 9)
  expect(Object.keys(stored.jamo['right-final'])).toEqual(['JO:ㄱ'])
})

/** 자모 층이 생기기 전 저장분(`jamo` 없음)도 그대로 읽고, 위에 자모 층을 더할 수 있다. */
test('옛 저장 형식(jamo 없음)을 읽어 이 레이아웃 Δ가 살아 있고 자모 층을 더할 수 있다', async ({ page }) => {
  const KEY = 'noto-layout-delta-v1'
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=layout')
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ state: { all: {}, layers: { right: { faces: { CH: { right: 0.02 } } } } }, version: 0 })), KEY)
  await page.reload()
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const propagation = page.getByTestId('review-propagation')
  await expect(propagation.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toContainText('첫닿자 오른변 +20u')
  await selectPartBox(page, '첫닿자 ㄱ')
  await selectRail(page, '첫닿자 윗변')
  await page.keyboard.press('Shift+ArrowUp')
  await propagation.getByRole('button', { name: '이 자모만', exact: true }).click()
  await page.getByTestId('review-propagation-jamos-done').click()
  await page.getByTestId('review-propagation-apply').click()
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.layers.right.faces.CH.right).toBeCloseTo(0.02, 9)
  expect(stored.jamo.right['CH:ㄱ'].faces.CH.top).toBeCloseTo(-0.01, 9)
})

/** 범위 띠(G0·G1): 노에서 ㄴ, 로에서 ㄹ을 각각 이 자모만으로 적용하면 bottom 레이아웃 띠에 전체·ㄴ·ㄹ이 찬 칩으로. 칩 누르면 표본이 그 글자, ×는 그 층만. 다른 레이아웃에선 전체만. 띠는 첫 화면(390×844)에서 스크롤 없이 보인다. */
test('같은 레이아웃에 쌓인 오버라이드가 범위 띠에 보이고, 칩마다 따로 고르고 지운다', async ({ page }) => {
  const KEY = 'noto-layout-delta-v1'
  const initialOf = (name: string) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor((name.codePointAt(0)! - 0xac00) / 588)]
  const overrides = page.getByTestId('layout-override-card')

  // 노: 전체에 첫닿자 윗변 -10u, 그다음 ㄴ만 윗변 +20u(ㄴ 작게).
  await page.goto('/workspace/jamo?char=%EB%85%B8&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const propagation = page.getByTestId('review-propagation')
  await expect(overrides).toHaveCount(0)
  await expect(page.getByTestId('layout-scope-chip')).toHaveCount(3)
  await selectPartBox(page, '첫닿자 ㄴ')
  await selectRail(page, '첫닿자 윗변')
  await page.keyboard.press('Shift+ArrowUp')
  await propagation.getByRole('button', { name: '전체', exact: true }).click()
  await page.getByTestId('review-propagation-apply').click()
  await expect(overrides).toHaveCount(1)
  await selectPartBox(page, '첫닿자 ㄴ')
  await selectRail(page, '첫닿자 윗변')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await propagation.getByRole('button', { name: '이 자모만', exact: true }).click()
  await page.getByTestId('review-propagation-jamos-done').click()
  await page.getByTestId('review-propagation-apply').click()
  await expect(overrides).toHaveCount(2)

  // 로: ㄹ만 윗변 -20u(ㄹ 크게). 찬 칩은 전체 → ㄴ → ㄹ.
  await page.goto('/workspace/jamo?char=%EB%A1%9C&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(overrides).toHaveCount(2)
  await selectPartBox(page, '첫닿자 ㄹ')
  await selectRail(page, '첫닿자 윗변')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await propagation.getByRole('button', { name: '이 자모만', exact: true }).click()
  await page.getByTestId('review-propagation-jamos-done').click()
  await page.getByTestId('review-propagation-apply').click()
  await expect(overrides).toHaveCount(3)
  await expect(overrides.nth(0)).toHaveAttribute('data-kind', 'all')
  await expect(overrides.nth(0)).toContainText('첫닿자 윗변 -10u')
  await expect(overrides.nth(0)).toContainText('11,172자')
  await expect(overrides.nth(1)).toHaveAttribute('data-jamo', 'ㄴ')
  await expect(overrides.nth(1)).toContainText('윗변 +20u')
  await expect(overrides.nth(2)).toHaveAttribute('data-jamo', 'ㄹ')
  await expect(overrides.nth(2)).toContainText('윗변 -20u')
  // bottom(가로 홀자 5 × 받침 없음) 첫닿자 하나 = 5자.
  await expect(overrides.nth(2)).toContainText('5자')
  // 띠는 캔버스 바로 아래라 첫 화면에서 세로 스크롤 없이 보인다.
  await expect(page.getByTestId('layout-scope-strip')).toBeInViewport({ ratio: 1 })
  await expect(overrides.nth(0)).toBeInViewport()
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.all.faces.CH.top).toBeCloseTo(-0.01, 9)
  expect(stored.jamo.bottom['CH:ㄴ'].faces.CH.top).toBeCloseTo(0.02, 9)
  expect(stored.jamo.bottom['CH:ㄹ'].faces.CH.top).toBeCloseTo(-0.02, 9)

  // ㄴ 칩을 누르면 표본이 ㄴ 글자만(같은 문맥), 켜진 자모 칩은 ㄴ 하나.
  const cards = page.getByTestId('review-propagation-card')
  await overrides.nth(1).getByTestId('layout-override-select').click()
  await expect(overrides.nth(1)).toHaveAttribute('data-selected', 'true')
  await expect(overrides.nth(2)).not.toHaveAttribute('data-selected', 'true')
  await expect.poll(async () => { const names = await cards.locator('figcaption b').allInnerTexts(); return names.length > 0 && names.every((name) => initialOf(name) === 'ㄴ' && [8, 12, 13, 17, 18].includes(medialIndexOf(name)) && finalIndexOf(name) === 0) }).toBe(true)
  // 전체 칩을 누르면 범위가 전체.
  await overrides.nth(0).getByTestId('layout-override-select').click()
  await expect(propagation.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // ㄴ 칩 ×: ㄴ만 사라지고 ㄹ·전체는 그대로. Undo로 돌아온다.
  await overrides.nth(1).getByTestId('layout-override-remove').click()
  await expect(overrides).toHaveCount(2)
  await expect(overrides.nth(1)).toHaveAttribute('data-jamo', 'ㄹ')
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(after.jamo.bottom['CH:ㄴ']).toBeUndefined()
  expect(after.jamo.bottom['CH:ㄹ'].faces.CH.top).toBeCloseTo(-0.02, 9)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(overrides).toHaveCount(3)

  // 다른 레이아웃(가, right)에서는 전체만 보인다.
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(overrides).toHaveCount(1)
  await expect(overrides.nth(0)).toHaveAttribute('data-kind', 'all')
})

test('Noto 고스트를 끄면 다른 글자 카드에서도 고스트가 빠지고, 켜면 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  const cards = page.getByTestId('review-propagation-card')
  const cardGhosts = page.getByTestId('review-propagation-ghost')
  await expect(cards).toHaveCount(8, { timeout: 20_000 })
  await expect(cardGhosts).toHaveCount(8)

  await page.getByTestId('review-ghost-toggle').click()
  await expect(page.getByTestId('review-ghost')).toHaveCount(0)
  await expect(cardGhosts).toHaveCount(0)
  await expect(cards).toHaveCount(8)

  await page.getByTestId('review-ghost-toggle').click()
  await expect(cardGhosts).toHaveCount(8)
})

/** 고정 Δ(G0·G1): 노에서 첫닿자 윗변을 `이 자리에 맞추기`로 고정해 이 레이아웃에 적용하면 bottom 계열 글자의 닿자 윗변이 전부 같은 자리에 모인다. 더하기는 제각각. */
test('변을 이 자리에 맞추면 범위 안 글자가 같은 자리에 모이고, 다시 옮기면 더하기로 돌아온다', async ({ page }) => {
  const KEY = 'noto-layout-delta-v1'
  await page.goto('/workspace/jamo?char=%EB%85%B8&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  const cards = page.getByTestId('review-propagation-card')
  // 카드 안 닿자 상자(초록)의 y = 그 글자의 첫닿자 윗변.
  const cardTops = async () => (await cards.locator('svg rect[fill="#2f9a6a"]').evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('y'))))).filter((v) => Number.isFinite(v))

  // 홀자 rail(중심)엔 맞추기가 없다.
  await selectMedialBox(page)
  await expect(page.getByTestId('review-fix-rail')).toHaveCount(0)
  await selectPartBox(page, '첫닿자 ㄴ')
  await selectRail(page, '첫닿자 윗변')
  await expect(page.getByTestId('review-fix-rail')).toBeVisible()
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await expect(page.getByTestId('review-propagation-deltas')).toContainText('첫닿자 윗변-20u')
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 더하기: 글자마다 예측이 달라 윗변 자리가 제각각.
  await expect.poll(async () => new Set((await cardTops()).map((v) => v.toFixed(4))).size).toBeGreaterThan(1)

  // 맞추기 → Δ 줄이 `= 자리`, 카드의 윗변이 전부 그 자리.
  await page.getByTestId('review-fix-rail').click()
  const fixedTag = page.getByTestId('review-fixed-rail')
  await expect(fixedTag).toContainText('첫닿자 윗변 =')
  const at = Number((await fixedTag.innerText()).match(/= (-?\d+)/)![1]) / 1000
  await expect(page.getByTestId('review-propagation-deltas').locator('[data-fixed="true"]')).toContainText(`= ${Math.round(at * 1000)}`)
  await expect(page.getByTestId('review-fix-rail')).toHaveCount(0)
  // 라벨은 1u 반올림이고 실제 자리는 모델 예측 + k/1000이라, 카드끼리는 같고 라벨과는 0.5u 안.
  await expect.poll(async () => { const tops = await cardTops(); return tops.length > 0 && tops.every((v) => Math.abs(v - tops[0]) < 1e-6) && Math.abs(tops[0] - at) < 6e-4 }).toBe(true)

  // 다시 옮기면 더하기로 돌아온다(맞추기 버튼을 누르느라 초점이 옮겨졌으니 손잡이를 다시 잡는다). 다시 맞추기.
  await canvas.getByRole('button', { name: '첫닿자 윗변 선택' }).focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('review-fix-rail')).toBeVisible()
  await expect(fixedTag).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-deltas')).toContainText('-21u')
  await page.getByTestId('review-fix-rail').click()
  const at2 = Number((await fixedTag.innerText()).match(/= (-?\d+)/)![1]) / 1000
  expect(at2).toBeCloseTo(at - 0.001, 3)

  // 적용: 저장은 `{ at }`. 오버라이드 카드 요약도 `= 자리`. 로를 열면 첫닿자 윗변이 그 자리에서 시작한다.
  await expect(page.getByTestId('review-propagation-apply')).toHaveText('이 레이아웃에 적용')
  await page.getByTestId('review-propagation-apply').click()
  await expect(page.getByTestId('review-reset')).toHaveCount(0)
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.layers.bottom.faces.CH.top).toEqual({ at: expect.closeTo(at2, 3) })
  await expect(page.locator('[data-testid="layout-override-card"][data-kind="layer"]')).toContainText(`첫닿자 윗변 = ${Math.round(at2 * 1000)}`)
  await expect.poll(async () => Number(await canvas.getByRole('button', { name: '첫닿자 윗변 선택' }).getAttribute('y1'))).toBeCloseTo(at2, 3)
  await page.goto('/workspace/jamo?char=%EB%A1%9C&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectPartBox(page, '첫닿자 ㄹ')
  await expect.poll(async () => Number(await page.getByTestId('review-canvas').getByRole('button', { name: '첫닿자 윗변 선택' }).getAttribute('y1'))).toBeCloseTo(at2, 3)
  await expect(page.getByTestId('review-reset')).toHaveCount(0)
})

/**
 * 획이 모델 상자에 안 맞아도(ㅡ를 세로로 퍼지게 고침 → `박스가 획 두께보다 작습니다` → 옛 배치로 그림) 획 편집의 `완료`는 남아 있어야 한다.
 * 나가는 문이 고치고 있는 획 상태에 매이면 갇힌다. 이유는 한 줄로 말해 준다.
 */
test('획이 모델 상자에 안 맞아도 획 편집에서 완료로 레이아웃에 돌아온다', async ({ page }) => {
  const base = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/baseJamos.json', import.meta.url)), 'utf8'))
  // ㅡ를 세로로 퍼지는 꺾인 선으로. 직선일 땐 상자 높이를 안 쓰지만 이러면 ㅡ 칸(획 두께만 한 높이)에 못 들어간다.
  base.jungseong['ㅡ'].strokes[0].points = [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 1, y: 0.2 }]
  await page.addInitScript((state) => { localStorage.setItem('font-maker-jamo-data', JSON.stringify({ state, version: 0 })) }, { choseong: base.choseong, jungseong: base.jungseong, jongseong: base.jongseong })
  await page.goto('/workspace/jamo?char=%EC%9D%84&mode=stroke&part=JU')
  // 모델이 온 뒤에도 옛 배치라 이유가 뜨고, 완료는 그대로 있다.
  await expect(page.getByTestId('jamo-box-fit-issue')).toContainText('박스가 획 두께보다 작습니다', { timeout: 20_000 })
  const done = page.getByTestId('jamo-stroke-done')
  await expect(done).toBeVisible()
  await done.click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
})

/** 세로 예산(2026-09-21): 도구 줄은 머리 `…` 메뉴로, 레이아웃 모드의 보정 문장은 한 줄. 390×844 첫 화면에 범위 띠와 표본 첫 줄 네 장이 세로 스크롤 없이 온전히 보인다. */
test('예시 글자 카드를 누르면 그 글자가 열리고 문장에는 그 글자 하나만 남는다. 안 끝난 Δ가 있으면 카드는 잠긴다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards).toHaveCount(8, { timeout: 20_000 })
  const sentence = page.getByRole('region', { name: '보정 문장' })
  expect(await sentence.getByRole('button', { name: /편집/ }).count()).toBeGreaterThan(1)

  // Δ가 있는 동안은 글자를 바꾸면 편집이 날아가므로 카드가 잠긴다. 복원하면 풀린다.
  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(resetButton(page)).toContainText('1개 변경')
  await expect(cards.first().getByTestId('review-propagation-open')).toBeDisabled()
  await resetButton(page).click()
  await expect(cards.first().getByTestId('review-propagation-open')).toBeEnabled()

  const name = await cards.first().locator('figcaption b').innerText()
  await cards.first().getByTestId('review-propagation-open').click()
  await expect(page.getByRole('region', { name: `${name} 레이아웃 수정` })).toBeVisible()
  await expect(sentence.getByRole('button', { name: /편집/ })).toHaveCount(1)
  await expect(sentence.getByRole('button', { name: `${name} 편집` })).toHaveAttribute('aria-current', 'true')
  // 새 글자의 카드가 다시 뜨고, 연 글자는 그 안에 없다.
  await expect(cards).toHaveCount(8, { timeout: 20_000 })
  expect(await cards.locator('figcaption b').allInnerTexts()).not.toContain(name)
})

test('레이아웃 모드 첫 화면에 범위 띠와 표본 다섯 장이 온전히 보이고, 도구는 … 메뉴에 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const sentence = page.getByRole('region', { name: '보정 문장' })
  await expect(sentence).toHaveAttribute('data-compact', 'true')
  expect((await sentence.boundingBox())!.height).toBeLessThanOrEqual(60)
  // 고른 글자(멈)는 한 줄 문장에서 보이는 자리에 있다.
  await expect(page.getByRole('button', { name: '멈 편집' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByTestId('layout-scope-strip')).toBeInViewport({ ratio: 1 })
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })
  const barTop = (await page.getByTestId('jamo-stroke-cta').boundingBox())!.y
  const row = (await page.getByTestId('review-propagation-cards').boundingBox())!
  for (let index = 0; index < 5; index += 1) {
    const box = (await cards.nth(index).boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(barTop)
    expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 0.5)
  }

  // 도구 넷은 `…` 메뉴 안. 닫혀 있으면 안 보이고, 열면 이름과 함께 보인다. 바깥(Escape)으로 닫힌다.
  const menu = page.getByTestId('workspace-more-menu')
  await expect(menu).toBeHidden()
  await page.getByRole('button', { name: '프로젝트 더보기' }).click()
  await expect(menu.getByRole('link', { name: '자소 원형 새 화면 검토' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '현재 작업을 OTF로 추출' })).toContainText('OTF 추출')
  await expect(menu.getByRole('button', { name: '선택 자모 형태 규칙' })).toBeVisible()
  // 네모꼴 · 획 스타일 패널은 획 편집 화면 것이라 레이아웃 모드에서는 꺼져 있다.
  await expect(menu.getByRole('button', { name: '글로벌 스타일 설정' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // 획 편집에서도 문장은 한 줄이고, 메뉴의 글로벌 스타일이 전처럼 패널을 연다.
  await page.getByTestId('jamo-stroke-cta').click()
  await expect(sentence).toHaveAttribute('data-compact', 'true')
  await page.getByRole('button', { name: '프로젝트 더보기' }).click()
  await menu.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('region', { name: '글로벌 스타일 설정' })).toBeVisible()
})

/**
 * 레이아웃 캔버스의 홀자 = 앱 획(G0). 저장된 ㅗ 줄기를 왼쪽으로 옮겨 두면 레이아웃 캔버스의 홀자 잉크가 기본 획일 때와 달라진다.
 * 전에는 Noto rail로 만든 획 마스터 잉크라 앱 획을 고쳐도 캔버스가 그대로였다. 기준선 상자(slot)는 같다.
 */
test('획 편집에서 고친 홀자가 레이아웃 캔버스에도 보인다', async ({ page, context }) => {
  const inkOf = async (target: typeof page) => {
    await target.goto('/workspace/jamo?char=%EB%85%B8&mode=layout')
    await expect(target.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
    await expect(target.getByTestId('review-fit-ink').first()).toBeVisible()
    const box = target.getByTestId('review-canvas').locator('[data-testid="review-fit-box"][data-kind="medial"] rect')
    return { ink: await target.getByTestId('review-fit-ink').first().getAttribute('d'), slot: [await box.getAttribute('x'), await box.getAttribute('y'), await box.getAttribute('width'), await box.getAttribute('height')].join() }
  }
  const base = await inkOf(page)

  const jamos = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/baseJamos.json', import.meta.url)), 'utf8'))
  const stem = jamos.jungseong['ㅗ'].strokes.find((stroke: { points: { x: number }[] }) => stroke.points.every((point) => Math.abs(point.x - stroke.points[0].x) < 1e-9))
  for (const point of stem.points) point.x = 0.25
  const edited = await context.newPage()
  await edited.setViewportSize({ width: 390, height: 844 })
  await edited.addInitScript((state) => { localStorage.setItem('font-maker-jamo-data', JSON.stringify({ state, version: 0 })) }, { choseong: jamos.choseong, jungseong: jamos.jungseong, jongseong: jamos.jongseong })
  const moved = await inkOf(edited)
  expect(moved.ink).toBeTruthy()
  expect(moved.ink).not.toBe(base.ink)
  expect(moved.slot).toBe(base.slot)
  // 표본 카드도 앱 획이라 고친 ㅗ가 보인다(카드의 검은 잉크 path가 기본과 다르다).
  await expect(edited.getByTestId('review-propagation-card').first()).toBeVisible({ timeout: 20_000 })
})

/** 앱 획이 홀자 칸에 안 맞으면(ㅡ를 꺾인 선으로) 레이아웃 캔버스는 상자만 그리고 이유를 띄운다. 기준선 편집은 그대로 된다. */
test('홀자 획이 상자에 안 맞으면 레이아웃 캔버스는 상자만 그리고 이유를 알린다', async ({ page }) => {
  const jamos = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/baseJamos.json', import.meta.url)), 'utf8'))
  jamos.jungseong['ㅡ'].strokes[0].points = [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 1, y: 0.2 }]
  await page.addInitScript((state) => { localStorage.setItem('font-maker-jamo-data', JSON.stringify({ state, version: 0 })) }, { choseong: jamos.choseong, jungseong: jamos.jungseong, jongseong: jamos.jongseong })
  await page.goto('/workspace/jamo?char=%EC%9D%84&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('review-canvas-warning')).toContainText('박스가 획 두께보다 작습니다')
  await expect(page.getByTestId('review-fit-ink')).toHaveCount(0)
  // 상자 변은 여전히 옮겨진다.
  await selectMedialBox(page)
  await selectRail(page, '홀자 아랫변')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(resetButton(page)).toContainText('1개 변경')
})

