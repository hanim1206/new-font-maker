import { describe, expect, it } from 'vitest'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { validateRoleConstructionScope } from './jamoConstruction'
import { applyRailEdits, applySlotFacesDelta, boundRailRoles, fitNotoMedialMaster, splitMixedMedialRoles } from './notoMedialMasterFit'
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

  it('rail을 옮기면 결속된 획이 따라오고 두께는 그대로다', () => {
    const outcome = fitNotoMedialMaster(A)
    if (!outcome.ok) throw new Error(outcome.message)
    const { fit } = outcome
    // 기둥 왼면(outer-left)은 어느 획 끝도 아니라 매이지 않는다. slot에서 따라온다.
    expect(boundRailRoles(fit)).toEqual(['center-x', 'outer-right', 'outer-top', 'center-y', 'outer-bottom'])
    // 기둥 중심을 오른쪽으로 20u, 보를 위로 30u.
    const edited = applyRailEdits(fit, { ...fit.railsEm, 'center-x': fit.railsEm['center-x'] + 0.02, 'center-y': fit.railsEm['center-y'] - 0.03 })
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    const stem = edited.fit.strokes.find((s) => s.roleId === 'outerPillar')!
    const beam = edited.fit.strokes.find((s) => s.roleId === 'primaryBeam')!
    expect(stem.center).toBeCloseTo(0.725, 9)
    expect(stem.thickness).toBe(0.08)
    expect(beam.center).toBeCloseTo(0.425, 9)
    expect(beam.from).toBeCloseTo(0.725, 9) // 보 시작은 기둥 중심 rail에 매여 같이 움직인다
    expect(beam.thickness).toBe(0.07)
    // 기둥이 오른쪽으로 갔으니 잉크 박스 왼끝(매이지 않은 outer-left)도 따라온다.
    expect(edited.fit.slot.x).toBeCloseTo(fit.slot.x + 0.02, 9)
    expect(edited.fit.railsEm['outer-left']).toBeCloseTo(fit.railsEm['outer-left'] + 0.02, 9)
    expect(validateRoleConstructionScope(edited.fit.scope).ok).toBe(true)
    // outer를 옮기면 slot이 바뀐다.
    const wider = applyRailEdits(fit, { ...fit.railsEm, 'outer-right': fit.railsEm['outer-right'] + 0.05 })
    expect(wider.ok && wider.fit.slot.width).toBeCloseTo(fit.slot.width + 0.05, 9)
    // 순서 뒤집기는 거부.
    expect(applyRailEdits(fit, { ...fit.railsEm, 'center-x': fit.railsEm['outer-right'] + 0.01 }).ok).toBe(false)
  })

  it('혼합 홀자는 baseStem·lowerBeam·primaryBeam을 가로부, 기둥·윗보를 세로부로 가른다', () => {
    const split = splitMixedMedialRoles({ baseStem: 1, lowerBeam: 2, outerPillar: 3, upperBeam: 4 })
    expect(Object.keys(split.horizontal)).toEqual(['baseStem', 'lowerBeam'])
    expect(Object.keys(split.vertical)).toEqual(['outerPillar', 'upperBeam'])
    // ㅚ·ㅟ·ㅢ의 primaryBeam은 ㅗ·ㅜ·ㅡ의 보다. ㅢ는 primaryBeam 하나가 가로부 전부다.
    const ui = splitMixedMedialRoles({ outerPillar: 1, primaryBeam: 2 })
    expect(Object.keys(ui.horizontal)).toEqual(['primaryBeam'])
    expect(Object.keys(ui.vertical)).toEqual(['outerPillar'])
  })

  it('획 끝이 가장자리에서 부동소수 잡음만큼 떨어져 있어도 그 rail에 걸린다', () => {
    // 보 둘의 끝이 1e-6 차이. 하나는 slot 오른끝, 다른 하나는 그보다 1e-6 안쪽 — 둘 다 outer-right.
    const outcome = fitNotoMedialMaster({
      jamoId: 'ㅑ', role: 'JU_VERTICAL',
      measurements: {
        outerPillar: { face: 0.75, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.05, to: 0.52 }] },
        upperBeam: { face: 0.17, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.69, to: 0.8809199999999999 }] },
        lowerBeam: { face: 0.35, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.69, to: 0.880921 }] },
      },
      thickness: { outerPillar: 0.08, upperBeam: 0.07, lowerBeam: 0.07 },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.fit.auxRails).toEqual([])
    expect(outcome.fit.bindings.map((b) => b.toRail)).toEqual(['outer-bottom', 'outer-right', 'outer-right'])
    expect(validateRoleConstructionScope(outcome.fit.scope).ok).toBe(true)
  })

  it('ㅖ: 짧은 안기둥 끝은 core 5개에 안 들어가면 보조 rail에 맨다', () => {
    // 안기둥이 바깥기둥보다 위·아래로 20u씩 짧다. 보 중심 둘이 core를 쓰고 안기둥 끝 둘은 보조 rail.
    const outcome = fitNotoMedialMaster({
      jamoId: 'ㅖ', role: 'JU_VERTICAL',
      measurements: {
        innerPillar: { face: 0.62, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.07, to: 0.53 }] },
        outerPillar: { face: 0.79, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.05, to: 0.55 }] },
        upperBeam: { face: 0.19, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.41, to: 0.58 }] },
        lowerBeam: { face: 0.35, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.41, to: 0.58 }] },
      },
      thickness: { innerPillar: 0.078, outerPillar: 0.079, upperBeam: 0.066, lowerBeam: 0.067 },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const { fit } = outcome
    // y축: 보 중심 둘 → inner-top·inner-bottom, 안기둥 위끝·아래끝 → 보조 rail.
    expect(fit.auxRails).toEqual(['aux-y-1', 'aux-y-2'])
    expect(fit.railsEm['aux-y-1']).toBe(0.07)
    expect(fit.railsEm['aux-y-2']).toBe(0.53)
    const inner = fit.bindings.find((b) => b.roleId === 'innerPillar')!
    expect(inner).toMatchObject({ centerRail: 'inner-left', fromRail: 'aux-y-1', toRail: 'aux-y-2' })
    // x축: 기둥 둘 → inner-left·inner-right, 보 시작 = slot 왼끝, 보 끝 = 안기둥 중심(접합).
    const upper = fit.bindings.find((b) => b.roleId === 'upperBeam')!
    expect(upper).toMatchObject({ fromRail: 'outer-left', toRail: 'inner-left' })
    // 보조 rail은 그리드에 값 순서대로 들어가고 편집 목록에도 나온다.
    const yIds = fit.grid.yRails.map((rail) => rail.id.split(':').at(-1))
    expect(yIds).toEqual(['outer-top', 'aux-y-1', 'inner-top', 'center-y', 'inner-bottom', 'aux-y-2', 'outer-bottom'])
    expect(fit.grid.yRails.find((rail) => rail.id.endsWith('aux-y-1'))).toMatchObject({ kind: 'auxiliary' })
    expect(boundRailRoles(fit)).toContain('aux-y-1')
    expect(validateRoleConstructionScope(fit.scope).ok).toBe(true)
    // 리졸버·잉크 파이프라인도 보조 rail 앵커를 그대로 읽는다.
    const primitives = resolveShapeGlyphInkPrimitives({ source: fit.scope, masterId: fit.master.id, glyphId: 'ㅖ', part: 'JU', slot: fit.slot, weightMultiplier: 1 })
    expect(primitives.ok).toBe(true)
    if (!primitives.ok) return
    expect(materializeFinalGlyphInk(primitives.primitives, STYLE, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }).ok).toBe(true)
    // 보조 rail을 옮기면 안기둥 위끝만 따라온다.
    const edited = applyRailEdits(fit, { ...fit.railsEm, 'aux-y-1': 0.09 })
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.fit.strokes.find((s) => s.roleId === 'innerPillar')!.from).toBe(0.09)
    expect(edited.fit.strokes.find((s) => s.roleId === 'outerPillar')!.from).toBe(0.05)
    expect(validateRoleConstructionScope(edited.fit.scope).ok).toBe(true)
  })

  it('minGap 안의 값은 이웃 rail에 붙는다 — ㅑ 두 보 끝이 1.5u 다르면 짧은 쪽이 outer-right에 붙고 grid가 유효하다', () => {
    // 먈에서 생긴 버그: 짧은 보 끝이 inner-right로 들어가 outer-right와 1.5u 차이 → minGap 위반 → 잉크가 안 그려졌다.
    // slot 너비 ≈ 0.21 × minGap 0.01 ≈ 2.1u 안이면 같은 rail이다.
    const outcome = fitNotoMedialMaster({
      jamoId: 'ㅑ', role: 'JU_VERTICAL',
      measurements: {
        outerPillar: { face: 0.75, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.05, to: 0.52 }] },
        upperBeam: { face: 0.17, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.73, to: 0.878 }] },
        lowerBeam: { face: 0.35, faceSide: 'top', orientation: 'horizontal', visibleSpans: [{ from: 0.73, to: 0.8765 }] },
      },
      thickness: { outerPillar: 0.083, upperBeam: 0.069, lowerBeam: 0.069 },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const { fit } = outcome
    expect(fit.auxRails).toEqual([])
    const lower = fit.bindings.find((b) => b.roleId === 'lowerBeam')!
    expect(lower).toMatchObject({ fromRail: 'center-x', toRail: 'outer-right' })
    expect(fit.strokes.find((s) => s.roleId === 'lowerBeam')!.to).toBe(fit.railsEm['outer-right'])
    expect(validateRoleConstructionScope(fit.scope).ok).toBe(true)
    const primitives = resolveShapeGlyphInkPrimitives({ source: fit.scope, masterId: fit.master.id, glyphId: 'ㅑ', part: 'JU', slot: fit.slot, weightMultiplier: 1 })
    expect(primitives.ok).toBe(true)
  })
})

