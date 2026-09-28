import { describe, expect, it } from 'vitest'
import type { ResolvedInkPrimitive, StrokeDataV2, StrokeRenderStyle } from '../types'
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

describe('FinalGlyphInk 붓촉', () => {
  // 가로줄기 하나. 끝 모양은 새 기본값(butt · miter).
  const stroke: StrokeDataV2 = { id: 'ㅡ-1', closed: false, thickness: 0.1, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] }
  const primitive: ResolvedInkPrimitive = {
    kind: 'centerline', coordinateSpace: 'stroke-local-with-glyph-box', id: 'p', stroke, box: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, weightMultiplier: 1,
    effectiveLinecap: 'butt', effectiveLinejoin: 'miter',
    source: { kind: 'stroke', glyphId: 'g', part: 'JU', channel: 'strokes', jamoId: 'ㅡ', strokeId: 'ㅡ-1' },
  }
  const heightOf = (style: StrokeRenderStyle): number => {
    const ink = materializeFinalGlyphInk([primitive], style, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 })
    if (!ink.ok) throw new Error(ink.message)
    const ys = ink.ink.regions.flatMap((region) => region.outer.map((point) => point.y))
    return Math.max(...ys) - Math.min(...ys)
  }

  it('끝 모양이 일자여도 납작 붓촉이면 붓촉으로 긋는다 — 가로줄기가 가늘어진다(레이아웃 편집기)', () => {
    const round = heightOf({ mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } })
    const flat = heightOf({ mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.3, angle: 0 } })
    expect(round).toBeCloseTo(0.1, 3)
    expect(flat).toBeLessThan(round * 0.5)
  })

  it('납작 붓촉이면 전역 둥글기가 있어도 붓촉으로 긋는다(화면 렌더와 같은 분기)', () => {
    const flat = heightOf({ mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.3, angle: 0 }, roundness: 0.55 })
    expect(flat).toBeLessThan(0.05)
  })
})
