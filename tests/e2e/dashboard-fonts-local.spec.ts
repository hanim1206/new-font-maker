import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * 게이트가 꺼진 개발 서버의 내 폰트 드로어(대시보드 머리 알약). 계정 대신 이 기기 목록(localStorage)으로 같은 규칙(한도 3 · 소프트 삭제)이다.
 * 편집 주소로 바로 들어오면 지금 사본이 첫 폰트가 되고, 드로어에서 새로 만들고 다른 폰트로 바꿔 연다(만든 순서 그대로).
 * 이름 바꾸기 · 복제 · 삭제는 카드 `…`. 옛 `/fonts`는 대시보드로.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
})

const switcher = (page: Page) => page.getByTestId('dashboard-font-switcher')
const rows = (page: Page) => page.getByTestId('dashboard-font-row')
const openSheet = async (page: Page) => {
  // 알약은 드로어를 여닫는다. 이미 열려 있으면 그대로.
  if (!(await page.getByTestId('dashboard-font-sheet').isVisible())) await switcher(page).click()
  await expect(page.getByTestId('dashboard-font-sheet')).toBeVisible()
}

test('편집 주소로 들어오면 첫 폰트가 생기고, 드로어에서 새로 만들고 다른 폰트로 바꿔 연다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
  // 자동으로 만들어진 첫 폰트의 이름이 머리에 뜬다.
  await expect(page.locator('header strong').first()).toHaveText('내 폰트')

  await page.getByTestId('workspace-font-home').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(switcher(page)).toHaveText('내 폰트')
  await openSheet(page)
  await expect(rows(page)).toHaveCount(1)

  // 새 폰트 → 대시보드를 다시 열고 알약이 `내 폰트체`(닉네임 + 체, 로컬 닉네임은 `내 폰트`). 드로어는 만든 순서 — 둘째 줄이 지금 폰트(✓).
  await page.getByTestId('dashboard-font-create').click()
  await expect(page.getByTestId('dashboard-font-sheet')).toHaveCount(0, { timeout: 20_000 })
  await expect(switcher(page)).toHaveText('내 폰트체', { timeout: 20_000 })
  await openSheet(page)
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(0)).toContainText('내 폰트')
  await expect(rows(page).nth(1)).toContainText('내 폰트체')
  await expect(rows(page).nth(1).getByLabel('지금 연 폰트')).toBeVisible()

  // 다른 줄을 누르면 그 폰트로 다시 연다. 순서는 그대로.
  await rows(page).nth(0).getByRole('button').click()
  await expect(switcher(page)).toHaveText('내 폰트', { timeout: 20_000 })
  await openSheet(page)
  await expect(rows(page).nth(0)).toContainText('내 폰트')
  await expect(rows(page).nth(0).getByLabel('지금 연 폰트')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dashboard-font-sheet')).toHaveCount(0)

  // 이름 바꾸기는 카드 `…`에서, 알약이 따라간다.
  await page.getByRole('button', { name: '더보기', exact: true }).click()
  await page.getByRole('menuitem', { name: '이름 바꾸기' }).click()
  await page.getByLabel('폰트 이름').fill('손글씨')
  await page.getByLabel('폰트 이름').press('Enter')
  await expect(switcher(page)).toHaveText('손글씨')
  await openSheet(page)
  await expect(rows(page).nth(0)).toContainText('손글씨')
})

test('옛 /fonts는 대시보드로, 한도 3에서 새 폰트가 꺼지고, 지금 폰트를 지우면 다른 폰트가 열린다', async ({ page }) => {
  // 새로 열기를 세 번 넘게 한다.
  test.setTimeout(90_000)
  await page.goto('/fonts')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(switcher(page)).toBeVisible({ timeout: 20_000 })
  for (let n = 0; n < 3; n += 1) {
    await openSheet(page)
    if (await page.getByTestId('dashboard-font-create').isDisabled()) break
    const before = await rows(page).count()
    await page.getByTestId('dashboard-font-create').click()
    // 대시보드를 새로 연다 — 옛 페이지의 드로어가 사라진 뒤에 다시 연다.
    await expect(page.getByTestId('dashboard-font-sheet')).toHaveCount(0, { timeout: 20_000 })
    await openSheet(page)
    await expect(rows(page)).toHaveCount(before + 1, { timeout: 20_000 })
    // 닫힐 때 거꾸로 올라가는 애니메이션이 끝나야 빠진다.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('dashboard-font-sheet')).toHaveCount(0)
  }
  await openSheet(page)
  await expect(rows(page)).toHaveCount(3)
  await expect(page.getByTestId('dashboard-font-create')).toBeDisabled()

  // 카드 `…`로 지금 폰트를 지우면 남은 것 중 최근 폰트가 열리고, 새 폰트가 다시 켜진다.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dashboard-font-sheet')).toHaveCount(0)
  const deleted = (await switcher(page).textContent()) ?? ''
  await page.getByRole('button', { name: '더보기', exact: true }).click()
  await page.getByTestId('dashboard-font-delete').click()
  await page.getByTestId('dashboard-font-delete-confirm').click()
  await expect(switcher(page)).not.toHaveText(deleted, { timeout: 20_000 })
  await openSheet(page)
  await expect(rows(page)).toHaveCount(2)
  await expect(page.getByTestId('dashboard-font-create')).toBeEnabled()
})

test('카드 `…` 복제는 지금 폰트를 `사본`으로 하나 더 만들고, 알림의 열기로 간다. 한도가 차면 흐려진다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await expect(page.getByTestId('jamo-layout-mode')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('workspace-font-home').click()
  await expect(switcher(page)).toHaveText('내 폰트')

  const more = page.getByRole('button', { name: '더보기', exact: true })
  const duplicate = page.getByTestId('dashboard-font-duplicate')
  await more.click()
  await duplicate.click()
  await expect(page.getByText('‘내 폰트 사본’을 만들었어요.')).toBeVisible()
  // 여기 머문다. 드로어에 사본이 둘째 줄로.
  await expect(switcher(page)).toHaveText('내 폰트')
  await openSheet(page)
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(1)).toContainText('내 폰트 사본')
  await page.keyboard.press('Escape')

  // 같은 이름이 있으면 번호가 붙는다. 알림의 `열기`로 사본에 간다.
  await more.click()
  await duplicate.click()
  await expect(page.getByText('‘내 폰트 사본 2’을 만들었어요.')).toBeVisible()
  await page.getByRole('button', { name: '열기', exact: true }).click()
  await expect(switcher(page)).toHaveText('내 폰트 사본 2', { timeout: 20_000 })

  // 셋이 찼으니 복제가 흐려진다.
  await more.click()
  await expect(duplicate).toBeDisabled()
  await expect(duplicate).toContainText('다 찼어요')
})
