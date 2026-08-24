import { expect, test, type Page } from '@playwright/test'

const SHAPE_KEY = 'font-maker-shape-system-v1'
const LAYOUT_KEY = 'font-maker-layout-schemas'
const JAMO_KEY = 'font-maker-jamo-data'

async function expectMobileShellContract(page: Page): Promise<void> {
  const viewportContract = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(viewportContract.horizontal).toBeLessThanOrEqual(0)
  expect(viewportContract.vertical).toBeLessThanOrEqual(0)
  const tooSmallTargets = await page.locator('button:visible, a:visible').evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return { label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: rect.width, height: rect.height }
    })
    .filter(({ width, height }) => width < 44 || height < 44))
  expect(tooSmallTargets).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const resetMarker = 'shape-workspace-e2e-storage-reset'
    if (sessionStorage.getItem(resetMarker) === null) {
      localStorage.clear()
      sessionStorage.setItem(resetMarker, 'done')
    }
  })
})

test('J-02 자소 원형 Rail은 네 방향을 직접 편집하고 한 transaction으로 저장·Undo한다', async ({ page }) => {
  await page.goto('/workspace/jamo/result?char=ㄱ')
  await page.getByRole('button', { name: '추천 기본 구조로 시작' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  await page.goto('/workspace/jamo')

  await expect(page.getByRole('heading', { name: '초성 ㄱ 원형', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '초성 ㄱ 원형 편집 캔버스' })).toBeVisible()
  await expect(page.getByRole('slider', { name: /캔버스 안쪽 .* 기준선/ })).toHaveCount(4)
  await expect(page.getByRole('list', { name: 'ㄱ이 쓰인 7개 조합 비교' }).getByRole('listitem')).toHaveCount(7)
  await expect(page.getByText('ㄱ · 단독')).toBeVisible()

  const initializedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  await page.waitForTimeout(350)
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem
    ;(window as unknown as { __shapeWrites: number }).__shapeWrites = 0
    Storage.prototype.setItem = function setItem(key: string, value: string): void {
      if (key === 'font-maker-shape-system-v1') (window as unknown as { __shapeWrites: number }).__shapeWrites += 1
      originalSetItem.call(this, key, value)
    }
  })

  const canvasRail = page.getByRole('slider', { name: '캔버스 안쪽 오른쪽 기준선' })
  const precisionSlider = page.getByRole('slider', { name: '안쪽 오른쪽 기준선', exact: true })
  const handleBox = await canvasRail.boundingBox()
  if (!handleBox) throw new Error('J-02 Rail 위치를 찾을 수 없습니다.')
  const comparisonPaths = page.getByRole('list', { name: 'ㄱ이 쓰인 7개 조합 비교' }).locator('path[data-final-ink]')
  const beforePaths = await comparisonPaths.evaluateAll((paths) => paths.map((path) => path.getAttribute('d')))
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 - 32, handleBox.y + handleBox.height / 2, { steps: 4 })
  await expect(page.getByLabel('편집할 기준선').getByRole('button', { name: '오른쪽', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(precisionSlider).not.toHaveValue('0.8')
  expect(await comparisonPaths.evaluateAll((paths) => paths.map((path) => path.getAttribute('d')))).not.toEqual(beforePaths)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await page.mouse.up()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  await page.waitForTimeout(350)
  const committedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(committedRaw).not.toBe(initializedRaw)
  expect(await page.evaluate(() => (window as unknown as { __shapeWrites: number }).__shapeWrites)).toBe(1)
  const changedRails = await page.evaluate((key) => {
    const source = JSON.parse(localStorage.getItem(key)!).state.source
    return ['STANDALONE', 'CH'].map((role) => source.roleSources[role].grid.xRails.find((rail: { coreRole?: string }) => rail.coreRole === 'inner-right').position.value)
  }, SHAPE_KEY)
  expect(changedRails[0]).toBe(changedRails[1])

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)

  const cancelRail = page.getByRole('slider', { name: '캔버스 안쪽 아래 기준선' })
  const cancelBox = await cancelRail.boundingBox()
  if (!cancelBox) throw new Error('J-02 취소 Rail 위치를 찾을 수 없습니다.')
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2 - 28, { steps: 3 })
  await cancelRail.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true })
  await page.mouse.up()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)

  const lostRail = page.getByRole('slider', { name: '캔버스 안쪽 위 기준선' })
  const lostBox = await lostRail.boundingBox()
  if (!lostBox) throw new Error('J-02 lost capture Rail 위치를 찾을 수 없습니다.')
  await page.mouse.move(lostBox.x + lostBox.width / 2, lostBox.y + lostBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(lostBox.x + lostBox.width / 2, lostBox.y + lostBox.height / 2 + 28, { steps: 3 })
  await lostRail.dispatchEvent('lostpointercapture', { pointerId: 1, pointerType: 'mouse', isPrimary: true })
  await page.mouse.up()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(0)

  const comparisonOverflow = await page.getByRole('list', { name: 'ㄱ이 쓰인 7개 조합 비교' }).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }))
  expect(comparisonOverflow.scrollWidth).toBeGreaterThan(comparisonOverflow.clientWidth)
  expect(comparisonOverflow.overflowX).toBe('auto')

  await expectMobileShellContract(page)
})

