import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// 보선 끌기 배율(`GlyphLayoutEditor` RAIL_DRAG_GAIN). 손은 옮길 em의 1/배율만큼 간다.
const DRAG_GAIN = 0.7

/** 자소 탭 `레이아웃` 모드(옛 검수 글자 화면): 수치 패널은 없고, 잡은 rail의 이 레이아웃(같은 문맥) 표본이 상단 `닿는 글자` 줄에 늘 떠 있다. 기준선을 옮기면 배치 Δ가 그 줄에 얹힌다. */

/** 한 묶음. 줄이 안 차면 다음 묶음이 붙으므로 장수는 화면 폭을 탄다 — 최소만 잰다. */
const BATCH = 8
const expectFilledRow = async (cards: Locator, timeout = 20_000) =>
  expect.poll(() => cards.count(), { timeout }).toBeGreaterThanOrEqual(BATCH)

/** 유니코드 음절의 홀자 번호(ㅏ=0 … ㅣ=20). */
const medialIndexOf = (name: string) => Math.floor(((name.codePointAt(0)! - 0xac00) % 588) / 28)
/** 받침 번호(0 = 없음). */
const finalIndexOf = (name: string) => (name.codePointAt(0)! - 0xac00) % 28
/** 세로 홀자 계열(ㅏㅐㅑㅒㅓㅔㅕㅖㅣ) + 받침 있음 = 멈과 같은 문맥. */
const sameContextAs멈 = (name: string) => [0, 1, 2, 3, 4, 5, 6, 7, 20].includes(medialIndexOf(name)) && finalIndexOf(name) > 0

/**
 * 저장 자리는 범위 규칙식 키다(`src-next/scopeRule.ts`의 `ruleKey`와 같은 모양).
 * 옛 세 층은 읽을 때 이 자리로 옮겨진다 — `layers['right-final']` → `f=right|j=1`.
 */
const layerKey = (contextId: string) =>
  `f=${contextId.startsWith('mixed') ? 'mixed' : contextId.startsWith('bottom') ? 'bottom' : 'right'}|j=${contextId.endsWith('-final') ? '1' : '0'}`
const jamoRuleKey = (contextId: string, part: 'CH' | 'JU' | 'JO', jamo: string) =>
  `${layerKey(contextId)}|${part === 'CH' ? 'i' : part === 'JU' ? 'm' : 'n'}=${jamo}`

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

/** 켜진 부품 상자를 한 번 더 누르면 그 자소 획 편집이다. 보선을 놓으려고 누른 탭은 획 편집으로 새지 않는다. */
test('켜진 상자를 다시 누르면 획 편집으로 가고, 보선을 놓는 탭은 그대로 레이아웃이다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const active = page.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][data-edit-part]').first()
  await expect(active).toHaveAttribute('data-part', 'CH')
  const box = (await active.boundingBox())!
  // 보선을 잡은 채 상자 안을 누르면 보선만 놓인다.
  await selectRail(page, '첫닿자 오른변')
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect(page.getByTestId('jamo-stroke-tools')).toHaveCount(0)
  // 다른 부품(홀자)을 누르면 켜지기만 하고 획 편집으로 새지 않는다.
  const medial = page.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][data-part^="JU"]').first()
  const medialBox = (await medial.boundingBox())!
  await page.mouse.click(medialBox.x + medialBox.width * 0.3, medialBox.y + medialBox.height * 0.8)
  await expect(medial).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('jamo-stroke-tools')).toHaveCount(0)
  // 첫닿자로 돌아와 켜진 상자를 다시 누르면 획 편집.
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await expect(active).toHaveAttribute('data-part', 'CH')
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await expect(page.getByTestId('jamo-stroke-tools')).toBeVisible()
  await expect(page.getByRole('region', { name: '멈 완성 글자 편집' })).toBeVisible()
})

