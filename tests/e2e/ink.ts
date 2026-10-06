import type { Locator, Page } from '@playwright/test'

/**
 * 화면에 실제로 그려진 잉크를 픽셀로 잰다. 다른 스펙은 DOM만 봐서 "DOM은 멀쩡한데 안 그려진다" · "끄는 동안 안 움직인다"를 못 잡는다.
 * 캔버스(`focus-canvas`)의 검은 픽셀 수 · 캔버스에서 차지하는 몫(%) · 무게중심 x(기기 픽셀)를 돌려준다.
 */
export async function inkOf(page: Page): Promise<{ count: number; share: number; x: number }> {
  const box = (await page.getByTestId('focus-canvas').boundingBox())!
  const shot = (await page.screenshot({ clip: box })).toString('base64')
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    let sum = 0
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4
      if (pixels[index] < 70 && pixels[index + 1] < 70 && pixels[index + 2] < 70) { count += 1; sum += x }
    }
    return { count, share: count / (canvas.width * canvas.height) * 100, x: count ? sum / count : 0 }
  }, shot)
}

/** 획 길 위의 한 점(화면 좌표). 상자 가운데는 ㄱ · ㅇ처럼 비어 있을 수 있어 길 위에서 고른다. */
export function pointOn(hit: Locator, along = 0.3): Promise<{ x: number; y: number }> {
  return hit.evaluate((element, ratio) => {
    const path = element as SVGPathElement
    const at = path.getPointAtLength(path.getTotalLength() * ratio)
    const matrix = path.getScreenCTM()!
    return { x: at.x * matrix.a + at.y * matrix.c + matrix.e, y: at.x * matrix.b + at.y * matrix.d + matrix.f }
  }, along)
}