test('L-01 공통 layout Rail은 7개 binding 결과를 draft로 미리 보고 한 번 저장·Undo한다', async ({ page }) => {
  await page.goto('/workspace/skeleton')
  await expect(page.getByRole('heading', { name: '공통 layout grid', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '추천 기본 구조로 시작' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '기존 7개 배치를 공통 기준선으로 연결' }).click()
  await expect(page.getByRole('region', { name: '공통 layout Rail 편집 캔버스' })).toBeVisible()
  await expect(page.getByRole('list', { name: '공통 배치가 쓰이는 7개 조합' }).getByRole('listitem')).toHaveCount(7)

  const connectedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  const splitRailId = await page.evaluate((key) => {
    const source = JSON.parse(localStorage.getItem(key)!).state.source
    return source.layoutGridSystem.bindings['choseong-jungseong-vertical'].splitRailIds['choseong-jungseong-vertical:x:ch-ju']
  }, SHAPE_KEY)
  const rail = page.locator(`[data-rail-id="${splitRailId}"]`)
  const railBox = await rail.boundingBox()
  if (!railBox) throw new Error('공통 layout split Rail 위치를 찾을 수 없습니다.')
  const preview = page.getByRole('list', { name: '공통 배치가 쓰이는 7개 조합' }).getByRole('button', { name: '가 세로모음 관찰' }).locator('svg')
  const beforePreview = await preview.evaluate((element) => element.outerHTML)
  const beforeValue = await rail.getAttribute('aria-valuenow')

  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(railBox.x + railBox.width / 2 + 18, railBox.y + railBox.height / 2, { steps: 3 })
  await expect(rail).not.toHaveAttribute('aria-valuenow', beforeValue ?? '')
  expect(await preview.evaluate((element) => element.outerHTML)).not.toBe(beforePreview)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(connectedRaw)
  await page.mouse.up()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  await page.waitForTimeout(350)
  const movedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(movedRaw).not.toBe(connectedRaw)

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  await page.waitForTimeout(350)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(connectedRaw)
  await expectMobileShellContract(page)
})

test('비교 카드 선택과 드로어 열기는 저장 데이터에 영향을 주지 않는다', async ({ page }) => {
  await page.goto('/workspace/jamo')
  await page.waitForTimeout(450)

  const before = await page.evaluate(([shapeKey, layoutKey, jamoKey]) => ({
    shape: localStorage.getItem(shapeKey),
    layout: localStorage.getItem(layoutKey),
    jamo: localStorage.getItem(jamoKey),
  }), [SHAPE_KEY, LAYOUT_KEY, JAMO_KEY])

  await page.getByRole('button', { name: '고 가로모음 관찰' }).click()
  await expect(page.getByText('고 · 가로모음')).toBeVisible()
  await expect(page.getByText('이 자소의 원형')).toBeVisible()

  await page.getByRole('button', { name: 'ㄱ 원형 선택' }).click()
  await expect(page.getByRole('button', { name: '정밀 조절' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('캔버스에서 대상을 먼저 선택하세요')).toBeVisible()

  const after = await page.evaluate(([shapeKey, layoutKey, jamoKey]) => ({
    shape: localStorage.getItem(shapeKey),
    layout: localStorage.getItem(layoutKey),
    jamo: localStorage.getItem(jamoKey),
  }), [SHAPE_KEY, LAYOUT_KEY, JAMO_KEY])
  expect(after).toEqual(before)

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(0)
})

test('J-01에서 J-02와 J-03으로 이동하고 잘못된 workspace 경로를 숨기지 않는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: '자소 원형 새 화면 검토' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await page.getByRole('link', { name: '자소 원형 새 화면 검토' }).click()
  await expect(page.getByText('J-02 · 자소 원형')).toBeVisible()
  await page.getByRole('navigation', { name: '프로젝트 주 내비게이션' }).getByRole('link', { name: '자소' }).click()
  await expect(page.getByRole('heading', { name: '자소 현황', exact: true })).toBeVisible()
  await expect(page.getByText('기존 렌더링 미리보기이며 Shape 마스터 상태를 뜻하지 않아요.')).toBeVisible()
  await expectMobileShellContract(page)

  await page.getByRole('link', { name: '화면 보기' }).click()
  await expect(page).toHaveURL(/\/workspace\/jamo$/)
  await expect(page.getByText('J-02 · 자소 원형')).toBeVisible()

  await page.getByRole('button', { name: '고 가로모음 관찰' }).click()
  await page.getByRole('link', { name: '조합별 결과 확인' }).click()
  await expect(page).toHaveURL(/\/workspace\/jamo\/result\?char=%EA%B3%A0$/)
  await expect(page.getByRole('heading', { name: '초성 ㄱ · 조합별 결과' })).toBeVisible()
  await expect(page.getByText('비교만', { exact: true })).toBeVisible()
  await expectMobileShellContract(page)

  await page.goBack()
  await expect(page.getByText('J-02 · 자소 원형')).toBeVisible()
  await page.goForward()
  await expect(page.getByText('J-03 · 조합별 결과')).toBeVisible()

  await page.goto('/workspace/not-a-screen')
  await expect(page.getByRole('heading', { name: '작업 화면을 찾을 수 없어요' })).toBeVisible()
  await expect(page.getByText('잘못된 주소를 문장 보정 화면으로 숨기지 않았습니다.')).toBeVisible()
})

test('J-03의 모든 관찰 동작은 저장과 variant를 만들지 않는다', async ({ page }) => {
  await page.goto('/workspace/jamo/result?char=가')
  await page.waitForTimeout(450)
  const before = await page.evaluate(() => JSON.stringify({ ...localStorage }))

  for (const { name } of [
    { name: 'ㄱ 단독 관찰' },
    { name: '가 세로모음 관찰' },
    { name: '고 가로모음 관찰' },
    { name: '과 혼합모음 관찰' },
    { name: '각 세로+받침 관찰' },
    { name: '곡 가로+받침 관찰' },
    { name: '곽 혼합+받침 관찰' },
  ]) await page.getByRole('button', { name }).click()

  await expect(page.getByRole('region', { name: '곽 혼합+받침 결과 미리보기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '추천 기본 구조로 시작' })).toBeVisible()
  await page.getByRole('button', { name: '정밀 조절' }).click()
  await expect(page.getByText('비교 모드에서는 값을 바꾸지 않아요')).toBeVisible()
  const drawerBox = await page.getByRole('region', { name: '정밀 조절' }).boundingBox()
  const navBox = await page.getByRole('navigation', { name: '프로젝트 주 내비게이션' }).boundingBox()
  expect(drawerBox).not.toBeNull()
  expect(navBox).not.toBeNull()
  expect((drawerBox?.y ?? 0) + (drawerBox?.height ?? 0)).toBeLessThanOrEqual((navBox?.y ?? 0) + 1)
  await page.waitForTimeout(500)

  const after = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(after).toBe(before)
  await expectMobileShellContract(page)
})

test('추천 구조에서 문맥 Rail을 pointerup 한 번으로 저장하고 cancel·Undo·Redo·reload를 지킨다', async ({ page }) => {
  await page.goto('/workspace/jamo/result?char=ㄱ')
  await page.getByRole('button', { name: '추천 기본 구조로 시작' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  const initializedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(initializedRaw).not.toBeNull()

  await page.getByRole('button', { name: '이 조합만 보정' }).click()
  const slider = page.getByRole('slider', { name: '안쪽 왼쪽 기준선', exact: true })
  await expect(slider).toBeVisible()
  await expect(slider).toHaveValue('0.2')
  const sliderBox = await slider.boundingBox()
  if (!sliderBox) throw new Error('Rail slider 위치를 찾을 수 없습니다.')

  await page.mouse.move(sliderBox.x + sliderBox.width * 0.38, sliderBox.y + sliderBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sliderBox.x + sliderBox.width * 0.72, sliderBox.y + sliderBox.height / 2, { steps: 4 })
  await slider.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true })
  await page.mouse.up()
  await page.waitForTimeout(400)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeDisabled()
  await expect(slider).toHaveValue('0.2')

  const canvasRail = page.getByRole('slider', { name: '캔버스 안쪽 왼쪽 기준선' })
  const canvasRailBox = await canvasRail.boundingBox()
  if (!canvasRailBox) throw new Error('캔버스 Rail 위치를 찾을 수 없습니다.')
  const resultRegion = page.getByRole('region', { name: 'ㄱ 단독 결과 미리보기' })
  const finalPath = resultRegion.locator('path[data-final-ink]')
  const beforeDraftPath = await finalPath.getAttribute('d')
  await page.mouse.move(canvasRailBox.x + canvasRailBox.width / 2, canvasRailBox.y + canvasRailBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvasRailBox.x + canvasRailBox.width * 2.2, canvasRailBox.y + canvasRailBox.height / 2, { steps: 4 })
  await expect(slider).not.toHaveValue('0.2')
  expect(await finalPath.getAttribute('d')).not.toBe(beforeDraftPath)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await canvasRail.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true })
  await page.mouse.up()
  await expect(slider).toHaveValue('0.2')
  expect(await finalPath.getAttribute('d')).toBe(beforeDraftPath)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)

  const resetCanvasRailBox = await canvasRail.boundingBox()
  if (!resetCanvasRailBox) throw new Error('롤백한 캔버스 Rail 위치를 찾을 수 없습니다.')
  await page.mouse.move(resetCanvasRailBox.x + resetCanvasRailBox.width / 2, resetCanvasRailBox.y + resetCanvasRailBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(resetCanvasRailBox.x + resetCanvasRailBox.width * 2.2, resetCanvasRailBox.y + resetCanvasRailBox.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  await page.waitForTimeout(350)
  const committedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(committedRaw).not.toBe(initializedRaw)
  const committedOverride = await page.evaluate((key) => {
    const source = JSON.parse(localStorage.getItem(key)!).state.source
    return source.roleSources.STANDALONE.masters[0].contextVariants[0].coreRailOverrides['inner-left']
  }, SHAPE_KEY)
  expect(committedOverride).toEqual(expect.objectContaining({ kind: 'absolute' }))
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeEnabled()

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await expect(page.getByRole('button', { name: '형태 편집 다시 실행' })).toBeEnabled()

  await page.getByRole('button', { name: '형태 편집 다시 실행' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(committedRaw)

  const committedValue = String(committedOverride.value)
  await page.reload()
  await page.getByRole('button', { name: '이 조합만 보정' }).click()
  await expect(page.getByRole('slider', { name: '안쪽 왼쪽 기준선', exact: true })).toHaveValue(committedValue)
  await expectMobileShellContract(page)
})

test('네 방향 기준선을 선택하고 세로 Rail도 캔버스에서 한 transaction으로 보정한다', async ({ page }) => {
  await page.goto('/workspace/jamo/result?char=ㄱ')
  await page.getByRole('button', { name: '추천 기본 구조로 시작' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  const initializedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  await page.getByRole('button', { name: '이 조합만 보정' }).click()

  const railChoices = page.getByLabel('편집할 기준선')
  await expect(railChoices.getByRole('button')).toHaveCount(4)
  await railChoices.getByRole('button', { name: '위', exact: true }).click()
  const precisionSlider = page.getByRole('slider', { name: '안쪽 위 기준선', exact: true })
  const canvasRail = page.getByRole('slider', { name: '캔버스 안쪽 위 기준선' })
  await expect(precisionSlider).toHaveValue('0.2')
  await expect(canvasRail).toHaveAttribute('data-axis', 'y')

  const handleBox = await canvasRail.boundingBox()
  if (!handleBox) throw new Error('세로 방향 캔버스 Rail 위치를 찾을 수 없습니다.')
  const finalPath = page.getByRole('region', { name: 'ㄱ 단독 결과 미리보기' }).locator('path[data-final-ink]')
  const pathBefore = await finalPath.getAttribute('d')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height * 2.2, { steps: 4 })
  await expect(precisionSlider).not.toHaveValue('0.2')
  expect(await finalPath.getAttribute('d')).not.toBe(pathBefore)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await page.mouse.up()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()

  const committedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(committedRaw).not.toBe(initializedRaw)
  const overrides = await page.evaluate((key) => {
    const source = JSON.parse(localStorage.getItem(key)!).state.source
    return source.roleSources.STANDALONE.masters[0].contextVariants[0].coreRailOverrides
  }, SHAPE_KEY)
  expect(overrides).toEqual({ 'inner-top': expect.objectContaining({ kind: 'absolute' }) })

  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await railChoices.getByRole('button', { name: '오른쪽', exact: true }).click()
  await expect(page.getByRole('slider', { name: '안쪽 오른쪽 기준선', exact: true })).toHaveValue('0.8')
  await expect(page.getByRole('slider', { name: '캔버스 안쪽 오른쪽 기준선' })).toHaveAttribute('data-axis', 'x')
  await expectMobileShellContract(page)
})

test('캔버스의 선택되지 않은 가로·세로 Rail도 한 번의 제스처로 선택·미리보기·저장한다', async ({ page }) => {
  await page.goto('/workspace/jamo/result?char=ㄱ')
  await page.getByRole('button', { name: '추천 기본 구조로 시작' }).click()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  const initializedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  await page.getByRole('button', { name: '이 조합만 보정' }).click()

  const resultRegion = page.getByRole('region', { name: 'ㄱ 단독 결과 미리보기' })
  const finalPath = resultRegion.locator('path[data-final-ink]')
  const directDrag = async (name: string, delta: { x: number; y: number }) => {
    const handle = page.getByRole('slider', { name })
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error(`${name} 위치를 찾을 수 없습니다.`)
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + delta.x,
      handleBox.y + handleBox.height / 2 + delta.y,
      { steps: 4 },
    )
    return handle
  }

  const horizontalPathBefore = await finalPath.getAttribute('d')
  await directDrag('캔버스 안쪽 오른쪽 기준선', { x: -34, y: 0 })
  await expect(page.getByLabel('편집할 기준선').getByRole('button', { name: '오른쪽', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const horizontalSlider = page.getByRole('slider', { name: '안쪽 오른쪽 기준선', exact: true })
  await expect(horizontalSlider).not.toHaveValue('0.8')
  expect(await finalPath.getAttribute('d')).not.toBe(horizontalPathBefore)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await page.mouse.up()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  const horizontalCommittedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(horizontalCommittedRaw).not.toBe(initializedRaw)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)

  const cancelPathBefore = await finalPath.getAttribute('d')
  const cancelHandle = await directDrag('캔버스 안쪽 아래 기준선', { x: 0, y: -34 })
  await expect(page.getByLabel('편집할 기준선').getByRole('button', { name: '아래', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await finalPath.getAttribute('d')).not.toBe(cancelPathBefore)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await cancelHandle.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true })
  await page.mouse.up()
  await expect(page.getByRole('slider', { name: '안쪽 아래 기준선', exact: true })).toHaveValue('0.8')
  expect(await finalPath.getAttribute('d')).toBe(cancelPathBefore)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)

  const verticalPathBefore = await finalPath.getAttribute('d')
  await directDrag('캔버스 안쪽 위 기준선', { x: 0, y: 34 })
  await expect(page.getByLabel('편집할 기준선').getByRole('button', { name: '위', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const verticalSlider = page.getByRole('slider', { name: '안쪽 위 기준선', exact: true })
  await expect(verticalSlider).not.toHaveValue('0.2')
  expect(await finalPath.getAttribute('d')).not.toBe(verticalPathBefore)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await page.mouse.up()
  await expect(page.getByText('이 기기에 저장했습니다.')).toBeVisible()
  const verticalCommittedRaw = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  expect(verticalCommittedRaw).not.toBe(initializedRaw)
  await page.getByRole('button', { name: '형태 편집 실행 취소' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(initializedRaw)
  await expectMobileShellContract(page)
})

test('연결된 strict 7-role source에서도 관찰은 Shape 저장을 다시 쓰지 않는다', async ({ page }) => {
  await page.addInitScript(({ shapeKey }) => {
    const roles = ['STANDALONE', 'CH', 'JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO']
    const xRoles = ['outer-left', 'inner-left', 'center-x', 'inner-right', 'outer-right']
    const yRoles = ['outer-top', 'inner-top', 'center-y', 'inner-bottom', 'outer-bottom']
    const roleSources = Object.fromEntries(roles.map((role) => [role, {
      schema: 'role-construction',
      version: 1,
      grid: {
        id: `part-grid:${role}`,
        role,
        xRails: xRoles.map((coreRole, index) => ({ id: `rail:${role}:x:${coreRole}`, kind: 'core', coreRole, position: { kind: 'absolute', value: index / 4 } })),
        yRails: yRoles.map((coreRole, index) => ({ id: `rail:${role}:y:${coreRole}`, kind: 'core', coreRole, position: { kind: 'absolute', value: index / 4 } })),
        snapStep: 0.025,
        minGap: 0.05,
      },
      masters: [],
    }]))
    const masterId = `jamo-role-master:${encodeURIComponent('ㄱ')}:CH`
    roleSources.CH.masters = [{
      id: masterId,
      jamoId: 'ㄱ',
      role: 'CH',
      construction: {
        channels: {
          main: {
            role: 'CH',
            gridId: 'part-grid:CH',
            elements: [{
              id: 'centerline:giyeok',
              kind: 'centerline',
              closed: false,
              thickness: 0.12,
              anchors: [
                {
                  id: 'anchor:start',
                  point: { id: 'point:start', xRailId: 'rail:CH:x:inner-left', yRailId: 'rail:CH:y:inner-top' },
                },
                {
                  id: 'anchor:corner',
                  point: { id: 'point:corner', xRailId: 'rail:CH:x:inner-right', yRailId: 'rail:CH:y:inner-top' },
                },
                {
                  id: 'anchor:end',
                  point: { id: 'point:end', xRailId: 'rail:CH:x:inner-right', yRailId: 'rail:CH:y:inner-bottom' },
                },
              ],
            }],
          },
        },
      },
    }]
    const source = {
      schema: 'shape-system',
      version: 2,
      roleSources,
      layoutGridSystem: null,
      contextPresetCatalog: null,
    }
    const seededRaw = JSON.stringify({ state: { source }, version: 2 })
    localStorage.setItem(shapeKey, seededRaw)
    ;(window as unknown as { __seededShapeRaw: string }).__seededShapeRaw = seededRaw
    const originalSetItem = Storage.prototype.setItem
    ;(window as unknown as { __shapeWrites: number }).__shapeWrites = 0
    Storage.prototype.setItem = function setItem(key: string, value: string): void {
      if (key === shapeKey) (window as unknown as { __shapeWrites: number }).__shapeWrites += 1
      originalSetItem.call(this, key, value)
    }
  }, { shapeKey: SHAPE_KEY })

  await page.goto('/workspace/jamo')
  await expect(page.getByText('역할별 마스터 1개가 연결되어 있어요.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Shape 마스터 ㄱ 최종 윤곽' })).toBeVisible()
  const masterInk = page.getByRole('img', { name: 'Shape 마스터 ㄱ 최종 윤곽' }).locator('path[data-final-ink="true"]')
  await expect(masterInk).toHaveCount(1)
  await expect(masterInk).not.toHaveAttribute('d', '')
  await page.waitForTimeout(450)
  expect(await page.evaluate(() => (window as unknown as { __shapeWrites: number }).__shapeWrites)).toBe(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY))
    .toBe(await page.evaluate(() => (window as unknown as { __seededShapeRaw: string }).__seededShapeRaw))
  await page.evaluate(() => { (window as unknown as { __shapeWrites: number }).__shapeWrites = 0 })
  const j02Before = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)
  await page.getByRole('button', { name: 'ㄱ 원형 선택' }).click()
  await page.waitForTimeout(500)
  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(j02Before)
  expect(await page.evaluate(() => (window as unknown as { __shapeWrites: number }).__shapeWrites)).toBe(0)
  await page.goto('/workspace/jamo/result?char=과')
  await page.waitForTimeout(450)
  await page.evaluate(() => { (window as unknown as { __shapeWrites: number }).__shapeWrites = 0 })
  const before = await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)

  await page.getByRole('button', { name: '곽 혼합+받침 관찰' }).click()
  await page.getByRole('button', { name: '정밀 조절' }).click()
  await page.waitForTimeout(500)

  expect(await page.evaluate((key) => localStorage.getItem(key), SHAPE_KEY)).toBe(before)
  expect(await page.evaluate(() => (window as unknown as { __shapeWrites: number }).__shapeWrites)).toBe(0)
  await expect(page.getByRole('button', { name: '형태 편집 실행 취소' })).toBeDisabled()
})