test('수치 패널은 없고, 편집 전에도 닿는 글자 줄이 Δ 없이 떠 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-canvas')).toBeVisible()
  await expect(page.getByTestId('review-numbers')).toHaveCount(0)
  // 모델이 오면 첫 rail이 잡히고, 같은 문맥(세로 홀자+받침) 글자가 Δ 없이 뜬다. 범위 칩은 이 레이아웃(기본)·이 자모만 둘. 자모 고르기는 이 자모만을 눌러야 뜬다.
  const propagation = page.getByTestId('review-propagation')
  const cards = page.getByTestId('review-propagation-card')
  await expectFilledRow(cards)
  await expect(propagation.getByRole('button', { name: '이 레이아웃', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(propagation.getByRole('button', { name: '이 자모만', exact: true })).toBeEnabled()
  // `전체`는 고를 수 없다. 저장된 전체 Δ가 없으니 칩 자체가 없다.
  await expect(propagation.getByRole('button', { name: '전체', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-jamos')).toHaveCount(0)
  await expect(page.getByTestId('review-propagation-deltas')).toBeEmpty()
  await expect.poll(() => cards.first().getAttribute('data-touched')).toBeNull()
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every(sameContextAs멈)).toBe(true)
  expect(new Set(names.map(medialIndexOf)).size).toBeGreaterThan(1)
})

test('중심 rail(배치)을 옮기면 닿는 글자 줄에 Δ가 얹히고 이 자모만으로 좁힐 수 있다', async ({ page }) => {
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
  await expectFilledRow(cards)
  await expect(cards.first()).toHaveAttribute('data-touched', 'true', { timeout: 20_000 })
  // 기본 범위 = 이 레이아웃: 세로 홀자+받침 글자만, 홀자는 섞인다.
  await expect(propagation.getByRole('button', { name: '이 레이아웃', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const names = await cards.locator('figcaption b').allInnerTexts()
  expect(names.every(sameContextAs멈)).toBe(true)
  expect(new Set(names.map(medialIndexOf)).size).toBeGreaterThan(1)

  // `다른 글자` 버튼은 없다. 줄을 옆으로 밀어 끝에 가까워지면 다음 묶음이 붙는다. 앞 묶음은 그대로 남는다.
  await expect(page.getByTestId('review-propagation-next')).toHaveCount(0)
  await page.getByTestId('review-propagation-cards').evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
  await expect.poll(() => cards.count()).toBeGreaterThan(names.length)
  expect((await cards.locator('figcaption b').allInnerTexts()).slice(0, names.length)).toEqual(names)

  // 범위를 좁히면 줄을 새로 만들어 맨 앞에서 시작한다. 잡은 홀자(ㅓ)가 같은 글자만 남는다.
  await propagation.getByRole('button', { name: '이 자모만', exact: true }).click()
  await page.getByTestId('review-propagation-jamos-done').click()
  await expectFilledRow(cards)
  expect(await page.getByTestId('review-propagation-cards').evaluate((el) => el.scrollLeft)).toBe(0)
  await expect.poll(async () => (await cards.locator('figcaption b').allInnerTexts()).every((name) => medialIndexOf(name) === medialIndexOf('멈'))).toBe(true)

  // 복원해도 줄은 그대로, Δ만 빠진다.
  await resetButton(page).click()
  await expectFilledRow(cards)
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
  await page.mouse.move(pxOf(x1 + 0.06 / DRAG_GAIN), y, { steps: 6 })
  await expect(page.getByTestId('review-delta-label')).toHaveCount(1)
  await page.mouse.move(pxOf(x1 + 0.002 / DRAG_GAIN), y, { steps: 4 })
  // 모델에 붙으면 Δ 0 → 수치 없음. 스냅 글자 표지는 없고 캔버스 data-snap에만 남는다.
  await expect(canvas).toHaveAttribute('data-snap', 'model')
  // 모델·격자엔 상대 기준선이 없으니 잡은 기준선에 걸림 표지가 붙는다(색은 안 바뀐다).
  await expect(canvas.locator('[data-rail][data-selected="true"]')).toHaveAttribute('data-snapped', 'true')
  await expect(page.getByTestId('review-delta-label')).toHaveCount(0)
  // 모델(≈0.75)에서 멀어져 격자 13/16(0.8125)이나 그 옆 기준선에 걸린다.
  await page.mouse.move(pxOf(x1 + (0.815 - x1) / DRAG_GAIN), y, { steps: 8 })
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
  // 다른 rail을 골라도 띠는 이 영역에서 옮긴 것 그대로 남는다. 수치는 작게 남는다.
  await selectRail(page, '홀자 윗변')
  await expect(page.getByTestId('review-delta-band')).toHaveCount(1)
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
  // 끄지 않을 때는 다른 부품 보선을 아예 그리지 않는다(끄는 동안에만 깐다).
  await expect(canvas.locator('[data-rail="c0:top"]')).toHaveCount(0)
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
  expect(stored.rules[layerKey('right-final')].medial.JU['outerPillar.center']).toBeCloseTo(0.01, 9)
  expect(stored.rules['']).toBeUndefined()
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
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.rules, KEY)).toEqual({})
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

  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '멈 완성 글자 편집' })).toBeVisible()
  await page.getByTestId('jamo-stroke-done').click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('옛 검수 글자 화면 주소는 같은 글자의 자소 탭 레이아웃 모드로 넘어간다', async ({ page }) => {
  await page.goto('/workspace/review/glyph?char=%EB%A9%88')
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByRole('region', { name: '보정 문장' }).getByRole('button', { name: '멈 편집' })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
})

/** 획 편집 입구는 켜진 상자를 한 번 더 누르기다. 부품을 켜면 그 상자가 입구가 되고, 보선을 옮기면 하단 바가 서고, 획 편집에서는 `완료`로 그 부품이 켜진 채 돌아온다. */
test('켠 부품의 획 고치기로 내려가고, 안 끝난 변경이 있으면 막히고, 완료하면 그 부품이 켜진 레이아웃으로 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const canvas = page.getByTestId('review-canvas')
  // 획 편집으로 가는 길은 켜진 상자를 한 번 더 누르기다. 버튼 · 하단 CTA는 없다.
  const cta = page.getByTestId('review-canvas').locator('[data-edit-part]').first()
  const pressedPart = canvas.getByTestId('review-part-hit').and(canvas.locator('[aria-pressed="true"]'))
  // 기본은 첫닿자. 홀자를 켜면 바뀌고, 다시 첫닿자로 돌아온다.
  await expect(page.getByTestId('jamo-stroke-cta-bar')).toHaveCount(0)
  await expect(cta).toHaveAttribute('data-part', 'CH')
  await canvas.getByRole('button', { name: '홀자 ㅓ 선택' }).click()
  await expect(cta).toHaveAttribute('data-part', /^JU/)
  await canvas.getByRole('button', { name: '첫닿자 ㅁ 선택' }).click({ position: { x: 4, y: 4 } })
  await expect(cta).toHaveAttribute('data-part', 'CH')

  // 배치 Δ가 생기면 하단 바가 `…에 적용`으로 바뀐다. 획 고치기는 그동안 없다. 복원하면 돌아온다.
  await selectRail(page, '첫닿자 오른변')
  await page.keyboard.press('Shift+ArrowRight')
  const apply = page.getByTestId('review-propagation-apply')
  await expect(apply).toHaveText('이 레이아웃에 적용')
  await page.getByTestId('review-propagation').getByRole('button', { name: '이 자모만', exact: true }).click()
  await page.getByTestId('review-propagation-jamos-done').click()
  await expect(apply).toHaveText('ㅁ에 적용')
  await resetButton(page).click()
  await expect(apply).toHaveCount(0)
  await expect(page.getByTestId('jamo-stroke-cta-bar')).toHaveCount(0)

  // 획 편집은 그 자소의 첫 획이 잡힌 채 열려 도구 줄이 바로 켜진다. `눌러 고르세요` 안내는 없다. 옮기기는 캔버스에서 하고, 잘게 옮길 트랙패드가 도구 줄 아래에 있다.
  const layoutCanvasBox = await canvas.boundingBox()
  await cta.dispatchEvent('click')
  await expect(page.getByTestId('jamo-toolbar')).toHaveAttribute('data-edit-mode', 'stroke')
  const editor = page.getByRole('region', { name: '멈 완성 글자 편집' })
  await expect(page.getByTestId('jamo-stroke-hint')).toHaveCount(0)
  await expect(page.getByTestId('jamo-stroke-trackpad')).toBeVisible()
  await expect(page.getByRole('toolbar', { name: '획 편집 도구' }).getByRole('button', { name: '획 추가' })).toBeEnabled()
  const strokeHits = editor.locator('svg [data-editor-hit="stroke"]')
  await expect(strokeHits.and(editor.locator('[data-selected="true"]'))).toHaveCount(1)
  // 잠긴 동안 눌리는 획은 첫닿자 ㅁ 것뿐이다. 빈 곳을 눌러도 획은 잡힌 채다.
  const lockedHitCount = await strokeHits.count()
  await page.getByTestId('focus-canvas').dispatchEvent('pointerdown')
  await expect(strokeHits.and(editor.locator('[data-selected="true"]'))).toHaveCount(1)
  // 셸 안 획 캔버스는 레이아웃 캔버스와 같은 크기 · 같은 가로 자리다. 문장 줄이 접힌 만큼 위로 올라간다.
  await page.waitForFunction(() => document.querySelector('section[aria-label="보정 문장"]')?.getBoundingClientRect().height === 0)
  const focusBox = await page.getByTestId('focus-canvas').boundingBox()
  expect(Math.round(focusBox?.width ?? 0)).toBe(Math.round(layoutCanvasBox?.width ?? 0))
  expect(Math.round(focusBox?.x ?? 0)).toBe(Math.round(layoutCanvasBox?.x ?? 0))
  expect(focusBox!.y).toBeLessThan(layoutCanvasBox!.y)
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
  await expect(cta).toHaveAttribute('data-part', 'CH')
  // 받침 ㅁ으로 들어가도 눌리는 획 수는 같다(같은 ㅁ) — 잠금이 자소를 따라간다.
  await canvas.getByRole('button', { name: '받침 ㅁ 선택' }).click({ position: { x: 4, y: 4 } })
  await cta.dispatchEvent('click')
  await expect(strokeHits).toHaveCount(lockedHitCount)
  // 받침은 받침 있는 세 칸에만 나온다. `완료` 옆 `뒤로`도 레이아웃으로 돌아간다.
  await expect(stripCards.and(page.locator('[data-absent]'))).toHaveCount(3)
  await page.getByTestId('jamo-stroke-back').click()
  await expect(pressedPart).toHaveAttribute('aria-label', '받침 ㅁ 선택', { timeout: 20_000 })
})

/** 획을 눌러 잡고, 한 번 더 눌러 점을 편다(피그마식: 누르면 획, 한 번 더 누르면 점). `pick`은 몇 번째 획을 누를지 중심선 `d`로 고른다. */
async function openStrokePoints(page: Page, pick: (paths: string[]) => number = () => 0) {
  const hits = page.locator('[data-editor-hit="stroke"]')
  const hit = hits.nth(pick(await hits.evaluateAll((els) => els.map((el) => el.getAttribute('d') ?? ''))))
  for (let tap = 0; tap < 2; tap += 1) {
    await hit.dispatchEvent('pointerdown')
    await hit.dispatchEvent('pointerup')
  }
  await expect(page.locator('[data-editor-point="visible"]').first()).toBeVisible()
}

/** 셸 안 획 편집은 조절판 없이 캔버스에서 바로 끈다. 점이 손가락을 따라오고, 한 번 끌기가 기록 한 줄이다. */
test('획 편집은 캔버스에서 꼭짓점을 직접 끌어 옮기고 Undo 한 번에 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81')
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  // 문장 줄이 접히는 동안 캔버스가 올라간다. 다 접힌 뒤에 잰다.
  await page.waitForFunction(() => document.querySelector('section[aria-label="보정 문장"]')?.getBoundingClientRect().height === 0)
  await openStrokePoints(page)
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
  // 되돌리면 획만 잡힌 상태로 돌아온다. 점은 다시 편다.
  await openStrokePoints(page)
  await expect.poll(async () => Math.round((await centerOf()).x)).toBe(Math.round(start.x))
  const tools = page.getByRole('toolbar', { name: '획 편집 도구' })
  await expect(tools.getByRole('button', { name: '획 추가' })).toBeEnabled()

  // 점을 잡으면 삭제 · 곡선이 켜지고, `여러 점`을 켜 두면 누르는 점이 더해진다.
  await page.locator('[data-editor-point="hit"]').nth(1).dispatchEvent('pointerdown')
  await expect(tools.getByRole('button', { name: '곡선화' })).toBeEnabled()
  await tools.getByRole('button', { name: '꼭짓점 여러 개 고르기' }).click()
  await page.locator('[data-editor-point="hit"]').nth(2).dispatchEvent('pointerdown')
  await expect(page.getByTestId('jamo-stroke-tools')).toContainText('점 2개 함께')
})

