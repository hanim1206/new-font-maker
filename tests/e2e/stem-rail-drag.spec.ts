import { expect, test, type Page } from '@playwright/test'

/**
 * 획 편집의 홀자 줄기. 자리(보선)는 레이아웃 편집에서만 옮긴다 — 획 편집에서 줄기를 세로로 옮기면 그 홀자의 저장 획이 바뀌고(보선 위에 얹히는 차이) 보선 Δ는 안 생긴다.
 * 모양(휨 · 기울기)을 고치면 그 획을 잡았을 때 도구 줄 맨 아래 `전파`가 뜨고, 누르면 그 획 하나를 기준으로 전파 창(도마식 판)이 뜬다 — 같은 자리는 다 켜진 채, 툭 친 글자만 빠진다.
 * 나갈 때 · 다른 글자로 갈 때는 묻지 않는다. 자리만 옮겼으면(모양 그대로) `전파`가 안 뜬다.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md
 */

// 첫 글자는 개발 서버가 막 떠서 모델 · 모듈을 처음 묶느라 오래 걸린다.
test.describe.configure({ timeout: 120_000 })

const LAYOUT_KEY = 'noto-layout-delta-v1'
type Rules = Record<string, { medial?: Record<string, Record<string, number>> }>
const rules = (page: Page) => page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}').state?.rules ?? {}) as Rules, LAYOUT_KEY)
/** 획 편집이 만든 홀자 보선 Δ가 하나라도 있나. */
const anyMedialDelta = async (page: Page) => Object.values(await rules(page)).some((rule) => rule.medial && Object.keys(rule.medial).length > 0)
/** 획 편집 캔버스의 그 획(중심선 d). */
const strokePath = (page: Page, id: string) => page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`).getAttribute('d')
const jungseongOf = (page: Page, char: string) => page.evaluate((c) => JSON.stringify(JSON.parse(localStorage.getItem('font-maker-jamo-data') ?? '{}').state?.jungseong?.[c] ?? null), char)
const storedPoints = async (page: Page, char: string, id: string) => JSON.parse(await jungseongOf(page, char))?.strokes?.find((stroke: { id: string }) => stroke.id === id)?.points as { x: number; y: number }[] | undefined

async function selectStroke(page: Page, id: string) {
  const hit = page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`)
  await hit.dispatchEvent('pointerdown')
  await hit.dispatchEvent('pointerup')
}

