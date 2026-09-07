import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __s0StorageProbe?: {
      before: string
      calls: Array<{ op: string; key?: string }>
    }
  }
}

async function installStorageProbe(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('five-guide-s0-sentinel', 'unchanged')
    const before = JSON.stringify(Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
        .sort().map((key) => [key, localStorage.getItem(key)]),
    ))
    const calls: Array<{ op: string; key?: string }> = []
    const setItem = Storage.prototype.setItem
    const removeItem = Storage.prototype.removeItem
    const clear = Storage.prototype.clear
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage) calls.push({ op: 'setItem', key })
      return setItem.call(this, key, value)
    }
    Storage.prototype.removeItem = function (key: string) {
      if (this === window.localStorage) calls.push({ op: 'removeItem', key })
      return removeItem.call(this, key)
    }
    Storage.prototype.clear = function () {
      if (this === window.localStorage) calls.push({ op: 'clear' })
      return clear.call(this)
    }
    window.__s0StorageProbe = { before, calls }
  })
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => JSON.stringify(Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
      .sort().map((key) => [key, localStorage.getItem(key)]),
  )))
}

test('S0a contact sheet는 레거시 X를 기술 기준으로만 재현하고 저장하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installStorageProbe(page)
  await page.goto('/five-guide-lab')

  await expect(page.getByRole('heading', { name: '기존 X 계산을 재현한 기술 스냅샷입니다.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '실제 글자로 보는 가로 배치' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '최소 선·면 문법' })).toBeVisible()
  await expect(page.locator('[data-s0-layout]')).toHaveCount(7)
  await expect(page.locator('[data-s0-glyph-render]')).toHaveCount(14)
  await expect(page.locator('[data-s0-state="raw-x"]')).toHaveCount(7)
  await expect(page.locator('[data-s0-state="effective-x"]')).toHaveCount(7)
  await expect(page.locator('[data-s0-glyph-path]')).toHaveCount(14)
  expect(await page.locator('[data-s0-glyph-path]').evaluateAll((paths) => (
    paths.every((path) => (path.getAttribute('d') ?? '').trim().length > 0)
  ))).toBe(true)
  await expect(page.locator('[data-s0-glyph="ㄱ"]')).toBeVisible()
  await expect(page.locator('[data-s0-glyph="ㅁ"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: '‘현재 X’는 무료폰트 근거에서 나온 시각 기본값이 아니므로 여기서 승인하지 않습니다.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'S0b · 세로모음 간격 근거 보드 열기' })).toHaveAttribute(
    'href',
    '/references/vertical-vowel-gap.html',
  )

  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.__s0StorageProbe?.calls ?? null)).toEqual([])
  expect(await storageSnapshot(page)).toBe(await page.evaluate(() => window.__s0StorageProbe?.before))

  await page.reload()
  await expect(page.getByText('S0a · 승인 대상 아님')).toBeVisible()
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.__s0StorageProbe?.calls ?? null)).toEqual([])
  expect(await storageSnapshot(page)).toBe(await page.evaluate(() => window.__s0StorageProbe?.before))
})

test('390px에서도 S0 기준을 가로 스크롤 없이 확인한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installStorageProbe(page)
  await page.goto('/five-guide-lab')

  await expect(page.locator('[data-s0-layout]')).toHaveCount(7)
  await expect(page.locator('[data-s0-glyph-render]')).toHaveCount(14)
  await expect(page.locator('[data-s0-glyph-card]')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await page.evaluate(() => window.__s0StorageProbe?.calls ?? null)).toEqual([])
})