/**
 * 기준 틀: 처음 고치는 순간 고치기 전 획이 틀로 굳는다. 그 뒤로는 획 하나를 상자 밖으로 끌어도 나머지 획이 제자리고, 끈 획은 상자 밖으로 튀어나온다.
 * 전에는 획 전체 범위를 다시 상자에 꽉 채워서 끌 때마다 다른 획 좌표가 같이 바뀌었다.
 */
test('획을 상자 밖으로 끌어도 다른 획은 제자리고, 틀 다시 맞추기로 꽉 채운다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=stroke&part=CH')
  // 모델 상자가 온 뒤에 잰다. 그 전 첫 렌더는 옛 스키마 상자라 점 자리가 다르다.
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  await openStrokePoints(page)
  const dots = page.locator('[data-editor-point="visible"]')
  const positions = () => dots.evaluateAll((els) => els.map((el) => `${Number(el.getAttribute('cx')).toFixed(2)},${Number(el.getAttribute('cy')).toFixed(2)}`))
  // 틀 설명 줄은 없다. `틀 다시 맞추기`는 숨겨 두었다(기능만 남음).
  const reset = page.getByTestId('jamo-frame-reset')
  await expect(reset).toBeHidden()
  const before = await positions()
  expect(before).toHaveLength(3)

  // ㄱ 가로 획의 왼쪽 끝을 왼쪽으로 조금 끈다(상자 밖). 이웃 자소가 없는 쪽이라 최소 잉크 간격 멈춤에 안 걸린다.
  // 글자 칸(EM) 왼쪽 끝까지는 안 간다 — 잉크가 칸 끝을 넘으면 `getJamoRenderBox`가 자소를 통째로 밀어서 다른 점도 움직인다(그건 틀이 아니라 칸 보호다).
  const box = await dots.nth(0).boundingBox()
  if (!box) throw new Error('끝점이 없다')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height / 2, { steps: 6 })
  // 끄는 동안부터 나머지 두 점은 안 움직인다.
  expect((await positions()).slice(1)).toEqual(before.slice(1))
  await page.mouse.up()
  const after = await positions()
  expect(after.slice(1)).toEqual(before.slice(1))
  expect(Number(after[0].split(',')[0])).toBeLessThan(Number(before[0].split(',')[0]) - 2)

  // 틀 다시 맞추기 → 끝점이 상자 안으로 돌아온다. Undo하면 튀어나온 채로 돌아온다.
  await reset.evaluate((button: HTMLButtonElement) => button.click())
  await expect.poll(async () => Number((await positions())[0].split(',')[0])).toBeCloseTo(Number(before[0].split(',')[0]), 0)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await openStrokePoints(page)
  await expect.poll(async () => (await positions())[0]).toBe(after[0])
})

/**
 * 획 끌기 스냅은 레이아웃의 기준선 스냅과 같은 규칙이다(처음 자리 → 기준선 · 상자 변 · 다른 획 → 격자), 축마다 따로.
 * 가로로 끄는 동안 y는 처음 자리에 붙어 손 떨림이 안 들어가고, 기준선에 가까이 가면 걸려서 주황 선과 이름표가 뜬다. 캔버스 뒤에는 레이아웃의 기준선이 깔린다.
 */
test('획을 가로로 끌면 세로로 흔들려도 반듯하게 가고, 기준선에 걸린다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=stroke&part=CH')
  const canvas = page.getByTestId('focus-canvas')
  await expect(canvas).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  await expect.poll(() => page.locator('[data-testid="stroke-guide-rails"] line').count()).toBeGreaterThan(8)
  await openStrokePoints(page)
  const dots = page.locator('[data-editor-point="visible"]')
  const positions = () => dots.evaluateAll((els) => els.map((el) => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]))
  const before = await positions()
  const box = await dots.nth(0).boundingBox()
  if (!box) throw new Error('점이 없다')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // ㄱ 가로 획의 왼쪽 끝을 오른쪽으로 끌며 세로로 ±4px 흔든다.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (const [dx, dy] of [[5, 2], [10, -3], [14, 4], [18, -2], [22, 3]]) await page.mouse.move(cx + dx, cy + dy)
  const during = await positions()
  expect(during[0][1]).toBeCloseTo(before[0][1], 6)
  expect(during[0][0]).toBeGreaterThan(before[0][0] + 4)
  // 받침 왼변 근처라 거기에 걸린다: 이름표와 주황 세로선.
  await expect(page.getByTestId('stroke-snap-chip')).toContainText('받침 왼변')
  await expect(page.locator('[data-testid="stroke-snap-hit"][data-axis="x"]')).toHaveCount(1)
  await page.mouse.up()
  await expect(page.getByTestId('stroke-snap-chip')).toHaveCount(0)
  expect((await positions())[0]).toEqual(during[0])

  // 세로로 크게 벗어나면 y도 풀려 사선으로 간다.
  const again = await dots.nth(0).boundingBox()
  if (!again) throw new Error('점이 없다')
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2)
  await page.mouse.down()
  await page.mouse.move(again.x + again.width / 2 + 6, again.y + again.height / 2 + 14, { steps: 5 })
  await page.mouse.up()
  expect((await positions())[0][1]).toBeGreaterThan(before[0][1] + 2)
})

