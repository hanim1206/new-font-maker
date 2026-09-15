import { describe, expect, it } from 'vitest'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { validateRoleConstructionScope } from './jamoConstruction'
import { fitNotoMedialMaster, splitMixedMedialRoles } from './notoMedialMasterFit'
import type { MedialFitInput } from './notoMedialMasterFit'
import { resolveShapeGlyphInkPrimitives } from './shapeGlyphInkResolver'
import type { StrokeRenderStyle } from '../types'

const STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }

// 가의 승인 측정을 단순화한 ㅏ. 기둥 오른면 .745, 보 윗면 .420, 기둥 두께 .08, 보 두께 .07.
const A: MedialFitInput = {
  jamoId: 'ㅏ', role: 'JU_VERTICAL',
  measurements: {
    outerPillar: { face: 0.745, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.05, to: 0.42 }, { from: 0.49, to: 0.96 }] },
    primaryBeam: { face: 0.42, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.745, to: 0.89 }] },
  },
  thickness: { outerPillar: 0.08, primaryBeam: 0.07 },
}

describe('fitNotoMedialMaster', () => {
  it('ㅏ: 기둥 중심 = face − 두께/2, 끊긴 구간은 합집합, slot은 잉크 박스', () => {
    const outcome = fitNotoMedialMaster(A)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const { fit } = outcome
    const stem = fit.strokes.find((s) => s.roleId === 'outerPillar')!
    expect(stem.center).toBeCloseTo(0.705, 9)
    expect(stem.from).toBe(0.05)
    expect(stem.to).toBe(0.96)
    const beam = fit.strokes.find((s) => s.roleId === 'primaryBeam')!
    expect(beam.center).toBeCloseTo(0.455, 9)
    expect(fit.slot.x).toBeCloseTo(0.665, 9)
    expect(fit.slot.x + fit.slot.width).toBeCloseTo(0.89, 9)
    expect(fit.slot.y).toBe(0.05)
    expect(fit.slot.y + fit.slot.height).toBe(0.96)
    // rail: 기둥 중심 → center-x, 보 중심 → center-y, 보 끝 = slot 오른끝 → outer-right.
    expect(fit.railsEm['center-x']).toBeCloseTo(0.705, 9)
    expect(fit.railsEm['center-y']).toBeCloseTo(0.455, 9)
    expect(fit.railsEm['outer-right']).toBeCloseTo(0.89, 9)
    // 두께는 rail이 아니라 element에.
    const elements = fit.master.construction.channels.main!.elements
    expect(elements.map((e) => e.kind === 'centerline' ? e.thickness : null)).toEqual([0.08, 0.07])
    expect(validateRoleConstructionScope(fit.scope).ok).toBe(true)
  })

  it('fit 결과는 기존 리졸버·잉크 파이프라인을 그대로 지나 slot 자리에 잉크를 만든다', () => {
    const outcome = fitNotoMedialMaster(A)
    if (!outcome.ok) throw new Error(outcome.message)
    const { fit } = outcome
    const primitives = resolveShapeGlyphInkPrimitives({ source: fit.scope, masterId: fit.master.id, glyphId: 'ㅏ', part: 'JU', slot: fit.slot, weightMultiplier: 1 })
    expect(primitives.ok).toBe(true)
    if (!primitives.ok) return
    const ink = materializeFinalGlyphInk(primitives.primitives, STYLE, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 })
    expect(ink.ok).toBe(true)
    if (!ink.ok) return
    const points = ink.ink.regions.flatMap((r) => r.outer)
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    // round cap이라 끝이 두께/2만큼 삐져나오는 것만 허용.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(fit.slot.x - 0.041)
    expect(Math.max(...xs)).toBeLessThanOrEqual(fit.slot.x + fit.slot.width + 0.041)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(fit.slot.y - 0.041)
    expect(Math.max(...ys)).toBeLessThanOrEqual(fit.slot.y + fit.slot.height + 0.041)
  })

  it('ㅗ: 줄기 위끝은 slot 위, 보 중심은 center-y, 보 양끝은 outer-left/right', () => {
    const outcome = fitNotoMedialMaster({
      jamoId: 'ㅗ', role: 'JU_HORIZONTAL',
      measurements: {
        baseStem: { face: 0.45, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.44, to: 0.76 }] },
        primaryBeam: { face: 0.76, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.05, to: 0.37 }, { from: 0.45, to: 0.87 }] },
      },
      thickness: { baseStem: 0.08, primaryBeam: 0.07 },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.fit.railsEm['outer-left']).toBe(0.05)
    expect(outcome.fit.railsEm['outer-right']).toBe(0.87)
    expect(outcome.fit.railsEm['center-x']).toBeCloseTo(0.41, 9)
    expect(outcome.fit.railsEm['outer-top']).toBe(0.44)
    expect(outcome.fit.railsEm['center-y']).toBeCloseTo(0.795, 9)
    expect(validateRoleConstructionScope(outcome.fit.scope).ok).toBe(true)
  })

  it('두께·구간·faceSide가 없으면 이유를 말하고 실패한다', () => {
    expect(fitNotoMedialMaster({ ...A, thickness: { outerPillar: 0.08 } })).toMatchObject({ ok: false, message: expect.stringContaining('primaryBeam') })
    expect(fitNotoMedialMaster({ ...A, measurements: { ...A.measurements, outerPillar: { ...A.measurements.outerPillar, visibleSpans: [] } } })).toMatchObject({ ok: false, message: expect.stringContaining('가시 구간') })
    expect(fitNotoMedialMaster({ ...A, measurements: { ...A.measurements, outerPillar: { ...A.measurements.outerPillar, faceSide: 'top' } } })).toMatchObject({ ok: false, message: expect.stringContaining('faceSide') })
  })

  it('혼합 홀자는 baseStem·lowerBeam을 가로부, 나머지를 세로부로 가른다', () => {
    const split = splitMixedMedialRoles({ baseStem: 1, lowerBeam: 2, outerPillar: 3, upperBeam: 4 })
    expect(Object.keys(split.horizontal)).toEqual(['baseStem', 'lowerBeam'])
    expect(Object.keys(split.vertical)).toEqual(['outerPillar', 'upperBeam'])
  })
})
