import { devices, expect, test, type Page } from '@playwright/test'

const REFERENCE_URL = '/references/vertical-vowel-gap.html'
const MANIFEST_URL = '/references/vertical-vowel-gap.manifest.json'
const EXPECTED_GLYPHS = ['가', '거', '나', '너', '다', '더', '마', '머', '아', '어']
const EXPECTED_FONT_IDS = [
  'noto-sans-kr',
  'ibm-plex-sans-kr',
  'nanum-gothic',
  'dotum',
  'gowun-dodum',
  'black-han-sans',
]
const EXPECTED_GLANCE_ORDER = [
  ...EXPECTED_FONT_IDS.map((id) => `reference:${id}`),
  'candidate:current',
  'candidate:a',
  'candidate:b',
  'candidate:c',
]

declare global {
  interface Window {
    __s0bStorageProbe?: {
      before: string
      calls: Array<{ op: string; key?: string }>
    }
  }
}

async function installStorageProbe(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('vertical-vowel-gap-sentinel', 'unchanged')
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
    window.__s0bStorageProbe = { before, calls }
  })
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => JSON.stringify(Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
      .sort().map((key) => [key, localStorage.getItem(key)]),
  )))
}

async function expectNoStorageWrites(page: Page) {
  expect(await page.evaluate(() => window.__s0bStorageProbe?.calls ?? null)).toEqual([])
  expect(await storageSnapshot(page)).toBe(await page.evaluate(() => window.__s0bStorageProbe?.before))
}

async function expectEvidenceCorpus(page: Page) {
  const references = page.getByTestId('reference-cell')
  await expect(references).toHaveCount(60)
  await expect(page.getByTestId('reference-group')).toHaveCount(5)
  await expect(page.getByTestId('candidate-card')).toHaveCount(4)
  await expect(page.locator('svg[role="img"]')).toHaveCount(78)
  await expect(page.locator('svg[role="img"] title')).toHaveCount(78)
  await expect(page.locator('svg[data-coordinate-frame="shared-baseline"]')).toHaveCount(78)
  await expect(page.locator('svg [data-guide="em"]')).toHaveCount(78)
  await expect(page.locator('svg [data-guide="design-body"]')).toHaveCount(78)
  const baselines = page.locator('svg [data-guide="baseline"]')
  await expect(baselines).toHaveCount(78)
  expect(await baselines.evaluateAll((nodes) => nodes.every((node) => (
    node.getAttribute('y1') === '880' && node.getAttribute('y2') === '880'
  )))).toBe(true)

  const actualPairs = await references.evaluateAll((nodes) => nodes.map((node) => (
    `${node.getAttribute('data-font')}:${node.getAttribute('data-glyph')}`
  )).sort())
  const expectedPairs = EXPECTED_FONT_IDS.flatMap((fontId) => (
    EXPECTED_GLYPHS.map((glyph) => `${fontId}:${glyph}`)
  )).sort()
  expect(actualPairs).toEqual(expectedPairs)

  expect(await references.locator('svg path').evaluateAll((paths) => (
    paths.length === 60 && paths.every((path) => (path.getAttribute('d') ?? '').trim().length > 0)
  ))).toBe(true)
  expect(await page.getByTestId('candidate-card').locator('svg path').evaluateAll((paths) => (
    paths.length === 8 && paths.every((path) => (path.getAttribute('d') ?? '').trim().length > 0)
  ))).toBe(true)
}

