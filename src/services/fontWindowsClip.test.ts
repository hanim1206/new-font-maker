import * as opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { windowsClipMetrics } from './fontGenerator'

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
  it('잉크가 기본 높이 안이면 기본값 880/120', () => {
    expect(windowsClipMetrics([glyphSpanning(-100, 860)])).toEqual({ usWinAscent: 880, usWinDescent: 120 })
  })

  it('획을 위아래로 옮겨 넘친 잉크 끝까지 넓힌다', () => {
    const empty = new opentype.Glyph({ name: 'e', advanceWidth: 1000, path: new opentype.Path() })
    expect(windowsClipMetrics([empty, glyphSpanning(-50, 896.4), glyphSpanning(-189.2, 500)]))
      .toEqual({ usWinAscent: 897, usWinDescent: 190 })
  })
})
