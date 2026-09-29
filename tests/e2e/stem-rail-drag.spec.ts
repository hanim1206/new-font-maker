import { expect, test, type Page } from '@playwright/test'

/**
 * 홀자 줄기 끝점 = 보선(G1). 획 편집에서 이름 있는 줄기를 세로로 옮기면 저장 획이 아니라 이 레이아웃의 보선이 움직이고,
 * 머리 `‹`로 나갈 때 한 번 "어디까지 반영할까요?"를 묻는다. 뺀 홀자는 `이 자모만` 층에 반대 Δ로 남는다.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md
 */

// 첫 글자는 개발 서버가 막 떠서 모델 · 모듈을 처음 묶느라 오래 걸린다.
test.describe.configure({ timeout: 120_000 })

const LAYOUT_KEY = 'noto-layout-delta-v1'
const RIGHT_OPEN = 'f=right|j=0'
type Rules = Record<string, { medial?: Record<string, Record<string, number>> }>
const rules = (page: Page) => page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}').state?.rules ?? {}) as Rules, LAYOUT_KEY)
const beamDelta = async (page: Page, rule = RIGHT_OPEN) => (await rules(page))[rule]?.medial?.JU?.['primaryBeam.center'] ?? 0
/** 획 편집 캔버스의 그 획(중심선 d). */
const strokePath = (page: Page, id: string) => page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`).getAttribute('d')

async function selectStroke(page: Page, id: string) {
  const hit = page.locator(`[data-editor-hit="stroke"][data-stroke-id="${id}"]`)
  await hit.dispatchEvent('pointerdown')
  await hit.dispatchEvent('pointerup')
}

test('곁줄기를 세로로 옮기면 보선이 움직이고 획은 그대로, ↶로 돌아온다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const jamoBefore = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('font-maker-jamo-data') ?? '{}').state?.jungseong?.['ㅏ'] ?? null))
  const pathBefore = await strokePath(page, 'ㅏ-2')
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => beamDelta(page)).toBeLessThan(0)
  // 잉크(캔버스 획)는 올라가고, 저장 획은 그대로다.
  await expect.poll(() => strokePath(page, 'ㅏ-2')).not.toBe(pathBefore)
  // 자모 저장은 늦춰 쓴다. 쓸 게 있었다면 쓰고 난 뒤에 본다.
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('font-maker-jamo-data') ?? '{}').state?.jungseong?.['ㅏ'] ?? null))).toBe(jamoBefore)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(() => beamDelta(page)).toBe(0)
  await expect.poll(() => strokePath(page, 'ㅏ-2')).toBe(pathBefore)
})

test('나갈 때 반영 고르기가 뜨고, ㅐ를 빼면 ㅐ만 이 자모만 층에 반대 Δ가 남는다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => beamDelta(page)).toBeLessThan(0)
  const moved = await beamDelta(page)

  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  // 같은 역할(가운데 가로)을 쓰는 오른쪽 홀자 넷. 고친 ㅏ는 뺄 수 없다.
  await expect(sheet.locator('[data-char]')).toHaveCount(4)
  await expect(sheet.locator('[data-char="ㅏ"]')).toHaveAttribute('aria-disabled', 'true')
  await expect(sheet.locator('[data-kind="rail"][aria-pressed="true"]')).toHaveCount(4)
  await sheet.getByRole('button', { name: 'ㅐ 빼기' }).click()
  await expect(sheet.locator('[data-kind="rail"][aria-pressed="true"]')).toHaveCount(3)
  // 빼는 순간 반대 Δ가 얹혀 카드 · 캔버스가 ㅐ를 이전 자리로 보인다. 다시 담으면 걷힌다.
  await expect.poll(() => beamDelta(page, `${RIGHT_OPEN}|m=ㅐ`)).toBeCloseTo(-moved, 9)
  await sheet.getByRole('button', { name: 'ㅐ 담기' }).click()
  await expect.poll(() => beamDelta(page, `${RIGHT_OPEN}|m=ㅐ`)).toBe(0)
  await sheet.getByRole('button', { name: 'ㅐ 빼기' }).click()
  await page.getByTestId('stem-rail-apply-go').click()

  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  expect(await beamDelta(page)).toBeCloseTo(moved, 9)
  expect(await beamDelta(page, `${RIGHT_OPEN}|m=ㅐ`)).toBeCloseTo(-moved, 9)
})

test('취소 · 바깥 · Esc는 획 편집에 남고, 완료만 고른 대로 반영하고 나가고, 되돌려서 옮긴 게 없으면 안 뜬다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => beamDelta(page)).toBeLessThan(0)
  const moved = await beamDelta(page)
  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  // 취소는 나가지 않고 획 편집에 남는다. 옮긴 보선은 그대로고, 다시 나가면 또 묻는다.
  await sheet.getByTestId('stem-rail-apply-cancel').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await expect(page.getByTestId('focus-canvas')).toBeVisible()
  expect(await beamDelta(page)).toBeCloseTo(moved, 9)
  await page.getByTestId('workspace-back').click()
  await expect(sheet).toBeVisible()
  // 바깥(어두운 막) · Esc도 취소와 같다 — 획 편집에 남는다.
  await page.mouse.click(5, 5)
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  await page.getByTestId('workspace-back').click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toHaveCount(0)
  // 나가는 길은 `완료` 하나. 뺀 곳이 없으니 이 레이아웃 Δ만 남는다.
  await page.getByTestId('workspace-back').click()
  await sheet.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  expect(await beamDelta(page)).toBeCloseTo(moved, 9)
  expect(Object.keys(await rules(page)).filter((key) => key.includes('m='))).toEqual([])

  // 다시 들어가 한 번 옮기고 되돌리면, 나갈 때 안 뜬다.
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await page.getByTestId('workspace-back').click()
  await expect(page.getByTestId('stem-rail-apply')).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
})

test('자리 버리기는 옮긴 보선을 들어오기 전으로 돌리고, 모양을 안 고쳤으면 그대로 나간다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => beamDelta(page)).toBeLessThan(0)
  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await sheet.getByRole('button', { name: 'ㅐ 빼기' }).click()
  await sheet.getByTestId('stem-rail-apply-discard').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  expect(await beamDelta(page)).toBeCloseTo(0, 9)
  expect(await beamDelta(page, `${RIGHT_OPEN}|m=ㅐ`)).toBeCloseTo(0, 9)
})

/** 획을 두 번 눌러 점을 펼치고 아래 끝(cy가 큰 점)을 잡는다. */
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

test('안 기둥 아래 끝점을 올리면 그 끝 보선만 움직이고, 기둥 획은 그대로다(곱해지지 않는다)', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%A0&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await pickBottomEnd(page, 'ㅐ-1')
  // 안쪽 보선은 칸 밖까지 긴 실선으로 보인다.
  await expect(page.locator('[data-testid="stem-rail-guides"] line:not([data-border])')).toHaveCount(2)
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(async () => (await rules(page))[RIGHT_OPEN]?.medial?.JU?.['innerPillar.end'] ?? 0).toBeLessThan(0)
  expect((await rules(page))[RIGHT_OPEN]?.medial?.JU?.['primaryBeam.center']).toBeUndefined()
  expect((await rules(page))[RIGHT_OPEN]?.medial?.JU?.['outerPillar.end']).toBeUndefined()
  await page.waitForTimeout(1500)
  const stored = await page.evaluate(() => (JSON.parse(localStorage.getItem('font-maker-jamo-data') ?? '{}').state?.jungseong?.['ㅐ']?.strokes ?? []).find((stroke: { id: string }) => stroke.id === 'ㅐ-1')?.points ?? null)
  if (stored) expect(stored.at(-1).y).toBe(1)
})

test('줄기를 한 번 탭하면 끝 표시가 뜨고, 막대를 끌면 점을 안 펼쳐도 그 끝 보선이 움직인다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%A0&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  // 들어오면 첫 획이 이미 잡혀 있다. 다른 획을 거쳐 한 번 탭한 상태(점 안 펼침)로 만든다.
  await selectStroke(page, 'ㅐ-3')
  await selectStroke(page, 'ㅐ-1')
  await expect(page.locator('[data-stem-mark="rail"]')).toHaveCount(2)
  await expect(page.locator('[data-editor-point="hit"]')).toHaveCount(0)
  await expect(page.locator('[data-editor-point="visible"]')).toHaveCount(0)
  const bottom = page.locator('[data-stem-mark="rail"][data-rail-key="innerPillar.end"] [data-stem-mark-hit]')
  await bottom.dispatchEvent('pointerdown')
  // 누르면 점이 펼쳐지며 막대 눌림 영역은 빠진다. 손은 캔버스가 잡고 있어 거기서 뗀다.
  await page.getByTestId('focus-canvas').dispatchEvent('pointerup')
  await expect(page.locator('[data-stem-mark][data-rail-key="innerPillar.end"]')).toHaveAttribute('data-active', 'true')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(async () => (await rules(page))[RIGHT_OPEN]?.medial?.JU?.['innerPillar.end'] ?? 0).toBeLessThan(0)
  expect((await rules(page))[RIGHT_OPEN]?.medial?.JU?.['innerPillar.start']).toBeUndefined()
})

test('칸 테두리(바깥 기둥 끝)는 획 편집에서 세로로 잠기고, 밀면 레이아웃에서 옮기라고 알린다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await pickBottomEnd(page, 'ㅏ-1')
  // 테두리 끝은 찬 점, 테두리 보선은 길게 안 그린다.
  await expect(page.locator('[data-stem-mark="locked"]')).toHaveCount(2)
  await expect(page.locator('[data-testid="stem-rail-guides"]')).toHaveCount(0)
  const before = await strokePath(page, 'ㅏ-1')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.getByTestId('stem-rail-border-hint')).toBeVisible()
  expect((await rules(page))[RIGHT_OPEN]?.medial?.JU?.['outerPillar.end']).toBeUndefined()
  expect(await strokePath(page, 'ㅏ-1')).toBe(before)
  // 나갈 때 옮긴 보선이 없으니 창도 안 뜬다.
  await page.getByTestId('workspace-back').click()
  await expect(page.getByTestId('stem-rail-apply')).toHaveCount(0)
})

test('도마를 들고 온 획 편집도 머리 ‹(내 폰트)로 나갈 때 묻고, 닫은 뒤에 나간다', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('bench-seeded')) return
    sessionStorage.setItem('bench-seeded', '1')
    localStorage.setItem('font-maker-workbench', JSON.stringify({ state: { type: 'jungseong', chars: ['ㅏ'], returnTo: '/dashboard/jungseong' }, version: 1 }))
  })
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await expect(page.getByTestId('workspace-font-home')).toBeVisible()
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => beamDelta(page)).toBeLessThan(0)
  await page.getByTestId('workspace-font-home').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  // 아직 안 나갔다.
  await expect(page).toHaveURL(/\/workspace\/jamo/)
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/workspace\/jamo/)
})

const jungseongOf = (page: Page, char: string) => page.evaluate((c) => JSON.stringify(JSON.parse(localStorage.getItem('font-maker-jamo-data') ?? '{}').state?.jungseong?.[c] ?? null), char)

/** 아 · 중성 획 편집에서 그 획의 마지막 점을 곡선화하고 핸들을 밀어 휜 뒤 머리 ‹로 나간다. */
async function bendAndLeave(page: Page, strokeId: string, key: 'Shift+ArrowUp' | 'Shift+ArrowRight') {
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
  // 자모 저장은 늦춰 쓴다 — 고친 뒤 저장된 상태에서 나간다.
  await expect.poll(() => jungseongOf(page, 'ㅓ'), { timeout: 5_000 }).not.toBe('null')
  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  return sheet
}

test('곁줄기를 휘면 같은 갈래(ㅏ)만 켜지고, 다른 곁줄기는 꺼진 채 보여 켠 것만 받는다(↶로 돌아온다)', async ({ page }) => {
  const sheet = await bendAndLeave(page, 'ㅏ-2', 'Shift+ArrowUp')
  const section = sheet.getByTestId('stem-shape-section')
  await expect(section).toHaveCount(1)
  await expect(section).toHaveAttribute('data-leaf', /^gyeotjulgi\.right\.one/)
  // 전 → 후 두 글자.
  await expect(section.getByLabel('ㅏ 고치기 전과 뒤').locator('[data-diff]')).toHaveCount(2)
  await expect(sheet.locator('[data-kind="shape"]:not([data-extra])[data-char="ㅏ"]')).toHaveAttribute('aria-disabled', 'true')
  await expect(sheet.locator('[data-kind="shape"][data-extra][aria-pressed="true"]')).toHaveCount(0)
  const eo = sheet.locator('[data-kind="shape"][data-extra][data-char="ㅓ"]')
  await expect(eo).toHaveAttribute('aria-pressed', 'false')
  await eo.click()
  await expect(eo).toHaveAttribute('aria-pressed', 'true')
  // 다른 갈래를 켜고 끄는 건 `따로`가 아니다 — 알림 없음.
  await expect(sheet.getByTestId('stem-shape-apart-toast')).toHaveCount(0)
  const eoBefore = await jungseongOf(page, 'ㅓ')
  const yaBefore = await jungseongOf(page, 'ㅑ')
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  await expect.poll(() => jungseongOf(page, 'ㅓ'), { timeout: 5_000 }).not.toBe(eoBefore)
  expect(await jungseongOf(page, 'ㅑ')).toBe(yaBefore)
  const masters = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('font-maker-stem-masters') ?? '{}').state?.masters ?? {}))
  await expect.poll(masters).not.toEqual([])
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(masters).toEqual([])
})

test('기둥을 휘면 같은 갈래 글자가 다 퍼진 채 뜨고, 툭 친 글자만 따로 둔다', async ({ page }) => {
  const sheet = await bendAndLeave(page, 'ㅏ-1', 'Shift+ArrowRight')
  const own = sheet.locator('[data-kind="shape"]:not([data-extra])')
  const count = await own.count()
  expect(count).toBeGreaterThan(1)
  await expect(sheet.locator('[data-kind="shape"]:not([data-extra])[aria-pressed="false"]')).toHaveCount(0)
  await expect(sheet.getByTestId('stem-shape-count').first()).toHaveText(`${count}자에 퍼졌어요`)
  // ㅓ를 툭 → ㅓ만 따로, 알림의 `다시 따르기`로 붙고, 다시 툭 쳐서 따로 둔 채 반영.
  const eo = sheet.locator('[data-kind="shape"]:not([data-extra])[data-char="ㅓ"]')
  await eo.click()
  await expect(eo).toHaveAttribute('data-apart', 'true')
  await expect(sheet.getByTestId('stem-shape-count').first()).toHaveText(`${count - 1}자에 퍼졌어요 · 따로 1`)
  await sheet.getByTestId('stem-shape-apart-toast').getByRole('button', { name: '다시 따르기' }).click()
  await expect(eo).not.toHaveAttribute('data-apart', 'true')
  await expect(sheet.getByTestId('stem-shape-apart-toast')).toHaveCount(0)
  await eo.click()
  const eoBefore = await jungseongOf(page, 'ㅓ')
  const yaBefore = await jungseongOf(page, 'ㅑ')
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect.poll(() => jungseongOf(page, 'ㅑ'), { timeout: 5_000 }).not.toBe(yaBefore)
  expect(await jungseongOf(page, 'ㅓ')).toBe(eoBefore)
})

test('곁줄기 빈 끝을 올리면(기울기) 켠 다른 곁줄기도 같은 쪽으로 기운다', async ({ page }) => {
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
  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet.getByTestId('stem-shape-section')).toHaveAttribute('data-leaf', /^gyeotjulgi\.right\.one/)
  await sheet.locator('[data-kind="shape"][data-extra][data-char="ㅓ"]').click()
  // ㅓ 곁줄기의 빈 끝(왼쪽, 첫 점)이 올라가고 기둥에 붙은 끝은 그대로.
  const eoStroke = async () => JSON.parse(await jungseongOf(page, 'ㅓ')).strokes.find((stroke: { id: string }) => stroke.id === 'ㅓ-2').points as { x: number; y: number }[]
  const before = await eoStroke()
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect.poll(async () => (await eoStroke())[0].y, { timeout: 5_000 }).toBeLessThan(before[0].y)
  expect((await eoStroke())[1]).toEqual(before[1])
})