/** 잡은 획 가까이 누르면 다른 획이 아니라 잡은 획의 가장 가까운 꼭짓점이 잡힌다. 꼭짓점 · 곡선 핸들은 보이는 점보다 넓게(약 23px) 눌린다. */
test('잡은 획의 꼭짓점과 곡선 핸들은 조금 비껴 눌러도 잡힌다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=stroke&part=CH')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  // 들어올 때 잡혀 있던 것을 빈 곳으로 풀고, 획을 한 번만 누른다.
  await page.getByTestId('focus-canvas').dispatchEvent('pointerdown')
  const hit = page.locator('[data-editor-hit="stroke"]').first()
  await hit.dispatchEvent('pointerdown')
  await hit.dispatchEvent('pointerup')
  // 획만 잡힌 상태: 점은 안 보여도 눌림 영역은 깔려 있다.
  await expect(page.locator('[data-editor-point="visible"]')).toHaveCount(0)
  const catches = page.locator('[data-editor-point="catch"]')
  await expect(catches.first()).toBeAttached()
  const centerOf = async (locator: Locator) => { const box = await locator.boundingBox(); if (!box) throw new Error('자리가 없다'); return { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
  const target = await centerOf(catches.nth(1))
  await page.mouse.click(target.x + 10, target.y + 6)
  const active = page.locator('[data-editor-point="visible"][r="2.8"]')
  await expect(active).toHaveCount(1)
  const picked = await centerOf(active)
  expect(Math.hypot(picked.x - target.x, picked.y - target.y)).toBeLessThanOrEqual(3)

  // 곡선으로 바꾸면 핸들이 뜬다. 점을 다시 잡고, 핸들을 꼭짓점 반대쪽으로 14px 비껴 눌러도 핸들이 잡힌다.
  await page.getByRole('toolbar', { name: '획 편집 도구' }).getByRole('button', { name: '곡선화' }).click()
  await page.mouse.click(picked.x, picked.y)
  await expect(page.locator('[data-editor-handle="active"]')).toHaveCount(0)
  const handle = await centerOf(page.locator('[data-editor-handle]').first())
  const length = Math.hypot(handle.x - picked.x, handle.y - picked.y) || 1
  await page.mouse.click(handle.x + (handle.x - picked.x) / length * 14, handle.y + (handle.y - picked.y) / length * 14)
  await expect(page.locator('[data-editor-handle="active"]')).toHaveCount(1)
})

/** 조절판은 캔버스 끌기와 같은 계산이다: px → em(배율 1/3) · 같은 스냅. 자모 상자 크기와 상관없이 60px이면 점이 화면에서 약 20px 간다. */
test('조절판 끌기는 캔버스의 1/3 배율로 가고, 캔버스와 같은 자리에 걸린다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=stroke&part=CH')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  await openStrokePoints(page)
  const firstHit = page.locator('[data-editor-point="hit"]').first()
  await firstHit.dispatchEvent('pointerdown')
  await firstHit.dispatchEvent('pointerup')
  const active = page.locator('[data-editor-point="visible"][r="2.8"]')
  await expect(active).toHaveCount(1)
  const centerX = async () => { const box = await active.boundingBox(); if (!box) throw new Error('잡은 점이 없다'); return box.x + box.width / 2 }
  const before = await centerX()
  const pad = await page.getByTestId('jamo-stroke-trackpad').boundingBox()
  if (!pad) throw new Error('조절판이 없다')
  const y = pad.y + pad.height / 2
  await page.mouse.move(pad.x + 20, y)
  await page.mouse.down()
  await page.mouse.move(pad.x + 80, y, { steps: 8 })
  const during = await centerX()
  await page.mouse.up()
  // 스냅(격자 · 기준선)으로 몇 px 걸릴 수 있다.
  expect(during - before).toBeGreaterThan(12)
  expect(during - before).toBeLessThan(28)
  expect(Math.abs(await centerX() - during)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()
})

/**
 * 최소 잉크 간격은 막지 않고 알린다. 간격은 화면과 같은 상자(모델 상자)로 잰다 — `서`는 ㅅ과 ㅓ 사이 여유가 17u뿐이다(옛 스키마 상자로는 188u로 잘못 쟀다).
 * 걸린 자리에서 한 번 붙들고, 50u 넘게 더 끌면 넘어간다. 넘어간 자모는 자동 되당김 없이 그린 대로 나오고 캔버스가 주황으로 알린다.
 */
test('획을 옆 자소 쪽으로 끌면 최소 간격에서 한 번 걸리고, 더 끌면 넘어가며 캔버스가 경고한다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%84%9C&mode=stroke&part=JU')
  const canvas = page.getByTestId('focus-canvas')
  await expect(canvas).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('캔버스가 없다')
  const unitsPerPx = 1160 / canvasBox.width
  // ㅓ의 곁줄기(가장 왼쪽까지 가는 획)의 점을 편다.
  const leftmostX = (d: string) => Math.min(...[...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((match) => Number(match[1])))
  await openStrokePoints(page, (paths) => paths.map(leftmostX).reduce((best, x, index, xs) => x < xs[best] ? index : best, 0))
  const dots = page.locator('[data-editor-point="visible"]')
  const xs = await dots.evaluateAll((els) => els.map((el) => Number(el.getAttribute('cx'))))
  const barEnd = dots.nth(xs.indexOf(Math.min(...xs)))
  const centerX = async () => { const box = await barEnd.boundingBox(); if (!box) throw new Error('점이 없다'); return box.x + box.width / 2 }
  const start = await barEnd.boundingBox()
  if (!start) throw new Error('점이 없다')
  const startX = start.x + start.width / 2
  const y = start.y + start.height / 2
  const tools = page.getByTestId('jamo-stroke-tools')

  // 36u를 청하면 여유(17u, 눈금 5u → 20u)에서 붙들린다.
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX - 10, y, { steps: 5 })
  expect(Math.round((startX - await centerX()) * unitsPerPx)).toBeLessThanOrEqual(22)
  await expect(tools).toContainText('더 끌면 넘어감')
  await expect(canvas).not.toHaveAttribute('data-gap-warning', 'true')
  // 더 끌면 풀려서 손가락을 따라온다.
  await page.mouse.move(startX - 40, y, { steps: 8 })
  expect(Math.round((startX - await centerX()) * unitsPerPx)).toBeGreaterThan(120)
  await expect(tools).toContainText('옆 자소에 너무 붙음')
  await page.mouse.up()
  // 놓은 뒤에도 되당겨지지 않고, 캔버스가 경고한다. Undo하면 경고도 사라진다.
  expect(Math.round((startX - await centerX()) * unitsPerPx)).toBeGreaterThan(120)
  await expect(canvas).toHaveAttribute('data-gap-warning', 'true')
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(canvas).not.toHaveAttribute('data-gap-warning', 'true')
})

