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
  await expect(page.getByTestId('stem-rail-apply-count')).toHaveText('4')
  await sheet.getByRole('button', { name: 'ㅐ 빼기' }).click()
  await expect(page.getByTestId('stem-rail-apply-count')).toHaveText('3')
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

test('창은 막지 않는다 — 바깥을 누르면 고른 대로(전부) 반영하고 나가고, 되돌려서 옮긴 게 없으면 안 뜬다', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  await selectStroke(page, 'ㅏ-2')
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => beamDelta(page)).toBeLessThan(0)
  const moved = await beamDelta(page)
  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: '취소' })).toHaveCount(0)
  // 바깥(어두운 막)을 누르면 나간다. 뺀 곳이 없으니 이 레이아웃 Δ만 남는다.
  await page.mouse.click(5, 5)
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

test('기둥 아래 끝점을 내리면 기둥 끝 보선만 움직이고, 기둥 획은 그대로다(곱해지지 않는다)', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
  const hit = page.locator('[data-editor-hit="stroke"][data-stroke-id="ㅏ-1"]')
  for (let tap = 0; tap < 2; tap += 1) { await hit.dispatchEvent('pointerdown'); await hit.dispatchEvent('pointerup') }
  const points = page.locator('[data-editor-point="hit"]')
  await expect(points.first()).toBeAttached()
  // 아래 끝 = cy가 큰 점.
  const ys = await points.evaluateAll((els) => els.map((el) => Number(el.getAttribute('cy'))))
  const bottom = points.nth(ys.indexOf(Math.max(...ys)))
  await bottom.dispatchEvent('pointerdown')
  await bottom.dispatchEvent('pointerup')
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => (await rules(page))[RIGHT_OPEN]?.medial?.JU?.['outerPillar.end'] ?? 0).toBeGreaterThan(0)
  expect((await rules(page))[RIGHT_OPEN]?.medial?.JU?.['primaryBeam.center']).toBeUndefined()
  await page.waitForTimeout(1500)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('font-maker-jamo-data') ?? '{}').state?.jungseong?.['ㅏ']?.strokes?.[0]?.points ?? null)
  if (stored) expect(stored.at(-1).y).toBe(1)
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

test('줄기 모양을 휘면 나갈 때 갈래 묶음으로 묻고, 닫으면 형제에 반영된다(↶로 돌아온다)', async ({ page }) => {
  await page.goto('/workspace/jamo?char=%EC%95%84&mode=stroke&part=JU')
  await expect(page.getByTestId('focus-canvas')).toHaveAttribute('data-placement', 'boxes', { timeout: 60_000 })
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
  await page.keyboard.press('Shift+ArrowUp')

  await page.getByTestId('workspace-back').click()
  const sheet = page.getByTestId('stem-rail-apply')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading')).toContainText('곁줄기')
  await expect(sheet.locator('[data-kind="shape"][data-char="ㅏ"]')).toHaveAttribute('aria-disabled', 'true')
  expect(await sheet.locator('[data-kind="shape"]').count()).toBeGreaterThan(1)
  await page.getByTestId('stem-rail-apply-go').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible()
  const masters = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('font-maker-stem-masters') ?? '{}').state?.masters ?? {}))
  await expect.poll(masters).not.toEqual([])
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect.poll(masters).toEqual([])
})
