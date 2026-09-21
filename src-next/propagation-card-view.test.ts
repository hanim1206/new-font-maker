import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../scripts/reference-lab/notoPresetApi'
import { boxToFaces, facesOffsets, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta } from '../src/services/contextBoxResolver'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import { fitMedialForGlyph, renderMedialPart, withSlotFaces } from './notoMedialFitView'
import type { NotoPresetGlyph, NotoPresetModelBundle } from './notoPresetGlyphs'
import { propagationCardBaseOf, propagationCardViewOf } from './propagationCardView'
import type { PropagationCardBox } from './propagationCardView'
import { applyFacesDelta, applyMedialDelta } from './reviewPropagation'
import type { PropagationEdit } from './reviewPropagation'

/**
 * 카드 계산을 "글자당 한 번"과 "끄는 동안"으로 나눠도 그림은 글자 하나 안 달라야 한다.
 * `legacyView`는 나누기 전 카드가 한 번에 하던 계산 그대로다. 고치지 않는다 — 기준이다.
 */

const CORPUS = path.resolve(__dirname, '../.reference-fonts/guide-corpus')

function legacyView(glyph: NotoPresetGlyph, bundle: NotoPresetModelBundle, edit: PropagationEdit, savedDelta?: ContextBoxDelta) {
  const identity = glyph.identity
  const ghost = notoOutlineGhostPath(glyph.outline)
  const context = resolveContextBoxes({ identity, model: bundle, delta: savedDelta })
  const medialView = fitMedialForGlyph({ context, outline: glyph.outline, approved: null })
  const componentParts = fitComponentsForGlyph({ context, outline: glyph.outline, approved: null })
  const after: string[] = []
  const before: string[] = []
  const boxes: PropagationCardBox[] = []
  let skipped = 0
  let touched = 0
  for (const modelPart of medialView.parts) {
    const base = renderMedialPart(modelPart, undefined, undefined)
    const slotDelta = modelPart.fit ? facesOffsets(boxToFaces(modelPart.fit.slot), edit.layout.slot[modelPart.part]) : undefined
    const slotMoved = withSlotFaces(modelPart, slotDelta)
    const part = slotMoved.ok ? slotMoved.part : modelPart
    const slotTouched = slotMoved.ok && part !== modelPart
    if (slotDelta && !slotMoved.ok) skipped += 1
    const delta = part.fit ? edit.layout.medial[part.part] : undefined
    const applied = delta && part.fit ? applyMedialDelta(part.fit, delta) : null
    if (applied) skipped += applied.skipped
    if (!slotTouched && !(applied && applied.applied > 0)) { if (base.path) after.push(base.path); continue }
    const moved = renderMedialPart(part, applied && applied.applied > 0 ? applied.rails : undefined, undefined)
    if (!moved.slot) { if (base.path) after.push(base.path); skipped += applied?.applied ?? 0; continue }
    touched += 1
    if (moved.path) after.push(moved.path)
    if (base.path) before.push(base.path)
    if (moved.slot) boxes.push({ kind: 'medial', box: moved.slot })
  }
  for (const part of componentParts) {
    const base = renderComponentPart(part, undefined, undefined)
    const delta = edit.layout.component[part.part]
    if (!delta || !part.faces) { if (base.path) after.push(base.path); continue }
    const moved = renderComponentPart(part, applyFacesDelta(part.faces, delta), undefined)
    if (!moved.path) { if (base.path) after.push(base.path); skipped += 1; continue }
    touched += 1
    after.push(moved.path)
    if (base.path) before.push(base.path)
    if (moved.faces) boxes.push({ kind: 'component', box: { x: moved.faces.left, y: moved.faces.top, width: moved.faces.right - moved.faces.left, height: moved.faces.bottom - moved.faces.top } })
  }
  return { ghost: 'path' in ghost ? ghost.path : null, after, before, boxes, skipped, touched }
}

const NO_EDIT: PropagationEdit = { layout: { medial: {}, component: {}, slot: {} } }
const MEDIAL_KEYS = ['JU', 'JU_H', 'JU_V'] as const
const allMedial = <T,>(value: T) => Object.fromEntries(MEDIAL_KEYS.map((key) => [key, value])) as Record<(typeof MEDIAL_KEYS)[number], T>