/** `완료`는 고친 채로 나가고, `뒤로`는 이번에 들어와서 고친 획을 되돌리고 나간다. 되돌린 것은 Redo로 살린다. */
test('획 편집의 뒤로는 이번에 고친 획을 되돌리고 레이아웃으로 나간다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88')
  await expect(page.getByTestId('review-canvas')).toBeVisible({ timeout: 20_000 })
  const undoButton = page.getByRole('button', { name: '형태 편집 실행 취소' })
  const redoButton = page.getByRole('button', { name: '형태 편집 다시 실행' })
  // 잡힌 획의 중심선. 저장소 문자열은 처음엔 비어 있을 수 있어서 화면에 그려진 획으로 비교한다.
  const selectedStroke = () => page.locator('[data-editor-hit="stroke"][data-selected="true"]').getAttribute('d')

  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  await page.waitForFunction(() => document.querySelector('section[aria-label="보정 문장"]')?.getBoundingClientRect().height === 0)
  const before = await selectedStroke()
  expect(before).toBeTruthy()
  await openStrokePoints(page, (paths) => Math.max(0, paths.indexOf(before!)))
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

  // 고친 게 있으면 `뒤로`는 먼저 묻는다. 바깥을 누르면 그대로 남고, `저장하지 않고 나가기`면 되돌리고 나간다.
  await page.getByTestId('jamo-stroke-back').click()
  await expect(page.getByTestId('stroke-back-dialog')).toContainText('2번 고침')
  await page.getByTestId('stroke-back-backdrop').click({ position: { x: 10, y: 10 } })
  await expect(page.getByTestId('stroke-back-dialog')).toHaveCount(0)
  await expect(page.getByTestId('jamo-stroke-tools')).toBeVisible()
  await page.getByTestId('jamo-stroke-back').click()
  await page.getByTestId('stroke-back-discard').click()
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeEnabled()
  // 다시 들어가 보면 획이 들어오기 전 그대로다.
  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  await expect.poll(selectedStroke).toBe(before)
})

test('주소 &mode=stroke&part=JO는 받침이 잡힌 획 편집을 바로 연다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=stroke&part=JO')
  await expect(page.getByRole('region', { name: '멈 완성 글자 편집' })).toBeVisible()
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
  expect(stored.rules[layerKey('right')].faces.JU.left).toBeCloseTo(-0.02, 9)
  // 적용 뒤에도 상자는 그 자리, 세션 Δ는 0.
  await expect.poll(async () => Number(await medialBox.getAttribute('x'))).toBeCloseTo(xBefore - 0.02, 6)
  await expect(resetButton(page)).toHaveCount(0)
})

test('ㅏ의 홀자 오른변을 밀면 보가 길어지고 기둥 두께는 그대로다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  // 안 켠 부품 상자는 칠하지 않아 그림 rect가 없다. 늘 있는 누름 상자로 읽는다(같은 자리).
  const medialBox = page.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][aria-label^="홀자"]').first()
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
  expect(stored.rules[jamoRuleKey('right', 'CH', 'ㄱ')].faces.CH.right).toBeCloseTo(0.02, 9)
  expect(stored.rules[jamoRuleKey('right', 'CH', 'ㅋ')].faces.CH.right).toBeCloseTo(0.02, 9)
  expect(Object.keys(stored.rules).sort()).toEqual([jamoRuleKey('right', 'CH', 'ㄱ'), jamoRuleKey('right', 'CH', 'ㅋ')].sort())
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
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)).rules).toEqual({})
  await page.getByRole('button', { name: '형태 편집 다시 실행' }).click()
  await expect.poll(() => 가.innerHTML()).not.toBe(가Before)

  // 지우기: ㄱ 카드의 ×만 누르면 ㄱ 키만 지워지고 ㅋ 키는 남는다. Undo/Redo 뒤에도 목록은 저장소 그대로.
  await expect(page.getByTestId('layout-override-card')).toHaveCount(2)
  await page.locator('[data-testid="layout-override-card"][data-jamo="ㄱ"]').getByTestId('layout-override-remove').click()
  await expect(page.getByTestId('layout-override-card')).toHaveCount(1)
  const cleared = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(cleared.rules[jamoRuleKey('right', 'CH', 'ㄱ')]).toBeUndefined()
  expect(cleared.rules[jamoRuleKey('right', 'CH', 'ㅋ')].faces.CH.right).toBeCloseTo(0.02, 9)
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
  expect(stored.rules[jamoRuleKey('right-final', 'JO', 'ㄱ')].faces.JO.top).toBeCloseTo(-0.01, 9)
  expect(Object.keys(stored.rules)).toEqual([jamoRuleKey('right-final', 'JO', 'ㄱ')])
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
  expect(stored.rules[layerKey('right')].faces.CH.right).toBeCloseTo(0.02, 9)
  expect(stored.rules[jamoRuleKey('right', 'CH', 'ㄱ')].faces.CH.top).toBeCloseTo(-0.01, 9)
})

/**
 * 범위 띠(G0·G1): 노에서 ㄴ, 로에서 ㄹ을 각각 이 자모만으로 적용하면 bottom 레이아웃 띠에 전체·ㄴ·ㄹ이 찬 칩으로. 칩 누르면 표본이 그 글자, ×는 그 층만.
 * 다른 레이아웃에선 전체만. 띠는 첫 화면(390×844)에서 스크롤 없이 보인다.
 * `전체`는 이제 고를 수 없어 옛 저장분을 심어 연다. 읽기 전용 칩으로 서서 ×로만 지운다.
 */
