import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

/** 검수 탭 = 내 글자 뷰어. 칸은 프로젝트 획으로 그리고 Noto 추출 결과는 읽지 않는다. */

const cell = (page: Page, char: string) => page.locator(`[data-testid="corpus-cell"][data-codepoint="${char.codePointAt(0)}"]`)
/** 칸은 화면에 들어와야 그려진다. 끌어온 뒤 그려진 획을 읽는다. */
async function inkOf(page: Page, char: string): Promise<string> {
  await cell(page, char).scrollIntoViewIfNeeded()
  return cell(page, char).locator('svg').evaluate((svg) => svg.innerHTML)
}
const baseJamos = () => JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/baseJamos.json', import.meta.url)), 'utf8'))

async function openGrid(page: Page): Promise<void> {
  // 추출 결과 API가 없어도 격자가 떠야 한다(배포 빌드에는 이 API가 없다).
  await page.route('**/api/noto-corpus**', (route) => route.abort())
  await page.goto('/workspace/review')
  await expect(cell(page, '가').locator('svg')).toBeVisible({ timeout: 20_000 })
  // 모델을 읽기 전에는 스키마 배치로 먼저 그려진다. 모델 상자로 다시 그려져 멈출 때까지 기다린다.
  await page.waitForLoadState('networkidle')
  let previous = ''
  await expect.poll(async () => { const ink = await inkOf(page, '각'); const settled = ink === previous; previous = ink; return settled }, { intervals: [300] }).toBe(true)
}

test('격자 칸은 내 획으로 그려지고 Noto 검수 표시는 없다', async ({ page }) => {
  await openGrid(page)
  await expect(page.getByTestId('corpus-cell')).toHaveCount(588)
  // 화면에 들어온 칸만 그린다. 첫 화면에서 588칸을 다 그리지 않는다.
  const drawn = await page.locator('[data-testid="corpus-cell"] svg').count()
  expect(drawn).toBeGreaterThan(0)
  expect(drawn).toBeLessThan(588)
  await cell(page, '긯').scrollIntoViewIfNeeded()
  await expect(cell(page, '긯').locator('svg')).toBeVisible()
  await expect(page.locator('[data-testid="corpus-cell"][data-status]')).toHaveCount(0)
  await expect(page.getByTestId('review-xor-legend')).toHaveCount(0)
  await expect(page.getByTestId('review-pick-xor')).toHaveCount(0)
  await expect(page.getByText('Noto 대비 xor')).toHaveCount(0)
  await expect(page.getByText('승인 측정')).toHaveCount(0)
  await expect(page.getByRole('group', { name: '칸 크기' })).toHaveCount(0)
  await expect(page.getByTestId('review-pick').locator('svg')).toBeVisible()

  // 칸 탭 = 선택, 같은 칸 다시 탭 = 자소 탭 레이아웃 모드.
  await cell(page, '각').click()
  await expect(cell(page, '각')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('review-pick')).toContainText('선택 · 각')
  await cell(page, '각').click()
  await expect(page).toHaveURL(/\/workspace\/jamo\?char=%EA%B0%81&mode=layout&solo=1$/)
  // 격자에서 들어오면 보정 문장에는 그 글자 하나만 올라간다.
  const sentence = page.getByRole('region', { name: '보정 문장' })
  await expect(sentence.getByRole('button', { name: /편집/ })).toHaveCount(1)
  await expect(sentence.getByRole('button', { name: '각 편집' })).toHaveAttribute('aria-current', 'true')
})

test('자모 획을 고치면 그 자모가 든 칸의 글자가 바뀐다', async ({ page, context }) => {
  await openGrid(page)
  const base = { 가: await inkOf(page, '가'), 각: await inkOf(page, '각') }

  const jamos = baseJamos()
  jamos.choseong['ㄱ'].strokes[0].points[1].x = 0.6
  jamos.choseong['ㄱ'].strokes[0].points[2].x = 0.6
  const edited = await context.newPage()
  await edited.addInitScript((state) => { localStorage.setItem('font-maker-jamo-data', JSON.stringify({ state, version: 0 })) }, { choseong: jamos.choseong, jungseong: jamos.jungseong, jongseong: jamos.jongseong })
  await openGrid(edited)
  expect(await inkOf(edited, '가')).not.toBe(base.가)
  expect(await inkOf(edited, '각')).not.toBe(base.각)
})

test('저장된 배치 Δ는 닿는 칸의 배치만 바꾼다', async ({ page, context }) => {
  await openGrid(page)
  const base = { 가: await inkOf(page, '가'), 각: await inkOf(page, '각'), 곡: await inkOf(page, '곡') }

  // 세로 홀자 · 받침 있음 레이아웃에서 첫닿자가 ㄱ인 글자만.
  const delta = { all: {}, layers: {}, jamo: { 'right-final': { 'CH:ㄱ': { faces: { CH: { bottom: -0.08 } } } } } }
  const moved = await context.newPage()
  await moved.addInitScript((state) => { localStorage.setItem('noto-layout-delta-v1', JSON.stringify({ state, version: 0 })) }, delta)
  await openGrid(moved)
  expect(await inkOf(moved, '각')).not.toBe(base.각)
  expect(await inkOf(moved, '가')).toBe(base.가)
  expect(await inkOf(moved, '곡')).toBe(base.곡)
})

test('축 배치 셋과 받침 없음·겹받침·혼합 홀자 칸이 모두 그려진다', async ({ page }) => {
  await openGrid(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const expectDrawn = async (count: number, chars: string[]) => {
    await expect(page.getByTestId('corpus-cell')).toHaveCount(count)
    for (const char of chars) {
      await cell(page, char).scrollIntoViewIfNeeded()
      // 획이 하나도 없는 빈 svg면 안 된다.
      await expect(cell(page, char).locator('svg path').first()).toBeAttached()
    }
  }
  await expectDrawn(21 * 28, ['가', '과', '괋', '긔', '값', '긯'])

  // 축 배치는 개발용 스티키 토글 안에 있다. 평소 화면에는 없다.
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.getByTestId('corpus-pivot-toggle').click()
  const pivot = page.getByRole('combobox')
  await pivot.selectOption('medial-initial')
  await expectDrawn(21 * 19, ['가', '화', '희'])
  await pivot.selectOption('initial-final')
  await expectDrawn(19 * 28, ['가', '핳', '낣'])
  expect(pageErrors).toEqual([])
})

test('칸 바탕은 레이아웃 색이다 — 같은 레이아웃 규칙을 쓰는 글자끼리 같은 색', async ({ page }) => {
  await page.route('**/api/noto-corpus**', (route) => route.abort())
  await page.goto('/workspace/review')
  await expect(page.getByTestId('corpus-context-legend')).toBeVisible({ timeout: 20_000 })
  const expected: Record<string, string> = { 가: 'right', 각: 'right-final', 고: 'bottom', 곡: 'bottom-final', 과: 'mixed', 곽: 'mixed-final' }
  for (const [char, context] of Object.entries(expected)) await expect(cell(page, char)).toHaveAttribute('data-context', context)
  const background = (char: string) => cell(page, char).evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(await background('각')).toBe(await background('긴'))
  expect(await background('각')).not.toBe(await background('가'))
  expect(await background('각')).not.toBe(await background('곡'))
})