async function expectGlanceStrip(page: Page) {
  const strip = page.getByTestId('glance-strip')
  await expect(strip).toBeVisible()
  const specimens = strip.getByTestId('glance-specimen')
  await expect(specimens).toHaveCount(10)
  expect(await specimens.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-specimen')))).toEqual(
    EXPECTED_GLANCE_ORDER,
  )
  expect(await specimens.evaluateAll((nodes) => nodes.every((node) => node.getAttribute('data-glyph') === '가'))).toBe(true)
  expect(await specimens.locator('svg').evaluateAll((nodes) => nodes.every((node) => (
    node.getAttribute('viewBox') === '-120 -120 1240 1240'
      && node.getAttribute('data-coordinate-frame') === 'shared-baseline'
  )))).toBe(true)
  expect(await specimens.locator('svg .gap-band').evaluateAll((nodes) => (
    nodes.length === 10 && nodes.every((node) => (
      node.getAttribute('y') === '75' && node.getAttribute('height') === '850'
    ))
  ))).toBe(true)
  expect(await strip.locator('[data-specimen^="reference:"] [data-font-projection]').evaluateAll((nodes) => (
    nodes.length === 6 && nodes.every((node) => / 0 880\)$/.test(node.getAttribute('transform') ?? ''))
  ))).toBe(true)
  expect(await specimens.locator('svg path').evaluateAll((paths) => (
    paths.length === 14 && paths.every((path) => (path.getAttribute('d') ?? '').trim().length > 0)
  ))).toBe(true)
  const cellWidths = await specimens.evaluateAll((nodes) => nodes.map((node) => (
    node.querySelector('svg')!.getBoundingClientRect().width
  )))
  expect(Math.max(...cellWidths) - Math.min(...cellWidths)).toBeLessThan(1.5)
  expect(await specimens.evaluateAll((nodes) => nodes.every((node) => {
    const frame = node.querySelector('svg')!.getBoundingClientRect()
    return Array.from(node.querySelectorAll('svg path')).every((path) => {
      const ink = path.getBoundingClientRect()
      return ink.left >= frame.left - 1
        && ink.right <= frame.right + 1
        && ink.top >= frame.top - 1
        && ink.bottom <= frame.bottom + 1
    })
  }))).toBe(true)

  for (const fontId of EXPECTED_FONT_IDS) {
    const glancePath = strip.locator(`[data-specimen="reference:${fontId}"] svg path`)
    const sourcePath = page.locator(`[data-testid="reference-cell"][data-font="${fontId}"][data-glyph="가"] svg path`)
    expect(await glancePath.getAttribute('d')).toBe(await sourcePath.getAttribute('d'))
  }
  for (const candidateId of ['current', 'a', 'b', 'c']) {
    const glancePaths = strip.locator(`[data-specimen="candidate:${candidateId}"] svg path.shape`)
    const sourcePaths = page.locator(`[data-testid="candidate-card"][data-candidate="${candidateId}"] svg path.shape`)
    expect(await glancePaths.evaluateAll((paths) => paths.map((path) => ({
      d: path.getAttribute('d'),
      strokeWidth: path.getAttribute('style'),
    })))).toEqual(await sourcePaths.evaluateAll((paths) => paths.map((path) => ({
      d: path.getAttribute('d'),
      strokeWidth: path.getAttribute('style'),
    }))))
  }
}

async function expectYCalibrationGate(page: Page) {
  const gate = page.getByTestId('y-calibration-gate')
  await expect(gate).toBeVisible()
  const specimens = gate.getByTestId('y-calibration-specimen')
  await expect(specimens).toHaveCount(4)
  expect(await specimens.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-y-variant')))).toEqual([
    'reference',
    'current',
    'body-fit',
    'noto-envelope',
  ])
  expect(await specimens.locator('svg').evaluateAll((nodes) => nodes.every((node) => (
    node.getAttribute('viewBox') === '-120 -120 1240 1240'
      && node.getAttribute('data-coordinate-frame') === 'shared-baseline'
  )))).toBe(true)
  const gapWidths = await specimens.locator('svg .gap-band').evaluateAll((nodes) => (
    nodes.map((node) => Number(node.getAttribute('width')))
  ))
  expect(gapWidths).toHaveLength(4)
  expect(Math.max(...gapWidths) - Math.min(...gapWidths)).toBeLessThan(0.001)
  const targetGuides = specimens.locator('[data-guide^="target-ink-"]')
  await expect(targetGuides).toHaveCount(8)
  await expect(gate.locator('[data-y-variant="noto-envelope"] .recommended')).toHaveText('비교 권장')
  expect(await gate.locator('svg[data-y-variant] path.shape').evaluateAll((paths) => (
    paths.length === 6
      && paths.every((path) => path.getAttribute('style') === 'stroke-width:75')
  ))).toBe(true)

  const notoTop = Number(await gate.locator('[data-y-variant="reference"] [data-guide="target-ink-top"]').getAttribute('y1'))
  const notoBottom = Number(await gate.locator('[data-y-variant="reference"] [data-guide="target-ink-bottom"]').getAttribute('y1'))
  const proposalTop = Number(await gate.locator('[data-y-variant="noto-envelope"] [data-guide="target-ink-top"]').getAttribute('y1'))
  const proposalBottom = Number(await gate.locator('[data-y-variant="noto-envelope"] [data-guide="target-ink-bottom"]').getAttribute('y1'))
  expect(proposalTop).toBeCloseTo(notoTop, 5)
  expect(proposalBottom).toBeCloseTo(notoBottom, 5)
}