test('같은 레이아웃에 쌓인 오버라이드가 범위 띠에 보이고, 칩마다 따로 고르고 지운다', async ({ page }) => {
  const KEY = 'noto-layout-delta-v1'
  const initialOf = (name: string) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor((name.codePointAt(0)! - 0xac00) / 588)]
  const overrides = page.getByTestId('layout-override-card')

  // 옛 전체 Δ(첫닿자 윗변 -10u)를 심어 둔다. 지금 UI로는 만들 수 없는 층이다.
  // 이동할 때마다 다시 돌므로 비어 있을 때만 쓴다 — 안 그러면 뒤에 쌓은 자모 Δ를 덮는다.
  await page.addInitScript(([key, value]) => { if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value) }, [KEY, JSON.stringify({ state: { all: { faces: { CH: { top: -0.01 } } }, layers: {}, jamo: {} }, version: 0 })] as const)

  // 노: 심어 둔 전체 위에 ㄴ만 윗변 +20u(ㄴ 작게).
  await page.goto('/workspace/jamo?char=%EB%85%B8&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const propagation = page.getByTestId('review-propagation')
  // 찬 박스는 심어 둔 전체 하나. 그 아래 지금 고른 범위(이 레이아웃)가 점선 박스로 선다. 전체를 고르는 길은 없다.
  await expect(overrides).toHaveCount(1)
  await expect(page.getByTestId('layout-scope-chip')).toHaveCount(1)
  await expect(overrides.nth(0).getByTestId('layout-override-select')).toBeDisabled()
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
  await expect(page.getByTestId('layout-option-stack')).toBeInViewport({ ratio: 1 })
  await expect(overrides.nth(0)).toBeInViewport()
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.rules[''].faces.CH.top).toBeCloseTo(-0.01, 9)
  expect(stored.rules[jamoRuleKey('bottom', 'CH', 'ㄴ')].faces.CH.top).toBeCloseTo(0.02, 9)
  expect(stored.rules[jamoRuleKey('bottom', 'CH', 'ㄹ')].faces.CH.top).toBeCloseTo(-0.02, 9)

  // ㄴ 칩을 누르면 표본이 ㄴ 글자만(같은 문맥), 켜진 자모 칩은 ㄴ 하나.
  const cards = page.getByTestId('review-propagation-card')
  await overrides.nth(1).getByTestId('layout-override-select').click()
  await expect(overrides.nth(1)).toHaveAttribute('data-selected', 'true')
  await expect(overrides.nth(2)).not.toHaveAttribute('data-selected', 'true')
  await expect.poll(async () => { const names = await cards.locator('figcaption b').allInnerTexts(); return names.length > 0 && names.every((name) => initialOf(name) === 'ㄴ' && [8, 12, 13, 17, 18].includes(medialIndexOf(name)) && finalIndexOf(name) === 0) }).toBe(true)
  // 전체 칩은 잠겨 있다. 눌러도 범위가 되지 않고 이 레이아웃이 그대로 켜져 있다.
  await expect(overrides.nth(0).getByTestId('layout-override-select')).toBeDisabled()
  await expect(overrides.nth(0)).not.toHaveAttribute('data-selected', 'true')

  // ㄴ 칩 ×: ㄴ만 사라지고 ㄹ·전체는 그대로. Undo로 돌아온다.
  await overrides.nth(1).getByTestId('layout-override-remove').click()
  await expect(overrides).toHaveCount(2)
  await expect(overrides.nth(1)).toHaveAttribute('data-jamo', 'ㄹ')
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(after.rules[jamoRuleKey('bottom', 'CH', 'ㄴ')]).toBeUndefined()
  expect(after.rules[jamoRuleKey('bottom', 'CH', 'ㄹ')].faces.CH.top).toBeCloseTo(-0.02, 9)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(overrides).toHaveCount(3)

  // 다른 레이아웃(가, right)에서는 전체만 보인다.
  await page.goto('/workspace/jamo?char=%EA%B0%80&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(overrides).toHaveCount(1)
  await expect(overrides.nth(0)).toHaveAttribute('data-kind', 'all')
})

/** 범위 고르기 화면(2026-09-21): 검수 격자를 그대로 쓰고, 범위가 되는 조작은 행·열·그룹 머리 셋뿐이다. 쓸면 지나간 머리가 한 번에 바뀐다. */
/**
 * 범위 고르기 화면(2026-09-21 다시 잡음): 표는 행 홀자 × 열 받침 한 장뿐이고 첫닿자는 표 위 한 줄이다.
 * 범위가 되는 조작은 **사각 하나** — 칸 하나, 칸을 끈 사각, 머리(그 줄 통째)다. 새로 집으면 갈아치운다.
 */
test('표에서 사각을 집으면 그게 범위가 되고, 추천 칩은 표를 켜 준다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('layout-override-more').first().click()
  const picker = page.getByTestId('layout-scope-picker')
  await expect(picker).toBeVisible()
  const countOf = async () => Number((await page.getByTestId('scope-picker-count').innerText()).replace(/[^\d]/g, ''))
  // 열 때는 그 옵션의 범위 그대로다. 이 레이아웃(세로 홀자 + 받침) = 4,617자.
  expect(await countOf()).toBe(4617)
  await expect(page.getByTestId('scope-picker-confirm')).toBeDisabled()
  // 걷어낸 것: 하단 표본 줄과 크게 보기, 발치의 받침 세그먼트.
  await expect(picker.getByTestId('scope-picker-sample')).toHaveCount(0)
  await expect(picker.getByTestId('scope-picker-final')).toHaveCount(0)
  // 표 위 한 줄이 첫닿자 19개를 맡는다(시트 탭 대신).
  await expect(picker.getByTestId('corpus-sheet')).toHaveCount(19)

  // 칸 하나 = 사각 하나. 첫 칸은 홀자 ㅏ × 받침 없음이고, 첫닿자는 표 밖이라 19개가 다 남는다.
  await picker.getByTestId('corpus-cell').first().click()
  await expect.poll(countOf).toBe(19)

  // 칸을 끌면 지나간 행·열의 곱이 범위다. `없` 열과 받침 두 열을 같이 끌어도 `없`이 안 빠진다.
  const cells = picker.getByTestId('corpus-cell')
  const from = await cells.nth(0).boundingBox()
  const to = await cells.nth(2).boundingBox()
  if (!from || !to) throw new Error('칸 자리를 못 읽었습니다.')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(countOf).toBe(57)

  // 행 머리 = 그 홀자 줄 통째(받침 전부). 한 축이 전부인 사각이다.
  await picker.locator('tbody [data-testid="corpus-head"]').first().click()
  await expect.poll(countOf).toBe(532)
  // 열 머리도 같다 — 받침 ㄱ 열 × 홀자 전부.
  await picker.locator('thead [data-testid="corpus-head"]').nth(1).click()
  await expect.poll(countOf).toBe(399)

  // 추천 칩 = 표를 켜 주는 지름길. 누르면 그 규칙으로 갈아치운다.
  const chip = page.getByTestId('scope-picker-chip').filter({ hasText: '구조군' })
  await chip.dispatchEvent('click')
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('scope-picker-name')).toContainText('첫닿자')
  const afterChip = await countOf()

  // 첫닿자 줄을 누르면 표가 그 자모로 다시 그려질 뿐 범위는 그대로다.
  await picker.getByTestId('corpus-sheet').nth(1).click()
  expect(await countOf()).toBe(afterChip)

  // 표에서 사각을 다시 집으면 칩은 꺼진 것으로 본다(표 밖 첫닿자 조건은 남는다).
  await picker.locator('tbody [data-testid="corpus-head"]').nth(1).click()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  const narrowed = await countOf()
  expect(narrowed).toBeLessThan(afterChip)

  // `이 범위로` = 확정. 옵션 스택의 켠 박스가 그 범위 이름과 글자 수로 바뀐다.
  const name = await page.getByTestId('scope-picker-name').innerText()
  await page.getByTestId('scope-picker-confirm').click()
  await expect(picker).toHaveCount(0)
  const selected = page.locator('[data-selected="true"]').filter({ has: page.getByTestId('layout-override-select') })
  await expect(selected).toHaveCount(1)
  await expect(selected).toContainText(narrowed.toLocaleString())
  expect(name).toContain('첫닿자')
})

