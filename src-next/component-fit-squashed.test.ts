import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../scripts/reference-lab/notoPresetApi'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'

/**
 * 2026-09-24 아이폰에서 보선을 끌다 앱이 통째로 멈췄다. `가` 첫닿자 윗변을 내리면 닿는 글자 `싸`의
 * `ㅆ` 상자가 납작해지고, 잉크를 합치던 polygon-clipping이 끝나지 않았다. 이제 Clipper2가 합친다.
 */
describe('납작한 닿자 상자', () => {
  const reader = createNotoPresetReader(path.resolve(__dirname, '../.reference-fonts/guide-corpus'))

  it('싸 ㅆ 윗변을 바닥까지 내려도 매번 금방 끝난다', async () => {
    const bundle = await reader.model()
    const glyph = (await reader.glyph('싸'.codePointAt(0)!))!
    const context = resolveContextBoxes({ identity: glyph.identity, model: bundle })
    const part = fitComponentsForGlyph({ context, outline: glyph.outline, approved: null })[0]
    const faces = part.faces!
    // 멈췄던 바로 그 상자.
    const hung = renderComponentPart(part, { ...faces, top: 0.626449 })
    expect(hung.path).toBeTruthy()
    let worst = 0
    for (let top = faces.top; top < faces.bottom; top += 0.002) {
      const started = performance.now()
      renderComponentPart(part, { ...faces, top })
      worst = Math.max(worst, performance.now() - started)
    }
    expect(worst).toBeLessThan(500)
  }, 60_000)
})
