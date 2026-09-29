import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

/** 게이트가 꺼진 개발 서버는 게시 공지를 localStorage 한 키에서 읽는다(`announcementApi.ts`). */
const LOCAL_KEY = 'font-maker-local-announcements-v1'

function announcement(id: string, place: string, publishedAt: string, titles: string[]) {
  return {
    id, title: id, place, status: 'published', publishedAt, createdAt: publishedAt, updatedAt: publishedAt,
    slides: titles.map((title) => ({ image: '', title, body: `${title} 본문` })),
  }
}

async function seed(page: Page, list: unknown[], guide = false) {
  await page.goto('/dashboard')
  await page.evaluate(([key, value, withGuide]) => {
    localStorage.setItem(key as string, value as string)
    localStorage.setItem('hfm-beta-guide', withGuide ? 'pending' : 'seen')
  }, [LOCAL_KEY, JSON.stringify(list), guide])
  await page.reload()
}

test('대시보드 공지 — 두 장을 넘기고 확인하면 다음 공지, 다 닫으면 다시 안 뜬다', async ({ page }) => {
  await seed(page, [
    announcement('second', 'dashboard', '2026-09-29T12:00:00Z', ['두 번째 공지']),
    announcement('first', 'dashboard', '2026-09-29T10:00:00Z', ['붓 크기', '트랙패드']),
    announcement('elsewhere', 'review', '2026-09-29T09:00:00Z', ['검수 공지']),
  ])
  const sheet = page.getByTestId('announcement')
  await expect(sheet.getByRole('heading')).toHaveText('붓 크기')
  await page.getByTestId('announcement-next').click()
  await expect(sheet.getByRole('heading')).toHaveText('트랙패드')
  await page.getByTestId('announcement-next').click()
  await expect(sheet.getByRole('heading')).toHaveText('두 번째 공지')
  await page.getByTestId('announcement-skip').click()
  await expect(sheet).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('dashboard-font-switcher')).toBeVisible()
  await expect(sheet).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('announcement-read:')).sort()))
    .toEqual(['announcement-read:first', 'announcement-read:second'])
})

test('둘러보기가 먼저 뜨고, 닫은 뒤에 공지', async ({ page }) => {
  await seed(page, [announcement('after-guide', 'dashboard', '2026-09-29T10:00:00Z', ['새 기능'])], true)
  await expect(page.getByTestId('beta-guide')).toBeVisible()
  await expect(page.getByTestId('announcement')).toHaveCount(0)
  await page.getByTestId('beta-guide-skip').click()
  await expect(page.getByTestId('announcement').getByRole('heading')).toHaveText('새 기능')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('announcement')).toHaveCount(0)
})

test('관리자 공지 — 새 공지 장 카드를 쓰면 미리보기가 따라간다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/admin/announcements')
  await page.getByTestId('announcement-new').click()
  await page.getByTestId('announcement-title').fill('붓 트랙패드')
  const card = page.getByTestId('announcement-slide-0')
  await card.getByLabel('제목').fill('붓 크기를 손끝으로')
  await card.getByLabel(/본문/).fill('트랙패드에서\n두 손가락으로 벌려요.')
  const preview = page.getByTestId('announcement-preview')
  await expect(preview.getByRole('heading')).toHaveText('붓 크기를 손끝으로')
  await expect(preview.getByText('두 손가락으로 벌려요.')).toBeVisible()
  await page.getByRole('button', { name: '장 추가' }).click()
  await page.getByTestId('announcement-slide-1').getByLabel('제목').fill('둘째 장')
  await preview.getByTestId('announcement-preview-next').click()
  await expect(preview.getByRole('heading')).toHaveText('둘째 장')
  await expect(page.getByTestId('announcement-save')).toBeEnabled()
})