/** 상단 두 줄(2026-09-21): 적용이 어디까지 닿았는지 `내 문장`에서 바로 보인다. 다음 편집이 시작되면 표시가 빠진다. */
test('적용하면 문장에서 그 범위에 든 글자가 표시되고, 다시 옮기면 표시가 빠진다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const sentence = page.getByRole('region', { name: '보정 문장' })
  const marked = sentence.locator('button[data-layout-applied="true"]')
  await expect(marked).toHaveCount(0)

  await selectMedialBox(page)
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await page.getByTestId('review-propagation-apply').click()
  // 이 레이아웃(세로 홀자 + 받침)에 든 글자만. 멈·별은 들고, 받침 없는 마는 안 든다.
  await expect(sentence.getByRole('button', { name: '멈 편집' })).toHaveAttribute('data-layout-applied', 'true')
  await expect(sentence.getByRole('button', { name: '별 편집' })).toHaveAttribute('data-layout-applied', 'true')
  await expect(sentence.getByRole('button', { name: '마 편집' })).not.toHaveAttribute('data-layout-applied', 'true')

  // 다음 편집이 시작되면 표시가 빠진다.
  await selectRail(page, '바깥기둥 중심')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(marked).toHaveCount(0)
})

test('Noto 고스트를 끄면 닿는 글자 줄에서도 고스트가 빠지고, 켜면 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  const cards = page.getByTestId('review-propagation-card')
  const cardGhosts = page.getByTestId('review-propagation-ghost')
  await expectFilledRow(cards)
  const count = await cards.count()
  await expect(cardGhosts).toHaveCount(count)

  await page.getByTestId('review-ghost-toggle').click()
  await expect(page.getByTestId('review-ghost')).toHaveCount(0)
  await expect(cardGhosts).toHaveCount(0)
  await expect(cards).toHaveCount(count)

  await page.getByTestId('review-ghost-toggle').click()
  await expect(cardGhosts).toHaveCount(count)
})

/** 고정 Δ(G0·G1): 노에서 첫닿자 윗변을 `이 자리에 맞추기`로 고정해 이 레이아웃에 적용하면 bottom 계열 글자의 닿자 윗변이 전부 같은 자리에 모인다. 더하기는 제각각. */
// `이 자리에 맞추기`는 2026-09-24 사용자 요청으로 꺼 둠(`FIX_RAIL_ENABLED`). 켜면 이 테스트도 다시 켠다.
test.skip('변을 이 자리에 맞추면 범위 안 글자가 같은 자리에 모이고, 다시 옮기면 더하기로 돌아온다', async ({ page }) => {
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
  await expect(page.getByTestId('review-propagation-apply')).toContainText('선택 옵션에 저장')
  await expect(page.getByTestId('review-propagation-apply-scope')).toHaveText(/^이 레이아웃 · [\d,]+자$/)
  await expect(page.getByTestId('review-propagation-apply')).toHaveAccessibleName('선택 옵션(이 레이아웃)에 저장')
  await page.getByTestId('review-propagation-apply').click()
  await expect(page.getByTestId('review-reset')).toHaveCount(0)
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY)
  expect(stored.rules[layerKey('bottom')].faces.CH.top).toEqual({ at: expect.closeTo(at2, 3) })
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
test('닿는 글자를 누르면 그 글자가 열리고 위 문장은 그대로다. 안 끝난 Δ가 있으면 잠긴다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  const cards = page.getByTestId('review-propagation-card')
  await expectFilledRow(cards)
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

  const sentenceBefore = await sentence.getByRole('button', { name: /편집/ }).allInnerTexts()
  const name = await cards.first().locator('figcaption b').innerText()
  await cards.first().getByTestId('review-propagation-open').click()
  await expect(page.getByRole('region', { name: `${name} 레이아웃 수정` })).toBeVisible()
  expect(await sentence.getByRole('button', { name: /편집/ }).allInnerTexts()).toEqual(sentenceBefore)
  // 새 글자의 줄이 다시 뜨고, 연 글자는 그 안에 없다.
  await expectFilledRow(cards)
  expect(await cards.locator('figcaption b').allInnerTexts()).not.toContain(name)
})

