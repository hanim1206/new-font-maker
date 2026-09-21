// 레이아웃 보선을 끄는 동안의 프레임 시간과 JS 시간 몫을 잰다.
// 쓰기: node scripts/perf/layout-rail-drag.mjs [baseURL] (기본 http://127.0.0.1:5173, dev 서버가 떠 있어야 한다)
// 재는 법은 docs/plans/2026-09-21_레이아웃-보선-끌기-버벅임-줄이기.md 의 D0.
import { chromium, devices } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const CPU_THROTTLE = 4
const AMPLITUDE_U = 60
const SCENARIOS = [
  { char: '각', part: 'CH' },
  { char: '각', part: 'JU' },
  { char: '봐', part: 'CH' },
  { char: '봐', part: 'JU' },
]
const OWNERS = [
  ['cards', 'TouchedGlyphRow'],
  ['cards', 'ReviewPropagationCards'],
  ['canvas', 'GlyphLayoutEditor'],
]

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0 }
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0 }

/** 프로파일의 자기 시간을 "맨 위에서 처음 만난 우리 파일"에 몰아 준다. 카드 계산이 부르는 fit 함수 시간도 카드 몫이 된다. */
function attribute(profile) {
  const self = new Map()
  profile.samples.forEach((id, index) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0)))
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const totals = { cards: 0, canvas: 0, other: 0, idle: 0 }
  const walk = (node, owner) => {
    const name = node.callFrame.functionName
    const next = owner ?? OWNERS.find(([, file]) => node.callFrame.url.includes(file))?.[0]
    const bucket = name === '(idle)' ? 'idle' : next ?? 'other'
    totals[bucket] += (self.get(node.id) ?? 0) / 1000
    for (const child of node.children ?? []) walk(byId.get(child), next)
  }
  walk(profile.nodes[0], undefined)
  return totals
}

async function grabPoint(page, part) {
  const canvas = page.getByTestId('review-canvas')
  if (part === 'JU') {
    const hit = canvas.locator('[data-testid="review-part-hit"][data-part^="JU"]').first()
    if ((await hit.getAttribute('aria-pressed')) !== 'true') await hit.dispatchEvent('pointerdown')
  }
  const selector = part === 'CH' ? '[data-rail-handle^="c0:"]' : '[data-rail-handle]:not([data-rail-handle^="c"])'
  const handle = canvas.locator(selector).first()
  await handle.waitFor({ state: 'attached', timeout: 20_000 })
  const [x1, x2, y1] = await Promise.all(['x1', 'x2', 'y1'].map(async (name) => Number(await handle.getAttribute(name))))
  const box = await canvas.boundingBox()
  const px = (em, size, origin) => origin + (em + 0.08) / 1.16 * size
  const axis = x1 === x2 ? 'x' : 'y'
  // 세로 보선은 위 여백, 가로 보선은 왼 여백에서 잡는다. 가운데는 다른 손잡이가 덮는다.
  const point = axis === 'x' ? { x: px(x1, box.width, box.x), y: px(-0.045, box.height, box.y) } : { x: px(-0.045, box.width, box.x), y: px(y1, box.height, box.y) }
  return { axis, point, pxPerU: (axis === 'x' ? box.width : box.height) / 1.16 / 1000, id: await handle.getAttribute('data-rail-handle') }
}

async function drag(page, grab) {
  const at = (u) => grab.axis === 'x' ? [grab.point.x + u * grab.pxPerU, grab.point.y] : [grab.point.x, grab.point.y + u * grab.pxPerU]
  const path = []
  for (let u = 1; u <= AMPLITUDE_U; u += 1) path.push(u)
  for (let u = AMPLITUDE_U - 1; u >= -AMPLITUDE_U; u -= 1) path.push(u)
  for (let u = -AMPLITUDE_U + 1; u <= 0; u += 1) path.push(u)
  await page.mouse.move(...at(0))
  await page.mouse.down()
  const started = Date.now()
  for (const u of path) await page.mouse.move(...at(u))
  const elapsed = Date.now() - started
  await page.mouse.up()
  return { moves: path.length, elapsed }
}

async function measure(browser, scenario, withProfile) {
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await context.newPage()
  await page.goto(`${BASE}/workspace/jamo?char=${encodeURIComponent(scenario.char)}&mode=layout`)
  await page.getByTestId('review-fit-box').first().waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="review-propagation-card"] path').length >= 8, null, { timeout: 30_000 })
  const grab = await grabPoint(page, scenario.part)
  // 부품을 바꾸면 카드 줄이 새로 뜬다. 다 읽을 때까지 기다린다.
  await page.waitForTimeout(1500)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
  await page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = (now) => { window.__frames.push(now - last); last = now; window.__raf = requestAnimationFrame(tick) }
    window.__raf = requestAnimationFrame(tick)
  })
  if (withProfile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start') }
  const result = await drag(page, grab)
  const profile = withProfile ? (await cdp.send('Profiler.stop')).profile : null
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames.slice(1) })
  const touched = await page.locator('[data-testid="review-propagation-card"][data-touched="true"]').count()
  await context.close()
  return {
    ...scenario, rail: grab.id, moves: result.moves,
    msPerMove: +(result.elapsed / result.moves).toFixed(1),
    frameMedian: +median(frames).toFixed(1), frameP95: +percentile(frames, 0.95).toFixed(1),
    longFrames: frames.filter((value) => value > 50).length, frames: frames.length, touchedCards: touched,
    ...(profile ? Object.fromEntries(Object.entries(attribute(profile)).map(([key, value]) => [`js_${key}`, Math.round(value)])) : {}),
  }
}

const browser = await chromium.launch({ channel: 'chrome' })
const rows = []
for (const scenario of SCENARIOS) {
  const frames = await measure(browser, scenario, false)
  const profiled = await measure(browser, scenario, true)
  rows.push({ ...frames, js_cards: profiled.js_cards, js_canvas: profiled.js_canvas, js_other: profiled.js_other })
}
await browser.close()
console.table(rows)
