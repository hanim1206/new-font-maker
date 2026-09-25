import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/** 오류 화면 · 탭 잠금(플랜 `2026-09-25_작업-안-잃게`). 개발 서버의 강제 오류(`?crash=`)를 쓴다. */

const EDITOR = '/workspace/jamo'
const editorReady = (page: import('@playwright/test').Page) => expect(page.getByRole('region', { name: /레이아웃 수정/ })).toBeVisible({ timeout: 20_000 })

test('그리다 던지면 흰 화면 대신 오류 화면: 백업 받기 · 자세히 · 다시 불러오기', async ({ page }) => {
  await page.goto(`${EDITOR}?crash=render`)
  const screen = page.getByTestId('app-error-screen')
  await expect(screen).toBeVisible({ timeout: 20_000 })
  await expect(screen.getByRole('heading', { name: '문제가 생겼어요' })).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('app-error-backup').click()])
  expect(download.suggestedFilename()).toMatch(/^.+_\d{4}-\d{2}-\d{2}\.json$/)
  const backup = JSON.parse(readFileSync((await download.path())!, 'utf8'))
  // 스토어가 살아 있으면 저장 형식 그대로(원문 백업이 아니다).
  expect(backup).toMatchObject({ version: '1.5.0', preset: 'basic-gothic' })
  expect(backup.kind).toBeUndefined()
  await expect(screen.getByText('백업 파일을 받았어요.')).toBeVisible()

  await screen.getByText('자세히').click()
  await expect(page.getByTestId('app-error-details')).toContainText('개발용 강제 오류(render)')
  await page.screenshot({ path: 'test-results/app-safety-error-screen.png' })

  await page.getByTestId('app-error-reload').click()
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`))
  await editorReady(page)
})

test('이벤트 속 예외는 화면을 바꾸지 않는다(기록만)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${EDITOR}?crash=event`)
  await editorReady(page)
  await expect.poll(() => errors.some((message) => message.includes('개발용 강제 오류(event)'))).toBe(true)
  await expect(page.getByTestId('app-error-screen')).toHaveCount(0)
  await expect(page.getByTestId('app-notice')).toHaveCount(0)
})

test('같은 폰트는 한 탭에서만: 둘째 탭은 안내, `여기서 열기`면 가져오고 첫 탭은 멈춘다', async ({ page, context }) => {
  await page.goto(EDITOR)
  await editorReady(page)

  const second = await context.newPage()
  await second.goto(EDITOR)
  const locked = second.getByTestId('edit-locked')
  await expect(locked).toBeVisible({ timeout: 20_000 })
  await expect(locked.getByRole('heading', { name: '다른 탭에서 편집 중이에요' })).toBeVisible()
  await second.screenshot({ path: 'test-results/app-safety-edit-locked.png' })

  await second.getByTestId('edit-locked-take').click()
  await editorReady(second)
  const lost = page.getByTestId('edit-locked')
  await expect(lost).toBeVisible()
  await expect(lost.getByRole('heading', { name: '다른 탭에서 이 폰트를 열었어요' })).toBeVisible()
  await page.screenshot({ path: 'test-results/app-safety-edit-lost.png' })

  // 되가져오기도 된다.
  await page.getByTestId('edit-locked-take').click()
  await editorReady(page)
  await expect(second.getByTestId('edit-locked')).toBeVisible()

  // 앞 탭을 닫으면 잠금이 풀려 새 탭이 바로 열린다.
  await page.close()
  const third = await context.newPage()
  await third.goto(EDITOR)
  await editorReady(third)
})
