import { expect, test } from '@playwright/test'

test.describe('대표 받침 실측 배치의 역할 충돌', () => {
  for (const { character, blocked, independent } of [
    { character: '팍', blocked: ['initial', 'final'], independent: 'medial' },
    { character: '똫', blocked: ['medial', 'final'], independent: null },
  ]) {
    test(`${character}: 충돌 응답에서는 원본을 남기고 긍정 검수만 차단한다`, async ({ page }) => {
      await page.route('**/api/noto-corpus/glyph/*', async (route) => {
        const response = await route.fetch()
        const detail = await response.json()
        if (detail.identity?.character === character) {
          const sharedId = character === '팍'
            ? detail.stages.initial.observation.componentGroup.value.contourIds[0]
            : detail.stages.medial.observation.elements[0].face.evidence.contourId
          detail.stages.final.observation.componentGroup.value.contourIds.push(sharedId)
        }
        await route.fulfill({ response, json: detail })
      })
      await page.goto('/noto-corpus-lab')
      const reviewsBefore = await page.evaluate(() => localStorage.getItem('noto-corpus-local-reviews-v1'))
      await page.getByPlaceholder('예: 가고과너').fill(character)
      await page.getByText(character, { exact: true }).first().click()
      await expect(page.getByRole('img', { name: `${character} 실제 Noto 윤곽과 추출 기준선`, exact: true })).toBeVisible()
      for (const stage of blocked) {
        const part = page.getByTestId(`corpus-review-${stage}`)
        await expect(part.getByText('역할 충돌 · 승인 차단', { exact: true })).toBeVisible()
        await expect(part.getByRole('button', { name: '기준선 맞음', exact: true })).toBeDisabled()
        await expect(part.getByRole('button', { name: '문제 있음', exact: true })).toBeEnabled()
      }
      if (independent) {
        await expect(page.getByTestId(`corpus-review-${independent}`).getByRole('button', { name: '기준선 맞음', exact: true })).toBeEnabled()
      }
      expect(await page.evaluate(() => localStorage.getItem('noto-corpus-local-reviews-v1'))).toBe(reviewsBefore)
    })
  }

  test('수정된 실제 팍·똫의 후보는 충돌 없이 검수할 수 있다', async ({ page }) => {
    await page.goto('/noto-corpus-lab')
    for (const character of ['팍', '똫']) {
      await page.getByPlaceholder('예: 가고과너').fill(character)
      await page.getByText(character, { exact: true }).first().click()
      await expect(page.getByRole('img', { name: `${character} 실제 Noto 윤곽과 추출 기준선`, exact: true })).toBeVisible()
      await expect(page.getByText('역할 충돌 · 승인 차단', { exact: true })).toHaveCount(0)
      for (const stage of ['medial', 'final']) {
        await expect(page.getByTestId(`corpus-review-${stage}`).getByRole('button', { name: '기준선 맞음', exact: true })).toBeEnabled()
      }
    }
  })
})