describe('applySlotFacesDelta', () => {
  // ㅣ 하나. 가로 축엔 잉크 끝을 만드는 rail이 기둥 중심 하나뿐이다.
  const I: MedialFitInput = {
    jamoId: 'ㅣ', role: 'JU_VERTICAL',
    measurements: { outerPillar: { face: 0.79, faceSide: 'right', orientation: 'vertical', visibleSpans: [{ from: 0.05, to: 0.96 }] } },
    thickness: { outerPillar: 0.08 },
  }
  const fitOf = (input: MedialFitInput) => { const made = fitNotoMedialMaster(input); if (!made.ok) throw new Error(made.message); return made.fit }
  const sides = (slot: { x: number; y: number; width: number; height: number }) => ({ left: slot.x, right: slot.x + slot.width, top: slot.y, bottom: slot.y + slot.height })

  it('안 매인 core rail이 연달아 있는 홀자(ㅣ)도 rail 편집을 받는다 — 다시 채운 rail이 fit과 같은 자리다', () => {
    const fit = fitOf(I)
    const same = applyRailEdits(fit, fit.railsEm)
    expect(same.ok).toBe(true)
    if (!same.ok) return
    for (const [key, value] of Object.entries(fit.railsEm)) expect(same.fit.railsEm[key]).toBeCloseTo(value, 9)
    const moved = applyRailEdits(fit, { ...fit.railsEm, 'center-x': fit.railsEm['center-x'] + 0.01 })
    expect(moved.ok && moved.fit.slot.x).toBeCloseTo(fit.slot.x + 0.01, 9)
  })

  it('ㅏ의 상자 변을 옮기면 잉크 박스가 새 변에 닿고 두께는 그대로다', () => {
    const fit = fitOf(A)
    const before = sides(fit.slot)
    const moved = applySlotFacesDelta(fit, { left: -0.02, right: 0.03, top: 0.01, bottom: -0.04 })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const after = sides(moved.fit.slot)
    expect(after.left).toBeCloseTo(before.left - 0.02, 9)
    expect(after.right).toBeCloseTo(before.right + 0.03, 9)
    expect(after.top).toBeCloseTo(before.top + 0.01, 9)
    expect(after.bottom).toBeCloseTo(before.bottom - 0.04, 9)
    expect(moved.fit.strokes.map((stroke) => stroke.thickness)).toEqual(fit.strokes.map((stroke) => stroke.thickness))
    // 보 시작은 여전히 기둥 중심에 붙어 있다.
    const stem = moved.fit.strokes.find((stroke) => stroke.roleId === 'outerPillar')!
    const beam = moved.fit.strokes.find((stroke) => stroke.roleId === 'primaryBeam')!
    expect(beam.from).toBeCloseTo(stem.center, 9)
    expect(validateRoleConstructionScope(moved.fit.scope).ok).toBe(true)
  })

  it('획 하나뿐인 축(ㅣ의 가로)은 크기를 못 바꾸므로 두 변 오프셋을 더해 통째로 옮긴다', () => {
    const fit = fitOf(I)
    const before = sides(fit.slot)
    const moved = applySlotFacesDelta(fit, { left: 0.02 })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(sides(moved.fit.slot).left).toBeCloseTo(before.left + 0.02, 9)
    expect(sides(moved.fit.slot).right).toBeCloseTo(before.right + 0.02, 9)
    expect(moved.fit.slot.width).toBeCloseTo(fit.slot.width, 9)
    const both = applySlotFacesDelta(fit, { left: 0.02, right: -0.005 })
    expect(both.ok && sides(both.fit.slot).left).toBeCloseTo(before.left + 0.015, 9)
    // 세로 축은 기둥의 시작·끝이 따로라 늘어난다.
    const taller = applySlotFacesDelta(fit, { top: -0.01, bottom: 0.02 })
    expect(taller.ok && taller.fit.slot.height).toBeCloseTo(fit.slot.height + 0.03, 9)
  })

  it('Δ가 0이면 그대로고, 상자가 획 두께보다 좁아지면 거부한다', () => {
    const fit = fitOf(A)
    const same = applySlotFacesDelta(fit, {})
    expect(same.ok && same.fit.slot).toEqual(fit.slot)
    expect(applySlotFacesDelta(fit, { right: -fit.slot.width }).ok).toBe(false)
  })
})