async function pickBottomEnd(page: Page, id: string) {
  const hit = page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`)
  for (let tap = 0; tap < 2; tap += 1) { await hit.dispatchEvent('pointerdown'); await hit.dispatchEvent('pointerup') }
  const points = page.locator('[data-editor-point="hit"]')
  await expect(points.first()).toBeAttached()
  const ys = await points.evaluateAll((els) => els.map((el) => Number(el.getAttribute('cy'))))
  const bottom = points.nth(ys.indexOf(Math.max(...ys)))
  await bottom.dispatchEvent('pointerdown')
  await bottom.dispatchEvent('pointerup')
}

test('곁줄기를 세로로 옮기면 저장 획이 바뀌고 보선 Δ는 안 생긴다, ↶로 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const pathBefore = await strokePath(page, 'ㅏ-2')
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => strokePath(page, 'ㅏ-2')).not.toBe(pathBefore)
  // 자모 저장은 늦춰 쓴다.
  await expect.poll(async () => (await storedPoints(page, 'ㅏ', 'ㅏ-2'))?.[0].y ?? 1, { timeout: 5_000 }).toBeLessThan(0.5)
  expect(await anyMedialDelta(page)).toBe(false)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(() => strokePath(page, 'ㅏ-2')).toBe(pathBefore)
})

test('이름 있는 줄기를 잡으면 자리만 옮겨도 `전파`가 뜨고, 나가면 묻지 않고 바로 나간다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const pathBefore = await strokePath(page, 'ㅏ-2')
  await selectStroke(page, 'ㅏ-2')
  await expect(page.getByTestId('jamo-stroke-spread')).toBeVisible()
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => strokePath(page, 'ㅏ-2')).not.toBe(pathBefore)
  await expect(page.getByTestId('jamo-stroke-spread')).toBeVisible()
  await page.getByTestId('workspace-back').click()
  await expect(page.getByTestId('stem-rail-apply')).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('바깥 기둥 아래 끝(칸 테두리)도 획 편집에서 끌린다 — 잠금 · 칩 없이 저장 획이 바뀐다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await pickBottomEnd(page, 'ㅏ-1')
  // 테두리 끝은 찬 점으로 표시만 한다. 테두리 보선은 길게 안 그린다.
  await expect(page.locator('[data-stem-mark="locked"]')).toHaveCount(2)
  await expect(page.locator('[data-testid="stem-rail-guides"]')).toHaveCount(0)
  const before = await strokePath(page, 'ㅏ-1')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => strokePath(page, 'ㅏ-1')).not.toBe(before)
  await expect(page.getByTestId('stem-rail-border-hint')).toHaveCount(0)
  await expect.poll(async () => (await storedPoints(page, 'ㅏ', 'ㅏ-1'))?.at(-1)?.y ?? 1, { timeout: 5_000 }).toBeLessThan(1)
  expect(await anyMedialDelta(page)).toBe(false)
})

test('줄기를 한 번 탭하면 끝 표시가 뜨고, 막대를 누르면 점을 안 펼쳐도 그 끝점이 잡혀 끌린다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%A0&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  // 들어오면 첫 획이 이미 잡혀 있다. 다른 획을 거쳐 한 번 탭한 상태(점 안 펼침)로 만든다.
  await selectStroke(page, 'ㅐ-3')
  await selectStroke(page, 'ㅐ-1')
  await expect(page.locator('[data-stem-mark="rail"]')).toHaveCount(2)
  await expect(page.locator('[data-editor-point="hit"]')).toHaveCount(0)
  const bottom = page.locator('[data-stem-mark="rail"][data-rail-key="innerPillar.end"] [data-stem-mark-hit]')
  await bottom.dispatchEvent('pointerdown')
  // 누르면 점이 펼쳐지며 막대 눌림 영역은 빠진다. 손은 캔버스가 잡고 있어 거기서 뗀다.
  await page.getByTestId('focus-canvas').dispatchEvent('pointerup')
  await expect(page.locator('[data-stem-mark][data-rail-key="innerPillar.end"]')).toHaveAttribute('data-active', 'true')
  const before = await strokePath(page, 'ㅐ-1')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => strokePath(page, 'ㅐ-1')).not.toBe(before)
  expect(await anyMedialDelta(page)).toBe(false)
})

test('취소 · 바깥 · Esc는 창만 닫고, 완료는 반영하고 획 편집에 남는다 — 나갈 땐 안 묻는다', async ({ page }) => {
  const sheet = await bendAndSpread(page, 'ㅏ-2', 'Shift+ArrowUp')
  await sheet.getByTestId('stem-rail-apply-cancel').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await page.getByTestId('jamo-stroke-spread').click()
  await expect(sheet).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(sheet).toHaveCount(0)
  await page.getByTestId('jamo-stroke-spread').click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await page.getByTestId('jamo-stroke-spread').click()
  await sheet.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  // 퍼뜨린 뒤엔 마스터와 같아 `전파`가 사라진다. 나가면 묻지 않는다.
  await expect(page.getByTestId('jamo-stroke-spread')).toHaveCount(0)
  await page.getByTestId('workspace-back').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('도마를 들고 온 획 편집에서 모양을 고치면 `전파`가 뜨고, 머리 ‹(내 폰트)로 나갈 땐 묻지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('bench-seeded')) return
    sessionStorage.setItem('bench-seeded', '1')
    localStorage.setItem('font-maker-workbench', JSON.stringify({ state: { type: 'jungseong', chars: ['ㅏ'], returnTo: '/dashboard/jungseong' }, version: 1 }))
  })
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await expect(page.getByTestId('workspace-font-home')).toBeVisible()
  const hit = page.locator('[data-editor-hit="stroke"][data-stroke-id="ㅏ-2"]')
  for (let tap = 0; tap < 2; tap += 1) { await hit.dispatchEvent('pointerdown'); await hit.dispatchEvent('pointerup') }
  const points = page.locator('[data-editor-point="hit"]')
  await points.last().dispatchEvent('pointerdown')
  await points.last().dispatchEvent('pointerup')
  await page.getByRole('button', { name: '곡선화' }).click()
  const handle = page.locator('[data-editor-handle-hit="in"]')
  await handle.dispatchEvent('pointerdown')
  await handle.dispatchEvent('pointerup')
  await page.keyboard.press('Shift+ArrowUp')
  await expect(page.getByTestId('jamo-stroke-spread')).toBeVisible()
  await page.getByTestId('workspace-font-home').click()
  await expect(page.getByTestId('stem-rail-apply')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/workspace\/jamo/)
})

/** 아 · 중성 획 편집에서 그 획의 마지막 점을 곡선화하고 핸들을 밀어 휜 뒤 `전파`를 누른다. */
async function bendAndSpread(page: Page, strokeId: string, key: 'Shift+ArrowUp' | 'Shift+ArrowRight') {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const hit = page.locator(`[data-editor-hit="stroke"][data-stroke-id="${strokeId}"]`)
  for (let tap = 0; tap < 2; tap += 1) { await hit.dispatchEvent('pointerdown'); await hit.dispatchEvent('pointerup') }
  const points = page.locator('[data-editor-point="hit"]')
  await points.last().dispatchEvent('pointerdown')
  await points.last().dispatchEvent('pointerup')
  await page.getByRole('button', { name: '곡선화' }).click()
  const handle = page.locator('[data-editor-handle-hit="in"]')
  await handle.dispatchEvent('pointerdown')
  await handle.dispatchEvent('pointerup')
  await page.keyboard.press(key)
  await page.keyboard.press(key)
  // 자모 저장은 늦춰 쓴다 — 고친 뒤 저장된 상태에서 연다.
  await expect.poll(() => jungseongOf(page, 'ㅓ'), { timeout: 5_000 }).not.toBe('null')
  await page.getByTestId('jamo-stroke-spread').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  return sheet
}

test('곁줄기를 휘면 같은 자리(하나짜리 ㅏ ㅓ ㅘ ㅝ)가 켜진 채 뜨고, ㅑ 같은 둘짜리는 꺼진 채 — 받기 뒤 ↶로 돌아온다', async ({ page }) => {
  const sheet = await bendAndSpread(page, 'ㅏ-2', 'Shift+ArrowUp')
  await expect(sheet.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
  // 전 → 후 두 글자.
  await expect(sheet.getByLabel('ㅏ 고치기 전과 뒤').locator('[data-diff]')).toHaveCount(2)
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅏ"]')).toHaveAttribute('aria-disabled', 'true')
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅓ"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅑ"]')).toHaveAttribute('aria-pressed', 'false')
  const eoBefore = await jungseongOf(page, 'ㅓ')
  const yaBefore = await jungseongOf(page, 'ㅑ')
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await expect.poll(() => jungseongOf(page, 'ㅓ'), { timeout: 5_000 }).not.toBe(eoBefore)
  expect(await jungseongOf(page, 'ㅑ')).toBe(yaBefore)
  const masters = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('font-maker-stem-masters') ?? '{}').state?.masters ?? {}))
  await expect.poll(masters).not.toEqual([])
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(masters).toEqual([])
})

test('기둥을 휘면 바깥 기둥 16자가 다 켜진 채 뜨고, 툭 친 글자만 빠진다 — 묶음 머리와 자리 토글은 한꺼번에', async ({ page }) => {
  const sheet = await bendAndSpread(page, 'ㅏ-1', 'Shift+ArrowRight')
  await expect(sheet.getByTestId('stem-spread-count')).toHaveText('16')
  await expect(sheet.locator('[data-kind="shape"][aria-pressed="false"]')).toHaveCount(0)
  // ㅓ를 툭 → ㅓ만 빠진다(흐려질 뿐 표식 · 알림 없음). 다시 툭 치면 돌아오고, 다시 빼서 반영.
  const eo = sheet.locator('[data-kind="shape"][data-char="ㅓ"]')
  await eo.click()
  await expect(eo).toHaveAttribute('aria-pressed', 'false')
  await expect(sheet.getByTestId('stem-spread-count')).toHaveText('15')
  await expect(sheet.getByTestId('stem-shape-apart-toast')).toHaveCount(0)
  await eo.click()
  await expect(eo).toHaveAttribute('aria-pressed', 'true')
  await eo.click()
  // 기둥 둘짜리 ㅐ는 처음부터 둘 다 → 끔 → 바깥만 → 둘 다.
  const ae = sheet.locator('[data-kind="shape"][data-char="ㅐ"]')
  await expect(ae).toHaveAttribute('data-slots', 'outer inner')
  await ae.click()
  await expect(ae).toHaveAttribute('aria-pressed', 'false')
  await ae.click()
  await expect(ae).toHaveAttribute('data-slots', 'outer')
  await ae.click()
  await expect(ae).toHaveAttribute('data-slots', 'outer inner')
  // 묶음 머리 옆 `안` 토글 = 묶음의 안 기둥 열 전부(처음엔 다 켜져 있어 끄고, 다시 켠다). 안 기둥이 없는 ㅓ는 그대로 꺼진 채. 머리 체크 = 묶음 줄기 전부.
  const group = sheet.locator('[data-testid="stem-spread-group"][data-group="all"]')
  await group.getByRole('button', { name: '안' }).click()
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅔ"]')).toHaveAttribute('data-slots', 'outer')
  await expect(eo).toHaveAttribute('aria-pressed', 'false')
  await group.getByRole('button', { name: '안' }).click()
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅔ"]')).toHaveAttribute('data-slots', 'outer inner')
  // 머리 체크 = 묶음 획 전부 일괄. ㅓ가 꺼져 있어 ─, 누르면 다 켜지고(ㅓ는 바깥뿐), 다시 누르면 다 꺼진다.
  await expect(group.getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed')
  await group.getByRole('checkbox').click()
  await expect(eo).toHaveAttribute('aria-pressed', 'true')
  await expect(eo).toHaveAttribute('data-slots', 'outer')
  await expect(group.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await group.getByRole('checkbox').click()
  await expect(sheet.locator('[data-kind="shape"][aria-pressed="true"]')).toHaveCount(1)
  await group.getByRole('checkbox').click()
  await expect(sheet.getByTestId('stem-spread-count')).toHaveText('16')
  await eo.click()
  // 단일 · 섞임 축으로 바꿔도 켠 상태는 그대로다.
  await sheet.getByRole('tab', { name: '단일 · 섞임' }).click()
  await expect(sheet.locator('[data-testid="stem-spread-group"]')).toHaveCount(2)
  await expect(eo).toHaveAttribute('aria-pressed', 'false')
  const eoBefore = await jungseongOf(page, 'ㅓ')
  const yaBefore = await jungseongOf(page, 'ㅑ')
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect.poll(() => jungseongOf(page, 'ㅑ'), { timeout: 5_000 }).not.toBe(yaBefore)
  expect(await jungseongOf(page, 'ㅓ')).toBe(eoBefore)
})

test('곁줄기 끝을 올리면(기울기) 켜진 다른 곁줄기도 같은 방향으로 기운다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const hit = page.locator('[data-editor-hit="stroke"][data-stroke-id="ㅏ-2"]')
  for (let tap = 0; tap < 2; tap += 1) { await hit.dispatchEvent('pointerdown'); await hit.dispatchEvent('pointerup') }
  const points = page.locator('[data-editor-point="hit"]')
  await points.last().dispatchEvent('pointerdown')
  await points.last().dispatchEvent('pointerup')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => jungseongOf(page, 'ㅓ'), { timeout: 5_000 }).not.toBe('null')
  await page.getByTestId('jamo-stroke-spread').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅓ"]')).toHaveAttribute('aria-pressed', 'true')
  // ㅓ 곁줄기도 그려진 방향 그대로(거울 아님) — 시작점(왼쪽)은 그대로, 끝점(기둥 쪽)이 올라간다.
  const eoStroke = async () => (await storedPoints(page, 'ㅓ', 'ㅓ-2'))!
  const before = await eoStroke()
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect.poll(async () => (await eoStroke())[1].y, { timeout: 5_000 }).toBeLessThan(before[1].y)
  expect((await eoStroke())[0]).toEqual(before[0])
})
