import { describe, expect, it } from 'vitest'
import type { ResolvedInkPrimitive, StrokeRenderStyle } from '../types'
import { materializeFinalGlyphInk } from './finalGlyphInk'

const STYLE: StrokeRenderStyle = {
  mode: 'brush',
  brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
}

describe('FinalGlyphInk topology failure boundary', () => {
  it('self-intersection area primitive을 일부 잉크로 저장하지 않는다', () => {
    const bowTie: ResolvedInkPrimitive = {
      kind: 'region',
      coordinateSpace: 'glyph-normalized',
      id: 'area:bow-tie',
      source: {
        kind: 'part-grid', glyphId: 'test', part: 'CH', jamoId: 'ㄱ', elementId: 'area:bow-tie',
      },
      region: {
        outer: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
        holes: [],
      },
    }

    expect(materializeFinalGlyphInk([bowTie], STYLE, {
      unitsPerEm: 1000,
      maxCurveErrorFontUnits: 0.5,
    })).toEqual({
      ok: false,
      message: expect.stringContaining('self-intersection'),
    })
  })
})
