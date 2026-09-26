import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { windowsClipMetrics } from './fontGenerator'
import { WIN_METRICS } from './fontMetrics'

function glyphSpanning(y1: number, y2: number) {
  const path = new opentype.Path()
  path.moveTo(0, y1)
  path.lineTo(100, y1)
  path.lineTo(100, y2)
  path.lineTo(0, y2)
  path.close()
  return new opentype.Glyph({ name: 'g', advanceWidth: 1000, path })
}

describe('윈도우 잘림 높이', () => {
  it('잉크가 노토 줄 높이 안이면 노토 값(1160/288) — 맥 hhea와 같은 1.448em', () => {
    expect(windowsClipMetrics([glyphSpanning(-100, 860)])).toEqual({ usWinAscent: WIN_METRICS.ascent, usWinDescent: WIN_METRICS.descent })
  })

  it('획을 위아래로 옮겨 넘친 잉크 끝까지 넓힌다', () => {
    const empty = new opentype.Glyph({ name: 'e', advanceWidth: 1000, path: new opentype.Path() })
    expect(windowsClipMetrics([empty, glyphSpanning(-50, WIN_METRICS.ascent + 16.4), glyphSpanning(-(WIN_METRICS.descent + 69.2), 500)]))
      .toEqual({ usWinAscent: WIN_METRICS.ascent + 17, usWinDescent: WIN_METRICS.descent + 70 })
  })
})
