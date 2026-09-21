import { boxToFaces, facesOffsets, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta } from '../src/services/contextBoxResolver'
import type { FitInkStyle } from '../src/services/notoComponentFit'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import type { BoxConfig } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import type { ComponentFitPart } from './notoComponentFitView'
import { fitMedialForGlyph, renderMedialPart, withSlotFaces } from './notoMedialFitView'
import type { MedialFitPart } from './notoMedialFitView'
import type { NotoPresetGlyph, NotoPresetModelBundle } from './notoPresetGlyphs'
import { applyFacesDelta, applyMedialDelta } from './reviewPropagation'
import type { PropagationEdit } from './reviewPropagation'

/**
 * `닿는 글자` 카드 한 장의 그림 계산. 보선을 끄는 동안 움직임마다 카드 수만큼 도는 길이라 둘로 나눈다.
 * - `propagationCardBaseOf`: 글자·모델·저장된 Δ·끝 모양에만 달린 부분(고스트, 칸 해석, fit, Δ 없는 내 획). 글자당 한 번.
 * - `propagationCardViewOf`: 지금 편집 Δ를 얹는 부분. 끄는 동안에는 이것만 돈다.
 * 결과는 한 번에 계산하던 때와 글자 하나 안 다르다(`propagation-card-view.test.ts`가 지킨다).
 */

export interface PropagationCardBox { kind: 'medial' | 'component'; box: BoxConfig }

export interface PropagationCardBase {
  ghost: string | null
  medial: { part: MedialFitPart; basePath?: string }[]
  components: { part: ComponentFitPart; basePath?: string }[]
}

export interface PropagationCardView {
  /** Noto 고스트(회색). */
  ghost: string | null
  /** Δ를 얹은 내 획(검정). Δ가 안 닿은 부품은 Δ 없는 획 그대로. */
  after: string[]
  /** Δ가 닿은 부품의 Δ 전 획(주황 점선). */
  before: string[]
  boxes: PropagationCardBox[]
  /** 이 글자가 못 받은 Δ 수(순서·간격 위반 = 자동 예외). */
  skipped: number
  /** Δ가 닿은 부품 수. */
  touched: number
}

export function propagationCardBaseOf(input: { glyph: NotoPresetGlyph; identity: CorpusIdentity; bundle: NotoPresetModelBundle; savedDelta?: ContextBoxDelta; inkStyle?: FitInkStyle }): PropagationCardBase {
  const { glyph, identity, bundle, savedDelta, inkStyle } = input
  const ghost = notoOutlineGhostPath(glyph.outline)
  // 이 글자에 이미 저장된 Δ까지 얹은 상자가 출발점. 렌더러가 보는 상자와 같다.
  const context = resolveContextBoxes({ identity, model: bundle, delta: savedDelta })
  const medialView = fitMedialForGlyph({ context, outline: glyph.outline, approved: null })
  const componentParts = fitComponentsForGlyph({ context, outline: glyph.outline, approved: null })
  return {
    ghost: 'path' in ghost ? ghost.path : null,
    medial: medialView.parts.map((part) => ({ part, basePath: renderMedialPart(part, undefined, inkStyle).path })),
    components: componentParts.map((part) => ({ part, basePath: renderComponentPart(part, undefined, inkStyle).path })),
  }
}

export function propagationCardViewOf(base: PropagationCardBase, edit: PropagationEdit, inkStyle?: FitInkStyle): PropagationCardView {
  const after: string[] = []
  const before: string[] = []
  const boxes: PropagationCardBox[] = []
  let skipped = 0
  let touched = 0
  for (const { part: modelPart, basePath } of base.medial) {
    // 홀자 상자 변 Δ. 칸 해석과 같은 순서로 rail Δ보다 먼저 얹는다. 못 놓는 글자는 Δ를 안 받는다.
    // 고정은 이 글자의 slot 변 기준 오프셋으로 풀어 아핀에 넘긴다(칸 해석과 같은 규칙).
    const slotDelta = modelPart.fit ? facesOffsets(boxToFaces(modelPart.fit.slot), edit.layout.slot[modelPart.part]) : undefined
    const slotMoved = withSlotFaces(modelPart, slotDelta)
    const part = slotMoved.ok ? slotMoved.part : modelPart
    const slotTouched = slotMoved.ok && part !== modelPart
    if (slotDelta && !slotMoved.ok) skipped += 1
    // 중심 rail Δ는 em 그대로.
    const delta = part.fit ? edit.layout.medial[part.part] : undefined
    const applied = delta && part.fit ? applyMedialDelta(part.fit, delta) : null
    if (applied) skipped += applied.skipped
    if (!slotTouched && !(applied && applied.applied > 0)) { if (basePath) after.push(basePath); continue }
    const moved = renderMedialPart(part, applied && applied.applied > 0 ? applied.rails : undefined, inkStyle)
    // rail을 못 놓으면(slot 없음) 이 글자는 Δ를 못 받는다(클램프 = 자동 예외). 앱 획이 칸에 안 맞는 건(잉크 없음) Δ 문제가 아니라 상자만 보인다.
    if (!moved.slot) { if (basePath) after.push(basePath); skipped += applied?.applied ?? 0; continue }
    touched += 1
    if (moved.path) after.push(moved.path)
    if (basePath) before.push(basePath)
    boxes.push({ kind: 'medial', box: moved.slot })
  }
  for (const { part, basePath } of base.components) {
    const delta = edit.layout.component[part.part]
    if (!delta || !part.faces) { if (basePath) after.push(basePath); continue }
    const moved = renderComponentPart(part, applyFacesDelta(part.faces, delta), inkStyle)
    if (!moved.path) { if (basePath) after.push(basePath); skipped += 1; continue }
    touched += 1
    after.push(moved.path)
    if (basePath) before.push(basePath)
    if (moved.faces) boxes.push({ kind: 'component', box: { x: moved.faces.left, y: moved.faces.top, width: moved.faces.right - moved.faces.left, height: moved.faces.bottom - moved.faces.top } })
  }
  return { ghost: base.ghost, after, before, boxes, skipped, touched }
}