test.describe('S0b evidence desktop', () => {
  test.use({
    userAgent: devices['Desktop Chrome'].userAgent,
    viewport: { width: 1280, height: 900 },
    screen: { width: 1280, height: 900 },
    deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor,
    isMobile: devices['Desktop Chrome'].isMobile,
    hasTouch: devices['Desktop Chrome'].hasTouch,
  })

  test('판정 범위, 60개 reference, 4개 후보와 무저장 계약을 제공한다', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await installStorageProbe(page)
    const response = await page.goto(REFERENCE_URL)

    expect(response?.status()).toBe(200)
    expect(response?.headers()['content-type']).toContain('text/html')
    await expect(page.locator('main#s0b-evidence-board')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'X 간격보다 먼저 글자 높이를 맞춥니다.' })).toBeVisible()
    await expect(page.getByTestId('s0b-status')).toContainText('제품 반영 0%')
    await expect(page.getByTestId('s0b-status')).toContainText('X 간격 판정 보류')
    await expect(page.getByTestId('s0b-status')).toContainText('Y 후보 3안 · Noto 원본 1 · 저장 0')
    await expect(page.getByTestId('decision-scope').getByRole('heading', { name: '이번에 결정할 것' })).toBeVisible()
    await expect(page.getByTestId('decision-scope').getByRole('heading', { name: '이번에 판단하지 않는 것' })).toBeVisible()
    await expect(page.getByText('크기·위치와 내부 5선을 분리합니다.')).toBeVisible()
    await expect(page.getByText('공통 조건:', { exact: true })).toBeVisible()
    await expect(page.getByTestId('coordinate-frame-contract')).toContainText('baseline y=880')
    await expect(page.getByTestId('coordinate-frame-contract')).toContainText('우리 Y만 명시적 표시 보정')
    await expectYCalibrationGate(page)
    await expectGlanceStrip(page)
    await expectEvidenceCorpus(page)
    await expect(page.getByTestId('measurement-summary')).toBeVisible()
    await expect(page.getByTestId('decision-trace')).toContainText('Y 표시 조건 승인 전에는 B를 고르지 않습니다.')

    const verdict = page.getByTestId('verdict-question')
    await expect(verdict).toHaveCount(1)
    await expect(verdict.getByRole('heading')).toHaveText(
      '다음 X 간격 비교에서 Noto Sans KR 400 `가`의 잉크 상·하단에 맞춘 Y 표시안을 사용할까요?',
    )
    await expect(verdict.getByLabel('B 동결', { exact: true })).toHaveCount(0)
    await verdict.getByLabel('Noto envelope로 진행', { exact: true }).check()
    await expect(page.locator('#selection-note')).toHaveText(
      '현재 선택: Noto envelope로 진행 · 아직 저장하거나 제품에 반영하지 않았습니다.',
    )
    await expectNoStorageWrites(page)

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const pageOrigin = new URL(response!.url()).origin
    expect(requests.every((url) => new URL(url).origin === pageOrigin)).toBe(true)

    const manifestResponse = await page.request.get(MANIFEST_URL)
    expect(manifestResponse.status()).toBe(200)
    expect(manifestResponse.headers()['content-type']).toContain('application/json')
    expect(await manifestResponse.json()).toMatchObject({
      schema: 'vertical-vowel-gap-evidence-v1',
      status: 'candidate',
      approved: false,
      productionValueApplied: false,
      decision: { mode: 'comparison-only-y-calibration', xGapVerdict: 'suspended' },
      comparisonYCalibration: { productionApplied: false, recommendedVariantId: 'noto-envelope' },
      corpus: { referenceSampleCount: 60, candidateCount: 4 },
    })

    await page.reload()
    await expect(page.getByTestId('s0b-status')).toBeVisible()
    expect(await verdict.getByRole('radio').evaluateAll((radios) => (
      radios.every((radio) => !(radio as HTMLInputElement).checked)
    ))).toBe(true)
    await expect(page.locator('#selection-note')).toBeEmpty()
    await expectNoStorageWrites(page)
  })
})

test.describe('S0b evidence mobile', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
    isMobile: devices['iPhone 13'].isMobile,
    hasTouch: devices['iPhone 13'].hasTouch,
  })

  test('390px에서 판정 질문과 전체 evidence를 가로 overflow 없이 읽는다', async ({ page }) => {
    await installStorageProbe(page)
    await page.goto(REFERENCE_URL)

    await expect(page.getByTestId('decision-scope')).toBeVisible()
    await expectYCalibrationGate(page)
    await expectGlanceStrip(page)
    await expectEvidenceCorpus(page)
    const groups = page.getByTestId('reference-group')
    await expect(groups.nth(0)).toHaveAttribute('open', '')
    for (let index = 1; index < 5; index += 1) await expect(groups.nth(index)).not.toHaveAttribute('open', '')

    const candidateColumns = await page.locator('.candidate-grid').evaluate((element) => (
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/)
    ))
    expect(candidateColumns).toHaveLength(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.getByTestId('verdict-question').getByLabel('Y 구조 다시 설계', { exact: true }).check()
    await expect(page.locator('#selection-note')).toContainText('현재 선택: Y 구조 다시 설계')
    await expectNoStorageWrites(page)
  })
})
