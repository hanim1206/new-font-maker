import { facesWithDelta, limitMedialFit, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta } from '../src/services/contextBoxResolver'
import type { FitInkStyle } from '../src/services/notoComponentFit'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { designBodySvgTransform, mapBoxToDesignBody } from '../src/services/designBodyPlacement'
import type { BoxConfig, Padding } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import type { ComponentFitPart } from './notoComponentFitView'
import { fitMedialForGlyph, renderMedialPart } from './notoMedialFitView'
import type { MedialFitPart } from './notoMedialFitView'
import type { NotoPresetGlyph, NotoPresetModelBundle } from './notoPresetGlyphs'
import { applyMedialDelta } from './reviewPropagation'
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
  /** 사용자 네모꼴 여백. 기본 네모꼴이면 없다. 잉크는 이 네모꼴 안에 그려지고, 고스트 · 상자는 그릴 때 옮긴다. */
  body?: Padding
  medial: { part: MedialFitPart; basePath?: string }[]
  components: { part: ComponentFitPart; basePath?: string }[]
}

export interface PropagationCardView {
  /** Noto 고스트(회색). 기준 틀 좌표라 `ghostTransform`으로 옮겨 그린다. */
  ghost: string | null
  /** 고스트를 사용자 네모꼴로 옮기는 SVG transform. 기본 네모꼴이면 없다. */
  ghostTransform?: string
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

export function propagationCardBaseOf(input: { glyph: NotoPresetGlyph; identity: CorpusIdentity; bundle: NotoPresetModelBundle; savedDelta?: ContextBoxDelta; inkStyle?: FitInkStyle; body?: Padding }): PropagationCardBase {
  const { glyph, identity, bundle, savedDelta, inkStyle, body } = input
  const ghost = notoOutlineGhostPath(glyph.outline)
  // 이 글자에 이미 저장된 Δ까지 얹은 상자가 출발점. 렌더러가 보는 상자와 같다.
  const context = resolveContextBoxes({ identity, model: bundle, delta: savedDelta })
  const medialView = fitMedialForGlyph({ context, outline: glyph.outline, approved: null, body })
  const componentParts = fitComponentsForGlyph({ context, outline: glyph.outline, approved: null, body })
  return {
    ghost: 'path' in ghost ? ghost.path : null,
    body,
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
    // 칸 해석과 같은 함수(`limitMedialFit`)로 놓는다: 상자 변 Δ를 먼저, 중심 rail Δ를 그 위에, 한계(글자 몸 · 순서 · 두께 간격)를 넘는 값은 경계까지 줄인다.
    // 그래서 카드의 after가 적용한 뒤 실제 글자와 같다.
    const slotDelta = edit.layout.slot[modelPart.part]
    const railDelta = modelPart.fit ? edit.layout.medial[modelPart.part] : undefined
    if (!modelPart.fit || (!slotDelta && !railDelta)) { if (basePath) after.push(basePath); continue }
    const requested = railDelta ? applyMedialDelta(modelPart.fit, railDelta) : null
    if (requested) skipped += requested.skipped
    const limited = limitMedialFit(modelPart.fit, slotDelta, railDelta)
    // 한 칸도 못 옮겼으면(상자가 두께보다 좁아짐 등) 이 글자는 Δ를 못 받는다 = 자동 예외.
    if (limited.fit === modelPart.fit) { if (slotDelta || (requested && requested.applied > 0)) skipped += Math.max(1, requested?.applied ?? 0); if (basePath) after.push(basePath); continue }
    const moved = renderMedialPart({ ...modelPart, fit: limited.fit }, undefined, inkStyle)
    // 앱 획이 칸에 안 맞는 건(잉크 없음) Δ 문제가 아니라 상자만 보인다.
    if (!moved.slot) { if (basePath) after.push(basePath); skipped += 1; continue }
    touched += 1
    if (moved.path) after.push(moved.path)
    if (basePath) before.push(basePath)
    boxes.push({ kind: 'medial', box: mapBoxToDesignBody(moved.slot, base.body) })
  }
  for (const { part, basePath } of base.components) {
    const delta = edit.layout.component[part.part]
    if (!delta || !part.faces) { if (basePath) after.push(basePath); continue }
    // 칸 해석과 같은 함수(`facesWithDelta`) — 글자 몸 안 · 변이 안 뒤집히는 경계에서 멈춘다.
    const moved = renderComponentPart(part, facesWithDelta(part.faces, delta), inkStyle)
    if (!moved.path) { if (basePath) after.push(basePath); skipped += 1; continue }
    touched += 1
    after.push(moved.path)
    if (basePath) before.push(basePath)
    if (moved.faces) boxes.push({ kind: 'component', box: mapBoxToDesignBody({ x: moved.faces.left, y: moved.faces.top, width: moved.faces.right - moved.faces.left, height: moved.faces.bottom - moved.faces.top }, base.body) })
  }
  return { ghost: base.ghost, ghostTransform: designBodySvgTransform(base.body, 1), after, before, boxes, skipped, touched }
}