describe('닿는 글자 카드 계산 나누기', () => {
  const reader = createNotoPresetReader(CORPUS)
  // 받친글자 · 섞임모임 · 겹받침 · 세로모임까지 여섯 칸을 고루.
  const CHARS = ['각', '봐', '멈', '을', '노', '과', '값', '왠']

  const editsFor = (glyph: NotoPresetGlyph, bundle: NotoPresetModelBundle): Record<string, PropagationEdit> => {
    const context = resolveContextBoxes({ identity: glyph.identity, model: bundle })
    const medial = fitMedialForGlyph({ context, outline: glyph.outline, approved: null })
    // 이 글자 홀자의 중심 rail 키. 카드는 같은 키의 Δ만 받는다.
    const centerKeys = medial.parts.flatMap((part) => part.fit ? part.fit.bindings.filter((binding) => binding.centerRail).map((binding) => `${binding.roleId}.center`) : [])
    const centerDelta = (amount: number) => Object.fromEntries(centerKeys.map((key) => [key, amount]))
    return {
      '없음': NO_EDIT,
      '첫닿자 왼선 +20u': { layout: { medial: {}, component: { CH: { left: 0.02 } }, slot: {} } },
      '첫닿자 오른선 고정': { layout: { medial: {}, component: { CH: { right: { at: 0.5 } } }, slot: {} } },
      '받침 윗선 -30u': { layout: { medial: {}, component: { JO: { top: -0.03 } }, slot: {} } },
      '닿자 못 놓는 Δ': { layout: { medial: {}, component: { CH: { left: 0.9 }, JO: { top: 0.9 } }, slot: {} } },
      '홀자 중심 +15u': { layout: { medial: allMedial(centerDelta(0.015)), component: {}, slot: {} } },
      '홀자 중심 못 놓는 Δ': { layout: { medial: allMedial(centerDelta(0.4)), component: {}, slot: {} } },
      '홀자 상자 왼선 +20u': { layout: { medial: {}, component: {}, slot: allMedial({ left: 0.02 }) } },
      '홀자 상자 못 놓는 Δ': { layout: { medial: {}, component: {}, slot: allMedial({ left: 0.6 }) } },
      '전부 같이': { layout: { medial: allMedial(centerDelta(-0.01)), component: { CH: { left: 0.01, top: { at: 0.1 } }, JO: { bottom: -0.01 } }, slot: allMedial({ right: -0.015 }) } },
    }
  }

  it('나눈 계산의 그림 · 상자 · 닿음 · 미적용 수가 한 번에 계산한 것과 같다', async () => {
    const bundle = await reader.model()
    let touchedSomewhere = 0
    let skippedSomewhere = 0
    for (const char of CHARS) {
      const glyph = (await reader.glyph(char.codePointAt(0)!))!
      expect(glyph, char).toBeTruthy()
      // 밑계산은 한 번만 하고 편집마다 다시 쓴다 — 화면이 하는 그대로.
      const base = propagationCardBaseOf({ glyph, identity: glyph.identity, bundle })
      for (const [name, edit] of Object.entries(editsFor(glyph, bundle))) {
        const split = propagationCardViewOf(base, edit)
        expect(split, `${char} ${name}`).toEqual(legacyView(glyph, bundle, edit))
        touchedSomewhere += split.touched
        skippedSomewhere += split.skipped
      }
    }
    // 표본 편집이 실제로 닿기도 하고 막히기도 해야 비교에 뜻이 있다.
    expect(touchedSomewhere).toBeGreaterThan(0)
    expect(skippedSomewhere).toBeGreaterThan(0)
  })

  it('저장된 Δ가 있는 글자도 같다', async () => {
    const bundle = await reader.model()
    const glyph = (await reader.glyph('멈'.codePointAt(0)!))!
    const savedDelta: ContextBoxDelta = { faces: { CH: { left: 0.015 }, JO: { top: -0.01 } }, medial: {} }
    const base = propagationCardBaseOf({ glyph, identity: glyph.identity, bundle, savedDelta })
    for (const [name, edit] of Object.entries(editsFor(glyph, bundle))) expect(propagationCardViewOf(base, edit), name).toEqual(legacyView(glyph, bundle, edit, savedDelta))
  })

  it('편집을 되돌리면 Δ 없는 그림으로 돌아온다 — 밑계산이 편집에 물들지 않는다', async () => {
    const bundle = await reader.model()
    const glyph = (await reader.glyph('각'.codePointAt(0)!))!
    const base = propagationCardBaseOf({ glyph, identity: glyph.identity, bundle })
    const first = propagationCardViewOf(base, NO_EDIT)
    propagationCardViewOf(base, { layout: { medial: {}, component: { CH: { left: 0.03 } }, slot: {} } })
    expect(propagationCardViewOf(base, NO_EDIT)).toEqual(first)
    expect(first.before).toEqual([])
    expect(first.touched).toBe(0)
  })
})