test('레이아웃 모드 첫 화면에 상단 두 줄과 옵션 스택이 온전히 보이고, 도구는 … 메뉴에 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  const sentence = page.getByRole('region', { name: '보정 문장' })
  await expect(sentence).toHaveAttribute('data-compact', 'true')
  const sentenceBox = (await sentence.boundingBox())!
  expect(sentenceBox.height).toBeLessThanOrEqual(60)
  // 고른 글자(멈)는 한 줄 문장에서 보이는 자리에 있다.
  await expect(page.getByRole('button', { name: '멈 편집' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByTestId('layout-option-stack')).toBeInViewport({ ratio: 1 })
  const cards = page.getByTestId('review-propagation-card')
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })
  // 상단 두 줄: `내 문장` 바로 아래가 `닿는 글자`고, 그 아래가 캔버스다. 하단 표본 줄은 없다.
  const touched = (await page.getByTestId('touched-glyph-row').boundingBox())!
  expect(touched.y).toBeCloseTo(sentenceBox.y + sentenceBox.height, 0)
  expect(touched.y + touched.height).toBeLessThanOrEqual((await page.getByTestId('review-canvas').boundingBox())!.y)
  // 칸은 문장 글자와 같은 크기다(문장 24px 글자 = 27.84px 칸, viewBox 여백 1.16배).
  const sentenceGlyph = (await page.getByRole('button', { name: '멈 편집' }).boundingBox())!
  const cell = (await cards.first().boundingBox())!
  expect(cell.height).toBeCloseTo(sentenceGlyph.height * 1.16, 0)
  // 하단 바는 보선을 옮겼을 때만 선다. 지금은 화면 끝이 바닥이다.
  const barTop = page.viewportSize()!.height
  const row = (await page.getByTestId('review-propagation-cards').boundingBox())!
  for (let index = 0; index < 5; index += 1) {
    const box = (await cards.nth(index).boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(barTop)
    expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 0.5)
  }

  // 도구 넷은 `…` 메뉴 안. 닫혀 있으면 안 보이고, 열면 이름과 함께 보인다. 바깥(Escape)으로 닫힌다.
  const menu = page.getByTestId('workspace-more-menu')
  await expect(menu).toBeHidden()
  await page.getByRole('button', { name: '주 메뉴' }).click()
  await expect(menu.getByRole('link', { name: '자소 원형 새 화면 검토' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '현재 작업을 OTF로 추출' })).toContainText('OTF 추출')
  await expect(menu.getByRole('button', { name: '선택 자모 형태 규칙' })).toBeVisible()
  // 글로벌 스타일은 폰트 전체 값이라 메뉴 안이 아니라 머리에 늘 나와 있다(레이아웃 모드에서도 켜져 있다).
  await expect(menu.getByRole('button', { name: '글로벌 스타일 설정' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.getByRole('button', { name: '글로벌 스타일 설정' })).toBeEnabled()

  // 획 편집에서는 문장 줄이 위로 접히고, 머리의 글로벌 스타일이 패널을 연다.
  await page.getByTestId('review-canvas').locator('[data-edit-part]').first().dispatchEvent('click')
  await expect(page.locator('section[aria-label="보정 문장"]')).toHaveAttribute('data-collapsed', 'true')
  await page.getByRole('button', { name: '글로벌 스타일 설정' }).click()
  await expect(page.getByRole('region', { name: '글로벌 스타일 설정' })).toBeVisible()
})

/** 상단 두 줄은 높이가 같다. 아래로 밀면 `닿는 글자` 줄이 `내 문장`을 밀어 올리고 그 자리에 붙는다 — 옵션을 고르는 동안에도 닿는 글자가 보인다. */
test('아래로 밀면 닿는 글자 줄이 문장 줄을 밀어 올리고 그 자리에 붙는다', async ({ page }) => {
  // 낮은 화면이라야 밀 거리가 문장 줄 높이보다 길다.
  await page.setViewportSize({ width: 390, height: 540 })
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  await expect(page.getByTestId('review-propagation-card').first()).toBeVisible({ timeout: 20_000 })
  const sentence = page.getByRole('region', { name: '보정 문장' })
  const touched = page.getByTestId('touched-glyph-row')
  const sentenceBox = (await sentence.boundingBox())!
  expect((await touched.boundingBox())!.height).toBeCloseTo(sentenceBox.height, 0)

  await page.getByTestId('layout-option-stack').scrollIntoViewIfNeeded()
  await expect(sentence).not.toBeInViewport()
  const stuck = (await touched.boundingBox())!
  expect(stuck.y).toBeCloseTo(sentenceBox.y, 0)
  // 붙은 줄도 눌린다(캔버스에 안 가린다).
  await expect(page.getByTestId('review-propagation-card').first().getByTestId('review-propagation-open')).toBeEnabled()
  await expect(page.getByTestId('layout-option-stack')).toBeInViewport()
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
    const box = target.getByTestId('review-canvas').locator('[data-testid="review-part-hit"][aria-label^="홀자"]').first()
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


test('보선을 옮기고 새 옵션으로 저장하면, 옮긴 부품의 자모가 미리 골라진 범위에 바로 적용되고 그 옵션이 켜진다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%B0%9C&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await selectPartBox(page, '첫닿자 ㅂ')
  await selectRail(page, '첫닿자 윗변')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')

  // 저장할 자리는 둘 — 켠 옵션(`이 레이아웃`), 또는 새 옵션.
  await expect(page.getByTestId('review-propagation-apply')).toContainText('선택 옵션에 저장')
  // 두 버튼 다 저장될 범위와 글자 수를 아랫줄에 적는다. 신규는 옮긴 부품의 자모 하나가 씨앗이다.
  await expect(page.getByTestId('review-propagation-apply-scope')).toHaveText('이 레이아웃 · 4,617자')
  await expect(page.getByTestId('review-propagation-apply-new-scope')).toHaveText('첫닿자 ㅂ · 243자')
  await expect(page.getByTestId('review-propagation-apply')).toHaveAccessibleName('선택 옵션(이 레이아웃)에 저장')
  await page.getByTestId('review-propagation-apply-new').click()

  // 범위 고르기 화면은 옮긴 부품(첫닿자)의 지금 글자 자모 하나를 골라 둔 채 열리고, 그대로 확정할 수 있다.
  const picker = page.getByTestId('layout-scope-picker')
  await expect(picker.getByTestId('scope-picker-name')).toContainText('첫닿자 ㅂ')
  await expect(picker.getByTestId('scope-picker-confirm')).toHaveText('신규 옵션에 저장')
  await expect(picker.getByTestId('scope-picker-confirm')).toBeEnabled()
  await picker.getByTestId('scope-picker-confirm').click()
  await expect(picker).toHaveCount(0)

  // 옵션이 생기고, 값이 거기에만 들어가고(바닥에는 안 들어간다), 그 옵션이 켜진다. 세션 편집은 비워진다.
  const card = page.locator('[data-testid="layout-override-card"][data-jamo="ㅂ"]')
  await expect(card).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('review-reset')).toHaveCount(0)
  const keys = await page.evaluate(() => Object.keys(JSON.parse(window.localStorage.getItem('noto-layout-delta-v1') ?? '{}').state?.rules ?? {}))
  expect(keys).toEqual(['f=right|j=1|i=ㅂ'])
})

test('옵션 스택에는 지금 고치는 글자에 닿는 옵션만 선다', async ({ page }) => {
  // 같은 칸(오른쪽 홀자 · 받침)에 첫닿자 ㄱ 옵션과 첫닿자 ㅁ 옵션을 심어 둔다.
  const rules = { 'f=right|j=1|i=ㄱ': { faces: { CH: { top: 0.01 } } }, 'f=right|j=1|i=ㅁ': { faces: { CH: { top: 0.02 } } } }
  await page.addInitScript(([key, value]) => { if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value) }, ['noto-layout-delta-v1', JSON.stringify({ state: { rules }, version: 0 })] as const)

  // 각: ㄱ 옵션만 선다. ㅁ 옵션은 이 글자에 안 닿는다.
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('layout-override-card')).toHaveCount(1)
  await expect(page.locator('[data-testid="layout-override-card"][data-jamo="ㄱ"]')).toBeVisible()

  // 맘: 거꾸로 ㅁ 옵션만 선다.
  await page.goto('/workspace/jamo?char=%EB%A7%98&mode=layout')
  await expect(page.getByTestId('review-fit-box').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('layout-override-card')).toHaveCount(1)
  await expect(page.locator('[data-testid="layout-override-card"][data-jamo="ㅁ"]')).toBeVisible()
})

test('닿는 글자 줄만 옆으로 밀리고, 바깥 화면에는 가로 스크롤이 안 생긴다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EB%A9%88&mode=layout')
  const cards = page.getByTestId('review-propagation-cards')
  await expect(cards.locator('figure').first()).toBeVisible({ timeout: 20_000 })
  // 숨긴 이름표가 줄의 잘림을 빠져나가면 바깥 덩어리가 옆으로 늘어난다.
  const leaking = await cards.evaluate((el) => {
    const out: string[] = []
    for (let node = el.parentElement; node; node = node.parentElement) if (node.scrollWidth > node.clientWidth + 1) out.push(`${node.tagName} ${node.clientWidth}<${node.scrollWidth}`)
    return out
  })
  expect(leaking).toEqual([])
})

/** 획 편집에 잠긴 동안 빈 곳을 눌러 선택이 풀려도 부품 상자는 잠긴 자소만 제 색이다. 다른 자소 상자가 켜지지 않는다. */
test('획 편집 중 빈 곳을 눌러도 잠긴 자소 상자만 켜져 있다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EA%B0%81&mode=stroke&part=CH')
  const canvas = page.getByTestId('focus-canvas')
  await expect(canvas).toHaveAttribute('data-placement', 'boxes', { timeout: 20_000 })
  const boxes = page.getByTestId('jamo-part-boxes').locator('g[data-part]')
  await canvas.dispatchEvent('pointerdown')
  await expect(page.locator('svg [data-editor-hit="stroke"][data-selected="true"]')).toHaveCount(0)
  await expect(boxes.and(page.locator('[data-active="true"]'))).toHaveCount(1)
  await expect(boxes.and(page.locator('[data-active="true"]'))).toHaveAttribute('data-part', 'CH')
})
